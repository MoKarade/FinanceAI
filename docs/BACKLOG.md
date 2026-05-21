# BACKLOG global — FinanceAI

> Liste exhaustive de TOUT ce qui reste à faire, compilée à partir de :
> - Demandes explicites de Marc dans toutes les sessions
> - Bugs et améliorations trouvés par audits / agents Claude
> - Phases reportées (centralisation, sécurité, etc.)
> - Tâches en attente dans TaskList
> - Tests manquants
>
> **Mise à jour** : à chaque livraison majeure, mettre à jour le statut et
> ajouter les nouvelles entrées découvertes.

---

## 🚨 P0 — Bloquant / Sécurité

### S1 — Auth Google OAuth + MFA (Cloudflare Access) — **CRITIQUE**
Site public exposé sans gate auth. N'importe qui avec l'URL voit du HTML
applicatif. Doc : [SECURITY_STRATEGY.md](SECURITY_STRATEGY.md).
- [ ] Phase 1 — Vérifier faisabilité DNS Cloudflare sur hubperso.com
- [ ] Phase 2 — Configurer Cloudflare Access policy (email Marc + MFA)
- [ ] Phase 3 — Tester en fenêtre privée, session 24h
- [ ] Phase 4 — Doc `AUTH_SETUP.md` + update README
- [ ] Phase 5 — Hardening optionnel : chiffrement localStorage avec passphrase
- **Effort** : 90 min (manuel Cloudflare + 0 code)
- **Coût** : 0 $

### S2 — Sprint 3B SH3 : IndexedDB backup chiffré (en cours)
Pending dans la TaskList. Backup automatique chiffré vers IndexedDB
en parallèle des exports JSON manuels.
- **Effort** : 4-6 h
- **Risque** : medium (test de round-trip nécessaire)

---

## 🎯 P1 — Centralisation calculs (Phase 3 — finition)

> Le refactor "Future = source unique" est à **65 %**. Reste l'extension
> moteur. Doc : [CENTRALIZED_CALC_PROGRESS.md](CENTRALIZED_CALC_PROGRESS.md).

### C1 — Étendre le moteur `monthlyOutput.ts` ✅ TERMINÉ 2026-05-21
Ajouter ces champs dans `ProjectionChartPoint` :
- [x] `marginalTaxRate` (% mensuel) — calculateFiscalReport per-month, par adulte
- [x] `effectiveTaxRate` (%) — taux moyen d'imposition
- [x] `TaxableInvIncome` ($) — pour TaxCenter investmentTaxData
- [x] `DividendIncome` ($) mensuel — pour Investments + DividendPanel
- [x] `reeeGrantsCum` ($) — pour ChildPlanning respProjection
- [x] `reeeContribCum` ($) — pour ChildPlanning respProjection
- [ ] `pensionRRQ`, `pensionPSV`, `pensionPrivee` (split IncomeRetirement) — reporté (refactor retirementIncome.ts non-trivial)
- [x] `realNetWorth` (déflaté à $ d'aujourd'hui) — pour charts pouvoir d'achat
- [x] `liquidityRunway` (mois) — pour stress test
- [x] `mortgageRemainingMonths` — estimation linéaire balance/paiement
- **Reste à faire** : split pension (peu critique, reporté)
- **Effort restant** : ~30 min

### C2 — Migrer composants après extension
- [ ] TaxCenter `report.marginalRate` / `effectiveRate` / `taxableAddOn`
- [ ] Investments `totalAnnualDividends` (KPI)
- [ ] Investments DividendPanel (timeline 30 ans DRIP)
- [ ] ChildPlanning `respProjection` (timeline REEE)
- [ ] RealEstate `amortizationData.Équité` (timeline 25 ans par propriété)
- **Effort** : ~3 h total
- **Risque** : low (lecture chartData simple)

