# Feuille de route — chantiers validés par Marc (2026-06-19)

> Plans cadrés par 4 agents d'exploration (`fichier:ligne` réels) **et VALIDÉS par Marc**. Claude exécute
> en AUTONOMIE, PR par PR, dans l'ordre ci-dessous. Chaque chantier money-critical → panel
> `financial-integrity`/`projection-validator`/`silent-failure-hunter` + test discriminant (`git stash`).
> Plan-first respecté (ce doc EST le plan validé). Source : `BACKLOG.md` § « Décisions & vision Marc 2026-06-19 ».

## Décisions de Marc (verrouillées)
- **Q1 multi-courbes** : OUI (comparer plusieurs scénarios — chantier en plus).
- **FA-6 dons** : crédit fédéral **14 %** sur les 1ers 200 $ (millésime 2026) ; don de titres = **inclusion 0 % sur tout le don** (approximation, légèrement favorable, documentée) ; taux QC **24 % fixe** (pas de 25,75 % conditionnel).
- **PH4-E couple** : attribution des dépenses par conjoint **auto par défaut** (selon le type de poste Perso 1/2), éditable.
- **Ordre** : (1) gains rapides UI → (2) PH4 → (3) money-critical.

---

## ★ DÉCOUVERTE — la persistance de courbe est DÉJÀ construite (~95 %)
`store/useFinanceStore.ts` (`lockedProjection`, `isProjectionLocked` persisté), `services/lockedProjectionStore.ts`
(IndexedDB chiffré), `utils/lockedCurveOverlay.ts`, `FutureProjection.tsx` (boutons verrouiller, courbe dorée),
`ProjectionTooltip.tsx` (écart live). **On ne reconstruit PAS.** Reste : vérifier le boot-restore + le multi-courbes.

---

## ORDRE 1 — Gains rapides UI (faible risque, pas de moteur)

### R1 · NW-successoral — libellés + infobulle (pure UI) — ✅ FAIT (2026-06-19)
- `FutureProjection.tsx:585` affiche `estateNetWorth` sous le label trompeur « Patrimoine projeté » → renommer
  **« Patrimoine successoral, avec rentes »** + infobulle (impôt de liquidation + VAN rentes RRQ/PSV).
- Idem `Budget.tsx:661` (ajouter « , avec rentes »), `StressTestPanel.tsx:96`, `retirement/GoalSeekerCard.tsx:100`
  (title HTML), prompt `AiAssistant.tsx:102` (cohérence IA).
- DoD : libellés distincts + tooltip 1 phrase ; typecheck clean ; a11y-auditor sur le tooltip. Zéro moteur.

### R2 · Futur P2 — annotation « FIRE atteint » — ✅ FAIT (2026-06-20)
- Pastille au 1ᵉʳ mois où `NetWorth ≥ FireTarget` (`FutureProjection.tsx` useMemo `lifeMarkers` ~331-351 + rendu).
  `ReferenceDot` orange + `ClickableEventIcon`. Filtrer `monthIndex > 0` (pas si déjà FIRE au départ).
- DoD : pastille au bon mois sur persona FIRE-atteignable ; aucune si hors horizon. Test unitaire de détection.
- ⚠️ **PIVOT (revue adversariale ultracode)** : le MOTEUR émet DÉJÀ un lifeEvent `'Objectif FIRE Atteint 🔥'`
  (`projection.ts:1438`, seuil inflaté/indexé) → la pastille FIRE existait déjà. Recalculer côté UI aurait été un
  DOUBLON + une violation de « Future = source unique ». **Livré** : on met en valeur la pastille MOTEUR existante —
  orange `#f97316` + icône 🔥 (via `ClickableEventIcon` `payload.color` + `EVENT_KEYWORD_ICONS`) + `pinned` (jamais
  écrêtée par `thinEvents`). 2 fichiers, zéro moteur, zéro recompute. « Test unitaire de détection » N/A → la détection
  est au moteur (déjà testée) ; le helper UI `fireReached.ts` créé puis SUPPRIMÉ après la découverte.

### R3 · Futur P3 — infobulle figée/scrollable
- Aujourd'hui le tooltip suit la souris (Recharts recalcule la position à chaque move). Remplacer `<Tooltip content=…>`
  par un **portail React** (`createPortal`) positionné en `position:fixed` ; clic = fige (réutilise `handleChartContainerClick`
  ~475), Échap/clic ailleurs = libère. `ExpertTooltip` doit accepter `data` directement (le découpler du wrapper Recharts).
- Fichiers : `FutureProjection.tsx`, `projection/ProjectionTooltip.tsx`, nouveau `hooks/useChartTooltipPosition.ts`.
- Risque MOYEN (portail hors contexte Recharts) → extraire `ExpertTooltip` testable d'abord. e2e : mousemove après clic ne bouge plus.

### R4 · Futur P1+P4 — boot-restore + densité proportionnelle
- P1 (XS) : vérifier que `App.tsx` appelle `loadLockedProjection()` + `setLockedProjection()` au mount (sinon courbe
  perdue au reload malgré le flag). Patch si gap.
- P4 (XS) : cap de densité proportionnel à la fenêtre visible (`~(visMax−visMin)/6`) au lieu du cap fixe 40/24 (`FutureProjection.tsx` ~527-533).

### R5 · PH3-c-bis — supprimer `User.industry` (trivial)
- `types.ts` : retirer `export type Industry` (116-130) + `industry?` dans `User` (156). NE PAS toucher les
  `industry?` de `marketData`/`finnhub` (secteur boursier, sans rapport).
- `components/settings/UserConfigFields.tsx:162-163` : retirer le `<select>` + l'import.
- **Pas de migration** (politique PH3-c : données résiduelles persistées ignorées). DoD : `grep industry` (hors marketData) = 0.

