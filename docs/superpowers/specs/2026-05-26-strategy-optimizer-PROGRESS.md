# G21 C5 — Optimiseur de stratégies : HANDOVER / état d'avancement

> **But de ce document** : permettre à une session fraîche (post-compaction) de
> reprendre le chantier sans rien re-découvrir. Contient le design approuvé, les
> faits techniques du moteur (avec ancrages : fichiers, lignes, noms de champs), ce
> qui est fait, et le détail précis de ce qui reste.
>
> Spec de design complet : `2026-05-26-strategy-optimizer-design.md` (même dossier).

---

## 0. Contexte & objectif

Marc veut un **optimiseur de stratégies financières** dans l'onglet Futur :
- Il **choisit les leviers dans l'app** (coche/décoche + valeurs) → l'espace de
  recherche se compose dynamiquement (~100-240 configs).
- Le système lance un **Monte Carlo (1000 sims/config, paramétrable)** sur **toutes**
  les combinaisons, en **multi-worker** (sharding sur tous les cœurs).
- Il **valide LA meilleure** selon un **objectif au choix** (Équilibré / Patrimoine /
  Impôt / FIRE), re-triable instantanément.
- Il veut une **explication détaillée** du pourquoi (gagnant vs dauphin) et le
  **score complet** de chaque gagnante.

Successeur direct de **C4** (`strategyRobustness.ts`, 5 stratégies figées) — jugé
insuffisant par Marc.

## 1. Décisions verrouillées (brainstorming)

