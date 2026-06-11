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

## Lancer les tests

```bash
npm run test          # Vitest (742 tests, 73 fichiers)
npm run typecheck     # TypeScript strict mode (clean)
npm run build         # Vite (--mode production)
```

Tests manuels : ~195 cas couvrant les onglets actifs — voir
[`docs/HISTORIQUE.md`](docs/HISTORIQUE.md).

## 🎓 Conventions clés

- **Future = source unique** : tout calcul long-terme (FIRE, capital
  retraite, coût enfant lifetime…) vient de `lastProjection.chartData`.
  Voir [`docs/HISTORIQUE.md`](docs/HISTORIQUE.md)
  et [`docs/PROJECTION_OUTPUT_SCHEMA.md`](docs/PROJECTION_OUTPUT_SCHEMA.md).
- **Mode strict** : si la projection n'est pas calculée, les onglets
  affichent `<ProjectionRequired>` au lieu d'inventer des valeurs.
- **No-fake data** : aucune donnée simulée en production. En mode test,
  CSV historique Yahoo Finance réel (104 points hebdo sur 2 ans).
- **Mode test** : bouton dans Configuration → snapshot des vraies données
  + bascule sur fixtures Alex/Sam. Restauration safe au désactivement.

## Raccourcis clavier

| Touche | Action |
|---|---|
| `Alt+1` | Dashboard |
| `Alt+2` | Transactions |
| `Alt+3` | Budget (inclut Planification et Abonnements) |
| `Alt+4` | Dettes |
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
| [`docs/HISTORIQUE.md`](docs/HISTORIQUE.md) | 131 tests manuels par onglet |
| [`docs/HISTORIQUE.md`](docs/HISTORIQUE.md) | Suivi refactor "Future = source unique" |
| [`docs/PROJECTION_OUTPUT_SCHEMA.md`](docs/PROJECTION_OUTPUT_SCHEMA.md) | Schéma exhaustif `chartData[i]` (~50 champs) |
| [`docs/SECURITY_STRATEGY.md`](docs/SECURITY_STRATEGY.md) | Plan auth (Cloudflare Access) |
| [`docs/PROJECTION.md`](docs/PROJECTION.md) | Moteur de projection (9 phases, 7 scénarios, MC) |
| [`CHANGELOG.md`](CHANGELOG.md) | Historique des changements |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Stack détaillée, topologie, store, pipeline IA |
| [`mcp/README.md`](mcp/README.md) | Documentation du serveur MCP (intégration agents IA) |
| [`docs/archive/`](docs/archive/) | Historique des audits et plans de fix passés |

## Architecture (vue rapide)

L'architecture détaillée est maintenue dans [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Résumé :

- Pas de backend. L'app vit côté navigateur, persiste localement (localStorage + IndexedDB chiffré), et appelle Anthropic, Finnhub et CoinGecko directement depuis le client.
- Le moteur de projection (`services/projection.ts` + `services/projection/` — 31 sous-modules) est le coeur de l'app. Voir [`docs/PROJECTION.md`](docs/PROJECTION.md) pour les détails.
- Le state global est Zustand v5 + persist (schema v6 avec migrations v1→v6).
- `services/eraContext.ts` est dormant (MCP-only) — l'UI Era a été retirée.

## 🔐 Sécurité

- ✅ **Pas de secret hardcodé**. Clés via UI seulement (jamais dans `.env` versionné).
- ✅ **apiKeys excluses du localStorage** et des deux formats de backup (JSON clair + chiffré).
- ✅ **Backup chiffré** AES-256-GCM avec PBKDF2 600 000 itérations.
- ✅ **CSP stricte** (`vercel.json` headers + `<meta>` défense-en-profondeur) — aucun domaine LLM tiers résiduel.
- ✅ **Validation Zod** des réponses LLM (anti-prompt injection).
- ✅ **Pas de Google Sheet** — le proxy Sheet legacy a été supprimé (cycle 14). `services/finance.ts` ne fait plus de fetch CSV vers docs.google.com.
- ✅ **No-fake-data** : refus catégorique de mockups en prod.

## 🛠️ Stack

- **Frontend** : React 19.2 + Vite 6 + TypeScript 5.8 strict + Tailwind CSS 3
- **State** : Zustand 5 (avec `persist` + `partialize`, schema v6)
- **Tests** : Vitest 2.1 + @testing-library/react + axe-core (742 tests, 73 fichiers)
- **Validation** : Zod 3
- **Charts** : Recharts (lazy-loaded)
- **Backend** : aucun — 100 % navigateur, déploiement statique **Vercel** (`vercel.json`)
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
- Import CSV portefeuille (Finnhub + import CSV local)
- Rebalancing target (Index/Tech/Industrie/Or/Liquidités)
- ACB suivi pour NonReg
- Cours en temps réel via Finnhub

### **Projection future (★ feature flagship)**
- 7 scénarios pré-calibrés : BASE, LIBERTE_55, HYPER_INFLATION, WINDFALL, ECONOMIC_WINTER, COMPOUND_STRESS, LATE_INHERITANCE
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