### C3 — Mode strict TOTAL ✅ TERMINÉ 2026-05-21
Marc a demandé : "que ca prenne seulement les données du graph uniquement
et que ca me mette une erreur ou un msg si pas dispo". Statut :
- [x] Retirement : strict (plus de fallback worker)
- [x] HealthIndicator : strict (msg si projection vide)
- [x] Composant `ProjectionRequired` créé
- [x] **Dashboard** : Indicateur Futur → ProjectionRequired si pas dispo + fallback 5% supprimé
- [x] **Investments** : Card "Portefeuille projeté" → ProjectionRequired
- [x] **Budget** : Card "Impact à long terme" → ProjectionRequired
- [x] **RealEstate** : Badge équité projetée → ProjectionRequired inline
- [x] **Planning** : "Latte Factor" fake `× 10 × 1.4` retiré → ProjectionRequired
- [x] **ChildPlanning** : `respProjection` reconstruit depuis chartData (champ REEE),
  totalResp/respCovers null si pas dispo, graphe → ProjectionRequired
- [x] **TaxCenter** : 100% temps présent — pas de migration nécessaire
- [x] **DebtManager** : 100% local-deterministic (slider extraPayment) — pas de migration

### C4 — Supprimer code mort post-migration
- [ ] Worker local Retirement.tsx (déjà supprimé)
- [ ] Calcul `costTimeline` inline si remplacé par lookup chartData
- [ ] Calcul `respProjection` inline si remplacé par lookup chartData
- **Effort** : 1 h
- **Effet** : -100 à -200 lignes

---

## 🐛 P1 — Bugs ouverts / hypothèses non validées

### B1 — Retirement runMC=false vs Future MC=true ✅ RÉSOLU 2026-05-21
Retirement consomme lastProjection.chartData donc reflète automatiquement
le scénario actif + toggle MC de Future. Ajout d'un badge "Scénario actif :
{strategyName}" dans le subtitle de PageHeader pour transparence visuelle.

### B2 — Cohérence coûts enfants ✅ DOCUMENTÉ 2026-05-21
La fonction `getAnnualChildCost` (UI) reste PURE par design — pas de
contexte ménage (revenu, fiscalité). Les éléments contextuels (RQAP,
clawback, commuting, crédit garderie 30%) sont appliqués par le moteur
de projection (childrenReee.ts). Les chiffres NET pour l'UI viennent
de chartData (childGross, childCost, childBenefits) — voir respProjection
dans ChildPlanning.tsx. Documenté en LIMITATIONS dans childCosts.ts.

### B3 — `findEarliestRetirementAge` timeout test 30 s
Le test passe mais le moteur s'alourdit. Si plus de fixes ajoutent du poids :
- [ ] Optimiser le bissection (early-exit si NetWorth diverge)
- Reporté — pas critique (30s OK actuellement)

### B4 — Tests obsolètes potentiels
2 tests fixés cette session (marketData token-en-URL, goalSeek timeout).
- [ ] Audit complet des 52 fichiers de test pour détecter d'autres obsolescences
  (claims sur structures internes qui ont changé)
- Reporté — pas critique (suite 594/594 verte actuellement)

---

## 🎨 P2 — UX & polish

### U1 — Indicateur visuel "Projection requise" partout
Composant `ProjectionRequired` créé mais utilisé seulement dans Retirement.
- [ ] Investments tab : si lastProjection vide, hide horizon KPI
- [ ] Dashboard : indicateur futur disabled si pas de projection
- [ ] TaxCenter : badge "approximation hors projection"

### U2 — Onglet Future : badge "Scénario actif"
Indiquer clairement quel scénario est sélectionné dans Future, vu que
les autres onglets en dépendent maintenant.
- [ ] Sticky banner "Scénario : BASE / LIBERTE_55 / etc." dans Future header

### U3 — Toggle déterministe vs MC plus visible
Avec C1 (centralisation), le toggle MC dans Future impacte tous les onglets.
Le rendre prominent (radio button ?).

### U4 — Tooltip Future : groupes événements
L'agent a noté que le tooltip avec 10+ événements peut devenir long. Bien que
fixed-height OK, on pourrait grouper "Maison • Hypo • Charges • Capital • Intérêts"
sous une section pliable.

### U5 — Dashboard Évolution Détaillée : exporter PNG
Bouton "Télécharger PNG" pour partager le graph.

### U6 — Mode test : indicateur quand fixtures CSV manquent un symbole
Si un test asset n'est pas dans le CSV (regression future), afficher un warning.

---

## ⚡ P2 — Performance

### P1 — Bundle size audit complet
- [ ] Mesurer post Sprint 1 vs baseline (suppression framer-motion -80KB déjà fait)
- [ ] Identifier prochain candidat à lazy-load (recharts ? PDF lib ?)

