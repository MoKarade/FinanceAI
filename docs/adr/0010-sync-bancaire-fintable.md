# ADR — Sync bancaire & investissements via Fintable (`FINTABLE`, 2026-07-29)

**Contexte** : Marc veut ses transactions ET ses positions en quasi temps réel, sans saisie. Aujourd'hui :
import manuel (relevés PDF/CSV → `applyDocument`), 18 mois d'historique constitués à la main. Fintable
(fintable.io) agrège les banques via Plaid / GoCardless / Akoya et les comptes de courtage/crypto via
SnapTrade, avec Google Sheets ou Airtable en destination. Marc a un abonnement et un jeton d'API.
Cadrage validé (14 questions, 2026-07-29) : garder l'import manuel mais MASQUÉ (Q1) ; tous les comptes
(Q3) ; Fintable gagne d'office sur les positions (Q10) ; liquidités auto-synchronisées (Q12) ; historique
manuel remplacé par Plaid à terme (Q8) ; les tools MCP existants restent INCHANGÉS.

**Décision** :

1. **Aucun nouveau moteur de fusion.** `applyDocument` couvre DÉJÀ les trois besoins par construction :
   `bank_statement` (transactions + dédup + allowlist de catégories), `broker_statement` (snapshot de
   positions), `cash_balance` (delta sur `initialBalances.LIQUIDITE`, source unique `computeStartingCash`).
   Fintable est donc un **PRODUCTEUR de `DocumentPayload`**, pas une 2ᵉ voie d'écriture. Ceintures héritées
   gratuitement : dédup, `MCP-CATEGORY-ALLOWLIST`, sauvegarde horodatée + OCC (`runApply`), scrub
   anti-injection (`scrubWriteResultForModel`).
2. **Frontière à deux étages** dans `services/fintable/` : (a) un LECTEUR qui rend un `FintableSnapshot`
   NORMALISÉ (comptes / transactions / positions) ; (b) un MAPPER **pur** `snapshot → DocumentPayload[]`.
   Le mapper est money-critical et unit-testable ; le lecteur est remplaçable (API directe ou Sheet) sans
   toucher au mapper.
3. **Source = API Fintable directe** (choix Marc), le Google Sheet produit par Fintable restant le REPLI
   documenté. ⚠️ La FORME de l'API n'est pas encore vérifiée — cf. « Ouvert ».
4. **Jeton en Secret Manager** (`financeai-fintable-token`), **scope lecture seule**, monté en variable
   d'env de la révision Cloud Run comme les 4 secrets existants (`mcp/deploy.sh`). Jamais dans le repo, le
   bundle navigateur, ni l'état Drive. Le jeton collé en clair dans un chat le 2026-07-29 a été RÉVOQUÉ et
   remplacé (incident traité, cf. `docs/A_FAIRE_MOI.md`).
5. **Exécution SERVEUR (Cloud Run), pas navigateur** : cron quotidien, sur le patron du `POST /refresh`
   existant (secret dédié). Le navigateur ne voit jamais le jeton et la sync tourne app fermée.
6. **Écriture via `runApply`** → OCC (`getWithVersion` / `save(next, version)`) + sauvegarde horodatée
   AVANT chaque écriture. C'est ce qui rend un écrivain SERVEUR compatible avec `SYNC-ANTI-CLOBBER` : une
   écriture concurrente d'un appareil fait ÉCHOUER l'OCC (visible, retentée) au lieu d'écraser en silence.
7. **La bascule de l'historique 18 mois est GATÉE PAR UNE MESURE**, jamais par hypothèse : Plaid rend de
   90 jours à 24 mois SELON l'institution. Le Lot 5 commence par un rapport de couverture réelle (par
   compte : date la plus ancienne, nombre de transactions) ; l'historique manuel n'est retiré que si la
   couverture le justifie — sinon il est CONSERVÉ et raccordé à la date de bascule.

**Pourquoi** : le risque n°1 d'une sync automatique n'est pas la lecture, c'est l'ÉCRITURE non surveillée
dans un état money-critical. En passant par `applyDocument` / `runApply`, la sync hérite de ceintures déjà
éprouvées au lieu d'en recréer des copies qui dériveront (classe `AITOOLS-SEC` : consolider, pas dupliquer).

**Trade-offs** : dépendance à un service tiers payant pour la fraîcheur — d'où la CONSERVATION (masquée) de
l'import manuel comme repli, pas sa suppression. Une sync serveur quotidienne peut heurter l'OCC d'un
appareil qui pousse au même instant : l'échec est tracé et rejoué, jamais silencieux.

