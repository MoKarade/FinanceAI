# SESSION HANDOVER — pour le prochain Claude

> **À lire EN PREMIER si tu reprends FinanceAI.** Ce document remplace
> la lecture séquentielle de tous les autres. Pointeurs vers les détails
> à la fin.
>
> Dernière session : 2026-05-25 — **État production final** :
> - Cloudflare Access activé (login Google, session 24h) ✅
> - Clés API chiffrées AES-256-GCM (services/secureKeyStore.ts) ✅
> - Import CSV universel (100% local, parseBankCsv.ts) ✅
> - Crypto pricing CoinGecko + Stock pricing Finnhub ✅
> - Era integration dormante (MCP-only, UI retirée) ✅
> Voir [AUTH_SETUP.md](AUTH_SETUP.md), [SECURITY_STRATEGY.md](SECURITY_STRATEGY.md). Tests 573/573 verts.
>
> Session précédente : 2026-05-21 (cycles 17-18) — **mode test complet** +
> **mode strict centralisation calculs** (Future = source unique).
> Tests 573 → **596 verts**. App live sur https://www.hubperso.com.
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
| **Tests** | **573/573 verts** (51 fichiers, ~30s en local) |
| **Typecheck** | Clean en mode strict |
| **Build** | OK — bundle index ~528 KB gzip ~166 KB (vendor jspdf 391 KB lazy) |
| **Schema store** | v6 (Zustand persist avec migrations v1→v6) |
| **Stack IA** | `@anthropic-ai/sdk` (Sonnet 4.6 + Haiku 4.5) — Gemini retiré |
| **Banque** | CSV universel (100% local, parseBankCsv.ts) — Era Context MCP-only (UI retirée) |
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
npm test             # vitest, doit rester 573/573
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

### Architecture clés
- **Entry** : `index.tsx` → `App.tsx` (root) → `Layout.tsx` (sidebar + bottom nav)
- **Routing** : Tab enum dans `types.ts:1`, dispatch via `TabRouter.tsx`
- **State** : `store/useFinanceStore.ts` (Zustand v5 + persist localStorage)
- **State shape** : `AppState` dans `types.ts:638`
- **Projection moteur** : `services/projection.ts` (9 phases mensuelles, 7 scénarios) — voir `docs/PROJECTION.md`
- **Fiscal** : `utils/tax.ts` (barèmes 2026 fédéral + QC + RRQ + RQAP + AE)
- **PDF** : `services/pdfReport.ts` (jspdf lazy)
- **IA** : `services/claude.ts` (Anthropic SDK) + `services/aiOrchestrator.ts`
- **Era Context** : `services/eraContext.ts` (9 endpoints + cache TTL 1h)
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
| `docs/HANDOVER.md` | Vue exhaustive du projet, historique complet PRs analysées |
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
1. Lire `docs/HANDOVER.md` §1-2 pour comprendre le projet
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
