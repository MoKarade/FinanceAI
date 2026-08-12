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
npm run test          # Vitest (3 887 tests, 339 fichiers, mesuré 2026-08-12)
npm run typecheck     # TypeScript strict mode (clean)
npm run build         # Vite 8 (--mode production)
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
| `Alt+1` | Futur (page d'ouverture) |
| `Alt+2` | Transactions |
| `Alt+3` | Budget (inclut Planification et Abonnements) |
| `Alt+4` | Assistant |
| `Alt+5` | Profil |
| `Alt+6` | Investissements |
| `Alt+7` | Retraite |
| `Alt+8` | Impôts |
| `Alt+9` | Réglages |

## 📚 Documentation

| Fichier | Contenu |
|---|---|
| **[`docs/BACKLOG.md`](docs/BACKLOG.md)** | **Source de vérité du restant à faire** — items P0/P1/P2/P3 |
| [`docs/SESSION_HANDOVER.md`](docs/SESSION_HANDOVER.md) | Reprise rapide — état actuel + recommandations |
| [`docs/HISTORIQUE.md`](docs/HISTORIQUE.md) | Archive consolidée : snapshots, audits, designs livrés, ADRs, 131 tests manuels par onglet |
| [`docs/PROJECTION_OUTPUT_SCHEMA.md`](docs/PROJECTION_OUTPUT_SCHEMA.md) | Schéma exhaustif `chartData[i]` (~50 champs) |
| [`docs/PROJECTION.md`](docs/PROJECTION.md) | Moteur de projection (9 phases, 7 scénarios, MC) |
| [`docs/FISCAL_REFERENCE.md`](docs/FISCAL_REFERENCE.md) | Valeurs fiscales sourcées — RRQ, PSV, SRG, paliers, crédits |
| [`CHANGELOG.md`](CHANGELOG.md) | Historique des changements |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Stack détaillée, topologie, store, pipeline IA |
| [`mcp/README.md`](mcp/README.md) | Documentation du serveur MCP (intégration agents IA) |

## Architecture (vue rapide)

L'architecture détaillée est maintenue dans [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Résumé :

- Pas de backend. L'app vit côté navigateur, persiste localement (localStorage + IndexedDB chiffré), et appelle Anthropic, Finnhub et CoinGecko directement depuis le client.
- Le moteur de projection (`services/projection.ts` + `services/projection/` — 48 sous-modules, mesuré 2026-08-12) est le coeur de l'app. Voir [`docs/PROJECTION.md`](docs/PROJECTION.md) pour les détails.
- Le state global est Zustand v5 + persist (schema v7 avec migrations v1→v7).
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

- **Frontend** : React 19.2 + Vite 8 (Rolldown) + TypeScript 5.8 strict + Tailwind CSS 3
- **State** : Zustand 5 (avec `persist` + `partialize`, schema v7 + migrations v1→v7)
- **Tests** : Vitest 4 + @testing-library/react + axe-core (2872 tests, 251 fichiers)
- **Validation** : Zod 3
- **Charts** : Recharts 3 (lazy-loaded)
- **Backend** : aucun — 100 % navigateur, déploiement statique **Vercel** (`vercel.json`)
- **LLM** : Anthropic Claude (Haiku 4.5 + Sonnet 4.6 + Opus 4.8 via `@anthropic-ai/sdk` — choix du modèle par conversation, coût réel CAD)
- **Vision** : Claude Vision pour OCR relevés/paies PDF
- **Data marché** : Finnhub REST API (cours actions + ETF, cache 1h) ; CoinGecko (crypto)
- **Sync** : Google Drive (chiffrement optionnel par passphrase, AES-256-GCM)
- **MCP** : Model Context Protocol server (Node.js)

## 📈 Fonctionnalités clés

### Suivi en temps réel
- Synchronisation transactions Era Context (9 endpoints, AbortController)
- Import OCR relevés/paies PDF (Claude Vision) — extraction montants, dates, catégories
- Reconnaissance auto des catégories (rules + LLM)
- Détection d'abonnements récurrents
- Sync Google Drive bidirectionnelle (données chiffrées optionnellement)

### Budget et goals
- Budget v2 : règle 50/30/20 (Besoins/Envies/Épargne) réel vs théorique
- Mode couple : propriété d'abonnements par personne
- Abonnements épinglés (alertes dépassement)
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
- Retraite per-conjoint : FERR, PSV, RRQ par âge et prénom de chaque conjoint
- Pension DB + RRQ/PSV + SRG avec prorata résidence
- Crédit dons par paliers fédéraux et québécois
- Smile Curve dépenses retraite
- Soins longue durée stochastiques
- Mortalité stochastique
- Perte d'emploi stochastique
- Inflation par poste (panier CPI)
- Withholding tax US sur CELI
- Sequence risk metric
- FVI (Indice de Vitalité Financière)

→ Détails complets dans [`docs/PROJECTION.md`](docs/PROJECTION.md).

### Confidentialité et vie privée
- Mode discret : masquage DOM de tous les montants (toggle dans paramètres)
- Chiffrement local au repos (AES-256-GCM, PBKDF2 600k itérations)
- Clés API exclues des sauvegardes et du localStorage
- Zéro transmission de PII — toutes les données restent dans le navigateur

### Assistant IA
- Chat persisté Claude avec contexte financier complet (tools de lecture/écriture partagés avec le MCP)
- Le chat voit la page affichée : sur Budget, il connaît la période naviguée, les dépenses réelles et cibles de l'écran — « explique-moi ce chiffre » répond sur le chiffre visible, pas un recalcul
- Modèle au choix PAR conversation : Haiku / Sonnet (défaut) / Opus — le choix suit la conversation
- Coût API réel affiché en CAD (par réponse, par conversation, total cumulé) — tokens facturés × tarif
- Onglet dédié avec historique multi-conversations (sync Drive) + pièces jointes (images, PDF, CSV)
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
