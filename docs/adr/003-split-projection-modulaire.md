# ADR-003 : Split `services/projection.ts` en 31 sous-modules

**Date** : 2026-05
**Statut** : Acceptée

## Contexte

`services/projection.ts` était un god-file de **3500+ lignes** contenant :
- L'orchestrateur principal (`calculateFutureProjection`)
- Le cœur mensuel (`runScenario`) — 9 phases sur ~1600 lignes
- Tous les helpers de calcul (croissance, cash-flow, impôts, retraites,
  événements stochastiques, vieillissement immo, REEE enfants, etc.)
- Le sub-runner Monte Carlo
- La metadata des scénarios

**Problèmes** :
- Impossible à charger entièrement dans une fenêtre de contexte LLM (auto-complétion fragile)
- Tests difficiles : impossible d'exécuter une phase mensuelle isolée
- Diffs énormes en review (1 changement = 200 lignes scrollées avant le code touché)
- Imports circulaires latents quand on tente d'extraire un helper

**Cible** : pure functions extraites, testables unitairement, sans casser
l'invariant **déterministe** du moteur (re-run identique avec même seed).

## Décision

Split en **31 sous-modules** dans `services/projection/`, chacun avec un
rôle unique. `services/projection.ts` devient **l'orchestrateur** (1111
lignes) qui consomme ces helpers.

**Catégories de modules** :

| Catégorie | Modules |
|---|---|
| Setup | `setupSimulation.ts`, `scenarios.ts`, `helpers.ts`, `types.ts` |
| Phase 1 (croissance) | `growthApplication.ts`, `marketShocks.ts`, `historicalReturns.ts`, `glidepathRates.ts` |
| Phase 2 (income/retraite) | `activeIncome.ts`, `retirementIncome.ts`, `meltdownReer.ts`, `drawdownOptimizer.ts` |
| Phase 3 (immo) | `realEstateMonth.ts`, `vehicleCycle.ts` |
| Phase 4 (stochastique) | `stochasticEvents.ts`, `monteCarlo.ts` |
| Phase 5 (surcoûts) | `w5Effects.ts` |
| Phase 6 (cash-flow) | `cashflowAllocation.ts`, `portfolioOps.ts`, `assetLocation.ts` |
| Phase 7 (impôts) | `taxJanuary.ts`, `taxApril.ts`, `taxDecember.ts`, `latentTax.ts` |
| Phase 8 (sortie) | `monthlyOutput.ts`, `monthlyEvents.ts`, `monthlyCalcs.ts` |
| Outils périphériques | `childrenReee.ts`, `estateCalculation.ts`, `goalSeek.ts`, `runAsync.ts` |

**Règles** :
- Aucun sous-module n'**importe** `services/projection.ts` (sinon import
  circulaire). Les types partagés vivent dans `services/projection/types.ts`.
- Chaque sous-module exporte des **pure functions** (pas de side effects,
  pas de I/O, pas de fetch).
- Les tests `tests/services/projection.helpers.test.ts` couvrent chaque
  helper isolément (28 tests).

## Conséquences

**Positives** :
- Diffs de review localisés au module concerné (~50 lignes au lieu de 200)
- Tests unitaires possibles sur chaque helper (impossible avant)
- Les agents LLM peuvent lire les modules un par un sans saturation du contexte
- Pas de régression : 47 tests projection scénarios verts pendant tout le split

**Négatives / ouvertes** :
- 31 fichiers ouverts dans un IDE pour un debug profond. Mitigation : la
  structure des phases est documentée dans [PROJECTION.md](../PROJECTION.md) §2.
- L'orchestrateur `projection.ts` reste à 1111 lignes — la boucle mensuelle
  est intrinsèquement complexe. Un split plus poussé serait artificiel.
- Le module `monteCarlo.ts` réutilise `runScenario` exporté de `projection.ts`
  via une **fonction passée en paramètre** (pour éviter l'import circulaire).

**Référence** : Phase 3 de l'audit. Voir aussi [PROJECTION.md](../PROJECTION.md).
