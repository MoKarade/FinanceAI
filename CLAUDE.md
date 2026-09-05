# CLAUDE.md — FinanceAI

App perso de planif financière (fiscalité ARC + Revenu Québec, Monte Carlo retraite,
assistant Claude). 100 % navigateur, pas de backend. TS strict, **5 634 tests** Vitest
(573 fichiers de test, mesuré le 2026-09-05). Tout en français.

> **Ce fichier se charge à CHAQUE session — il reste COURT, pour de vrai.**
> Le détail (leçons, incidents, pièges, rationnels) vit dans **`docs/CONVENTIONS.md`**,
> qui est l'ancien CLAUDE.md intégral. Ici : ce qu'il faut savoir AVANT de savoir quoi
> chercher. Une leçon nouvelle va dans `docs/CONVENTIONS.md` ; on n'ajoute ici qu'une
> LIGNE d'index quand une classe de piège n'y figure pas encore.
>
> Structure imposée par la convention commune aux huit dépôts
> ([`claude-config/conventions/STRUCTURE-DEPOT.md`](https://github.com/MoKarade/claude-config/blob/main/conventions/STRUCTURE-DEPOT.md)) :
> mêmes titres, même ordre, dans les huit. Les principes en §1, le gate en §5, les leçons en §9.
> **Trois documents ont déménagé le 2026-08-20** pour s'y conformer : `docs/BACKLOG.md` →
> `BACKLOG.md`, `docs/SESSION_HANDOVER.md` → `HANDOVER.md`, et `docs/decisions.md` (785 lignes,
> treize décisions empilées dans le désordre) → `docs/adr/NNNN-slug.md`, une par fichier.

## 1. Principes non négociables

- **Source unique — Future** : tout calcul long-terme vient de `lastProjection.chartData`.
  Avant d'ajouter un calcul côté UI, **grep le moteur** : s'il l'émet déjà, le CONSOMMER.
- **Source unique — Patrimoine net** : `services/projection/netWorth.ts` `computeRawNetWorth`.
  `realEstateEquity` est DÉJÀ net d'hypothèque (ne jamais re-soustraire). Jamais de copie
  locale de la formule.
- **No-fake-data** : zéro donnée simulée en prod. Projection non calculée →
  `<ProjectionRequired>`. Une valeur non finie ne devient JAMAIS un défaut numérique
  (`0 $` crédible est pire qu'un « — » honnête), y compris dans un prompt IA.
  ⚠️ Vaut aussi pour un OBJET : superposer du réel sur du projeté par `{...projeté, ...réel}` laisse
  filtrer tous les champs non recouverts. Un point « réel » se construit à partir de RIEN.
- **Valeurs fiscales** : toute constante fiscale vient de `docs/FISCAL_REFERENCE.md` (datée +
  sourcée). Jamais de chiffre fiscal en dur non sourcé — un chiffre sans source est SUSPECT,
  pas « à re-sourcer un jour ».
- **Unités argent** : `grossSalary`/`netSalary` du store sont **MENSUELS** → ×12 pour toute
  comparaison annuelle (sinon bug d'échelle ~12×).
- **Devises** : `Asset.currentPrice`/`buyPrice` sont en devise **NATIVE** → toute somme
  affichée passe par `assetValueCad`. Garde-test : `tests/services/assetFxGuard.test.ts`.
- **Formatage $** : `formatCAD` (`utils/format.ts`) UNIQUEMENT. Jamais `toLocaleString()` nu,
  jamais `` `${n.toFixed(0)}$` ``. Pourcentages → `formatPercent`.
- **Sécurité** : jamais de secret en clair (code, repo, chat). Clés API en IDB chiffré,
  exclues de localStorage / backups / push Drive.

## 2. Conventions de code

React 19.2 + Vite 8 (Rolldown) + TS 5.8 strict + Tailwind 3 · Zustand 5 (persist+partialize,
schema v7) · Zod 3 · Recharts 3 (lazy) · Vitest 4 + Testing Library + axe-core ·
@anthropic-ai/sdk (Sonnet 4.6 + Haiku 4.5) · @modelcontextprotocol/sdk · Finnhub + CoinGecko ·
i18next · jspdf. Prod : **Vercel**.

Structure **PLATE** (pas de `src/`) : racine `App.tsx`, `index.tsx`, `constants.ts`, `types.ts`,
`i18n.ts` ; dossiers `components/ hooks/ services/ store/ utils/ locales/ mcp/ e2e/ tests/
scripts/ docs/`. Cœur : `services/projection.ts` + `services/projection/` (57 sous-modules, mesuré le 2026-09-05).

⚠️ Hoister un import au niveau App tire ses deps dans le bundle de BOOT → lazy-charger
(`lazyWithRetry` + Suspense) tout composant/service app-level qui importe du lourd.

## 3. Workflow git

- **Cadrage, plan et exécution : voir la convention commune** (§7, chargée par la §10 de ce
  fichier). Elle porte désormais la règle qui est NÉE ici — « plan d'abord, toutes les
  questions d'un coup, OK avant de coder, puis exécution continue sans arrêt en pleine tâche ».
  Marc l'a étendue aux neuf dépôts le 21/08/2026 plutôt que de la supprimer : elle protégeait
  du code money-critical, elle protège maintenant partout. Écrite ici ET là-bas, elle aurait
  divergé — c'est le problème qu'on vient de régler.
- **Proposer ≠ faire** : jamais de scope que Marc n'a pas demandé. Ici, le rappel vaut aussi
  pour l'arrêt : on s'arrête après un merge confirmé VISUELLEMENT, ou sur une vraie question
  bloquante — pas sur « je vais faire X ».
- **Qualité d'abord, coût tokens NON contraint** : voir §10, « Propre à ce dépôt ». La règle
  est intacte ; ce qui a été ajouté, c'est qu'elle porte sur l'EFFORT et non sur le volume écrit.

### Cycle git (autonome, de bout en bout)

Branche `claude/<slug>` → commits français préfixés par l'ID (`[A12a] desc`) → push → PR
(draft par défaut) → **Claude merge lui-même** (squash sur `main`). Le push sur `main`
déclenche le déploiement Vercel : Claude en est responsable (choix Marc).

- ⚠️ **Ne PAS fractionner le cycle sur plusieurs tours.** `git add && git commit && git push`
  chaînés en UN SEUL appel Bash, puis PR + auto-merge dans le MÊME tour. Un cycle étalé laisse
  un état à moitié fait dès qu'un tour est interrompu (commits poussés SANS PR = rien
  n'atterrit sur `main`, et la reprise croit que c'est fait). Si des commits sont déjà poussés
  sans PR : créer la PR IMMÉDIATEMENT depuis l'existant — jamais re-committer le même travail.
- **Merge sans attente active** : `enable_pr_auto_merge` (squash) après gate vert + `/review-all`.
  Pas de `sleep` pour surveiller la CI.
- ⚠️ **Tout commit (doc/leçon/handover) DOIT être inclus AVANT d'armer l'auto-merge** : une PR
  légère peut merger en SECONDES, et un push de rattrapage arrive alors sur une branche déjà
  supprimée → commit ORPHELIN absent de `main`.
- ⚠️ Hors ce cycle, toute action **destructive/irréversible** (`--force`, `reset --hard`, `rm`,
  migration de données, réécriture d'historique) → **confirmer avec Marc d'abord**.
- **Réconciliation post-merge** : après un squash-merge, GitHub supprime la branche →
  `git checkout -B <branche> origin/main` (après avoir confirmé `git status --porcelain` vide).
  Ne JAMAIS pousser un commit de merge vide.

### Tenue du BACKLOG (règles renforcées Marc 2026-07-31)

Au MERGE d'une PR, Claude coche lui-même les `[ID]` livrés, ajoute les découvertes, et route
les blocages humains vers `docs/A_FAIRE_MOI.md`.

- ⚠️ **CHAQUE tâche a une case `- [ ]`** — aucune puce de tâche sans case. Une note sans travail
  à faire n'est pas une tâche : elle va dans l'archive ou dans `docs/adr/`.
- ⚠️ **Item fini ET validé (mergé, gate vert) → DÉMÉNAGE vers `docs/BACKLOG_ARCHIVE.md`**
  (avec date + PR), au plus tard à la PR suivante. Le BACKLOG ne garde que le vivant.
- ⚠️ Leçon de la refonte 2026-07-31 : ~65 items étaient FAITS sans case cochée et ~128 puces
  n'avaient pas de case. Un backlog qui mélange fait et à-faire trompe le PM et la reprise de
  session (classe `PM-STALE-BACKLOG`). C'est la tenue **à chaque push** qui empêche la dérive,
  pas les grandes passes de nettoyage.

### Docs à jour à CHAQUE push

Avant le commit final, se demander « quels docs décrivent ce que je viens de changer ? » et
les mettre à jour **dans la MÊME PR** : `HANDOVER.md` (état — responsabilité keystone,
dans le « Toujours » de `/review-all`), `BACKLOG.md`, `CHANGELOG.md`, `README`, et les docs
techniques touchés (`PROJECTION*.md`, `FISCAL_REFERENCE.md`, `ARCHITECTURE.md`…). Un champ,
calcul ou valeur fiscale ajouté SANS sa doc = doc périmée qui trompe la prochaine session.

**Leçon apprise → `docs/CONVENTIONS.md`, dans le MÊME commit.** Rien appris → le dire
(« push sans leçon »), pas de skip silencieux. Une leçon notée ailleurs (chat, mémoire
harness) mais pas portée dans le dépôt est perdue à la prochaine session.

## 4. Commandes utiles

```bash
npm run dev                  # Vite
npm run test  · test:watch   # Vitest
npm run test:e2e             # Playwright / Chromium
npm run typecheck · lint     # tsc --noEmit · ESLint
npm run build                # ⚠️ prebuild = lint : le build CASSE si le lint échoue
npm run knip · check-contrast
npm run mcp:dev | mcp:auth | mcp:connect | mcp:pack
```

- `/review-all` — panel d'agents sur le diff courant (voir §11).
- `tools/agent-control-center` — vue `/backlog` dérivée de `BACKLOG.md`, `docs/A_FAIRE_MOI.md`
  et de git. **Lecture seule**, et les nombres de tests y sont *lus* du `HANDOVER.md` plutôt
  que re-mesurés : une commande de tableau de bord ne doit pas coûter une suite complète.

## 5. Vérifications avant commit

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

Avant CHAQUE commit (hook `commit-gate`). Jamais `--no-verify`.

- ⚠️ **`npm run typecheck`, JAMAIS `npx tsc`** : `npx` peut résoudre un TypeScript distant qui
  ignore `--noEmit` → « vert » trompeur + pollution de l'environnement du même appel.
- ⚠️ `npm run build` a un `prebuild` = `lint` : le build CASSE si le lint échoue.
- Autres : `test:watch`, `test:e2e`, `knip`, `check-contrast`, MCP `mcp:dev|auth|connect|pack`.

## 6. Après un merge : vérifier le DÉPLOIEMENT, pas seulement la CI

**CI verte ne veut pas dire « en ligne ».** Ce sont deux systèmes indépendants : la CI juge le
code, l'hébergeur construit et sert. Un merge peut passer le gate et ne jamais être déployé — la
branche reste verte, le site continue de servir l'ancien build, et rien n'est rouge nulle part.

Vécu le 31/07/2026 : quatre projets Vercel ont cessé de créer des déploiements pendant ~3 h.
DriveAI et JobAI ont rattrapé au push suivant ; Hubperso et BatchChef n'en ont pas eu — leur
commit d'en-têtes de sécurité est resté **cinq jours** en attente sans que personne ne le voie.

Donc, après un merge qui change ce qui est SERVI : vérifier qu'un déploiement de production a
bien été créé et qu'il est `READY`, puis **contrôler l'effet sur la réponse réelle** — un en-tête
se lit dans la réponse, il ne se déduit pas du fichier source. Ici, ça vise en particulier la
**CSP de `vercel.json`**, qui est **enforcée** (pas en `Report-Only`) : y ajouter un domaine à
`connect-src` sans vérifier la réponse revient à couper l'app d'une API en silence, et un `fetch`
bloqué par CSP ne casse ni le build ni les tests.

Corollaire : un merge qui ne change QUE de la doc n'a pas de déploiement à vérifier. Le dire
plutôt que de laisser croire qu'on a vérifié.

## 7. Intégration hub

FinanceAI publie un résumé au **hub perso** (`hubperso.com`) — mais **pas** depuis Vercel : le
endpoint vit dans le serveur MCP auto-hébergé (`mcp/http.ts` → `GET /hub/summary`), construit par
`mcp/hubSummary.ts`. C'est la différence avec les autres apps, et elle est structurelle : les
données financières ne quittent pas la machine de Marc, donc le résumé se calcule là où elles sont.

- **Identité publiée** : `id: "financeai"`, `name: "FinanceAI"`, `url:
  "https://finance.hubperso.com"`, `color: "#0f766e"`. L'`id` doit rester identique à l'entrée de
  `Hubperso/lib/sources.ts` — c'est du **code** côté hub, donc le changer exige un redéploiement
  du hub, pas seulement une variable d'environnement.
- **Auth (échec fermé)** : la route n'existe QUE si `FINANCEAI_HUB_TOKEN` est défini ; header
  `x-hub-token` exigé, **401** sinon, comparaison en temps constant. Réponse toujours
  `Cache-Control: no-store` — un résumé est un instantané, jamais une page mise en cache.
- **Validé avant d'être servi.** `buildHubSummary` passe par `validateSummary()` du vrai schéma du
  contrat : ce serveur ne publie jamais un JSON non conforme. Une panne interne rend
  `errorHubSummary` — le widget affiche la panne au lieu de traiter l'app comme injoignable.
- **No-fake-data au contrat** : les métriques viennent de `computeFinancialSignals` sur l'état
  réel, la fraîcheur Drive donne `status`/`dataAsOf`. Aucun chiffre inventé, jamais un `0`
  plausible à la place d'une mesure absente (§1).
- **Période et devise** : le hub somme **par période** et refuse de fusionner « cumulé » avec
  « ce mois-ci ». Une app qui publierait `mois` se retrouverait seule dans sa colonne et casserait
  le total pour tout le monde.

## 8. Documentation (où vit quoi)

- `docs/CONVENTIONS.md` — **détail de tout ce qui est indexé plus bas** (leçons, pièges, rationnels)
- `BACKLOG.md` — tâches que Claude peut faire · `docs/BACKLOG_ARCHIVE.md` — items finis
- `docs/A_FAIRE_MOI.md` — tâches HUMAINES (Claude y route ses blocages)
- `HANDOVER.md` — état actuel + reprise rapide
- `docs/VISION.md` — où va le projet · `docs/adr/` — décisions verrouillées (ADR)
- `docs/FISCAL_REFERENCE.md` — valeurs fiscales : **SOURCE DE VÉRITÉ** (datée + sourcée)
- `docs/ARCHITECTURE.md`, `docs/PROJECTION.md`, `docs/PROJECTION_OUTPUT_SCHEMA.md`, `mcp/README.md`, `CHANGELOG.md`
- `docs/HISTORIQUE.md` — archive consolidée

**Reprise de session**

1. `git fetch origin main && git merge --ff-only origin/main` **AVANT de juger l'état**
   (le clone local ne se met pas à jour seul — vu 146 commits de retard).
2. Point bref lu depuis `HANDOVER.md` + `BACKLOG.md` : **Fait** / **État** /
   **Suite proposée** (+ ID) / **Planifié**.

La structure est commune aux huit dépôts — elle est fixée dans
[`conventions/STRUCTURE-DEPOT.md`](https://github.com/MoKarade/claude-config/blob/main/conventions/STRUCTURE-DEPOT.md)
du dépôt `claude-config`, et nulle part ailleurs.

⚠️ **Un fichier daté est un RÉCIT, pas une référence.** `docs/AUDIT_2026-08-12.md`,
`docs/AUDIT_FINANCIER_2026-06-17.md`, `docs/ANALYSE_APP_2026-07-15.md`,
`docs/PLAN_CHANTIERS_2026-06-19.md`… disent à quoi ils correspondaient **à leur date** et ne se
mettent pas à jour — les rafraîchir effacerait ce qui était vrai ce jour-là. Ce qui doit rester
vrai va dans un document **sans date** : `BACKLOG.md` pour le restant, `HANDOVER.md` pour l'état,
`docs/CONVENTIONS.md` pour les leçons, `docs/adr/` pour les décisions.

Nuance du déménagement du 2026-08-20 : dans ces récits, les **chemins** ont été réparés (un lien
mort n'aide personne), mais **rien de ce qu'ils affirment** n'a été rafraîchi. Réparer un pointeur
n'est pas réécrire un récit.

## 9. Leçons apprises — index des pièges, détail dans `docs/CONVENTIONS.md`

- **Une valeur d'échec s'identifie par sa LIGNE, pas par l'assertion qu'on craint** : deux
  `toBeLessThan(1)` dans le même test — le rouge « 5 611,99 » visait « revenu ~0 pendant la perte »
  (obsolète par conception : l'AE coule désormais), pas le résiduel de conservation trois lignes plus
  haut, et un cycle de debug entier a cherché une fuite inexistante. Ouvrir le fichier À la ligne du
  rapport avant de nommer l'assertion ; après un correctif qui change un comportement, grep les
  assertions qui épinglent l'ANCIEN avant de pousser
  (`UNE-VALEUR-D-ECHEC-S-IDENTIFIE-PAR-SA-LIGNE-PAS-PAR-L-ASSERTION-QU-ON-CRAINT`, 2026-09-04).
- Une valeur sensible qui sort par une **prop de composant tiers** (`tickFormatter`/`formatter` Recharts)
  échappe AU grep ET aux tests qui mockent ce composant : la garde est un scan de SOURCE (revue #608).
  Elle sort aussi par un **attribut** (`title`/`aria-label`) et par la **STRUCTURE** (nombre de lignes,
  position d'un marqueur) : masquer les valeurs ne masque pas leur existence.
- Un flux moteur alimente PLUSIEURS registres (solde/fiscal/per-conjoint/affichage) : un producteur
  nouveau ou corrigé doit alimenter TOUS les registres (meltdown REER, 2026-07-31).
- Un `git checkout -- <fichier>` utilisé pour ANNULER une perturbation manuelle de test efface TOUT
  le fichier (retour à `HEAD`), pas seulement la ligne perturbée — dangereux dès que ce fichier
  porte un AUTRE correctif non commité du même lot (`[BUDGET-TRANSACTIONS-SYNC-AUDIT]`, 2026-08-26).
- Un nouvel IMPORT STATIQUE dans un composant très monté en test élargit silencieusement le contrat
  de mock de TOUS les fichiers qui le montent — rejouer chaque montage après l'ajout, pas seulement
  le nouveau test (`[NAV-MERGE-SANTE-FUTUR]`, 2026-08-27).
- **Un ACB manquant n'est pas un impôt payé** : `[FISC-DIV-ACB-STEPUP]` annonçait « ≈ 58 k$ d'impôt
  en double » à 20 ans par arithmétique sur l'ACB manquant. Mécanisme JUSTE (le dividende réputé est
  imposé sans que le prix de base monte, donc ré-imposé dans le gain latent), chiffre SURESTIMÉ :
  mesuré **+1 911 $ / +12 055 $ / +31 055 $** de patrimoine à 10, 20 et 30 ans. Un stock fiscal (ACB,
  report, crédit inutilisé) ne coûte rien tant qu'il n'est pas RÉALISÉ — avant de le traduire en
  dollars, demander quand et dans quelle proportion il se réalise ; la grandeur qui approche le coût
  plein est la SUCCESSION, qui liquide tout. ⚠️ Garde : ancrer sur la RELATION, jamais sur une valeur
  de fixture supposée — mon 1er jet asserait 7 500 $ d'après les soldes de DÉPART, or le premier
  décembre n'en voit que 178 587 $. ⚠️ Deux perturbations aux signatures DISTINCTES prouvent la
  couverture des deux moitiés (module → 4 rouges, appelant → 2). ⚠️ Et 2ᵉ lot d'affilée où le
  correctif juste IMITE un jumeau déjà présent dans le fichier (`processGainHarvesting` rend déjà un
  delta d'ACB) (`UN-ACB-MANQUANT-N-EST-PAS-UN-IMPOT-PAYE`, 2026-09-03).
  ⚠️⚠️ **« Re-base MASSIF de goldens » annoncé par le ticket = 5 assertions dans 4 fichiers.**
  L'avertissement d'un ticket sur le COÛT d'un lot se re-mesure comme son défaut : il dimensionne la
  décision de le prendre, et celui-là aurait pu faire renoncer à un correctif d'une ligne. ⚠️ Deux
  des cinq s'intitulaient « NEUTRALITÉ NW » — un titre de CONCEPTION, qu'on ne re-base pas. C'est le
  test lui-même qui a tranché : il porte quatre re-bases antérieures annotées « vrai changement
  fiscal, PAS une fuite de compteur — la neutralité reste garantie par l'identité `ttp == Σ
  FluxImpots` ». **Un golden bien écrit dit à quelles conditions il se re-base ; le lire bat tout
  raisonnement sur son titre.** ⚠️ Et `toBe` INTERROMPT le cas : trois ancres ne sont apparues
  qu'après réparation des précédentes — un premier gate rouge SOUS-COMPTE les re-bases.
- **Retirer un réglage nuisible exige de neutraliser sa valeur PERSISTÉE** : supprimer le seul bouton
  « T1213 » aurait laissé toute config déjà à `true` bloquée avec −45,7 % de patrimoine **et sans
  plus aucun moyen de revenir en arrière** — l'interface qui le permettait venait de disparaître. Le
  correctif est la PAIRE (retirer le bouton ET faire ignorer la valeur par le moteur) ; le champ reste
  `@deprecated` dans le type, car le supprimer exigerait une migration du schéma persisté — un risque
  sur les données pour un gain nul. Même mécanisme que le repli persisté de `grossSalary` : **avant de
  livrer le retrait d'un réglage nuisible, demander si sa mauvaise valeur a été SAUVEGARDÉE.**
  ⚠️ L'inventaire de dette du lot 114 s'est INVERSÉ au même endroit (« ça coûte −45,7 % » → « ça ne
  change plus rien »), avec l'histoire dedans. ⚠️ Corollaire de conduite : sur huit décisions posées
  à Marc, **deux ont divergé de ma recommandation** — une recommandation sert à rendre le choix
  rapide, pas à le pré-décider ; et deux réponses ont ouvert une SOUS-question non anticipée (valeur
  persistée, texte de consentement) : une décision produit n'est complète que quand ses conséquences
  irréversibles sont sur la table
  (`RETIRER-UN-REGLAGE-NUISIBLE-EXIGE-DE-NEUTRALISER-SA-VALEUR-PERSISTEE`, 2026-09-03).
- **Un plafond de ratchet qui a cessé de suivre son compte n'est plus une protection** : le ratchet
  des décommenteurs portait `PLAFOND = 15`, mesuré et daté. Compte réel re-mesuré : **1** — quatorze
  migrations faites par d'autres lots sans que le plafond suive, donc **quatorze régressions
  silencieuses autorisées**. Pire qu'absent : il porte le nom d'une protection et compte comme telle
  dans tout inventaire (variante par DÉRIVE de `UNE-GARDE-QUI-NE-PEUT-PAS-TIRER…`). Un ratchet se
  RE-COMPTE, il ne se relit pas — et le geste est dans la garde : forcer le plafond à 0 imprime la
  liste. ⚠️⚠️ **Descendre un plafond à ZÉRO crée un trou à fermer dans le MÊME lot** : tant qu'un
  offender subsiste, il prouve incidemment que le détecteur marche ; à zéro, « aucun trouvé » devient
  indistinguable de « motif cassé ». Anti-vacuité EXPLICITE obligatoire, prouvée par perturbation.
  ⚠️ Et le seul site restant était un faux offender STRUCTUREL — une garde qui cherche des
  décommenteurs doit en écrire un
  (`UN-PLAFOND-DE-RATCHET-QUI-A-CESSE-DE-SUIVRE-SON-COMPTE-N-EST-PLUS-UNE-PROTECTION`, 2026-09-03).
- **Un ORDRE écrit dans un ticket est une photo datée** : `[ENG-RANKING-ORDER-PIN]` fournissait « LA
  baseline à pinner » (balanced : MELTDOWN > PRIO_REER > AUTO). Re-mesuré, deux stratégies non
  comparées par le ticket s'intercalent et PRIO_REER change de rang. Un ordre est une propriété de
  l'ENSEMBLE comparé : il bouge dès qu'un lot déplace de l'argent — et il y en avait un le jour même.
  « Le périmètre d'un ticket se RECENSE » vaut aussi pour ses BASELINES. ⚠️ Épingler l'ORDRE, jamais
  les SCORES (un min-max bouge au centième ; l'ordre est ce que l'utilisateur voit), et écrire dans
  le fichier que la garde est FAITE pour rougir — ce qu'elle interdit est le basculement SILENCIEUX.
  ⚠️ Et **un rouge ABSENT est une mesure** : inverser le sens de l'impôt ne retourne pas `balanced`,
  parce qu'il est dominé par le poids `estate` (0,4 vs 0,25). Une perturbation qui ne rougit pas là
  où on l'attendait apprend la structure du modèle — demander POURQUOI avant de renforcer
  l'assertion (`UN-ORDRE-ECRIT-DANS-UN-TICKET-EST-UNE-PHOTO-DATEE`, 2026-09-03).
- **Un ticket qui n'annonce qu'un MONTANT ne dit pas sa gravité** : `[ENG-T1213-NET-MONTHLY]` portait
  « MOYEN, −183 598 $/30 ans ». Re-mesuré à quatre horizons : **−16,1 % à 5 ans, −24,5 % à 10,
  −29,2 % à 20, −45,7 % (−1 031 419 $) à 30** — cinq fois le chiffre annoncé, et un POURCENTAGE qui
  grandit (une économie fiscale annuelle qu'on cesse de capitaliser compose par construction).
  `UN-BIAIS-QUI-COMPOSE-N-EST-PAS-UN-BIAIS-FIXE` disait de mesurer à ≥3 horizons avant de CLASSER ;
  le symétrique est que **devant un ticket déjà classé, un montant seul signale qu'on ne l'a mesuré
  qu'une fois**. ⚠️ Et un défaut ATTEIGNABLE PAR UN CLIC (ici un bouton des réglages avancés, que
  l'utilisateur active en croyant s'optimiser) mérite un cran de plus qu'un défaut subi — il ne
  saura jamais que c'est le bouton qui a coûté la moitié de sa projection. ⚠️ Signal écarté en
  chemin : `totalTaxesPaid` NÉGATIF est déjà documenté sous `[PROJ-TAXPAID-LABEL]` — grepper le nom
  avant d'écrire un second ticket
  (`UN-TICKET-QUI-N-ANNONCE-QU-UN-MONTANT-NE-DIT-PAS-SA-GRAVITE`, 2026-09-03).
- **Un accumulateur ANNUEL se juge sur sa position par rapport à son RESET, jamais dans l'absolu** :
  le revenu gagné était versé avant le bloc de janvier, donc janvier entrait dans l'année qui venait
  de se clore (13 mois la 1re année, +8,33 % de droits REER). ⚠️ Le ticket sous-estimait son défaut —
  « fenêtre glissante de 12 mois ensuite » n'est pas neutre : février→janvier est en avance d'un mois
  et gonfle l'assiette de tout salaire qui CROÎT (**≈ 0,25 %/an** mesuré à 3 %), et j'avais classé ça
  « second ordre » d'après le cas à croissance NULLE, où c'est strictement invisible. ⚠️ Le correctif
  juste ALIGNE deux producteurs du même registre (le congé parental versait déjà après janvier) —
  chercher le jumeau AVANT de déplacer quoi que ce soit dans une boucle moteur. ⚠️ Élargissement
  plausible ÉCARTÉ par la mesure : `accCapitalGainsYear` est aussi alimenté avant janvier mais est
  accumulé, imposé ET remis à zéro dans le bloc de DÉCEMBRE — la question n'est pas « où est-il
  alimenté ? » mais « où est son reset, et qui le lit entre les deux ? ». ⚠️ Capteur : deux mesures
  indirectes ont échoué (`REERMax` est CONSOMMÉ par les cotisations) — un ARGUMENT s'OBSERVE par
  espion. ⚠️ Et « patrimoine identique » signifiait « les droits ne limitent rien ici » (6 000 $
  cotisés contre 18 000 $) : sur une fixture qui sature, **−311 $ à −411 $**
  (`UN-ACCUMULATEUR-ANNUEL-SE-JUGE-SUR-SA-POSITION-PAR-RAPPORT-A-SON-RESET`, 2026-09-03).
  ⚠️⚠️ **Trois goldens rouges, DEUX natures** : deux ÉPINGLAIENT le défaut (`200_004 * 13 / 12`, avec
  l'ID du ticket en commentaire — un inventaire de dette qui rougit quand la dette est payée) ; le
  troisième était une ancre de valeur qui a **MONTÉ** de 1 177 $ alors qu'un correctif retirant des
  droits devrait tout baisser. Mesuré : `finalNetWorth` **−1 769 $**, `estateNetWorth` **+1 177 $** —
  moins de REER cotisé = moins d'abri fiscal (patrimoine ↓) mais aussi moins de REER à LIQUIDER au
  décès (succession ↑). **Une grandeur nette d'impôt latent et une grandeur brute ne bougent pas dans
  le même sens** ; un re-basement mécanique aurait enterré ça. ⚠️ Et ma 1re mesure avant/après a
  restauré `HEAD` — or le correctif y était DÉJÀ commité (règle « committer avant le gate ») : deux
  colonnes rigoureusement identiques accusent d'abord le PROTOCOLE, la référence est `HEAD~1`.
- **Une mesure avant/après par RACCOURCI DE PARAMÈTRE déplace deux grandeurs** : pour chiffrer la
  prime SCHL absente de `runAmortization`, rappeler la fonction avec `price + prime` (au lieu
  d'écrire le correctif) a rendu l'équité **plus haute** — `price` pilote le principal emprunté ET
  la valeur du bien. Le raccourci finançait la prime et offrait un bien qui vaut la prime de plus ;
  seul le SIGNE inattendu a démasqué la mesure, et il n'aurait rien dit si les deux effets avaient
  poussé dans le même sens. Mesuré correctement : surestimation de **15 631 $ / 14 137 $ / 11 798 $**
  à 1, 5 et 10 ans, **0 $ exactement** à 20 % de mise (contrôle négatif). ⚠️ Le piège se GARDE, pas
  seulement se note — l'assertion « la valeur du bien reste `prix × croissance` » a pour perturbation
  exactement le raccourci que j'avais pris. ⚠️ Et deux tests à mise ASSURABLE sont restés verts : l'un
  n'asserte que des SIGNES, l'autre épingle l'année d'achat, qui ne passe pas par la fonction — c'est
  l'EXPLICATION, pas le vert, qui autorise à livrer
  (`UNE-MESURE-AVANT-APRES-PAR-RACCOURCI-DE-PARAMETRE-DEPLACE-DEUX-GRANDEURS`, 2026-09-03).
- **Une GRAVITÉ classée depuis un PROFIL n'est pas une gravité** : `FISCAL_REFERENCE.md` classait le
  versement RAP manqué « LOW assumée (impact borné pour les profils qui gardent des liquidités) » — la
  parenthèse EST l'aveu que la mesure a été faite sur le profil de Marc. Sur un profil ordinaire
  (60 k$, condo 420 k$), **190 à 205 versements sautés sur 205**, 63 333 $ à 68 333 $ jamais imposés,
  patrimoine final surévalué de **18 121 $ à 19 864 $** ; sur le profil confortable, **0 $ exactement**
  (contrôle négatif). Quand la justification d'une gravité porte une CONDITION sur l'utilisateur
  (« pour les profils qui… », « tant que… »), cette condition NOMME la fixture où le défaut est
  invisible : la mesure qui compte est celle qui la viole. ⚠️ Corollaires : **une branche vide cache
  souvent DEUX défauts** (ici l'imposition ET l'amortissement du solde — 205 mois dus pour une
  obligation de 180, la dette ne s'éteignait jamais) ; un canal d'imposition qui « marcherait » n'est
  pas le bon si les SENS diffèrent (registre dédié, parce qu'un RAP manqué n'a ni mouvement d'argent
  ni retenue à la source) ; et **un champ ABSENT d'une fixture donne `NaN` dans une comparaison, donc
  `false`, donc un chemin jamais emprunté sans la moindre trace** — `totalClosingCosts` oublié m'a
  fait mesurer « zéro RAP » et failli publier « chemin inatteignable »
  (`UNE-GRAVITE-CLASSEE-DEPUIS-UN-PROFIL-N-EST-PAS-UNE-GRAVITE`, 2026-09-03).
- **Un no-op COMMENTÉ est une décision à relire avant de la défaire** : `addExpense: (_n) => {}`
  dans le mutateur d'objectifs porte « déjà soustrait du compte ciblé ». Le rendre effectif paraît
  être LE correctif du registre qui sous-compte — il soustrairait le montant une SECONDE fois du
  flux réel, `monthlyExpenses` alimentant `monthlyCashflow`. ⚠️ Et la consigne du ticket (« vérifier
  qui LIT ce champ avant de corriger ») a produit les deux résultats : le seul lecteur est le **SWR**,
  qui n'a aucun consommateur d'écran — donc coût NUL aujourd'hui, mais un SWR sous-estimé demain est
  un plan qui a l'air plus sûr qu'il ne l'est. « Qui lit ? » ne répond pas par oui/non : elle répond
  *aujourd'hui rien, demain grave*, et c'est ce qui impose un INVENTAIRE plutôt qu'un correctif
  (`UN-NO-OP-COMMENTE-EST-UNE-DECISION-A-RELIRE-AVANT-DE-LA-DEFAIRE`, 2026-09-03).
- **Un throttle sans horloge est un silence DÉFINITIF** : `logErrorThrottled` gardait ses signatures
  dans un `Set` jamais purgé côté navigateur — « une fois par rafale » devenait « une fois par
  session », et une corruption qui RÉCIDIVE dans un onglet ouvert des jours était muette. Le serveur
  MCP n'avait pas le défaut (reset à chaque requête) ; côté navigateur **aucune occasion commune
  n'existe** (un hook, une valorisation, une hydratation — aucun ne passe par la boucle de
  projection), ce qui impose une fenêtre de TEMPS. Valeur DÉRIVÉE d'une mesure : rafale de 10 000
  appels en **2,7 ms**, fenêtre à 60 s. ⚠️⚠️ Et une perturbation qui ne change que la LECTURE d'une
  paire lecture/écriture ne teste pas son nom : `get('*')` avec une écriture restée par signature ne
  trouvait plus rien, donc dupliquait « throttle supprimé » au lieu de tester la clé PAR SIGNATURE —
  une clé se perturbe PARTOUT où elle est employée
  (`UN-THROTTLE-SANS-HORLOGE-EST-UN-SILENCE-DEFINITIF`, 2026-09-03).
  ⚠️ Corollaire de PROCÉDURE : les vérifs ciblées se lancent **APRÈS la DERNIÈRE édition**. J'avais
  lancé `typecheck` après avoir modifié le module, puis écrit le fichier de test sans le relancer —
  et **vitest ne typecheck pas**. Le gate a rougi sur une union fermée dont j'avais inventé un
  membre. Rien de perdu (le travail était poussé), mais un aller-retour évitable.
- **Un chiffre qui sert de DÉNOMINATEUR n'est pas un chiffre AFFICHÉ** : un ticket décrivait « deux
  net qui coexistent à l'écran » et prescrivait « une mention de provenance sur chacun ». Recensé :
  le second n'est JAMAIS affiché comme montant — ses trois usages sont des dénominateurs (un badge
  « Effort : X % », deux largeurs de barre). Le correctif prescrit était inapplicable, et le vrai
  défaut plus discret : un POURCENTAGE calculé sur une autre base que le net affiché juste au-dessus,
  dans la même carte. « Deux valeurs coexistent » ≠ « deux valeurs sont affichées » — la question qui
  tranche est : *puis-je les pointer toutes les deux sur une capture d'écran ?* ⚠️ Et son écart
  chiffré (« 154 $, 3,1 % ») était une valeur de FIXTURE : mesuré sur quatre paires, il change de
  SIGNE (−0,3 % à +3,5 %) — il mesure la distance entre la paie réelle et le modèle, pas un biais
  (`UN-CHIFFRE-QUI-SERT-DE-DENOMINATEUR-N-EST-PAS-UN-CHIFFRE-AFFICHE`, 2026-09-03).
- **L'ALARME d'un ticket se re-mesure autant que son DÉFAUT** : un ticket portait les deux — « ce
  champ ne pilote rien » (exact, vérifié en le triplant : patrimoine identique au dollar près) et
  « des dizaines de fixtures tournent sur les défauts sans le savoir » (FAUX : 72 fichiers posent le
  champ, 69 posent aussi la carte, et par SITE il en reste 3, tous légitimes). Le défaut décrit un
  MÉCANISME, stable ; l'alarme décrit une POPULATION, qui bouge à chaque lot sans que personne
  touche au ticket — et c'est elle qui dimensionne le lot. **Mesurer par SITE, pas par FICHIER.**
  ⚠️ La moitié prouvable se livre (une garde qui FIGE le fait, pour qu'un câblage futur soit
  délibéré), la décision se route quand elle change ce que l'utilisateur voit
  (`L-ALARME-D-UN-TICKET-SE-REMESURE-AUTANT-QUE-SON-DEFAUT`, 2026-09-03).
- **Une affirmation JURIDIQUE non citée hérite de l'autorité du document** : la leçon jumelle
  (`ECRIRE-UN-CHIFFRE-FISCAL-SANS-LE-MESURER…`) visait un CHIFFRE ; une PHRASE non sourcée est plus
  discrète — aucun ratchet ne la cherche, et dans `FISCAL_REFERENCE.md` elle emprunte l'autorité de
  ce qui l'entoure. Test : cette phrase décrit-elle ce que quelqu'un a MESURÉ, ou ce que la loi
  PRESCRIT ? ⚠️ Citer était la bonne réponse et l'ENVIRONNEMENT l'a interdite (LégisQuébec
  `EGRESS_BLOCKED`) : livrer la seconde option ET consigner la tentative avec sa cause, sinon la
  prochaine session la retente à l'aveugle ou la déclare impossible. ⚠️ Le ticket annonçait deux
  sites, il y en avait TROIS — le troisième était **sa propre note**, qui répétait l'affirmation au
  présent. ⚠️ Et ma garde exigeait la phrase dans CHAQUE fichier de sa liste : mesuré, elle
  rougissait sur un retrait PARTIEL parfaitement sain. La liste se DÉRIVE des sites qui la portent ;
  retrait partiel → vert, retrait total → « retire cette garde »
  (`UNE-AFFIRMATION-JURIDIQUE-NON-CITEE-HERITE-DE-L-AUTORITE-DU-DOCUMENT`, 2026-09-03).
- **Avant d'unifier N copies, séparer ce qui est PARTAGÉ de ce qui ne l'est pas** : un ticket
  signalait cinq copies d'un patron d'indexation et, comme une alarme, qu'« un site diverge ». Le
  réflexe — aligner — aurait été une RÉGRESSION : une extrapolation porte deux paramètres, la
  VITESSE et l'ANCRE, et seule la vitesse était commune (quatre sites partent de l'année courante,
  le cinquième d'une table qui s'arrête à sa dernière année publiée). Les aligner aurait re-fabriqué
  la marche de +4,54 % que `UNE-ANCRE-D-EXTRAPOLATION-EN-DUR-FABRIQUE-UNE-MARCHE` venait de
  corriger — le même défaut payé deux fois, la seconde au nom de la déduplication. La source unique
  n'expose que la vitesse ; l'ancre reste un ARGUMENT
  (`AVANT-D-UNIFIER-N-COPIES-SEPARER-CE-QUI-EST-PARTAGE-DE-CE-QUI-NE-L-EST-PAS`, 2026-09-03).
  ⚠️⚠️ **« Committer avant toute attente longue » INCLUT le gate complet** : un redémarrage de
  conteneur pendant les ~10 min du gate a restauré une branche périmée et effacé ce lot entier, qui
  a dû être réécrit. La règle était en §11, lue et mal cadrée — je la réservais aux attentes
  d'agents. Le gate est la plus longue attente du cycle. Ordre correct : vérifs CIBLÉES (typecheck +
  gardes neuves + ratchet) → commit → push → gate complet
  (`COMMITTER-AVANT-TOUTE-ATTENTE-LONGUE-INCLUT-LE-GATE`).
- **Une garde de CHAÎNE se pose sur une PENTE, pas sur un montant** : le ticket demandait un golden
  pour le plafond RQAP ; un golden épingle des nombres et se fait re-baser à la première indexation.
  Ce que le plafond produit d'observable est un CHANGEMENT DE RÉGIME — sous le plafond la prestation
  suit le salaire (0,291 $ par dollar de brut, mesuré), au-dessus elle est figée et chaque dollar est
  perdu en entier (0,700, le taux net de la fixture) ; le RAPPORT des pentes (2,40) est la signature,
  et il survit à l'indexation. ⚠️ Le moteur ne publie pas la prestation séparément : devant un champ
  non publié, mesurer ce que sa présence CHANGE dans un champ qui l'est (une différence, puis sa
  dérivée), jamais reconstruire le calcul dans le test
  (`UNE-GARDE-DE-CHAINE-SE-POSE-SUR-UNE-PENTE-PAS-SUR-UN-MONTANT`, 2026-09-03).
- ⚠️⚠️ **Corriger le FORMAT d'un montant RÉVÈLE sa fuite de vie privée** : les deux montants de
  `ChildPlanning` migrés vers `formatCAD` n'étaient pas enveloppés dans `<PrivateAmount>` et
  restaient lisibles en mode discret — ils échappaient à `amountPrivacyScan` tant qu'ils étaient
  composés À LA MAIN, puisqu'elle cherche le FORMATEUR. Les deux défauts sont le même trou vu deux
  fois, et le second n'apparaît qu'une fois le premier réparé. ⚠️ Même lot : un lot de FORMAT a rendu
  FANTÔME une entrée de l'inventaire FISCAL (le fragment de libellé « 250 000$ »). **Un lot qui
  touche au format se juge sur le gate COMPLET** : mes propres gardes étaient toutes vertes, ce sont
  deux gardes écrites par d'autres lots qui ont trouvé les vrais défauts.
- **Un périmètre recopié d'un AGENT est faux dans les DEUX sens** : la liste que j'avais portée au
  BACKLOG sur-comptait `applyDocument.ts` « ×11 » (les onze vivaient dans des COMMENTAIRES —
  `SCAN-QUI-MATCHE-LA-PROSE`, 5ᵉ fois, commis par l'agent et importé par moi) ET sous-comptait six
  sites qu'elle ne nommait pas, plus deux formes que son motif ne pouvait pas voir (`${x} $` avec
  espace, et un LITTÉRAL `+250 000$`). ⚠️ Et le vrai résultat d'un recensement n'est pas un nombre
  mais une **PARTITION** : sur 19 lignes, 2 faux positifs, 4 vrais sites d'écran/journal, et 17 de
  texte destiné à un MODÈLE — dont l'arrondi à 100 $ est DÉLIBÉRÉ et promis dans le texte de
  consentement. « `formatCAD` UNIQUEMENT » a été écrite pour des écrans ; un prompt n'en est pas un
  (`UN-PERIMETRE-RECOPIE-D-UN-AGENT-EST-FAUX-DANS-LES-DEUX-SENS`, 2026-09-03).
- **Un inventaire qui atteint ZÉRO s'INVERSE en règle, il ne se supprime pas** : le compteur du lot
  100 portait « dette à zéro → retire cette garde », et cette assertion a rougi quand la dette a été
  payée — elle a fonctionné. Mais l'exécuter à la lettre aurait rouvert en silence la porte que trois
  lots venaient de fermer : ce qui meurt est l'INVENTAIRE (« combien reste-t-il ? »), ce qui reste est
  la RÈGLE (« plus jamais »). Une consigne que je me suis écrite à moi-même dans un message
  d'assertion se re-juge, elle ne s'exécute pas. ⚠️ **Le membre déviant se compte** : 18 des 19 appels
  du formateur maison portaient un « $ » posé à la main, 1 n'en portait pas — un remplacement global
  aurait doublé le symbole 18 fois ou en aurait ajouté un jamais eu. ⚠️⚠️ Et j'ai écrit l'avertissement
  sur l'insécable puis commis l'erreur : un attendu NÉGATIF se compose avec le formateur autant que le
  positif — `` `${formatNumber(n)} $` `` (espace ordinaire) ne matche RIEN, donc la perturbation
  restait verte (`UN-INVENTAIRE-QUI-ATTEINT-ZERO-S-INVERSE-EN-REGLE`, 2026-09-03).
- **Une garde qui épingle QUI est offender rougit sur sa propre réparation** : le lot 100 asserait
  « `cashflowAllocation` et `taxDecember` figurent parmi les offenders » ; les corriger — ce que ce
  lot préparait — l'a fait rougir. Elle ancrait la FORME au lieu du FAIT (« ces modules sont
  BALAYÉS »), et s'est INVERSÉE au même endroit plutôt que d'être supprimée. Une garde qui nomme des
  coupables se périme au premier correctif ; une garde qui nomme un périmètre survit. ⚠️ Et
  « toute la suite est verte » sur 65 chaînes de log réécrites était le résultat à EXPLIQUER : ça
  mesurait qu'AUCUN test n'assertait leur texte — d'où une garde comportementale sur un producteur
  réel. ⚠️ Retirer le `Math.round` « redondant » devant `formatCAD` aurait DÉPLACÉ des montants
  (mesuré : divergence sur 4 valeurs de 11, tous les demis NÉGATIFS — Intl arrondit à l'opposé de
  zéro, `Math.round` vers +∞)
  (`UNE-GARDE-QUI-EPINGLE-QUI-EST-OFFENDER-ROUGIT-SUR-SA-PROPRE-REPARATION`, 2026-09-03).
- **Un seuil écrit AVANT sa mesure est un chiffre INVENTÉ** : le scan du lot 100 a coûté trois
  chiffres devinés d'affilée dans le même fichier — inventaire annoncé `≤ 34` (mesuré **67**), seuil
  d'anti-vacuité à `0,45` sur un ratio qui ne mesurait rien, puis à `0,9` (mesuré **0,583** : ces
  fichiers sont à 42 % de commentaire). Aucun n'était un calcul faux, les trois étaient des ATTENTES
  — et une attente écrite dans un `expect` a l'apparence d'une mesure. Le nombre s'obtient d'abord,
  l'assertion s'écrit ensuite, la mesure s'écrit À CÔTÉ du seuil avec sa date. ⚠️ Et **un remède
  juste pour une CLASSE peut être faux pour un MEMBRE** : « remplacer par `formatCAD` » a raison
  66 fois sur 67 et tort sur un prix en devise NATIVE suivi de son code (« 1 234,56 $ USD ») — le
  membre déviant ne se signale par aucune différence de SYNTAXE, seulement par ce que la valeur EST
  (`UN-SEUIL-ECRIT-AVANT-SA-MESURE-EST-UN-CHIFFRE-INVENTE`, 2026-09-03).
  ⚠️⚠️ Corollaire trouvé par le panel DANS cette garde : `RECEPTEUR_DATE` écrivait `[Tt]s`, donc
  `debts`, `assets`, `amounts`, `results` — les noms monétaires les plus courants du dépôt —
  étaient classés « date » et n'entraient jamais dans l'inventaire. Aucune occurrence du jour ne
  l'exploitait, ce qui le rendait invisible : **une garde se relit sur les noms que le dépôt
  EMPLOIE, pas sur ceux qu'elle a croisés**, et un faux négatif SILENCIEUX ne se traite pas au
  même titre qu'un faux positif bruyant. ⚠️ Et un témoin de perturbation qui ne contient pas la
  valeur rendant la condition vraie (un `{suffixe}` JSX là où il fallait un `${` de gabarit) ne
  mesure rien.
- **Un chiffre JUSTE peut être illisible, et le correctif est une PHRASE** : la « chute de 10k »
  signalée par Marc n'était pas une erreur — le dernier point du passé DÉFAIT les flux du jour, donc
  les deux points sont exacts. Lisser aurait affiché un solde jamais eu. Devant « ce chiffre est
  bizarre », demander d'abord s'il est FAUX ou seulement ILLISIBLE : mêmes mots, correctifs opposés.
  Le fait vient du module qui le PRODUIT (jamais une seconde somme), la phrase ne porte AUCUN montant
  (plus masquable une fois interpolé), et elle dit le SENS. ⚠️ Deux leçons du dépôt se sont
  contredites sur ce lot — « livrer la moitié prouvable » contre « ne pas exposer un champ sans
  consommateur » : la seconde gagne, sa transgression étant SILENCIEUSE
  (`UN-CHIFFRE-JUSTE-PEUT-ETRE-ILLISIBLE`, 2026-09-03).
- **Un champ SANS LECTEUR ne se corrige pas en lui donnant une SAISIE** — image miroir de
  `UN-CHAMP-TYPE-SANS-PRODUCTEUR`, et le réflexe qu'elle déclenche est le mauvais : trois champs de
  `Debt` absents du formulaire n'étaient lus par PERSONNE (les accès homonymes portaient sur un
  immeuble locatif, un prompt IA, un payload d'écriture). Leur ajouter une saisie aurait promis un
  effet inexistant. Devant un champ absent de l'UI, demander « qui le LIT ? » avant « pourquoi ne
  peut-on pas le saisir ? ». ⚠️ Et un champ mort ENTOURÉ de validations (4 producteurs, refus
  d'ingestion, schéma MCP) a l'apparence d'un mécanisme vivant
  (`UN-CHAMP-SANS-LECTEUR-NE-SE-CORRIGE-PAS-EN-LUI-DONNANT-UNE-SAISIE`, 2026-09-03).
- **Une leçon se recopie avec sa PRÉMISSE, ou pas du tout** : j'ai porté dans l'UI la garde du lot
  précédent (« juger la cohérence sur les valeurs EFFECTIVES »), avec son commentaire et sa
  référence — perturbation faite, 13 tests verts : le brouillon d'édition n'est JAMAIS partiel
  (`setDraft({ ...d })`), contrairement au payload MCP. La règle était bonne, son domaine s'arrêtait
  là-bas. Garder la précaution, l'ÉCRIRE comme telle, et faire porter au test le FAIT plutôt que le
  mécanisme. ⚠️ Même lot : un test bâti sur une prémisse fausse (« les deux formulaires coexistent »
  — `startEdit` ferme l'ajout), et un DÉCOUPAGE prescrit par un ticket qui aurait dupliqué cinq
  champs communs au lieu d'extraire la paire manquante
  (`UNE-LECON-SE-RECOPIE-AVEC-SA-PREMISSE-OU-PAS-DU-TOUT`, 2026-09-02).
- **Un trou entre deux moitiés testées n'appartient à personne** : le lot 92 était vert de bout en
  bout (37 gardes, CI verte, déployé) et ne changeait RIEN à l'écran — aucun producteur n'écrivait le
  champ qui l'active. Le service était testé chez lui, l'ingestion chez elle, le CHAÎNON n'était le
  sujet d'aucun fichier. Parade : une garde qui TRAVERSE (entrée la plus amont → écriture réelle →
  grandeur la plus aval, sans reconstruire un maillon) plus son CONTRÔLE NÉGATIF, sinon elle prouve
  « la chaîne marche » et non « c'est ce lot qui la débloque ». ⚠️ Une perturbation MUETTE accuse
  d'abord la perturbation, ensuite la fixture, et seulement en dernier la garde — mesuré sur une
  chaîne concaténée dont je n'avais remplacé que le premier fragment
  (`UN-TROU-ENTRE-DEUX-MOITIES-TESTEES-N-APPARTIENT-A-PERSONNE`, 2026-09-02).
- **Le lot qui change ce qu'un écran MONTRE périme ce qu'il AFFIRME** : brancher l'amortissement du
  passé a rendu FAUX le bandeau « dettes au niveau actuel », phrase exacte depuis toujours, non
  touchée par le diff, couverte par aucun test — rien ne pouvait rougir. Après tout changement de
  calcul, demander ce que légendes, titres, infobulles et états vides PROMETTENT à son sujet ; la
  phrase sort du JSX vers un module pur, son fait se dérive du module qui DÉCIDE (jamais d'une
  seconde lecture des champs), et une garde JUMELLE interdit de la recopier dans le rendu
  (`UN-LOT-QUI-CHANGE-CE-QU-UN-ECRAN-MONTRE-PERIME-CE-QU-IL-AFFIRME`, 2026-09-02).

Quand une tâche touche un de ces terrains, **lire la section correspondante avant de coder**.

- ⚠️ Avant d'écrire « le ticket se trompe », vérifier qu'on mesure **la MÊME GRANDEUR, dans la même
  unité** : j'allais déclarer `[GROSSFROMNET-CREDITS-65]` sous-estimé d'un facteur 1,6 en mesurant
  côté BRUT, alors qu'il annonçait — et nommait — un écart en NET. Mesuré dans son unité, il était
  exact au dollar près sur trois points. Le biais à surveiller est celui que la série installe : six
  réfutations d'affilée créent une attente de réfutation. Re-mesurer protège de la confiance aveugle
  dans les tickets, pas de la confiance aveugle dans ses propres mesures. Une mesure qui CONFIRME se
  publie autant qu'une réfutation (`NE-PAS-DECLARER-UN-TICKET-FAUX-SANS-COMPARER-LA-MEME-GRANDEUR`).
- Un **test de LIMITE s'INVERSE, il ne se supprime pas** : quand Marc a levé le gel du taux de marge
  Smith, la garde qui affirmait « l'intérêt ne suit PAS le taux » est devenue son exact opposé au même
  endroit, avec son histoire écrite dedans. Supprimée, elle laisserait croire que la limite n'a jamais
  existé — or c'est cette trace qui empêche de la re-geler « pour simplifier ». Corollaire : une
  fixture qui COÏNCIDE avec la valeur figée (`mortgageRate: 5` contre une marge figée à 5 %) ne
  discrimine rien, et la levée du gel le prouve en la faisant enfin rougir
  (`UN-TEST-DE-LIMITE-S-INVERSE-IL-NE-SE-SUPPRIME-PAS`).
- « Le paquet runtime est-il utilisé ? » et « son paquet de TYPES sert-il à quelque chose ? » sont
  deux questions DISTINCTES : `adm-zip` est bien vivant (`mcp/pack.mjs`), mais ce consommateur est un
  `.mjs` que `allowJs: true` SANS `checkJs` n'a jamais typé — les types ne servaient à personne. Se
  tranche par l'EXPÉRIENCE (retirer + relancer `typecheck`), jamais en raisonnant sur la config. Et un
  lot peut finir SANS test neuf, à condition de dire quel mécanisme existant tient le rôle — ici `tsc`
  lui-même (`UN-PAQUET-DE-TYPES-N-EST-UTILE-QUE-SI-QUELQUE-CHOSE-EST-TYPE`).
- Quand deux configurations qui DEVRAIENT différer rendent la MÊME sortie, se demander **quelle
  contrainte sature** avant de conclure « le mécanisme n'existe pas » : un surplus de 29 k$/an contre
  un plafond CELI de 8,5 k$ remplissait les deux comptes de toute façon, rendant l'ORDRE de cotisation
  inobservable — j'ai conclu trois fois de suite que la bascule `AUTO_MARGINAL` était morte, elle
  basculait bien à l'année 9. Un mécanisme n'est observable que là où il est LIMITANT ; la contrainte
  saturante s'écrit DANS la fixture avec son chiffre. Symétrique de `UN-TEST-QUI-ECHOUE-N-A-PAS-FORCEMENT-RAISON` :
  un test qui PASSE n'a pas forcément raison. L'assertion qui sauve est celle qui vérifie qu'un LEVIER
  change quelque chose — elle rougit exactement quand la mesure devient vacueuse
  (`UNE-FIXTURE-QUI-SATURE-LA-CONTRAINTE-REND-LA-MESURE-AVEUGLE`).
- **Un écart mesuré à UN point de temps ne dit rien de sa nature** : « 0,4 % dès 2027 » avait classé
  un ticket FAIBLE, alors que l'écart COMPOSE (il vient d'une indexation ignorée) — mesuré 1,0 % en
  2027, 4,4 % en 2030, **11,1 % en 2035**. Avant de classer, demander ce qui fait GRANDIR l'écart ;
  si c'est un facteur annuel, mesurer à ≥3 horizons et classer sur la trajectoire. Même geste que
  `UN-FACTEUR-PLAT-SUR-UNE-RELATION-CONVEXE`, appliqué à l'axe du TEMPS
  (`UN-BIAIS-QUI-COMPOSE-N-EST-PAS-UN-BIAIS-FIXE`). ⚠️ Et TROISIÈME récidive de
  `SCAN-QUI-MATCHE-LA-PROSE` en une session (littéral de chaîne, message utilisateur, puis
  commentaire) : toute assertion de COMPTE ou d'ABSENCE sur du source passe DÉSORMAIS par un lecteur
  décommenté avec son anti-vacuité — étape obligatoire, plus un piège à retenir.
- Un **flake non reproduit** ne se solde ni en le taisant ni en le laissant ouvert : on rend sa
  PROCHAINE occurrence auto-explicative. Réfuter les hypothèses une par une PAR LA MESURE (ici :
  `fileParallelism: false` tue le parallélisme, durées en suite = durées en isolation, RNG graine +
  zéro `Date` dans la chaîne, marge 1,132 contre un seuil de 0,5) laisse un seul mécanisme — une
  grandeur ABSENTE. ⚠️ `?? NaN` sur une valeur annulable transforme « pas de mesure » en « écart de
  valeur » et fait accuser le moteur : exiger la mesure AVANT de comparer, et le prouver en forçant
  l'absence (`UN-FLAKE-NON-REPRODUIT-SE-SOLDE-EN-RENDANT-SA-PROCHAINE-OCCURRENCE-LISIBLE`).
- Un test E2E qui lit un état **une seule fois** après avoir déclenché quelque chose ne teste pas ce
  qu'il annonce : il teste que la latence de l'OUTIL dépasse celle de l'app. `futurePinchZoom` ne
  passait que parce que le bouton se DÉTACHE pendant le recalcul, forçant Playwright à re-résoudre —
  la bascule mesurée met **2,1 à 2,3 s** (rAF + re-tranchage + rendu), pas une frame. Les deux sens
  ne se corrigent pas pareil : « l'état a CHANGÉ » → `expect.poll` ; « l'état n'a PAS changé » →
  lecture APRÈS le budget mesuré (un `poll` y serait satisfait par l'état d'avant, donc vacueux).
  Et un flake qui refuse de se rejouer n'est pas sans mécanisme : c'est une COURSE non encore mesurée
  (`UN-TEST-QUI-PASSE-PAR-DETACHEMENT-PASSE-PAR-ACCIDENT`).
- En élargissant un détecteur, la métrique n'est pas « combien de résultats PERTINENTS » mais
  « combien que RIEN d'autre ne couvrait » : le motif large sortait 16 clés fiscales, dont 14 étaient
  les ÂGES de la table FERR déjà décrits par les 24 entrées de TAUX — fiscales, neuves, et protégeant
  zéro. Le motif étroit rendait 100 % de la protection pour 42 % des entrées. Se répond par un grep de
  l'inventaire AVANT d'écrire une entrée. Et élargir un motif importe ses faux positifs : `/[(,]$/`
  relevait « (18 ans) » dans un MESSAGE utilisateur — `SCAN-QUI-MATCHE-LA-PROSE` dans un littéral de
  CHAÎNE, hors de portée de `stripComments`, deuxième fois en deux lots
  (`COMPTER-LES-CLES-N-EST-PAS-COMPTER-LA-PROTECTION`).
- Trier une constante par ce qu'elle ATTEINT, jamais par la SYNTAXE sous laquelle on l'a rencontrée :
  un ticket XS groupait « trois littéraux en dur » dont l'un pilotait une **fonction objectif**
  (`useSmithManoeuvre` est dans l'espace de recherche de stratégies → 343 335 $ d'amplitude, conseil
  INVERSÉ aux taux hauts) et deux alimentaient des champs publiés que **personne ne lit**. Les deux
  questions qui reclassent : qui LIT le champ, et qui TRIE dessus ? Corollaires : la liste de sites
  d'un ticket est incomplète par défaut (grep la VALEUR, pas le fichier cité — 25× existait en deux
  copies), et « sourcer » ≠ « ranger dans `FISCAL_REFERENCE.md` » — y mettre une hypothèse de MODÈLE
  lui donne l'autorité d'un texte de loi
  (`UN-TICKET-QUI-GROUPE-PAR-LA-SYNTAXE-GROUPE-DES-ENJEUX-INCOMPARABLES`).
  ⚠️ Corollaire de garde : une garde d'ABSENCE de consommateur matche la PROSE — et pas seulement
  celle des commentaires. La mienne a rougi sur un **littéral de chaîne** (la `reason` d'un
  inventaire), que `stripComments` laisse intact. Le remède est côté MOTIF, pas côté lecteur : ancrer
  sur la forme d'un ACCÈS (`p.X`, `X?:`, déstructuration), garder le témoin trouvé par le MÊME motif
  ancré, et perturber DEUX fois — vrai consommateur → rouge, simple mention → vert.
- Dans un document-RÉCIT (`BACKLOG_ARCHIVE.md`, sessions passées de `HANDOVER.md`), un `replace`
  GLOBAL sur une valeur qui varie dans le temps (compteur de tests) **falsifie** les entrées
  précédentes — leur chiffre était vrai À LEUR DATE. Cibler la ligne du lot courant par index
  ASSERTÉ. Les documents sans date (en-tête `CLAUDE.md`) sont l'inverse : eux portent la valeur du
  jour (`UN-REMPLACEMENT-GLOBAL-DANS-UNE-ARCHIVE-FALSIFIE-UN-RECIT`).
- Variante CODE du même piège : un `replace` GLOBAL d'un jeton (`Math.random()` → `rand()`) réécrit
  aussi le COMMENTAIRE qui le nomme — mon en-tête est devenu « utilisait `rand()` NU », commité et
  poussé. ⚠️ L'assertion de COMPTE n'a pas protégé, elle a **certifié** : `n == 6` était vrai parce
  qu'elle additionnait 5 occurrences de CODE et 1 de PROSE (le fichier n'en portait que cinq).
  Remplacer sur la source DÉCOMMENTÉE, ou relire le DIFF et non l'intention
  (`UN-REPLACE-GLOBAL-DE-JETON-REECRIT-LE-COMMENTAIRE-QUI-LE-NOMME`).
- Une **fixture aux mauvais NOMS DE CHAMPS est une fixture VIDE**, en silence : `{ amount, frequency:
  'monthly', nature: 'BESOIN' }` contre un type qui porte `{ target, frequency: 'Monthly', nature:
  'Besoin' }` donne 0 $ via `item.target || 0`, et perturber ce poste n'atteint plus rien — j'ai
  failli conclure « déjà durci ». Le `as unknown as` désactive le contrôle, les `|| 0` de production
  absorbent le reste. Asserter que la fixture rend la grandeur INTERMÉDIAIRE non nulle AVANT de
  conclure d'une perturbation muette (`UNE-FIXTURE-AUX-MAUVAIS-NOMS-DE-CHAMPS-EST-UNE-FIXTURE-VIDE`).
- **Le nom qu'un ticket donne à un chemin est une PARAPHRASE, pas sa condition** : « aucune
  transaction » désignait en fait les ENTRÉES INUTILISABLES, parce que **`[]` est `truthy`** et
  traverse déjà la boucle. Ma garde écrite d'après cette phrase passait **sur le code d'avant** —
  vacueuse. Lire le `if` et instancier la valeur qui le rend vrai ; « vide », « absent » et
  « invalide » se ressemblent en français et se distinguent en JavaScript. Corollaires : le
  périmètre d'un ticket de CLASSE est une borne inférieure (un 3ᵉ site identique est sorti du scan
  rejoué), une garde de TYPE qui ne coûte AUCUNE erreur mesure qu'aucun consommateur ne mute
  aujourd'hui — c'est préventif, et ça s'écrit tel quel —, et **un spread de tableau devant une
  écriture indexée est toujours suspect** (`[...a]` puis `a[i].champ = v` ne copie pas ce qu'on
  mute : mesuré, éditer une cible d'allocation réécrivait la constante de module des défauts)
  (`UNE-LISTE-VIDE-N-EST-PAS-LE-CHEMIN-VIDE`).
- Une **fixture PARTAGÉE** ne fait pas échouer un test : elle en fabrique un FAUX, sans rouge nulle
  part. `buildCoupleConfort` rendait les MÊMES objets à chaque `build()` (constantes de module
  réutilisées), donc la corruption d'un cas survivait dans le suivant — un relevé annonçait
  `baseNetAnnual = 52 800` au lieu de 115 200, chiffre que j'ai failli écrire dans un ticket
  money-critical. Quand un relevé multi-cas donne un résultat qu'aucune lecture du code n'explique,
  **soupçonner l'ISOLATION avant le code testé**. La copie doit être PROFONDE (`{ ...CONFIG }`
  partage encore `users`). Et c'était le persona PAR DÉFAUT — deuxième défaut d'outillage d'affilée
  sur lui (`UNE-FIXTURE-PARTAGEE-NE-CASSE-PAS-UN-TEST-ELLE-LE-REND-FAUX`).
- ⚠️ **Un rapport d'AGENT n'est pas une source**, exactement comme un ticket : j'ai publié un impact
  money-critical avec un ✅ « CHIFFRÉ » sur la foi d'un panel, sans le mesurer — la passe suivante a
  rejoué le MÊME scénario annoncé et trouvé 6,83 % d'écart sur la base. Cause : les deux protocoles
  fixaient `projection.returnRate`, **un champ que le moteur ne lit pas** (`computeScenarioOverrides`
  lit `returnRates`, la carte par compte). Un paramètre non câblé ne rend pas la mesure bruyante, il
  la rend MUETTE et fausse. Ce qui survit à un désaccord de mesure, c'est l'**ordre de grandeur** et
  le **fait qualitatif** (ici ≈ −7 M$ et « 0 valeur non finie sur 361 points ») — publier ça, pas un
  montant au dollar ; et un montant cité dans le dépôt exige un script de reproduction **committé**
  qui nomme CHAQUE paramètre avec sa valeur (`UN-RAPPORT-D-AGENT-N-EST-PAS-UNE-SOURCE`).
- Quand un fait **ne peut pas être établi de façon fiable** (deux structures sans identifiant
  commun), ne pas l'affirmer ET ne pas se taire : avertir sur un fait STRUCTUREL vérifiable et
  laisser la conclusion à l'utilisateur. Une détection par NOM raterait en silence et donnerait une
  confiance injustifiée. Tester les DEUX sens (une alarme permanente s'ignore), et PROUVER que le
  défaut existe avant d'avertir (`QUAND-ON-NE-PEUT-PAS-DETECTER-DE-FACON-FIABLE-ON-AVERTIT-SANS-PRETENDRE`).
- Un **alias `@deprecated`** interne rend le code cherchable par DEUX noms, donc INTROUVABLE par un
  seul : un `grep` sur le nom canonique a déjà fait conclure « module orphelin » — faux, et écrit
  dans le dépôt. Un alias ne se justifie que face à un consommateur qu'on ne CONTRÔLE pas
  (`UN-ALIAS-DEPRECIE-REND-LE-CODE-INTROUVABLE-PAR-UN-SEUL-NOM`).
- Un **point d'entrée manquant dans `knip.json`** ne cache pas un fichier mais tout un SOUS-GRAPHE :
  déclarer `api/**` a retiré le faux « fichier inutilisé » ET un export faussement signalé, dont le
  seul tort était d'avoir son consommateur hors analyse. Rejouer l'outil, ne pas supposer que le
  correctif ne touche que la ligne visée (`UN-SCANNER-QUI-CRIE-SUR-DU-CODE-VIVANT-APPREND-A-ETRE-IGNORE`).
- **Consigner une limite, ce n'est pas écrire son montant** mais sa CAUSE, son coût, et ce qui
  arriverait si on la « corrigeait » : un écart chiffré sans mécanisme se lit comme un défaut en
  attente et invite à le corriger — ici l'alignement naïf aurait DÉPLACÉ le biais et re-basé les
  goldens. La garde vise les mots qui expliquent, pas le nombre (l'ancrer au dollar = bombe à la
  prochaine indexation). Et une borne sans son HYPOTHÈSE est fausse : 1 052 $ à cotisation annuelle,
  1 483 $ avec rattrapage de droits — le ticket disait « ~1 153 $ », non retrouvé
  (`UN-ECART-CHIFFRE-SANS-SA-CAUSE-INVITE-A-LE-CORRIGER` ; un ticket n'est pas une source, même
  quand il dit « MESURÉ »).
- **Deux tests cohérents entre eux peuvent être faux ENSEMBLE** : un test au producteur et un test à
  l'appelant qui affirment la même valeur INTERMÉDIAIRE ne se confirment pas — ils partagent
  peut-être la même hypothèse. Une durée de chômage de N servait N+1 mois SOUS deux gardes qui la
  figeaient. Viser la grandeur PUBLIÉE (combien de mois vécus ?), jamais le compteur. Et inclure le
  plus PETIT cas légal : l'erreur « +1 » valait +17 % à 6 mois, **+100 % à 1 mois**
  (`DEUX-TESTS-COHERENTS-ENTRE-EUX-PEUVENT-ETRE-FAUX-ENSEMBLE`).
- Quand un ticket **CONTREDIT une règle établie** du dépôt, remonter à la JUSTIFICATION de la règle,
  pas à sa conclusion : « les % restent visibles » valait pour un ratio de portefeuille, pas pour une
  répartition ENTRE CONJOINTS (information relationnelle). Une règle formulée par sa conclusion a un
  domaine de validité que sa formulation ne dit pas — et l'issue s'ÉCRIT dans le test
  (`UNE-REGLE-GENERALE-A-UN-DOMAINE-DE-VALIDITE`).
- Un ticket « l'outil ne couvre pas X » se solde en **REJOUANT** l'outil élargi, jamais en
  l'élargissant seulement : les offenders révélés sont le vrai périmètre, et leur gravité peut être
  sans rapport avec l'étiquette du ticket (XS/FAIBLE → 4 CTA sur 6 hors WCAG, dont un à 2,15).
  Les entrées à tester s'EXTRAIENT du code peint, jamais d'une liste écrite à la main. Et une garde
  qui naîtrait ROUGE se livre non bloquante avec sa raison DATÉE dans le code, le basculement en
  `exit(1)` étant la dernière étape du ticket de correction
  (`REJOUER-L-OUTIL-ELARGI-AVANT-DE-CROIRE-QU-IL-N-Y-A-RIEN`).
- Un **défaut qui SE PÉRIME** (année fiscale, exercice courant) ne se corrige ni en changeant le
  littéral ni en lisant l'horloge (qui rend la fonction non déterministe et fait une BOMBE des tests
  qui l'omettent) : **supprimer le défaut** et rendre le champ REQUIS — le typecheck l'exige alors
  sur chaque site, présent et futur (`UN-DEFAUT-QUI-SE-PERIME-SE-CORRIGE-EN-RENDANT-LE-CHAMP-REQUIS`).
  Corollaire : le cas de test se MESURE avant d'être écrit — l'écart y était nul sur un revenu rond
  et de 5 points près d'une borne de palier.
- Une vérification sur une conversion **fuseau-dépendante** (`getMonth` vs `getUTCMonth`,
  `toLocaleString`, `toISOString`) rejouée UNIQUEMENT dans le conteneur (qui tourne en **UTC**)
  mesure l'environnement, pas le code : sous UTC les deux variantes coïncident toujours. Balayer
  au moins un fuseau de chaque signe (mesuré : la variante UTC diverge 132/132 à Sydney, 0 à
  Montréal) et écrire la CONTRE-ÉPREUVE — « la variante fausse donnerait-elle autre chose ? »
  (`UN-CONTENEUR-EN-UTC-NE-PEUT-PAS-DEPARTAGER-LOCAL-ET-UTC`).
- Un **seuil d'anti-vacuité appartient à la PORTÉE qu'il mesure**, jamais à la garde dont on le
  copie : `partDeCodeRestante > 0.5`, canonique pour un scan de DÉPÔT (agrégé sur des centaines de
  fichiers), a déclaré vide un `healthScore.ts` intact — mesuré **0,466** de code, parce que ce
  fichier est majoritairement de la PROSE par conception. Re-mesurer à la portée où on le pose, et
  écrire la mesure à côté du seuil (`UN-SEUIL-D-ANTI-VACUITE-APPARTIENT-A-LA-PORTEE-QU-IL-MESURE`).
  ⚠️ Récidive du même lot, version TypeScript : un motif de scan sur `type: 'montant'` compte la
  FABRICATION **et** la DÉCLARATION de l'union discriminée — ancrer sur le `,` du littéral, et
  exiger en plus que la déclaration existe toujours (sinon la garde est satisfaite par la
  disparition de son objet). ⚠️ Et le **REMÈDE** prescrit par un ticket est déjà livré aussi souvent
  que son défaut : `formatSigned(n, { withCurrency: true })` existait déjà (8 sites) là où le ticket
  demandait d'écrire un `formatCADSigned`. Grepper le remède, pas seulement le défaut.
  ⚠️ **Neuvième périmètre de ticket faux d'affilée — celui-là écrit la veille, par moi** : ce qui
  pourrit n'est pas l'ÂGE d'un ticket mais le fait qu'il ait été écrit en regardant autre chose que
  le code. Le recensement n'a d'exception ni d'auteur ni de fraîcheur.
- Un **relevé fait par le nom CANONIQUE est aveugle à tous les alias** : le ticket de la garde du
  mode discret annonçait « 38 sites dans 19 fichiers », chiffre produit par un grep `formatCAD` — or
  la moitié des écrans passe par un raccourci local (`fmt`, `money`, `formatCurrency`) et n'écrit
  jamais le nom canonique. Deux écrans entiers (`ChildPlanning`, `RealEstateWorkspace`, 20 sites)
  étaient invisibles à l'outil qui a écrit le ticket. Une garde qui cherche l'usage d'une fonction
  DÉCOUVRE ses alias par fichier avant de scanner
  (`UN-RELEVE-PAR-LE-NOM-CANONIQUE-EST-AVEUGLE-AUX-ALIAS`).
  ⚠️ Corollaire de garde, plus général que son lot : **une ligne d'ATTRIBUT (`sublabel`, `title`,
  `aria-label`) doit porter sa marque À ELLE** — `KPIStat` masque son `value` et rend le `sublabel`
  NU une ligne plus bas, donc une fenêtre de voisinage fait du masquage du voisin un ALIBI. Et un
  texte qui mêle explication et montant ne se masque pas à la place de l'appelant : le type passe de
  `string` à `React.ReactNode`. ⚠️ Une dette résiduelle se BORNE par un test (jeton en ligne + compte
  qui refuse le suivant), jamais par un commentaire ; et **compter les occurrences d'un jeton n'est
  pas compter les sites** — le commentaire qui l'explique porte le même mot.
- **Un inventaire de dette doit savoir MOURIR** : le compteur du jeton `MONTANT-CHAINE-A-DECOUPER`
  portait DEUX assertions — « pas de treizième » ET « dette à zéro → retire le jeton ». C'est la
  seconde qui a rougi au lot suivant et exigé sa propre suppression. Un inventaire qui ne sait que
  refuser des ajouts survit à sa raison d'être et devient une échappatoire
  (`UN-INVENTAIRE-DE-DETTE-DOIT-SAVOIR-MOURIR`). Une borne s'écrit dans les DEUX sens.
  ⚠️ Corollaires du même lot : **découper un type, c'est se faire énumérer ses consommateurs par le
  compilateur** (la liste des dépassements en avait TROIS aux règles opposées — écran, contexte de
  chat, prompt IA — dont un révélé par le seul `typecheck`) ; **un champ de texte d'interface qui
  peut contenir un montant ne doit jamais être typé `string`** (deux fois le même correctif :
  `DualKPIStat.sublabel`, `PageHeader.subtitle`) ; et **un test qui rougit sur un lot qui ne touche
  pas ce qu'il défend mesurait une FORME** (`getByText(/…/)` suppose un seul nœud de texte —
  l'hypothèse même qui empêchait le masquage). ⚠️ `isPrivacyMode` est un état de MODULE : sans
  `afterEach`, un cas qui l'active contamine les suivants (mesuré).
- **Un montant composé À LA MAIN est invisible à la garde qui cherche le FORMATEUR** : le scan du
  mode discret cherche `formatCAD`/`formatCompactCAD`/`formatSigned` et leurs alias — un
  `` `${(v/1000).toFixed(0)}k$` `` ne ressemble à aucun des trois. 16 sites échappaient AUX DEUX
  gardes, et migrer le format en a révélé 6 non masqués (dont trois coûts d'enfant). **Une garde qui
  cherche l'USAGE d'une fonction a besoin d'une garde JUMELLE qui interdit de faire le travail
  autrement** (`UN-MONTANT-COMPOSE-A-LA-MAIN-EST-INVISIBLE-A-LA-GARDE-QUI-CHERCHE-LE-FORMATEUR`).
  ⚠️ Corollaires : un ticket étiqueté « cosmétique » se mesure avant d'être cru (« 2.35M$ » était un
  séparateur décimal ANGLAIS en fr-CA, et l'objectif FIRE restait en « k$ » à 1,25 M$) ; un **nom
  trompeur** se RENOMME plutôt que d'élargir le motif de la garde (prop `blur` → `privacy` : la
  primitive ne floute pas, elle RETIRE) ; et **`${` contient un `$`** — un motif « chiffre puis
  dollar » sans `(?!\{)` relève des taux de change (5 faux positifs mesurés).
- ⚠️⚠️ **Une garde qui cherche un motif AU VOISINAGE de son sujet lit son propre commentaire** : ma
  règle « chaque graphe porte son `role="img"` dans les 8 lignes au-dessus » était satisfaite par le
  commentaire que je venais d'écrire pour expliquer le patron — retirer l'attribut RÉEL la laissait
  VERTE (mesuré, 20 min après l'avoir écrite). C'est le poste le plus exposé de tous, parce que le
  commentaire qui explique le motif s'écrit exactement là. **Toute assertion de présence ou d'absence
  sur du source lit la source DÉCOMMENTÉE, y compris pendant qu'on écrit la garde**
  (`UNE-GARDE-ECRITE-A-COTE-DE-SON-SUJET-LIT-SON-PROPRE-COMMENTAIRE`).
  ⚠️ Corollaires : **la bonne alternative textuelle d'un graphe dépend du nombre de fois qu'il est
  RENDU** (un sparkline par ligne se résume, il ne se tabule pas) ; un résumé **sans montant** n'a
  rien à masquer et survit au mode discret, mais rend `null` plutôt qu'une tendance inventée quand la
  série ne permet rien d'honnête ; une garde qui ne connaît qu'une ÉCRITURE (`role="img"` mais pas
  `role: 'img'` en props étalées) rougit sur du code sain ; et **`formatPercent` aussi sépare par une
  insécable** — l'attendu se compose avec le formateur.
- ⚠️⚠️ **Un FAUX REFUS qui vide l'écran est indiscernable d'une perte de données** (incident
  2026-09-01) : `verifierTypesRestaures` refusait un état légitime → `merge` lève → app vide, blob
  INTACT, et le pull Drive rejouait le refus. Trois clés persistées et déclarées textuelles
  manquaient (`accountId`, `revealedProjectionSig`, `activeTestPersonaId`). L'arbitrage « lister les
  champs TEXTE, un oubli donne un faux refus BRUYANT attrapé par la CI » ne vaut que pour les
  surfaces **que la CI porte** — pour les autres, le faux refus atteint l'utilisateur, et là il n'est
  pas bruyant du tout. **Une liste blanche se dérive du CONTRAT et de CHACUNE de ses surfaces**
  (`types.ts` ET le corps de `FinanceState`), jamais des états mesurés
  (`UN-FAUX-REFUS-QUI-VIDE-L-ECRAN-EST-INDISCERNABLE-D-UNE-PERTE-DE-DONNEES`).
  ⚠️ Corollaires : **une mesure citée sans son PÉRIMÈTRE se lit comme une loi** (« zéro clé ne porte
  à la fois une chaîne et un nombre » était vrai des états du dépôt, faux du contrat) ; ce qui a
  sauvé les données n'est pas la garde mais `shouldPush(localIsEmpty)` + « local vide → pull, jamais
  push » — **une garde de dernier recours se juge sur les cas qu'elle attrape et que personne n'avait
  imaginés** ; et mon recensement d'urgence était FAUX (les apostrophes de la prose française
  matchées comme des littéraux, « 0 couvert sur 81 »), démasqué par trois témoins nommés avant
  publication — **un recenseur se vérifie par témoins AVANT de servir de diagnostic**.
  ⚠️⚠️ **DEUXIÈME VAGUE ~1 h plus tard, et c'est la garde POSÉE CONTRE L'OUBLI qui était aveugle** :
  l'app s'est re-vidée sur `fintableRoles.<compte>.debtName`, pendant que la garde de dérivation —
  « tout champ textuel de `types.ts` figure dans la liste » — restait VERTE. Son extracteur ancrait
  le nom en début de LIGNE, or `debtName` n'existe que dans un littéral de type EN LIGNE
  (`| { kind: 'debt'; debtName: string }`). Élargi (nom reconnu aussi après `{` ou `;`, valeur
  arrêtée au `;` OU à l'accolade) : **76 → 78** clés vues, zéro perdue. **Un recenseur ancré sur la
  FORME ne couvre que les formes que son auteur avait sous les yeux** — et un « aucun manquant »
  n'affirme rien tant qu'un témoin nommé n'existe QUE dans la forme la moins familière (`accountId`,
  choisi comme témoin, était satisfait par la forme banale et ne discriminait rien)
  (`UN-RECENSEUR-ANCRE-SUR-LA-FORME-NE-VOIT-QUE-LES-FORMES-QU-IL-A-CROISEES`). Corollaire d'incident :
  après avoir corrigé un oubli de liste blanche, demander **quelle AUTRE surface de cet utilisateur
  n'est portée par aucune fixture** — deux vagues, deux fois la même cécité, sur des champs voisins.

**Money-critical / moteur**
- ⚠️ **Un stub qui a la FORME du défaut ne peut pas le voir** : le `fiscalStub` partagé d'un fichier
  de test était `gross * 0.3` — un taux PLAT — et rendait strictement invisible le remplacement d'un
  abattement plat par un abattement calculé. Regarder ce que la fixture partagée SUPPOSE avant
  d'écrire le test ; il faut une forme structurellement différente (ici un barème progressif).
  Corollaires du même lot, tous deux démasqués par PERTURBATION seule : un **ratio annule un facteur
  constant** (diviser la grandeur par elle-même sous un autre stub ne prouve rien — comparer DEUX
  barèmes), et une **fixture peut désactiver la branche testée** (`incomeRetirement: 0` clampait la
  soustraction, donc le clamp n'était jamais sollicité). Perturber assertion par assertion, jamais
  une fois pour le lot (`UN-STUB-QUI-A-LA-FORME-DU-DEFAUT-NE-PEUT-PAS-LE-VOIR`). ⚠️ Mon 2e jet a
  re-commis la faute d'un cran : `(g − 20 000) × 0,4` est **affine**, donc à pente CONSTANTE au-dessus
  du coude — un stub n'est progressif qu'avec ≥ 2 coudes ET des points de mesure strictement positifs
  de part et d'autre. Et un « A ≠ B » se vérifie en LANÇANT (deux tranches ont rendu 0,5 par coïncidence).
- ⚠️ **Un correctif peut être PIRE que le défaut sur une BRANCHE** : remplacer un forfait par un
  calcul n'est un progrès que là où les entrées du calcul ont un sens. Taxer une rente au taux
  marginal d'un SALAIRE qui aura cessé rendait 0,52 contre le forfait 0,7 — −158 543 $, et **1 seul
  test sur 4 495** voyait cette branche. Trois corollaires : un biais BORNÉ et connu vaut mieux qu'un
  calcul exact hors contexte ; **« aucun golden n'a bougé » est un résultat à EXPLIQUER** (ici ça
  mesurait l'absence de COUVERTURE, pas l'absence d'effet) ; et **un chiffre d'écran peut être une
  FONCTION OBJECTIF** — `estateNetWorth` est TRIÉ par `drawdownOptimizer` et publié comme « Meilleur
  avenir : X », donc le rendre dépendant de l'état final a fait basculer le conseil de décaissement
  au gré du curseur d'horizon. Grepper qui TRIE/compare/maximise une grandeur, pas seulement qui
  l'affiche, et mesurer le CLASSEMENT avant/après (`UN-CORRECTIF-PEUT-ETRE-PIRE-QUE-LE-DEFAUT-SUR-UNE-BRANCHE`).
- ⚠️ **Un correctif peut RENDRE ATTEIGNABLE une branche MORTE** — et c'est là que se cache la
  régression : `sanitizeNonFinite` peut désormais exclure les 3 métriques de santé jusque-là
  `available:true` en dur, réveillant un `: 0` qui s'affiche « 0/100 » en palette DANGER (« santé
  critique » pour dire « on ne sait pas »). Après avoir élargi l'ensemble des états qu'une fonction
  produit, relire ses CONSOMMATEURS pour trouver le repli jusque-là inatteignable ; le correctif est
  un TYPE (`number | null`), pas un meilleur nombre. Corollaire : **une garde de SORTIE ne voit pas
  un fini PLAUSIBLE** — `Infinity > 0` est vrai, donc `95/∞ = 0` donnait le score PARFAIT 100 et le
  libellé faux « 0,0 % du revenu net » ; `> 0` ne remplace jamais `Number.isFinite`, et la garde
  doit être à l'ENTRÉE (`UN-CORRECTIF-PEUT-RENDRE-ATTEIGNABLE-UNE-BRANCHE-MORTE`).
- ⚠️⚠️ **Neuf défauts sur un lot, chacun né du correctif de la passe PRÉCÉDENTE** (lot 31, quatre
  passes) : garde de sortie aveugle au fini plausible → gardes d'entrée → arrivées APRÈS le
  `|| 0` qui rabat un `NaN` (et trois métriques voisines lisaient le même champ sans garde) → le
  refus hérite du message de l'état VIDE voisin (« Revenu requis » avec un revenu valide) → et le
  correctif de ce libellé RECOPIE la condition au lieu de la partager, trois fois. Quand la
  correction locale se répète, **c'est qu'il manque une SOURCE UNIQUE** : ici deux prédicats
  exportés (`budgetParityInputsUsable`, `incomeUsableForRatios`) consommés par le calcul ET par le
  choix du libellé — un libellé est un consommateur de la même vérité qu'un chiffre. Trois règles :
  la garde se place là où la donnée est encore RECONNAISSABLE (en amont du `|| 0`) ; on compte les
  consommateurs par le CHAMP, pas par la fonction corrigée (4 métriques vs 1) ; un correctif de
  DIAGNOSTIC se re-relit comme un correctif de calcul — un texte affiché est une affirmation, il
  envoie l'utilisateur corriger le mauvais champ
  (`UN-CORRECTIF-LOCAL-REPETE-EST-LE-SIGNE-D-UNE-SOURCE-UNIQUE-MANQUANTE`).
- ⚠️ **La tranche retirée d'une assiette doit être la grandeur RÉELLE, pas l'estimé de saisie** :
  soustraire l'estimé non indexé, sans prorata et sans SRG d'un revenu nominal faisait −29 % sur le
  seul dénominateur — rien ne crie. Signal : **la même variable indexée à 40 lignes d'écart et pas
  à l'autre** ; quand deux usages d'un même symbole divergent dans un même bloc, l'un est faux.
- ⚠️ **Documenter un chiffre fiscal sans le MESURER, c'est fabriquer la source qu'on prétend citer** :
  j'allais écrire dans `FISCAL_REFERENCE.md` que « 0,36 ≈ le taux marginal supérieur d'un dividende
  déterminé » — mesuré, ce taux vaut 39,16 % et 0,36 est un taux de MILIEU pour l'AUTRE type de
  dividende. Une fois dans la source de vérité, la phrase aurait l'autorité de la source. Documenter
  un forfait = produire le TABLEAU de son écart réel sur plusieurs points ; « proche de » ne se
  vérifie pas. Corollaire : un chiffre recopié dans un COMMENTAIRE dérive aussi — ma garde a rougi
  sur mon propre commentaire JSX, réécrit sans le chiffre plutôt qu'exempté
  (`ECRIRE-UN-CHIFFRE-FISCAL-SANS-LE-MESURER-FABRIQUE-SA-SOURCE`).
- ⚠️ **Un `git checkout` de mesure avant/après peut EFFACER une correction non commitée** : mon
  script de ré-application ne restaurait que le FIX, pas la correction de commentaire faite dans le
  même arbre — et mon commit a ensuite AFFIRMÉ « aligné aux 4 sites » de mémoire. Après toute
  restauration : `git diff` FINAL contre la liste de ce qu'on croit avoir changé, jamais le souvenir.
  (Récidive immédiate : un pipeline d'édition à ancre périmée a échoué SANS bloquer le commit qui le
  suivait — chaîner édition et commit par `&&`, et relire le DIFF du commit, pas l'intention.)
- ⚠️ **La garde COMPORTEMENTALE bat six passes de scan** : l'assertion `taxDivers === base × taux`
  a trouvé en UNE ligne un impôt 12× trop bas (accumulateur ANNUEL nourri d'un versement mensuel
  divisé par 12 « comme le voisin ») que goldens, conservation et revues n'avaient pas vu — AUCUNE
  fixture ne portait le flux (`UN-INVARIANT-NE-VOIT-PAS-CE-QUI-EST-ABSENT`). Asserter le CUMUL
  (invariant de cadence) et le champ PUBLIÉ, pas la valeur d'un appel au mutateur.
- ⚠️ **Un correctif de correctif se fait relire AUSSI** : la 2e revue du même lot a trouvé 2 défauts
  que j'avais introduits. (a) Retirer le SRG de la TRANCHE et pas du CONTEXTE le rendait imposable —
  `CABLER-UNE-ANNEE-C-EST-CABLER-UNE-PAIRE` re-commis dans le lot dont le commit CITAIT cette leçon.
  (b) `estateNetWorth` DÉCROISSAIT quand l'horizon montait d'un an : mon discriminant de branche
  (`rentesRéelles > 0`) répondait à « les rentes sont-elles déjà dans le revenu ? », pas à « est-on
  retraité ? ». **Un discriminant doit énoncer la question à laquelle il répond RÉELLEMENT** — bien
  nommé, il a supprimé la branche. Et pour toute grandeur qu'un CURSEUR pilote, monotonie et
  continuité SONT des invariants : les balayer, pas mesurer un point. Deux corollaires : un sens
  d'erreur assumé se déclare avec sa BORNE (j'avais écrit « 3,5 pts », mesuré 36,1 pts ailleurs),
  et une ligne non testable s'ÉCRIT comme telle plutôt que couverte par une fixture absurde.
  ⚠️ Une 3e revue a encore trouvé 2 défauts à moi : **trois passes, trois récoltes** — ne jamais
  merger en supposant la suivante vide. (c) Un **accumulateur ANNÉE-À-DATE** (`accRentesYear`, remis
  à zéro chaque janvier) additionné à un `× 12` annualisé rendait le patrimoine successoral dépendant
  du **MOIS CALENDRIER** de lancement (210 997 $) — alors que j'avais écarté son JUMEAU 3 lignes plus
  haut : quand on retire un terme d'une somme, réexaminer CHAQUE autre terme au même critère.
  (d) **MONOTONIE et CONTINUITÉ d'une grandeur pilotée par un CURSEUR sont des invariants** — ça ne
  se voit qu'en BALAYANT le paramètre, jamais sur un point. Deux règles en sont sorties : *imposer
  exactement ce qu'on VALORISE* (un facteur s'applique à SON assiette, pas à une grandeur voisine),
  et *« pas encore connu » n'est pas « zéro »* (la pension DB planifiée était une SAISIE disponible
  dès le 1er mois). Corollaires : un scan de PRÉSENCE peut être satisfait par la perturbation
  (`toContain('finalYear')` matche `finalYear + 5` — isoler l'ARGUMENT et exiger l'égalité), et un
  test ne doit pas rendre un correctif futur rouge PAR CONCEPTION (un artefact connu se SURVEILLE
  par une borne large, il ne s'ancre pas au dollar).
- ⚠️⚠️ **CINQ revues sur un même lot, les QUATRE dernières trouvant un défaut que J'AVAIS introduit
  en corrigeant la précédente** — toujours dans les mêmes ~20 lignes. (e) Une **formule
  money-critical recopiée DIVERGE** : la re-dériver a produit 3 divergences d'un coup ; le correctif
  est d'EXTRAIRE une source unique, pas de mieux recopier. (f) **Recopier la ligne VOISINE** est un
  piège à part : elle compile et paraît juste (`(survivorMode || divorced) ? 1/N : 1` est correct
  pour l'agrégat d'à côté, FAUX pour la DB dont le décès est déjà porté ailleurs) — se demander ce
  que chaque facteur CORRIGE, pas s'il ressemble. (g) **Extraire une expression, c'est hériter de ses
  cas limites** : `age >= s ? X : 0` devenu `if (age < s) return 0` s'inverse sur un NaN ; une
  refacto « à comportement identique » se prouve sur les entrées SALES.
- ⚠️⚠️ **Le test écrit pour fermer un trou peut re-commettre le trou** : mon test de câblage
  RECONSTRUISAIT le proxy au lieu de l'observer → 5 perturbations sur 5 passaient. Pour vérifier un
  ARGUMENT, l'OBSERVER (espion `vi.mock` capturant les entrées), jamais le reproduire. **Signal : si
  le test contient une expression qui ressemble au code testé, il teste sa copie.** Corollaires :
  quand une branche n'a AUCUN chemin déterministe (mortalité stochastique), l'ÉCRIRE vaut mieux que
  fabriquer une fixture qui n'exerce rien mais éteint l'alarme ; et un scan de source prouve la
  présence d'un JETON, pas l'acheminement d'une valeur (trompé par une clé dupliquée en spread, un
  leurre dans le même fichier, un bon nom au mauvais contenu) — le dire DANS le test.
  ⚠️ **Et « il n'existe pas de chemin déterministe » est un constat que j'ai écrit, donc à re-prouver
  AVANT de s'en servir pour justifier un scan** : le dépôt épinglait déjà un seed qui déclenche le
  décès du conjoint, et `verboseMonthlyPoints` expose les points sous MC. J'avais conclu depuis MA
  fixture au lieu du dépôt (`DOC-STALE-IMPOSSIBILITY`, leçon déjà nommée ici et re-commise). Coût :
  deux défauts réels invisibles sur 226 tests (−19 657 $ et +12 000 $).
- ⚠️ **Câbler une année, c'est câbler une PAIRE** : j'ai passé l'année courante à l'inversion
  net→brut de `TaxCenter` et laissé `calculateFiscalReport` à son défaut 2026 trois lignes plus bas.
  Avant, les DEUX étaient à 2026 — donc cohérents. Après, 212 $/an d'écart dès 2027. **Améliorer un
  seul côté d'un défaut partagé est pire que ne rien faire** : chercher, dans la même fonction, tous
  les appels de la même famille. Corollaire test : un test qui fige une année pendant que le code lit
  l'horloge est une BOMBE (rouge garanti au 1er janvier, sans changement de code). Et pour couvrir un
  APPELANT enfoui dans une boucle moteur, seul le scan de SOURCE marche — mes tests de câblage
  laissaient tout vert quand on retirait l'argument (`CABLER-UNE-ANNEE-C-EST-CABLER-UNE-PAIRE`).
- Remplacer une fonction par une **constante multiplicative** : mesurer l'écart à ≥3 points écartés.
  Un écart de même signe est un biais ; un écart qui **change de signe** prouve que la FORME est
  fausse et ferme le débat sur la valeur — `net * 1.35` surestimait de 2 681 $ à 30 k$ et
  sous-estimait de 132 196 $ à 250 k$ (relation net→brut CONVEXE, un facteur plat n'est qu'une
  sécante). ⚠️ Et un repli **PERSISTÉ** est pire qu'un repli calculé : `u.grossSalary || (…)`
  court-circuite, donc corriger le code ne rattrape pas les configs déjà écrites. Avant de livrer un
  correctif de repli : **le mauvais résultat a-t-il été SAUVEGARDÉ ?**
  (`UN-FACTEUR-PLAT-SUR-UNE-RELATION-CONVEXE`).
  ⚠️ Corollaire de test : la **TOLÉRANCE d'une assertion vient de la fonction testée**, pas du
  confort — `toBeCloseTo(x, 0)` exige < 0,50 $ alors que la dichotomie ne garantit que < 1 $, et
  43 % des cibles dépassent le seuil (mesuré). Lire la condition d'arrêt et s'y aligner : une
  assertion plus serrée que la garantie est un piège CI à retardement.
- ⚠️ Une grandeur d'origine **LÉGALE** ne peut pas être indexée par un facteur que l'UTILISATEUR ou
  une STRATÉGIE peut faire bouger : le plafond RQAP était `98000 * expenseMultiplier`, or ce
  multiplicateur porte l'inflation des DÉPENSES et est **gelé par Guyton-Klinger** — une règle de
  décaissement déplaçait un plafond gouvernemental de 26 192 $ (mesuré à 20 ans). Test à faire pour
  chaque valeur légale : « QUI peut la faire bouger dans le moteur ? » Ni la conservation ni les
  goldens ne le voient (`UN-INDEX-GELABLE-NE-PEUT-PAS-PORTER-UNE-LOI`).
- ⚠️ **« Aucun golden n'a bougé » sur du money-critical est un résultat à EXPLIQUER**, jamais un feu
  vert : sur un correctif qui déplace l'assiette de 2 750 $/an, zéro golden rouge PROUVE qu'aucune
  fixture n'exerce ce chemin.
- Un finding de review sur du fiscal/moteur est une **hypothèse** (≈3/8 des HIGH sont FAUX) —
  vérifier contre le vrai code avant de « corriger ». Un faux fix est pire que le finding.
- **Mesurer, pas raisonner** : l'agent qui a EXÉCUTÉ l'emporte sur celui qui a déduit.
  Arbitres outillés : résiduel de conservation ($), `check-contrast` (a11y), `git stash` (test discriminant).
- **Prouver qu'un test DISCRIMINE** : il doit ÉCHOUER sur le code d'avant (`git stash`).
  Pour un invariant d'ORDRE, la preuve s'inverse (introduire l'inversion chirurgicalement).
- ⚠️ Symétrique : **un test qui échoue n'a pas forcément raison**. Mesurer la même grandeur AVEC et
  SANS le correctif sur le même scénario : si l'écart est NUL, le test ne parle pas du correctif,
  quoi qu'affiche son message. Un scénario qui ne fait pas EMPRUNTER le chemin corrigé ne prouve
  rien (`UN-TEST-QUI-ECHOUE-N-A-PAS-FORCEMENT-RAISON`).
- Un bug confirmé peut viser du code **dont la sortie est jetée** → test de perturbation avant fix.
- Une garde qui **lit la table de config** pour choisir quoi vérifier est CIRCULAIRE : elle ne peut
  pas détecter une erreur DANS la table. Il faut une assertion qui ne la consulte pas (mesuré sur
  `dailyLedger` : un solde reclassé en flux laissait les deux invariants verts).
  ⚠️ Corollaire livré le 2026-08-25 : la liste que balaie l'assertion non circulaire doit rester
  ÉCRITE À LA MAIN (la dériver de la table sortirait du balayage le champ qu'un reclassement vient
  de déclasser), et la table ne se consulte que dans l'AUTRE sens — un 2ᵉ test EXIGE que tout champ
  déclaré soit balayé OU exclu explicitement. **Il faut les deux** : la liste seule pourrit, le test
  seul est circulaire. Et « tous les X non nuls » ne veut rien dire hors du contexte de la fixture :
  la version prescrite du ticket couvrait 13 champs et AUCUN des 11 qu'il nommait, tous à zéro faute
  de dette/immeuble/enfant dans le scénario
  (`UNE-GARDE-NE-COUVRE-QUE-CE-QUE-SA-FIXTURE-REND-NON-NUL`).
  Même famille : un jeton qui prouve À LA FOIS le problème et le correctif rend la garde AUTO-SATISFAITE.
- ⚠️ **Un registre RÉCONCILIÉ à une clé rend son arithmétique de flux DÉCORATIVE** : cacher à
  `stepReerByUser` TOUTES les cotisations REER (`contribution: 0`) laisse **29 tests per-conjoint
  verts** et `reerByUserFinal` bit-identique — `reconcileToPool(…, poolEnd, shares)` détermine seul la
  répartition (résultat = `poolEnd × shares`, rapport 10,0000 mesuré sur un couple 10:1). Toute une
  famille de correctifs passés sur ce registre est peut-être inerte pour la même raison. Devant un
  module qui « réconcilie » en sortie, PERTURBER une entrée avant de croire qu'elle compte
  (`UN-REGISTRE-RECONCILIE-A-UNE-CLE-REND-SES-FLUX-DECORATIFS`). Corollaires du même lot : un
  avertissement que je me suis écrit à MOI-MÊME se re-prouve avant d'être suivi — le mien était faux
  et faisait renoncer à un correctif juste ; et un TRANSFERT se garde par l'ÉGALITÉ de ses deux côtés,
  pas seulement par un résiduel (publier un seul côté peut passer si l'autre est masqué par un flux du
  même mois).
- ⚠️ ~~Un registre RÉCONCILIÉ à une clé rend son arithmétique de flux DÉCORATIVE~~ — **constat CORRIGÉ
  quelques heures plus tard, il était TROP LARGE** : cacher à `stepReerByUser` toutes les cotisations
  REER laissait bien 29 tests verts, mais c'était une propriété de la FIXTURE. Voir l'entrée
  `UN-COUPLE-DU-MEME-AGE-EPINGLE-LE-REGISTRE-PER-CONJOINT` plus bas. Ce qui RESTE vrai : devant un
  module qui « réconcilie » en sortie, PERTURBER une entrée avant de croire qu'elle compte
  (`UN-REGISTRE-RECONCILIE-A-UNE-CLE-REND-SES-FLUX-DECORATIFS`). Corollaires du même lot : un
  avertissement que je me suis écrit à MOI-MÊME se re-prouve avant d'être suivi — le mien était faux
  et faisait renoncer à un correctif juste ; et un TRANSFERT se garde par l'ÉGALITÉ de ses deux côtés,
  pas seulement par un résiduel (publier un seul côté peut passer si l'autre est masqué par un flux du
  même mois).
- ⚠️ **Avant de juger un paramètre « utile » ou « décoratif », regarder par quelle CLÉ il est
  ATTRIBUÉ** : une attribution proportionnelle au solde est INVISIBLE derrière une réconciliation
  (`withdrawal` de `stepReerByUser` est ratio-neutre — répartition identique au 9ᵉ chiffre de 1 $ à
  899 999 $), une attribution par clé EXTERNE (`shares`) ne l'est pas (`contribution` : +16 123 $
  mesurés sous écart d'âge). La question utile n'est pas « ce paramètre a-t-il un effet ? » mais
  « son attribution peut-elle changer un RAPPORT que la sortie conserve ? ». J'ai corrigé DEUX fois
  le même constat faute d'avoir séparé les deux paramètres
  (`DEUX-PARAMETRES-D-UN-MEME-MODULE-N-ONT-PAS-LE-MEME-STATUT`).
- Élargir l'assiette d'un calcul → auditer TOUS les dérivés qui partagent cette base. Et relire
  TOUTE la fonction : un raccourci d'égalité entre deux grandeurs qui viennent de diverger
  (`taxEmployer = taxReal`, `employmentIncome` par défaut = `gross`) devient faux en SILENCE — ni
  `tsc`, ni le lint, ni 4 368 tests ne l'ont vu (`ASSIETTE-ELARGIE-CASSE-SES-RACCOURCIS`).
- Un écart CONSTANT dans un test (indépendant de l'entrée qu'on fait varier) n'est presque jamais le
  bug cherché : c'est une grandeur voisine incluse par erreur dans la mesure. Le mettre à zéro pour
  trancher — et creuser quand même, l'écart de 766 $ a révélé un vrai défaut voisin.
- ⚠️ **Devant un résiduel, demander d'abord SUR COMBIEN DE POINTS, pas « combien »** : j'avais routé
  un ticket en écrivant « 7 638,44 $ au mois 324, plus de petits résiduels ailleurs » — ça décrit un
  cas limite. Mesuré, `NetTransferLiquid` est non nul sur **0 des 361 points** (355 mois sur 360 en
  résiduel, pire 108 608 $) : le champ n'est JAMAIS alimenté. Le montant fait écrire « cas limite »,
  le COMPTE fait écrire « le champ n'existe pas ». Dans un ticket, mettre la COUVERTURE à côté du
  montant. Corollaire : **chercher le JUMEAU du champ de l'autre côté d'une frontière** — le passé
  (`dailyPastLedger`) publie `income − expenses` là où le futur publie zéro, donc le même nom porte
  deux contrats et quatre surfaces d'UI en héritent
  (`UN-CHAMP-TOUJOURS-NUL-N-EST-PAS-UN-CAS-LIMITE`).
- Corriger « le producteur X a oublié le registre Y » → **énumérer TOUS les producteurs** par grep sur
  le registre, pas seulement celui du ticket. `realEstateMonth.ts` a cumulé 4 défauts money-critical
  parce que 4 passes de correction l'ont sauté (`MODULE-ECRIT-HORS-CHECKLIST`).
- Un registre per-conjoint qui devient pilote doit gérer **décès/divorce** (la conservation ne l'attrape pas).
  ⚠️ Et devant un mutateur global (`*= keep`, décès, événement de vie), la question n'est PAS « ai-je
  touché tous les champs ? » mais **« chacun décrit-il quelque chose qui EXISTE aujourd'hui ? »** :
  le partage du divorce divisait aussi les paramètres SEMÉS d'un achat futur (`currentValue = price`,
  `mortgage = price − downPayment`), que le moteur consomme tels quels à l'achat. Le débit vient du
  BUT, l'actif de l'ÉTAT — deux sources pour une même opération, et **la moitié de la mise de fonds
  s'évapore** (mesuré : équité 100 672 $ → 50 336 $ pour un cash sorti IDENTIQUE). Aucun invariant de
  conservation ne bronche : le cash est bien parti, le bien est bien inscrit, ils ne se correspondent
  plus (`UN-ETAT-SEME-N-EST-PAS-UN-ACTIF`).
- ⚠️ La **conservation ne voit pas un impôt jamais facturé** : un flux non prélevé est parfaitement
  conservatif (94 600 $ éludés mesurés, `moneyConservation` 20/20 VERT). Un invariant de FLUX ne
  détecte pas une erreur d'ASSIETTE — il faut recalculer la base imposable indépendamment. Et un
  producteur qui alimente le registre de RETENUE sans celui d'ASSIETTE pose un crédit sans dette
  (`CONSERVATION-NE-VOIT-PAS-L-IMPOT-ELUDE`).
- **Partager le MONTANT, jamais ses reflets** : appliquer une part au RÉSULTAT d'un producteur oblige
  à se souvenir de TOUS ses registres — deux oubliés = 75 957 $ d'écart mesuré
  (`PARTAGER-LE-MONTANT-PAS-SES-REFLETS`).
- Une garde qui teste le **producteur en isolation** ne prouve RIEN sur la chaîne : viser les
  grandeurs PUBLIÉES. Et prouver que la grandeur mesurée est **non nulle** avant de la comparer —
  en Monte Carlo les points sont réduits, un test qui lit des champs absents compare des zéros
  (`GARDE-AU-PRODUCTEUR-NE-PROUVE-PAS-LA-CHAINE`).
- Une grandeur **DÉRIVÉE ne s'interpole pas**, elle se RECOMPOSE : lisser séparément les deux côtés
  d'une identité comptable (patrimoine vs ses composants) la casse entre les points de raccord —
  25 invariants du grand livre restaient VERTS pendant que l'identité dérivait de 89 $ au jour
  (`IDENTITE-COMPTABLE-INTERPOLEE-TROIS-FOIS`).
- Une garde ne dit RIEN des mois qu'elle ne parcourt pas : la forme-flux tournait sur une fixture de
  12 ans dont la retraite était à 62 ans — tout le DÉCAISSEMENT était hors de portée. Portée à 35 ans,
  elle a trouvé 131 566 $ de FERR sans flux publié, en déterministe
  (`INVARIANT-QUI-NE-PARCOURT-PAS-LA-PHASE`).
  ⚠️ Même aveuglement sur l'axe des **STRATÉGIES** (2026-08-25) : la garde « les deux registres du
  retrait REER disent la même chose » existait, nommée et commentée — mais sa fixture ne demandait
  pas `MELTDOWN_REER`, et le meltdown ne s'exécute que sous elle (`if (strategy !== X) return null`).
  **1 849 081 $** d'écart cumulé invisibles. Devant un module gardé par un `if (mode !== X) return`,
  demander **quelle fixture demande X** (`UN-INVARIANT-JUSTE-PEUT-ETRE-AVEUGLE-A-UNE-STRATEGIE-ENTIERE`).
  Corollaire de découpage : livrer la moitié qui ne DÉPLACE PAS d'argent, router l'autre avec sa
  mesure, et BORNER le résiduel restant par un test — un lot se coupe à la frontière
  « ça déplace de l'argent / ça n'en déplace pas ».
- ⚠️ Symétrique : remplir un « registre oublié » peut **déplacer de l'argent** si un de ses lecteurs
  est un CALCUL et non un affichage — `contribNonReg` sert aussi de base d'exclusion à la croissance
  de mi-mois : publier le remboursement d'avril a retiré 428 $ de rendement fantôme sur 30 ans.
  Grep TOUS les lecteurs et classer chacun affichage/calcul ; juger le signe et sa dépendance à
  l'horizon pour distinguer correction et régression (`REGISTRE-D-AFFICHAGE-QUI-PILOTE-UN-CALCUL`).
- Avant d'ajouter un montant au « registre oublié », **grep TOUS ses consommateurs** : `withdrawalREER`
  alimente à la fois l'affichage du flux ET le répartiteur per-conjoint, qui ne doit PAS le voir. Un
  montant, deux registres, deux règles — preuve = goldens complets où SEUL le champ visé change
  (`UN-MONTANT-DEUX-REGISTRES-DEUX-REGLES`).
- Un invariant neuf qui ne trouve RIEN doit prouver qu'il POURRAIT trouver : couverture COMPTÉE avec
  planchers + perturbation qui le fait échouer. La perturbation délimite aussi son angle mort — un
  invariant de bilan juge la cohérence, jamais le montant
  (`UN-INVARIANT-QUI-NE-TROUVE-RIEN-DOIT-PROUVER-QU-IL-POURRAIT`).
- Vérifs money-critical **en ISOLATION, séquentielles** (course `git stash` concurrente vue 2×).

**Avant de coder**
- Vérifier qu'une feature n'est pas **DÉJÀ faite** (grep le moteur).
- Une **extrapolation** porte DEUX paramètres — la vitesse ET l'ancre. Une ancre écrite EN DUR
  pendant que sa table grandit fabrique une MARCHE silencieuse le jour où la table dépasse l'ancre :
  le plafond REER partait de `2026` alors que le barème va jusqu'à 2030 → couture 2030→2031 mesurée
  à **+4,54 % en un an** (contre ≈ 2 %/an de part et d'autre), et l'erreur grandit avec l'inflation
  saisie (5 586 $ de droits fabriqués à 5 %). Ancrer sur la dernière année CONNUE, dérivée de la
  table. Corollaire doc : requalifier une hypothèse de modèle ne se fait pas en rangeant son chiffre
  dans `FISCAL_REFERENCE.md` mais en publiant le TABLEAU de son écart contre l'observé
  (`UNE-ANCRE-D-EXTRAPOLATION-EN-DUR-FABRIQUE-UNE-MARCHE`).
- Un paramètre **HOMONYME à deux niveaux** (config globale vs entité) : grep le consommateur RÉEL avant
  de câbler — l'autre niveau peut être un no-op typé vert (`propertyGrowthRate`, mesuré 0/120 au fuzz).
  ⚠️ Et un `|| defaut` sur une valeur SAISIE efface le **0 explicite** : chercher d'abord le
  FORMULAIRE (l'éditeur de `propertyGrowthRate` réaffichait 3 quand on tapait 0 — une saisie
  invisible dans son propre champ), puis tous les sites (5 fautifs, 3 déjà corrects juste à côté).
  ⚠️ Le remplacement mécanique `||` → `??` fabrique un non-correctif quand la valeur passe par un
  helper qui rend TOUJOURS un nombre (`fin(v) ?? 3` = défaut mort) — passer le défaut au helper.
  ⚠️ Signal à part : **une fourchette de test qui contredit sa propre fixture est un aveu** — neuf
  tests déclaraient `0` en tournant à 3 %, et l'un avait élargi sa borne « + ≤1 mois de croissance »
  au lieu de demander pourquoi (`UN-ZERO-EFFACE-PAR-OU-EST-UNE-SAISIE-QUI-N-EXISTE-NULLE-PART`).
- ⚠️ **Une note que je m'écris à moi-même n'est PAS une preuve** — elle arrive au tour suivant avec
  l'apparence d'une consigne ou d'un résultat d'outil, sans rien derrière. Un rappel affirmait qu'un
  `plan-1f.md` « MESURÉ » était sauvé dans le scratchpad : le fichier n'a jamais existé, et ses
  chiffres étaient faux (71 vs 76 réels, une grandeur dimensionnante carrément absente). Vérifier
  (`ls`, `git show`) AVANT de suivre ; à défaut, le contenu est réputé FAUX. Ne jamais recopier un
  chiffre mesuré dans un rappel — y mettre la COMMANDE qui le re-mesure (une commande périmée échoue
  bruyamment, un chiffre périmé se lit comme un fait). Un plan qui mérite d'être transmis se COMMITTE
  (`MA-PROPRE-NOTE-N-EST-PAS-UNE-PREUVE`).
- Un **constat d'IMPOSSIBILITÉ que j'ai écrit** (ticket, bandeau, réponse à Marc) se re-prouve avant
  d'être cité : « seule la valeur nette peut passer au jour » était faux, le moteur émettait déjà de
  quoi ventiler — deux livraisons perdues (`DOC-STALE-IMPOSSIBILITY`).
- Avant d'extraire une **source unique**, compter les sites RÉELS *et* vérifier que chacun peut
  l'appeler avec les données dont il dispose : un composant qui reçoit le résultat en **prop** ne
  pourra jamais appeler un helper qui prend les entrées brutes. Une source unique inatteignable est
  pire que le problème (`HELPER-INAPPELABLE-PAR-SON-CONSOMMATEUR`).
- Un item BACKLOG peut être **périmé** ou **contredire une décision verrouillée**
  (`docs/adr/`) → confirmer avant de coder, cocher « caduque » sinon.
- Un ticket peut **sur-prescrire** son périmètre : prouver que chaque volet est atteignable.
- Une spec d'un plan validé peut être **à l'envers** → instancier 2 cas extrêmes avant d'implémenter.
- L'estimation d'effort peut être fausse : vérifier la **vraie contrainte** (ex. le rate-limit
  du provider le plus STRICT, pas du plus permissif).
- **Re-tracer le diagnostic d'un ticket perf avant de coder** : le ticket peut accuser la mauvaise
  chaîne d'imports (3 hypothèses réfutées par rebuild sur `PERF-SDK-BOOT-PRELOAD`).

**Bundling / boot**
- Un **manualChunk atteint uniquement par `import()` devient EAGER** — le chunk manuel casse la
  frontière asynchrone. Ne mettre en `manualChunks` que du consommé statiquement au boot.
  Vérité = `grep modulepreload dist/index.html` après build PROPRE, jamais la config.

**Store / persistance**
- Un champ **additif optionnel** ne nécessite AUCUN bump de version (v7→v8 seulement pour
  RESTRUCTURER des données existantes) — zéro code de migration = zéro bug de migration.
- Même logique côté moteur : un param optionnel à défaut-neutre donne une rétrocompat bit-identique.

**UI / Tailwind / a11y**
- Un **shade hors palette** (`text-ink-600` alors que `ink` s'arrête à 500) est un no-op
  SILENCIEUX → vérifier `<N>` dans `tailwind.config.js` avant de committer.
- Choisir un shade par **mesure** (`check-contrast`), jamais au jugé. Un fix de hover-contraste
  ne se copie pas d'une couleur à l'autre.
- Vérifier qu'une classe est générée : build **propre** (`rm -rf dist`) avant de grep le CSS.
- Un outil-garde à valeurs **re-codées en dur** dérive en silence → importer la source unique.
- Une **constante JS qui duplique une valeur de style** (`TOOLTIP_WIDTH` vs la classe `w-80`) n'est
  confrontée par RIEN au runtime : la garde lit la CLASSE (la vérité peinte) et la compare à la
  constante — l'inverse serait circulaire (`STYLE-CONST-DUPLIQUEE`).
  ⚠️ Corollaire de cadrage (2026-08-25) : avant d'extraire une source unique de style, se demander
  **d'où sort la valeur qu'on canonise**. Les 14 infobulles Recharts portaient 9 styles et SIX fonds,
  dont deux BLANCS dans une app sombre — et aucun des six n'existait dans `tailwind.config.js`.
  La duplication n'était que le symptôme : dédupliquer sans le voir aurait figé une 15ᵉ valeur
  arbitraire. Le token se choisit par ce qu'il NOMME (`surfaceHighlight` = surface élevée), la
  couleur de texte par MESURE (ratio 14,42), et la garde vaut dans les deux sens — la constante
  reproduit les tokens ET aucun composant ne re-peint le style inline
  (`LA-DUPLICATION-EST-PARFOIS-LE-SYMPTOME-PAS-LA-MALADIE`).
- Un test `.length > 1` sur un **tuple** de longueur fixe est vacueux.
- Tout indice qui décrit une **POSITION À L'ÉCRAN** se calcule APRÈS le dernier filtre qui retire des
  éléments : le rang d'empilement des pastilles Futur était attribué avant l'écrêtage de densité, donc
  une survivante gardait le rang de ses voisines disparues (pastille à 68 px de la courbe, deux étages
  VIDES en dessous — et un `aria-label` qui annonçait « (3) » pour une pastille seule). Corollaire de
  cadrage : un critère VISUEL se juge en PIXELS — à l'horizon par défaut (40 ans) sur un téléphone,
  un mois vaut ≈ 0,7 px, ce qui réfute à lui seul le ticket qui voulait séparer deux événements
  distants de 15 jours (`UN-RANG-CALCULE-AVANT-L-ECRETAGE-SURVIT-A-SES-VOISINS`).
- Une fermeture (Échap) qui remet à zéro l'état d'un **déclencheur RÉPÉTÉ** (survol, focus) est
  annulée dès sa prochaine occurrence — il faut un VERROU, levé quand le déclencheur cesse vraiment.
  Et une garde sur la PRÉSENCE d'une classe utilitaire doit vérifier que la classe **fait encore ce
  qu'elle promet** (`.touch-target` = 44 px), sinon elle est vacueuse.
- **Une région live montée CONDITIONNELLEMENT n'annonce pas de façon fiable** : `role="status"` posé
  sur un nœud inséré au moment où il doit parler rate la PREMIÈRE transition — la seule qui compte.
  Le conteneur reste monté et on VIDE son texte (trois exemples corrects dans le dépôt, dont un qui
  écrit la règle). ⚠️ J'avais copié le voisin IMMÉDIAT, qui portait le même défaut : quand un patron
  existe en plusieurs exemplaires, copier celui qui porte sa JUSTIFICATION écrite. Et la garde doit
  asserter que le conteneur existe **déjà quand il n'y a rien à annoncer**, sinon elle est satisfaite
  par la version fautive (`COPIER-LE-VOISIN-N-EST-PAS-COPIER-LE-BON-PATRON`).
- **Trois oublis d'affilée dans une liste blanche disent que c'est la FORME qui est fausse** : ma
  garde d'entrée énumérait les champs à vérifier, et trois passes ont trouvé trois canaux
  money-critical manquants (−95 % à −99 %). Le correctif n'est pas un quatrième ajout mais
  l'INVERSION : scanner tout ce qui est produit, et **déclarer les exclusions** — autorisé par une
  mesure (zéro non-fini sur les sept personas), jamais par confiance.
  ⚠️⚠️ Et « scanner tout » se vérifie sur l'OBJET SCANNÉ : mon premier filet « récursif » lisait le
  littéral de huit clés construit pour l'appeler, donc la liste blanche n'avait pas disparu — elle
  avait monté d'un cran, du module vers son site d'appel, et les deux canaux que j'annonçais fermer
  restaient ouverts (`projection.inflationRate = NaN` → 0 refus, **−98,8 %**). Une garde se branche sur
  l'objet réellement remis en aval, jamais sur une projection de cet objet.
  ⚠️ Deux corollaires : un prédicat de finitude est aveugle au TYPE (le vecteur est un `JSON.parse`
  non typé — `"1e999"` en chaîne traverse sans jamais devenir non fini, −95 % mesuré), et **un
  mécanisme central sans test est un mécanisme dont personne ne sait s'il fonctionne** : seize tests
  étaient verts sur ce filet inopérant (`CINQ-TROUS-DANS-UNE-GARDE-ET-AUCUN-FAUX-POSITIF`).
  ⚠️⚠️ **Et l'inversion elle-même n'a pas supprimé la liste — elle lui a fait changer d'AXE** (4ᵉ passe) :
  scanner tout couvre la FINITUDE de tout l'objet, mais le TYPE n'est vérifié que sur les champs
  NOMMÉS. Une chaîne dans un champ monétaire traverse le filet (`typeof !== 'number'` → on descend
  ou on sort), et le vecteur est le même `JSON.parse` non typé : mesuré, une chaîne dans un montant
  de projet immobilier fait **−52 %**, zéro refus, zéro non-fini publié. Le correctif est à la
  SOURCE — et il y a DEUX sources non validées, pas une : le backup JSON et le blob du store
  (`financeai-storage`, le seul vecteur de `projection`) —, pas dans un cinquième ajout à la garde
  (`[BACKUP-SCHEMA-NON-TYPE]`). Le bon test n'est pas « reste-t-il une liste ? » mais **« qu'est-ce
  que son oubli coûte ? »** — un message moins précis se tolère, un canal money-critical rouvert non
  (`INVERSER-LA-GARDE-NE-SUPPRIME-PAS-LA-LISTE-ELLE-LUI-FAIT-CHANGER-D-AXE`).
  ⚠️ Corollaire de MESURE : « zéro refus sur les sept personas » ne prouvait rien de la surface
  ajoutée — **aucun persona ne porte `projection`** (le store l'apporte au montage), donc le contrôle
  portait sur un objet plus ÉTROIT que la production. Un contrôle se fait sur l'objet de PROD.
- **Un déplacement d'import qui rend ASYNCHRONE n'est pas un déplacement** : convertir quatre imports
  statiques de `marketData` en `import()` sortirait 67 Ko du chunk d'entrée — mais
  `configureMarketDataProvider` (effet réactif à la clé API) et `getQuote` (trois autres fichiers) ne
  seraient plus ordonnés : une cotation avant la pose de la clé se replie **sans rien dire**. La
  bonne forme se déduit du risque — faire du MODULE le porteur de sa configuration (promesse
  mémoïsée), au lieu de disperser des `await` chez les appelants
  (`PERF-REFACTOR-A-RISQUE-DE-COURSE`).
- **Un ticket peut décrire un défaut DÉJÀ corrigé sous un autre ID** — et le coût n'est pas le
  ticket en trop, c'est **le chiffre qu'il porte** : « 530 ticks CPU, 2,6 % du profil » mesurait une
  construction de chaîne supprimée trois semaines plus tôt. Repris tel quel, il aurait justifié un
  lot pour un gain nul. Parade : grep le code AVANT de coder, et faire confiance à un commentaire
  qui porte un ID de lot — c'est à ça qu'ils servent
  (`UN-TICKET-PEUT-DECRIRE-UN-DEFAUT-DEJA-CORRIGE-SOUS-UN-AUTRE-ID`, classe `PM-STALE-BACKLOG`).
- **Retirer un calcul JETÉ se prouve avant de se faire** (jumeau du piège « un bug peut viser du code
  dont la sortie est jetée ») : compter les lecteurs de CHAQUE grandeur, vérifier la pureté du
  producteur contre le code, puis prouver l'équivalence de sortie par empreinte. ⚠️ La condition de
  saut s'EXPORTE, jamais ne se recopie — deux écritures divergent en silence. Et un test de perf se
  fait par ESPION (« appelé zéro fois »), pas par chronomètre : binaire, stable en CI, et il vérifie
  les DEUX sens, sinon un producteur débranché partout donne le même vert
  (`RETIRER-UN-CALCUL-JETE-SE-PROUVE-AVANT-DE-SE-FAIRE`).
- **Des tests rouges qui encodent une CONCEPTION ne se re-basent pas** : un golden qui rougit dit
  « la valeur a changé, confirme-la » ; un invariant qui rougit dit « ton changement contredit une
  décision ». Même couleur dans la sortie — les séparer demande de LIRE ce que le test affirme.
  Vécu sur `[ESTATE-NPV-BASE-REELLE]` : le finding est réel et chiffré (22 % de VAN surévaluée,
  RRQ seul, signature du prorata), mais changer la base de la VAN fait tomber 5 invariants du lot
  précédent — le vrai périmètre est le COUPLE (VAN, assiette), pas une base. Correctif REMIS et
  ticket enrichi plutôt que livré à moitié : un demi-correctif money-critical déplace un chiffre
  faux au lieu de le corriger (`DES-TESTS-ROUGES-QUI-ENCODENT-UNE-CONCEPTION-NE-SE-RE-BASENT-PAS`).
- **Le contexte d'un défaut CSS vit chez l'ANCÊTRE** : `outline-none` sans remplacement est un vrai
  défaut WCAG — sauf quand le conteneur porte `focus-within:`, ce qu'un scan par ligne ne voit pas
  (4 faux positifs sur 13 candidats, plus un compensé par `focus:bg-`). Corollaires : le correctif se
  choisit selon le contexte (conteneur vs contrôle), et la garde se bâtit sur une LISTE d'exemptions
  nominatives — un automate qui remonte les ancêtres JSX finit désactivé par ses faux positifs
  (`LE-CONTEXTE-D-UN-DEFAUT-CSS-VIT-CHEZ-L-ANCETRE`).
- ⚠️ **Écrire un ticket, c'est PUBLIER une affirmation** : j'ai annoncé dans cinq documents — dont le
  `CHANGELOG` qui parle à Marc — que « l'écran affiche RRQ 70 ans alors que le moteur applique 72 ».
  L'écran ne l'affiche pas : `delayPensions` est `false` dans les 11 définitions de `scenarios.ts`,
  donc le repli `?? 70` n'est jamais évalué. Le commentaire du code le disait TROIS LIGNES au-dessus
  du site. L'atteignabilité d'un chemin se MESURE avant d'être annoncée — la règle « un bug confirmé
  peut viser du code dont la sortie est jetée » vaut aussi quand on se contente de ROUTER le bug, et
  un `CHANGELOG` qui décrit un défaut que l'utilisateur ne subit pas est pire qu'un ticket de trop
  (`UNE-AFFIRMATION-D-ATTEIGNABILITE-SE-MESURE-AVANT-D-ETRE-PUBLIEE`).
- **Une perturbation muette sur SON PROPRE ajout du jour mesure d'abord sa REDONDANCE** — pas un
  défaut d'assertion : retirer le `htmlFor` que je venais de poser laissait 12 tests verts, parce que
  le `<label>` qui ENVELOPPE nommait déjà le `<button>` de la primitive (`button` est labelable). Les
  deux hypothèses expliquent le même silence, et seule « mon test est trop faible » est flatteuse.
  Corollaire de conduite : garder l'attribut s'il rend le lien robuste à un refactor, mais ÉCRIRE sa
  redondance, et faire porter au test le FAIT plutôt que le mécanisme
  (`UNE-PERTURBATION-MUETTE-SUR-SON-PROPRE-AJOUT-MESURE-SA-REDONDANCE`).
- **Un montant INTERPOLÉ dans une phrase n'est plus un nœud** — donc plus masquable : `parts` était
  un `string[]` de `« +1 200 $ cotisé »`, et aucun `<PrivateAmount>` ne peut envelopper ça. Là où une
  valeur sensible finira masquée, elle doit rester une DONNÉE jusqu'au rendu (`{ montant, libelle }`).
  ⚠️ Et pour un texte construit par le MOTEUR, qui porte le montant à l'intérieur et interpole du
  texte UTILISATEUR : ni clair, ni regex — **garder le FAIT, taire le DÉTAIL** (« 2 événements ce
  mois-ci »). ⚠️ Corollaire de test : `formatCAD` sépare les milliers par une espace **insécable**
  (U+00A0), donc un `not.toContain('90 000')` écrit avec une espace ordinaire est VACUEUX — mesuré,
  la perturbation laissait les 4 tests verts. Normaliser les espaces avant toute assertion sur un
  montant rendu (`UN-MONTANT-INTERPOLE-DANS-UNE-CHAINE-N-EST-PLUS-UN-NOEUD`).
- ⚠️ **`cat >` court-circuite le garde-fou d'écrasement de `Write`** : j'ai créé « mon » fichier de
  garde `PropertyConfigurator.privacy.test.tsx` — il existait déjà (49 lignes, 3 cas), et je l'ai
  écrasé. Vu au `git diff --stat` (« 56 deletions » sur un fichier réputé neuf), rattrapé par
  `git show HEAD:<fichier>` puis FUSION. Le nom « évident » d'une garde est celui qu'une garde
  précédente a déjà pris. ⚠️ Et ce test PORTAIT le constat du défaut (« le plafond n'est PAS
  masqué ») : restauré, il rougissait tout seul sur le correctif. **Un test qui documente une limite
  connue est un inventaire de dette — l'écraser supprime le signal, pas la dette**
  (`UN-FICHIER-DE-TEST-QUI-SEMBLE-NEUF-EXISTE-PEUT-ETRE-DEJA`).
- **Une garde ancre le FAIT qu'elle défend, jamais la FORME qu'avait le code** : `taxBracketVizAnnee`
  ancrait `useMemo(() => new Date().getFullYear())` et a rougi quand le lot suivant a eu besoin du
  MOIS — rien de ce qu'elle défend n'avait bougé. **Deuxième fois pour la même assertion** (son
  commentaire raconte déjà le premier épisode). Elle compte désormais `new Date(`, ce qui est plus
  fidèle à son intention ET plus strict : l'ancien motif aurait laissé passer un
  `new Date().getMonth()` ajouté à côté. Une garde de forme coûte un aller-retour à chaque évolution
  et apprend à être ignorée (`UNE-GARDE-ANCRE-LE-FAIT-JAMAIS-LA-FORME-QU-AVAIT-LE-CODE`).
- **Une exclusion de périmètre se justifie par ce que le fichier CONTIENT, jamais par son RÔLE** :
  `services/projection.ts` était exclu du ratchet fiscal parce que « c'est l'orchestrateur, le travail
  fiscal vit dans les sous-modules ». Vrai des BARÈMES, faux des **bornes d'âge**, qui se décident
  dans la boucle — quatre règles légales y vivaient sans clé (18 résidence PSV, 65 fin
  d'accumulation, 60 taux au survivant, 70 report RRQ). Un rôle bien décrit rend l'exclusion d'autant
  moins relue. ⚠️ Et une clé `(fichier, valeur)` FUSIONNE les sens : `65` y recouvre trois règles
  légales ET un défaut de saisie ; la marque `[≠N]` compte les OCCURRENCES, pas les sens.
  ⚠️ Corollaire d'outillage, 2ᵉ fois en deux lots : **un contrôle de perturbation doit viser la même
  PORTÉE que la perturbation** — mon `assert` cherchait la chaîne retirée dans tout le fichier, où
  elle figure aussi dans vingt entrées d'inventaire, et a donc levé sur un retrait réussi
  (`UN-PERIMETRE-EXCLU-SE-JUSTIFIE-PAR-CE-QU-IL-CONTIENT-PAS-PAR-SON-ROLE`).
- **Un outil plus CORRECT casse ce qui dépendait de son approximation** : consolider les 15
  décommenteurs ad hoc vers `utils/stripComments.ts` a fait perdre une paire label/champ à une garde
  (40 → **39**, en silence) — la source unique est un décommenteur JS, elle blanchit le bloc mais
  LAISSE les accolades d'un commentaire JSX, que les copies retiraient. D'où `stripCommentsJsx`.
  ⚠️ Et sa sémantique diffère : elle BLANCHIT au lieu de supprimer, donc **toute anti-vacuité écrite
  `expect(code.length).toBeGreaterThan(…)` devient TAUTOLOGIQUE et reste VERTE** (4 refondées sur
  `partDeCodeRestante`). Une migration qui change la sémantique d'un helper doit auditer tout ce qui
  MESURE sa sortie, pas seulement ce qui l'appelle. Coût du statu quo, mesuré : 154 fichiers sur 458
  traités différemment, dont 5 où l'ad hoc mangeait du code (`'https://…'` coupé au `//`).
  ⚠️ Corollaires d'outillage : un commentaire de BLOC qui CITE le marqueur de fin de commentaire se
  ferme sur sa citation (erreur de compilation) ; un fragment JSX isolé met l'automate en état
  « regex » et ne prouve donc RIEN — la discrimination se mesure sur le vrai fichier
  (`UN-OUTIL-PLUS-CORRECT-CASSE-CE-QUI-DEPENDAIT-DE-SON-APPROXIMATION`).
- **Un nom manquant est une propriété du CONTRÔLE, pas du label** : mon propre ticket comptait les
  `<label>` non associés (59/16 fichiers) parce que c'est ce que le lot précédent avait corrigé.
  WCAG 4.1.2 porte sur le CONTRÔLE — recensé là, le périmètre devient 40 réels, et les deux listes ne
  se recouvrent pas : 13 « orphelins » de `ProjectionControls` n'étaient PAS un défaut (leurs sliders
  ont un `aria-label`), et le ticket ratait trois sites qu'aucun `<label>` ne signalait (`<span>`
  voisin, `placeholder` seul, `id` sans `htmlFor`). **Quand un ticket compte un SYMPTÔME, vérifier
  qu'il est le défaut** — compter les indices sur-compte ET sous-compte à la fois. Une garde doit
  connaître les QUATRE façons légitimes de nommer (`aria-label`, `aria-labelledby`, `htmlFor`/`id`,
  `<label>` ancêtre), et un `id` littéral ne vaut que hors d'une liste
  (`UN-NOM-MANQUANT-EST-UNE-PROPRIETE-DU-CONTROLE-PAS-DU-LABEL`).
- **Un attribut PRÉSENT ne prouve pas qu'il désigne la bonne chose** : dériver chaque `id` de la clé
  du champ a posé deux fois `app-returnRates` (clé `projection.returnRates`, commune au rendement
  crypto et au cash) — les deux labels pointaient le MÊME contrôle, et un scan d'orphelins n'y voyait
  rien puisque chaque label avait bien son `htmlFor` vers un `id` existant. Présence et UNICITÉ sont
  deux assertions distinctes. Interroger le nom ACCESSIBLE (`getByLabelText`), jamais l'attribut.
  ⚠️ Et quand une convention n'est appliquée qu'à un SOUS-ENSEMBLE, chercher le besoin technique qui
  l'a introduite : les 14 champs monétaires du même fichier étaient câblés pour le mode discret, les
  26 autres pas — le besoin technique délimitait exactement la couverture. ⚠️ Corollaire symétrique :
  un test voisin sélectionnait `label[for^="app-"]` et exigeait 14 — le préfixe ne désignait « les
  montants » que par ACCIDENT, et le lot l'a fait passer à 36. **Un test qui rougit sur un lot qui ne
  touche pas son objet mesurait un PROXY** : re-dériver le sélecteur de l'ensemble qu'il prétend
  couvrir, jamais rebaser son compte (`UN-ATTRIBUT-PRESENT-NE-PROUVE-PAS-QU-IL-DESIGNE-LA-BONNE-CHOSE`).
- **Un recenseur se vérifie autant que le code qu'il recense** : mon scan des cibles tactiles s'est
  trompé QUATRE fois avant d'être juste — accolades JSX non retirées récursivement (4 boutons
  manqués), `min-w-[24px]` non reconnu (2 faux positifs sur du code déjà sain), libellé dynamique
  `{title}` compté comme « pas de texte » (7 faux positifs), `indexOf('>')` tombant sur la flèche
  d'une lambda. Un scan heuristique sur du JSX se paie d'une relecture à la main de CE QU'IL SORT
  **et** de ce qu'il ne sort pas (`UN-RECENSEUR-SE-VERIFIE-AUTANT-QUE-LE-CODE-QU-IL-RECENSE`).
- **Le périmètre d'un ticket se RECENSE, il ne se cite pas** : un ticket a11y annonçait 5 sites, le
  scan en a montré 8 — un fichier non nommé, un site disparu, et **un faux offender** (un halo
  décoratif qu'il ne fallait surtout pas « corriger »). Les numéros de ligne d'un vieux ticket sont
  périmés par construction. ⚠️ Corollaire inverse : quand un ticket explique *pourquoi* la solution
  évidente est fausse, cette phrase vaut plus que sa description du défaut — ici, mettre `tabIndex`
  sur le span aurait laissé un contrôle interactif dans un `<button>` et fait déclencher DEUX
  actions par Entrée (`UN-PERIMETRE-CITE-N-EST-PAS-UN-PERIMETRE-RECENSE`).
- **Une liste se dérive de CHAQUE surface qu'elle garde** : ma liste des champs textuels croisait
  deux sources (les types, les états du dépôt) — mais les deux regardaient l'`AppState`, et la garde
  protège AUSSI le format de backup. Le premier test réaliste a refusé `version: '3.2'`, une clé
  légitime. ⚠️ Corollaires du même lot : **le point de branchement se lit dans le code de la lib**
  (`migrate` de zustand n'est appelé que si la version DIFFÈRE — une garde posée là est inopérante
  pour le blob de tous les jours ; c'est `merge` qui passe à chaque fois) ; **un test qui écrit sur
  un champ INEXISTANT rend un faux « ça passe »** ; et un contrôle d'anti-vacuité placé APRÈS un cas
  d'échec peut lire l'état du précédent (`getHydrationStatus` est monotone)
  (`UNE-LISTE-SE-DERIVE-DE-CHAQUE-SURFACE-QU-ELLE-GARDE`).
- **Une garde qui ne peut pas TIRER n'est pas une protection** : mon contrôle sur le solde de départ
  était structurellement mort (le ledger écarte les non-finis et rend toujours un total fini),
  pendant que la corruption passait — la vraie porte existait déjà (`termesFautifs`,
  `TRACER-AU-LIEU-DE-JETER-DESARME-LA-GARDE-AVAL`). Une garde morte se retire ou s'ANNOTE, sinon elle
  compte comme protection dans tout inventaire futur. ⚠️ Deux corollaires du même lot : le mode
  « absorbé » a plusieurs OPÉRATEURS (`Math.max(0, …)` rabat `−Infinity` sur 0 exactement comme
  `|| 0` rabat un `NaN` — écart mesuré bien plus grand), et **« le point de passage unique » se
  vérifie en comptant les appelants** (la mienne en couvrait 1 sur 5 ; les outils MCP servaient −96 %
  à un LLM) (`CINQ-TROUS-DANS-UNE-GARDE-ET-AUCUN-FAUX-POSITIF`).
- **« L'appel n'a PAS eu lieu » se lit APRÈS le budget de temps** : ma garde espionnait le moteur et
  asserait `not.toHaveBeenCalled()` dès que le statut basculait — elle passait aussi SANS le
  blocage, le lancement étant debouncé à 300 ms. Le test mesurait la latence. Faux timers, plus le
  cas SAIN dans le même budget comme contrôle (sans lui, un espion jamais câblé donne le même vert).
  ⚠️ Corollaire de garde d'ENTRÉE : refuser ne suffit pas, il faut **EFFACER** ce qui a déjà été
  publié — sinon la valeur calculée avant la corruption reste la source unique de tous les écrans
  (`UNE-PERTURBATION-PEUT-ETRE-MUETTE-PAR-DEBOUNCE`).
- **N tests rouges sur le code d'avant ne font pas N preuves** : mes trois gardes a11y rougissaient
  3/3, mais DEUX rougissaient pour la raison de la TROISIÈME — le correctif du nom accessible change
  le sélecteur, donc le test du `role="status"` échouait sur « champ introuvable » avant d'observer
  quoi que ce soit. La preuve se fait en N perturbations SÉPARÉES, le contrôle étant que **seul** le
  test visé rougit. ⚠️ Et pour une assertion de DISTINCTION, la perturbation doit **satisfaire encore
  le sélecteur** (cinq noms au bon préfixe mais identiques) — sinon elle prouve « le nom a changé »,
  pas « les noms sont distincts » (`TROIS-TESTS-ROUGES-NE-FONT-PAS-TROIS-PREUVES`).
- ⚠️ **Un paramètre TYPÉ `undefined` est une décision, pas un oubli** : `latentTax` déclarait
  `ageOpts?: undefined` — le module ne POUVAIT pas transmettre l'âge, et aucun grep de valeur ni lint
  ne le signale. Mesuré : **1 854 $ de dette fiscale latente manquante par déclarant 65+** (le crédit
  allège la facture de BASE mais pas la LIQUIDATION, or le latent est leur ÉCART). ⚠️ Le ticket avait
  raison sur le défaut, tort sur le remède (« contextes par définition 65+ ») : on transmet la VÉRITÉ
  — l'âge réel — et le calcul applique son propre seuil (mesuré : 0,00 $ à 60 ans). ⚠️ La « source
  unique » qu'il désignait était une CLOSURE, donc inatteignable → part pension (280 $) ROUTÉE.
  ⚠️ `hasSpouse` voyage AVEC l'âge (absence = « vit seul » ⇒ couple sur-crédité de ~305 $/tête).
  ⚠️ **Le ratchet fiscal a arrêté mon correctif** (7ᵉ littéral `30`) : la réponse n'était pas de
  déclarer l'occurrence mais de HISSER l'expression en source unique — un garde-fou qui rougit sur un
  ajout légitime pose souvent la bonne question. ⚠️ 2ᵉ garde vacueuse de la session : comparer deux
  grandeurs qui diffèrent DÉJÀ par autre chose ne mesure rien — OBSERVER l'argument
  (`UN-PARAMETRE-TYPE-UNDEFINED-EST-UNE-DECISION-PAS-UN-OUBLI`).
- ⚠️ **Une fenêtre d'exposition se mesure par ce qui la FERME, pas par ce qui l'ouvre** : le ticket
  disait « les clés restent en clair jusqu'au prochain push » — rassurant, et faux : le pull écrit
  délibérément une meta qui fait voir l'état INCHANGÉ (« pas de push parasite, donc pas d'effacement
  des clés »), donc sans modification le blob reste en clair INDÉFINIMENT. Le mécanisme de fermeture
  se lit dans le code, jamais dans la formule. ⚠️ Ici **le correctif était plus dangereux que le
  défaut** (pousser sans clés en main les EFFACE de Drive) → trois conditions et trois cas NÉGATIFS
  qui pèsent autant que le positif. ⚠️ **Devant un drapeau GLOBAL, demander ce qu'il protège
  AILLEURS avant de le poser** : mon `markApiKeysHydrated()` « par sécurité » désarmait la protection
  anti-race du boot pour toute la session (un test existant l'a dit), et était inutile. ⚠️⚠️ Une de
  mes 4 gardes était VACUEUSE : fixture au chiffré BIDON ⇒ c'est `hasAnyKey` qui bloquait, pas la
  condition testée — perturber CHAQUE condition séparément, une fixture d'échec « crédible » sature
  souvent une autre contrainte
  (`UNE-FENETRE-D-EXPOSITION-SE-MESURE-PAR-CE-QUI-LA-FERME-PAS-PAR-CE-QUI-L-OUVRE`).
- ⚠️ **Une clé se dérive de ce qui IDENTIFIE, pas de ce qu'on AFFICHE** : `['L','M','M',…]` avec
  `key={d}` donnait deux clés `M` — la lettre est un rendu, le jour est l'identité, et les confondre
  ne marche que tant que l'abréviation est injective (par accident). Le `key={i}` que proposait le
  ticket est correct sur une liste statique et faux dès qu'elle devient dynamique. ⚠️ **Un
  avertissement PERMANENT est un avertissement mort** — son coût n'est pas le bruit mais la surdité
  qu'il installe. ⚠️ Le balayage se publie même quand il ne trouve presque rien (27 sites, 1 offender,
  2 déjà dédoublonnés AVEC leur commentaire : la classe était comprise, c'était le reliquat).
  ⚠️ Garde COMPORTEMENTALE (aucun scan ne juge l'unicité en général) + anti-vacuité : un 2ᵉ cas rend
  `['A','B','B']` et exige que l'espion le VOIE — sinon un espion mal câblé rend la garde verte quoi
  qu'il arrive (`UNE-CLE-SE-DERIVE-DE-CE-QUI-IDENTIFIE-PAS-DE-CE-QU-ON-AFFICHE`).
- ⚠️ **Un écran ne peut affirmer que ce que ses SOURCES lui donnent** : l'état vide du graphe
  « Évolution » conseillait « vérifie ta clé Finnhub » — or son hook ne fait AUCUN réseau (il dérive
  du store), et sans clé le repli gratuit EST le chemin normal : on envoyait chercher une clé jamais
  possédée. Devant un texte d'état vide, demander **d'où viendrait l'information qui rend cette
  phrase vraie** ; ici elle existait (rapport d'hydratation publié même quand rien n'a été hydraté)
  mais n'était pas branchée. ⚠️ TROIS états, pas deux — la promesse « la courbe arrive toute seule »
  est VRAIE pendant la synchro et fausse après un échec ; la supprimer partout retirerait une
  information juste. ⚠️ Et après avoir corrigé un message à sa SOURCE, **grep la phrase corrigée** :
  ses copies de REPLI vivent chez les lecteurs (celle de l'écran Diagnostic recopiait la promesse
  retirée au lot 80) (`UN-ECRAN-NE-PEUT-AFFIRMER-QUE-CE-QUE-SES-SOURCES-LUI-DONNENT`).
- ⚠️ **Un message qui promet une résolution AUTOMATIQUE est une affirmation sur l'AVENIR** : le
  diagnostic d'historique annonçait « nouvel essai automatique au prochain chargement » — vrai d'un
  quota ou d'une coupure réseau, **FAUX d'une clé refusée**, où aucun rechargement ne réussira jamais.
  Chercher les phrases de cette famille (« réessaie plus tard », « au prochain démarrage ») et
  demander sur quelles CAUSES elles sont fausses. ⚠️ **Deuxième mauvais cadrage du MÊME ticket, en
  sens inverse** : au lot 78 j'avais mis la perte trop HAUT, ici je l'ai décrite trop LARGE (« aucun
  écran ne peut la nommer » — un écran la nommait déjà). Même origine : ticket écrit en regardant la
  couche qu'on vient de corriger. **Un ticket se recense DEPUIS L'ÉCRAN, en descendant.** ⚠️ La
  dépendance a été rendue REQUISE (25 sites énumérés par le compilateur) : une porte optionnelle
  laisse la production reprendre la version muette en silence. ⚠️ Le FAIT se partage
  (`causePermanente`), le TEXTE non — deux écrans n'ont pas la même action à proposer. ⚠️ Piège né du
  lot précédent : `findByRole('status')` est satisfait INSTANTANÉMENT par une région live vide montée
  en permanence — attendre le NŒUD du message. ⚠️⚠️ **Publier une valeur jusque-là JETÉE transforme
  chacune de ses approximations en AFFIRMATION** : le provider mappait `401 || 403` sur `AUTH`, anodin
  tant que personne ne lisait — mais Finnhub rend 403 quand la clé est BONNE et que le FORFAIT ne
  couvre pas l'appel (chandelles premium, cotations européennes gratuites), donc le message aurait
  envoyé corriger une clé valide. Avant de faire remonter une classification, relire COMMENT elle a
  été remplie ; ici c'est un test existant, dont le titre portait le fait, qui l'a démasqué
  (`UN-MESSAGE-QUI-PROMET-UNE-RESOLUTION-AUTOMATIQUE-EST-UNE-AFFIRMATION-SUR-L-AVENIR`).
- ⚠️ **Un ticket de DÉPENDANCES décrit un arbre qui bouge tout seul** : deux tickets affirmaient un
  état des paquets, faux au moment de les appliquer — `fast-uri` était DÉJÀ en 3.1.5 (la version
  exacte réclamée, avis disparu de `npm audit`), et la migration « breaking » vers `eslint@10` que
  `[DEP-ESLINT10]` présentait comme le seul remède s'est révélée inutile (`npm audit fix` SIMPLE
  suffit). Un ticket de code pourrit quand le code change ; un ticket de dépendances pourrit tout
  seul — il se RE-MESURE (`npm ls`, `npm audit`), jamais ne se relit. ⚠️ Rejouer l'outil a sorti
  4 avis non nommés. ⚠️ Le risque n'est pas où l'étiquette le dit : ces avis sont du DoS d'OUTILLAGE,
  mais `browserslist`/`caniuse-lite` du même diff pilotent la sortie CSS → gate COMPLET avec build
  propre. ⚠️ Et **aucune garde neuve, délibérément** : un test qui lance `npm audit` rougit au
  prochain avis publié sans qu'une ligne ait changé — une bombe
  (`UN-TICKET-DE-DEPENDANCES-DECRIT-UN-ARBRE-QUI-BOUGE-TOUT-SEUL`).
- ⚠️ **Un correctif posé à l'étage où on a vu le SYMPTÔME peut être inatteignable** : j'ai écrit le
  ticket jumeau de `[AI-FINNHUB-CAUSE-COLLAPSE]` en recopiant son diagnostic (« la façade fait
  `catch { return [] }` ») — vrai, mais au MAUVAIS étage : `FinnhubProvider.searchSymbol` attrapait
  et rendait `[]` lui-même, un cran plus bas. Mon correctif de façade était donc exactement le défaut
  que le lot précédent venait de condamner. Ce qui l'a démasqué est l'ORDRE : garde comportementale
  sur le VRAI module écrite et lancée AVANT de supposer la réussite (4 rouges). Le diagnostic d'un
  ticket JUMEAU se re-mesure sur SON code — deux surfaces d'un même symptôme n'ont pas la même
  profondeur de perte (`UN-CORRECTIF-POSE-A-L-ETAGE-OU-ON-A-VU-LE-SYMPTOME-PEUT-ETRE-INATTEIGNABLE`).
  ⚠️ Corollaire de recensement : **une mesure qui CONFIRME se publie autant qu'une réfutation** —
  après trois tickets faux, `[A11Y-RESERVE-CHIP-PROMINENCE]` était exact au centième (1,17 / 1,83 /
  8,82 / 10,86) ; c'est sa CONCLUSION qui était fausse (WCAG 1.4.11 ne s'applique pas à une pastille
  dont l'état est écrit en toutes lettres).
- ⚠️ **Un sélecteur se restreint sur la DÉRIVÉE, pas sur les champs sources** : le ticket demandait
  « un sélecteur restreint aux champs RÉELLEMENT lus » — inapplicable, les champs lus sont décidés par
  `REQUIREMENTS[*].isMet`, HORS du composant ; les recopier ferait qu'un prérequis futur cesserait
  SILENCIEUSEMENT de rafraîchir l'écran (donnée périmée ≫ rendu en trop). Le bon patron vivait 40
  lignes plus loin (`MissingDataChecklist`, `[PERF-MISSINGDATA]`) : `useShallow` sur le RÉSULTAT
  dérivé — le sélecteur tourne encore, c'est le RENDU qui s'arrête. ⚠️ `useShallow` sur un tableau
  d'OBJETS est VACUEUX (jamais shallow-égal) → dérivée PLATE, objets reconstruits après. ⚠️ Et une
  garde de perf a besoin de son LEVIER : « aucun rendu inutile » est trivialement vrai d'un composant
  qui ne se met jamais à jour (mesuré `React.Profiler` : 2 écritures sans rapport → 2 rendus avant,
  0 après ; le levier rend toujours)
  (`UN-SELECTEUR-SE-RESTREINT-SUR-LA-DERIVEE-PAS-SUR-LES-CHAMPS-SOURCES`).
- ⚠️ **Un avertissement de lint est un SYMPTÔME, pas une gravité** : le ticket annonçait « 2
  violations `exhaustive-deps`, dette technique » ; rejoué, l'outil en sort **4**, et les deux non
  nommées étaient une **fuite de vie privée** — `isPrivacyMode` absent des deps de deux `useCallback`
  de `Planning.tsx`, or basculer le mode ne change rien d'autre dans leurs deps. Mesuré : bouton
  « Épingler **Marchand masqué** », toast « **Netflix** épinglé » — le correctif #645 annulé dans le
  cas exact qu'il visait. La gravité se lit dans ce que la variable manquante CONTRÔLE, jamais dans la
  règle violée. ⚠️ Une fermeture périmée se voit au **CONTRASTE** (le JSX se re-rend, la fonction
  mémorisée non) : la garde vise ce qui SORT, avec le contraste comme anti-vacuité. ⚠️ Une correction
  **INERTE** (ref stable, `useCallback(…, [])`) s'ÉCRIT comme telle plutôt que couverte par une
  fixture qui n'exerce rien. ⚠️ Et le basculement `warn` → `error` est un arbitrage de POLITIQUE :
  mesurer (0 violation restante ⇒ gratuit aujourd'hui) et router, pas trancher
  (`UN-AVERTISSEMENT-DE-LINT-EST-UN-SYMPTOME-PAS-UNE-GRAVITE`).
- ⚠️ **Une cause CLASSÉE puis JETÉE est une cause absente** : le ticket réclamait « un classificateur
  côté `marketData` » — chaque provider en posait déjà un (`MarketDataError.code`), et la façade le
  LISAIT (`e.code !== 'NOT_FOUND'`) avant de rendre `null`. Il manquait le FIL, pas le tri. Mesuré sur
  le vrai module (seul `fetch` simulé) : 401, 429, réseau et symbole inconnu rendaient tous `null`
  **sans lever** — donc le `catch` que le ticket voulait faire parler était INATTEIGNABLE, et le
  message réel envoyait vérifier une clé sur une coupure réseau. ⚠️⚠️ La garde censée protéger cette
  distinction était nourrie par un **faux module qui MENTAIT** (`getQuote` simulé en REJETANT, contrat
  jamais eu en prod) : un faux module encode le contrat qu'on CROIT avoir — quand c'est cette croyance
  qui est fausse, le test confirme l'erreur. Le contrat d'erreur d'une façade se mesure au moins une
  fois sur le VRAI module. ⚠️ Le périmètre se recense **par l'endroit où l'information disparaît** :
  trois surfaces d'un même symptôme, trois profondeurs (façade → livré ; DANS le provider → routé ;
  hook sans réseau au champ `error` nul en dur → routé)
  (`UNE-CAUSE-CLASSEE-PUIS-JETEE-EST-UNE-CAUSE-ABSENTE`).
- ⚠️ **Un service qui rend la même valeur pour N situations rend son écran MUET** :
  `getRebalanceJustifications` répondait `[]` pour « aucune clé », « rien à justifier », « erreur
  d'appel » et « le modèle n'a rien rendu ». Aucun message ne pouvait alors être juste — la
  correction n'était pas dans le composant mais deux appels plus haut. Le résultat porte sa CAUSE
  (union discriminée + l'objet d'erreur ORIGINAL, c'est son `.status` qui nomme). ⚠️ Et le contrat
  d'erreur se DÉCIDE : ce service ENCODE l'échec au lieu de LEVER parce que son unique appelant est
  un `onClick` en ligne sans `try/catch` — passer au « lève » aurait transformé une panne réseau en
  erreur non capturée. ⚠️ Corollaire d'inventaire : la garde qui portait cette limite s'est
  INVERSÉE au même endroit plutôt que de disparaître — une dette payée laisse sa trace là où elle
  vivait (`UN-SERVICE-QUI-REND-LA-MEME-VALEUR-POUR-N-SITUATIONS-REND-SON-ECRAN-MUET`).
- ⚠️ **Avant de retirer un export mort, regarder ce que la DOC en dit — pas seulement qui l'appelle** :
  `calculateNetFromGross` n'avait aucun appelant, mais `docs/FISCAL_REFERENCE.md` la citait comme
  « la source unique de conversion brut→net du dépôt » dans une PREUVE d'auto-cohérence. La supprimer
  sans toucher la doc aurait laissé la source de vérité fiscale appuyer une démonstration sur du
  vide. **Une source de vérité qui cite du code mort donne l'autorité d'une preuve à une phrase que
  plus rien ne soutient** — et la corriger se fait en séparant la CONCLUSION (ici inchangée, tenue
  par son test discriminant) de la CITATION (fausse). ⚠️ Corollaire : une fonction morte peut aussi
  être PIÉGÉE — celle-ci appelait `calculateFiscalReport` sans année, le défaut même que
  `[GROSSFROMNET-ANNEE-FIGEE]` avait corrigé sur son jumeau ; la réveiller aurait réintroduit un
  écart connu (`RETIRER-UN-EXPORT-MORT-DEMANDE-DE-LIRE-CE-QUE-LA-DOC-EN-DIT`).
- ⚠️ **Un commentaire qui réclame de la VIGILANCE est l'aveu qu'il manque une source unique** :
  `syncSnapshot.ts` portait « doit correspondre au `name` du persist Zustand et à backupAuto » —
  autrement dit `financeai-storage`, la clé qui porte TOUTES les données, était écrite en QUATRE
  endroits, et la garantie était que quelqu'un y pense. Un renommage appliqué à trois sur quatre
  ouvre l'app VIDE, sans rien de rouge. ⚠️ Et le critère de regroupement n'est PAS « il y a beaucoup
  de clés » mais « la même chaîne est écrite deux fois » : une clé à site unique n'a pas le défaut,
  et l'y forcer ajoute un import inutile — du bruit qui rend la règle plus facile à ignorer. Enfin,
  une duplication IRRÉDUCTIBLE (fichier hors bundle qui ne peut rien importer) ne se documente pas,
  elle se TESTE (`UN-COMMENTAIRE-QUI-RECLAME-DE-LA-VIGILANCE-EST-UNE-SOURCE-UNIQUE-MANQUANTE`).
- ⚠️ **Le remède d'un ticket peut ANNULER une décision antérieure** : « échec honnête plutôt
  qu'affichage de secours » aurait supprimé un repli DÉLIBÉRÉ, posé et commenté par
  `[BUDGET-AI-DUP-PARSING]` — jeter une réponse lisible pour cause de format est pire que la montrer.
  Avant d'appliquer un remède prescrit, grepper l'ID de lot dans le commentaire du code visé : c'est
  exactement à ça qu'ils servent. Et le vrai manque était le STATUT, pas le refus — troisième fois en
  trois lots (69, 70, 71) que la bonne réponse est « garder l'information, dire ce qu'elle vaut »
  (`LE-REMEDE-D-UN-TICKET-PEUT-ANNULER-UNE-DECISION-ANTERIEURE`).
- ⚠️ **Quand le correctif prescrit est hors de portée, livrer la moitié qu'on peut PROUVER et router
  l'autre** : « épingler des instantanés datés partout » exigeait d'inventer des identifiants de
  modèle — un mauvais id casse TOUS les appels, bien pire que la dérive qu'on corrige. Livré la
  seconde branche du ticket (dater la vérification, inventorier les alias, dire la nuance à l'écran),
  routé le reste à Marc avec la raison. ⚠️ Et la surveillance d'une péremption ne se fait PAS par un
  test qui lit l'horloge — il rougirait à une date sans qu'aucune ligne n'ait changé, c'est la
  définition d'une bombe. C'est un INVENTAIRE qui porte la dette, avec ses deux sens (aucun alias
  absent, aucune entrée qui n'est plus un alias)
  (`UNE-PEREMPTION-SE-SURVEILLE-PAR-UN-INVENTAIRE-PAS-PAR-L-HORLOGE`).
- ⚠️ **Une valeur non vérifiée ne doit pas porter l'HABILLAGE d'une valeur vérifiée** : le montant
  avancé par le modèle s'affichait en monospace verte encadrée — l'apparence exacte des montants
  d'impôt calculés du voisin immédiat. Le défaut n'est pas le mot (« estimée » y était) mais le
  STYLE : deux choses qui se ressemblent à l'écran et n'ont pas le même statut, c'est `no-fake-data`
  appliqué à la forme. Un libellé dit QUI parle, et le style cesse d'imiter le calculé
  (`UNE-VALEUR-NON-VERIFIEE-NE-PORTE-PAS-L-HABILLAGE-D-UNE-VALEUR-VERIFIEE`). ⚠️ Corollaire : une
  mention d'avertissement se compte — répétée par élément, elle devient du décor qu'on cesse de lire,
  donc son UNICITÉ s'asserte, et un contrôle vérifie qu'elle n'apparaît pas là où elle ne qualifie
  rien.
- ⚠️ **Un message d'erreur ne se corrige pas là où il s'affiche** : deux des huit surfaces écrivaient
  `catch { }` — sans LIER l'erreur, elles ne pouvaient rien dire d'autre que « vérifie ta clé », quoi
  qu'on écrive dans le composant. La première moitié du correctif est de CAPTURER. Et un texte
  affiché est une AFFIRMATION : « vérifie ta clé » sur une coupure réseau envoie corriger un champ
  qui n'a rien (`UN-MESSAGE-NE-SE-CORRIGE-PAS-LA-OU-IL-S-AFFICHE`). ⚠️ Corollaire : un classificateur
  qui existe déjà ne répond pas forcément à la question qu'on pose — `classifyCategorizeError` sert
  la REPRISE (`retryable` fusionne réseau et 429) ; le message a besoin d'une autre partition, dérivée
  du MÊME fait (`httpStatusOf`), pas d'une seconde lecture de l'erreur.
  ⚠️⚠️ **`\b` est ASCII en JavaScript** : `/\bcl[ée]\b/` ne matche JAMAIS « clé » suivi d'un espace —
  `é` n'est pas un caractère de mot, donc il n'y a aucune frontière. Ma garde rendait « aucun
  offender » sur un fichier qui portait la phrase, et c'est le test d'EXEMPTION qui l'a démasquée.
  Tout motif de scan sur du français se vérifie sur un accent.
- ⚠️ **`focus()` sur un CONTENEUR est un no-op SILENCIEUX** : un `<div>` ciblé par un deep-link n'est
  pas focalisable ; l'appel a l'air posé, la garde de source le voit, et il ne se passe rien. Il faut
  `tabIndex = -1` (atteignable par script, hors ordre de tabulation) — et le test interroge
  `document.activeElement`, jamais la présence de l'appel. Corollaires du même lot : un effet de
  navigation ne doit PAS tirer au PREMIER rendu (rouvrir l'app sur l'onglet mémorisé n'est pas une
  navigation — garder l'état précédent en `ref`), un re-rendu SANS changement ne doit rien refaire
  (sinon le focus saute en pleine saisie), et `preventScroll` est obligatoire quand un
  `scrollIntoView` fluide vient d'être lancé, sinon le focus le coupe net
  (`UN-FOCUS-SUR-UN-CONTENEUR-EST-UN-NO-OP-SILENCIEUX`).
- ⚠️ **Une primitive qui impose son focus initial n'est pas prête à accueillir un dialogue de
  SAISIE** : `ui/Modal` focalise le ✕ après 50 ms ; les trois dialogues de `BackupPanel` posaient
  `autoFocus` sur leur champ de passphrase, et la migration le leur aurait repris — une régression
  d'usage livrée SOUS COUVERT d'accessibilité. La primitive grandit AVANT la migration
  (`initialFocusRef`), jamais l'inverse. Signal : avant de migrer vers une primitive, lister ce que
  l'appelant faisait que la primitive DÉCIDE à sa place
  (`UNE-PRIMITIVE-QUI-IMPOSE-SON-FOCUS-N-ACCUEILLE-PAS-UN-DIALOGUE-DE-SAISIE`). ⚠️ Corollaire de
  garde : un écran MIGRÉ **disparaît** du scan qui cherchait le défaut (plus de `fixed inset-0`) —
  un test de présence ne dit alors rien de lui. Sa moitié se vérifie à l'envers : il consomme la
  primitive, et il n'a pas repris d'overlay à lui.
- ⚠️ **Un motif se re-perd par l'écran qui ressemble le MOINS aux autres** : `ui/SubTabs.tsx` est né
  de trois copies divergentes et les a corrigées — mais `FutureProjection`, dont l'habillage diffère
  (emoji au lieu d'icônes), est resté à part avec un motif ARIA incomplet. La bonne règle n'est pas
  « utilise le composant » (un écran peut vouloir son apparence) mais « emprunte les FABRICANTS et
  la LOGIQUE » : mêmes `tabId`/`panelId`, même gestionnaire de touches, exporté et jamais recopié —
  et la garde interdit la ré-implémentation, pas seulement l'absence
  (`UN-MOTIF-SE-REPERD-PAR-L-ECRAN-QUI-RESSEMBLE-LE-MOINS-AUX-AUTRES`). ⚠️ Corollaire de balisage :
  quand le contenu d'un onglet est éclaté en PLUSIEURS blocs conditionnels, un panneau par bloc fait
  des `id` EN DOUBLE — un panneau UNIQUE dont l'identité suit l'onglet actif est le seul qui ne mente
  pas. ⚠️ Et le contre-témoin d'une garde de scan est aussi utile que ses témoins : `Profile.tsx`
  ÉCRIT `role="tablist"` dans son en-tête sans en rendre aucun — c'est lui qui prouve que le
  décommentage a bien eu lieu.
- ⚠️ **Une propriété PAR GROUPE ne se mesure pas sur l'écran entier** : mon test « une seule option
  est annoncée active » comptait les `aria-pressed` de TOUTE la page — donc figer un groupe à
  `aria-pressed={true}` le laissait VERT (ses trois options actives ensemble, et le total invariant
  au clic parce que le clic tombait dans un AUTRE groupe). L'agrégat masque exactement ce qu'on
  prétend interdire. Se mesure dans la PORTÉE de la propriété, et l'assertion doit inclure le LEVIER
  (après le clic, toujours une seule) plus un témoin voisin qui NE bouge pas
  (`UNE-PROPRIETE-PAR-GROUPE-NE-SE-MESURE-PAS-SUR-L-ECRAN-ENTIER`). Corollaires : un scan de source
  prouve la PRÉSENCE d'un attribut, jamais sa VALEUR — il lui faut un test de rendu jumeau ; et un
  compte figé dans un test ment dès qu'un usage préexistant partage l'attribut (un 6ᵉ `aria-pressed`
  vivait déjà dans le fichier) — asserter l'INVARIANCE, pas le nombre.
- ⚠️ **Une garde qui réduit DEUX dimensions à UNE mesure le mauvais objet** : `cibleSuffisante`
  prenait le `Math.max` des paddings et l'appliquait aux deux axes, donc elle voyait 26×26 un bouton
  de **26×22** — et un `w-8` seul la rendait verte quelle que soit la HAUTEUR. Mesurée par AXE, elle
  a sorti **4** sites réels (tous trop courts en hauteur seulement, de 1 à 2 px), là où le ticket en
  nommait trois dont **deux déjà corrigés**. La réduction est tentante parce qu'elle simplifie le
  code de la garde ; elle change la GRANDEUR mesurée. Signal : une garde dont le sujet a plusieurs
  dimensions (px×px, min/max, avant/après) et qui rend un seul nombre
  (`UNE-GARDE-QUI-REDUIT-DEUX-DIMENSIONS-A-UNE-MESURE-LE-MAUVAIS-OBJET`). Corollaire d'outillage :
  `enable_pr_auto_merge` **ne déclenche pas** sur ce dépôt — deux PR (#791, #792) sont restées
  ouvertes en `mergeable_state: clean` avec les six checks verts ; fusionner à la main dès le vert.
- Une garde qui ne lit que l'état de **REPOS** ne couvre que cet état : au sens WCAG, le texte d'un
  bouton SURVOLÉ est du texte. Et « corriger » avec un mécanisme que la garde ne sait pas lire
  (`hover:brightness-110`, mesuré 4,44) déplace le défaut hors du radar au lieu de le régler.
- Un **percentile de TRAJECTOIRES n'est pas un percentile** : trier des séries entières par UNE de
  leurs valeurs puis lire toutes les autres ne garantit aucun ordre aux points intermédiaires
  (mesuré : cône Monte Carlo croisé sur 27 % des mois, 737 974 $ d'écart). Trier la COLONNE de
  chaque pas de temps (`PERCENTILE-DE-TRAJECTOIRES-N-EST-PAS-UN-PERCENTILE`).

**Divers**
- Un **champ du TYPE que l'UI ne demande jamais** n'est pas livré : `Debt.termEndDate` existait
  depuis W5.3, exposé nulle part, et `DebtManager` n'avait que « Ajouter »/« Supprimer » — corriger
  une dette imposait de la détruire. « Créer + supprimer » n'est pas « gérer »
  (`CHAMP-DANS-LE-TYPE-INATTEIGNABLE-DANS-L-UI`).
  ⚠️ Variante plus TROMPEUSE (2026-08-25) : le champ existe, le moteur le consulte EN PREMIER, un
  commentaire cite le ticket et 3 tests verrouillent son contrat — mais **aucun producteur n'écrit
  jamais la valeur** (`'VENTE_IMMO'` : zéro écriture dans tout le dépôt), donc 100 % des événements
  arrivent sur le chemin de repli, l'heuristique de nom qu'on croyait retirée. Devant un ticket qui
  semble déjà livré, **grep les PRODUCTEURS, pas les consommateurs** ; et écrire la valeur par DÉFAUT
  explicitement, jamais l'absence — absent veut dire « je ne sais pas » et relance le repli
  (`UN-CHAMP-TYPE-SANS-PRODUCTEUR-EST-UNE-INTENTION-JAMAIS-LIVREE`).
  ⚠️ Et quand le repli CHANGE un montant, ce n'est plus une lacune mais un **chiffre faux** :
  `rsuYearsRemaining` était lu par le moteur (`?? 99`) sans aucun champ pour l'écrire — les RSU ne
  s'arrêtaient jamais, **+1 380 630 $ (+23,4 %)** de patrimoine final mesuré sur 40 ans. Le jumeau
  `rsuVestingPerYear` avait son champ DEUX LIGNES plus haut. Corollaire de saisie : vider un champ
  rend `undefined`, jamais `0` — « pas renseigné » ≠ « zéro »
  (`UN-CHAMP-LU-PAR-LE-MOTEUR-ET-JAMAIS-SAISI-EST-UN-CHIFFRE-FAUX`).
- Une **échéance ne solde pas une dette** : à la fin d'un terme on arrête le paiement, on LAISSE le
  solde résiduel au bilan (l'effacer fabriquerait du patrimoine) et on alerte UNE fois. Et une dette
  pas encore commencée doit sortir AUSSI du bilan — `sumActiveDebts` est une closure définie avant la
  boucle, elle sommait tout (`EFFACER-SUR-UNE-DATE-FABRIQUE-DU-PATRIMOINE`).
- « Livré, testé, déployé » ≠ **ATTEIGNABLE** : pour une feature gatée par une INTERACTION, compter les
  gestes depuis l'état par défaut et vérifier CHAQUE modalité (souris/doigt/clavier). Un test qui
  boucle pour atteindre l'état testé mesure le coût du chemin (`UX-UNREACHABLE-FEATURE`).
- Un **compteur montré à l'humain** se dérive de ce qui a été ÉCRIT (delta d'état, registre
  `changes`), jamais de la taille de l'ENTRÉE : l'écart est maximal dans le cas NOMINAL (une sync qui
  revoit les mêmes lignes annonçait 3 ajouts pour 0 écriture). Et relire la BOUCLE, pas la ligne du
  ticket — les deux compteurs voisins avaient la même faute.
- Un **nom trompeur fabrique des faux findings** → renommer est le vrai correctif.
- « Moins de texte » se satisfait en SUPPRIMANT de l'information : séparer l'**alerte** (marqueur
  compact, visible partout) du **libellé** (déplaçable en `title`). La garde tient les DEUX
  exigences ensemble — plafond de prose ET « aucune réserve perdue » — car chacune seule est
  satisfaite par le mauvais moyen (`EPURATION-SUPPRIME-LA-RESERVE`).
  ⚠️ Corollaire de suppression d'une SURFACE (2026-08-25) : la seule question qui compte avant de
  couper est **qu'est-ce qui n'existe QUE là ?** Le bouton « Diagnostic » de la carte Budget retirée
  avait un JUMEAU ailleurs dans l'onglet — la garde exige donc **exactement UN** bouton après coup
  (doublon parti ET fonction restée) ; un `queryBy(...).toBeNull()` n'aurait pas vu la perte. Deux
  autres pièges du même lot : **`knip` est AVEUGLE au code dont le seul consommateur est son propre
  test** (sortie identique au octet près alors que deux helpers venaient de perdre leur dernier
  appelant de production), et un gain de bundle s'ANNONCE dans les bons termes — le chunk `recharts`
  était identique au octet près, seul le code de l'onglet a maigri (−6,5 %)
  (`UNE-EPURATION-SE-JUGE-SUR-CE-QU-ELLE-NE-DOIT-PAS-EMPORTER`).
- Une **heuristique de TEXTE** (regex sur un libellé) qui coexiste avec du texte UTILISATEUR interpolé
  dans les mêmes libellés produit des faux positifs : toléré sur une pastille visible à l'œil,
  INACCEPTABLE dans un prompt LLM (l'affirmation fausse hérite de l'autorité de la source unique).
  Dériver le fait d'un marqueur STRUCTUREL — il existait déjà (`FireTarget`), la regex était en plus
  redondante (`TEXT-HEURISTIC-OVER-USER-TEXT`, 2026-08-12).
- Un test d'interaction doit **cliquer là où l'utilisateur clique** (sur la donnée, pas dans la marge)
  — un `onClick` React ne capte PAS un clic sur une forme SVG redessinée au survol : la moitié basse
  de la courbe Futur était morte au clic depuis toujours (`FUTUR-CLICK-AREA`, → `pointerup`).
- Une garde indexée **PAR COMPOSANT** branchée sur une grandeur **AGRÉGÉE** ne peut jamais se
  déclencher (`syntheticTailKeys` est peuplé par symbole, jamais pour `TOTAL`) — et même relevée au
  bon niveau, elle peut rater le chemin le PLUS courant (le report de prix ≤ 7 j ne marque rien).
  Refonder la règle sur un fait lisible dans la SOURCE (`GARDE-SUR-AGREGAT-AVEC-INDEX-PAR-COMPOSANT`).
- Quand un test dépend d'un pas d'échantillonnage ou d'un modulo, la longueur de la fixture est un
  PARAMÈTRE : la calculer et l'asserter dans le test (`expect((N-8) % pas).not.toBe(0)`). Choisie au
  jugé, elle rend le cas vacueux par simple parité — mesuré (`PARITE-QUI-REND-UN-TEST-VACUEUX`).
- ⚠️ **Une perturbation MUETTE dit « la fixture ne l'atteint pas » AVANT de dire « le code ne sert à
  rien »** — les deux hypothèses expliquent le même silence, et seule la seconde est flatteuse. J'ai
  choisi la mauvaise et publié qu'un registre était « décoratif » : en fait un couple du MÊME ÂGE
  l'ÉPINGLE à la clé salariale (semé par `splitByShares`, et retrait au prorata / cotisation par
  `shares` / `reconcileToPool` préservent tous le rapport). Sous écart d'âge, la même perturbation
  déplace **+16 123 $** de REER final avec 29 tests verts. **Un paramètre à ÉCART (âge, salaire, date)
  se teste à écart NON NUL** — la valeur la plus naturelle est souvent la seule qui n'observe rien.
  Et un constat publié se corrige dans les TROIS endroits où il a été écrit (`CLAUDE.md`, `BACKLOG.md`,
  corps de PR) (`UN-COUPLE-DU-MEME-AGE-EPINGLE-LE-REGISTRE-PER-CONJOINT`).
- ⚠️ **Dès qu'un test porte sur un facteur ET son complément, la valeur d'essai doit être ASYMÉTRIQUE** :
  à un partage de divorce de **50 %**, `keep` et `1 − keep` sont indiscernables — publier la part
  CONSERVÉE au lieu de la part CÉDÉE laissait le test **VERT** (mesuré ; seul 75 % rougit). Et 50 %
  est justement la valeur qui vient spontanément. Corollaires du même lot : la liste des comptes
  touchés se tire du CODE qui mute, pas de la prose du ticket (4 annoncés, 6 réels, dont un annoncé
  resté à ZÉRO sur 360 mois → exclu AVEC sa mesure) ; et une exclusion aujourd'hui INERTE s'écrit
  comme telle dans le code plutôt que d'être couverte par une fixture absurde
  (`UN-PARTAGE-A-50-POURCENT-NE-DISTINGUE-PAS-KEEP-DE-SON-COMPLEMENT`).
- Deux tickets groupés « même classe » n'ont pas forcément le même DÉFAUT : motif de code identique
  (`|| 0`), mais un `.filter(g > 0)` trois lignes plus bas transformait un « faux 0 » en EFFACEMENT
  silencieux — correctifs opposés. Re-dériver le défaut de chaque ticket sur son propre code
  (`DIAGNOSTIC-GROUPE-A-MOITIE-FAUX`). Corollaire : une absence utile se publie comme une présence
  VIDE, jamais comme un champ omis.
- Un `toContain('identifiant')` dans un scan de source est presque vacueux quand l'identifiant existe
  en DÉCLARATION *et* en usage : ancrer le motif sur l'USAGE, et perturber CHAQUE assertion du scan
  séparément (`SCAN-QUI-MATCHE-LA-DECLARATION-AU-LIEU-DE-L-USAGE`).
- Resserrer un scan-garde **AVANT** de coder le fix : les offenders révélés = le vrai périmètre.
- Un barème est un nombre qu'on **calcule**, qu'on **nomme** (`{ 71: 0.0528 }`) ou qu'on **choisit**
  (`cond ? 5 : 2`). Le filtre de position du garde fiscal n'attrapait que le premier : les 24 facteurs
  de retrait minimum du FERR et les 4 taux du crédit pour dons n'ont **jamais** été vus depuis l'entrée
  de leur fichier au périmètre, alors qu'ils sont ancrés en FISCAL_REFERENCE — il manquait la
  PROTECTION, pas la source.
  Énumérer les positions par ce qu'elles FONT au nombre, pas par la syntaxe rencontrée en écrivant le
  filtre. Et une entrée PAR VALEUR, pas par table : une garde qui dit « quelque chose a changé dans
  RRIF_RATES » oblige à tout relire (`FILTRE-DE-POSITION-QUI-NE-VOIT-QUE-L-ARITHMETIQUE`).
  ⚠️ Mais une clé **par VALEUR protège la valeur, jamais la RELATION** : ordre, monotonicité, somme,
  unicité sont hors de son champ. Une PERMUTATION de deux facteurs FERR laisse le ratchet VERT
  (mesuré) — c'est le test de stricte croissance, dans un AUTRE fichier, qui l'attrape. Et avant
  d'ajouter la garde qu'un reviewer réclame, **vérifier qu'elle n'existe pas déjà** : la boucle qui
  couvre les âges 73→94 ne contient aucun âge littéral, donc son grep ne l'avait pas vue
  (`UNE-CLE-PAR-VALEUR-NE-PROTEGE-PAS-L-ORDRE`).
- Tout registre censé **DÉCROÎTRE** (inventaire de dette, exemptions, allowlist) a besoin d'une garde
  sur l'**obsolescence de ses entrées**, pas seulement sur leur forme : l'entrée `childrenReee::98000`
  a survécu au commit qui SUPPRIMAIT le littéral, continuant d'affirmer le défaut au présent dans le
  document qui sert de tri fiscal. Sans cette garde il n'y a pas de décroissance, juste des constats
  périmés qui se lisent comme des faits — et elle tient en trois lignes, l'outil qui dit si l'entrée a
  encore un objet existe déjà. Quand une PR ANCRE une valeur, grep aussi toutes les raisons qui
  parlaient de son absence (`ENTREE-D-INVENTAIRE-FANTOME`).
- Dans un document de dépôt, un **numéro de ligne est une dette** qui se paie au premier refactor, en
  silence. Vouloir VÉRIFIER mes `L<n>` a sorti 16 entrées fausses — dont une partie n'était fausse
  que parce que mes propres éditions avaient décalé le fichier : vérifier revenait à réintroduire
  dans la PROSE le couplage à la ligne que la CLÉ évite par conception. **Nommer la construction**
  (`survivorRrqFactor`, branche `ca-equity`) ou **compter** (`[×N]`/`[≠N]`, vérifié) — jamais pointer
  (`UNE-REFERENCE-DE-LIGNE-DANS-UNE-DOC-EST-UNE-DETTE`).
- Quand une garde a une **liste d'inclusion**, auditer le CRITÈRE qui l'a remplie, pas seulement ses
  entrées : `FISCAL_MODULES` disait « les modules qui PRODUISENT de l'impôt » — or une SUBVENTION,
  une PRESTATION, un PLAFOND LÉGAL et un PROXY d'impôt sont tout autant des barèmes. `98000`
  (plafond RQAP périmé, la source unique porte 103 000 $) vivait dans ce trou. Le critère décrivait
  la MÉCANIQUE au lieu de l'ORIGINE. Et **déclarer aussi ce qu'on EXCLUT**, chiffré et motivé : un
  périmètre borné en silence se lit comme « tout est couvert »
  (`CRITERE-D-INCLUSION-TROP-ETROIT-EST-LE-BUG`).
  ⚠️ Et un détecteur a DEUX réglages : ce qu'il regarde (la liste) et ce qu'il IGNORE (le filtre).
  Le filtre est le plus dangereux — une liste trop courte se voit, une exclusion se lit comme un
  détail déjà tranché. `BENIGN` contenait `0.5` et `1000` que sa propre justification n'énumérait
  pas : ils masquaient le taux d'inclusion des gains en capital, le plafond légal de 50 % du
  fractionnement et la SCEE de rattrapage — dans des modules scannés depuis toujours. **Signal
  mécanique, repérable à l'œil** : une justification qui énumère moins d'éléments que le `Set`
  (`AUDITER-LE-FILTRE-AUTANT-QUE-LA-LISTE`).
- Trier une constante fiscale se fait en lisant **le BLOC**, jamais l'expression : quatre de mes 63
  raisons étaient fausses parce que j'avais lu la ligne du littéral et pas la fonction autour — le
  commentaire `// Job loss (AE 55%)` était six lignes plus haut. Et un lot dont la valeur EST le
  jugement se fait **relire par un tiers** : les 13 tests vérifiaient la FORME (chaque entrée a une
  raison), et aucune forme ne détecte qu'une raison est FAUSSE
  (`MON-CORRECTIF-CONTENAIT-LA-FAUTE-QU-IL-CORRIGEAIT`).
- Une clé d'inventaire **`(fichier, valeur)`** fusionne des sens sans rapport dès que le module est
  dense : dans `childrenReee.ts`, `0.20` est le taux de SCEE ET le taux d'impôt sur le PRA, `500`
  recouvre TROIS sens. Une raison qui n'en décrit qu'un certifie « trié » ce que personne n'a
  regardé. Remède structurel sans changer la clé : `[×N]` en tête (même sens) OU N références
  `L<n>` (sens différents) — 15 offenders préexistants sortis d'un coup
  (`CLE-QUI-FUSIONNE-DEUX-SENS`).
- Un scan de source qui lit les **COMMENTAIRES** matche de la PROSE : `parseBankCsv.ts` EXPLIQUE en
  en-tête le parseur qu'il remplace, et resserrer le motif (`\bX\b` → `\bX\s*\(`) ne sert à rien —
  une phrase française écrit « le vieux X (TAB/`;` … ». Décommenter AVANT de scanner, garder le motif
  simple, et poser l'anti-vacuité du décommentage (taille restante + un jeton de vrai code retrouvé),
  sinon « rien ne référence X » se prouve à partir de « il n'y a plus rien ». Ne PAS interdire la
  mention : la garde protège le code, la prose garde le droit de raconter l'histoire
  (`SCAN-QUI-MATCHE-LA-PROSE`).
- **Quand une contrainte interdit la BONNE solution, la livraison est le FILET, pas une meilleure
  approximation** : décider si un `/` ouvre une regex exige un analyseur, mais `utils/stripComments.ts`
  est importé par une garde qui part dans le BUNDLE et `typescript` est une devDependency — la
  contrainte qui fixe l'emplacement du module interdit sa solution correcte. Cinq passes de panel,
  cinq défauts réels et tous DORMANTS ; ce qui a changé de main, c'est le canari. ⚠️ Et son premier
  jet comparait le code gardé en RATIO DE FICHIER : deux défauts sans rapport se compensaient et il
  restait vert sur un fichier avalé — **deux pertes indépendantes ne se comparent pas en agrégat**,
  le même invariant ligne par ligne est insensible. Signal de conduite : cinq passes productives sur
  un même mécanisme disent de REFORMULER le problème, pas d'en faire une sixième
  (`QUAND-UNE-CONTRAINTE-INTERDIT-LA-BONNE-SOLUTION-LIVRER-LE-FILET`).
  ⚠️ Et un décommenteur par REGEX est faux : `'https://…'` contient `//`, donc il ampute la ligne —
  une soixantaine de fichiers du dépôt en sortent différents (`scripts/mesureStripComments.mjs`
  re-dérive le compte ; un agrégat sur un arbre mouvant se cite par sa COMMANDE, pas par son
  chiffre), dont ceux d'une garde qui se mutilait elle-même. La source unique est `utils/stripComments.ts`
  (automate, pur, sans `node:fs` — il doit rester atteignable depuis le bundle). Elle **BLANCHIT**
  au lieu de supprimer, parce que les gardes qui reportent un numéro de ligne l'exigent : avant
  d'unifier N copies, comparer leurs CONTRATS. Corollaire : l'anti-vacuité ne peut plus se mesurer
  sur la longueur (inchangée par construction) mais sur les caractères NON BLANCS
  (`UN-DECOMMENTEUR-NAIF-MANGE-LE-CODE-APRES-UNE-URL`).
  ⚠️ Et avant d'écrire un utilitaire de scan, **grep le CONCEPT, pas le symbole** : le dépôt avait
  déjà SIX décommenteurs, aucun exporté, dont deux portant en commentaire la leçon exacte que je
  venais de repayer — l'un ayant même choisi le même nom de helper (`GUARD-STRIPCOMMENTS-DUPLIQUE`).
  ⚠️ Et une garde d'ABSENCE contredit MÉCANIQUEMENT une bonne doc (la meilleure façon d'expliquer un
  motif interdit est de l'écrire) : choisir le lecteur par la NATURE de l'assertion — source
  DÉCOMMENTÉE pour un `not.toMatch`, source BRUTE pour une présence qui vise un commentaire. Et
  l'anti-vacuité du décommentage se déplace avec la portée : par fichier elle est fausse dès qu'un
  alias est à 88 % de prose, à l'échelle d'un dépôt elle est AGRÉGÉE (`codeTotal/brutTotal > 0.5`).
- ⚠️ **Copier un patron de gestion d'erreur copie son CONTRAT** : `getQuote` LÈVE, `getHistory`
  retourne `null` (et sa façade interdit en toutes lettres d'aplatir `null` en `[]`) — le même
  `try/catch` donne un correctif juste pour l'une et **décoratif** pour l'autre, jamais atteint, qui
  affiche « aucun cours trouvé » sur une panne réseau. Avant de réutiliser un patron voisin, trancher :
  la fonction LÈVE-t-elle, ou encode-t-elle l'erreur dans son retour ? Si elle l'encode, `!x` fusionne
  le code d'erreur avec le vide légitime (`PATRON-COPIE-AVEC-SON-CONTRAT-D-ERREUR`).
- Avant de tracer un **repli silencieux**, classer les chemins qui l'atteignent *attendu* / *anormal* :
  un champ ABSENT est la rétrocompat voulue (silence LÉGITIME), un champ PRÉSENT mais non fini est une
  corruption (trace). Journaliser les deux crie sur le cas nominal à chaque chargement et noie le
  seul cas utile. Le test verrouille les DEUX sens, dont le `not.toHaveBeenCalled()`
  (`REPLI-SILENCIEUX-LEGITIME-VS-CORRUPTION`).
- Un scan-garde qui borne une syntaxe IMBRIQUÉE avec `[^x]*` est aveugle en silence (un `>` dans un
  `className` interpolé tronque la balise) → compter la PROFONDEUR, **tester l'extracteur sur des
  cas de syntaxe**, et poser un anti-vacuité sur ce qu'il TROUVE, pas seulement sur ce qu'il balaie
  (`GARDE-BORNEE-PAR-CLASSE-NEGATIVE`).
- Une **preuve de discrimination** ne vaut que si le cas d'essai est REPRÉSENTATIF : l'essayer sur la
  forme la plus tordue du dépôt, pas la plus simple.
- ⚠️ **Ajouter un CHAMP qui traverse une frontière** : vérifier que le consommateur le DÉCLARE — une
  reconstruction champ par champ le jette en silence, et un `as` posé pour faire passer le type fait
  taire le compilateur sur ce champ précis. L'assertion vise l'état ÉCRIT, jamais le retour du module.
- Quand **deux couches dédupliquent** la même donnée, en désigner UNE comme autorité pour ce chemin :
  composées, deux protections correctes suppriment de vraies données (`DEUX-DEDUPS-QUI-SE-CONTREDISENT`).
- ⚠️ Rendre une fonction **plus robuste DÉSARME les gardes aval** qui reposaient sur sa fragilité :
  après un durcissement, grep les appelants pour `Number.isFinite`/`isNaN`. Et exposer DEUX portes —
  le total (pour LIRE : écarter + tracer + montrer) et l'inventaire des termes écartés (pour ÉCRIRE :
  refuser). Sinon l'aval ne distingue plus « 0 $ vrai » de « 0 $ parce qu'on a jeté »
  (`TRACER-AU-LIEU-DE-JETER-DESARME-LA-GARDE-AVAL`).
- Un composant testé à son **CONTRAT** ne dit rien de ce qu'on lui PASSE : quand un index/une clé est
  calculé ailleurs, viser le CALCUL (l'extraire en fonction pure le rend testable)
  (`TEST-AU-CONTRAT-NE-VOIT-PAS-L-APPELANT`).
  ⚠️ Même famille appliquée au **PÉRIMÈTRE DE TRAVAIL** : un correctif peut être vert en test et
  **INERTE en prod** quand l'appelant passe une CONFIGURATION qui restreint (`fields`, `include`,
  verbosité). La recomposition du patrimoine au jour s'abstenait TOUJOURS — `DettesNonImmo` n'était
  pas dans `CURVE_FIELDS`, et mes tests ventilaient tout. Rejouer avec la configuration RÉELLE lue
  dans le SOURCE de l'appelant, et tester la branche d'ABSTENTION
  (`CORRECTIF-VERT-EN-TEST-INERTE-EN-PROD`).
- Une **fixture qui remplit tous les champs** rend le repli inatteignable — et c'est souvent le repli
  qui fuit. Une fixture par branche (`FIXTURE-COMPLETE-CACHE-LE-REPLI`).
- Une décision de **vie privée** écrite pour UNE sortie se repasse sur TOUTES (PDF, CSV, backup,
  prompt LLM, MCP, logs), et la garde vit au SERVICE, pas au clic (`DECISION-PRIVACY-UNE-SEULE-SORTIE`).
  ⚠️ Corollaire mesuré le 2026-08-25 : une règle de vie privée **dupliquée avec soin et vérifiée par
  rien** n'est pas une garantie. Désarmer « mode discret pendant l'attente = écriture refusée »
  laissait **145 tests verts** sur les deux surfaces qui la portaient. Et quand deux surfaces font la
  même chose et qu'une seule a le filet (diff + backup + garde), **c'est l'incohérence qui est le
  bug** : un bouton demande un consentement, il ne donne ni information ni issue
  (`UN-BOUTON-N-EST-PAS-UN-FILET`). Retirer aussi la PORTE (la prop d'écriture directe), pas
  seulement cesser de l'emprunter.
- Masquer une donnée peut **retirer un discriminant** et casser les noms accessibles : le remplacer
  par un discriminant non sensible (`MASQUAGE-RETIRE-UN-DISCRIMINANT`).
- Une garde qui manque **là où le voisin immédiat en a une** est un signal bien plus fort qu'une
  absence isolée : le risque était connu, traité une fois, et le site d'à côté oublié
  (`assetValueCad` durci, le cash de départ non — 65 lignes plus bas dans le MÊME fichier).
  Avant d'écrire une garde, grep le patron dans le fichier et ses voisins et le RÉUTILISER tel quel
  (`PATRON-APPLIQUE-A-COTE-MAIS-PAS-ICI`).
- ⚠️ Un invariant de conservation **ne voit pas ce qui est ABSENT** : immeuble locatif et entreprise
  privée manquaient au bilan (302 574 $ + 499 160 $ + 2 M$ mesurés) avec TOUTES les gardes vertes —
  rien à réconcilier quand rien n'est écrit. Contre l'omission, une assertion de PRÉSENCE (avec/sans
  le conteneur), et un type EXHAUSTIF (`Record<keyof …>`) qui casse le typecheck sur chaque site
  (`UN-INVARIANT-NE-VOIT-PAS-CE-QUI-EST-ABSENT`).
- Un **stub** documenté « retourne toujours `[]` » peut rester branché des mois sans alerte si le
  mode test nourrit les surfaces en synthétique.
- ⚠️ **Un booléen qui recouvre deux faits OPPOSÉS se corrige en les SÉPARANT**, pas en temporisant :
  `connected: false` voulait dire « on a essayé et non » ET « on n'a pas encore essayé », et la
  bannière Drive affirmait du FAUX pendant **≥ 2 500 ms** (`App.tsx` retarde `runBootSync` de 2 500 ms
  après un `initSync` qui publie déjà `configured: true`). Signal réutilisable : **une valeur par
  DÉFAUT lue comme un verdict**. ⚠️ Le risque du correctif est symétrique et pire — taire une alerte
  « le temps de vérifier » la tait POUR TOUJOURS sur le mauvais chemin : poser le drapeau dans un
  `finally` (7 sorties ici), et le rendre vrai D'ENTRÉE quand il n'y a rien à attendre. Corollaires :
  un drapeau calculé à l'init doit se demander **combien de fois l'init a lieu** (2× au boot → il faut
  la monotonie), et un état de MODULE monotone rend la suite de tests vacueuse sans point de remise à
  zéro (`UN-DEFAUT-QUI-RECOUVRE-DEUX-FAITS-OPPOSES-SE-CORRIGE-EN-LES-SEPARANT`).
- ⚠️ Un **verrou posé autour du TRAVAIL** laisse la course là où elle est : dans la GARDE qui décide
  s'il faut travailler. `localStorage` n'a pas de compare-and-swap — lire puis écrire un cooldown
  sont DEUX opérations, donc deux onglets passent la garde ensemble. Le verrou enveloppe la décision
  ET l'action. Corollaires : un verrou sans **repli explicite** là où l'API manque bloque tout (pire
  que le défaut) ; un nom qui dit « partagé » pour une variable de MODULE fait croire au cross-onglet ;
  et une assertion « rien n'a été écrit » mesure un sélecteur mort tant qu'un autre cas ne prouve pas
  que le même sélecteur VOIT une écriture (`UN-VERROU-DOIT-ENVELOPPER-LA-GARDE-PAS-SEULEMENT-LE-TRAVAIL`).
- Un **aléa dérivé d'un identifiant TECHNIQUE est un aléa MORT** : le choc de taux au renouvellement
  hypothécaire (`(id.charCodeAt(0) % 3 - 1) × 0,015`) vaut ZÉRO partout — l'UI crée `prop_<ts>`, les
  fixtures `p1`, les personas `jc-re1`, tous sur la même valeur. Un préfixe constant écrase l'entropie
  qu'on croyait exploiter. Se demander **qui fabrique la clé**, puis énumérer les identifiants
  RÉELLEMENT produits. Corollaire : un mécanisme mort ment aussi par ses MESSAGES (« nouveau taux
  5,00 % » quand l'ancien était 5,00 %), et le réveiller peut rendre ATTEIGNABLE un second bug qui
  dormait derrière — les deux se livrent ensemble
  (`UN-ALEA-DERIVE-D-UN-IDENTIFIANT-TECHNIQUE-EST-UN-ALEA-MORT`).
- Un audit externe/UX headless a un fort taux de faux positifs sur le money-critical — mais
  garder le claim faux comme note de **perception**.
- ⚠️ **Le SIGNE d'un correctif money-critical peut dépendre d'un ÉCART DE TAUX, pas de sa justesse** :
  partager la mensualité au divorce (elle ne l'était pas, contrairement au chemin LOCATIF trois
  lignes plus bas) FAIT BAISSER le patrimoine à 30 ans — −93 546 $ à 3 %, −66 989 $ à 6 %, mais
  **+54 003 $ à 10 %**. Le défaut équivalait à un désendettement FORCÉ au taux de l'hypothèque.
  Balayer le paramètre qui pourrait retourner le signe : s'il se retourne, le chiffre ne dit rien de
  la correction — c'est l'INCOHÉRENCE entre deux chemins voisins qui tranche. Corollaires du même
  lot : un mécanisme AVAL peut BORNER un défaut amont (le renouvellement ré-ancrait la mensualité →
  « ~2× trop vite » ne durait que 48 mois, mois de solde nul identique), et un ticket qui annonce
  « re-basera des goldens » dit aussi où regarder quand aucun ne bouge (les 16 fixtures de divorce
  portent `realEstateGoals: []`) (`LE-SIGNE-D-UN-CORRECTIF-PEUT-DEPENDRE-D-UN-ECART-DE-TAUX`).
- Avant de lancer un agent sur « l'état du code », **prouver l'état du code** (`git fetch` + comparer
  à `origin/main`) : un revert de conteneur fait auditer une version morte, et le rapport reste
  PLAUSIBLE — vrais `fichier:ligne`, vraies mesures, mauvaise version (`AUDIT-SUR-TREE-PERIME`).
- Un finding juste peut porter un **correctif invalide** : lire le contexte SYNTAXIQUE (le parent),
  pas la ligne citée — « en faire un `<button>` » sur un span imbriqué dans un `<button>` produit du
  HTML invalide (`FINDING-JUSTE-CORRECTIF-INVALIDE`).
- Une **métrique recopiée** dans plusieurs docs diverge (41/48/50 sous-modules, deux comptes de tests
  contradictoires dans un MÊME fichier). Ne pas corriger les N copies : en désigner UNE comme source
  et faire pointer les autres (`DOC-METRIQUE-RECOPIEE`).
- ⚠️ **`| tail` sur la sortie d'un `rebase` cache des CONFLITS** : `tail -10` a coupé deux des quatre
  lignes `CONFLICT`, et `git add -A && git rebase --continue` a committé `CHANGELOG.md`/`HANDOVER.md`
  avec leurs marqueurs. Même panne que « `| tail` jette le code de sortie », appliquée au CONTENU :
  une sortie tronquée par le HAUT se lit comme une sortie complète. Filtrer (`grep CONFLICT`), jamais
  couper — et après toute résolution, `grep` les marqueurs sur l'arbre AVANT `git add`. C'est
  `tests/noConflictMarkers.test.ts` qui a sauvé le lot, au gate rejoué APRÈS le rebase : un lot rebasé
  se re-gate INTÉGRALEMENT (`UN-TAIL-SUR-LA-SORTIE-D-UN-REBASE-CACHE-DES-CONFLITS`).

### CI (GitHub Actions) — pourquoi un gate vert ne suffit pas

⚠️ **« Gate local vert » ≠ « CI verte »** : le conteneur de dev tourne sur Node **22**, les workflows
épinglent **20**, et rien ne déclare la cible (`engines`/`.nvmrc` absents — `[ENV-NODE-NON-DECLARE]`).
`globSync` (`node:fs`, Node 22+) a donné un gate local vert et une CI rouge sur le MÊME commit.
Avant d'employer une API `node:*`, vérifier depuis quelle version elle existe vs le `node-version`
des workflows — pas le `node -v` local. Symptôme : `TypeError: X is not a function` en CI seulement.
Le correctif est presque toujours de **réutiliser le marcheur/patron déjà employé par le dépôt**
(ici `readdirSync(dir, { recursive: true })`), dont la compatibilité est déjà prouvée par la CI
(`GATE-LOCAL-VERT-CI-ROUGE-PAR-VERSION-DE-NODE`).
✅ **Réglé le 2026-08-21** (`[ENV-NODE-NON-DECLARE]`) : `.nvmrc` + `engines.node` + les 4 workflows
sur `node-version-file`, gardés par `tests/nodeVersionDeclared.test.ts`. ⚠️ Mais la vraie protection
n'est AUCUN des deux que le ticket nommait : `engines`/`.nvmrc` sont DÉCLARATIFS (sans
`engine-strict`, `engines` n'est qu'un avertissement npm). C'est **`@types/node` aligné sur la
version EXÉCUTÉE** (`^22` → `^20`) qui rend la classe impossible : `tsc` refuse alors l'API trop
récente À L'ÉCRITURE. Face à un « vert local / rouge distant », distinguer l'artefact *déclaratif*
de l'*exécutoire* — seul le second protège.

⚠️ Le workflow filtre sur `pull_request: branches: [main]` : une **PR EMPILÉE** (base `claude/xxx`)
ne déclenche **aucun** run CI — Vercel et CodeQL partent quand même, ce qui donne l'illusion d'une
vérification. `enable_pr_auto_merge` répond « unstable status » parce que les checks requis sont
ABSENTS, pas en échec. Dans une pile, seule la PR du BAS est testée ; les autres n'ont leur CI qu'au
re-ciblage automatique de leur base sur `main`. Le gate LOCAL est alors la seule vérification réelle
(`PR-EMPILEE-N-A-AUCUNE-CI`).

⚠️ Le check requis **« E2E (Playwright / Chromium) »** n'apparaît PAS dans `pull_request_read
get_status` (qui ne montre que les *statuses* legacy — seul Vercel y figure) : le lire via
`actions_list list_workflow_jobs`. Il fige régulièrement sur « Install Playwright Chromium »
(blocage d'infra, vu 3× : 45 min, 32 min, 32 min) → `cancel_workflow_run`, attendre la propagation
(un rerun immédiat rend 403 « already running »), puis `rerun_workflow_run`.

## 10. Style et compte-rendu

> 📣 Forme des comptes-rendus, des commits, des PR et des docs générées :
> [convention commune aux neuf dépôts](https://github.com/MoKarade/claude-config/blob/main/conventions/COMPTE-RENDU.md).
> Elle régit **la forme** ; ce fichier garde **le contenu métier**. Sur la forme, c'est la
> convention qui gagne ; sur le métier, c'est ce fichier.

@docs/COMPTE-RENDU.md

⚠️ **Pourquoi une COPIE et pas seulement un lien.** Un `CLAUDE.md` ne charge rien hors de son
propre arbre : le lien ci-dessus est lisible par un humain, il n'arrive jamais dans la session.
C'est exactement le mode de panne du 20/08/2026 — les règles de cadrage écrites dans un
`~/.claude/CLAUDE.md` local ne descendaient nulle part, et Marc constatait « je ne vois pas la
différence » alors que rien n'était jamais arrivé. `docs/COMPTE-RENDU.md` est donc une copie
**synchronisée**, importée ci-dessus, et la CI échoue si elle a dérivé de la source.

Pour changer la convention : la changer dans `claude-config`, propager les huit copies, mettre
à jour les huit empreintes. La friction est le garde-fou — une copie qu'on peut modifier sur
place redevient huit conventions différentes en trois mois.

### Propre à ce dépôt

- **`[YYYY-MM-DD HH:MM UTC]` en tête de CHAQUE réponse** (via `date`), sans exception.
- **Qualité d'abord, coût tokens NON contraint** : passes multiples, panels d'agents, vérifs
  exhaustives. Seule limite = le SIGNAL (pas de bruit que personne ne lira). Pas de stub ni de
  « TODO plus tard » non demandé.
  ⚠️ Cette règle porte sur l'**effort**, pas sur le volume écrit. Le « ~15 lignes » de la
  convention (§4) décrit le RAPPORT, pas la recherche. Chercher moins pour écrire moins serait
  exactement l'inverse de ce qui est demandé ici (arbitrage Marc, 21/08/2026).

## 11. Agents & automatisation

Agents et hooks : voir `.claude/` et la section correspondante de `docs/CONVENTIONS.md`.
Les agents ECC sont en anglais → **répondre à Marc en français** quoi qu'il arrive.
En conflit entre une règle ECC et les règles ci-dessus, **celles-ci prévalent**.

⚠️ **Committer (et POUSSER dès que la branche est libre) avant TOUTE attente longue** — panel
d'agents, suite de tests, CI : un revert de conteneur pendant l'attente efface un lot entier
non commité, stash compris (vécu 2×, dont le Lot 1 REFONTE-NAV pendant `npm run test`).
