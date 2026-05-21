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

`Liquidites`, `CELI`, `CELIAPP`, `REER`, `REEE`, `NonReg`, `Crypto`, `Immobilier` (équité), `DetteTotale` (hypo + dettes), `rapBalance`, `CELIMax`, `REERMax`.

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

### Impôts

Mensuels ($/mois) : `ImpotLatent`, `FluxImpots`, `ImpotRetraitREER`, `ImpotSalaireMois`, `ImpotGainsCap`, `ImpotDivers`, `WithheldTaxRrif`.
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

## Champs non disponibles (à ajouter au moteur si besoin)

Identifiés par audit ChildPlanning/Retirement/TaxCenter — calculs faits ad-hoc :

| Champ proposé | Consommateur actuel | Effort ajout moteur |
|---|---|---|
| `pensionRRQ`, `pensionPSV`, `pensionPrivee` (split `IncomeRetirement`) | Retirement | 30 min |
| `marginalTaxRate`, `effectiveTaxRate` (%) | TaxCenter | 30 min |
| `reeeTotalContribCum`, `reeeGrantsCum` (SCEE+IQEE) | ChildPlanning | 1 h |
| `liquidityRunway` (mois de coussin) | Retirement, Dashboard stress-test | 30 min |
| `realNetWorth` (NetWorth déflaté à $ d'aujourd'hui) | Charts "pouvoir d'achat" | 15 min |
| `mortgageRemainingMonths` | RealEstate | 30 min |

À envisager pour Sprint suivant.
