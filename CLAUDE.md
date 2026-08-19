# FinanceAI — CLAUDE.md

App perso de planif financière (fiscalité ARC + Revenu Québec, Monte Carlo retraite,
assistant Claude). 100 % navigateur, pas de backend. TS strict, **4 368 tests** Vitest
(391 fichiers de test, mesuré le 2026-08-19). Tout en français.

> **Ce fichier se charge à CHAQUE session — il reste COURT, pour de vrai.**
> Le détail (leçons, incidents, pièges, rationnels) vit dans **`docs/CONVENTIONS.md`**,
> qui est l'ancien CLAUDE.md intégral. Ici : ce qu'il faut savoir AVANT de savoir quoi
> chercher. Une leçon nouvelle va dans `docs/CONVENTIONS.md` ; on n'ajoute ici qu'une
> LIGNE d'index quand une classe de piège n'y figure pas encore.

## Docs (qui sert à quoi)

- `docs/CONVENTIONS.md` — **détail de tout ce qui est indexé plus bas** (leçons, pièges, rationnels)
- `docs/BACKLOG.md` — tâches que Claude peut faire · `docs/BACKLOG_ARCHIVE.md` — items finis
- `docs/A_FAIRE_MOI.md` — tâches HUMAINES (Claude y route ses blocages)
- `docs/SESSION_HANDOVER.md` — état actuel + reprise rapide
- `docs/VISION.md` — où va le projet · `docs/decisions.md` — décisions verrouillées (ADR)
- `docs/FISCAL_REFERENCE.md` — valeurs fiscales : **SOURCE DE VÉRITÉ** (datée + sourcée)
- `docs/ARCHITECTURE.md`, `docs/PROJECTION.md`, `docs/PROJECTION_OUTPUT_SCHEMA.md`, `mcp/README.md`, `CHANGELOG.md`
- `docs/HISTORIQUE.md` — archive consolidée

## Reprise de session

1. `git fetch origin main && git merge --ff-only origin/main` **AVANT de juger l'état**
   (le clone local ne se met pas à jour seul — vu 146 commits de retard).
2. Point bref lu depuis `SESSION_HANDOVER.md` + `BACKLOG.md` : **Fait** / **État** /
   **Suite proposée** (+ ID) / **Planifié**.

## Ton & réponses

- **Français**, tutoiement, direct et technique. **PAS d'emojis** dans le chat sauf demande.
- **`[YYYY-MM-DD HH:MM UTC]` en tête de CHAQUE réponse** (via `date`), sans exception.
- Structuré : essentiel d'abord, puis le détail. Expliquer le POURQUOI. Pour un choix :
  options (bon/mauvais de chacune) PUIS ta reco.
- **Vérifier avant d'affirmer** ; si pas sûr, le dire. Vérifier un fait avancé par Marc avant
  de construire dessus, et le corriger s'il est faux.