### R6 · Personas de test — tous fonctionnels sur toutes les pages
- Cause des gates : `isActive` manquant sur objectifs enfants + `setupOptOut` non setté.
- (1) `services/testGoals.ts:20` + `testPersonas/autonomeMonoparentale.ts:68` → `isActive: true`.
- (2) **Option A (choix Marc « tous critères cochés »)** : pour lea-fauchee/couple-dettes/karim/pre-retraite → setter
  `setupOptOut` (debts/realEstate/children/lifeProjects selon le cas) + micro-actif CELI symbolique pour ouvrir Futur/Investissements.
- DoD : chaque persona, une fois activé, n'affiche AUCUNE `PageSetupGate`. Pas de migration. (Réf : `components/setup/requirements.ts`.)

---

## ORDRE 2 — PH4 (Budget & co), 6 phases indépendantes
> Réf détail : `BACKLOG.md`. Règles : `formatCAD` partout, `<PrivateAmount>` sur les montants sensibles, no-fake-data.

- **PH4-A** Parité Budget↔Transactions : extraire `utils/budget.ts matchTransactionToCategory()` (règle UNIQUE) ; signaler
  catégories de transactions orphelines + postes sans transaction. `Budget.tsx`, `budget/BudgetGroupTable.tsx`. *Pas de migration.*
- **PH4-B** Envie/Besoin : donut 50/30/20 **théorique vs réel** (`Budget.tsx`, `BudgetGroupTable.tsx`). Dépend de A.
- **PH4-C** Objectif d'épargne réel vs cible : `SavingsGoal.linkedBudgetCategoryId?` (`types.ts:532`) ; remonter `actualsMap`
  au parent `BudgetWorkspace.tsx` et le passer à `Planning.tsx`. Distinguer « accumulé (solde) » vs « versé ce mois ». *Migration additive.* Dépend de B.
- **PH4-D** Santé financière : ramener `dashboard/HealthIndicator.tsx` dans Budget + ratios budgétaires (parité, couverture abos) ;
  migrer les poids `healthIndicator:weights` dans le store. Dépend de A.
- **PH4-E** Couple — sorties par conjoint : `Transaction.ownerId?: 0|1` (`types.ts:16`) ; colonne « Conjoint » en mode couple ;
  **attribution auto par défaut selon `BudgetCategory.type`** (Perso 1→user0…), éditable ; `Budget.tsx coupleAnalysis` ~263 calcule
  le réel par conjoint. *Migration additive.*
- **PH4-F** Abonnements persistés + dates : `SubscriptionItem[]` dans `AppState` ; **migration v7→v8 additive** (`subscriptions: []`) ;
  confirmer un abo détecté (`Planning.tsx`) → persisté ; onglet « Charges fixes & Abos ». ⚠️ écrire le **test de migration d'abord (RED)**.
- Ordre : A→B→C ; F en parallèle ; D après A ; E en dernier.

---

## ORDRE 3 — Money-critical (panel + discriminant obligatoires)

### M1 · FA-6 — dons charitables (modéliser proprement)
- **Étape 0 (bloquante)** : transcrire le barème DATÉ+SOURCÉ dans `FISCAL_REFERENCE.md` (§ Dons) AVANT tout code.
  Décisions Marc : fed **14 %** ≤ 200 $ puis **29 %** au-delà ; abattement QC **16,5 %** sur le fédéral ; QC **20 %** ≤ 200 $ puis **24 %** ;
  titres en nature = **inclusion gain 0 % sur tout le don** (approximation documentée).
- Constantes dans `utils/tax.ts` (`CHARITABLE_*`) + fonction `computeCharitableCredit(annual)` testable.
- Réécrire `services/projection/w5Effects.ts:97-103` (remplacer `*0.33` et `addTaxGains(-annual*0.15)`).
- Tests discriminants (`git stash` → l'ancienne formule échoue) ; `projection.moneyConservation` vert ; panel financial-integrity + projection-validator.

### M2 · ITEM-2C — gates de timing par conjoint
- Plan dans `BACKLOG.md` : Phase 0 caractérisation → Phase 1 `computeRetirementIncome` per-conjoint (pool REER + âge par personne, défaut additif
  = égalité ménage si âges égaux) → Phase 2 brancher FERR 72/REER 71/PSV 75+ + re-base golden SCIEMMENT. Lourd, plan-first par phase.

### M3 · Tables fiscales — montant « personne vivant seule » QC (TP-1.G)
- Phase 0 : transcrire la grille datée+sourcée dans `FISCAL_REFERENCE`. Phase 1 : appliquer aux ménages 1 adulte +
  test discriminant (un single 65+ bas revenu voit le crédit). Effort S/M une fois la grille fournie.

---

## ORDRE 4 — Q1 multi-courbes (validé OUI, chantier à part)
- Étendre `lockedProjectionStore.ts` (N entrées au lieu de `FIXED_KEY`) + `store` (`lockedCurves: {id,label,timestamp}[]` — IDs persistés,
  blobs `chartData` en IDB). UI : nommer/sélectionner/comparer/supprimer des courbes verrouillées. Overlay multi via `lockedCurveOverlay`.
- Risque : volume IDB (~200-400 kB/courbe) → borner le nombre. ADR à écrire. Plan-first détaillé avant de coder.

---

## Notes transverses
- Migrations Zustand : seules PH4-C (additive), PH4-E (additive), PH4-F (**v7→v8**) en ont. Test de migration AVANT (RED) pour v8.
- Aucune surface UI nouvelle sans `formatCAD` + `<PrivateAmount>` (vie privée Loi 25).
- Chaque PR : commit-gate vert + `/review-all` + auto-merge. Backlog coché au merge.
