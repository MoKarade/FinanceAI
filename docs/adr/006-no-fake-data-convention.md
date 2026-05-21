# ADR 006 — Convention "valeurs réelles ou rien"

**Date** : 2026-05-21
**Statut** : Accepté
**Décideurs** : Marc (user), Claude

## Contexte

FinanceAI manipule des données financières sensibles (patrimoine, salaires,
dettes, projections retraite). L'utilisateur prend de vraies décisions
basées sur les chiffres affichés. Toute valeur inventée — même comme
"placeholder pédagogique" — peut induire en erreur.

Audit de l'app fin 2026-05 a révélé plusieurs **fake data discrètes** :
- Dashboard `calculateFutureValue` : fallback formule 5 % capitalisation
  quand `lastProjection` vide → un chiffre est affiché mais ne correspond
  à rien de calculé par le vrai moteur
- HealthIndicator `fireTarget = monthlyExpenses × 12 × 25` : règle des 4 %
  hardcodée, ignore inflation projetée, dépenses retraite ≠ courantes, etc.
- Planning "Latte Factor" : `potentialSavings = yTotal × 10 × 1.4` — un
  multiplicateur magique non-sourcé
- ChildPlanning `respProjection` : formule locale 30 % subvention sur 17 ans
  avec taux `celi || 7%` — diverge du vrai moteur fiscal/REEE/SCEE/IQEE
- `generateTestMarketData` (mode test) : sinus + bruit aléatoire censés
  simuler des fluctuations de marché — purement inventés

Demande utilisateur explicite : *« Pour les actions je veux jamais de
valeurs imaginées je veux toujours les valeurs réelles ou aucune valeur. »*

## Décision

**Convention "valeurs réelles ou rien"** :
1. **En production** : toute valeur affichée doit venir
   - soit d'une saisie utilisateur,
   - soit d'un calcul déterministe basé sur ces saisies (moteur de
     projection, calculs fiscaux ARC/QC),
   - soit d'une source externe authentique (Finnhub pour prix actions,
     CSV historique réel pour portfolio passé).
2. **En mode test** : les fixtures (entrées utilisateur fictives) sont OK
   mais l'historique de marché doit être **réel** (CSV Yahoo Finance
   bundlé). Pas de simulation aléatoire de prix.
3. **Si une valeur ne peut PAS être calculée** (projection pas encore
   tournée, API externe indisponible, etc.) : afficher un empty state
   clair (`ProjectionRequired`, "Connectez Finnhub", etc.) plutôt qu'un
   placeholder.

## Conséquences

### Positives

- **Confiance** : tout chiffre affiché est défendable, traçable à sa source
- **Pas de surprises** : l'utilisateur ne voit pas un FIRE number basé sur
  une formule simpliste, puis un autre dans Future basé sur le vrai moteur
- **Tests plus solides** : les fixtures sont réalistes (vraie volatilité
  Yahoo, vrais paliers fiscaux), les tests détectent vraiment des bugs
- **Convention claire** pour les futurs contributeurs : « si tu ne peux
  pas justifier la valeur, n'invente rien »

### Négatives

- **Plus de friction UX** : si l'utilisateur n'ouvre pas Future, plusieurs
  KPI sont vides. Mitigation : message clair + bouton "Ouvrir Future"
- **Travail supplémentaire** : il faut souvent ajouter un champ au moteur
  plutôt que de calculer rapidement quelque chose dans l'UI
- **Dépendance** au moteur central (cf ADR 005)

### Exceptions documentées

- **`getAnnualChildCost`** (utilisé par ChildPlanning costTimeline) : fonction
  PURE qui calcule le coût brut par âge à partir des choix UI. N'inclut PAS
  les éléments contextuels (RQAP, clawback allocations, commuting savings)
  qui sont appliqués par le moteur de projection. Convention :
  - Pour le coût BRUT par âge (affichage timeline) → `getAnnualChildCost`
  - Pour le coût NET ménage (impact patrimoine) → `chartData.childCost`
  - Voir LIMITATIONS dans `services/projection/childCosts.ts`
- **`USD_CAD_RATE = 1.37`** dans testFixtures.ts : taux de change fixe
  pour convertir AAPL (USD natif Yahoo) en CAD pour cohérence portfolio.
  Documenté comme approximation (moyenne 2024-2026). Convention :
  - En PROD : fetch USDCAD réel via Finnhub (TODO Phase 4)
  - En TEST : taux fixe acceptable car couvre toute la période bundlée

## Statut d'implémentation

- ✅ Fallback 5 % Dashboard supprimé → `<ProjectionRequired />`
- ✅ HealthIndicator FIRE strict (lit `chartData[0].FireTarget`)
- ✅ Latte Factor Planning supprimé → `<ProjectionRequired />`
- ✅ ChildPlanning respProjection branché sur `chartData.REEE` +
  `reeeContribCum` / `reeeGrantsCum`
- ✅ generateTestMarketData : sinus + bruit retirés, CSV Yahoo réel bundlé
- ✅ ProjectionRequired empty state partagé (block + inline variants)

## Alternatives considérées

### A. "Best-effort" avec warning visuel

Calculer quelque chose côté UI avec une formule simple, mais l'afficher
en couleur différente / avec un badge "Approximation".

❌ **Rejetée** : trompeur — l'utilisateur risque d'oublier le badge et
prendre la valeur au sérieux. Aussi : difficile à tester, "approximation"
mal définie.

### B. Convention no-fake (ADR retenue)

✅ **Acceptée** : règle simple, pas d'ambiguïté, force la rigueur côté
moteur.

## Références

- [docs/CENTRALIZED_CALC_PROGRESS.md](../CENTRALIZED_CALC_PROGRESS.md)
- `components/ui/ProjectionRequired.tsx`
- `services/data/test-portfolio-history.csv` (CSV Yahoo bundlé)
- `scripts/build-test-portfolio-csv.cjs` (script reproductible)
- ADR 005 (Future source unique) — corrolaire
