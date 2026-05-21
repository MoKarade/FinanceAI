# Plan refactor : Future = source unique de vérité

> **Demande** : Tous les onglets doivent consommer les résultats produits par
> Future. Si on corrige un bug de calcul → un seul endroit. Plus de
> divergence entre onglets.

## 1. État actuel (audit rapide)

### Calculs **dupliqués** identifiés

| Calcul | Sources | Risque divergence |
|--------|---------|-------------------|
| Coûts enfants par âge | ~~`ChildPlanning.tsx` + `childrenReee.ts`~~ → unifié 2026-05-21 dans `childCosts.ts` | ✅ corrigé |
| Cashflow mensuel retraite | `Retirement.tsx` (calc local CurrentCapitalCard) + `FutureProjection.tsx` (worker) + `projection.ts` runScenario | 🔴 élevé |
| Net worth historique | `Dashboard.tsx` (boucle marketData) + `FutureProjection.tsx` (worker) + `Investments.tsx` (fallback live) | 🔴 élevé |
| Revenus passifs (dividendes) | `Dashboard.tsx` (passive income) + `Investments.tsx` + `projection.ts` (dividendes annuels) | 🟡 moyen |
| Score portefeuille | `Investments.tsx` only | 🟢 OK |
| Impôt annuel | `TaxCenter.tsx` (`computeUserTax`) + `projection.ts` (`calculateFiscalReport`) | 🟡 moyen |
| Mensualité hypo | `RealEstate.tsx` + `projection.ts` (amortissement) | 🟡 moyen |
| Extinction dettes | `DebtManager.tsx` (avalanche/snowball local) + `projection.ts` | 🟡 moyen |
| FIRE number | `FutureProjection.tsx` + `Retirement.tsx` (GoalSeekerCard) | 🟡 moyen |

### Pourquoi ça existe

Historiquement, chaque onglet était dev indépendamment avec ses propres
calculs synchrones rapides. La projection Future arrive après et reproduit
les mêmes formules mais étalées sur 60-80 ans dans un Worker.

Résultat : 2 implémentations de la même règle métier qui finissent par
diverger silencieusement (cas observé pour les enfants — UI privée = 6k$/an,
backend = 5k$/an).

## 2. Vision cible

```
                     ┌──────────────────────────────┐
                     │  Store Zustand (entrées)     │
                     │  - assets, budgetItems, etc. │
                     └────────────┬─────────────────┘
                                  │
                                  ▼
                     ┌──────────────────────────────┐
                     │  services/projection (Worker)│
                     │  - calculateFutureProjection │
                     │  - runScenario               │
                     │  - retournes chartData[80*12]│
                     └────────────┬─────────────────┘
                                  │
                                  ▼
                     ┌──────────────────────────────┐
                     │  Store.lastProjection        │  ← single source
                     │  { chartData, allResults, …} │
                     └────┬──────┬──────┬───────┬───┘
                          │      │      │       │
            ┌─────────────┘  ┌───┘  ┌───┘   ┌───┘
            ▼                ▼      ▼       ▼
       Dashboard       Retraite   Enfant   Investments
       (lit point[0])  (filter ≥targetAge) (filter age==18 etc.)
```

**Principe** : Le Worker calcule tout. Les onglets ne font que **filtrer /
agréger** des points déjà calculés par `lastProjection.chartData`.

## 3. Plan en 5 étapes (incrémental, low-risk)

### Étape 1 — Inventaire des outputs Future

**But** : Documenter EXACTEMENT ce que `lastProjection` contient déjà et ce
qu'il manque.

**Fichiers à lire** :
- `services/projection/monthlyOutput.ts` (champs sérialisés par point mensuel)
- `services/projection.ts` retour de `calculateFutureProjection`

**Output** : Un fichier `docs/PROJECTION_OUTPUT_SCHEMA.md` listant tous les
champs disponibles (Liquidites, CELI, REER, NetWorth, ImmoEquity, DetteTotale,
IncomeRetirement, ChildGrossCost, RetraitREER, etc.) et leur sémantique.

**Effort** : 1-2 h.

### Étape 2 — Hook `useProjectionSelector` partagé

**But** : Créer un hook qui sélectionne efficacement un slice de
`lastProjection.chartData` selon un prédicat ou un index, avec mémoisation.

