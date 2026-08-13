# À FAIRE — Marc (tâches humaines) + blocages remontés par Claude

> Ce que **Claude ne peut pas faire seul** (comptes Google/Drive/Cloudflare/Vercel,
> ressenti visuel sur device, secrets) + les **blocages** que Claude découvre en
> chemin. Claude **ajoute** ici ; Marc coche. Détail des tests manuels par onglet :
> `docs/MANUAL_TEST_CHECKLIST.md`. Tâches que Claude peut faire : `docs/BACKLOG.md`.

---

# 🔓 INDEX — tout ce qui me débloque (balayage exhaustif du 2026-08-06)

> Demandé par Marc : « prépare-moi la liste de ce que je dois faire pour te débloquer le backlog au
> complet ». Balayage complet de `BACKLOG.md` + de ce fichier. Chaque entrée dit **ce que ça coûte**
> et **ce que ça débloque**. Le détail de chacune est plus bas dans ce fichier ou dans le BACKLOG.
>
> ⚠️ **Lis d'abord ceci** : rien ici n'est bloqué sur du travail que je pourrais faire à ta place.
> Il reste ~40 items **non gatés** au BACKLOG (a11y, dette technique, tests, perf) que je continue
> d'avancer sans toi. Cette liste est ce qui débloque **le reste**.

## A0. Smoke test 2 minutes — pincement sur TON téléphone (ajouté 2026-08-12, PR #596)

- [ ] **Tester le zoom au pincement sur ton vrai téléphone** dès le déploiement : ouvre la courbe
  Futur, pince à 2 doigts (écarte = zoom, resserre = dézoom, translate = déplace), vérifie que
  1 doigt fait toujours défiler la page et qu'un tap sélectionne un jour. **Pourquoi toi** : mes
  e2e tactiles ne couvrent que Chromium — si ton téléphone est un iPhone (Safari/WebKit), le
  moteur est différent et seul un vrai appareil le prouve (finding MOYEN code-reviewer #596).
  Si le pincement zoome la PAGE au lieu du graphe, dis-le : le correctif est connu
  (`gesturestart` WebKit à bloquer en plus).

## A. Réponses par oui/non — 2 minutes chacune, aucun compte à ouvrir

Ce sont les moins chères et les plus débloquantes. Une phrase suffit pour chacune.

| # | Question | Ce que ça débloque | Impact mesuré |
|---|---|---|---|
| A1 | Les droits REER doivent-ils être calculés **par personne** (règle ARC) plutôt que sur le revenu du ménage ? C'est un changement de modèle, je le ferais avec plan + mesure avant/après. | `[FISC-RRSP-ROOM-PER-USER]` | **45 000 $ vs 34 480 $** de droits/an sur un ménage mono-gagnant à 250 k$ |
| A2 | Ton « ok » du 2026-07-06 sur `[FISC-TAXDEC-INCR]` voulait dire **« code-le »** ou **« laisse pour plus tard »** ? Je n'ai jamais osé trancher (risque $ élevé, re-base de goldens). | `[FISC-TAXDEC-INCR]` | 3 sous-fixes de `taxDecember` |
| A3 | Le crédit pension fédéral de 2 000 $ est gelé nominalement mais traité en espace RÉEL. Le corriger **re-base les goldens retraités**. GO ? | `[FISC-PENSION-CREDIT-REAL]` | ≤ **250 $/pers/an**, ~12 k$ sur 30 ans, sens NON conservateur |
| A4 | « Impôt minimum » dans le classement de stratégies doit-il inclure l'**impôt successoral**, ou rester « impôt payé de ton vivant » ? | `[ENG-RANKTAX-ESTATE]` | PRIO_CELI sort 1er avec **1,3 M$** d'impôt latent ignoré |
| A5 | Un bien immobilier créé dans l'onglet naît `isActive: false` → il ne compte NI au patrimoine NI au moteur tant que tu ne cliques pas « Activer ». **L'activer par défaut ?** | `[UX-ISACTIVE-SEMANTIQUE]` | Ta maison saisie sans le clic = patrimoine amputé de son équité |
| A6 | Faut-il un champ explicite **« bien déjà DÉTENU » vs « objectif planifié »** sur les objectifs immobiliers ? | `[ENG-PAST-OWNED-VS-PLANNED]` | Un objectif 2024 jamais mis à jour injecte **+156 628 $** d'équité et **+307 081 $** de dette fantômes |
| A7 | En scénario de STRESS (i ≠ 2 %), faut-il indexer les paliers d'impôt à `simInflation` (fidèle au CPI, contredit l'ADR 009) ou garder le statu quo documenté (conservateur) ? | `[FISC-BRACKET-CPI-STRESS]` | Impôt total **+106 %** à i = 8 %. **0 effet** à i = 2 % (ton défaut) |
| A8 | La liste des abonnements vit dans **Budget**. Tu as dit « sous-onglet de Transactions ». Le manque réel (pouvoir refuser un faux positif) est **livré** (#570) — déménager n'apporte plus rien. **Je déménage quand même, ou on laisse ?** | `[SUBS-TAB]` volet emplacement | Aucun — pur confort de navigation |
| A9 | Tu es en **mode solo**. `[FISC-SOLO-INVEST-SPLIT]` ne mord que si tu passes en mode couple avec un seul salaire. **Prévois-tu d'y passer ?** | `[FISC-SOLO-INVEST-SPLIT]` | **0 $ aujourd'hui**, 2 342 $/an en couple mono-salarié |
| A10 | As-tu une assurance médicaments **PRIVÉE** ou es-tu à la **RAMQ** ? Je ne peux pas le deviner et ça change la prime. | `[ENG-RAMQ-FIELDS]` | Prime RAMQ vs 0 |
| A11 | Le pull Drive qui purge des artefacts persona ne fait qu'un log. **Veux-tu un toast visible ?** | `[PURGE-TOAST-UX]` | Confort |
| A12 | Sur la courbe du Futur, **qu'est-ce que tu veux voir annoté** ? (âge de retraite ? épuisement d'un compte ? bascule de stratégie ? début RRQ/PSV ?) — question de ton brief de 2026-06-10, jamais répondue. | `[PH4-FUT]` | Feature entière en attente |
| ~~A13~~ | ✅ **RÉPONDU 2026-08-06** : « chaque semaine jeudi, pareil pour dette ». Paie et paiements de dette sont donc **hebdomadaires, le jeudi**. | `[FUTUR-DAILY]` | **Livré** : `weeklyDeltasForMonth` convertit les montants MENSUELS du store en versements hebdomadaires (×12/52) et les pose à chaque jeudi. Un mois à 5 jeudis reçoit bien 5 paies. ⚠️ Reste une limite assumée : le MOTEUR raisonne au mois et ignore les mois à 5 paies — le rythme affiché est juste, le total du mois reste celui du moteur. |

