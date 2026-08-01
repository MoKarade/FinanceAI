# Schéma de `lastProjection.chartData[i]`

> Source de vérité de tous les KPI long-terme. Tous les onglets devraient
> consommer ces champs au lieu de recalculer.
> Mise à jour par `FutureProjection.tsx` via `setLastProjection(results)`.

## Type racine

```ts
interface ProjectionResult {
  chartData: ProjectionChartPoint[];      // 1 point par mois × 60-80 ans
  allResults: ScenarioResult[];           // 7 scénarios calculés (BASE, FIRE, LIBERTE_55, …)
  bestStrategyIdx: number;
  successRate: number | null;             // Monte Carlo (si runMC)
  fvi: number | null;                     // Vitalité Financière
  fireNumber: number;                     // Patrimoine FIRE cible
  estateNetWorth: number;                 // Patrimoine final (héritage)
  strategyName: string;
  aiNote: string;
}
```

## Champs d'un point mensuel (mode déterministe)

> En mode Monte Carlo, seuls `{ NetWorth, monthIndex, P10?, P50?, P90? }` sont peuplés.

### Identification temporelle

| Champ | Type | Sémantique |
|---|---|---|
| `monthIndex` | `number` | Index mois depuis t0 (0 = mois de départ) |
| `dateLabel` | `string` | Format `fr-CA` court, ex. `"mai 2026"` |
| `year` | `number` | Année calendaire |
| `age` | `number` | Âge de l'utilisateur ce mois |
| `isRetired` | `boolean` | `true` après `retirementMonthIndex` |

### Balances de fin de mois ($)

`Liquidites`, `CELI`, `CELIAPP`, `REER`, `REEE`, `NonReg`, `Crypto`, `Immobilier` (équité), `DetteTotale` (hypo + dettes), `DettesNonImmo` (dettes SANS hypothèque → `NetWorth = Σactifs − DettesNonImmo` tient même sous prêt, audit M5 2026-06-17), `LiquidDebt` (découvert porté en dette), `rapBalance`, `CELIMax`, `REERMax`.

### Variations mensuelles ($)

`diffNW`, `diffCELI`, `diffREER`, `diffLiquid` — delta vs mois précédent.

### Revenus ($/mois)

`IncomeMarc`, `IncomeAnna`, `IncomeRetirement`, `Income` (total brut), `NetSalary` (alias `Income`), `RentalIncome`.

### Dépenses ($/mois)

`Expenses` (total ménage), `ImmoCharges`, `ImmoHypo`, `ImmoInterest`, `ImmoPrincipal`.

### Enfants ($/mois)

`childCost` (net), `childGross`, `childBenefits`, `ReeeContrib`, `ReeePayout`.

### Retraits ($/mois)

`RetraitREER`, `RetraitCELI`.

