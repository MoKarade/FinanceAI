# SESSION HANDOVER — pour le prochain Claude

> **À lire EN PREMIER si tu reprends FinanceAI.** Ce document remplace
> la lecture séquentielle de tous les autres. Pointeurs vers les détails
> à la fin.
>
> ## ⚡ BRIEF MARC 2026-06-10 — LE CHANTIER PRIORITAIRE (4 phases)
> Marc a livré un brief structurant (détail COMPLET dans `BACKLOG.md` § « BRIEF MARC 2026-06-10 ») :
> **Phase 1** bugs chunk périmé (✅ FAITE, mergée #238 → prod : [PH1-a] `lazyWithRetry` sur le dernier
> `React.lazy` nu + filet global `vite:preloadError` durci au panel — garde timestamp ≤ 1 reload/min,
> clear-au-mount supprimé ; analyse Cloudflare livrée, décision Marc = [PH1-b]/Q2) →
> **Phase 2** clé de voûte (état persistant inter-onglets, projection en Web Worker app-level, source
> unique Futur=Retraite, verrouillage de courbe + IndexedDB) → **Phase 3** onglet Profil (remplace
> Config/Profil, regroupe profil+retraite+profil détaillé, % complétion, purge des champs morts) →
> **Phase 4** refontes par onglet (Futur leviers-d'abord/annotations/plan d'action remonté ;
> Transactions ; Budget ; Investissement autocomplétion+dividendes ; Retraite).
> ⚠️ RÈGLES : plan-first OBLIGATOIRE sur Ph. 2/3/et CHAQUE onglet de Ph. 4 ; **JAMAIS passer à la
> phase suivante sans OK explicite de Marc** ; Q1/Q2 à poser (cf `A_FAIRE_MOI` O6) ; handover à jour
> après chaque phase.
>
> **▶ PHASE 2 EN COURS (3 PR, décompo validée Marc 2026-06-10) — 2/3 MERGÉES** :
> **PR-1 = [PH2-a]+[PH2-b] ✅ MERGÉ #240** (Futur survit aux onglets : `runMC` persisté + worker singleton
> chaud + dédup `runProjectionAsync` re-raccroche un MC en vol). **PR-2 = [PH2-c] ✅ MERGÉ #241** (source
> UNIQUE : moteur `ProjectionEngine` headless+lazy AU NIVEAU APP publie `lastProjection` pour TOUS les
> onglets ; `useSimulationParams` partagé ; Futur = consommateur ; `projectionStatus` au store ; garde
> no-fake-data ; panel complet OK, 1900 tests. Suivis non bloquants PH2-c-1..4 au BACKLOG — dont **PH2-c-1
> = dédup fetch `usePastPortfolioHistory`** double-instance sur Futur). **SUITE = PR-3 = [PH2-d]** :
> verrouillage de courbe + `ProjectionResult` COMPLET en IndexedDB + double courbe verrouillée/aperçu live
> (forks Q2/Q3 validés Marc). **plan-first OBLIGATOIRE** avant de coder PR-3. ⚠️ Pas de Phase 3 sans OK Marc.
>
> Session 2026-06-10 — **TOP 10 [UI-EPURE] COMPLET + 5 fiscaux MAJEURS + [UI-SCEN]**. Build/tsc/tests verts.
> - **Épuration UI (EP-1..EP-10)** — 4 PR (#225 EP-1/2, #226 EP-3/4/5, #227 EP-6/7/10, #228 EP-8) :
>   Futur/Paramètres « Risques & aléas » repliée + Card AI retirée ; Dashboard 5e KPI « Patrimoine projeté »
>   = source unique (`lastProjection.chartData`, mini-formulaire retiré) ; Investments donut santé +
>   projection par compte épurés ; Config SetupHub → ruban discret à 100 % ; ProjectionExplains méthodologie
>   sous « En savoir plus » ; Optimisation StressTest replié + **AssetLocationPanel SUPPRIMÉ** (doublon
>   Retraite) ; Retraite bloc pension DB replié. **no-silent-failure** : NetWorth non fini → `<ProjectionRequired>`
>   + `logError` (Dashboard/Investments). EP-9 = déjà satisfait (doublons retirés avant, CTA Futur fonctionnels).
> - **[UI-SCEN] (#223)** : `projection.withdrawalStrategy` = paramètre (sélecteur Paramètres), moteur 1 scénario
>   par défaut (suite moteur **82→33 s**), stress-tests à la demande (`StressTestPanel`), plans de base supprimés.
> - **Fiscal 5 MAJEURS (#221/#222)** : FA-1 assiette crédit pension (exclut RRQ/PSV) · FA-2 clawback PSV par
>   conjoint (seuil individuel) · FA-3 SRG non imposable + clawback complet · FA-4 CELI source unique ·
>   FA-5 NPV rentes succession ×N corrigé. `FISCAL_REFERENCE` §4/6/7 à jour.
> - **Gouvernance** : Action `backlog-autocheck` retirée (déjà) ; CLAUDE.md — règle auto-merge +
>   **force-push BLOQUÉ par le repo** → recovery « checkout branche distante + merge main + fast-forward »
>   (+ reconcile après CHAQUE squash-merge) documenté en § résilience cloud.
> - ⚠️ **Auto-merge KO** : le repo n'a **aucun required status check** → `enable_pr_auto_merge` échoue
>   (« unstable »). **À débloquer côté Marc** : Settings → Branches → required status checks (cf `A_FAIRE_MOI`).
>   Sinon chaque PR = re-check manuel. ⚠️ **Le webhook PR ne livre PAS le succès CI** (que les échecs +
>   commentaires) → pour merger sur vert sans auto-merge : `send_later` indispo ici → **réveil court en
>   arrière-plan** (`Bash run_in_background` `sleep ~210`) qui re-déclenche le check CI puis merge. Pas de
>   1 h d'attente, pas de `sleep` foreground (bloqué par le harness).
> - **Fix moteur/fiscal money-critical (suite, #229-#234)** : **PV-5** (champs `number` Retraite —
>   vide ⇒ `Number('')=0` persisté ⇒ pension DB « dès 0 an » ; garde `numOr`/`numOrUndef`) ·
>   **PV-1** (découvert de liquidités effacé par le clamp de croissance ⇒ patrimoine surévalué ;
>   sauvetage par cascade de vente, choix Marc) · **FA-9** (double indexation du SRG ⇒ max surévalué
>   ~49 % à 20 ans ; base réelle + nominalisation unique) · **FA-10** (impôt de décembre en survivorMode
>   sur 2 têtes ⇒ sous-imposition ; 1 contribuable) · **PV-2** (récolte de gains ignorait la banque de
>   pertes ; consomme `capitalLossBank` en premier, LIR 111(1)(b)) · **PV-10** (retrait NON-ENREG des
>   objectifs ne réalisait AUCUN gain ⇒ sous-imposition ; via `handleNonRegSale`). Chaque PR : panel
>   4 agents + FISCAL_REFERENCE à jour, suite ~1859 verte, zéro baseline.
> - **Règles Marc 2026-06-10** (CLAUDE.md) : **date+heure en tête de CHAQUE réponse** · **agents/timers
>   tués IMMÉDIATEMENT après usage** (plus de traînards « 160 h »).
> - **Reste ouvert (découvertes routées au BACKLOG)** : FA-6/7/8/11 (fiscal) · PV-3/4/7/8/9/11 (moteur :
>   crypto sans banque de pertes, TLH×ACB, gains invisibles au test SRG/clawback, métriques d'objectifs) ·
>   CA-01..10 (dette code) · [D6-SR] fuite SR mode privé. Auto-merge toujours KO (required checks à activer).
>
> Session 2026-06-09 — **14 PR mergées (#206-#217 + gouvernance)**. Tests **1782 verts / 154 fichiers**.
> - **Refonte Futur COMPLÈTE** : 4 sous-onglets (Graphique/Paramètres/Optimisation/Plan d'action)
>   + écran d'amorçage (#213) ; Robustesse+Optimiseur fusionnés en « Comparer les stratégies »
>   2 modes (#215) ; Plan d'action = checklist (case + montant + « Pourquoi ? » repliable,
>   `AdviceItem[]` structuré, zéro chiffre fiscal en dur) (#216) ; fix contraste onglets actifs (#215).
> - **Bug rentes bouclé** : début RRQ/PSV découplé de l'âge d'arrêt (moteur #210, RRQ→72) + UI âges
>   dans Retraite (#214). Fiscal : fractionnement pension 65+ (#211), récolte de gains (#212).
> - **Mode test réparé (#217)** : switch persona = base propre (zéro fuite inter-persona) ; mode test
>   PERSISTÉ (bannière survit au reload) ; push Drive toujours coupé en test ; `resetState` sort du
>   mode test ; `realDataSnapshot` typé `Omit<…,'apiKeys'>`.
> - **Gouvernance** : Action `backlog-autocheck` RETIRÉE (Claude coche le BACKLOG au merge) ;
>   CLAUDE.md § « Exécution cloud — résilience » (reverts conteneur → vérifier ancêtre origin/main,
>   CI muette = divergence, flake E2E = rerun) ; 14 branches mortes supprimées.
> - **Reste ouvert** : PR #150 dependabot (hono, sécu) ; P0 (proxy clé, IndexedDB, sync Drive réelle,
>   gate Google) ; [D6-SR] fuite SR mode privé.
>
> Session 2026-05-29 — **Feature Sync Google Drive** (livrée « dark », inerte sans `VITE_GOOGLE_CLIENT_ID`) :
> données dans le Drive de chaque user (appDataFolder), auto + garde anti-perte, pas de chiffrement
> applicatif (choix Marc), clés API synchronisées (sync v2, en clair). Code : `services/sync/*` + `services/googleDrive/*`
> + carte Réglages→Système. **Pour activer** : suivre `docs/GOOGLE_DRIVE_SETUP.md` (créer le Client ID
> OAuth + mettre `VITE_GOOGLE_CLIENT_ID`). Design : `docs/GOOGLE_DRIVE_SYNC_DESIGN.md`. Tests +53.
>
> Dernière session : 2026-05-28 — **Lot 1 (sécu) + Lot 2 (tests) + Audit multi-agents (Lot 3)** :
> - **Lot 1 — Sécurité & conformité** : backup auto chiffré AES-GCM (S-A), Google Consent Mode v2
>   pour GA4/Loi 25 (S-B), redaction PII errorLogger testée (S-C), anti-injection prompt partagé
>   `utils/promptSafety.ts` (S-D), quick-wins (S-E). ✅
> - **Lot 2 — Filet de tests moteur money-critical** : ~119 tests sur 11 modules sans test unitaire
>   direct (cloudBackup, taxJanuary, meltdownReer, monteCarlo, monthlyCalcs, etc.). ✅
> - **Audit 5 agents → corrections (Lot 3)** : aucun CRITICAL. Shippé en batches isolés (CI verte) :
>   F5/F7/F8/F6 (sécu), **F4** (retenue REER 21/26/30→19/24/29 % via `RRSP_WITHHOLDING_QC` — money fix),
>   **F1/F3** (silent-failures projection : stack worker préservée + `_hasError` lu → erreur honnête),
>   **F9/F10/F11** (perf : hoist `Math.pow`, Map O(1) tickFormatter, handlers pan stables). Rapport :
>   [AUDIT_2026-05-28.md](AUDIT_2026-05-28.md). Tier 🟢 (règles fiscales incertaines) **non modifié** sans source.
> Voir aussi [AUTH_SETUP.md](AUTH_SETUP.md), [SECURITY_STRATEGY.md](SECURITY_STRATEGY.md). Tests **1154/1154 verts** (106 fichiers).
>
> Session 2026-05-27 — **État production** (Cloudflare Access, clés chiffrées, CSV universel,
> CoinGecko/Finnhub, era retiré, G21 optimiseur, G22 UX, G23 a11y). Tests 732/732 alors.
>
> Session précédente : 2026-05-26 (G22) — refonte UX + navigation.
> Tests 742 → **732 verts** (delta : 2 fichiers test era retirés, compensé par test régression coussin).
>
> **Cycle 17-18 highlights** :
> - Mode test fixtures (couple Alex/Sam, 5 actifs réels Yahoo, REEE/dettes/immo)
> - 13 fixes bugs visibles (TaxCenter × 100, dettes infinies, Enfant crash, Math.round M$, etc.)
> - **Mode strict TOTAL** : 8 composants migrés vers `lastProjection.chartData`
> - **Centralisation Phase 3** : 9 nouveaux champs chartData (marginalTax,
>   reeeContribCum, DividendIncome, realNetWorth, etc.)
> - CSV Yahoo Finance authentique pour mode test (no-fake total)
> - Keyboard shortcuts Alt+1..9
> - 23 tests convergence Vitest (594→596 verts) + checklist 131 tests manuels
> - 8 nouveaux docs (BACKLOG, SECURITY_STRATEGY, CENTRALIZED_CALC_*,
>   PROJECTION_OUTPUT_SCHEMA, etc.)

---

## 1. État en une page

| Indicateur | Valeur |
|---|---|
| **Repo** | https://github.com/MoKarade/FinanceAI |
| **Branche principale** | `main` |
| **Dernière PR mergée** | **#116** (fix Lighthouse a11y 95→100 + SW cache) |
| **App déployée** | https://www.hubperso.com (Vercel auto-deploy sur push main) |
| **Tests** | **1154/1154 verts** (106 fichiers, ~278s en local, `fileParallelism: false`) |
| **Typecheck** | Clean en mode strict |
| **Build** | OK — bundle index ~528 KB gzip ~166 KB (vendor jspdf 391 KB lazy) |
| **Schema store** | v6 (Zustand persist avec migrations v1→v6) |
| **Stack IA** | `@anthropic-ai/sdk` (Sonnet 4.6 + Haiku 4.5) — Gemini retiré |
| **Banque** | CSV universel (100% local, parseBankCsv.ts) — Era Context retiré entièrement |
| **Crypto** | CoinGecko (gratuit, sans clé) |
| **Stock/ETF** | Finnhub REST (gratuit) |
| **Sécurité storage** | AES-256-GCM + IndexedDB non-extractible (services/secureKeyStore.ts) |
| **Auth** | Cloudflare Access (Google OAuth, session 24h) |
| **Lighthouse prod** | Performance 97 / A11y 100* / BP 100 / SEO 90 |
| **PWA** | manifest + SW v2 (precache résilient) — installable Chrome/Edge/Mobile |
| **WCAG** | AA conformant (sub-set AAA pour touch, focus, reduced-motion) |

*A11y 100 attendu après re-run post-#116. Score initial 95 avec 2 violations corrigées.

---

## 2. Contraintes cardinales (NE PAS VIOLER)

1. **🔒 ZÉRO service payant** — user a explicitement refusé Finnhub paid,
   Sentry SaaS, GlitchTip backend, tout SaaS récurrent. Tout doit rester
   sur tiers gratuits (Vercel free, GitHub Actions free, IndexedDB browser,
   localStorage, Anthropic API clé perso de l'user, Era Context perso, Finnhub free).

2. **🔒 PAS de Google Sheet** — l'user a demandé suppression totale du
   Google Sheet legacy (cycle 14). Le fichier `netlify/functions/sheet-proxy.ts`
   a été supprimé, le CSP a été nettoyé de docs.google.com, `services/finance.ts`
   ne fait plus de fetch CSV. Ne PAS le réintroduire.

3. **🔒 Pas de demo data au boot** — l'user veut un état vide tant qu'il
   n'a pas saisi ses infos lui-même. Hook `useHasUserData` (`utils/useHasUserData.ts`)
   gate l'affichage des widgets d'actions/dashboard. NE PAS pré-remplir
   `constants.ts` avec des INITIAL_USERS / INITIAL_BUDGET non-vides.

4. **🔒 Tester sur hubperso.com** — l'user a précisé : « SI tu veux faire
   des tests directement sur l'app utilise hubperso.com ». L'app est aussi
   sur GitHub Pages mais hubperso.com est la prod canonique.

5. **🔒 Branches pattern `claude/<task-name>`** — l'user mergeait chaque
   PR rapidement. Crée toujours un PR DRAFT, attends la review/merge avant
   d'enchaîner la suivante.

---

## 3. Ce qui a été livré cette session (18 PRs)

### Phase 1 — Production Readiness (PRs #99-#105)

| PR | Item | Description |
|---|---|---|
| #99 | P1.1 errorLogger | Rolling buffer 100 entrées localStorage + global handlers + viewer dans Système |
| #100 | P1.4 CSV + chunkLoad | `utils/csvExport.ts` RFC 4180 + `lazyWithRetry` (fix chunk-load) + cache headers Netlify |
| #101 | P1.3 backupAuto | IndexedDB 7-day rolling backups + AutoBackupPanel UI |
| #102 | P1.2 zod safeParse | Toutes les `Schema.parse()` → `safeParse()` avec errorLogger |
| #103 | P1.7 audit log | Rolling 500 entrées + AuditLogViewer dans Système |
| #104 | P1.5 PDF complet | Patrimoine + **Fiscal** + **Holdings** + **Dettes** + **Goals** + Retraite + Budget (+16 tests builders purs) |
| #105 | P1.6 Lighthouse CI | Workflow `.github/workflows/lighthouse.yml` warn-only + continue-on-error |
| #106 | docs P1 | MAJ HANDOVER + CHANGELOG + PLAN_P1 |

### Phase 2 — Mobile & a11y AAA (PRs #107-#114)

| PR | Item | Description |
|---|---|---|
| #107 | P2 plan | `docs/PLAN_P2.md` — triage + 9 items chiffrés |
| #108 | P2 quick wins | Modal focus restore (P2.2) + close 44px (P2.3) + prefers-reduced-motion (P2.6) |
| #109 | P2.5 contrast | ink-400 #64748b→#8896a8, ink-500 #475569→#6a7689 (WCAG AA) |
| #110 | P2.4 touch targets | 5 boutons icon <44px corrigés (privacy toggle, toast, docs, planning) |
| #111 | docs intermédiaires | MAJ HANDOVER P2 6/9 |
| #112 | P2.8 form labels | ~35 inputs orphelins fixés (PatrimoineExtended 17, Settings 10, DebtManager 5, etc.) |
| #113 | P2.9 PWA | manifest.json + sw.js + icon.svg + register en PROD |
| #114 | P2.1 axe pages | 4 pages couvertes (Onboarding, SystemView, Dashboard, TaxBracketViz) |
| #115 | docs P2 final | MAJ HANDOVER + CHANGELOG + PLAN_P2 (clôturé 9/9) |

### Cycles 17-18 — Mode test + Centralisation + Strict mode (2026-05-21)

Direct merges sur main (pas de PRs numérotées — workflow accéléré avec
Marc validant en live).

**Mode test** :
- `services/testFixtures.ts` : couple Alex/Sam, 68 transactions, 5 actifs
  réels Yahoo (VFV.TO, VEQT.TO, XEQT.TO, AAPL, BTC-CAD), CSV historique
  100% authentique bundlé `services/data/test-portfolio-history.csv`
- Bouton Activer/Désactiver dans Configuration → TestModePanel
- Banner orange permanent en mode actif
- `enableTestMode` snapshot des vraies données pour restauration safe

**13 fixes bugs visibles** (cycle 17) :
- TaxCenter taux marginal × 100 (était décimal affiché tel quel)
- Future scénarios "0.0M$" (Math.round avant /1M)
- Enfant crash (Bar dans AreaChart → ComposedChart)
- Tooltip Future taille fixe + icônes alignées + ligne décaissement
- Extinction dettes (effectiveMinimum garde-fou)
- Retirement aligné avec Future (savingsGoals + financialGoals)
- Fixtures Debt/ChildGoal champs corrects
- Variation Dashboard 2 décimales partout
- Plus : tooltip décaissement portfolio en retraite (bug "60\$/mois")

**Mode strict TOTAL** (cycle 18) :
- 8 composants migrés : Retirement, Dashboard, Investments, Budget,
  RealEstate, Planning, ChildPlanning, HealthIndicator
- Composant partagé `components/ui/ProjectionRequired.tsx` (variants
  block + inline)
- Suppression de tous les fallbacks fake (formule 5% Dashboard, 25×
  HealthIndicator, ×10×1.4 Latte Factor Planning, projection REEE locale
  ChildPlanning)
- Convention "valeurs réelles ou rien" appliquée à fond

**Centralisation Phase 3 — 9 nouveaux champs `chartData`** :
- Tier 1 : `realNetWorth`, `liquidityRunway`, `mortgageRemainingMonths`
- Tier 2 : `reeeContribCum`, `reeeGrantsCum`
- Tier 3 : `DividendIncome`, `TaxableInvIncome`, `marginalTaxRate`, `effectiveTaxRate`
- Hook partagé `hooks/useProjectionSelector.ts` (3 variants)

**B1 décision UX** : Retirement reflète automatiquement le scénario actif
de Future (badge "Scénario actif : {strategyName}" dans subtitle).

**Q3 keyboard shortcuts** : Alt+1..9 pour switcher d'onglet.

**Tests** : 573 → 596 verts (+23 : 16 convergence + 5 nouveaux Tier 1-2
+ 2 nouveaux Tier 3). +131 tests manuels checklist.

### G21 — Optimiseur de stratégie (cycles post-#116)

- `services/projection/strategySearch.ts` : recherche automatique de la meilleure stratégie d'allocation parmi toutes les combinaisons
- `services/projection/drawdownOptimizer.ts` : optimisation du calendrier de décaissement
- `services/projection/strategyRanking.ts` / `strategyRobustness.ts` : classement et robustesse des stratégies
- Bouton « Annuler » dans l'UI FutureProjection pour interrompre le calcul long
- Bouton « Appliquer la stratégie gagnante » (bascule le scénario actif sur le résultat optimal)
- Budget adaptatif : watchdog 15 min, estimation ~8ms/sim
- `lastProjection.bestStrategyIdx` : index de la stratégie gagnante dans `allResults`

### G22 — Refonte UX (cycles post-G21)

| Item | Description |
|---|---|
| G22-N3 | Planning + Abonnements fusionnés dans Budget (sous-onglets via `BudgetWorkspace.tsx`) |
| G22-N4 | Settings.tsx découpé en sous-sections (`settings/sections/` : Profile, Accounts, Integrations, Patrimoine, Backup) |
| G22-N5 | Onglet Système fusionné dans Configuration (sous-onglet « Système & diagnostics ») |
| G22-F1 | `components/projection/ProjectionExplains.tsx` : explorateur data-driven des données de projection |
| G22-F4 | `components/tour/GuidedTour.tsx` : tutoriel guidé lancé après l'onboarding (relançable depuis Profil) |
| G22-B1 | Valeur nette complète dans FutureProjection (placements reconstruits + cash) |
| G22-B2 | Bascule directe Couple/Individuel depuis la sidebar |

### G23 — Qualité & purge (session 2026-05-27, 4 merges directs sur main)

| Commit | Description |
|---|---|
| `3167a55` | U3 radio-group MC (clavier natif) + U4 tooltip tous événements + DT4 split testFixtures (6 modules) + bug HealthIndicator/NextBestAction (coussin = 0) + lisibilité tax.ts/projection.ts + sécurité MEDIUM eraContext + 0 warning ESLint (484→0) + resync docs |
| `20abca8` | Retrait 4 fonctions IA mortes de services/claude.ts (getInvestmentAdvice, generateSmartGoals, analyzeBudgetAI, analyzeDocuments) + schémas Zod orphelins |
| `4af08b2` | Retrait COMPLET era Context (~1 224 lignes) : services/eraContext.ts, services/aiOrchestrator.ts, components/dashboard/EraContextInsights.tsx, clé apiKeys.eraContext. ADR 002 marqué SUPERSEDED |
| `6042fe9` | Purge résidus era (CSP index.html + netlify.toml, source log errorLogger) + code mort knip (53→36 unused exports : hasSeenTour, PLAN_LEVELS, annualToMonthly, getAssetMeta*, getDividends, clearApiKeys, loadApiKeys) |

Tests après session : **732 verts / 71 fichiers** (delta : 2 fichiers test era retirés, compensé par test de régression coussin).

### Phase 3 — Lighthouse prod fixes (PR #116)

| PR | Description |
|---|---|
| #116 | Card title h3→h2 (heading hierarchy) + CoupleModeBadge role="img" + SW cache.addAll → précache individuel (Vercel rewrite `/index.html` 404 swallowed) + cache v1→v2 |

### P2.7 skip-to-main : déjà fait au cycle 5.1 (Layout.tsx:117-123) — pas de PR nouvelle.

---

## 4. Ce qui a été validé manuellement par l'user

Validé sur hubperso.com lors de la dernière session :
- ✅ PWA install Chrome desktop + mobile (icône emerald "Fi")
- ✅ DevTools → Manifest chargé, theme `#10b981`
- ✅ SW registered, activated
- ✅ Offline test (page s'affiche)
- ✅ **Lighthouse desktop : 97/95/100/90** (avant PR #116) — A11y 100 attendu après
- ✅ A11y manual checks 5.1 à 5.7 tous OK (focus restore, hit area, contrast, touch, reduced-motion, skip-link, form labels)

**À valider encore** (après #116 mergé) :
- ✅ **Cache Storage `financeai-v2` peuplé** — Validé 2026-05-21 après PR #118 (cycle 16). 16 entrées au 2e load (HTML + assets/* hashés). Voir `docs/INVESTIGATION_PWA_VERCEL_2026-05-21.md` pour le diagnostic complet.
- 🔲 **Lighthouse A11y re-run pour confirmer 100**
- 🔲 **PDF complet (P1.5)** — l'user n'a pas encore testé Patrimoine + Fiscal + Holdings + Dettes + Goals dans un seul PDF
- ✅ **SW update test** — Validé 2026-05-21 : push PR #118 a triggered un nouveau build, SW v2 a remplacé l'ancien automatiquement (skipWaiting + clientsClaim).
- 🔲 **iOS Safari** (l'user n'a pas Safari)

---

## 5. Ce qui reste (roadmap "10/10")

| Priorité | Item | Effort | Notes |
|---|---|---|---|
| 🔴 | P3 Refactor god-components | 40h | Settings 1500+ lignes, Retirement 1000+ lignes, Investments. Le refactor le plus rentable car ces fichiers freinent toute évolution. |
| 🟠 | P4 Tests Playwright E2E + visual regression | 25h | Manque tests d'intégration full-flow (onboarding → ajout asset → projection → PDF). |
| 🟢 | P5 Era push / sync multi-device | 50-80h | Avancé : sync transactions cloud bidirectionnel via Era. **Touche backend** → vérifier que ça reste gratuit. |
| 🟡 | Form primitives `<Input>`/`<Select>`/`<Field>` | 8h | 133+ inputs inline non factorisés (ADR-004). À faire en même temps que P3 idéalement. |
| 🟡 | i18n compléter | 10h | 32 → ~260 clés si l'user veut réactiver EN/FR (cycle A a supprimé le toggle). |
| ⚪ | Brancher `logAudit()` aux call-sites | 2h | Infra prête depuis #103 mais les call-sites (import CSV, suppressions batch) ne logent pas. Quick win. |

### Suggestions ad-hoc

- **Lighthouse Performance** : 97 est excellent. Si tu veux le pousser à 100, vise les 239 KiB d'unused JS dans `index-*.js` (split Settings + Retirement + Investments en lazy chunks). Voir suggestion Lighthouse.
- **Forced reflow Recharts** : 46ms perdus dans recharts internals. Pas fixable côté FinanceAI sans forker recharts. Ignorer.

---

## 6. Comment travailler dans ce repo

### Setup
```bash
git clone https://github.com/MoKarade/FinanceAI.git
cd FinanceAI
npm install --no-audit --no-fund  # PAS de package-lock.json committé (commit 97651b54)
```

### Commandes utiles
```bash
npm run dev          # localhost:3000 — Vite HMR
npm test             # vitest, doit rester 732/732
npm run typecheck    # tsc --noEmit, strict
npm run build        # bundle prod (vérifie pas de regression de size)
npm run lint         # eslint
npm run knip         # détecter dead code
npx tsx scripts/check-contrast.ts  # audit WCAG AA contrast
```

### Workflow Git
1. `git checkout main && git pull origin main`
2. `git checkout -b claude/<task-name>`
3. Code + tests + commit
4. `git push -u origin claude/<task-name>`
5. Créer PR DRAFT via `mcp__github__create_pull_request` (base `main`, draft `true`)
6. Attendre review/merge de l'user
7. Ne PAS push à `main` directement, ne PAS merger soi-même

### Onglets actifs (Alt+1..9)

| Alt | Onglet | Notes |
|---|---|---|
| Alt+1 | Dashboard | |
| Alt+2 | Transactions | |
| Alt+3 | Budget | Inclut Planification et Abonnements (sous-onglets internes — G22-N3) |
| Alt+4 | Dettes | Ancien Alt+4 était Planning, maintenant fusionné dans Budget |
| Alt+5 | Investments | |
| Alt+6 | Future | Sous-onglet « Explications » (ProjectionExplains — G22-F1) |
| Alt+7 | Retraite | |
| Alt+8 | Impôts | |
| Alt+9 | Assistant | |

Onglets retirés : Planning (fusionné dans Budget — G22-N3), Système (fusionné dans Configuration — G22-N5).

### Architecture clés
- **Entry** : `index.tsx` → `App.tsx` (root) → `Layout.tsx` (sidebar + bottom nav)
- **Routing** : Tab enum dans `types.ts:1`, dispatch via `TabRouter.tsx`
- **State** : `store/useFinanceStore.ts` (Zustand v5 + persist localStorage)
- **State shape** : `AppState` dans `types.ts:638`
- **Projection moteur** : `services/projection.ts` (9 phases mensuelles, 7 scénarios) — voir `docs/PROJECTION.md`
- **Fiscal** : `utils/tax.ts` (barèmes 2026 fédéral + QC + RRQ + RQAP + AE)
- **PDF** : `services/pdfReport.ts` (jspdf lazy)
- **IA** : `services/claude.ts` (Anthropic SDK) — `aiOrchestrator.ts` et `eraContext.ts` supprimés (era retiré)
- **Market data** : `services/marketData/` (façade Finnhub)
- **Backup** : `services/backupAuto.ts` (IndexedDB rolling 7-day) + `services/cloudBackup.ts` (export chiffré)
- **Audit/logs** : `services/errorLogger.ts` + `services/auditLog.ts` (rolling localStorage)

### Composants UI primitives (`components/ui/`)
- `Button`, `Card` (title=h2), `Badge`, `KPIStat`, `PageHeader` (h1), `EmptyState`, `Skeleton`, `Modal` (focus-trap+restore), `Pill`, `Tooltip`, `Toast`, `ConfirmModal`, `CommandPalette` (Cmd+K), etc.

### A11y patterns en place
- `.focus-ring` (72 usages) → `:focus-visible:ring-2 ring-primary`
- `.touch-target` (`min-width/height: 44px`)
- `prefers-reduced-motion` global media query (`index.css`)
- Skip-to-main link (`Layout.tsx:117-123`)
- Modal focus-trap + focus-restore
- 205+ `aria-*` attributes
- WCAG AA tokens (`ink-400` #8896a8, `ink-500` #6a7689)

---

## 7. Docs à lire si besoin de plus

| Doc | Quand le lire |
|---|---|
| **`docs/BACKLOG.md`** | **Source de vérité du restant à faire — à lire EN PREMIER pour savoir où en est le projet** |
| `docs/MANUAL_TEST_CHECKLIST.md` | 131+ tests manuels à exécuter à chaque livraison (sections par onglet) |
| `docs/CENTRALIZED_CALC_PROGRESS.md` | Suivi du refactor "Future = source unique" — Phase 1+2 done, Phase 3 Tier 1+2+3 ✅ |
| `docs/CENTRALIZED_CALC_REFACTOR.md` | Plan stratégique du refactor (5 étapes, calculs KEEP_LOCAL identifiés) |
| `docs/PROJECTION_OUTPUT_SCHEMA.md` | Inventaire exhaustif des champs `lastProjection.chartData[i]` (~50 champs) |
| **`docs/AUTH_SETUP.md`** | **Auth Cloudflare Access — config réelle + journal de debug. À lire si l'accès au site casse** |
| `docs/SECURITY_STRATEGY.md` | Analyse de menace + options auth (Option A = Cloudflare Access, implémentée 2026-05-22) |
| `docs/ARCHITECTURE.md` | Vue exhaustive de la stack, topologie, store, pipeline IA |
| `docs/ARCHITECTURE.md` | Stack détaillé, topologie, store, pipeline IA |
| `docs/PROJECTION.md` | Moteur de projection (9 phases, 7 scénarios, MC) |
| `docs/WIRING_NOTES.md` | Wirings inter-onglets (lastProjection, deep-links) |
| `docs/PLAN_P1.md` | Plan P1 clôturé (référence pour comprendre pourquoi chaque item P1) |
| `docs/PLAN_P2.md` | Plan P2 clôturé (idem pour P2) |
| `docs/adr/` | 7 ADRs structurants (Claude migration, Era pattern, projection split, design system, Future source unique, no-fake, auth Cloudflare Access) |
| `CHANGELOG.md` | Historique versionné cycles 13, 14, 15 |

---

## 8. Recommandations immédiates pour le prochain Claude

### Si l'user veut continuer le sprint
1. **D'abord** : faire valider les 4 items manuels restants (§4 ci-dessus)
   en demandant `AskUserQuestion`. Ne pas coder à l'aveugle si la prod
   n'est pas validée.
2. **Si tout est vert** : proposer P3 plan (refactor Settings le plus
   gros gain) ou Form primitives (compatible avec P3).
3. **Si bugs trouvés** : fixer en priorité avant d'ouvrir un nouveau chantier.

### Si l'user veut une feature précise
1. Lire `docs/ARCHITECTURE.md` pour comprendre la stack et la topologie
2. Identifier le composant/service à toucher via `grep`/`find` (pas Read en aveugle)
3. Suivre le workflow Git de la section 6
4. Toujours respecter les 5 contraintes cardinales (§2)

### Sources potentielles d'erreur connues
- **vitest v4** (PR #98 dependabot) : `environmentMatchGlobs` retiré. Le `vitest.config.ts` utilise déjà `environment: 'jsdom'` globalement. Ne pas re-rajouter `environmentMatchGlobs`.
- **CI race condition** (Tests + Build duplicate runs) : push+PR sync déclenchent 2 jobs concurrents qui se battent sur npm install. Faux-positif si un fail en <60s — re-run le job ou merger quand même.
- **Recharts canvas warnings** dans tests : `HTMLCanvasElement.getContext` non implémenté dans jsdom. Ce sont des warnings, pas des échecs.

### Anti-patterns à éviter
- ❌ Ré-introduire Google Sheet / docs.google.com / fetchPortfolioHistory CSV
- ❌ Pré-remplir INITIAL_USERS avec des noms / salaires non-vides
- ❌ Push à `main` directement
- ❌ Merger ses propres PRs
- ❌ Ajouter une dépendance payante / SaaS récurrent
- ❌ Toucher au workflow `.github/workflows/ci.yml` sans précaution
  (vitest v4 incident — lighthouse a son propre workflow isolé pour ça)
- ❌ Rewrite massif sans plan (cycle 14 = plan P1 d'abord puis exécution)

---

## 9. Contact / contexte user

- **GitHub** : MoKarade
- **Email** : marc.richard4@gmail.com
- **Localisation** : Québec, Canada (l'app cible fiscalité QC/CA)
- **Langue** : français (FR uniquement depuis le cycle A — EN retiré)
- **Style** : direct, méthodique, valide en prod après merge, merge rapide
- **Préférence** : 1 PR par item, draft par défaut, descriptions PR détaillées
- **Test environnement** : hubperso.com (prod Vercel)

---

## 10. Mantra

> **Plan avant code. Tests avant push. Draft PR avant merge. User valide en prod.**

Si tu lis ça, prends 5 min pour relire les contraintes cardinales (§2) avant
de commencer. C'est la différence entre une session productive et un rollback.

Bonne session 👋
