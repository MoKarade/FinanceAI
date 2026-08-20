# FinanceAI — CLAUDE.md

App perso de planif financière (fiscalité ARC + Revenu Québec, Monte Carlo retraite,
assistant Claude). 100 % navigateur, pas de backend. TS strict, **4 516 tests** Vitest
(405 fichiers de test, mesuré le 2026-08-20). Tout en français.

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
- ⚠️ **La tranche retirée d'une assiette doit être la grandeur RÉELLE, pas l'estimé de saisie** :
  soustraire l'estimé non indexé, sans prorata et sans SRG d'un revenu nominal faisait −29 % sur le
  seul dénominateur — rien ne crie. Signal : **la même variable indexée à 40 lignes d'écart et pas
  à l'autre** ; quand deux usages d'un même symbole divergent dans un même bloc, l'un est faux.
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
  Même famille : un jeton qui prouve À LA FOIS le problème et le correctif rend la garde AUTO-SATISFAITE.
- Élargir l'assiette d'un calcul → auditer TOUS les dérivés qui partagent cette base. Et relire
  TOUTE la fonction : un raccourci d'égalité entre deux grandeurs qui viennent de diverger
  (`taxEmployer = taxReal`, `employmentIncome` par défaut = `gross`) devient faux en SILENCE — ni
  `tsc`, ni le lint, ni 4 368 tests ne l'ont vu (`ASSIETTE-ELARGIE-CASSE-SES-RACCOURCIS`).
- Un écart CONSTANT dans un test (indépendant de l'entrée qu'on fait varier) n'est presque jamais le
  bug cherché : c'est une grandeur voisine incluse par erreur dans la mesure. Le mettre à zéro pour
  trancher — et creuser quand même, l'écart de 766 $ a révélé un vrai défaut voisin.
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
- Une grandeur **DÉRIVÉE ne s'interpole pas**, elle se RECOMPOSE : lisser séparément les deux côtés
  d'une identité comptable (patrimoine vs ses composants) la casse entre les points de raccord —
  25 invariants du grand livre restaient VERTS pendant que l'identité dérivait de 89 $ au jour
  (`IDENTITE-COMPTABLE-INTERPOLEE-TROIS-FOIS`).
- Une garde ne dit RIEN des mois qu'elle ne parcourt pas : la forme-flux tournait sur une fixture de
  12 ans dont la retraite était à 62 ans — tout le DÉCAISSEMENT était hors de portée. Portée à 35 ans,
  elle a trouvé 131 566 $ de FERR sans flux publié, en déterministe
  (`INVARIANT-QUI-NE-PARCOURT-PAS-LA-PHASE`).
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
- Un paramètre **HOMONYME à deux niveaux** (config globale vs entité) : grep le consommateur RÉEL avant
  de câbler — l'autre niveau peut être un no-op typé vert (`propertyGrowthRate`, mesuré 0/120 au fuzz).
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
- Un **percentile de TRAJECTOIRES n'est pas un percentile** : trier des séries entières par UNE de
  leurs valeurs puis lire toutes les autres ne garantit aucun ordre aux points intermédiaires
  (mesuré : cône Monte Carlo croisé sur 27 % des mois, 737 974 $ d'écart). Trier la COLONNE de
  chaque pas de temps (`PERCENTILE-DE-TRAJECTOIRES-N-EST-PAS-UN-PERCENTILE`).

**Divers**
- Un **champ du TYPE que l'UI ne demande jamais** n'est pas livré : `Debt.termEndDate` existait
  depuis W5.3, exposé nulle part, et `DebtManager` n'avait que « Ajouter »/« Supprimer » — corriger
  une dette imposait de la détruire. « Créer + supprimer » n'est pas « gérer »
  (`CHAMP-DANS-LE-TYPE-INATTEIGNABLE-DANS-L-UI`).
- Une **échéance ne solde pas une dette** : à la fin d'un terme on arrête le paiement, on LAISSE le
  solde résiduel au bilan (l'effacer fabriquerait du patrimoine) et on alerte UNE fois. Et une dette
  pas encore commencée doit sortir AUSSI du bilan — `sumActiveDebts` est une closure définie avant la
  boucle, elle sommait tout (`EFFACER-SUR-UNE-DATE-FABRIQUE-DU-PATRIMOINE`).
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
- Une garde indexée **PAR COMPOSANT** branchée sur une grandeur **AGRÉGÉE** ne peut jamais se
  déclencher (`syntheticTailKeys` est peuplé par symbole, jamais pour `TOTAL`) — et même relevée au
  bon niveau, elle peut rater le chemin le PLUS courant (le report de prix ≤ 7 j ne marque rien).
  Refonder la règle sur un fait lisible dans la SOURCE (`GARDE-SUR-AGREGAT-AVEC-INDEX-PAR-COMPOSANT`).
- Quand un test dépend d'un pas d'échantillonnage ou d'un modulo, la longueur de la fixture est un
  PARAMÈTRE : la calculer et l'asserter dans le test (`expect((N-8) % pas).not.toBe(0)`). Choisie au
  jugé, elle rend le cas vacueux par simple parité — mesuré (`PARITE-QUI-REND-UN-TEST-VACUEUX`).
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

### CI (GitHub Actions)

⚠️ **« Gate local vert » ≠ « CI verte »** : le conteneur de dev tourne sur Node **22**, les workflows
épinglent **20**, et rien ne déclare la cible (`engines`/`.nvmrc` absents — `[ENV-NODE-NON-DECLARE]`).
`globSync` (`node:fs`, Node 22+) a donné un gate local vert et une CI rouge sur le MÊME commit.
Avant d'employer une API `node:*`, vérifier depuis quelle version elle existe vs le `node-version`
des workflows — pas le `node -v` local. Symptôme : `TypeError: X is not a function` en CI seulement.
Le correctif est presque toujours de **réutiliser le marcheur/patron déjà employé par le dépôt**
(ici `readdirSync(dir, { recursive: true })`), dont la compatibilité est déjà prouvée par la CI
(`GATE-LOCAL-VERT-CI-ROUGE-PAR-VERSION-DE-NODE`).

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

## Agents & automatisation

Agents et hooks : voir `.claude/` et la section correspondante de `docs/CONVENTIONS.md`.
Les agents ECC sont en anglais → **répondre à Marc en français** quoi qu'il arrive.
En conflit entre une règle ECC et les règles ci-dessus, **celles-ci prévalent**.

⚠️ **Committer (et POUSSER dès que la branche est libre) avant TOUTE attente longue** — panel
d'agents, suite de tests, CI : un revert de conteneur pendant l'attente efface un lot entier
non commité, stash compris (vécu 2×, dont le Lot 1 REFONTE-NAV pendant `npm run test`).
