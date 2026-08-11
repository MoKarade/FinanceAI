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

## Ventilation au JOUR (affichage seulement)

> `services/projection/dailyLedger.ts` — [FUTUR-DAILY-FULL], demande Marc 2026-08-11.

Le moteur reste **mensuel** : c'est la source de vérité, `projection.ts` est intouché (le passer au
jour = ~11 000 itérations × chaque tirage Monte Carlo, pour rejouer une fiscalité qui n'a que des
événements ANNUELS). Pour la vue au jour du graphe Futur, `buildDailyLedger` **ventile** une fenêtre
de mois consécutifs en points quotidiens portant les mêmes clés — l'infobulle et les aires empilées
les consomment sans code spécifique.

Chaque champ est traité selon sa classe (`FIELD_KIND`, exhaustive et **gardée par un test contre le
moteur réel** — un champ ajouté à `monthlyOutput.ts` sans classe fait échouer la suite) :

| Classe | Traitement | Exemples |
|---|---|---|
| `stock` | Interpolé de la fin du mois précédent à la fin de ce mois. **Le dernier jour vaut EXACTEMENT la valeur du moteur.** | `Liquidites`, `CELI`, `REER`, `Immobilier`, `NetWorth`, `ImpotLatent`, `DettesNonImmo` |
| `flow` | Réparti sur les jours selon sa cadence. **La somme des jours vaut EXACTEMENT le total du moteur.** | `Expenses`, `IncomeMarc`, `MarketGrowth*`, `NetTransfer*`, `FluxImpots` |
| `monthly` | Recopié tel quel — un taux ne se divise pas. | `marginalTaxRate`, `MarketGrowthPct*`, `age` |
| `recomputed` | Reconstruit au jour. | `dateLabel`, `diff*`, `Savings`, `lifeEvents` (posés au 1er) |

Cadences de répartition (`FLOW_CADENCE`, défaut `uniform`) :

| Cadence | Champs | Pourquoi |
|---|---|---|
| `weekly` | `IncomeMarc`, `IncomeAnna`, `ImpotSalaireMois` | Paie hebdomadaire du jeudi (réponse Marc A13) ; l'impôt retenu suit la paie |
| `income` | `Income`, `NetSalary` | Mélange : la part SALAIRE suit les jours de paie, le reste (rentes, décaissements) n'a pas de date |
| `recurring` | `Expenses` | Les charges détectées ont un `dayOfMonth` réel ; le reste (épicerie, essence) n'en a pas → mélange 50/50 forme-récurrente / uniforme |
| `monthEnd` | `FluxImpots` | Le solde d'impôt se règle à l'échéance — le 30 avril est le dernier jour de son mois |
| `uniform` | tout le reste | **Aucune date connue, et on ne l'invente pas** (le rendement du marché en tête) |

⚠️ Les mouvements datés n'appartiennent pas tous aux mêmes champs (`datedDeltasForField`) : un
**paiement de dette** sort de `Liquidites` mais est **neutre sur `NetWorth`** (la dette baisse
d'autant). Les confondre creusait un faux trou dans le patrimoine net le jour de paie.

⚠️ Un champ que le mois n'émet pas reste **absent** du jour — jamais un `0` crédible.

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
Note `[FISC-WHT-92PCT]` : en phase ACTIVE sans déductions, `AccruedTaxRevenu` vaut structurellement **0** (retenue = 100 % de l'impôt) — un 0 ici signifie « rien à régler en avril », pas « aucun impôt payé » (l'impôt est dans le net saisi).

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