### P2 — Cache portfolio-history.csv en SW
Le SW cache déjà `/assets/*`. Ajouter `/portfolio-history.csv` et
`/test-portfolio-history.csv` ?

### P3 — Worker projection : profiler
Le moteur s'est alourdi (childCosts, fix dettes). Mesurer impact sur
keystroke latency dans Future sliders.

---

## 🧪 P2 — Tests

### T1 — Étendre les tests de convergence
Actuellement 16 tests dans `projection.convergence.test.ts`. Ajouter :
- [ ] Vérification que `getAnnualChildCost(child, ageYear)` × 12 ≈ chartData.childGross moyenne sur année correspondante
- [ ] Test E2E mode test : activer mode test → naviguer chaque onglet → 0 console.error
- [ ] Test que ProjectionRequired s'affiche bien si lastProjection vide

### T2 — Tests visuels (Playwright)
- [ ] Screenshot baseline Dashboard / Future / Retraite / Enfant
- [ ] Détecter régression visuelle automatiquement en CI

### T3 — Coverage 80% target
Actuel : ~64 % estimé. Cibles à couvrir :
- [ ] Hooks (`usePortfolioHistory`, `useProjectionSelector`)
- [ ] Composants critiques (Retirement, FutureProjection, ChildPlanning)

### T4 — Vérifier que les 131 tests manuels passent en CI
Le checklist `MANUAL_TEST_CHECKLIST.md` est manuel. Étape : automatiser
les plus critiques en Playwright (cible : 20-30 tests).

---

## 📚 P3 — Documentation

### D1 — Mettre à jour SESSION_HANDOVER.md ✅ TERMINÉ 2026-05-21
- [x] Section dédiée Cycles 17-18 (Mode test + 13 fixes + Mode strict + Centralisation)
- [x] Index des docs mis à jour avec BACKLOG en tête + lien CENTRALIZED_CALC_PROGRESS
- [x] Highlights synthétisés en haut du doc

### D2 — README projet ✅ TERMINÉ 2026-05-21
- [x] Section "Conventions clés" : Future = source unique, mode strict, no-fake
- [x] Section "Raccourcis clavier" Alt+1..9
- [x] Tests count : 573 → 596
- [x] Liens vers BACKLOG, MANUAL_TEST_CHECKLIST, CENTRALIZED_CALC_PROGRESS,
  PROJECTION_OUTPUT_SCHEMA, SECURITY_STRATEGY

### D3 — ADR (Architecture Decision Records) ✅ TERMINÉ 2026-05-21
- [x] ADR 005 — Future = source unique pour les calculs projetés
- [x] ADR 006 — Convention "valeurs réelles ou rien"
- [x] ADR 007 — Authentification Cloudflare Access (proposé, config en attente)

### D4 — Doc utilisateur
Aujourd'hui pas de doc end-user. À créer si l'app sort du contexte perso :
- [ ] Quick start guide
- [ ] FAQ (privacy, données stockées, etc.)

---

## 🔧 P3 — Dette technique restante

### DT1 — Cleanup imports
Audit `import {...}` non utilisés (refactor cycle 17 a probablement laissé
des leftovers — ex: `runProjectionAsync`, `terminateProjectionWorker` dans
Retirement après mode strict).
- [ ] `npm run lint --fix` audit
- [ ] Supprimer ces imports

### DT2 — Types `any` résiduels
Le projet utilise encore `any` dans certains endroits (rapidité).
- [ ] Audit `as any` et `: any` → préférer `unknown` ou type précis
- Sprint 3B TH4 a déjà migré `catch (e: any) → unknown`. Reste les composants.

### DT3 — ChildPlanning duplique TEST_DEBTS-like logique
Cf B2 — Reste à aligner totalement UI et moteur.

### DT4 — `services/testFixtures.ts` 300+ lignes
Pourrait être splitté en `testAssets.ts`, `testGoals.ts`, etc.
- **Effort** : 1 h
- **Risque** : low

### DT5 — Worker projection trop monolithique
Le worker fait : projection + Monte Carlo + scénarios. À splitter en
fichiers distincts si le moteur grossit.

---

