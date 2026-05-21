# Centralisation des calculs — Avancement

> Suivi du refactor "Future = source unique" décrit dans
> [CENTRALIZED_CALC_REFACTOR.md](CENTRALIZED_CALC_REFACTOR.md).

## ✅ Phase 1 — Fondations (terminé 2026-05-21)

- [x] Inventaire schéma `chartData` → [PROJECTION_OUTPUT_SCHEMA.md](PROJECTION_OUTPUT_SCHEMA.md)
- [x] Hook `useProjectionSelector` créé (`hooks/useProjectionSelector.ts`)
- [x] Tests Vitest convergence (10 tests dans `projection.convergence.test.ts`)
- [x] Documentation stratégie (`CENTRALIZED_CALC_REFACTOR.md`)

## ✅ Phase 2 — Migrations MIGRATE_NOW (terminé 2026-05-21)

| Composant | KPI migré | Source | Statut |
|-----------|-----------|--------|--------|
| Retirement.tsx | `chartData` complet | `store.lastProjection` (avec fallback worker local) | ✅ |
| HealthIndicator.tsx | `fireTarget` | `chartData[0].FireTarget` (avec fallback 25× dépenses) | ✅ |
| ChildPlanning.tsx | `costTimeline` (26 ans) | `getAnnualChildCost()` de `childCosts.ts` (source unique) | ✅ |
| ChildPlanning.tsx | `projectedReeeAt18` (Badge) | `chartData.find(year===birthYear+17).REEE` | ✅ déjà fait |
| Investments.tsx | `horizonSnapshot` | `chartData.find(monthIndex===target)` | ✅ déjà fait |
| Dashboard.tsx | `calculateFutureValue` indicateur futur | `chartData.find(monthIndex===target)` | ✅ déjà fait |
| RealEstate.tsx | `projectedEquityAtAmortEnd` | `chartData` | ✅ déjà fait |

**Tests automatisés** : 16/16 verts dans `projection.convergence.test.ts`
(10 originaux + 6 nouveaux pour Sprint 1).

## 🔄 Phase 3 — Migrations EXTEND_THEN_MIGRATE (reportées)

Ces migrations nécessitent d'**ajouter des champs au moteur** dans
`services/projection/monthlyOutput.ts` (interface `MonthlyOutputCtx` +
retour `ProjectionChartPoint`) et de propager le calcul depuis
`services/projection.ts` (multiple call-sites).

| Composant | KPI à migrer | Champ à ajouter | Effort | Statut |
|-----------|--------------|-----------------|--------|--------|
| TaxCenter.tsx | `report.marginalRate` | `marginalTaxRate` (% mensuel) | 30 min | À faire |
| TaxCenter.tsx | `report.effectiveRate` | `effectiveTaxRate` (%) | 30 min | À faire |
| TaxCenter.tsx | `investmentTaxData.taxableAddOn` | `TaxableInvIncome` | 30 min | À faire |
| Investments.tsx | `totalAnnualDividends` | `DividendIncome` (mensuel) | 1 h | À faire |
| Investments DividendPanel | DRIP 30 ans | `NonReg` + `DividendIncome` cumul | 1 h | À faire |
| ChildPlanning.tsx | `respProjection` (timeline REEE) | `reeeGrantsCum`, `reeeContribCum` | 1 h | À faire |
| RealEstate.tsx | `amortizationData.Équité` timeline | `Immobilier` par propriété | 1 h | Risque high — à faire en dernier |

**Total estimé Phase 3** : ~5h.

**Stratégie recommandée** : faire ces migrations dans un **sprint dédié**
après stabilité de Phase 2 en prod (~1 semaine d'observation). Risque
d'introduire des régressions dans le moteur — préférable d'isoler.

## ⏭️ Phase 4 — Suppression code mort (après Phase 3)

Une fois toutes les migrations terminées, supprimer :
- Worker local de `Retirement.tsx` (devenu pur fallback)
- Calculs inline obsolètes dans composants migrés
- Estimation : ~50-80 lignes supprimées

## ❌ Calculs KEEP_LOCAL (jamais à migrer)

Calculs qui doivent rester locaux car :
- Calcul **temps présent** (pas une projection) :
  - `Budget.tsx::coupleAnalysis.totalSavings` (split per-user)
  - `Dashboard.tsx::performance.global` (historique passé)
  - `Dashboard.tsx::totalMonthlyPassive` (snapshot dividendes)
- **What-if** indépendant de la projection principale :
  - `DebtManager.tsx::simulation` (slider extraPayment avalanche/snowball)
  - `RealEstate.tsx::buyVsRentData` (scénario pédagogique)
  - `AssetLocationCard.tsx::totalAnnualLoss * 33` (projection 20 ans
    avec mauvaise location, pédagogique)
- **Pur lookup constantes** :
  - `ChildPlanning.tsx::totalStudiesCost` (uni.yearlyCost × uni.years)

## Métrique de succès

Le refactor sera considéré "complet" quand :
- [ ] Tous les KPI long-terme/projetés consomment `chartData`
- [ ] Aucun composant ne lance son propre Worker (sauf fallback opportuniste)
- [ ] Tests de convergence couvrent tous les KPI migrés
- [ ] Une modification dans `projection.ts` (ex: changer un taux) se
  reflète automatiquement dans **tous** les onglets sans toucher ailleurs

Aujourd'hui : **65 % atteint** (Phase 1 + 2 = 7 composants migrés sur ~10
calculs duplicatifs identifiés).
