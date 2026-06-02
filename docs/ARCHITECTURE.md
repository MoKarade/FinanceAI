# FinanceAI — Architecture (màj 2026-06)

> Vue d'ensemble destinée aux nouveaux contributeurs (humains ou agents).
> Pour le détail du moteur de projection, voir [PROJECTION.md](PROJECTION.md).
> Pour les wirings inter-onglets, voir [WIRING_NOTES.md](WIRING_NOTES.md).

---

## 1. Stack technique

| Couche | Technologie | Notes |
|---|---|---|
| UI | React 19 + TypeScript (strict) | `noImplicitAny`, `strictNullChecks`, `useUnknownInCatchVariables` |
| Bundler | Vite 6 | esbuild en dev, Rollup pour le bundle prod, source-maps activées |
| Styling | Tailwind CSS + index.css | Design tokens custom (couleurs sémantiques, scale typo) |
| State | Zustand 5 + `persist` middleware | Schema versionné (v1 → v7), migrations en code |
| Charts | Recharts 2 | Bundle dédié `recharts-*.js` (~445 KB) |
| IA | `@anthropic-ai/sdk` (client-side) | `dangerouslyAllowBrowser: true` |
| Storage sécurisé | AES-256-GCM IndexedDB | services/secureKeyStore.ts (clé device non-extractible) |
| Import données | CSV universel + Finnhub + CoinGecko | parseBankCsv.ts (100% local) |
| Crypto pricing | CoinGecko REST | Gratuit, sans clé, CORS-friendly |
| Stock/ETF pricing | Finnhub REST | Clé gratuite optionnelle |
| Tests | Vitest + React Testing Library | ~1440 tests, 123 fichiers |
| Auth | Cloudflare Access | Google OAuth, session 24h |
| Hébergement | Vercel (auto) + GitHub Pages (workflow) | Preview par PR |

Pas de backend. L'app vit côté navigateur, persiste localement via `persist`
(chiffré en AES-256 pour les clés API), et appelle des APIs tierces (Anthropic,
Finnhub, CoinGecko) directement depuis le client. Pas de session serveur, pas de
base de données.

---

## 2. Topologie du code

```
FinanceAI/
├── App.tsx                  Point d'entrée React (Layout + TabRouter)
├── components/              UI React, 1 composant ≈ 1 onglet/page
│   ├── ui/                  Primitives (Button, Card, KPIStat, …)
│   ├── projection/          Sous-composants FutureProjection
│   ├── dashboard/           sous-composants Dashboard
│   ├── investments/         DividendPanel
│   ├── budget/              BudgetGroupTable, BudgetAiModal
│   ├── realestate/          PropertyConfigurator, MultiPropertyComparison
│   ├── settings/            BackupPanel, ImportBankStatement
│   └── retirement/          AssetLocationCard, GoalSeekerCard
├── services/                Logique métier pure (testable, sans React)
│   ├── projection.ts        Orchestrateur (~1310 lignes)
│   ├── projection/          31 sous-modules (split Phase 3)
│   ├── projection.worker.ts Worker MC
│   ├── claude.ts            Wrapper Anthropic SDK
│   ├── secureKeyStore.ts    AES-256-GCM + IndexedDB (clé device)
│   ├── tax.ts               Calcul impôt QC/Fed
│   ├── import/              parseBankCsv.ts (CSV universel)
│   ├── marketData/          providers/ coingecko.ts, finnhub.ts (pricing)
│   ├── portfolio.ts         Historique CSV portfolio
│   ├── realEstate.ts        Amortissement hypothèque
│   └── …                    finance, macroApi, pdfReport, cloudBackup
├── store/
│   └── useFinanceStore.ts   Zustand store unique (schema v7, persist)
├── utils/
│   ├── tax.ts               Constantes fiscales (paliers, plafonds)
│   ├── safeNumber.ts        Helper anti-NaN
│   ├── useDebouncedMemo.ts  Hook debounce + memoize
│   ├── useDerivedFinancials.ts Calculs dérivés réutilisables
│   ├── usePendingFocus.ts   Hook deep-link cross-tab (Phase B2)
│   └── transactionParser.ts CSV parser
├── tests/                   Vitest specs
└── docs/                    Plans, audits, architecture
```

Règles structurelles :
- **`services/`** ne **JAMAIS** importer de `components/`. Sens unique
  (`components/ → services/`).
- **`services/projection/*.ts`** ne **JAMAIS** importer de `services/projection.ts`
  (sinon import circulaire). Les types partagés vivent dans
  `services/projection/types.ts`.
- **Composants UI** ne **JAMAIS** appeler une API tierce directement —
  passer par un service.

---

## 3. Modèle de données (store unique)

`store/useFinanceStore.ts` expose **un seul state global** persisté en
`localStorage` :

