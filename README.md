<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# FinanceAI

Application personnelle de planification financière complète : suivi en temps réel, projections fiscales canadiennes (ARC + Revenu Québec), simulation Monte Carlo de la retraite, assistant IA (Claude).

## 🚀 Lancer localement

**Prérequis** : Node.js ≥ 18

```bash
npm install
# Mettre ANTHROPIC_API_KEY dans .env.local (optionnel — assistant IA)
# Mettre ERA_CONTEXT_TOKEN dans .env.local (optionnel — synchronisation transactions)
npm run dev
```

Build de production :
```bash
npm run build
npm run preview
```

## 🧪 Tests et qualité

```bash
npm run test          # Vitest (596 tests, 52 fichiers)
npm run typecheck     # TypeScript strict mode (clean)
npm run build         # Vite (--mode production)
```

Tests manuels : 131 cas couvrant 17 onglets — voir
[`docs/MANUAL_TEST_CHECKLIST.md`](docs/MANUAL_TEST_CHECKLIST.md).

## 🎓 Conventions clés

- **Future = source unique** : tout calcul long-terme (FIRE, capital
  retraite, coût enfant lifetime…) vient de `lastProjection.chartData`.
  Voir [`docs/CENTRALIZED_CALC_PROGRESS.md`](docs/CENTRALIZED_CALC_PROGRESS.md)
  et [`docs/PROJECTION_OUTPUT_SCHEMA.md`](docs/PROJECTION_OUTPUT_SCHEMA.md).
- **Mode strict** : si la projection n'est pas calculée, les onglets
  affichent `<ProjectionRequired>` au lieu d'inventer des valeurs.
- **No-fake data** : aucune donnée simulée en production. En mode test,
  CSV historique Yahoo Finance réel (104 points hebdo sur 2 ans).
- **Mode test** : bouton dans Configuration → snapshot des vraies données
  + bascule sur fixtures Alex/Sam. Restauration safe au désactivement.

## ⌨️ Raccourcis clavier

| Touche | Action |
|---|---|
| `Alt+1` | Dashboard |
| `Alt+2` | Transactions |
| `Alt+3` | Budget |
| `Alt+4` | Planning |
| `Alt+5` | Investments |
| `Alt+6` | Future |
| `Alt+7` | Retraite |
| `Alt+8` | Impôts |
| `Alt+9` | Assistant |

## 📚 Documentation

| Fichier | Contenu |
|---|---|
| **[`docs/BACKLOG.md`](docs/BACKLOG.md)** | **Source de vérité du restant à faire** — items P0/P1/P2/P3 |
| [`docs/SESSION_HANDOVER.md`](docs/SESSION_HANDOVER.md) | Reprise rapide — état actuel + recommandations |
| [`docs/MANUAL_TEST_CHECKLIST.md`](docs/MANUAL_TEST_CHECKLIST.md) | 131 tests manuels par onglet |
| [`docs/CENTRALIZED_CALC_PROGRESS.md`](docs/CENTRALIZED_CALC_PROGRESS.md) | Suivi refactor "Future = source unique" |
| [`docs/PROJECTION_OUTPUT_SCHEMA.md`](docs/PROJECTION_OUTPUT_SCHEMA.md) | Schéma exhaustif `chartData[i]` (~50 champs) |
| [`docs/SECURITY_STRATEGY.md`](docs/SECURITY_STRATEGY.md) | Plan auth (Cloudflare Access) |
| [`docs/PROJECTION.md`](docs/PROJECTION.md) | Moteur de projection (9 phases, 7 scénarios, MC) |
| [`CHANGELOG.md`](CHANGELOG.md) | Historique des changements |
| [`docs/HANDOVER.md`](docs/HANDOVER.md) | Guide de reprise — architecture, décisions, dette technique |
| [`mcp/README.md`](mcp/README.md) | Documentation du serveur MCP (intégration agents IA) |
| [`docs/archive/`](docs/archive/) | Historique des audits et plans de fix passés |

## 🏗️ Architecture (vue rapide)

