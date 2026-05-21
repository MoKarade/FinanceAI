# ADR 005 — Future = source unique pour les calculs projetés

**Date** : 2026-05-21
**Statut** : Accepté
**Décideurs** : Marc (user), Claude

## Contexte

Historiquement, chaque onglet de FinanceAI implémentait ses propres calculs
long-terme (capital retraite, FIRE number, coût lifetime enfant, etc.). Le
moteur central de projection (`services/projection.ts`) était également utilisé
mais en parallèle des implémentations locales — résultat : **divergences
silencieuses** entre les chiffres affichés dans Retraite vs Future, ChildPlanning
vs Future, Investments DividendPanel vs Future, etc.

Concrètement :
- Retirement.tsx lançait son propre Worker avec `scenarioIdx=0, MC=false` —
  Future utilisait `selectedScenarioIdx + MC=true`
- ChildPlanning calculait `costTimeline` inline avec ses propres formules
  (50+ lignes dupliquant la logique de tranches d'âge)
- Dashboard avait un fallback formule 5 % "si la projection n'a pas été
  calculée" — chiffres incohérents
- HealthIndicator calculait `fireTarget = monthlyExpenses × 12 × 25` même
  quand la projection était déjà disponible avec une cible plus précise

Demande utilisateur : *« tous les calculs viennent du graph Future, et si
pas disponible alors message d'erreur — un seul endroit pour corriger les
bugs »*.

## Décision

**Le moteur de projection (`services/projection.ts`) est la SEULE source
de vérité pour tout calcul long-terme ou projeté.** Les autres onglets
consomment exclusivement `store.lastProjection.chartData` via le hook
partagé `useProjectionSelector`.

Si la projection n'a pas encore été calculée, les composants affichent
l'empty state `<ProjectionRequired>` plutôt que d'inventer des valeurs.

### Mécanisme

1. **Moteur** : `calculateFutureProjection(params)` produit `chartData[]`
   avec ~50 champs par point mensuel sur 60-80 ans
2. **Store** : `setLastProjection(result)` met à jour `store.lastProjection`
   depuis Future
3. **Consommateurs** : autres onglets lisent via
   `useProjectionSelector(chart => chart.find(p => p.age >= 60)?.NetWorth, 0)`
4. **Mode strict** : `if (!hasProjection) return <ProjectionRequired />`

## Conséquences

### Positives

- **Convergence garantie** : un bug de calcul → une seule fix dans
  `services/projection.ts`. Tous les onglets reflètent automatiquement.
- **Performance** : un seul Worker (Future) au lieu de N. Suppression
  de Retirement.tsx worker local (~50 lignes).
- **Cohérence UX** : changer le scénario actif dans Future met à jour
  TOUS les onglets en cascade. Badge "Scénario actif" dans Retirement.
- **Tests** : nouvelle catégorie de tests *convergence* (16 tests dans
  `projection.convergence.test.ts`) qui pin les invariants attendus.
- **No-fake** : plus de fallbacks fake (formule 5 %, × 10 × 1.4 Latte
  Factor, etc.) qui mentaient à l'utilisateur.

### Négatives

- **Dépendance forte** au moteur Future. Si la projection plante,
  plusieurs onglets affichent un empty state.
- **Parcours utilisateur** : il faut ouvrir Future au moins une fois
  par session pour débloquer Retraite/Dashboard FIRE/etc.
  - Mitigation : message clair `ProjectionRequired` + bouton
    "Ouvrir Future →"
- **Extension du moteur nécessaire** pour exposer de nouveaux champs.
  Phase 3 a ajouté 9 nouveaux champs (`marginalTaxRate`, `realNetWorth`,
  `reeeContribCum`, etc.).

### Calculs explicitement KEEP_LOCAL

Certains calculs **ne doivent PAS** être centralisés :
- **Temps présent** : Net Worth actuel, dépenses du mois, performance YTD
  → sont des snapshots, pas des projections
- **What-if** : `DebtManager` extinction avalanche avec slider extraPayment,
  `RealEstate` buy-vs-rent comparaison → calculs pédagogiques isolés
- **Pur lookup constantes** : `ChildPlanning.totalStudiesCost =
  uniInfo.yearlyCost × uniInfo.years` (pas une projection, juste un produit)

## Alternatives considérées

### A. Garder N calculateurs (status quo)

❌ **Rejetée** : divergences inéluctables, dette technique croissante,
maintenance × N.

### B. Calculateurs locaux + hash de vérification

Faire les calculs localement, mais hasher le résultat et comparer avec le
hash du moteur. Logger un warning si divergence.

❌ **Rejetée** : complexe à maintenir, ne corrige pas le bug juste le
détecte, double l'effort de dev.

### C. Future = source unique (ADR retenue)

✅ **Acceptée** : simple, garantie de convergence par construction,
réduction de code.

## Statut d'implémentation

- ✅ Hook `useProjectionSelector` créé
- ✅ Composant `ProjectionRequired` créé
- ✅ 8 composants migrés en mode strict
- ✅ 9 nouveaux champs chartData ajoutés (Phase 3 Tier 1+2+3)
- 🔲 Phase 3 finition : split `IncomeRetirement` en `pensionRRQ/PSV/Privee`
  (refactor `retirementIncome.ts` non-trivial)

## Références

- [docs/CENTRALIZED_CALC_REFACTOR.md](../CENTRALIZED_CALC_REFACTOR.md) — plan stratégique
- [docs/CENTRALIZED_CALC_PROGRESS.md](../CENTRALIZED_CALC_PROGRESS.md) — suivi
- [docs/PROJECTION_OUTPUT_SCHEMA.md](../PROJECTION_OUTPUT_SCHEMA.md) — schéma exhaustif
- `hooks/useProjectionSelector.ts` — API
- `components/ui/ProjectionRequired.tsx` — empty state
- `tests/services/projection.convergence.test.ts` — 23 tests de convergence