```ts
{
  config: BudgetConfig;          // utilisateurs, devises, locale
  apiKeys: {                     // gemini + eraContext supprimés (≤ v3) — chiffrées hors persist
    anthropic: string;
    finnhub: string;
  };
  assets: Asset[];
  budgetItems: BudgetCategory[];
  initialBalances: Record<string, number>;
  realEstateGoals, childGoals, travelGoals, lifeEvents, financialGoals,
  savingsGoals, debts, retirementGoal, projection, …
  // Wirings W5.x
  insurancePolicies, vehicleReplacements, majorRenovations,
  charitableGoals, rentalProperties, privateBusinesses,
  // Bridge cross-tabs
  lastProjection: ProjectionResult | null;  // exclu de persist
  pendingFocus: PendingFocus | null;
}
```

### Migrations
- **v1 → v2** : ajout `apiKeys.anthropic` (Phase 4.A1)
- **v2 → v3** : suppression `apiKeys.gemini` (Phase 4.A5)
- **v3 → v4** : ajout `apiKeys.finnhub` (Phase 7.F.5)
- **v4 → v5** : ajout `retirementGoal.lifeExpectancy` (default 90, Phase C.3)
- **v5 → v6** : conversion `dateBought + buyPrice + quantity` → `purchases[]` DCA multi-achat (Phase E.8)
- **v6 → v7** : le mode test n'est plus persisté (bug 2026-05-29 : l'auto-push Drive envoyait les fixtures de test dans le Drive de l'utilisateur)

### Onglets (Tab enum, 18 entries)

Argent : DASHBOARD, TRANSACTIONS, BUDGET, PLANNING, DEBT
Investissement : INVESTMENTS
Plan futur : FUTURE, RETIREMENT
Objectifs : REAL_ESTATE, CHILD, LIFE_PROJECTS (fusion de TRAVEL + LIFE_EVENTS depuis Phase F.12 — les 2 enums anciens forwardent)
Outils : TAX, DOCUMENTS (Phase G.1), DEBT, PLANNING
Système : DATA, SETTINGS (label "Configuration"), SYSTEM, ASSISTANT

### Cross-tab data flow
1. `FutureProjection.tsx` calcule la projection et écrit dans `lastProjection`.
2. Les autres onglets lisent `lastProjection` via `useFinanceStore(s => s.lastProjection)`.
3. Si `lastProjection === null`, chaque consumer fallback sur un calcul local
   simplifié (l'utilisateur n'a pas encore ouvert l'onglet Future dans la
   session).
4. Les badges 🔗 utilisent `navigateWithFocus(tab, section)` qui pose un
   `pendingFocus` consommé au mount du tab cible.

---

## 4. Le moteur de projection (vue topologique)

```
calculateFutureProjection(params)
  │
  ├─ Itère SCENARIO_DEFINITIONS[]                   ← 7 scénarios (Phase 4 #4)
  │    pour chacun :
  │      runScenario(params, strategy, …, stratType)
  │        ├─ setupSimulation.ts                    helpers initialisation
  │        ├─ pour m = 0 .. years*12:
  │        │    └─ 9 phases mensuelles (cf PROJECTION.md §2)
  │        │       ├─ Phase 1: Croissance + chocs
  │        │       ├─ Phase 2: Income + retraite
  │        │       ├─ Phase 3: Évolution immo
  │        │       ├─ Phase 4: Événements stochastiques
  │        │       ├─ Phase 5: Surcoûts conjoncturels
  │        │       ├─ Phase 6: Cash-flow allocation
  │        │       ├─ Phase 7: Impôts mensuels (janvier/avril/décembre)
  │        │       ├─ Phase 8: Latent tax
  │        │       └─ Phase 9: Output mensuel
  │        └─ Retourne ProjectionResult (chartData + métriques)
  │
  ├─ Si runMC=true sur scénario sélectionné :
  │    runMonteCarlo(params, scenarioIdx, 100 iter.)
  │      ├─ Bandes percentiles P10/P50/P90
  │      ├─ Taux de succès (% non zéro à la fin)
  │      ├─ FVI : Indice Vitalité Financière (split 30/30/20/20)
  │      └─ Sequence Risk Metric
  │
  └─ Retourne ProjectionResult avec allResults: ProjectionResult[]
```

Pour les MC longs (3s+ en mode 30 ans × 100 itér.), un **Worker** dédié
(`services/projection.worker.ts`) libère le main thread. Le wrapper
`runProjectionAsync` (`services/projection/runAsync.ts`) gère le cycle de
vie du worker (création, terminaison, replay).

---

## 5. Sourcing des données — pipeline uniformisé