**Alternatives rejetées** : (a) **lire le Google Sheet** produit par Fintable au lieu de son API — un étage
de plus qui peut dériver (colonnes renommées) pour zéro gain dès que l'API est disponible ; gardé en REPLI
documenté ; (b) **sync côté navigateur** — exposerait le jeton au bundle et ne tournerait qu'app ouverte ;
(c) **un chemin d'écriture dédié** court-circuitant `applyDocument` — perdrait dédup, allowlist, backup et OCC.

**Ouvert (BLOQUANT le Lot 1)** : la forme exacte de l'API Fintable (URL de base, en-tête d'authentification,
chemins comptes / transactions / positions, noms de champs). Non vérifiable depuis l'environnement
d'exécution : `docs.fintable.io` ne résout pas (NXDOMAIN) et `fintable.io` / `api.fintable.com` sont bloqués
par la politique réseau du conteneur (403 au tunnel CONNECT). À fournir par Marc — une réponse réelle
tronquée suffit. Coder un client contre une API DEVINÉE serait exactement le contre-modèle « vérifier avant
d'affirmer » : le lecteur reste non écrit tant que la forme n'est pas mesurée.

### Mise à jour 2026-07-29 — forme de l'API VÉRIFIÉE (le « Ouvert » du Lot 1 est fermé)

Marc a fourni la documentation officielle de l'**API Fintable V2**. Le point « Ouvert » ci-dessus est
résolu ; la décision 3 (source = API directe) est **confirmée** et se précise :

| | Valeur vérifiée |
|---|---|
| Base | `https://fintable.io/api/v2` |
| Auth | `Authorization: Bearer <jeton>` (jetons 1 an, scopes `read` / `write`) |
| Enveloppe | `{data: …}` ; listes de transactions : `next_cursor` (opaque, `null` = fin) |
| Erreurs | `{error: {type, message}}` — une seule forme pour toute l'API |
| Lecture | `GET /accounts`, `GET /accounts/{id}/holdings`, `GET /transactions` |
| Incrémental | `?order=updated&updated_since=<ISO>` |
| Quotas | 300 lectures/min par jeton ; `POST /sync` 2/jour (plan Personal) |

**Quatre contraintes de la doc qui deviennent des règles de code** (elles ne se devinaient pas) :

1. **« Money is a string »** — montants et soldes sont des chaînes décimales exactes, jamais des
   flottants ; négatif = argent sortant. Le décodage est donc strict : `Number('')` et `Number(null)`
   valent **0** en JS, donc un champ vide deviendrait un montant de 0 $ crédible. Un montant présent
   mais illisible est une erreur `MALFORMED` nommant le champ ; une absence vaut `null`, jamais 0.
2. **`pending=false` FORCÉ, non configurable.** La doc dit que les suppressions sont invisibles au
   polling et qu'une transaction `pending` est **remplacée** (nouvel id, montant/date ajustés)
   quand elle se poste. Or `applyDocument` déduplique mais ne supprime **jamais** → une pending
   importée puis repostée serait un doublon **à vie** qui fausserait le cash dérivé
   (`computeStartingCash`). La doc recommande explicitement `pending=false` pour tout miroir.
3. **`cost_basis` est le coût TOTAL de la position, pas unitaire** (quirk provider assumé par
   Fintable). Notre `Asset.buyPrice` est **par part** → le champ normalisé s'appelle
   `costBasisTotal` pour rendre la confusion impossible (classe `FISC-RRQ-UNIT` : bug d'échelle
   silencieux, ici ×quantité).
4. **`Account.type` est du texte libre « provider-flavored »** (`depository / checking`,
   `investment / brokerage`) et la doc dit « display it, don't switch on it » → on ne déduit
   **jamais** le type de compte fiscal (CELI / REER / NON-ENREG) de ce champ, et on interroge les
   positions de **tous** les comptes actifs plutôt que de deviner lesquels sont des comptes de
   placement (un compte mal étiqueté par le provider serait sinon ignoré en silence).

**Correction d'une affirmation antérieure** : j'avais écrit que Fintable synchronise « une fois par
jour », d'après un extrait indexé. La doc réelle dit **balayage randomisé toutes les 6 à 23 h**,
sans heure exacte garantie, plus `POST /sync` à la demande (2/jour en Personal). La conclusion en
dépendait : l'API n'était « pas plus fraîche que le Sheet » — c'est faux, elle permet en plus le
**polling incrémental** (`updated_since`) et le **déclenchement** de sync. L'API directe reste donc
le bon choix, et l'option Google Sheet redevient ce qu'elle était : un repli, pas une alternative
équivalente.

