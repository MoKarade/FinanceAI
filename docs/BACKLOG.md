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

### C1 — Étendre le moteur `monthlyOutput.ts`
Ajouter ces champs dans `ProjectionChartPoint` :
- [ ] `marginalTaxRate` (% mensuel) — pour TaxCenter
- [ ] `effectiveTaxRate` (%) — pour TaxCenter
- [ ] `TaxableInvIncome` ($) — pour TaxCenter investmentTaxData
- [ ] `DividendIncome` ($) mensuel — pour Investments + DividendPanel
- [ ] `reeeGrantsCum` ($) — pour ChildPlanning respProjection
- [ ] `reeeContribCum` ($) — pour ChildPlanning respProjection
- [ ] `pensionRRQ`, `pensionPSV`, `pensionPrivee` (split IncomeRetirement)
- [ ] `realNetWorth` (déflaté à $ d'aujourd'hui) — pour charts pouvoir d'achat
- [ ] `liquidityRunway` (mois) — pour stress test
- [ ] `mortgageRemainingMonths` — pour RealEstate
- **Effort** : 3-4 h
- **Risque** : medium (multiple call-sites de calculateFiscalReport)

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

### B1 — Retirement runMC=false vs Future MC=true (décision UX)
Future tourne avec MC=true par défaut. Retirement consomme désormais
lastProjection donc reflète automatiquement le toggle MC de Future.
Décision Marc à valider :
- (a) Toujours afficher le scénario Future actif (status quo après refactor)
- (b) Forcer toujours Base / déterministe dans Retirement avec indicateur visuel
- [ ] Choisir et appliquer

### B2 — Cohérence coûts enfants reste partielle
La fonction `getAnnualChildCost` (UI) et `processOneChild` (moteur) utilisent
les mêmes constantes mais diffèrent sur :
- RQAP (moteur) vs `parentalLeaveMonthsCost` (UI)
- Allocations clawback >150k$ ménage (moteur seulement)
- Commuting savings 350$/mois pendant mat leave (moteur seulement)
- [ ] Documenter ces différences ou aligner totalement (extension `getAnnualChildCost`)

### B3 — `findEarliestRetirementAge` timeout test 30 s
Le test passe mais le moteur s'alourdit. Si plus de fixes ajoutent du poids :
- [ ] Optimiser le bissection (early-exit si NetWorth diverge)

### B4 — Tests obsolètes potentiels
2 tests fixés cette session (marketData token-en-URL, goalSeek timeout).
- [ ] Audit complet des 52 fichiers de test pour détecter d'autres obsolescences
  (claims sur structures internes qui ont changé)

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

### D1 — Mettre à jour SESSION_HANDOVER.md
Le handover référence l'état avant les refactors récents.
- [ ] Section §4 : cycles 17-18 résumés (centralisation, CSV réel, mode strict)
- [ ] Section §10 : architecture mise à jour (hook useProjectionSelector)

### D2 — README projet
- [ ] Ajouter section "Mode test" avec lien vers MANUAL_TEST_CHECKLIST.md
- [ ] Documenter convention "valeurs réelles ou rien"

### D3 — ADR (Architecture Decision Records)
- [ ] ADR sur Cloudflare Access vs alternatives auth
- [ ] ADR sur Future = source unique vs calculs locaux
- [ ] ADR sur convention no-fake-data

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
- [ ] Confirm dialog avant `enableTestMode` si données existantes (déjà fait ?)
- [ ] Export PDF Future avec scénarios
- [ ] Dark/light mode toggle (si pas déjà supporté)
- [ ] PWA install prompt customisé
- [ ] Loading skeleton pour les chartes Future pendant calcul (>1s)
- [ ] Keyboard shortcuts (1-9 pour switcher onglets)
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
| P0 Sécurité | 2 | ~6 h (90 min auth + 4-6 h backup IndexedDB) |
| P1 Centralisation | 4 sujets, ~12 items | ~10 h |
| P1 Bugs | 4 | ~3 h |
| P2 UX | 6 | ~6 h |
| P2 Performance | 3 | ~4 h |
| P2 Tests | 4 | ~8 h |
| P3 Docs | 4 | ~6 h |
| P3 Dette tech | 5 | ~6 h |
| **Total restant estimé** | **~40 items** | **~50 h** |