```
Transactions bancaires
  ├─ Import CSV (parseBankCsv.ts) — 100% local, universel
  └─► Zustand + localStorage (chiffré AES-256)

Crypto prices (BTC, ETH, SOL, …)
  ├─ CoinGecko (services/marketData/providers/coingecko.ts)
  ├─ Gratuit, sans clé, CORS-friendly
  └─► Portfolio + Dashboard

Stock/ETF prices (AAPL, VOO, XGRO, …)
  ├─ Finnhub (services/marketData/providers/finnhub.ts)
  ├─ Clé gratuite optionnelle
  └─► Portfolio + Dashboard

API keys (Anthropic, Finnhub)
  ├─ Chiffrées AES-256-GCM (services/secureKeyStore.ts)
  ├─ Clé device IndexedDB (non-extractible)
  └─► Zustand + localStorage chiffré
```

## 6. IA — pipeline composé

```
User input ──► AiAssistant.tsx
                 │
                 └─► claude.chatStream(messages, apiKey, { system: generateContext() })
                      └─ Anthropic SDK (model: claude-sonnet-4-6)
                         └─ Stream chunks → UI
```

**Séparation des modèles** :
- `claude-sonnet-4-6` — chat, analyses budget, suggestions Planning, vision payslip
- `claude-haiku-4-5` — catégorisation batch transactions (volume + vitesse), justifications rééquilibrage, NextBestAction, optimisation fiscale couple, conseils Immobilier (refonte v3.0)

**Services IA exposés** (refonte v3.0, tous gratuits avec clé utilisateur) :
- `chat()` / `chatStream()` — one-shot et streaming Sonnet
- `categorizeBatch()` — catégorisation transactions par lot (Haiku)
- `analyzePayslip()` — Vision IA fiches de paie (Sonnet Vision)
- `detectSubscriptionsAI()` — détection abonnements récurrents (Haiku)
- `getNextBestActions()` — Phase B.3, sidebar widget IA (Haiku, cache 1h localStorage)
- `getRebalanceJustifications()` — Phase E.7, batch justifs Investments (Haiku)
- `getCoupleOptimizationStrategies()` — Phase G.4, Spousal RRSP / pension splitting (Haiku)
- `getRealEstateAdvice()` — Phase F.8, 5 catégories cost/timing/leverage/tax/risk (Haiku)

---

## 7. Tests

```
tests/
├── components/
│   ├── ui/                Tests des primitives (Button, Modal, KPIStat, …)
│   ├── Dashboard.test.tsx
│   ├── Budget.test.tsx
│   ├── GuideModal.test.tsx
│   └── Settings.test.tsx
├── services/
│   ├── projection.test.ts          (47 tests scénarios)
│   ├── projection.helpers.test.ts  (28 tests helpers purs)
│   ├── tax.test.ts
│   └── …
└── store/
    └── useFinanceStore.test.ts
```

**~1440 tests verts** (123 fichiers) au 2026-06. Tous les scénarios MC, les helpers de projection, les primitives UI, les migrations de store, la fiscalité (dont `taxDecember`/`taxJanuary`) et le moteur de sync Drive sont couverts.

---

## 8. Décisions clés (voir aussi `docs/adr/`)

- **ADR-001** : Migration Gemini → Claude Anthropic
- **ADR-002** : ~~Era Context comme moteur de qualité~~ — SUPERSEDED (era est MCP-only, REST API inexistante)
- **ADR-003** : Projection.ts split en 31 sous-modules
- **ADR-004** : Design system primitives custom (vs shadcn/Radix)
- **ADR-005** : Future = source unique pour les calculs projetés
- **ADR-006** : Convention « valeurs réelles ou rien » (no-fake-data)
- **ADR-007** : Authentification Cloudflare Access + Google OAuth
- **ADR-008** : Optimiseur — leviers découplés + adaptateur moteur fin
- **ADR-009** : Calculs fiscaux QC centralisés (crédits 65+, RAMQ, FSS, SRG) + règles immobilières

---

## 9. Workflow contributeur

```bash
npm install
npm run dev        # localhost:3000
npm run typecheck  # tsc --noEmit, doit rester clean
npm test           # vitest, doit rester vert (~1440 tests)
npm run build      # vérifie le bundle prod (vite build --mode production)
```

Toutes les PR doivent passer **typecheck + tests + build**. Le pipeline CI
(`.github/workflows/`) tourne automatiquement à chaque push.

---

## 10. Pour aller plus loin

- [CLAUDE_MEMORY.md](CLAUDE_MEMORY.md) — mémoire de session inter-PC : reprendre vite (lire en premier)
- [SESSION_HANDOVER.md](SESSION_HANDOVER.md) — vue d'ensemble + roadmap + recommandations
- [PROJECTION.md](PROJECTION.md) — détail du moteur de projection (9 phases mensuelles, scénarios, MC)
- [WIRING_NOTES.md](WIRING_NOTES.md) — wirings inter-onglets, `lastProjection`, deep-links
- [adr/](adr/) — Architecture Decision Records (décisions structurantes)