> `RetraitREER` agrège **4 sources** (2026-07-31, PR #551/#552) : cascade de décaissement,
> meltdown REER (`[V2]`), conversion FERR obligatoire 71+ de janvier (`[V2'']`) et retraits de
> goals (`FinancialGoal.targetAccount === 'REER'`). Compteur d'AFFICHAGE brut — il n'entre dans
> aucun calcul fiscal ni de solde (neutralité NW pinnée par golden).

### Impôts

Mensuels ($/mois) : `ImpotLatent`, `FluxImpots`, `ImpotRetraitREER`, `ImpotSalaireMois`, `ImpotGainsCap`, `ImpotDivers`, `WithheldTaxRrif`.

> `totalTaxesPaid` (résultat scalaire, UI « Régularisations d'impôt (net) ») **= Σ FluxImpots
> exactement** ([PROJ-TTP-DOUBLECOUNT] 2026-08-01) : avril débite le bucket `.reer` entier
> (retenues cascade + meltdown + FERR provisionnées) + le complément de décembre — les retenues ne
> sont débitées qu'une fois. Il n'inclut PAS l'impôt retenu à la source des salaires (le moteur
> travaille en `netSalary`) — il peut être NÉGATIF (remboursements nets) chez un salarié.
> `WithheldTaxRrif` = retenue FERR (acompte, affichage). ⚠️ `ImpotRetraitREER` n'est PAS un
> acompte : mesuré = Σ TaxPaidREER (règlement d'avril) + Σ WithheldTaxRrif — la retenue FERR y
> figure DEUX fois dans la série (aucun consommateur applicatif, panel #554). Borne de fin
> d'horizon : l'année réconciliée par le DERNIER décembre n'a jamais son avril — exposée par
> **`unsettledTaxAtHorizon`** (scalaire SIGNÉ = le débit d'avril manquant, NET remboursements
> inclus — mesuré 13 542 $ / 8,6 % sur retraité solvable 10 ans, 51,5 % à 2 ans, 100 % à 1 an,
> ~0 sur portefeuille épuisé ; ADDITIVITÉ prouvée : TTP(N) + unsettled(N) == TTP(N+1) au cent) ;
> `strategySearch.lifetimeTax` l'additionne. Exclusion assumée : les retenues des décaissements du
> mois de DÉCEMBRE tombent après la réconciliation (stub non réconcilié, ~1 900 $ mesurés) — elles
> se règlent dans l'avril de l'année suivante, hors horizon. ⚠️ 4 surfaces lisent encore le
> compteur NU (taxLeakage MC, netTaxSettlements MCP, drawdownOptimizer) — ticket
> [ENG-TTP-UNSETTLED-PROPAGATE]. `totalEstateTax` (impôt de liquidation successorale) reste une
> grandeur DISJOINTE.
Payés (cumul YTD) : `TaxPaidRevenu`, `TaxPaidGains`, `TaxPaidDivers`, `TaxPaidREER`.
Provisionnés (current + previous year) : `AccruedTaxRevenu`, `AccruedTaxGains`, `AccruedTaxDivers`, `AccruedTaxREER`.

### Croissance marché

`MarketGrowth{CELI,REER,NonReg,Crypto,Liquid,CELIAPP,REEE}` ($), `MarketGrowthPct{...}` (%).

### Flux contribs/retraits ($/mois)

`ContribCELI`, `ContribREER`, `ContribNonReg`, `NetTransfer{CELI,REER,NonReg,Crypto,Liquid,CELIAPP,REEE}`.

### Patrimoine et FIRE ($)

`NetWorth`, `Savings` (= `Income − Expenses`), `FireTarget`, `CoastFIRE`, `BaristaFIRE`.

### Inflation

`ExpenseInflationImpact` ($/mois), `ExpenseInflationPct` (%/mois).

### Événements

`lifeEvents: string[]` — événements majeurs (RAP, REER→FERR, naissance, vente immo…)
`flowEvents: string[]` — cashflows ponctuels (voyage, achat véhicule, …)

### Monte Carlo (overlay)

`P10`, `P50`, `P90: number | null` — quantiles NetWorth.

## Comment lire `chartData` depuis un onglet

Recette canonique :

```ts
import { useFinanceStore } from '../store/useFinanceStore';
import { useProjectionSelector } from '../hooks/useProjectionSelector';

// Capital à la retraite (âge cible)
const retirementCapital = useProjectionSelector(
  chart => chart.find(p => p.age >= goal.targetAge)?.NetWorth ?? 0,
  0
);

// Coût enfant annuel à un âge donné
const childAnnualCostAt5 = useProjectionSelector(
  chart => {
    const point = chart.find(p => p.year === birthYear + 5);
    return point ? point.childGross * 12 : 0;
  },
  0
);

// Pic patrimoine
const peakNW = useProjectionSelector(
  chart => chart.length ? Math.max(...chart.map(p => p.NetWorth)) : 0,
  0
);
```

## Champs Phase 3 ajoutés (2026-05-21)

Centralisation — champs dérivés / cumulés exposés :

| Champ | Type | Sémantique |
|---|---|---|
| `realNetWorth` | $ | NetWorth déflaté à $ d'aujourd'hui (= NetWorth / expenseMultiplier) |
| `liquidityRunway` | mois | Mois de dépenses couverts par Liquidites (= Liquid / monthlyExpenses) |
| `mortgageRemainingMonths` | mois | Estimation linéaire (= mortgageBalance / immoHypo) |
| `reeeContribCum` | $ | Cumul contributions REEE (ménage, somme sur tous les enfants) |
| `reeeGrantsCum` | $ | Cumul subventions SCEE + IQEE (ménage) |
| `DividendIncome` | $/mois | Dividendes NonReg estimés (= solde × yield × 30% / 12) |
| `TaxableInvIncome` | $/mois | Revenus de placement imposables (= dividendes + 50% gains capital / 12) |

## Phase 3 — Tier 3 split pensions (2026-05-21) ✅ TERMINÉ

| Champ | Type | Sémantique |
|---|---|---|
| `pensionRRQ` | $/mois | Rente RRQ/RPC mensuelle (avec inflation cumulée) |
| `pensionPSV` | $/mois | PSV + SRG mensuelle (après écrêtement OAS) |
| `pensionPrivee` | $/mois | Pensions privées DB (dbMonthly) |

`computeRetirementIncome` retourne maintenant `RetirementIncomeBreakdown`
au lieu d'un `number` simple. Compat legacy : `.total` = ancienne valeur.

`pensionRRQ + pensionPSV + pensionPrivee - oasReduction ≈ IncomeRetirement`
(clampé à 0 minimum).

## Phase 3 ≈ COMPLET

Tous les champs identifiés dans le plan original sont exposés.
Restent à brancher dans les composants UI (à faire selon priorité).