**Noté, hors périmètre** : Fintable expose aussi un serveur MCP (`https://fintable.io/mcp`, scope
`mcp:use`) que Marc peut brancher directement à claude.ai, ainsi que des endpoints publics sans
authentification (`/rates` taux BCE, `/prices` actions US). On ne s'en sert pas : FinanceAI a déjà
sa chaîne de cours (Finnhub/Yahoo) et son propre connecteur MCP — les mélanger créerait deux
sources pour la même grandeur, exactement ce que la règle « source unique » interdit.

### Mise à jour 2026-07-29 (n°2) — premières mesures RÉELLES : le Lot 5 est tranché, les positions sont un blocage

Premier dry-run réussi contre le compte Fintable de Marc (6 comptes, 121 transactions). Trois décisions
en découlent, toutes fondées sur la MESURE et non sur la doc :

1. **`[FINTABLE-BOOL-QUERY]` confirmé par mesure** (était [Probable]) : `pending=0` passe là où
   `pending=false` était rejeté en 422. Le diagnostic « validation `boolean` de Laravel » est donc
   [Certain]. Règle générale qui en découle : **un booléen de query string s'encode `1`/`0`**, jamais
   via `String(booléen)` — la sérialisation « naturelle » de JS n'est pas celle qu'attendent les
   validateurs côté serveur.
2. **Le Lot 5 est TRANCHÉ par la donnée : on GARDE les 18 mois d'historique manuel.** On a demandé
   90 jours, Fintable en rend **30** (2026-06-29 → 2026-07-28). La réponse initiale de Marc au cadrage
   (« supprimer l'historique, n'utiliser que Plaid », Q8) est donc **caduque** : l'appliquer serait une
   perte sèche de ~17 mois. C'est exactement la raison pour laquelle ce lot était gaté par une mesure
   plutôt que par une intention — l'intention était sincère et fausse. À réévaluer si la fenêtre
   s'élargit (les connexions sont peut-être récentes), mais **jamais de suppression sur une promesse**.
3. **Mapping des comptes, décidé par Marc** (le champ `type` est du texte libre, la doc interdit d'en
   déduire quoi que ce soit) : les deux comptes Disnat (`investment / brokerage`, l'un USD l'autre CAD)
   sont **non-enregistrés** ; la Mastercard Desjardins (`credit / credit card`) doit alimenter une
   **dette**, pas les liquidités — 90 des 121 transactions en viennent, et confondre son solde avec du
   cash gonflerait le patrimoine du montant dû.

**Blocage ouvert — zéro position sur 3 comptes de placement.** Les appels `/accounts/{id}/holdings`
ont **réussi** en rendant des listes VIDES (aucun skip tracé), sur des comptes qui contiennent
réellement des titres (confirmé par Marc). C'est la moitié de la demande initiale (« mes
investissements en temps réel ») qui ne fonctionne pas. Comme un agrégat vide SANS erreur est la
classe « staleness silencieuse », on ne devine pas : `[FINTABLE-1b]` ajoute un **docteur**
(`npm run fintable:doctor`) qui lit l'état du COMPTE plutôt que les données — droits du plan
(`can_sync` est `false` sur un compte gratuit), santé et historique de sync des connexions,
intégrations. Piste principale encodée dans son raisonnement : chez Fintable le **courtage passe par
SnapTrade**, donc un compte de placement lié via un provider bancaire (PLAID…) peut exposer son solde
sans jamais exposer ses positions.

**Conséquence de cadrage** : le volet « positions » du Lot 2 reste NON codé tant que la donnée
n'arrive pas — un mapper de positions qui ne peut être exercé sur aucune donnée réelle n'est pas
vérifiable, et la leçon `PORTFOLIO-HISTORY` (« un stub qui nourrit un graphe est une dette qui MENT »)
s'applique directement. Le volet transactions/liquidités/dette, lui, est pleinement exerçable (121
transactions réelles) et peut avancer.

### Mise à jour 2026-07-29 (n°3) — positions IMPOSSIBLES, et la date de bascule remplace la dédup

**1. Les positions détaillées sont hors de portée via Fintable [Certain, mesuré].** L'annuaire PUBLIC
(`GET /institutions?provider=SNAPTRADE&country=CA`, sans authentification) rend **exactement trois
courtiers** : Webull Canada, Questrade, Wealthsimple Trade. `q=disnat` → **0 résultat** ; l'entrée
« Desjardins Online Solutions » est `supported: false`. Le compte Disnat de Marc est donc lié par un
lien **bancaire** (PLAID), qui expose le `balance` du compte mais jamais ses `holdings`.

