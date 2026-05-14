<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# FinanceAI

Application personnelle de planification financière complète : suivi en temps réel, projections fiscales canadiennes (ARC + Revenu Québec), simulation Monte Carlo de la retraite, assistant IA.

## 🚀 Lancer localement

**Prérequis** : Node.js ≥ 18

```bash
npm install
# Mettre GEMINI_API_KEY dans .env.local
npm run dev
```

Build de production :
```bash
npm run build
npm run preview
```

## 🧪 Tests et qualité

```bash
npm run test          # Vitest (115 tests)
npm run typecheck     # TypeScript strict mode
npm run build         # Vite + tsc
```

## 📚 Documentation

| Fichier | Contenu |
|---|---|
| [`docs/PROJECTION.md`](docs/PROJECTION.md) | **Documentation détaillée du moteur de projection future** — 9 phases mensuelles, calendrier fiscal, calculs RRQ/PSV/DB, Monte Carlo, FVI, sequence risk |
| [`CHANGELOG.md`](CHANGELOG.md) | Historique des changements |
| [`mcp/README.md`](mcp/README.md) | Documentation du serveur MCP (intégration agents IA) |
| [`docs/archive/`](docs/archive/) | Historique des audits et plans de fix passés |

## 🏗️ Architecture (vue rapide)

```
FinanceAI/
├── App.tsx                  — orchestrateur (tabs, sync, ErrorBoundary)
├── store/useFinanceStore.ts — Zustand + persist (apiKeys exclus)
├── services/
│   ├── projection.ts        — moteur Monte Carlo (1900+ lignes) ★
│   ├── projection/helpers.ts— PRNG, Box-Muller, tables (RRIF, mortalité, LTC)
│   ├── eraContext.ts        — adapter pour API Era Context (transactions, comptes)
│   ├── finance.ts           — CSV portfolio via Netlify proxy
│   ├── gemini.ts            — LLM (Zod validation des réponses)
│   └── cloudBackup.ts       — backup chiffré AES-256-GCM
├── utils/
│   ├── tax.ts               — barèmes fiscaux 2026 (ARC + QC)
│   └── safeNumber.ts        — protection NaN/Infinity
├── components/              — React + Tailwind
├── tests/                   — Vitest (115 tests)
└── mcp/                     — Model Context Protocol server
```

## 🔐 Sécurité

- ✅ **Pas de secret hardcodé**. Toutes les clés via `.env` (ignoré par Git).
- ✅ **Backup chiffré** AES-256-GCM avec PBKDF2 600 000 itérations.
- ✅ **CSP stricte** (Netlify).
- ✅ **Validation Zod** des réponses LLM (anti-prompt injection).
- ✅ **SSRF-safe proxy** Netlify (SHEET_ID hardcodé côté serveur).
- ✅ **No-fake-data** : refus catégorique de mockups en prod.

## 🛠️ Stack

- **Frontend** : React 19.2 + Vite 6 + TypeScript 5.8 strict + Tailwind
- **State** : Zustand 5 (avec `persist` + `partialize`)
- **Tests** : Vitest 2.1
- **Validation** : Zod 3
- **Charts** : Recharts
- **Backend** : Netlify Functions v2 (Web Standard Request/Response)
- **LLM** : Google Gemini API
- **MCP** : Model Context Protocol server (Node.js)

## 📈 Fonctionnalités clés

### Suivi en temps réel
- Synchronisation transactions Era Context
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

### **Projection future (★ feature flagship)**
- 5 scénarios pré-calibrés : BASE, LIBERTE_55, HYPER_INFLATION, WINDFALL, ECONOMIC_WINTER
- Monte Carlo 100 itérations (déterministe via PRNG seedé)
- Pension DB + RRQ/PSV avec prorata résidence
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
- Chat persisté Gemini avec contexte financier
- Réponses validées Zod
- Privacy : aucune PII envoyée

## 📜 Licence

Personnel — usage privé. Pas de redistribution.
