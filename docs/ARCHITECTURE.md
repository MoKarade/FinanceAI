# FinanceAI — Architecture (2026-05)

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
| State | Zustand 5 + `persist` middleware | Schema versionné (v1 → v3), migrations en code |
| Charts | Recharts 2 | Bundle dédié `recharts-*.js` (~445 KB) |
| IA | `@anthropic-ai/sdk` (client-side) | `dangerouslyAllowBrowser: true` |
| Banque | Era Context REST API | Bearer token utilisateur, cache TTL 1h |
| Tests | Vitest + React Testing Library | 225 tests, 24 fichiers |
| Hébergement | Vercel (auto) + GitHub Pages (workflow) | Preview par PR |

Pas de backend. L'app vit côté navigateur, persiste localement via `persist`,
et appelle deux APIs tierces (Anthropic, Era Context) directement depuis le
client. Pas de session serveur, pas de base de données.

---

## 2. Topologie du code

```
FinanceAI/
├── App.tsx                  Point d'entrée React (Layout + TabRouter)
├── components/              UI React, 1 composant ≈ 1 onglet/page
│   ├── ui/                  Primitives (Button, Card, KPIStat, …)
│   ├── projection/          Sous-composants FutureProjection
│   ├── dashboard/           EraContextInsights
│   ├── investments/         DividendPanel
│   ├── budget/              BudgetGroupTable, BudgetAiModal
│   ├── realestate/          PropertyConfigurator, MultiPropertyComparison
│   ├── settings/            BackupPanel
│   └── retirement/          AssetLocationCard, GoalSeekerCard
├── services/                Logique métier pure (testable, sans React)
│   ├── projection.ts        Orchestrateur (1111 lignes)
│   ├── projection/          31 sous-modules (split Phase 3)
│   ├── projection.worker.ts Worker MC
│   ├── claude.ts            Wrapper Anthropic SDK
│   ├── eraContext.ts        Wrapper REST Era Context
│   ├── aiOrchestrator.ts    Compositeur Era + Claude
│   ├── tax.ts               Calcul impôt QC/Fed
│   ├── portfolio.ts         Historique CSV portfolio
│   ├── realEstate.ts        Amortissement hypothèque
│   └── …                    finance, lunchMoney, macroApi, pdfReport, cloudBackup
├── store/
│   └── useFinanceStore.ts   Zustand store unique (schema v3, persist)
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
  apiKeys: {                     // schema v3 — gemini supprimé
    eraContext: string;
    anthropic: string;
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

## 5. IA — pipeline composé

```
User input ──► AiAssistant.tsx
                 │
                 ├─ Si message commence par "remember:" / "souviens-toi:"
                 │    └─► aiOrchestrator.maybeRememberFromMessage()
                 │         └─► eraContext.rememberFact()    [persiste côté Era]
                 │
                 ├─ Sinon :
                 │    └─► aiOrchestrator.buildEnrichedContext(eraToken)
                 │         ├─ Promise.all en parallèle :
                 │         │  ├─ eraContext.getCashFlow()
                 │         │  ├─ eraContext.analyzeSpending()
                 │         │  ├─ eraContext.forecastSpending()
                 │         │  └─ eraContext.recallHistory()
                 │         └─ Format pour system prompt Claude
                 │
                 └─► claude.chatStream(messages, apiKey, { system: enriched })
                      └─ Anthropic SDK (model: claude-sonnet-4-6)
                         └─ Stream chunks → UI
```

**Séparation des modèles** :
- `claude-sonnet-4-6` — chat, analyses budget, suggestions Planning, vision payslip
- `claude-haiku-4-5` — catégorisation batch transactions (volume + vitesse)

**Cache** : `services/eraContext.ts` cache les requêtes pendant 1h en mémoire
(Map). Évite les hits réseau répétés (ex: ouvrir/fermer Dashboard).

---

## 6. Tests

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

**225/225 tests verts** au 2026-05. Tous les scénarios MC, les helpers de
projection, les primitives UI et les migrations de store sont couverts.

---

## 7. Décisions clés (voir aussi `docs/adr/`)

- **ADR-001** : Migration Gemini → Claude Anthropic
- **ADR-002** : Era Context comme moteur de qualité (insights + categorizer)
- **ADR-003** : Projection.ts split en 31 sous-modules
- **ADR-004** : Design system primitives custom (vs shadcn/Radix)

---

## 8. Workflow contributeur

```bash
npm install
npm run dev        # localhost:3000
npm run typecheck  # tsc --noEmit, doit rester clean
npm test           # vitest, doit rester 225/225
npm run build      # vérifie le bundle prod
```

Toutes les PR doivent passer **typecheck + tests + build**. Le pipeline CI
(`.github/workflows/`) tourne automatiquement à chaque push.

---

## 9. Pour aller plus loin

- [HANDOVER.md](HANDOVER.md) — vue d'ensemble + roadmap + recommandations (lire en premier)
- [PROJECTION.md](PROJECTION.md) — détail du moteur de projection (9 phases mensuelles, scénarios, MC)
- [WIRING_NOTES.md](WIRING_NOTES.md) — wirings inter-onglets, `lastProjection`, deep-links
- [adr/](adr/) — Architecture Decision Records (décisions structurantes)
