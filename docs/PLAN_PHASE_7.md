# Plan Phase 7 — Polish + Data Sourcing

> **Statut** : 🚧 EN COURS — 2026-05-20
> **Origine** : recommandations du `HANDOVER.md` §5.3 (Options A-E) + nouvelle exigence
> data sourcing (sortir d'Excel/hardcodé pour les investissements).
> **Branche** : `claude/analyze-finance-app-CtLvs`
> **Convention** : 1 PR atomique par sous-phase (A.1, A.2, B.1…). Triple validation
> avant push (`typecheck && test && build`). À la fin, ajouter une entrée
> CHANGELOG cycle 8.

---

## Ordre d'attaque

| # | Phase | Effort | Priorité | État |
|---|---|---|---|---|
| 7.A | **Performance** : lazy-load recharts + pdf-vendor + MC perf | 6h | Haute (UX boot mobile 2×) | ⏳ |
| 7.B | **UX** : empty states + skeleton loading + command palette Cmd+K | 12h | Moyenne | ⏳ |
| 7.C | **Robustesse** : test Layout RTL + AbortController Claude | 4h | Moyenne | ⏳ |
| 7.D | **Polish a11y/i18n** : contrast AA + axe CI + i18n compléter | 17h | Basse | ⏳ |
| 7.E | **Cosmétiques fiscaux** : F11 + F12 + F22 (BPA précision, sources unifiées) | 3h | Basse | ⏳ |
| 7.F | **Data sourcing investissements** : sortir d'Excel + market data quotidien | 12-20h | Haute (exigence utilisateur) | ⏳ |

**Total** : ~54-62h estimé. À découper en PRs atomiques.

---

## §7.A — Performance (6h)

### A.1 Lazy-load `recharts` (2h)
- **Problème** : `recharts` = 445 KB (128 KB gzip) chargés sur **toutes** les pages, même celles sans chart (Settings, Onboarding, TaxCenter en mode liste).
- **Action** :
  - Wrapper `React.lazy()` autour des composants chart de Dashboard, FutureProjection, Investments, StockChart.
  - `<Suspense fallback={<ChartSkeleton />}>` pour fallback élégant.
  - Mesurer le gain au `npm run build` : objectif **-100 KB sur first contentful paint**.
- **Risque** : flash visuel au load. Mitigation : skeleton fidèle au chart.
- **Tests** : aucun cassé (chart se rend toujours, juste async).

### A.2 Lazy-load `pdf-vendor` (1h)
- **Problème** : `jspdf` + `html2canvas` = 594 KB (177 KB gzip) chargés **au boot** pour une fonctionnalité utilisée uniquement par 1 bouton dans `TaxCenter`.
- **Action** :
  - Convertir l'import statique de `services/pdfReport.ts` en `await import()` dans la handler du bouton.
  - Loading state pendant le chargement (~500ms en 4G).
- **Risque** : latence au premier clic. Mitigation : pre-fetch quand l'utilisateur ouvre TaxCenter.
- **Gain attendu** : boot mobile 2× plus rapide (le bundle initial perd ~30% de son poids).

### A.3 MC perf — cache `new Date()` (1h)
- **Problème** : audit Top25 #11 — `new Date(year, month, 1)` × 72 000 dans la boucle Monte Carlo (100 itér × 12 mois × 30 ans × 2 instances).
- **Action** :
  - Pré-calculer un tableau de dates pour les 360 mois (`monthsArray[m] = new Date(...)`).
  - Réutiliser dans `runScenario` au lieu de re-créer.
- **Gain attendu** : -10-15% sur durée MC (de ~3s à ~2.5s).

### A.4 Bundle audit + cleanup (2h)
- **Action** :
  - `npm run knip` pour identifier dead exports.
  - Vérifier les imports `lucide-react` (souvent toute la lib pour 5 icônes).
  - Vérifier `framer-motion` usage (importé mais peut-être pas critique).

---

## §7.B — UX (12h)

### B.1 Empty states systématiques (4h)
- **Problème** : 3 pages sur 14+ ont un `<EmptyState>` quand vide. Le reste affiche un container vide ou un message texte brut.
- **Pages cibles** : Transactions, Investments (aucun asset), RealEstate (aucun goal), DebtManager, LifeEvents, Travel, Children, Goals.
- **Action** :
  - Audit page par page : "que se passe-t-il quand la liste est vide ?"
  - Brancher `<EmptyState>` (primitive existante) avec illustration + CTA contextuel.

### B.2 Skeleton loading (3h)
- **Problème** : `.skeleton-box` CSS existe mais utilisé inégalement. Dashboard chart, Investments history, BackupPanel = écrans vides pendant load.
- **Action** :
  - Primitive `<Skeleton>` (Card-shaped, Chart-shaped, List-shaped variants).
  - Brancher dans Dashboard chart, Investments StockChart, BackupPanel restore preview.

### B.3 Command palette Cmd+K (5h)
- **Action** :
  - Composant `<CommandPalette>` modal avec `cmdk` lib (~10KB) ou implémentation maison.
  - Sources : tous les tabs + actions courantes (créer un goal, exporter PDF, switch mode privacy, etc.).
  - Hotkey global Cmd+K / Ctrl+K.
- **Risque** : ajoute une dépendance si on prend `cmdk`. Évaluer fait-maison vs lib.

---

## §7.C — Robustesse (4h)

### C.1 Test Layout RTL (2h)
- **Problème** : `Layout.tsx` n'a aucun test. Skip link, drawer mobile, sidebar groupée, focus management = zones critiques sans coverage.
- **Action** :
  - `tests/components/Layout.test.tsx` avec :
    - Skip link apparait au focus clavier (Tab depuis URL bar)
    - Drawer mobile s'ouvre/ferme correctement
    - Sidebar items répondent à `aria-current="page"` selon `activeTab`
    - Focus retourné après fermeture drawer
  - Mock props minimal (10-15 lignes au plus).

### C.2 AbortController sur Claude (1h)
- **Problème** : `services/claude.ts` n'a pas de timeout/abort sur `chatStream`. Si la connexion gèle, l'UI reste bloquée.
- **Action** :
  - Ajouter `AbortSignal` aux options du SDK Anthropic.
  - Timeout 30s par défaut, configurable.
  - Bouton "Annuler" dans AiAssistant pendant la génération.

### C.3 Zod validation systématique côté Claude (1h)
- **Action** :
  - Audit des consumers Claude : `categorizeBatch`, `analyzePayslip`, `analyzeBudget`, `getInvestmentAdvice`, `generateSmartGoals`.
  - Confirmer que **chaque** retour structuré passe par un schéma Zod.
  - Logger les régressions de modèle (Zod parse error) sans casser l'UI.

---

## §7.D — Polish a11y/i18n (17h)

### D.1 Script contrast AA tokens (3h)
- **Action** :
  - `scripts/check-contrast.ts` qui lit `tailwind.config.js`, calcule WCAG AA pour chaque combinaison `text-{color}` vs `bg-{surface}`.
  - Output : tableau Markdown des combos non-conformes + ratio actuel.
  - Fix des tokens fautifs (probable ajustement des shades les plus claires).

### D.2 axe a11y CI (4h)
- **Action** :
  - Installer `vitest-axe` + `@axe-core/react`.
  - Test `tests/a11y/pages.axe.test.tsx` qui charge Dashboard, FutureProjection, Budget, Settings, Investments — vérifie 0 violation niveau "serious" ou "critical".
  - Ajouter au CI pipeline.

### D.3 i18n compléter (10h)
- **Problème** : 32 clés FR seulement, 257 appels `t()` dans le code → la majorité retournent la fallback string.
- **Action** :
  - `i18next-scanner` config dans `package.json`, génère `locales/fr.json` + `locales/en.json`.
  - Run, review du diff, traduction des nouvelles clés.
  - Brancher `<html lang>` dynamique via `useEffect`.

---

## §7.E — Cosmétiques fiscaux (3h)

### E.1 F11 — Unifier `RRQ_MPE_ESTIMATE` vs `RRQ_MPE` (1h)
- **Problème** : `services/projection/retirementIncome.ts` définit `RRQ_MPE_ESTIMATE = 73200` alors que `utils/tax.ts` exporte `RRQ_MPE = 74900`. Source unique → import depuis `utils/tax.ts`.

### E.2 F12 — Décomposer retenue source REER QC (1h)
- **Problème** : code utilise un taux combiné 21/26/30%. Réalité QC : 5% féd + 14-30% QC selon montant (19% ≤5k, 24% 5k-15k, 29% >15k).
- **Action** : nouvelle fonction `calculateReerWithholding(amount, province)` + test.

### E.3 F22 — Précision décimale BPA (1h)
- **Problème** : BPA fed=16 452$ et QC=18 952$, vs réel 16 444$ et 18 571$ (audit). ~0.5% d'imprécision.
- **Action** : valeurs exactes + indexation depuis les sources officielles ARC/RQ.

---

## §7.F — Data sourcing investissements (12-20h)

### Diagnostic actuel

| Source | Fichier | Contenu | Problème |
|---|---|---|---|
| **Google Sheet CSV** | `services/finance.ts` (`SHEET_ID` hardcodé) | Historique mensuel des soldes portfolio | Source manuelle, mise à jour à la main |
| **Asset metadata hardcodée** | `services/assetMeta.ts` (13 symboles) | sector/region/yield/dividend freq par symbole | Jamais à jour, manque les nouveaux achats |
| **FX rates (Banque du Canada)** | `services/finance.ts` (`fetchFxRates`) | USD/EUR/CAD | ✅ Propre (API officielle, gratuite) |

### Solutions évaluées

| Provider | Tarif | Qualité TSX/CAD | Daily rate limit | Endpoints utiles |
|---|---|---|---|---|
| **Finnhub** ⭐ | Free 60 req/min, illimité bourses majeures + crypto | ✅ TSX + NASDAQ + NYSE + EPA | 60/min | quote, candle (historique), dividend, profile2, recommendation |
| **Twelve Data** | Free 800 req/jour | ✅ TSX | 8 req/min | time_series, dividends, profile, statistics |
| Alpha Vantage | Free 25/jour, 500/mois | ⚠️ Limité | 25/jour | quote, daily, dividend |
| IEX Cloud | Paid $9-49/mo | ❌ US seulement | — | — |
| Polygon.io | Paid $29-99/mo | ⚠️ US focus, TSX premium | — | — |
| Yahoo Finance (RapidAPI) | Free 100/jour, fiabilité aléatoire | ✅ | 100/jour | quote, historical |

**Recommandation** : **Finnhub** (free tier généreux + qualité TSX).

### Implementation proposée

```
services/marketData/
├── index.ts                  Façade unique : getQuote, getHistory, getDividend, getProfile
├── providers/
│   ├── finnhub.ts            Wrapper REST Finnhub avec rate limit + cache
│   ├── bankOfCanada.ts       FX rates (déjà existant, à déplacer ici)
│   └── googleSheet.ts        Fallback legacy (lecture seule, deprecated)
├── types.ts                  Quote, HistoryPoint, AssetProfile, Dividend
└── cache.ts                  LocalStorage TTL 4h pour les quotes, 24h pour le profil
```

**Migration** :
1. **F.1 Façade `services/marketData/`** (4h) : abstraction provider-agnostic, tests unitaires, cache TTL.
2. **F.2 Wrapper Finnhub** (3h) : `getQuote`, `getHistory(symbol, from, to)`, `getDividend`, `getProfile`. API key via `apiKeys.finnhub` ajouté au store (schema v4).
3. **F.3 Auto-populate `assetMeta`** (3h) : au lieu de hardcoder, fetch `profile2(symbol)` → sector/region/yield/freq automatiquement. Cache local 24h.
4. **F.4 Replace Google Sheet par computed history** (4h) : `services/portfolioHistory.ts` qui reconstruit l'historique à partir des transactions + quotes Finnhub. Le Sheet devient une option d'export/backup, pas une source.
5. **F.5 UI Settings** (2h) : champ "Finnhub API key" dans Settings + Onboarding (similaire à anthropic key).
6. **F.6 Migration progressive** (1h) : flag `useFinnhub: boolean` dans store. Default off → user opt-in. Une fois éprouvé, default on dans une release future.

**Risques** :
- Rate limit 60/min : pour 50 symboles, refresh complet = 50 calls. Acceptable avec cache 4h.
- API key user-side : même pattern que Anthropic, acceptable mono-user.
- Symboles TSX particuliers : Finnhub utilise `XXX.TO` format. Migration assetMeta keys nécessaire.

**Plus tard (out of scope §7.F)** :
- Brokerage API integration (Wealthsimple/Questrade) pour récupérer **automatiquement** les positions, plus besoin d'éditer assets manuellement.
- Webhook ou polling pour refresh quotidien automatique (cron-like via worker).

---

## Convention par PR

1. **Branche unique** : `claude/analyze-finance-app-CtLvs` (continuité avec le reste).
2. **PRs atomiques** : 1 PR par sous-phase (A.1, A.2, B.1, …). Body de PR cite la section de ce plan.
3. **Tests** : ≥ 1 test ajouté/touché par PR significatif.
4. **Triple validation** : `npm run typecheck && npm test -- --run && npm run build` avant push.
5. **CHANGELOG** : entrée cycle 8 enrichie au fil des PRs (cf cycle 7 comme modèle).
6. **HANDOVER** : §1 + §3 + §4 mis à jour à la fin de chaque sous-phase.

---

## Tracking d'avancement

| PR | Sous-phase | Statut | Notes |
|---|---|---|---|
| TBD | A.1 lazy recharts | ✅ | DashboardEvolutionChart extrait + React.lazy. Recharts hors du critical path au boot. |
| (déjà fait) | A.2 lazy pdf-vendor | ✅ | Déjà en place : `await import('./services/pdfReport')` dans App.tsx:305-306 depuis Phase 3E. |
| TBD | A.3 MC perf cache Date | ✅ | `loopDates[]` pré-calculé hors boucle. ~504k allocations Date/calculateFutureProjection() → N (years*12+1). |
| TBD | A.4 bundle cleanup | ✅ | knip → delete lunchMoney.ts + macroApi.ts (266L) + html2canvas (unused, pdf-vendor -203KB) |
| TBD | B.1 empty states | ✅ | EmptyState branché : Transactions (main list mobile), DebtManager, Travel, LifeEvents. Pattern unifié. |
| TBD | B.2 skeletons | ✅ | Primitive Skeleton + SkeletonList (variants text/rect/circle/chart/kpi/list-row, role="status"/aria-busy). Dashboard chart Suspense fallback + Investments isLoading branchés. 6 tests RTL. |
| TBD | B.3 Cmd+K palette | ✅ | Impl maison (pas de cmdk lib) ~200L. Cmd/Ctrl+K global. 17 actions nav + 3 actions (privacy, guide, refresh). Filter par label/group/keywords. ↑↓/Enter/Esc + click outside. 7 tests RTL. |
| TBD | C.1 Layout test RTL | ✅ | 7 tests : children render, skip link href #main, main#main tabIndex, refresh btn, privacy toggle aria-pressed (desktop+mobile), aria-current="page", nav mobile aria-label. |
| TBD | C.2 AbortController Claude | ✅ | makeTimeoutSignal helper (combine signal externe + timeout 30s default) sur chat() + chatStream(). AiAssistant : bouton "Annuler" (⏹) en lieu de l'icône envoi quand isLoading. |
| (déjà fait) | C.3 Zod systématique | ✅ | Audit : 5/5 consumers structurés (categorize, subscriptions, smartGoals, budgetAnalysis, payslip) utilisent `safeJsonValidate` qui wrappe Zod parse + try/catch + warn log + null fallback. |
| — | D.1 contrast script | ⏳ | — |
| — | D.2 axe CI | ⏳ | — |
| — | D.3 i18n compléter | ⏳ | — |
| — | E.1 F11 RRQ_MPE unifié | ⏳ | — |
| — | E.2 F12 retenue REER décomposée | ⏳ | — |
| — | E.3 F22 BPA précision | ⏳ | — |
| — | F.1 Façade marketData | ⏳ | — |
| — | F.2 Provider Finnhub | ⏳ | — |
| — | F.3 Auto-populate assetMeta | ⏳ | — |
| — | F.4 Computed portfolio history | ⏳ | — |
| — | F.5 UI Settings Finnhub key | ⏳ | — |
| — | F.6 Migration progressive flag | ⏳ | — |

---

> **Lecture conseillée** avant de commencer : `docs/HANDOVER.md` §5 + ce plan
> en entier. Le découpage est volontairement granulaire pour éviter les
> mega-PRs et garder chaque review courte.