Ce n'est pas une configuration à corriger, c'est une **limite du produit**. Conséquences :
- volet positions du `[FINTABLE-2]` **abandonné** (pas « différé ») ;
- les positions continuent de passer par `apply_broker_statement` — dépôt d'un relevé Disnat dans le
  chat — qui fonctionne déjà et ne coûte rien ;
- les soldes des comptes de placement sont conservés comme **valeur de RÉFÉRENCE du courtier**, à
  comparer au patrimoine calculé. C'est précisément le garde-fou qui manquait lors de l'incident
  `ASSET-FX-DISPLAY` (patrimoine sous-affiché de ~70 k$ : « l'arbitre est le COURTIER »).

**2. Marc a choisi de prendre un plan payant**, contre ma recommandation (je conseillais d'arrêter :
le cœur de la demande étant impossible, le gain restant ne justifiait pas de casser sa règle « zéro
abonnement »). Arbitrage assumé, tracé pour la prochaine session — la valeur retenue est l'import
automatique des transactions + les soldes de référence.

**3. La date de bascule remplace la dédup comme protection anti-doublon** (piège trouvé en LISANT le
code plutôt qu'en le supposant). `applyDocument` déduplique sur `txnKey = date|montant_en_cents|payee`.
Or le `payee` de Fintable (`merchant`/`description`) ne sera **jamais** la même chaîne que celui
extrait des relevés PDF importés à la main : même dépense, clé différente, **doublon accepté en
silence** — qui fausserait `computeStartingCash` ET les dépenses réelles du Budget. Et la fenêtre
Fintable (30 jours mesurés) **recouvre** l'historique manuel : le risque est réel, pas théorique.
→ `mapSnapshot` n'émet que les transactions **strictement postérieures** à `transactionsAfter`
(= la dernière transaction déjà connue). Pas de recouvrement, donc aucune dépendance à la dédup ;
la dédup reste la ceinture, la date de bascule est la bretelle. Généralisable : **quand deux sources
alimentent le même journal, c'est la borne temporelle qui protège, pas la déduplication** — une clé de
dédup qui inclut un libellé ne survit pas à un changement de fournisseur du libellé.

**4. Autres garde-fous du mapper** (tous testés) : rôle de compte toujours EXPLICITE (un compte sans
rôle est signalé, jamais rangé par défaut — ranger une carte de crédit en liquidités gonflerait le
patrimoine du montant dû) ; liquidités en **tout-ou-rien** (`cash_balance` écrit un DELTA sur
`initialBalances` : une cible partielle déplacerait durablement le cash, en silence) ; solde de carte
négatif → `Math.abs` + alerte (une dette négative gonflerait le patrimoine) ; devise ≠ CAD écartée et
signalée, jamais empilée sans conversion ; dette mise à jour en **solde seulement** — ni taux ni
paiement minimum inventés, donc elle doit préexister (`MCP-APPLY-DEBT` : update partiel, strict à l'ajout).

### Mise à jour 2026-07-29 (n°4) — `[FINTABLE-3]` livré : cron serveur + déclencheur GitHub Actions (pas Cloud Scheduler)

Cadrage validé par Marc (4 questions) : écriture réelle DÈS LE DÉPART (pas de période dry-run-only) ;
1×/jour ; date de bascule AUTO-DÉRIVÉE (jamais une valeur figée à maintenir) ; échecs visibles dans
l'app SEULEMENT (pas de notification proactive au démarrage).

**Déclencheur choisi : GitHub Actions, pas Cloud Scheduler** (écart au plan initial du BACKLOG, décision
prise en exécutant, pas re-demandée à Marc). Raison : `.github/workflows/refresh-prices.yml` (HUB-REFRESH-CRON)
résout DÉJÀ exactement ce besoin — réveiller un Cloud Run endormi (scale-to-zero) sur un cron externe —
gratuitement, sans la limite « 1×/jour » de Vercel Hobby, sans nouveau service GCP à activer/apprendre.
`.github/workflows/fintable-sync.yml` clone ce patron à l'identique (10:00 UTC, secret DÉDIÉ
`FINANCEAI_FINTABLE_SYNC_SECRET`, `POST /fintable-sync`). Cloud Scheduler aurait ajouté une dépendance
GCP payante (au-delà du free tier) et un mécanisme SUPPLÉMENTAIRE pour un besoin déjà couvert —
contraire à « stack ennuyeuse » et « tout gratuit » (CLAUDE.md global de Marc).

**Deux secrets DISTINCTS, jamais partagés** : `FINANCEAI_REFRESH_SECRET` (prix de marché seulement) et
`FINANCEAI_FINTABLE_SYNC_SECRET` (transactions/soldes/dettes réels). Périmètre différent → rotation
indépendante ; compromettre l'un ne donne pas accès à l'écriture de l'autre.

**Rapport TOUJOURS écrit, jamais de notification proactive** (choix Marc, 4ᵉ réponse) : `AppState.
fintableSyncReport` (additif optionnel, zéro bump de version) est réécrit à CHAQUE passe — succès ou
échec — et affiché dans Système & diagnostics. Un conflit OCC (l'app a poussé entre-temps) N'ÉCRIT PAS
de rapport d'échec (transitoire, pas une panne) ; une panne RÉELLE (Fintable KO/jeton révoqué, Drive KO)
écrit le rapport d'échec ET fait rougir le job GitHub (5xx) — Marc voit l'échec au prochain "check" de la
Routine GitHub, sans avoir eu besoin d'ouvrir l'app.

**Consolidation évitée** : le parseur du JSON de rôles (`--roles` du CLI ET `FINTABLE_ROLES_JSON` du
serveur) vivait dupliqué dans `fintableDry.ts` avant ce lot — extrait en `services/fintable/
rolesConfig.ts` (classe `[[Lot audit n°2]]` « appliquer le même delta à deux copies = signal de
consolider »), consommé par les deux surfaces.

### Mise à jour 2026-07-29 (n°5) — panel de 7 agents sur la PR `[FINTABLE-3]` : 6 findings vrais corrigés

Revue adversariale (code-reviewer, silent-failure-hunter, financial-integrity, security-privacy,
projection-validator, documentation-manager, a11y-auditor) sur le diff COMMITÉ (`origin/main...HEAD`).
Détail complet des leçons dans `CLAUDE.md` (bloc `[FUTUR-PAST-DEBT-FREEZE]`, sous-point panel) ; résumé
décisionnel ici :

1. **Isolation par payload** — `applyDocument` rejette légitimement un payload aberrant (solde de dette
   ≤0, dette introuvable), mais sans `try/catch` PAR itération, ce rejet avortait TOUTE la passe avant
   `store.save` : une carte remboursée à 0 $ un mois bloquait la sync ENTIÈRE (transactions ET cash
   compris), chaque jour, tant que la condition persistait. Décision : un payload rejeté devient un
   avertissement LOCAL dans le rapport ; les payloads valides restent appliqués et sauvegardés.
2. **Bascule plafonnée à aujourd'hui** — une transaction mal datée dans le futur pousserait la bascule
   en avant, filtrant TOUTES les vraies transactions Fintable comme « avant la bascule » indéfiniment,
   sans signal. Plafond `min(dérivé, aujourd'hui)` + avertissement tracé.
3. **Garantie « rapport toujours écrit » élargie** — la lecture d'état initiale vivait hors du bloc
   protégé : une panne PRÉCISÉMENT là (Drive KO, jeton révoqué) ne déclenchait aucune écriture de
   rapport, contredisant la garantie documentée au point précédent. Le `try` couvre désormais cette lecture.
4. **Montant $ retiré d'un message d'avertissement** — un solde de dette négatif chez Fintable produisait
   un avertissement avec le montant en clair, rendu SANS gate mode discret dans la carte UI ET dumpé dans
   les logs GitHub Actions (rétention ~90j, hors du droit à l'effacement de l'app). Le vrai montant reste
   disponible, gardé par le mode discret, via le champ normal de la dette — pas besoin de le répéter en clair.
5. **`fintableSyncReport` purgé au switch de persona démo** — champ `AppState` optionnel ADDITIF absent de
   `DEFAULT_APP_STATE`, donc jamais réinitialisé par `personaResetBase()` : le vrai rapport (comptes/dettes/
   dates réels) survivait à une démo persona. Ajouté explicitement à `DEFAULT_APP_STATE` (même `undefined`).
6. **Carte UI durcie contre une forme corrompue** — `debtsUpdated`/`warnings` ne sont validés par AUCUN
   schéma Zod (champ hors `.passthrough()`). Un état Drive ancien/corrompu ferait planter le render. Ajout
   d'une normalisation défensive (`Array.isArray`) + trace (`logError`) si l'anomalie survient.

Un 2ᵉ écart a aussi été mesuré INDÉPENDAMMENT par 2 agents sur le fix `[FUTUR-PAST-DEBT-FREEZE]` (composant
`FutureProjection.tsx`, hors chantier Fintable mais même PR) : voir le détail dans `CLAUDE.md` et
`BACKLOG.md` (sous-item du même nom) — le repli sur `liveResults` retombait à 0 dans la fenêtre boot/
reload où le moteur n'a pas encore republié ; corrigé par un repli sur la courbe RÉELLEMENT affichée.

---