- Étiqueter toute affirmation non triviale ET tes recommandations :
  **[Certain] / [Probable] / [Supposition] / [À vérifier]** (rien sur l'évident).
- Pas de complaisance : si une approche est mauvaise, le dire et proposer mieux.

## Workflow

- **Plan d'abord, TOUJOURS** pour une tâche non triviale : toutes les questions de cadrage
  d'un coup (un seul batch), y compris la définition de « fini », puis plan court et OK avant
  de coder. **Proposer ≠ faire** : jamais de scope que Marc n'a pas demandé.
- **NE PAS s'arrêter en pleine tâche** : chaque tour contient des appels d'outils tant que ce
  n'est pas fini. Jamais « je vais faire X » suivi d'un arrêt. On s'arrête après un merge
  confirmé visuellement, ou sur une vraie question bloquante.
- **Qualité d'abord, coût tokens NON contraint** : passes multiples, panels d'agents, vérifs
  exhaustives. Seule limite = le SIGNAL (pas de bruit que personne ne lira). Pas de stub ni de
  « TODO plus tard » non demandé.

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
  à faire n'est pas une tâche : elle va dans l'archive ou dans `decisions.md`.
- ⚠️ **Item fini ET validé (mergé, gate vert) → DÉMÉNAGE vers `docs/BACKLOG_ARCHIVE.md`**
  (avec date + PR), au plus tard à la PR suivante. Le BACKLOG ne garde que le vivant.
- ⚠️ Leçon de la refonte 2026-07-31 : ~65 items étaient FAITS sans case cochée et ~128 puces
  n'avaient pas de case. Un backlog qui mélange fait et à-faire trompe le PM et la reprise de
  session (classe `PM-STALE-BACKLOG`). C'est la tenue **à chaque push** qui empêche la dérive,
  pas les grandes passes de nettoyage.

### Docs à jour à CHAQUE push

Avant le commit final, se demander « quels docs décrivent ce que je viens de changer ? » et
les mettre à jour **dans la MÊME PR** : `SESSION_HANDOVER.md` (état — responsabilité keystone,
dans le « Toujours » de `/review-all`), `BACKLOG.md`, `CHANGELOG.md`, `README`, et les docs
techniques touchés (`PROJECTION*.md`, `FISCAL_REFERENCE.md`, `ARCHITECTURE.md`…). Un champ,
calcul ou valeur fiscale ajouté SANS sa doc = doc périmée qui trompe la prochaine session.

**Leçon apprise → `docs/CONVENTIONS.md`, dans le MÊME commit.** Rien appris → le dire
(« push sans leçon »), pas de skip silencieux. Une leçon notée ailleurs (chat, mémoire
harness) mais pas portée dans le dépôt est perdue à la prochaine session.

## Gate (non négociable)

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

Avant CHAQUE commit (hook `commit-gate`). Jamais `--no-verify`.

- ⚠️ **`npm run typecheck`, JAMAIS `npx tsc`** : `npx` peut résoudre un TypeScript distant qui
  ignore `--noEmit` → « vert » trompeur + pollution de l'environnement du même appel.
- ⚠️ `npm run build` a un `prebuild` = `lint` : le build CASSE si le lint échoue.
- Autres : `test:watch`, `test:e2e`, `knip`, `check-contrast`, MCP `mcp:dev|auth|connect|pack`.

## Stack & structure

React 19.2 + Vite 8 (Rolldown) + TS 5.8 strict + Tailwind 3 · Zustand 5 (persist+partialize,
schema v7) · Zod 3 · Recharts 3 (lazy) · Vitest 4 + Testing Library + axe-core ·
@anthropic-ai/sdk (Sonnet 4.6 + Haiku 4.5) · @modelcontextprotocol/sdk · Finnhub + CoinGecko ·
i18next · jspdf. Prod : **Vercel**.

Structure **PLATE** (pas de `src/`) : racine `App.tsx`, `index.tsx`, `constants.ts`, `types.ts`,
`i18n.ts` ; dossiers `components/ hooks/ services/ store/ utils/ locales/ mcp/ e2e/ tests/
scripts/ docs/`. Cœur : `services/projection.ts` + `services/projection/` (50 sous-modules).

⚠️ Hoister un import au niveau App tire ses deps dans le bundle de BOOT → lazy-charger
(`lazyWithRetry` + Suspense) tout composant/service app-level qui importe du lourd.

## Non négociables (le cœur)

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

## Index des pièges — détail dans `docs/CONVENTIONS.md`

- Une valeur sensible qui sort par une **prop de composant tiers** (`tickFormatter`/`formatter` Recharts)
  échappe AU grep ET aux tests qui mockent ce composant : la garde est un scan de SOURCE (revue #608).
  Elle sort aussi par un **attribut** (`title`/`aria-label`) et par la **STRUCTURE** (nombre de lignes,
  position d'un marqueur) : masquer les valeurs ne masque pas leur existence.
- Un flux moteur alimente PLUSIEURS registres (solde/fiscal/per-conjoint/affichage) : un producteur
  nouveau ou corrigé doit alimenter TOUS les registres (meltdown REER, 2026-07-31).

Quand une tâche touche un de ces terrains, **lire la section correspondante avant de coder**.

**Money-critical / moteur**
- Un finding de review sur du fiscal/moteur est une **hypothèse** (≈3/8 des HIGH sont FAUX) —
  vérifier contre le vrai code avant de « corriger ». Un faux fix est pire que le finding.
- **Mesurer, pas raisonner** : l'agent qui a EXÉCUTÉ l'emporte sur celui qui a déduit.
  Arbitres outillés : résiduel de conservation ($), `check-contrast` (a11y), `git stash` (test discriminant).
- **Prouver qu'un test DISCRIMINE** : il doit ÉCHOUER sur le code d'avant (`git stash`).
  Pour un invariant d'ORDRE, la preuve s'inverse (introduire l'inversion chirurgicalement).
- Un bug confirmé peut viser du code **dont la sortie est jetée** → test de perturbation avant fix.
- Une garde qui **lit la table de config** pour choisir quoi vérifier est CIRCULAIRE : elle ne peut
  pas détecter une erreur DANS la table. Il faut une assertion qui ne la consulte pas (mesuré sur
  `dailyLedger` : un solde reclassé en flux laissait les deux invariants verts).
  Même famille : un jeton qui prouve À LA FOIS le problème et le correctif rend la garde AUTO-SATISFAITE.
- Élargir l'assiette d'un calcul → auditer TOUS les dérivés qui partagent cette base.
- Corriger « le producteur X a oublié le registre Y » → **énumérer TOUS les producteurs** par grep sur
  le registre, pas seulement celui du ticket. `realEstateMonth.ts` a cumulé 4 défauts money-critical
  parce que 4 passes de correction l'ont sauté (`MODULE-ECRIT-HORS-CHECKLIST`).
- Un registre per-conjoint qui devient pilote doit gérer **décès/divorce** (la conservation ne l'attrape pas).
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
- Vérifs money-critical **en ISOLATION, séquentielles** (course `git stash` concurrente vue 2×).

**Avant de coder**
- Vérifier qu'une feature n'est pas **DÉJÀ faite** (grep le moteur).
- Un paramètre **HOMONYME à deux niveaux** (config globale vs entité) : grep le consommateur RÉEL avant
  de câbler — l'autre niveau peut être un no-op typé vert (`propertyGrowthRate`, mesuré 0/120 au fuzz).
- Un **constat d'IMPOSSIBILITÉ que j'ai écrit** (ticket, bandeau, réponse à Marc) se re-prouve avant
  d'être cité : « seule la valeur nette peut passer au jour » était faux, le moteur émettait déjà de
  quoi ventiler — deux livraisons perdues (`DOC-STALE-IMPOSSIBILITY`).
- Un item BACKLOG peut être **périmé** ou **contredire une décision verrouillée**
  (`docs/decisions.md`) → confirmer avant de coder, cocher « caduque » sinon.
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
- Un test `.length > 1` sur un **tuple** de longueur fixe est vacueux.

**Divers**
- « Livré, testé, déployé » ≠ **ATTEIGNABLE** : pour une feature gatée par une INTERACTION, compter les
  gestes depuis l'état par défaut et vérifier CHAQUE modalité (souris/doigt/clavier). Un test qui
  boucle pour atteindre l'état testé mesure le coût du chemin (`UX-UNREACHABLE-FEATURE`).
- Un **nom trompeur fabrique des faux findings** → renommer est le vrai correctif.
- « Moins de texte » se satisfait en SUPPRIMANT de l'information : séparer l'**alerte** (marqueur
  compact, visible partout) du **libellé** (déplaçable en `title`). La garde tient les DEUX
  exigences ensemble — plafond de prose ET « aucune réserve perdue » — car chacune seule est
  satisfaite par le mauvais moyen (`EPURATION-SUPPRIME-LA-RESERVE`).
- Une **heuristique de TEXTE** (regex sur un libellé) qui coexiste avec du texte UTILISATEUR interpolé
  dans les mêmes libellés produit des faux positifs : toléré sur une pastille visible à l'œil,
  INACCEPTABLE dans un prompt LLM (l'affirmation fausse hérite de l'autorité de la source unique).
  Dériver le fait d'un marqueur STRUCTUREL — il existait déjà (`FireTarget`), la regex était en plus
  redondante (`TEXT-HEURISTIC-OVER-USER-TEXT`, 2026-08-12).
- Un test d'interaction doit **cliquer là où l'utilisateur clique** (sur la donnée, pas dans la marge)
  — un `onClick` React ne capte PAS un clic sur une forme SVG redessinée au survol : la moitié basse
  de la courbe Futur était morte au clic depuis toujours (`FUTUR-CLICK-AREA`, → `pointerup`).
- Resserrer un scan-garde **AVANT** de coder le fix : les offenders révélés = le vrai périmètre.
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
- Un composant testé à son **CONTRAT** ne dit rien de ce qu'on lui PASSE : quand un index/une clé est
  calculé ailleurs, viser le CALCUL (l'extraire en fonction pure le rend testable)
  (`TEST-AU-CONTRAT-NE-VOIT-PAS-L-APPELANT`).
- Une **fixture qui remplit tous les champs** rend le repli inatteignable — et c'est souvent le repli
  qui fuit. Une fixture par branche (`FIXTURE-COMPLETE-CACHE-LE-REPLI`).
- Une décision de **vie privée** écrite pour UNE sortie se repasse sur TOUTES (PDF, CSV, backup,
  prompt LLM, MCP, logs), et la garde vit au SERVICE, pas au clic (`DECISION-PRIVACY-UNE-SEULE-SORTIE`).
- Masquer une donnée peut **retirer un discriminant** et casser les noms accessibles : le remplacer
  par un discriminant non sensible (`MASQUAGE-RETIRE-UN-DISCRIMINANT`).
- Un **stub** documenté « retourne toujours `[]` » peut rester branché des mois sans alerte si le
  mode test nourrit les surfaces en synthétique.
- Un audit externe/UX headless a un fort taux de faux positifs sur le money-critical — mais
  garder le claim faux comme note de **perception**.
- Avant de lancer un agent sur « l'état du code », **prouver l'état du code** (`git fetch` + comparer
  à `origin/main`) : un revert de conteneur fait auditer une version morte, et le rapport reste
  PLAUSIBLE — vrais `fichier:ligne`, vraies mesures, mauvaise version (`AUDIT-SUR-TREE-PERIME`).
- Un finding juste peut porter un **correctif invalide** : lire le contexte SYNTAXIQUE (le parent),
  pas la ligne citée — « en faire un `<button>` » sur un span imbriqué dans un `<button>` produit du
  HTML invalide (`FINDING-JUSTE-CORRECTIF-INVALIDE`).
- Une **métrique recopiée** dans plusieurs docs diverge (41/48/50 sous-modules, deux comptes de tests
  contradictoires dans un MÊME fichier). Ne pas corriger les N copies : en désigner UNE comme source
  et faire pointer les autres (`DOC-METRIQUE-RECOPIEE`).

## Agents & automatisation

Agents et hooks : voir `.claude/` et la section correspondante de `docs/CONVENTIONS.md`.
Les agents ECC sont en anglais → **répondre à Marc en français** quoi qu'il arrive.
En conflit entre une règle ECC et les règles ci-dessus, **celles-ci prévalent**.

⚠️ **Committer (et POUSSER dès que la branche est libre) avant TOUTE attente longue** — panel
d'agents, suite de tests, CI : un revert de conteneur pendant l'attente efface un lot entier
non commité, stash compris (vécu 2×, dont le Lot 1 REFONTE-NAV pendant `npm run test`).
