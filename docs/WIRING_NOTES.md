# Notes : Wiring inter-onglets et UI à venir

> **Statut** : Backend wiring 2026-05 en cours.
> **Interface** : à retravailler APRÈS que l'app soit fonctionnelle (demande utilisateur).

---

## ✅ Wiring backend déjà branché (vers FutureProjection)

Le moteur `calculateFutureProjection()` consomme déjà :

| Source (onglet)      | Données injectées dans la projection                                                  |
|---|---|
| **Budget**           | `baseMonthlyExpenses`, `budgetItems` (via calcul parent), `config.users` (salaires)  |
| **Investments**      | `liveCSVBalances` (CELI/REER/NonReg/Crypto), `assets`, `calculatedStartingCash`      |
| **Real Estate**      | `realEstateGoals[]` (achats, hypos, locatifs)                                         |
| **Debt**             | `debts[]` (avalanche, taux variable, déductibles)                                     |
| **Children**         | `childGoals[]` (frais garderie/école/CEGEP, REEE, allocations gouv)                  |
| **Travel**           | `travelGoals[]` (dépenses ponctuelles)                                                |
| **Life Events**      | `lifeEvents[]` (mariage, krach, vente immo, héritage)                                |
| **Retirement**       | `retirementGoal` (targetAge, monthlyIncome, govPension, dbPension)                   |
| **Transactions**     | `transactions[]` → `calculatedStartingCash`                                          |
| **Settings**         | `apiKeys.gemini` (pour insights AI), `config.users` (citoyenneté, province, santé…) |
| **W5.x extensions**  | InsurancePolicy, VehicleReplacement, MajorRenovation, CharitableGoal, RentalProperty, PrivateBusiness |
| **🆕 Savings Goals** | `savingsGoals[]` (deadlines déclenchent dépenses sur le liquide)                     |
| **🆕 Financial Goals**| `financialGoals[]` (deadlines retirent du compte ciblé CELI/REER/NonReg/Crypto)     |

## 🔌 Wiring backend manquant ou perfectible

| Donnée                                       | Statut actuel                                            | À faire                                                                                                  |
|---|---|---|
| **Investment account transactions**          | `investmentTransactions[]` accessible mais pas utilisé   | Permettre au moteur d'extraire des contributions historiques par année pour calibrer l'espace CELI/REER  |
| **Categorization rules**                     | Hors-périmètre projection                                 | Aucune action (logique purement Transactions)                                                            |
| **AI conversation**                          | Hors-périmètre projection                                 | Aucune action                                                                                            |
| **FX rates dynamiques**                      | Statique dans projection (taux fixes returnRates)         | Si on veut simuler l'impact d'un crash du CAD, ajouter `fxRates` au SimulationParams                     |
| **Real Estate : `isActive` flag**            | Filtré côté UI uniquement                                 | Vérifier que la projection respecte le flag (ne pas projeter une propriété désactivée)                   |
| **Investment accounts (IBKR/WS/QT)**         | Soldes consommés via `liveCSVBalances`                    | Pas besoin de plus côté moteur                                                                           |

## 🔄 Flux de retour : projection → autres onglets

Actuellement, les onglets non-projection ne **consomment pas** les outputs de la
projection. C'est l'angle UI à travailler ensuite. Le moteur expose déjà :

- `chartData[]` : snapshot mensuel complet (NW, CELI, REER, etc.)
- `fireNumber` : objectif FIRE calculé (règle des 4%)
- `successRate`, `fvi`, `expertMetrics` : métriques MC
- `aiNote`, `pros`, `cons` : annotations stratégie

### Cibles d'intégration UI (à faire APRÈS)

1. **Dashboard**
   - Card "Projection 10 ans" : NW projeté à 1/5/10/20/30 ans
   - Mini-chart de la courbe de vie en lien avec la projection courante

2. **Investments**
   - Section "Valeur projetée du portefeuille au $targetAge$ ans"
   - Couplage avec `optimizeAssetLocation` pour suggérer re-placements

3. **Budget**
   - Indicateur "Impact budget → Patrimoine fin vie"
   - Sensitivity : "+200$/mois → +X$ à la retraite"

4. **Children**
   - Affichage de la projection REEE (`MarketGrowthREEE` cumulé)
   - Décaissement automatique à 18-22 ans visible

5. **Real Estate**
   - "Équité projetée à la fin de l'hypothèque" depuis chartData
   - Comparaison Buy vs Rent dérivée du moteur (au lieu du calcul local)

6. **Retirement**
   - Déjà partiellement branché (GoalSeeker, AssetLocation)
   - Ajouter "Quel scénario t'amène à ta cible ?" en croisant les 5 outputs

7. **Travel**
   - Marquer chaque voyage planifié sur la chartData
   - Avertir si voyage déclenche un shortfall (`shortfallMonths` augmente après)

8. **Life Events**
   - Idem : marqueurs sur le graphique principal (déjà fait via `lifeChartEvents`)

9. **Tax Center**
   - Total impôts payés sur la vie de la projection (`totalTaxesPaid`)
   - Bombe fiscale FERR à 71 ans : signal visuel

## 🛠️ Approche technique recommandée pour le wiring UI

**Option A** : Zustand store global `projectionResults`
- Stocker le dernier résultat de `calculateFutureProjection` dans le store
- Tous les onglets peuvent lire `useFinanceStore(s => s.lastProjection)`
- Trigger : recalcul à chaque changement de `params` (déjà debouncé dans FutureProjection)

**Option B** : Hook partagé `useProjectionPreview(deps)`
- Hook léger qui fait un calcul rapide (déterministe, pas MC) à la demande
- Permet à chaque onglet d'avoir son propre snapshot sans dépendre du tab FUTURE

**Recommandation** : **Option A** d'abord (1 store, 1 calcul, multiple consumers).
Moins de duplication, cohérence garantie entre onglets.

## 📋 Prochaines étapes proposées (ordre)

1. ✅ Wire `savingsGoals` + `financialGoals` au moteur (fait)
2. ✅ Optimiser stratégies de décaissement (PBMA + bracket 1 + OAS guard + capLossBank)
3. ⏳ Stocker `lastProjection` dans Zustand store (Option A)
4. ⏳ Vérifier `isActive` sur RealEstateGoal dans la projection
5. ⏳ Tests unitaires pour les deux nouveaux wirings (`applySavingsGoalDeadlines`, `applyFinancialGoalDeadlines`)
6. 🎨 **UI rework** (après tout ce qui précède)