```ts
// hooks/useProjectionSelector.ts
export function useProjectionSelector<T>(
  selector: (chart: ProjectionPoint[]) => T,
  fallback: T,
): T {
  const last = useFinanceStore(s => s.lastProjection);
  return useMemo(() => {
    if (!last?.chartData?.length) return fallback;
    return selector(last.chartData);
  }, [last]);
}

// Usage
const retirementCapital = useProjectionSelector(
  chart => chart.find(p => p.age >= 60)?.NetWorth ?? 0,
  0,
);
```

**Effort** : 2 h (hook + tests).

### Étape 3 — Migrer onglet par onglet (ordre de risque croissant)

Migrer dans cet ordre, **un onglet à la fois**, avec validation manuelle :

1. **Investments** (read-only, faible couplage) — afficher dividendes annuels
   depuis `projection.dividendesAnnuels` au lieu de recalculer
2. **Retraite** — remplacer le calcul local CurrentCapitalCard par
   `useProjectionSelector(chart => chart.find(p => p.age >= goal.targetAge))`
3. **Enfant** — ChildPlanning lit `lastProjection.chartData.filter(p => p.year)`
   pour afficher la courbe REEE projetée (déjà partiellement fait, à finir)
4. **Dashboard** — la valeur "Net Worth" cible (futur 5 ans) lue depuis projection
5. **TaxCenter** — l'estimation annuelle vient de `projection.chartData[year]`
   somme des `FluxImpots` mensuels

**Effort** : ~3 h par onglet = 15 h total.

### Étape 4 — Supprimer les calculs morts

Une fois les onglets migrés, **supprimer** les fonctions de calcul local
qui ne sont plus utilisées :

- `ChildPlanning.tsx::costTimeline` (peut être remplacé par projection lookup)
- `Retirement.tsx::retirementPoint` calc inline (utilise hook partagé)
- `Dashboard.tsx::performance` recalc (déjà OK, lit unifiedHistory)

**Effort** : 2 h.

### Étape 5 — Tests de régression

Pour chaque onglet migré :
- Comparer avant/après les KPI principaux (FIRE, Net Worth, Capital
  retraite) sur les **mêmes fixtures test**
- Ajouter dans `MANUAL_TEST_CHECKLIST.md` une section
  "Régression centralisation" qui vérifie convergence des chiffres entre
  Future et les autres onglets

**Effort** : 2 h.

## 4. Trade-offs

### Avantages

- ✅ **Une seule source** de vérité → bug corrigé une fois
- ✅ Réduction du code (~30 % estimé sur les fichiers de composants)
- ✅ Performance : un seul Worker au lieu de plusieurs calculs sync sur le
  main thread
- ✅ Convergence garantie entre onglets

### Inconvénients

- ⚠️ **Refactor profond** : ~24 h de travail estimées
- ⚠️ Risque de régression visuelle / numérique → besoin de validation
  manuelle systématique
- ⚠️ Les onglets deviennent **dépendants** du Worker — si la projection
  échoue, plusieurs onglets affichent "—"
- ⚠️ Latence : si l'utilisateur change un slider et le Worker prend 300ms,
  les autres onglets aussi attendent (ack via debounce + état "calcul…")

## 5. Quand le faire

**Recommandation** : faire l'**Étape 1 (inventaire)** maintenant pour préparer
la suite. Les **Étapes 2-5** demandent un sprint dédié de 3-4 sessions de
~4 h chacune. À démarrer dès que les corrections de bugs urgents sont stables
sur prod (probablement après ~1 semaine d'observation post-fixes session
actuelle).

## 6. Alternative pragmatique : "Future = source pour les calculs long-terme uniquement"

Si le refactor complet semble trop lourd, version réduite :

- Garder les calculs **temps présent** locaux (current Net Worth, taxes
  annuelles courantes, etc.) — ils sont triviaux et rapides
- Centraliser uniquement les calculs **projetés / dans le futur** : capital
  retraite, héritage, FIRE number, coût total enfant lifetime, extinction
  dette future

C'est en pratique ce que le store fait déjà partiellement avec
`lastProjection`. Compléter cette logique demande ~6-8 h au lieu de 24 h.

## 7. Recommandation finale

**Court terme (2 semaines)** : Étape 1 (inventaire) + version pragmatique
§6 (calculs projetés centralisés).

**Moyen terme (1 mois)** : Si la version pragmatique se révèle insuffisante
(divergences résiduelles observées), enchaîner Étapes 2-5 complètes.
