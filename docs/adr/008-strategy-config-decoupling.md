# ADR-008 : Optimiseur de stratégies — leviers découplés + adaptateur moteur fin

**Date** : 2026-05-26
**Statut** : Acceptée (implémentée)

## Contexte

L'onglet Futur comparait jusqu'ici 5 stratégies figées (enum `AllocationStrategy`).
Marc voulait beaucoup plus de flexibilité : choisir lui-même les leviers dans l'app,
tester ~100-240 combinaisons, et valider la meilleure selon un objectif, avec une
explication détaillée du pourquoi.

Deux problèmes structurels :

1. L'enum `AllocationStrategy` **confondait** des décisions orthogonales (ordre de
   retrait + saut du RAP à l'achat). Impossible de combiner librement « REER d'abord »
   avec « CELI sans RAP » sans multiplier les valeurs d'enum.
2. Le cœur `runScenario` est une fonction lourde et privée. Lui ajouter des branches
   par levier ou changer sa signature publique aurait été risqué (669 tests existants).

## Décision

**1. Modéliser une stratégie comme une combinaison de leviers orthogonaux**
(`StrategyConfig`, 10 leviers dans `LEVER_LIBRARY`). L'optimiseur génère le produit
cartésien des valeurs cochées (`generateStrategySpace`) → l'espace de recherche.

**2. Approche « adaptateur fin » (Option B) plutôt que réécriture du moteur :**
- Les leviers qui correspondent déjà à des champs de `params` sont réalisés par
  **clone immutable de params** (`configToEngine`) : âge de retraite, dépenses,
  coussin, Smith Manoeuvre, et asset location (bonus de rendement NonReg).
- Les leviers sans champ existant passent par des **`EngineOverrides` optionnels**
  threadés à `runScenario` (saut du RAP, ordre de cotisation, priorité dettes).
  **Tous absents ⇒ comportement historique strictement inchangé.**

**3. Exécution multi-worker** : `runStrategySearchAsync` shard les configs sur
`navigator.hardwareConcurrency` workers (pool éphémère), chacun lance un Monte Carlo
par config. Le classement par objectif (`rankConfigResults`) est re-calculé en mémoire,
sans relance moteur.

## Conséquences

**Bonnes :**
- Non-régression prouvée : les 669 tests existants restent verts (overrides par défaut
  = comportement actuel). Le découplage est additif.
- Ajouter un levier = une entrée dans `LEVER_LIBRARY` + (si besoin) un champ de clone
  ou un override. Pas de touche au cœur de la simulation.
- Le re-tri par objectif est instantané (aucun recalcul) car les métriques MC sont
  conservées.

**Mauvaises / compromis :**
- `runScenario` a maintenant 7 paramètres (le 7e = overrides). Acceptable car privé.
- `assetLocation` est une **approximation** (+0,4pp sur le rendement NonReg) plutôt
  qu'un suivi par classe d'actif dans la boucle mensuelle — choix YAGNI assumé.
  L'effet se module sur le solde NonReg réel (pas de donnée plaquée).

**Ouvertes :**
- L'explosion combinatoire (10 leviers tous cochés = 11 520 configs) est bornée
  côté UI par un compte + temps estimé en direct et un avertissement > 300 configs.
- Pas de sauvegarde/partage de configurations (YAGNI).