**`[PROFIL-SWITCH]`** (4 questions d'un coup, posées le 2026-08-01, sans réponse) — ⚠️ touche la
persistance de tes VRAIES données, je ne code rien avant :
1. Combien de profils **RÉELS** ? (juste « Marc » + des personas de test, ou plusieurs réels ?)
2. Lequel pousse vers Drive — un seul, ou chacun son fichier ?
3. Que devient le profil actuel au premier lancement (la clé existante devient « Marc » ?)
4. Le switch doit-il exiger une confirmation (anti-fausse-manip) ?

## B. Sources fiscales officielles — le proxy sortant me les BLOQUE

Je ne peux joindre ni `canada.ca` ni Service Canada (403). Un faux correctif dans un moteur d'impôt
est pire que le bug : je ne touche à rien sans la source. **Une capture d'écran suffit.**

| # | Ce qu'il me faut | Ticket | Impact mesuré |
|---|---|---|---|
| B1 | **Règlement 7308(4) LIR**, facteur FERR à **94 ans**. Le code dit 20,00 %, le prescrit serait 18,79 % (le plateau ne commençant qu'à 95). | `[FISC-RRIF-94-FACTOR]` | **+13 726 $** de patrimoine final |
| B2 | **Table SRG couple** (Service Canada) : taux de récupération sur le revenu COMBINÉ. Le code applique 0,50 **par adulte** → récupération 2× trop rapide. | `[FISC-GIS-COUPLE-RATE]` | **0 $ vs 7 944 $/an** à 15 888 $ de revenu combiné |
| B3 | **Annexe B** de la déclaration QC : la réduction de 18,75 % de la ligne 361 s'applique-t-elle par conjoint sur le revenu FAMILIAL total ? | `[FISC-LINE361-PERCONJOINT-REDUC]` | ≤ 986 $/an, couple 65+ seulement (**0 $ pour toi aujourd'hui**) |
| B4 | **Taux ARC des crédits non remboursables** : le code dit 15 %, le 1er palier fédéral est à 14 %. Seule affirmation du doc SANS source. | `[FISC-FED-CREDITRATE-15]` | ~**165 $/pers/an** si faux |
| B5 | **LIR 146(1), définition de « revenu gagné »** : le revenu NET de location en fait-il partie ? Le moteur ne le compte pas. | `[FISC-RRSP-RENTAL-EARNED]` | ~**4 320 $/an** de droits REER non créés sur 24 k$ de loyer net |

## C. Configuration de comptes — je n'ai pas les accès

| # | Action | Où | Ce que ça débloque |
|---|---|---|---|
| C1 | 🔴 **Révoquer les 2 jetons Fintable collés en clair dans le chat** (les deux en `read+write`) | Fintable → Dashboard → API | **Sécurité.** À faire même si tout le reste attend |
| C2 | 3 secrets Secret Manager + redéployer Cloud Run + 2 secrets GitHub Actions | GCP + GitHub | `FINTABLE-3` — la sync quotidienne AUTOMATIQUE (aujourd'hui, seule l'ouverture de l'app synchronise) |
| C3 | Redéployer le serveur MCP sur Cloud Run | `mcp/deploy.sh` | `MCP-CATEGORY-ALLOWLIST` (#502) — sans ça, claude.ai peut encore écrire des catégories inventées |
| C4 | Poser `PROXY_ACCESS_TOKEN` + `VITE_PROXY_ACCESS_TOKEN` sur Vercel, redéployer, smoke test | Vercel | `P0-PROXY` — le relais BYOK, livré mais jamais allumé |
| C5 | Créer la dette **« Desjardins Cash Back Mastercard »** (vrai taux + paiement minimum) et vérifier qu'elle n'existe pas déjà en double | App → Réglages → Dettes | Sync du solde de carte. ⚠️ Un doublon compte la dette 2× dans ton patrimoine |
| C6 | Me donner ta **date de bascule** (dernière transaction saisie à la main) + construire `.fintable-roles.json` avec le VRAI régime fiscal de chaque compte | Local | Mapping Fintable sans doublons. ⚠️ Un mauvais `taxRegime` fausse l'impôt de toute la projection |
| C7 | Confirmer la **profondeur d'historique réellement offerte** par ton plan Fintable payant (90 j demandés, **30 rendus** au dernier test) | Fintable | `[FINTABLE-BACKFILL-HISTORY]` — ⚠️ en l'état il n'importera **aucune** transaction de plus |

## D. Vérifications sur ton écran — je ne vois pas l'app tourner

| # | Vérification | Ce que ça débloque |
|---|---|---|
| D1 | Ouvre la console : le log `services/portfolio.ts:60-62` apparaît-il ? | `[ASSET-CURRENCY-BACKFILL]` — je ne code **rien** avant ce signal |
| D2 | Le repli Yahoo en PROD : la courbe « Évolution détaillée » se remplit-elle ? Sinon teste `/api/history/yahoo/XEQT.TO?period1=…&period2=…` — si ça rend du HTML au lieu du JSON, dis-le-moi | Courbes d'historique du portefeuille |
| D3 | Avec ta clé Finnhub : sélectionner une suggestion d'action fait-il encore quitter la page ? Si oui, **quel geste exact** ? | `[RECH-ACTION-UX]` — je n'ai pas pu reproduire sans clé |
| D4 | Si Drive redemande une reconnexion → Réglages → Diagnostics → la raison GIS exacte | `AUTH-DRIVE-STILL-RECONNECT` |
| D5 | Fenêtre privée neuve → login Google → toutes les données ET les clés API reviennent ? | `O3` — preuve de la sync Drive en réel |

## E. Gros chantiers — le GO est donné, c'est MOI qui dois préparer le cadrage

⚠️ **Ne rien faire ici.** Je le note pour que tu ne cherches pas ce qui bloque : ces trois-là
attendent que je te prépare un GROS batch de questions, pas une action de ta part.

- `[PH4-BUD]` — refonte Budget (ton « faut tout refaire »)
- `[NAV-IA-CONSOLIDATE]` — 14 destinations de navigation → ~6
- `[FISC-REEE-GRANT-CLAWBACK]` — reprise du RÉEE, **tenté et reverté** le 2026-08-05 (le correctif
  mesurait PIRE que le bug). Le périmètre est maintenant connu et chiffré en 7 facettes ; il me
  faut juste ton go pour repartir, et **une donnée** : sur un RÉEE existant, sais-tu dire **combien
  est de la cotisation et combien est de la subvention** ? Sans ça je dois supposer.

## F. Ce qui reste et que je fais SANS toi

Pour que tu voies l'équilibre : `[CHAT-PAGE-CONTEXT-V2]`, les 11 constantes fiscales restantes à
ancrer, `[FISC-RRIF-FRACTIONAL-AGE]` ✅, `[FISC-REF-DEDUP]` ✅, tout le lot a11y (`[A11Y-INK500]`
et 4 autres), la dette technique (god-files, primitives UI, tokens couleur), les trous de tests,
`[FUZZ-ONETIME-FLOWS]`, `[HARDEN-SNAPSHOT-RACE]`, `[DEP-ESLINT10]`. **Je continue sur ceux-là.**

---

## 🔴 DÉTAIL de B1 et A1 — les deux écarts que je ne peux pas trancher seul (2026-08-06)

L'audit de `[FISC-CONST-ANCHOR-DEBT]` a trouvé deux écarts à impact $ MESURÉ. Je ne les corrige
pas : le proxy sortant **bloque `canada.ca`** (403), donc je ne peux pas produire la source
officielle — et un faux fix dans un moteur d'impôt est pire que le bug laissé en place.

### 1. Facteur de retrait minimum FERR à 94 ans — **13 726 $** d'écart mesuré
`services/projection/helpers.ts:95` code `94: 0.2000`. Le facteur prescrit serait **18,79 %**, le
plateau de 20 % ne commençant qu'à **95 ans**. Faisceau d'indices INTERNE : la progression du
tableau est régulière (+0,0185 de 92 à 93) puis fait un saut anormal (+0,0366 de 93 à 94) avant de
plafonner ; et la ligne suivante du même tableau écrit « 95 ans et + : plafond 20 % » — si 94 valait
déjà 20 %, le plateau commencerait à 94.
👉 **Ce qu'il me faut** : la valeur du règlement **7308(4)** de la Loi de l'impôt sur le revenu pour
l'âge 94 (ou une capture de la table ARC des facteurs FERR prescrits post-2015).
Impact si confirmé : retrait forcé de 1,21 % de trop sur le solde FERR à 94 ans, sorti de l'abri
fiscal et imposé au marginal — **+13 726 $** de patrimoine final sur une fixture REER 6 M$.

### 2. Droits REER mis en commun au niveau du MÉNAGE — **+10 520 $/an** de droits fantômes
`services/projection/taxJanuary.ts:165` calcule `min(plafond × nb_conjoints, revenu_MÉNAGE × 18 %)`.
La règle ARC est **par personne** : un conjoint sans revenu gagné n'ouvre AUCUN droit.
**Mesuré** (ménage 250 k$ brut avec un seul gagnant, 2027) : le moteur donne **45 000 $** de droits,
la règle en donne **34 480 $**.
👉 **Ce n'est pas un bug à corriger au fil de l'eau** : c'est un changement de modèle (droits par
tête, sur le revenu gagné par tête) qui touche la déduction REER, donc l'impôt, donc la projection
entière. **Dis-moi si tu veux que je le fasse** — avec un plan et une mesure avant/après.
En attendant, la doc doit dire « approximation MÉNAGE » plutôt que de laisser croire à la règle ARC.

## ✅ FINTABLE — import GELÉ depuis le 2026-07-31 : RÉSOLU ET VÉRIFIÉ (2026-08-05)

Constat mesuré côté serveur : **dernière transaction importée = 2026-07-31**, la veille de la fin
de ton essai Fintable (2026-08-01) ; la sync Drive de l'app fonctionne, elle. Le cron serveur n'a
jamais été monté (secrets GCP à poser par toi) → le SEUL canal actif est la sync à l'ouverture de
l'app. Je ne peux pas voir le `fintableSyncReport` d'ici (aucun tool MCP ne l'expose — ticket
`[FINTABLE-STALE-ALERT]` créé) ni joindre `fintable.io` (403 tunnel).

**RÉSOLU 2026-08-05 — cause racine trouvée par MARC, corrigée par PR `[FINTABLE-TOKEN-PERSIST]`** :
le jeton Fintable n'était PAS persisté (écrit dans le store mémoire seulement, jamais dans le
coffre chiffré) → perdu au premier rechargement → sync « jeton absent » en boucle. La corrélation
avec la fin d'essai (2026-08-01) était un LEURRE de timing. Depuis le fix, le jeton est sauvegardé
comme les autres clés (coffre chiffré, au blur + avant Tester/Synchroniser, échec affiché).

- [x] ✅ **Jeton re-collé — CONFIRMÉ PAR MARC 2026-08-05 15:03 UTC (« jeton marche »).** Vérifié
  côté serveur dans la foulée : les 5 jours manquants sont RATTRAPÉS (11 transactions du 2026-07-31
  au 2026-08-05 : loyer 1 600 $, Virgin Plus, épicerie, crédit de solidarité). Le fix
  `[FINTABLE-TOKEN-PERSIST]` (#559) est donc validé EN CONDITIONS RÉELLES, pas seulement en test.
- [x] ✅ **Plan fintable.io — implicitement validé** : l'import a repris et rapporte des
  transactions, ce qui exige `can_sync: true`. L'hypothèse « fin d'essai » était bien un leurre de
  timing (la vraie cause était le jeton non persisté). Rien à faire côté abonnement.

## FINTABLE — pourquoi aucune position ? (remonté par Claude 2026-07-29)
- [x] **Forme de l'API fournie, jeton en place, dry-run RÉUSSI** — 6 comptes, 121 transactions lues.
  Le fix `pending=1/0` (PR #524) est confirmé **par mesure**. (Je ne peux toujours PAS appeler
  `fintable.io` depuis l'exécution cloud : 403 au tunnel CONNECT sur tous les chemins.)
- [x] **Décidé par la mesure : on GARDE tes 18 mois d'historique manuel** — 90 jours demandés,
  **30 rendus** (2026-06-29 → 2026-07-28). Ta réponse de cadrage « supprimer l'historique, n'utiliser
  que Plaid » est caduque : l'appliquer coûtait ~17 mois de données.
- [x] **Docteur lancé — CAUSE IDENTIFIÉE (2026-07-29)** : tes 6 comptes arrivent par **UNE SEULE
  connexion, Desjardins via PLAID** (santé OK, dernière sync réussie le jour même). **Aucune connexion
  SNAPTRADE** — or chez Fintable le courtage passe par SnapTrade. Un compte de placement lié via un
  lien bancaire expose son solde sans jamais exposer ses positions. Le plan n'est PAS en cause
  (`can_sync: OUI`), les connexions sont saines : c'est bien un problème de **type de lien**.
- [x] **Positions : IMPOSSIBLE via Fintable — clos par la mesure (2026-07-29)** — l'annuaire public
  donne **3 courtiers SnapTrade au Canada** (Webull, Questrade, Wealthsimple Trade) ; `q=disnat` → 0
  résultat, « Desjardins Online Solutions » est `supported: false`. Limite du produit, pas une config.
  Tes positions continuent de passer par `apply_broker_statement` (dépose un relevé Disnat dans le
  chat) — ça marche déjà et ça ne coûte rien. À rouvrir seulement si tu changes de courtier.
- [x] **Plan payant : tu as tranché (2026-07-29)** — tu prends un plan pour garder l'import automatique
  des transactions + les soldes de référence. (Ma reco était l'inverse ; arbitrage assumé, tracé.)
- [ ] **Créer la dette « Desjardins Cash Back Mastercard » dans FinanceAI, une seule fois** — la sync
  ne mettra à jour que le **solde** : Fintable ne fournit ni taux d'intérêt ni paiement minimum, et je
  refuse de les inventer. Va dans Réglages → Dettes et crée-la avec son vrai taux et son paiement
  minimum. ⚠️ Si tu en as **déjà** une pour cette carte, ne la duplique pas — dis-moi son nom exact et
  je le mettrai dans la config, sinon elle sera comptée deux fois dans ton patrimoine.
- [ ] **Me donner la date de bascule** — le jour de ta dernière transaction déjà importée à la main.
  C'est ce qui empêche les doublons : la dédup de l'app compare `date|montant|libellé`, or le libellé
  de Fintable (« Blue Bottle Coffee ») ne sera pas celui de tes relevés PDF → même dépense, clé
  différente, doublon silencieux qui fausserait ton solde ET tes dépenses réelles. En ne prenant que
  ce qui est strictement après cette date, il n'y a aucun recouvrement possible.
- [ ] **Construire le fichier de rôles de comptes** (une fois) — pour l'aperçu de mapping :
  ```bash
  # 1. Récupère les ids de tes comptes (sortie locale, ne la recolle pas telle quelle)
  FINTABLE_TOKEN="$(gcloud secrets versions access latest --secret=financeai-fintable-token --project=financeai-497112)" \
    npm run fintable:dry -- --show-ids
  # 2. Crée .fintable-roles.json à la racine (gitignoré) :
  #   { "<id PCA>":  {"kind":"cash"},
  #     "<id TS1>":  {"kind":"cash"},
  #     "<id MC>":   {"kind":"debt","debtName":"Desjardins Cash Back Mastercard"},
  #     "<id Disnat L7B1>": {"kind":"investment","taxRegime":"NON-ENREG"},
  #     "<id Disnat L7A3>": {"kind":"investment","taxRegime":"CELI"},
  #     "<id SHR>":  {"kind":"investment","taxRegime":"REER"} }
  #
  # ⚠️ [FINTABLE-6] `taxRegime` (CELI | REER | NON-ENREG) : mets le VRAI régime de chaque compte —
  # je ne le devine jamais. Il décide dans quel panier fiscal l'écart entre le solde du courtier et
  # tes titres saisis est ventilé ; s'y tromper fausse l'impôt de toute la projection. Omettre le
  # champ n'est pas bloquant : le montant du courtier s'affiche quand même, mais l'écart reste hors
  # projection et l'aperçu te le signale (« ⚠ régime NON déclaré »).
  # 3. Aperçu — TOUJOURS sans écriture :
  FINTABLE_TOKEN="…" npm run fintable:dry -- --days 90 --roles .fintable-roles.json --after <ta-date-de-bascule>
  ```
  Colle-moi l'aperçu (montants masqués par défaut) : je vérifie que le compte de transactions retenues,
  les liquidités visées et la dette correspondent à ce que tu attends **avant** qu'on écrive quoi que ce soit.
- [ ] **Vérifier le doublon de dette carte de crédit** (avant le Lot 2) — tu as choisi que la Mastercard
  Desjardins alimente une dette dans FinanceAI. Regarde dans Réglages → Dettes si tu en as déjà une
  saisie à la main pour cette carte : si oui, il faudra la retirer au moment de brancher la sync, sinon
  elle sera comptée deux fois dans ton patrimoine.
- [ ] **Rappel sécurité — 2 jetons Fintable ont été collés en clair dans le chat** (les deux avec scope
  `read+write`). Si tu ne l'as pas déjà fait, révoque-les dans Dashboard → API et garde uniquement le
  jeton lecture-seule qui est en Secret Manager.

## FINTABLE-3 — activer le cron de sync quotidien (remonté par Claude 2026-07-29)
> Le code (orchestrateur serveur + endpoint + workflow GitHub) est livré et testé (16 tests) — ce qui
> reste est de la CONFIGURATION que je ne peux pas faire à ta place (Secret Manager + secrets GitHub).
> Tant que ces 5 secrets n'existent pas, `/fintable-sync` reste DÉSACTIVÉ (404, aucun risque) — rien
> ne se déclenche tout seul avant que tu aies fait ces étapes. Détail complet : `mcp/README.md`
> § « Sync Fintable planifiée — POST /fintable-sync ».
- [ ] **3 secrets Google Secret Manager** (le jeton `financeai-fintable-token` existe déjà, lecture seule) :
  ```bash
  # Secret d'auth de la route (≥16 caractères, garde-le pour l'étape GitHub)
  node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))" \
    | tr -d '\n' | gcloud secrets create financeai-fintable-sync-secret --data-file=- --project=financeai-497112

  # Le fichier de rôles que tu as déjà construit (.fintable-roles.json, à la racine du repo, gitignoré)
  gcloud secrets create financeai-fintable-roles-json --data-file=.fintable-roles.json --project=financeai-497112

  # Accès en lecture au service Cloud Run (même $RUNTIME_SA que pour les autres secrets déjà en place)
  for S in financeai-fintable-sync-secret financeai-fintable-token financeai-fintable-roles-json; do
    gcloud secrets add-iam-policy-binding "$S" \
      --member="serviceAccount:$RUNTIME_SA" \
      --role="roles/secretmanager.secretAccessor" --project=financeai-497112
  done
  ```
- [ ] **Redéployer le serveur MCP** : `PROJECT_ID=financeai-497112 ./mcp/deploy.sh` — `deploy.sh` détecte
  les 3 secrets et active `POST /fintable-sync` automatiquement (log au démarrage confirme).
- [ ] **2 secrets GitHub Actions** (repo → Settings → Secrets and variables → Actions) :
  ```
  FINANCEAI_MCP_URL              = <la même URL que celle déjà utilisée pour refresh-prices.yml>
  FINANCEAI_FINTABLE_SYNC_SECRET = <le secret généré à l'étape 1 ci-dessus>
  ```
  Une fois posés, `.github/workflows/fintable-sync.yml` tourne automatiquement 1×/jour (10:00 UTC) —
  aucune autre action de ta part. Tu peux le déclencher manuellement dans l'onglet Actions du repo
  pour vérifier tout de suite sans attendre le lendemain.
- [ ] **Vérifier le résultat de la 1ʳᵉ passe** dans l'app → Système & diagnostics → carte « Sync Fintable ».

## MCP-CATEGORY-ALLOWLIST — redéploiement Cloud Run requis (remonté par Claude 2026-07-24, PR #502)
- [ ] **Redéployer le serveur MCP sur Cloud Run** pour que l'allowlist de catégories (PR #502) prenne
  effet côté claude.ai (leçon AITOOLS-SEC : une révision Cloud Run est séparée du deploy Vercel — l'app
  web, elle, est déjà protégée par le même module partagé). Commande habituelle dans `mcp/README.md`
  § Cloud Run (`gcloud run deploy --source .`). Sans ça, claude.ai peut encore écrire des catégories
  inventées (la validation n'agit qu'à l'ÉCRITURE — rien ne re-valide rétroactivement l'existant ;
  au pire, une catégorie inventée devient un poste au prochain sync du Budget, design Lot C).

## PORTFOLIO-HISTORY — vérif visuelle post-deploy (remonté par Claude 2026-07-22, PR #485)
- [ ] **Smoke test du repli Yahoo en PROD** (2 min, après le deploy Vercel) : ouvre le Dashboard en données
  réelles → la courbe « Évolution détaillée » doit se remplir (au besoin recharge une fois passé ~1 min
  d'hydratation). Si les courbes restent vides pour tes actions (pas la crypto), le suspect n°1 est le
  rewrite Vercel `/api/history/yahoo/:symbol` qui ne transmettrait pas les query params `period1/period2`
  (prouvé OK en dev, [Probable] côté Vercel — jamais exécuté en prod). Test direct :
  `https://<ton-domaine>/api/history/yahoo/XEQT.TO?period1=1700000000&period2=1750000000&interval=1d`
  doit rendre du JSON Yahoo (pas la page HTML de l'app). Dis-le à Claude si ça rend du HTML.

## O-SYNC — Décisions durcissement sync (Vague 3, remontées par Claude 2026-07-16)
> Les 2 gros wins de Vague 3 sont livrés (ARCH-SYNC-SPLIT #455, SYNC-FETCH-TIMEOUT #456). Les 2 items
> restants touchent des chemins money-critical (ta zone de perte 230k$) et méritent TON arbitrage avant
> que Claude code — d'où ce point plutôt qu'un pilote auto.

- [ ] **`[SEC-DRIVE-ENCRYPT-DEFAULT]` — chiffrer le payload Drive par défaut ? (décision archi)**
  - **Le pour** : aujourd'hui le payload Drive est en CLAIR (`enc:false`) par défaut ; seules les clés API
    sont chiffrées (via le `sub` Google, `keyCipher`). Étendre ce chiffrement `sub` à tout le payload sort les
    données financières du clair dans le fichier appData.
  - **Le contre (pourquoi Claude n'a pas foncé)** : gain de sécurité **modeste** — le fichier vit déjà dans
    ton `appDataFolder` PRIVÉ (accès = ton compte Google + scope `drive.appdata`), et la clé dérivée du `sub`
    n'est **pas un secret** (le `sub` est dans le jeton OAuth → un attaquant qui a ton compte peut la redériver,
    aveu de `keyCipher.ts`). Le vrai zéro-knowledge, c'est la passphrase (déjà dispo, opt-in).
  - **Le coût réel (pas un « M »)** : ça touche la mécanique EXACTE de l'anti-clobber qui t'a sauvé du 230k$ :
    (1) `decideOnLoad` lit le payload clair pour l'optimisation « contenu identique → noop » (`syncEngine.ts:54`)
    → chiffré, elle saute → **faux conflits bruyants** sur des données identiques à la reconnexion ;
    (2) `summarizeForConflict` lit `assets`/`transactions` en clair pour le modal « cet appareil vs Drive »
    → il faudrait déchiffrer avant de résumer ; (3) `SyncEnvelope.enc` est un booléen dont `true` = passphrase
    zéro-knowledge → il faudrait un 3ᵉ état (`enc:'sub'`), donc **migration de format** + rétro-compat des vieux
    blobs clairs. C'est faisable (le `sub` est dispo → déchiffrer-avant-décider), mais c'est un chantier
    money-critical, pas un quick-win.
  - **Ma reco [Probable]** : **basse priorité**. Le gain (données pas en clair dans TON Drive privé) ne justifie
    pas le risque de retoucher l'anti-clobber pour une clé non-secrète. Si tu veux du vrai secret → active la
    **passphrase** (déjà là). Dis-moi si tu veux quand même le chiffrement `sub` par défaut et je le fais en
    plan détaillé + panel + discriminants sur les 2 scénarios d'incident.
- [x] **`[MCP-WRITE-VERSION-TOKEN]` — ✅ FAIT (ton GO « 2 oui », 2026-07-16)** — OCC per-call plumbé
  (`getWithVersion`/`save(next,expectedVersion)`), 2 tool-calls MCP concurrents ne peuvent plus se clobber. Discriminant prouvé.

## O1 — Auth : RETIRER Cloudflare → ✅ **FAIT (2026-06-16)**
> Cloudflare RETIRÉ de FinanceAI : Access (mur) supprimé + apex/www dé-proxifiés (DNS only → Vercel TLS direct).
> Auth = **gate Google in-app** actif (`VITE_GOOGLE_GATE=1`). Le tunnel CF du `hub` reste (projet séparé).
> ⚠️ Piège vécu : le client OAuth était PARTAGÉ avec CF Access (redirect_uri `cdn-cgi/access/callback`) → l'avoir
> retiré cassait le login CF → restauré le temps de valider, puis CF retiré proprement.

- [x] **A. Client OAuth Google créé** (`550313627083-…`, débloque aussi la sync Drive).
- [x] **B. Gate activé** : `VITE_GOOGLE_CLIENT_ID` + `VITE_GOOGLE_GATE=1` (Vercel) + redéployé.
- [x] **C. Validé** : login Google → données reviennent ; `?nogate=1` OK ; reload sans re-login.
- [x] **D. Cloudflare retiré** : app Access supprimée ; apex+www en « DNS only » (gris) → Vercel.
- [x] **E. CSP nettoyée** par Claude (`cloudflareinsights` retiré de `vercel.json` + `index.html`) + docs MAJ.
- **Ce que ça engendre** : tu PERDS l'auth CF (→ gate Google, qui ouvre au multi-user), le WAF/anti-bot/DDoS
  CF, et CF Web Analytics. Tu GARDES TLS + CDN (Vercel). Bonus : disparition d'un déclencheur du bug
  « Failed to fetch chunk » (CF Access 302 sur session expirée, PH1-b). **Risque** : plus de WAF/DDoS CF —
  acceptable en perso/petit groupe ; pour un vrai produit public → backend + rate-limiting (O4/P0-PROXY).
- **Côté Claude (sur ton GO)** : CSP cleanup (E), durcir le gate (bouton « déconnexion », sélecteur de
  compte), MAJ docs (CLAUDE.md « Cloudflare en place » → retiré, SESSION_HANDOVER). Claude ne fait RIEN
  qui expose l'app avant ta confirmation que le gate est validé.

## O6 — Questions du brief 2026-06-10 (réponses requises, Claude ne devine pas)
- [x] ~~**Q2 (Phase 1 / Cloudflare)** / **Analyse Cloudflare (PH1-b)**~~ — **CADUC (2026-06-16)** : Cloudflare complètement retiré (O1). Apex+www en DNS only → Vercel direct.
- [ ] **Q1 (Phase 4 / Futur — à répondre avant que Claude code PH4-FUT)** : qu'est-ce que tu veux
  voir ANNOTÉ sur la courbe ? (âge de retraite ? épuisement d'un compte ? bascule de stratégie ?
  début RRQ/PSV ? autre ?)

## O2 — Connecteur MCP : héberger le `.mcpb` (1 clic)
Le code est prêt et déployé ; il manque l'hébergement du bundle (Marc avait signalé
« le fichier mcp arrive pas à télécharger » — cause : `.mcpb` jamais hébergé).
- [ ] Créer `mcp/drive/connector-client.json` (copier `.example`) avec le client OAuth
  **« Desktop » PARTAGÉ** (id + secret). **Gitignoré** — jamais commité.
- [ ] `npm run mcp:pack` → `dist/FinanceAI.mcpb`.
- [ ] Héberger : déposer dans `public/financeai-connector.mcpb` (redéployer) **ou**
  pointer `VITE_CONNECTOR_MCPB_URL` vers une release.
- [ ] Tester l'install 1 clic (Claude Desktop) + « connecte mes finances » → vraies données.

## O8 — Déployer le serveur MCP sur Cloud Run → claude.ai web/mobile (Lot 4 livré, actions GCP restantes)
Le code des 4 lots est mergé (what-if + séries, transport HTTP, OAuth 2.1, Docker/deploy/CI). Pas-à-pas
COMPLET dans `mcp/README.md` § « Déployer sur Cloud Run ». Résumé des actions Marc (Google Cloud, ~15 min) :
- [ ] Projet GCP + `gcloud auth login` + activer les API (run, secretmanager, cloudbuild, artifactregistry).
- [ ] Générer 2 clés (`node -e "…randomBytes…"` — PowerShell natif, cf README) : signature + **ta clé d'accès**.
- [ ] `npm run mcp:auth` en local → créer les **3 secrets** Secret Manager (signing-key, access-key,
  google-refresh depuis `~/.financeai-mcp/credentials.json`) + IAM `secretAccessor` sur google-refresh.
- [ ] `PROJECT_ID=… ./mcp/deploy.sh` → récupère l'URL `https://…run.app/mcp`.
- [ ] claude.ai (ou mobile) → Settings → Connectors → Add custom connector → coller l'URL → autoriser avec la clé d'accès.
- [ ] (Optionnel) déploiement continu : configurer `GCP_PROJECT_ID` (var repo) + `GCP_WIF_PROVIDER`/`GCP_DEPLOY_SA` (secrets).
- ⚠️ **Avant exposition** (BACKLOG `MCP-CLOUDRUN-AUTH-HARDENING`) : clé d'accès aléatoire (fait à l'étape 2),
  `min-instances 1` (déjà dans deploy.sh), rate-limit `/oauth/authorize` recommandé. Kill-switch : régénérer signing-key.
- (Optionnel) définir `VITE_MCP_SERVER_URL` sur Vercel → la carte « Connecter à Claude » de l'app affiche l'URL du connecteur.

## O3 — Prouver la sync Drive en réel (P0 produit multi-user)
- [x] ~~Créer le `VITE_GOOGLE_CLIENT_ID`~~ — ✅ **FAIT (O1-A)** : client OAuth Google déployé.
- [ ] **Valider sur hubperso.com** : fenêtre privée neuve → login Google → toutes les données + clés API reviennent
  (cf checklist `docs/BACKLOG.md` § sync).

## O4 — Relais BYOK pour Claude (P0-PROXY, dark-launch awaiting env+flag)
Code livré (2026-07-06, phases 1-2 seulement) : relais Edge Vercel, token chiffré, anti-abus.
- [ ] **(1) Générer le token** : `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" (PowerShell : openssl absent sur Windows)` → copier.
- [ ] **(2) Poser l'env Vercel SERVEUR** (`PROXY_ACCESS_TOKEN`) : ce token → Settings → Environment Variables
  → Category **Functions** (serveur-side seulement) → `PROXY_ACCESS_TOKEN=<token>`.
- [ ] **(3) Poser l'env build** (`VITE_PROXY_ACCESS_TOKEN`) → Category **Production** (ou **Preview** pour tester)
  → `VITE_PROXY_ACCESS_TOKEN=<token>`.
- [ ] **(4) Redéployer** Vercel (les nouvelles vars sont injected au build+Functions).
- [ ] **(5) Smoke test** : dans l'app prod, activeR une fonction IA (« Résumer mes finances »). Doit fonctionner.
- [ ] **(6) OPTIONNEL — basculer le transport** : une fois satisfait, poser `VITE_CLAUDE_TRANSPORT=proxy` (Production)
  pour passer du relais par défaut (Vision en direct pour l'instant). Redéployer. Note : rollback = retirer le flag.

⚠️ **Aucune clé Anthropic serveur à créer** — le relais utilise TA clé client (via le navigateur au premier appel
  token=null), puis la chiffre via le token Vercel, réemballe + envoie à Anthropic. Zéro exposition cloud.

## O5 — Validations manuelles sur device (ressenti / prod)
- [ ] Fluidité zoom 60 fps sur tous les onglets ; PDF complet ; iOS Safari ; Lighthouse re-run.
  Liste vivante détaillée : `docs/BACKLOG.md` § « Tests manuels ».
- [ ] **[RECH-ACTION-UX] confirmer le bug « sélectionner le prix fait quitter la page »** avec une **clé Finnhub
  configurée** (Investissement → Ajouter une action → tape un nom → sélectionne une suggestion). Le dropdown
  d'autocomplétion n'apparaît qu'avec une clé, que je n'ai pas en dev → je n'ai pas pu reproduire le symptôme
  exact. J'ai corrigé la cause la plus évidente (Escape fermait toute la modale, désormais ferme juste le menu,
  testé) + agrandi le dropdown + fallback gracieux si le symbole n'a pas de cours. Si le bug persiste avec ta
  clé, dis-moi **exactement** quel geste le déclenche (clic suggestion ? « Suggérer prix historique » ? Entrée ?).

---

## Blocages / trous remontés par Claude (gouvernance G0, 2026-06-05)
- [x] ~~Action `backlog-autocheck`~~ — **RETIRÉE (2026-06-09, demande Marc)** : workflow + script
  supprimés, conditions `[skip-backlog]` retirées de `ci.yml`. Désormais **Claude coche lui-même**
  le BACKLOG au merge de chaque PR (cf CLAUDE.md « Backlog tenu par Claude »). Plus rien à valider.
- [x] **Branches mortes supprimées (2026-06-15)** — 16 distantes (12 mergées + `jolly-davinci-PQpC1`
  qui portait 56 PR + `dependabot` PR #286 fermée + `chore/refresh-screenshots` + `loving-faraday`)
  via l'API GitHub, et 7 locales mergées. `main` est désormais la **seule** branche (local + distant).
  « Automatically delete head branches » est coché → les branches de PR mergées disparaissent seules.
- [x] **Auto-merge débloqué + prouvé (2026-06-15)** — « Allow auto-merge » coché ; ruleset `main`
  exige `Lint / Typecheck / Tests / Build` + `E2E (Playwright / Chromium)`. 4 PR (#288→#291) mergées
  seules dès CI verte cette session, zéro intervention. Claude arme `--auto --squash` à la création de
  chaque PR. (Reste à vérifier d'un œil le **bypass actor** de la ruleset — une app autorisée à contourner.)
- [x] **9 agents projet + `/review-all`** : étaient absents (`.claude/` était gitignoré en
  entier) → **créés par Claude** dans G0 et `.claude/` désormais committé pour les parties projet.
- [x] **CLAUDE.md + hooks absents du repo** → installés dans G0 (push/merge autonome, guard
  laisse passer le push).
- [ ] **Agents GLOBAUX (`~/.claude/agents/`)** : référencés par CLAUDE.md mais propres à chaque
  machine. En exécution **cloud**, Claude n'y a pas accès (seuls les agents projet committés et
  les agents génériques du harness sont dispo). Sur les PC de Marc, ils restent à installer via
  claude-config / ECC si voulu.
- [x] **Docs périmées resynchronisées (PR #351, 2026-06-18)** : table §1 de `SESSION_HANDOVER.md` mise à
  jour (#292/2042 tests/Cloudflare → #350/~2077 tests/gate Google in-app). Le reste du HANDOVER (bandeau de
  tête + sessions) était déjà à jour.


## Décisions design Phase 4 (Claude a fait tout l'autonome — 12 PR #250-261)
> Les gains CONCRETS des onglets Futur/Investissement/Transactions/Retraite sont livrés. Restent 2
> refontes purement DESIGN qui ont besoin de ta vision (Claude refuse de deviner = risque hors-sujet) :
- **[PH4-BUD] Budget — refonte complète** : donne 2-3 irritants concrets (ce qui te gêne aujourd'hui)
  pour cadrer. Pistes Claude : vue prévu/réel par groupe (Besoin/Envie/Épargne) en tête ; lien
  budget→projection plus visible ; réduire les sous-sections.
- **[PH4-FUT] annotations sur la courbe (Q1 de ton brief)** : QUOI annoter ? (âge retraite / épuisement
  d'un compte / bascule de stratégie / événements de vie). + « Paramètres » renommé/allégé, conseils du
  plan d'action déclinés mois/trimestre/semestre/année.


## O7 — Valeurs fiscales RQ 2026 requises + décisions (résolu 2026-07-06)
- [x] ✅ **[FISC-WELCOME-2026]** — données reçues 2026-07-06. Seuils reste du Québec 2026 (source *Gazette officielle du Québec,
  Partie 1, 2025-06-07*) : **62 900 / 315 000** (indexation +2,3438 % vs 2025). Transcrit `FISCAL_REFERENCE.md` §8.
  Item BACKLOG moisi en 🔧 ACTIONNABLE (effort S une fois les sources). Claude procède.
- [x] ✅ **[W5-TAX-PROXY]** — décision Marc : **(a) garder les proxies plats** (0,45 locatif / 0,36 CCPC) documentés
  en tant qu'estimation de taux marginal QC. Ajouter une mention UI + source QC dans `FISCAL_REFERENCE.md` (rapide).
  Clos, reste UI+doc à Claude.
- [x] ✅ **[HIST-NW-DEBT-DISCLAIMER]** — décision Marc : **(b) disclaimer visuel** sur la zone passée du graphe (honnête,
  zéro fausse donnée). Code documenté (HIST-NW-NO-DEBT), reste le visuel UI → item 🔧 BACKLOG.
- [ ] **[TP1G-VIVANT-SEUL]** — données reçues 2026-07-06. Grille crédit 65+/personne vivant seule (source MFQ fiche 110606)
  : 2 172 $ (base) + supplément monoparental 2 681 $. Seuil revenu 42 955 $. Transcrit `FISCAL_REFERENCE.md` §4.
  Item 🔧 ACTIONNABLE moyen (plan-first + discriminant git-stash + panel).
- [ ] ~~**[FISC-TAXDEC-INCR]**~~ — **À CONFIRMER** : interprétation de la réponse Marc « ok » 2026-07-06. Signifie-t-il
  (a) COD ER le fix risqué (re-baser golden + tests), ou (b) statu quo/différé ? En attente d'un « go » ou « wait »
  explicite avant de coder (risque $ élevé).

## A0 — Quota Vercel (2026-08-12)

- [x] **[INFRA-VERCEL-QUOTA]** — ✅ **La PROD est à jour. Deuxième correction de mon propre constat**
  (vérifié le 2026-08-13 04:0x UTC via l'API Vercel, `list_deployments` + `get_deployment`).
  **Le plafond ne frappe pas les deux classes de déploiement de la même façon** : les *previews* de
  branche ont été refusées (« Deployment rate limited — retry in 24 hours », 01:56 et 02:18 UTC),
  mais les deux déploiements de **PRODUCTION** sont passés :
  - `dpl_AL8BmXD4bJKiU9eygHaZ3mG1wWQ1` → `e7267da` (#608), READY, 02:04 UTC ;
  - `dpl_6UFUPhXoz5tD1hwbhzenszWLpuSi` → `d864239` (#609), READY, 02:27 UTC, alias
    **`finance.hubperso.com`**, `aliasError: null`.
  `d864239` est la tête actuelle de `main` → **la prod sert le dernier code**, refonte nav et lot
  « filets de sécurité » compris. Aucun redéploiement à relancer.
  ⚠️ Vérification HTTP réelle NON faite : `finance.hubperso.com` est bloqué par le proxy d'egress de
  l'environnement d'exécution (curl → `CONNECT tunnel failed 403`, WebFetch → `EGRESS_BLOCKED`).
  La preuve ci-dessus est l'enregistrement d'alias de Vercel, pas la réponse servie. 👤 Marc peut le
  confirmer d'un coup d'œil.
  **Deux leçons, symétriques, apprises à 50 minutes d'intervalle** (`INFRA-QUOTA-FALSE-RESET`) :
  (1) ne pas conclure « quota résolu » parce qu'un déploiement passe — j'ai eu tort à 01:03 UTC ;
  (2) ne pas conclure « prod bloquée » parce qu'un déploiement échoue — j'ai eu tort à 01:56 UTC, en
  généralisant un échec de PREVIEW à la PRODUCTION sans vérifier cette dernière. Dans les deux cas
  l'erreur est la même : **inférer l'état d'une classe d'objets depuis un événement d'une autre**.
  La bonne question est toujours « quel déploiement, quelle cible, quel alias ? ».
  Historique ci-dessous.
- [x] **Historique** — Le plan Vercel GRATUIT plafonne à **100 déploiements/jour** ; plafond atteint le
  2026-08-12 ~20:18 UTC (6 PR + pushes de la refonte nav dans la journée). Effet : previews ET **déploiement PROD
  bloqués** jusqu'au reset — le code merge sur `main` mais hubperso.com garde la version d'avant.
  **Décision Marc (2026-08-12) : attendre le reset**, pas d'abonnement Pro (règle « tout gratuit »).
  Claude relance le déploiement lui-même au reset (rappels programmés : minuit heure Québec + 20:45 UTC en secours).
  Mitigation appliquée côté Claude : **pushes groupés** (un push par PR au lieu d'un par correctif).
  👤 Rien à faire pour Marc, sauf s'il veut changer d'avis sur le plan payant.
