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

### R3 · Futur P3 — infobulle figée/scrollable — ✅ FAIT (2026-06-22)
> **LIVRÉ** (blueprint ci-dessous suivi à la lettre) : clic = FIGE le tooltip (portail `createPortal` dans `body`,
> `position:fixed`, ancré/scrollable/interactif) ; survol = suit la souris (`pointer-events:none`) ; Échap / clic-dehors
> libère ; **coexistence** avec la modale via bouton « Détail complet » (+ pastilles d'événement inchangées). `<Tooltip
> content={()=>null}>` garde Recharts actif (alimente le survol + le curseur). Nouveaux : `utils/chartTooltip.ts`
> (`resolvePointFromClick` + `clampTooltipPosition`, purs), `hooks/useChartTooltipPosition.ts` (machine d'état
> `idle/hovering/frozen`, position ref+mutation DOM, listeners Échap/clic-dehors gelé seulement, focus a11y), `ExpertTooltip`
> découplé (`data` direct + `frozen`/`onOpenDetail`). Tests : 34 unité (utils/hook/tooltip) + 2 e2e (figeage, invariant
> mousemove, Échap, « Détail complet »→modale). Panel review intégré (contraste footer `ink-400`, cible tactile 44px).
> Follow-ups routés BACKLOG (`A11Y-CHART-KEYBOARD`, `FIX-INK600-TOKEN`) : accès CLAVIER du graphe (préexistant) + token `text-ink-600` invalide repo-wide.
- Aujourd'hui le tooltip suit la souris (Recharts recalcule la position à chaque move). Remplacer `<Tooltip content=…>`
  par un **portail React** (`createPortal`) positionné en `position:fixed` ; clic = fige (réutilise `handleChartContainerClick`
  ~475), Échap/clic ailleurs = libère. `ExpertTooltip` doit accepter `data` directement (le découpler du wrapper Recharts).
- Fichiers : `FutureProjection.tsx`, `projection/ProjectionTooltip.tsx`, nouveau `hooks/useChartTooltipPosition.ts`.
- Risque MOYEN (portail hors contexte Recharts) → extraire `ExpertTooltip` testable d'abord. e2e : mousemove après clic ne bouge plus.

> **⚠️ BLUEPRINT (agent `architect`, 2026-06-22) — à suivre à la reprise. Risque réel MOYEN/HIGH.**
> **Découverte importante** : le clic ouvre DÉJÀ `FutureDetailModal` (modale complète : drill-down compte, mini-graphe,
> espace cotisation — montre PLUS qu'un tooltip figé). La valeur UNIQUE d'un tooltip figeable = (a) rester ancré pendant
> qu'on survole d'AUTRES mois (comparaison) + (b) le scroller sans bloquer le graphe. Sinon = doublon UX. **Décision retenue =
> COEXISTENCE à rôles distincts** : tooltip figé = comparaison légère + bouton « Détail complet » → ouvre la modale (détail exhaustif).
>
> **Approche la MOINS risquée** : NE PAS réimplémenter la détection de point. Garder le `<Tooltip>` Recharts mais en
> `content={() => null}` (rend rien) — `onMouseMove` du `ComposedChart` (`FutureProjection.tsx:818`) continue d'alimenter
> `lastHoverPointRef`. Un PORTAIL séparé lit ce ref + la position curseur pour rendre le vrai tooltip.
> **State machine** `idle → hovering → frozen` (hook `useChartTooltipPosition`) : hover suit la souris (`pointer-events:none`) ;
> clic fige (`pointer-events:auto`, scrollable) ; Échap / clic-dehors / clic autre point = libère ou re-fige. Listeners `document`
> (Échap + clic-dehors) AJOUTÉS seulement en `frozen`, cleanup au unmount.
> **Perf** : position `x/y` en `useRef` + mutation DOM directe (`ref.current.style.left/top`) sur mousemove — PAS de state React
> (sinon re-render 60fps). State React change seulement au changement de point ou hovering→frozen.
> **Découplage** : `ExpertTooltip({ data: ProjectionChartPoint, userName1?, userName2?, frozen?, onOpenDetail? })` (props directes,
> testable sans Recharts) + shim `ExpertTooltipRecharts({active, payload})` si on garde un usage Recharts.
> **Positionnement** : `position:fixed`, `left=clamp(x+16, 8, vw-288-8)`, `top=clamp(y-24, 8, vh-h-8)` (largeur connue `w-72`=288 ;
> hauteur via ResizeObserver/ref). `z-index` tooltip < modale (`FutureDetailModal` = portail body) → tooltip 9999, modale 10000.
> **⚠️ RISQUE CRITIQUE** : re-router le clic SANS casser la modale qui MARCHE (`handleChartContainerClick:480-493` + `onClick`
> du `ComposedChart:819` → `setDetailPoint`). Le hook prend le contrôle EXCLUSIF du clic ; extraire `resolvePointFromClick(clientX,
> gridRect, data)` (géométrie lignes 485-491) en util PUR testable. a11y : au figer, focus le tooltip (`tabIndex=-1` + `data-frozen-tooltip`) ;
> à la fermeture, restituer le focus au graphe.
> **Ordre** : 1) découpler `ExpertTooltip(data)` + test unitaire ; 2) `useChartTooltipPosition` + tests du hook (transitions) +
> `resolvePointFromClick` util + test ; 3) câbler le portail, `<Tooltip content={()=>null}>` ; 4) re-router le clic (ne pas casser
> la modale) ; 5) z-index vs modale ; 6) e2e (mousemove après clic invariant · Échap ferme · scrollable · « Détail complet » ouvre la modale).
> **Testable unité** : `ExpertTooltip(data)`, `useChartTooltipPosition`, `resolvePointFromClick`. **e2e requis** : le figeage (5 cas ci-dessus).

### R4 · Futur P1+P4 — boot-restore + densité — ✅ FAIT (2026-06-22)
- P1 (boot-restore) : ✅ **DÉJÀ FAIT** — `App.tsx:72-96` restaure la courbe verrouillée au mount (`isProjectionLocked`
  persisté → `loadLockedProjection()` → `setLockedProjection(res.result)`, gère ok/unreadable/empty + toast). Aucun gap, zéro patch.
- P4 (densité) : ✅ cap FIXE baissé **40/24 → 24/16** (`FutureProjection.tsx`, constantes `MAX_LIFE_ICONS`/`MAX_FLOW_ICONS`).
  ⚠️ **Formule du plan `(visMax−visMin)/6` REJETÉE** (à l'envers : span grand=dézoomé → cap élevé = PLUS d'icônes dézoomé,
  et cap minuscule en zoom = écrête « toutes ») → le bon correctif est un cap fixe plus bas, pas proportionnel. Le LOD
  « zoom in = toutes » était déjà assuré (fenêtre zoomée < cap → tout affiché). Décision Marc 2026-06-22 = baisse modérée.

### R5 · PH3-c-bis — supprimer `User.industry` (trivial)
- `types.ts` : retirer `export type Industry` (116-130) + `industry?` dans `User` (156). NE PAS toucher les
  `industry?` de `marketData`/`finnhub` (secteur boursier, sans rapport).
- `components/settings/UserConfigFields.tsx:162-163` : retirer le `<select>` + l'import.
- **Pas de migration** (politique PH3-c : données résiduelles persistées ignorées). DoD : `grep industry` (hors marketData) = 0.

### R6 · Personas de test — tous fonctionnels sur toutes les pages — ✅ FAIT (2026-06-22)
- (1) `isActive: true` ajouté : `TEST_CHILD_GOALS` (testGoals.ts, coupleConfort) + childGoal d'`autonomeMonoparentale`.
- (2) `setupOptOut` setté par persona (selon le profil réel) : karim/preRetraite `{debts,realEstate,children}`,
  jeuneCoupleDink `{children}`, autonomeMono `{realEstate}`, lea/coupleDettes `{realEstate,children,lifeProjects}`
  + **micro-actif CELI** (1 part VFV.TO, `Asset` complet) pour lea/coupleDettes (prérequis `assets` non opt-outable → ouvre Futur/Investissements).
- ⚠️ Le plan listait 4 personas pour optOut ; le DoD en exigeait **6** (+ jeuneCoupleDink/autonomeMono) → étendu.
- **DoD prouvé** par un garde-fou : `tests/components/setup/personaGates.test.ts` (chaque persona × chaque page data = met OU opt-out, via la source unique `PAGE_SETUP`+`REQUIREMENTS`). Actions/Assistant restent gated = clé API (par design, hors scope).
- Découverte (pré-existante, hors scope) : les actifs de TOUS les personas omettent `performance`/`currency` (cast `as unknown as Asset[]`) → `AiAssistant` rend `+undefined%` en mode test avec clé → `PERSONA-ASSET-PERF` au BACKLOG.

---

## ORDRE 2 — PH4 (Budget & co), 6 phases indépendantes
> Réf détail : `BACKLOG.md`. Règles : `formatCAD` partout, `<PrivateAmount>` sur les montants sensibles, no-fake-data.

- **PH4-A** Parité Budget↔Transactions — ✅ FAIT (2026-06-22) : `utils/budget.ts` (`matchTransactionToCategory` règle unique
  exact+substring + `computeBudgetParity` → actualsMap/totalSpent/orphanCategories/itemsWithoutTransactions). `Budget.tsx` :
  réels ET tendances 6 mois via la MÊME règle (avant : tendances en exact seul + comptaient les doublons → divergence corrigée).
  UI : section « Parité » (orphelins + postes jamais rapprochés sur tout l'historique ; épargne exclue, accent-insensible).
  ⚠️ Panel `financial-integrity` a attrapé une régression $ (orphelins sortis du « Total dépensé ») → `totalSpent` préserve le
  total exact. a11y : h2/h3. Tests : 14 (utils/budget) + suite complète verte. *Pas de migration.*
- **PH4-B** Envie/Besoin : donut 50/30/20 **théorique vs réel** — ✅ FAIT (2026-06-22) : `utils/budget.ts computeGoldenSplit`
  (pur, partagé théo/réel) + `GOLDEN_IDEAL`. `Budget.tsx` : 2ᵉ donut « réel » (dépenses rapprochées + épargne réelle = revenu −
  dépenses) + table comparative **Réel · Cible · Idéal** (écart ±2 pts vert/orange), caption sr-only, note de **déficit réel**
  (panel silent-failure : `Math.max(0,…)` masquait un déficit). 6 tests `computeGoldenSplit` + suite verte. *Pas de migration.*
- **PH4-C** Objectif d'épargne réel vs cible — ✅ FAIT (2026-06-22) : `SavingsGoal.linkedBudgetCategoryName?` (par NOM = clé
  d'`actualsMap`, pas `id?` qui est optionnel) ; `utils/budget.ts monthlyActualsMap` (pur, mois courant, réutilise `computeBudgetParity`) ;
  `BudgetWorkspace.tsx` calcule le mois courant (réactif) + passe à `Planning section="goals"` ; `Planning.tsx` : dropdown de lien
  (form + par objectif éditable) + affichage « Accumulé / cible / Versé ce mois » (formatCAD + PrivateAmount). **Migration : AUCUN code**
  (champ optionnel additif, pas de Zod strict → rehydrate `undefined`). 6 tests `monthlyActualsMap`. Panel (financial-integrity JUSTE +
  silent-failure + code-reviewer + a11y) : fixes intégrés — **lien orphelin** (catégorie renommée/supprimée) → badge « ⚠ Lien invalide »
  au lieu de « 0 » muet ; mois réactif ; token `text-info-300` INEXISTANT → `text-info-400`. ⚠️ Limite documentée (BACKLOG `PH4C-SAVINGS-NATURE`) :
  lier à une catégorie de nature « Épargne » (alimentée par virements, exclus) affiche « versé 0 » — proposer/filtrer le dropdown plus tard.
- **PH4-D** Santé financière — ◑ PARTIEL (2026-06-22) : ✅ **ramené** `dashboard/HealthIndicator.tsx` dans Budget (nouveau
  sous-onglet « Santé » de `BudgetWorkspace`, retiré du Dashboard ; e2e `kpi.spec.ts` mis à jour pour naviguer Budget→Santé).
  ✅ **`PH4D-WEIGHTS-STORE` FAIT (2026-06-22)** : poids → store Zustand (additif, `loadLegacyHealthWeights`, merge défaut garde les poids user).
  ⏳ RESTE (routé BACKLOG) : `PH4D-BUDGET-RATIOS` (ratios budgétaires parité/couverture abos = 2 nouvelles métriques couplées au
  budget, schéma poids 4→6). Scope réduit volontairement
  (slice sûre) vu la longueur de session ; le composant lui-même est INCHANGÉ. Dépend de A.
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