```
FinanceAI/
├── App.tsx                      — orchestrateur (tabs, sync, ErrorBoundary)
├── store/useFinanceStore.ts     — Zustand v5 + persist v4 (apiKeys exclus du storage)
├── services/
│   ├── projection.ts            — moteur Monte Carlo (2 200+ lignes) ★
│   ├── projection/              — split en 8 modules (taxJanuary, taxDecember…)
│   ├── aiOrchestrator.ts        — orchestrateur Claude (Sonnet 4.6 + Haiku 4.5)
│   ├── claude.ts                — client Anthropic SDK (streaming + abort)
│   ├── eraContext.ts            — adapter API Era Context (9 endpoints, cache 1h)
│   ├── marketData/              — façade Finnhub (cache, types, provider)
│   ├── finance.ts               — CSV portfolio via Netlify proxy
│   └── cloudBackup.ts           — backup chiffré AES-256-GCM (apiKeys exclues)
├── utils/
│   ├── tax.ts                   — barèmes fiscaux 2026 (ARC + QC)
│   └── safeNumber.ts            — protection NaN/Infinity
├── components/
│   ├── ui/                      — primitives (Modal, Toast, Skeleton, CommandPalette…)
│   └── settings/BackupPanel.tsx — import/export JSON + chiffré
├── tests/                       — Vitest 2.1 (388 tests, jsdom + axe-core)
└── mcp/                         — Model Context Protocol server
```

## 🔐 Sécurité

- ✅ **Pas de secret hardcodé**. Clés via UI seulement (jamais dans `.env` versionné).
- ✅ **apiKeys excluses du localStorage** et des deux formats de backup (JSON clair + chiffré).
- ✅ **Backup chiffré** AES-256-GCM avec PBKDF2 600 000 itérations.
- ✅ **CSP stricte** (Netlify + `<meta>` pour GitHub Pages) — aucun domaine LLM tiers résiduel.
- ✅ **Validation Zod** des réponses LLM (anti-prompt injection).
- ✅ **SSRF-safe proxy** Netlify (SHEET_ID hardcodé côté serveur).
- ✅ **No-fake-data** : refus catégorique de mockups en prod.

## 🛠️ Stack

- **Frontend** : React 19.2 + Vite 6 + TypeScript 5.8 strict + Tailwind CSS 3
- **State** : Zustand 5 (avec `persist` + `partialize`, schema v4)
- **Tests** : Vitest 2.1 + @testing-library/react + axe-core (388 tests)
- **Validation** : Zod 3
- **Charts** : Recharts (lazy-loaded)
- **Backend** : Netlify Functions v2 (Web Standard Request/Response)
- **LLM** : Anthropic Claude (Sonnet 4.6 + Haiku 4.5 via `@anthropic-ai/sdk`)
- **Data marché** : Finnhub REST API (cours actions + ETF, cache 1h)
- **MCP** : Model Context Protocol server (Node.js)

## 📈 Fonctionnalités clés

### Suivi en temps réel
- Synchronisation transactions Era Context (9 endpoints, AbortController)
- Reconnaissance auto des catégories (rules + LLM)
- Détection d'abonnements récurrents

### Budget et goals
- Catégories budgétaires hiérarchiques
- Goals SMART avec suggestion LLM
- Visualisation de la marge mensuelle

### Investissements
- Import CSV portefeuille (Google Sheets via proxy)
- Rebalancing target (Index/Tech/Industrie/Or/Liquidités)
- ACB suivi pour NonReg
- Cours en temps réel via Finnhub

### **Projection future (★ feature flagship)**
- 7 scénarios pré-calibrés : BASE, LIBERTE_55, HYPER_INFLATION, WINDFALL, ECONOMIC_WINTER, CONSERVATIVE_SAVER, AGGRESSIVE_GROWTH
- Monte Carlo 100 itérations (déterministe via PRNG seedé)
- Pension DB + RRQ/PSV + SRG avec prorata résidence
- Smile Curve dépenses retraite
- Soins longue durée stochastiques
- Mortalité stochastique
- Perte d'emploi stochastique
- Inflation par poste (panier CPI)
- Withholding tax US sur CELI
- Sequence risk metric
- FVI (Indice de Vitalité Financière)

→ Détails complets dans [`docs/PROJECTION.md`](docs/PROJECTION.md).

### Assistant IA
- Chat persisté Claude (Sonnet 4.6) avec contexte financier complet
- Haiku 4.5 pour les tâches rapides (catégorisation, suggestions)
- Réponses streamées avec bouton annulation
- Privacy : aucune PII envoyée

### Accessibilité
- Contraste WCAG AA vérifié (script `scripts/check-contrast.ts`)
- Tests axe-core automatisés (29 cas)
- Command Palette (Cmd+K) pour navigation clavier
- Skeleton loaders pour les états de chargement

## 📜 Licence

Personnel — usage privé. Pas de redistribution.