## 🎯 Quick wins potentiels (< 1 h chacun)

- [ ] Bouton "Reset to defaults" dans Configuration
- [x] Confirm dialog avant `enableTestMode` si données existantes — ✅ déjà fait
- [ ] Export PDF Future avec scénarios
- [ ] Dark/light mode toggle (si pas déjà supporté)
- [ ] PWA install prompt customisé
- [ ] Loading skeleton pour les chartes Future pendant calcul (>1s)
- [x] **Keyboard shortcuts Alt+1..9 pour switcher onglets** ✅ 2026-05-21
  (Alt+1=Dashboard, Alt+2=Transactions, Alt+3=Budget, Alt+4=Planning,
   Alt+5=Investments, Alt+6=Future, Alt+7=Retraite, Alt+8=Impôts, Alt+9=Assistant)
- [ ] Vue mobile : optimiser Future tab (responsive)

---

## ✅ Récemment livré (cycle 17, mai 2026)

Voir [SESSION_HANDOVER.md](SESSION_HANDOVER.md) et `git log --oneline -30`.
Highlights :
- Mode test fixtures + banner + toggle (Sprint cycle 16)
- 13 fixes bugs (Math.round, dettes infinies, Enfant crash, tooltip taille,
  TaxCenter × 100, etc.)
- Centralisation Phase 1+2 : 65 % complet
- CSV historique Yahoo Finance réel (no-fake total)
- Mode strict Retirement + HealthIndicator
- 16 tests Vitest convergence + 131 tests manuels checklist
- Docs SECURITY_STRATEGY + CENTRALIZED_CALC_REFACTOR + PROJECTION_OUTPUT_SCHEMA

---

## Comment maintenir ce backlog

À chaque session :
1. Marquer ✅ les items terminés
2. Ajouter de nouvelles entrées découvertes (avec catégorie P0/P1/P2/P3)
3. Mettre à jour estimés effort
4. Lier vers la doc/PR/commit pertinent

Priorité de traitement :
1. **P0** d'abord (bloquant ou sécurité)
2. **P1** ensuite (centralisation, bugs)
3. **P2/P3** comme rotation en quick-wins entre les gros sujets

## Snapshot de tailles approximatives

| Catégorie | Items ouverts | Effort total |
|-----------|---------------|--------------|
| P0 Sécurité | 2 (S1 auth + S2 IndexedDB backup) | ~6 h |
| P1 Centralisation | 3 champs Tier 3 restants (marginalTax/effective/pensionSplit) | ~1 h |
| P1 Bugs | 2 reportés (B3 goalSeek timeout / B4 audit tests) | non-critique |
| P2 UX | 5 items (skeleton Future, mobile, export PDF, dark mode, PWA prompt) | ~5 h |
| P2 Performance | 3 (bundle audit, SW cache, profiler) | ~4 h |
| P2 Tests | 4 (étendre convergence, Playwright, coverage, automatiser) | ~8 h |
| P3 Docs | 4 (handover, README, ADR, doc user) | ~6 h |
| P3 Dette tech | 5 (imports, any, split testFixtures, split worker, align getAnnualChildCost) | ~6 h |
| **Total restant estimé** | **~28 items** | **~36 h** |

**Progression session 2026-05-21** :
- ✅ **Mode strict TOTAL** : 8 composants migrés (Dashboard, Investments, Budget, RealEstate, Planning, ChildPlanning, HealthIndicator, Retirement) + ProjectionRequired
- ✅ **Centralisation Phase 3 Tier 1+2** : 7 nouveaux champs chartData (realNetWorth, liquidityRunway, mortgageRemainingMonths, reeeContribCum, reeeGrantsCum, DividendIncome, TaxableInvIncome)
- ✅ **ChildPlanning respProjection** branché sur reeeContribCum/reeeGrantsCum (vraies données moteur)
- ✅ **B1 décision UX** : Badge "Scénario actif" dans Retirement + sync avec Future
- ✅ **B2 cohérence enfants** : LIMITATIONS documentées dans childCosts.ts
- ✅ **Q3 keyboard shortcuts** : Alt+1..9 pour switcher d'onglet
- ✅ **+5 tests Vitest** convergence (594/594 verts au total)
- ✅ **BACKLOG.md** maintenu à jour à chaque batch
