# Spec — Optimiseur de stratégies configurable (G21 C5)

> Statut : approuvé (brainstorming Marc, 2026-05-26). Successeur de C4
> (`strategyRobustness.ts`, 5 stratégies figées). Objectif : laisser l'utilisateur
> **composer son espace de recherche** parmi une bibliothèque de leviers, lancer un
> Monte Carlo sur **toutes les combinaisons**, et **valider la meilleure** avec une
> explication détaillée et le score complet de chaque gagnante.

## Problème

C4 classe 5 stratégies hardcodées (`kind:'strategy'`). Insuffisant : l'enum
`AllocationStrategy` confond plusieurs décisions (ordre de retrait + RAP). On veut
une vraie recherche multi-leviers (≈ une centaine de configurations), pilotée par
l'utilisateur, qui désigne la meilleure et explique pourquoi.

## Bibliothèque de 10 leviers

| Levier | Valeurs | n | État moteur |
|---|---|---|---|
| `withdrawalOrder` | auto / REER / CELI / fonte | 4 | ✅ enum existant |
| `delayPensions` | 65 / 70 | 2 | ✅ param existant |
| `retirementAge` | 55 / 58 / 60 / 63 / 65 | 5 | clone params |
| `skipRap` | RAP / CELI à l'achat | 2 | découpler de l'enum (C3 à 90 %) |
| `contributionOrder` | REER d'abord / CELI d'abord | 2 | découpler de l'enum |
| `retirementSpending` | −10 % / base / +10 % | 3 | clone params |
| `smithManoeuvre` | on / off | 2 | ✅ flag `useSmithManoeuvre` |
| `debtPriority` | toutes dettes / toxiques only | 2 | découpler de DEBT_FIRST |
| `emergencyFund` | 3 / 6 / 12 mois | 3 | clone params |
| `assetLocation` | optimisé / tel quel | 2 | ⚠️ à câbler (service non branché) |

Cartesian complet (tout activé) = 11 520 configs — **infaisable**. C'est pourquoi
la sélection se fait par lancement avec un garde-fou (§ Composeur).

## Architecture

### `StrategyConfig` (modèle)
Objet décrivant une combinaison : `{ withdrawalOrder, delayPensions, retirementAge,
skipRap, contributionOrder, retirementSpending, smithManoeuvre, debtPriority,
emergencyFund, assetLocation }`. Chaque champ est une valeur discrète d'un levier.

### Traduction config → moteur (approche « adaptateur fin », B)
On NE change PAS la signature de `runScenario` (préserve les 11 scénarios + tests).
Pour chaque config :
- `withdrawalOrder` → enum `AllocationStrategy` passé tel quel.
- `delayPensions` → param existant.
- `retirementAge` / `retirementSpending` / `emergencyFund` / `smithManoeuvre` →
  **clone immutable de `params`** avec le champ surchargé (zéro mutation moteur).
- `skipRap`, `contributionOrder`, `debtPriority` → **knobs optionnels** ajoutés aux
  contextes (`RealEstateCtx`, `CashflowCtx`), threadés depuis un nouveau paramètre
  optionnel de `runScenario` (`overrides?: EngineOverrides`). Défauts = comportement
  actuel ⇒ **aucune régression** quand non fournis.
- `assetLocation` → câblage dédié (commit 2).

### Découplages moteur requis (commit 1, le plus risqué — touche l'argent)
1. **skipRap** indépendant de l'enum `PRIO_CELI_NO_RAP` (généralisé à tous les ordres).
2. **contributionOrder** : nouveau champ `CashflowCtx`, le bloc « excess » branche
   dessus au lieu de l'enum de retrait.
3. **debtPriority** : nouveau champ `CashflowCtx` (`debtFirst: boolean`), découplé de
   la stratégie `DEBT_FIRST`.
Garde-fou : tests d'**équivalence** — chaque scénario existant mappé vers un
`StrategyConfig` doit produire le MÊME résultat qu'avant (non-régression).