- **10 leviers** dans la bibliothèque (voir `strategyConfig.ts` → `LEVER_LIBRARY`).
- Recherche **plate** (pas d'entonnoir), **1000 sims/config** par défaut, paramétrable.
- Exécution **multi-worker** (obligatoire à cette échelle).
- Approche moteur **« adaptateur fin »** (Option B) : on NE réécrit PAS `runScenario`,
  on ajoute des overrides optionnels + on clone `params` par config.
- Classement par **objectif** (réutilise le concept C1 `OptimizeObjective`), re-tri en
  mémoire sans recalcul.
- Garde-fou UI : compte de configs + temps estimé en direct, avertissement > 300.
- YAGNI : pas d'optimisation continue (grille seulement), pas de save/share de configs.

## 2. Comment le moteur existant fonctionne (FAITS — ancrages)

### `services/projection.ts`
- `runScenario(params, strategy, enableMonteCarlo, delayPensions, mcIterationIndex,
  scenarioType, overrides)` — **fonction PRIVÉE** (non exportée). Ligne ~72.
  - `overrides: EngineOverrides = {}` ← **ajouté au commit 1**.
  - RNG seedée déterministe : `buildSeededRng(scenarioType, strategy, mcIterationIndex)`
    → MC reproductible (testé).
  - Retourne un objet avec `finalNetWorth`, `minNetWorth`, `totalTaxesPaid`,
    `totalGrowth`, `totalExpenses`, `shortfallRate`, `estateNetWorth`, `chartData`.
- `calculateFutureProjection(params, runMC, selectedIdx)` — exporté. Mappe
  `SCENARIO_DEFINITIONS` → résultats. Chaque résultat porte `strategy` (ajouté C4),
  `strategyName`, `stratType`, `kind`, etc. Champ `allResults` + `bestStrategyIdx`.
- `calculateRobustnessRanking(params, opts)` — exporté (C4). Injecte `runScenario`
  dans `rankStrategiesByRobustness`.
- **Points d'injection des overrides (commit 1)** :
  - RealEstate ctx (~ligne 771) : `skipRapForPurchase: overrides.skipRapForPurchase ??
    (strategy === 'PRIO_CELI_NO_RAP')`.
  - Cashflow ctx (~ligne 942) : `contributionOrder: overrides.contributionOrder,
    debtFirst: overrides.debtFirst`.
- Leviers réalisés par **clone de params** (PAS d'override moteur) : `retirementAge`
  (`params.retirementGoal.targetAge`), `retirementSpending`
  (`params.retirementGoal.targetMonthlyIncome` × facteur), `emergencyFundMonths`
  (`params.projection.emergencyFundMonths`), `smithManoeuvre`
  (`params.projection.useSmithManoeuvre`).

### `services/projection/cashflowAllocation.ts`
- `processCashflowAllocation(state, ctx, activeDebts, calcFiscalReport, calcGrossWithholding)`
  — **exporté** (testable directement, cf. tests commit 1).
- `CashflowCtx` a maintenant `contributionOrder?` et `debtFirst?` (commit 1).
- Résolution : `debtFirstActive = debtFirst ?? (strategy === 'DEBT_FIRST')` ;
  `reerFirstContrib = contributionOrder ? ... : (dérivé de l'enum)`.

### `services/projection/monteCarlo.ts`
- `runMonteCarlo(runScenario, params, strategy, delayPensions, iterations)` → retourne
  `{ successRate, p10Data, p50Data, p90Data, fvi, expertMetrics }`.
- `successRate = round(% des runs où finalNW > 0)` — **exactement le critère « taux de
  succès »**. `p50Data` = trajectoire net-worth mensuelle de la run médiane (dernier
  élément = patrimoine médian final). `expertMetrics` : swr, taxLeakage, shortfallRisk,
  sequenceRiskPct, worstDecadeDrawdown.

### `services/projection/strategyRobustness.ts` (C4)
- `rankStrategiesByRobustness(runScenario, params, opts)` — re-lance MC par stratégie
  `kind:'strategy'`, classe par successRate. **À généraliser** au commit 4 pour itérer
  sur des `StrategyConfig` au lieu des 5 scénarios figés.

### `services/projection/runAsync.ts` + `services/projection.worker.ts`
- Worker existant : modes `'projection'` et `'robustness'` (C4). Messages `__progress`,
  watchdog réarmé à chaque progrès (pas de timeout fixe), fallback synchrone Node/tests.
- `runRobustnessRankingAsync(params, { iterationsPerStrategy, onProgress })`.
- **Pool multi-worker à construire au commit 4** : aujourd'hui 1 seul worker singleton.

### `services/projection/monthlyOutput.ts` (noms de champs chartData utiles)
- `rapBalance` = `rapRepaymentDueTotal` (signal RAP, cf. tests C3 suite).
- `Immobilier` = équité immobilière. `REER`, `RetraitREER`, `NetWorth`, `FireTarget`.

### `services/projection/strategyRanking.ts` (C1 — PUR)
- `rankStrategies(scenarios, objective, opts)` classe des résultats DÉTERMINISTES déjà
  calculés selon `OptimizeObjective` ('balanced'|'wealth'|'tax'|'fire'). **À adapter**
  au commit 5 pour classer des résultats MC (utiliser P50/successRate/impôt/FIRE).

## 3. FAIT — Commit 1 (`a1ee5c9`)

**`services/projection/strategyConfig.ts`** (nouveau) :
- `StrategyConfig` (10 champs), `EngineOverrides` (skipRapForPurchase,
  contributionOrder, debtFirst), `WithdrawalOrder`, `ContributionOrder`.
- `LEVER_LIBRARY: LeverDef[]` — 10 leviers avec `key`, `label`, `options{value,label}`,
  `default` (= comportement moteur actuel). C'est la source pour le composeur UI.
- `withdrawalOrderToStrategy()` (identité, les 4 valeurs = l'enum).

**Découplage moteur** : `cashflowAllocation.ts` (contributionOrder + debtFirst,
défauts = historique), `projection.ts` (param `overrides` threadé).

**Tests** : `tests/services/cashflowAllocation.overrides.test.ts` (5 tests de
sensibilité). **669 tests existants toujours verts** → non-régression prouvée.

## 4. RESTE À FAIRE — détail par commit

### Commit 2 — Câblage `assetLocation` dans le moteur (LE PLUS DÉLICAT)
- `services/projection/assetLocation.ts` existe (service `optimizeAssetLocation`) mais
  n'est PAS branché dans la boucle de simulation. Le lever `assetLocation: true` doit
  influencer les **rendements par compte** (obligations→REER, actions→CELI, etc.) durant
  la projection. Risque : mapping classes d'actifs → comptes pendant la sim.
- **Alternative pragmatique si trop lourd** : approximation via les `returnRates` par
  compte (`params.projection.returnRates`) — appliquer un léger bonus de rendement
  net-d'impôt aux comptes bien placés. À discuter/évaluer.
- Tests : un portefeuille mal placé → `assetLocation:true` améliore le patrimoine final.

### Commit 3 — ✅ FAIT (`cf2c83a`) — Générateur d'espace (`strategySpace.ts`)
- `LeverSelection` = `{ [key]: valeurs[] }` (leviers activés + valeurs cochées).
- `SpaceContext` = `{ hasPrimaryPurchase: boolean; currentAge: number }`.
- `generateStrategySpace(selection, ctx): StrategyConfig[]` = produit cartésien.
  - Levier absent/désactivé → `[default]` (1 valeur).
  - **Dédup** : `retirementAge` < currentAge retirés ; `skipRap` collapse à `[default]`
    si `!hasPrimaryPurchase` (RAP non pertinent) ; axes à 1 valeur n'augmentent pas.
- `countConfigs(selection, ctx)` (pour l'affichage live UI).
- `estimateRuntimeMs(nConfigs, iterations, costPerSimMs)` (estimateur de coût).
- `configToEngine(config, baseParams): { params, strategy, delayPensions, overrides }`
  — traduit un `StrategyConfig` en arguments `runScenario` (clone params + overrides).
- Tests : compte exact, collapses, cartesian correct, configToEngine mappe bien.

### Commit 4 — Pool multi-worker + recherche
- `runStrategySearchAsync(configs, { iterations, onProgress })` : shard `configs` sur
  `navigator.hardwareConcurrency` workers, chaque worker lance MC par config via
  `configToEngine` + `runMonteCarlo`. Agrège progression globale.
- Étendre `projection.worker.ts` (mode `'strategySearch'`) + `runAsync.ts` (pool, pas
  singleton — attention au state `_worker` actuel ; créer un pool dédié).
- Résultat par config : successRate, P10/P50/P90, fvi, impôt à vie, âge FIRE, sequenceRisk.
- Tests : sharding complet (toutes configs couvertes), agrégation, fallback sync, déterminisme.

### Commit 5 — Classement objectif + explication + détail score
- Adapter `rankStrategies` (ou nouveau `rankStrategyResults`) pour trier les résultats
  MC selon l'objectif (P50 pour wealth, impôt à vie pour tax, âge FIRE pour fire,
  composite pour balanced). Garde de survie (exclure successRate < seuil du podium).
- `explainWinner(winner, runnerUp)` → texte FR comparant sur chaque dimension + nomme
  les leviers décisifs (ceux qui diffèrent du dauphin).
- Tests : tri par objectif, explication winner vs dauphin, leviers décisifs corrects.

### Commit 6 — UI `StrategyOptimizerPanel`
- Composeur (cases leviers + valeurs, compte+temps live, avertissement >300).
- Bouton « Trouver la meilleure stratégie » → barre progression multi-worker.
- Verdict (gagnant + 10 leviers en clair + explication) → carte détail score complet →
  tableau triable/filtrable de toutes les configs (filtres par levier).
- Sélecteur d'objectif → re-tri sans recalcul.
- Style : s'aligner sur `AssetLocationPanel.tsx` / `RobustnessPanel.tsx` (text-meta,
  text-tiny, focus-ring, privacy-blur). Intégrer dans `FutureProjection.tsx` après
  `<RobustnessPanel params={params} />` (~ligne 914).

### Commit 7 — Docs
- ADR sur le découplage moteur (`decisions/<NNNN>-strategy-config-decoupling.md`).
- MAJ `docs/BACKLOG.md` (C5 fait) + `CHANGELOG.md`.

## 5. Gotchas / environnement (IMPORTANT)
- **Node pas sur le PATH** : lancer via PowerShell avec
  `$env:PATH = "C:\Program Files\nodejs;$env:PATH"` puis
  `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run <script>`.
  NE PAS lancer via Bash (échoue).
- **Commits** : messages via fichier temp ou heredoc Bash — les apostrophes FR cassent
  les here-strings PowerShell. Bash heredoc `git commit -F - <<'EOF'` marche bien.
- **scenarios.ts** : ne JAMAIS réintroduire d'apostrophes typographiques U+2018/U+2019
  comme délimiteurs de chaîne (bug esbuild silencieux). Double quotes ASCII.
- **Scripts** : `npm run typecheck` (tsc --noEmit), `npm run test -- --run`,
  `npm run build` (lint en prebuild). Tests actuels : **669 verts** (+ 5 commit 1 = 674).
- **runScenario non exporté** : tester l'optimiseur via faux `runScenario` injecté
  (cf. `strategyRobustness.test.ts`) OU via `processCashflowAllocation` exporté.

## 6. État git — ✅ C5 TERMINÉ (tous les commits)
- Branche `main`. Commits C5 : `201bb8f` (spec), `a1ee5c9` (c1 moteur), `cf2c83a` (c3
  générateur), `78fcae0` (c4 pool+recherche), `6151997` (c5 classement+explication),
  `fad78bb` (c6 UI), `8bfce6f` (c2 assetLocation), + docs (c7).
- **704 tests verts**, typecheck propre, build OK.

### Récap par commit
- ✅ **Commit 1** (`a1ee5c9`) — StrategyConfig + EngineOverrides + découplage moteur.
- ✅ **Commit 2** (`8bfce6f`) — assetLocation via clone params (+0,4pp NonReg). Approche
  pragmatique (pas de suivi par classe d'actif). Effet modulé par le solde NonReg réel.
- ✅ **Commit 3** (`cf2c83a`) — `strategySpace.ts` (générateur + configToEngine).
- ✅ **Commit 4** (`78fcae0`) — `strategySearch.ts` (MC + run déterministe par config) +
  `runStrategySearchAsync` (pool multi-worker, sharding contigu) + mode worker. Fix :
  `runMonteCarlo` threade désormais les overrides.
- ✅ **Commit 5** (`6151997`) — `strategyConfigRanking.ts` (classement par objectif +
  garde de survie + breakdown + `explainWinner` + `decisiveLevers`).
- ✅ **Commit 6** (`fad78bb`) — `StrategyOptimizerPanel.tsx` (composeur + verdict +
  détail score + tableau triable/filtrable + sélecteur d'objectif). Intégré dans Futur.
- ✅ **Commit 7** — docs (ADR-008, CHANGELOG, BACKLOG, ce handover).

## 7. Suites possibles (hors scope C5)
- Affiner l'approximation `assetLocation` (suivi par classe d'actif dans la boucle) si
  Marc juge le +0,4pp trop grossier.
- Sauvegarde/partage de configurations d'optimiseur (YAGNI pour l'instant).
- « Appliquer » le gagnant : pousser sa config vers les paramètres réels du Futur.
