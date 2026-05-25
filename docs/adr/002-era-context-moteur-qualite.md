# ADR-002 : Era Context comme moteur de qualité IA

**Date** : 2026-05
**Statut** : ⚠️ SUPERSEDED EN PRATIQUE (2026-05-25)

> **Résumé du changement** : Era Context était prévu comme source de données
> principale (transactions, cash-flow, analyses). En production, seule la
> fonctionnalité **MCP** (Model Context Protocol) est utilisée. L'intégration
> REST vers l'app FinanceAI a été **retirée de l'UI** (non-callable depuis
> le navigateur, pas d'API CORS sur `api.era.app`). Les données proviennent
> désormais d'**import CSV local** (parseBankCsv.ts), **CoinGecko** (crypto),
> et **Finnhub** (stocks/ETF). Le code backend `services/eraContext.ts`
> demeure **dormant** mais fonctionnel pour une future réactivation.

## Contexte original

Avant la Phase 4.B, l'app appelait Claude **directement** pour chaque
question utilisateur — sans contexte enrichi. Le system prompt contenait
seulement un dump du store Zustand (`generateContext()`). Conséquences :
- Claude ne voyait pas les transactions réelles (juste les agrégats)
- Pas de mémoire entre sessions (chaque conversation repartait à zéro)
- La catégorisation batch envoyait **toutes** les transactions à Haiku
- Anomalies de dépenses invisibles jusqu'à détection manuelle

Era Context (api.era.app) exposait une API d'insights pré-calculés et de
mémoire persistante. Au départ : intégration REST promise.

## Évolution réelle (2026-05-25)

**Obstacle découvert** (sondé le 2026-05-25) : `api.era.app` n'est pas callable
depuis un navigateur (SPA). Le préflight OPTIONS répond `204` **sans aucun en-tête
`Access-Control-Allow-Origin`**, et `GET /v1/transactions` répond `404` même sans
auth. Le navigateur bloque donc l'appel → « Failed to fetch ». era est en réalité
**MCP-first** (pas d'API REST publique pour une web-app).

**Solution** : Era a proposé une intégration **MCP** (Model Context Protocol)
pour Claude / agents locaux. Cette approche est **orthogonale** à l'app web FinanceAI.
Le MCP permet à Claude (en CLI ou agent standalone) d'accéder aux données Era
via une socket locale, **sans passer par le navigateur**.

**Conséquence** : l'UI FinanceAI a **retiré** :
- Champ "Era Context Token" (Configuration)
- Appels REST eraContext.getCashFlow(), analyzeSpending(), etc.
- Dépendance à une API tierce dans l'app web

**Nouveau flux de données** (2026-05-25+) :
```
User imports CSV locally (Configuration → Import CSV)
  → parseBankCsv.ts (100% local)
  → Zustand store
  → localStorage (chiffré AES-256-GCM)
  → Claude voit les transactions via store dump (pas d'API tierce)

User asks Claude AI question (Assistant tab)
  → buildEnrichedContext() utilise les données du store LOCAL
  → No Era API call
  → No token required

Future : Era.app MCP (Claude agent standalone)
  → Claude-agent peut appeler Era pour insights + memory
  → But: agent-local processing, NOT web-app

## Décision originale (2026-05) — Révisée (2026-05-25)

### Original : Era Context comme moteur de qualité

**Proposition** : Era Context devient la source de données principal (via REST API).

**Obstacle découvert** : `api.era.app` n'a **jamais supporté CORS**. Les appels REST
depuis le navigateur = 403 systématique.

### Pivot vers Local-First (2026-05-25)

**Nouvelle décision** :
1. **Données locales** (store Zustand) = source de vérité
2. **Import CSV** (parseBankCsv.ts) = vecteur de données utilisateur
3. **Era Context** = dégradé en MCP (hors du scope web-app)
4. **Claude** = traite directement le dump du store (pas d'API tierce)

**Architecture simplifiée** (`services/aiOrchestrator.ts`) :

```
Question utilisateur
  ├─ buildEnrichedContext() — SANS appels externes
  │    ├─ Lit store.config, store.transactions, store.assets
  │    ├─ Calcule des agrégats locaux (cash-flow, anomalies)
  │    └─ Formate pour system prompt Claude
  └─ claude.chatStream(messages, key, { system: enriched })
```

**Catégorisation batch** : Haiku Claude directe (pas d'Era)
1. `claude.categorizeBatch()` — Haiku 4.5 (rapide + bon marché)
2. Fallback manuelle si api-key absente

**Cache** : localStorage + IndexedDB (browser-native, aucun hit réseau pour les données).

## Conséquences (révisées 2026-05-25)

### Positives

- ✅ **Aucune dépendance API tierce** pour les données utilisateur (self-contained)
- ✅ **Zéro latency** : contexte généré localement (pas de hit réseau)
- ✅ **Confidentialité renforcée** : données n'quittent jamais le navigateur
- ✅ **Import CSV universel** : compatible avec **toutes les banques** (QC, CA, US, etc.)
- ✅ **Résilience** : fonctionne offline (sauf chatting Claude)
- ✅ **Coûts réduits** : zéro appels Era Context, zéro coûts agrégation

### Négatives / Limitation

- ⚠️ **Claude voit uniquement le dump du store** (pas d'insights Era) — moins riche que le plan original
- ⚠️ **Import CSV manuel** : utilisateur responsable de l'export bancaire
  - Mitigation : parseBankCsv.ts supporte tous les formats CSV (délimiteurs, dates, devises)
- ⚠️ **Pas de catégorisation batch gratuite** (Era.listRecurringCharges absent)
  - Mitigation : Haiku directe + localStorage cache des catégories

### Future : Era MCP (optionnel)

Si Marc connecte Claude-agent via Era MCP, l'agent peut :
- Accéder aux insights Era côté backend
- Enrichir analyses Claude en dehors de la web-app
- Persister la mémoire Era ("Remember" patterns)

Mais c'est un flux **optionnel et séparé** (MCP local, pas REST web-app).

**Code résiduel** : `services/eraContext.ts` reste dormant mais complet.
Si Era ajoute CORS dans le futur, le réactiver = ~30 min (décommenter appels + token field).