### Exécution — pool multi-worker
- Pool de `navigator.hardwareConcurrency` workers (fallback 1 / sync en Node/tests).
- Les N configs sont **shardées** entre workers. Chaque worker lance le MC
  (itérations/config, défaut 1000) et poste sa progression.
- Agrégation main thread : barre globale (`done/N`), watchdog **par worker** réarmé à
  chaque message de progrès (pas de timeout fixe — N×1000 sims peut durer minutes).
- **Dédoublonnage** avant exécution : axe à 1 valeur retiré ; `skipRap` collapse si
  pas d'achat immobilier prévu ; `retirementAge` < âge actuel ignoré.

### Classement + explication
- Métriques MC par config : `successRate`, P10, P50 (médian), P90, `fvi`, impôt à
  vie, âge FIRE atteint, risque de séquence, pire drawdown décennie.
- Tri par **objectif** (réutilise C1 : Équilibré / Patrimoine / Impôt / FIRE),
  re-triable **instantanément** en mémoire (les sims ne sont calculées qu'une fois).
- Garde de survie : configs sous un seuil de succès marquées « fragile » et exclues
  du podium par défaut.
- **Moteur d'explication** : pour le gagnant, génère un texte clair le comparant au
  dauphin sur chaque dimension (« +180 k$ médian, −22 k$ d'impôt à vie, succès égal
  97 % ») et nomme les leviers décisifs (ceux qui diffèrent du dauphin).

## UI — `StrategyOptimizerPanel`
1. **Composeur** : cases à cocher par levier + valeurs ; affichage live « Espace = N
   configs · ~T temps estimé ». Avertissement dès N > 300 ; suggestion d'auto-baisser
   les itérations au-delà (override possible). Itérations réglables (défaut 1000).
2. **Bouton** « Trouver la meilleure stratégie » → barre de progression multi-worker.
3. **Verdict** : config gagnante en grand + ses 10 leviers en clair + explication.
4. **Détail score** : carte affichant TOUS les indicateurs de la gagnante.
5. **Tableau** triable/filtrable de toutes les configs (filtres par levier).
6. Sélecteur d'objectif → re-tri sans recalcul.

## Plan de commits
1. Moteur : `StrategyConfig` + `EngineOverrides` + découplages (skipRap /
   contributionOrder / debtPriority) + clones params + tests d'équivalence.
2. Câblage `assetLocation` dans le moteur de projection + tests.
3. Générateur d'espace (cartesian + dédup) + estimateur de coût + tests.
4. Pool multi-worker + agrégation progression + tests (fallback sync).
5. Moteur d'explication (winner vs dauphin) + agrégat « détail score » + tests.
6. UI `StrategyOptimizerPanel` (composeur + verdict + détail + tableau filtrable).
7. Docs : ADR (découplage moteur), BACKLOG, CHANGELOG.

## Tests (non-régression argent obligatoire)
- Équivalence scénarios existants ↔ `StrategyConfig` mappés.
- Chaque levier change effectivement le résultat (sensibilité).
- Génération/dédup d'espace (compte correct, collapses).
- Pool worker : sharding complet, agrégation, fallback sync, déterminisme RNG seedée.
- Explication : winner vs dauphin, leviers décisifs corrects.

## Risques
- **Commit 1** touche les calculs d'argent → équivalence stricte indispensable.
- **assetLocation** (commit 2) : service écrit mais jamais branché au moteur → câblage
  potentiellement délicat (mapping classes d'actifs → comptes pendant la simulation).
- **Perf** : l'utilisateur peut composer un espace énorme ; garde-fou live obligatoire.

## YAGNI / hors scope v1
- Pas d'optimisation continue (gradient / recuit) — recherche par grille seulement.
- Pas de sauvegarde/partage de configs custom (peut venir plus tard).
- Pas d'entonnoir 2 étapes (rejeté : Marc veut 1000 sims partout).
