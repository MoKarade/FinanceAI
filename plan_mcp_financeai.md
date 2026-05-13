# MCP Server pour FinanceAI — Plan d'exécution

> **Document de planification destiné à Claude Code (ou tout agent IA avec accès au repo).**
> Généré le 13 mai 2026. Auteur : Marc Richard, en collaboration avec Claude.
> Objectif : exposer l'app FinanceAI comme serveur MCP pour qu'elle soit utilisable conversationnellement via Claude (Desktop, mobile, Code), en complément d'Era Context.

---

## TL;DR pour Claude Code

Tu vas bâtir un **serveur MCP TypeScript** qui expose la logique métier de l'app FinanceAI (projection, fiscalité canadienne, immobilier) sous forme de tools appelables par Claude.

**Approche** : dossier `mcp/` dans le repo existant, démarre en stdio pour le dev local, puis déployé en Netlify Function pour la prod. Le MCP **réutilise les services existants sans les dupliquer**.

**Sprint 1 (7 jours)** : 3 tools opérationnels (`run_projection`, `get_tax_room`, `calculate_real_estate`) + déploiement + test combiné avec Era Context.

**Pattern d'évolution** : chaque future feature de l'app gagne son exposition MCP en ~3 lignes de code.

---

## 0. Avant de commencer — fichiers à lire dans le repo

Pour comprendre la base de code existante, lis ces fichiers dans cet ordre :

1. `README.md` — contexte de l'app
2. `package.json` — stack et dépendances
3. `CHANGELOG_COMPLET.md` — évolution récente
4. `types.ts` — modèle de données complet (Transaction, Asset, ProjectionConfig, etc.)
5. `constants.ts` — catégories, configs par défaut
6. `services/` (dossier complet) — **CRITIQUE** : c'est la logique métier que tu vas exposer. Note les signatures de fonctions exactes.
7. `App.tsx` — point d'entrée, comprendre comment les services sont consommés
8. `store/` — gestion d'état Zustand

⚠️ **Important** : le doc ci-dessous **présume** certaines signatures de fonctions dans `services/`. Avant de coder, **vérifie les vraies signatures** et ajuste les Zod schemas en conséquence.

---

## 1. Contexte

### L'app existante : FinanceAI — Lunch Money Companion

Personal finance manager canadien construit en React 19 + TypeScript + Vite 6, déployé sur Netlify. **Plus avancé qu'une simple app de budget** : c'est un moteur de projection financière + planificateur fiscal canadien + analyseur immobilier.

**Stack :**
- Frontend : React 19, Vite 6, Zustand (state), framer-motion, recharts, lucide-react
- i18n : i18next (FR/EN)
- AI actuel : `@google/genai` (Gemini 1.40)
- Banking : react-plaid-link + Lunch Money API
- Export : jspdf + html2canvas
- Deploy : Netlify

**Features clés (vu dans `types.ts`) :**
- Projections multi-comptes (CELI, CELIAPP/FHSA, REER, MARGE, NON-ENREG, CRYPTO)
- Stress tests (krach, durée récupération, choc inflationniste)
- Scénarios A/B comparatifs
- Smith Manoeuvre, optimisation retenue à la source (T1213)
- Plafonds CELI/REER calculés réels avec facteur d'équivalence, arrivée Canada
- Immobilier : buy vs rent + revenu locatif + appréciation
- Événements de vie (krach, héritage, perte emploi, mariage, sabbatique, business)
- Couples avec modes de split 50/50 / prorata / custom
- Onglet ASSISTANT déjà présent (mais probablement sous-exploité)

### L'objectif de cette intégration

**Ce qu'on veut débloquer :**
1. Interroger l'app en langage naturel via Claude (mobile, desktop, code)
2. Combiner les données live d'Era Context (transactions, soldes, dépenses) avec les calculs de projection/fiscalité de FinanceAI
3. Permettre à Claude d'exécuter des actions dans l'app (créer un goal, lancer un scénario)
4. Préparer le terrain pour un assistant conversationnel **dans** l'app (onglet ASSISTANT alimenté par MCP)

**Ce que Era Context apporte déjà** (en complément, pas en concurrence) :
- Agrégation transactions live (multi-comptes Desjardins, Disnat, etc.)
- Règles d'automatisation (transferts, anomalies, récurrents)
- Knowledge base persistante (objectifs, faits)
- Insights de dépenses pré-calculés

**Ce qu'Era ne fait PAS, et que FinanceAI doit fournir :**
- Projection long terme avec scénarios
- Fiscalité canadienne (CELI/REER/CELIAPP/FHSA)
- Analyse immobilière buy vs rent
- Smith Manoeuvre, T1213
- Stress tests et événements de vie
- Planification famille/enfants (RREE, congé parental)
- Plans de retraite avec pensions de gouvernement

### Pourquoi maintenant

L'app est en **construction active**. Brancher MCP maintenant permet de bâtir chaque nouvelle feature avec exposition conversationnelle "gratuite" — pas de refactor a posteriori.

---

## 2. Brainstorm — alternatives considérées

Pour transparence, voici les options évaluées avant de choisir la solution retenue.

### Option A : Serveur MCP standalone (repo séparé)

**Idée** : un projet `financeai-mcp` séparé, qui consomme l'API de l'app principale.

**Pros :**
- Séparation claire des concerns
- Cycle de déploiement indépendant
- Possibilité de scaler indépendamment

**Cons :**
- **Duplication de logique** : il faudrait soit copier les services, soit extraire en package npm partagé
- Maintenir deux repos en sync = friction permanente
- Surcharge de déploiement (deux pipelines)
- Drift inévitable entre l'app et le MCP

**Verdict : non.** La duplication tue l'évolutivité, qui est précisément la priorité ici.

### Option B : MCP intégré dans le repo + Netlify Functions

**Idée** : dossier `mcp/` dans le même repo que l'app React. Déployé comme Netlify Function.

**Pros :**
- **Réutilise directement les services** (`mcp/tools/projection.ts` importe de `services/projection.ts`)
- Un seul deploy (Netlify pipeline existant)
- Une seule source de vérité pour la logique
- Co-localisation = découvrabilité

**Cons :**
- Cold starts sur les fonctions serverless (≈300–800 ms première requête)
- Timeout 10 s sur plan free, 26 s sur Pro (largement suffisant pour les projections)
- Bundle size de la function peut grossir si on inclut trop de deps

**Verdict : OUI** pour la prod.

### Option C : Cloudflare Workers

**Idée** : MCP server sur Cloudflare Workers (edge runtime).

**Pros :**
- Cold starts négligeables
- Très bas coût
- Bonne latence globale

**Cons :**
- Edge runtime ≠ Node complet (certaines libs ne marchent pas, notamment des bibliothèques de calcul lourdes)
- Setup et CI séparés
- Pas justifié au stade actuel — c'est une optimisation prématurée

**Verdict : pas maintenant.** Garder en tête si le projet scale à beaucoup d'utilisateurs.

### Option D : stdio local only (Claude Desktop)

**Idée** : MCP server qui parle en stdio, connecté localement à Claude Desktop via `claude_desktop_config.json`.

**Pros :**
- **Le plus simple à mettre en place** : pas d'hébergement, pas d'auth
- Itération ultra-rapide en dev (chaque save reflété immédiatement)
- Pas de surcoût d'infra

**Cons :**
- Ne marche que sur la machine où tourne le serveur (pas mobile, pas multi-utilisateurs)
- Pas accessible depuis Claude.ai web ou mobile

**Verdict : OUI** comme premier jalon de développement.

### Option retenue : **Hybride D → B**

**Phase 1 (dev) :** Démarre en stdio. Itération rapide. Validation des tools avec Claude Desktop local.

**Phase 2 (déploiement) :** Wrapper HTTP/SSE déployé en Netlify Function. Le MÊME code de tools/server.ts, juste un transport différent.

C'est le sweet spot entre vélocité de dev et accessibilité finale.

---

## 3. Approche retenue : justification

| Critère | Note | Détail |
|---|---|---|
| Vélocité de dev | ✅✅✅ | stdio = pas d'hébergement à gérer |
| Pas de duplication | ✅✅✅ | Mêmes services consommés par React et MCP |
| Co-évolution | ✅✅✅ | Nouvelle feature = nouvelle ligne dans `mcp/tools/` |
| Coût d'infra | ✅✅✅ | Netlify functions = compris dans le plan existant |
| Accessibilité multi-device (prod) | ✅✅ | HTTP via Netlify accessible depuis n'importe où |
| Auth | ⚠️ | Phase 1 sans auth (local) → phase 2 bearer token → futur OAuth |

---

## 4. Architecture détaillée

### Structure de fichiers cible

```
financeai/
├── components/                    # existing — UI React
├── services/                      # existing — logique métier
│   ├── projection.ts              # moteur de projection (existant)
│   ├── tax.ts                     # calculs fiscaux CELI/REER (existant)
│   ├── realEstate.ts              # analyse immobilière (existant)
│   ├── smithManoeuvre.ts          # (peut-être à créer)
│   └── ...
├── store/                         # existing — Zustand
├── types.ts                       # existing — types partagés
├── constants.ts                   # existing
│
├── mcp/                           # NOUVEAU
│   ├── server.ts                  # MCP Server setup + registration
│   ├── tools/                     # un fichier par catégorie
│   │   ├── projection.tools.ts    # tools liés à la projection
│   │   ├── tax.tools.ts           # tools liés à la fiscalité
│   │   ├── realEstate.tools.ts    # tools liés à l'immobilier
│   │   ├── goals.tools.ts         # tools de gestion d'objectifs
│   │   └── index.ts               # re-export
│   ├── schemas/                   # Zod schemas, partagés avec types.ts
│   │   ├── projection.schema.ts
│   │   ├── tax.schema.ts
│   │   └── realEstate.schema.ts
│   ├── stdio.ts                   # entry point dev (transport stdio)
│   └── README.md                  # comment lancer/déboguer
│
├── netlify/
│   └── functions/
│       └── mcp.ts                 # NOUVEAU — wrapper HTTP pour MCP
│
├── package.json                   # +deps : @modelcontextprotocol/sdk, zod
├── tsconfig.json                  # ajouter mcp/ et netlify/ dans includes
└── netlify.toml                   # configurer la function MCP
```

### Flux de données

```
[Dev local — stdio]
Claude Desktop ──stdio──> mcp/stdio.ts ──> mcp/server.ts ──> services/*.ts

[Production — HTTP]
Claude (web/mobile/desktop)
        │
        ├──HTTP──> netlify/functions/mcp.ts ──> mcp/server.ts ──> services/*.ts
        │
        └──HTTP──> Era Context MCP (cloud)
```

### Stateless vs stateful

**Phase 1 (recommandé) : stateless.** L'app React garde toutes les données utilisateur (Zustand + localStorage / Lunch Money). Le MCP reçoit en input les données nécessaires et retourne le calcul. Aucune persistance côté MCP.

**Avantages :**
- Aucune base de données à gérer
- Pas de problèmes d'auth multi-utilisateurs
- Le MCP est essentiellement une "API compute"

**Pattern :** quand Claude appelle `run_projection`, l'utilisateur (ou Claude orchestrant Era) fournit les paramètres en input. Le MCP calcule et retourne. Stateless.

**Phase 2 (futur) : stateful avec base partagée.** Si l'app passe à multi-utilisateurs serveur (Supabase, Postgres), le MCP peut lire/écrire dans la même DB que l'app. Mais ne pas démarrer là.

---

## 5. Inventaire des tools — priorisé par valeur/effort

### Tier 1 — Sprint 1 (MUST HAVE, max 1 semaine)

| Tool | Input | Output | Service source |
|---|---|---|---|
| `run_projection` | `ProjectionConfig` + balances initiales | `ProjectionResult` (timeline + summary) | `services/projection.ts` |
| `get_tax_room` | `accountType: 'CELI'\|'REER'\|'CELIAPP'`, user profile | `{ remaining, used, ceiling, breakdown }` | `services/tax.ts` |
| `calculate_real_estate` | `RealEstateGoal` | `BuyVsRentAnalysis` (NPV, breakeven, monthly cost) | `services/realEstate.ts` |

**Raison de ces 3 :** ce sont les calculs les plus uniques de l'app, et tous trois sont (probablement) des fonctions pures = facile à exposer sans refactor.

### Tier 2 — Sprint 2 (HIGH VALUE, semaine 2)

| Tool | Input | Output |
|---|---|---|
| `compare_scenarios` | 2 × `ProjectionConfig` | Diff structuré + recommendation textuelle |
| `simulate_life_event` | `LifeEvent` + projection base | Impact modélisé |
| `get_smith_manoeuvre_analysis` | User profile + real estate goal | Eligibilité + projection levier |
| `optimize_source_deductions_t1213` | User salary + REER planned | Économie d'impôt + retenue suggérée |

### Tier 3 — Sprint 3+ (NICE TO HAVE, mutations d'état)

| Tool | Type | Note |
|---|---|---|
| `list_financial_goals` | read | Lit le state Zustand (via fonction d'export) |
| `create_goal` | mutation | Doit pouvoir écrire dans le state — nécessite design d'auth |
| `update_goal` | mutation | Idem |
| `archive_goal` | mutation | Idem |
| `analyze_transaction` | AI | Catégorisation intelligente, possible swap Gemini → Claude |
| `suggest_optimization` | AI | Conseil contextualisé (CELI vs REER, etc.) |

### Tier 4 — Read-only state queries (utile pour Claude orchestrateur)

| Tool | Note |
|---|---|
| `get_user_profile` | Renvoie config utilisateur (âge, comptes, salaire) |
| `get_portfolio_allocation` | Renvoie répartition actifs par compte/type |
| `list_real_estate_goals` | Liste les biens immobiliers configurés |
| `get_recurring_items` | Liste les abonnements/factures détectés |

---

## 6. Stack technique

### Nouvelles dépendances à ajouter à `package.json`

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0"  // pour exécuter le stdio server en dev
  }
}
```

**Note de version** : `@modelcontextprotocol/sdk` évolue. Vérifie sur npm la dernière version stable au moment de l'installation.

### Pas besoin d'ajouter

- Express, Fastify, etc. — le SDK MCP gère son propre transport HTTP/SSE
- Base de données — phase stateless
- Bibliothèque d'auth — phase 1 sans auth

---

## 7. Plan d'exécution — Sprint 1 (7 jours)

### Jour 1 — Setup & squelette

- [ ] `npm install @modelcontextprotocol/sdk zod tsx`
- [ ] Créer `mcp/` avec sous-dossiers `tools/` et `schemas/`
- [ ] Créer `mcp/server.ts` avec un `McpServer` instance et un tool factice `ping`
- [ ] Créer `mcp/stdio.ts` qui démarre le serveur en stdio
- [ ] Ajouter script `npm run mcp:dev` dans `package.json`
- [ ] Configurer Claude Desktop (`claude_desktop_config.json`) pour pointer vers `mcp/stdio.ts`
- [ ] Vérifier : Claude Desktop voit le tool `ping` et peut l'appeler

**Definition of done jour 1 :** demander à Claude Desktop « appelle l'outil ping de mon MCP » → retourne `pong`.

### Jour 2–3 — Tool #1 : `run_projection`

- [ ] Lire `services/projection.ts` pour identifier la fonction principale (probablement `runProjection(config)` ou similaire)
- [ ] Créer `mcp/schemas/projection.schema.ts` :
  - Schéma Zod input qui mirror `ProjectionConfig` de `types.ts`
  - Schéma Zod output pour le résultat
- [ ] Créer `mcp/tools/projection.tools.ts` :
  - Enregistre `run_projection` qui appelle `services/projection.ts::runProjection`
  - Validation Zod en entrée
  - Mapping output → schema Zod
- [ ] Tester via Claude Desktop : « projette mon CELI sur 10 ans avec rendement 6 % »

**Definition of done :** Claude exécute la projection et retourne un résumé en langage naturel.

### Jour 4 — Tool #2 : `get_tax_room`

- [ ] Identifier la fonction dans `services/tax.ts` (probablement plusieurs : `calculateCeliRoom`, `calculateReerRoom`, `calculateFhsaRoom`)
- [ ] Schéma Zod input : `{ accountType, userProfile }`
- [ ] Wrapper unique qui route vers la bonne fonction selon `accountType`
- [ ] Tester : « combien il me reste de plafond CELI ? »

### Jour 5 — Tool #3 : `calculate_real_estate`

- [ ] Identifier la fonction principale dans `services/realEstate.ts`
- [ ] Schéma Zod input qui mirror `RealEstateGoal`
- [ ] Schéma Zod output structuré (NPV buy vs rent, monthly comparison, breakeven year)
- [ ] Tester : « si j'achète un duplex 450k$ avec 20% mise de fonds à 5% pendant 25 ans, est-ce mieux que louer à 1800$/mois ? »

### Jour 6 — Wrapper Netlify Function

- [ ] Créer `netlify/functions/mcp.ts` qui wrap le même `McpServer` en transport HTTP/SSE
- [ ] Configurer `netlify.toml` pour exposer `/.netlify/functions/mcp` sur `/api/mcp`
- [ ] Déployer en prod
- [ ] Connecter Claude Desktop (et tester Claude mobile) à l'URL de production
- [ ] Tester les 3 tools en distant

### Jour 7 — Test combiné avec Era Context

- [ ] Cas de test : « combien j'ai dépensé en restos sur 90 jours, et est-ce que ce rythme me permet d'atteindre mon plafond CELI cette année ? »
  - Claude doit appeler Era pour les dépenses
  - Claude doit appeler FinanceAI MCP pour le plafond + la projection
  - Synthèse Claude doit combiner les deux
- [ ] Documenter dans `mcp/README.md`
- [ ] Cleanup, lint, types stricts

**Definition of done Sprint 1 :** Marc peut, depuis son téléphone Claude mobile, poser une question qui touche les deux MCPs et obtenir une réponse cohérente.

---

## 8. Code de démarrage

⚠️ **Les imports `services/*` ci-dessous présument des noms de fonctions. À adapter aux vrais noms du repo.**

### `mcp/server.ts`

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerProjectionTools } from './tools/projection.tools.js';
import { registerTaxTools } from './tools/tax.tools.js';
import { registerRealEstateTools } from './tools/realEstate.tools.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'financeai-mcp',
    version: '0.1.0',
  });

  // Health check
  server.tool(
    'ping',
    'Test connectivity. Returns pong with timestamp.',
    {},
    async () => ({
      content: [{ type: 'text', text: `pong ${new Date().toISOString()}` }],
    })
  );

  // Register tools by domain
  registerProjectionTools(server);
  registerTaxTools(server);
  registerRealEstateTools(server);

  return server;
}
```

### `mcp/stdio.ts` (entry point pour dev local)

```typescript
#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[FinanceAI MCP] Connected via stdio');
}

main().catch((err) => {
  console.error('[FinanceAI MCP] Fatal:', err);
  process.exit(1);
});
```

### `mcp/schemas/projection.schema.ts`

```typescript
import { z } from 'zod';

// À aligner avec ProjectionConfig dans types.ts
export const ProjectionInputSchema = z.object({
  years: z.number().min(1).max(60).describe('Horizon de projection en années'),
  returnRate: z.number().min(-0.5).max(1).describe('Taux de rendement annuel (0.06 = 6%)'),
  inflationRate: z.number().min(-0.1).max(0.3).default(0.02),
  savingsMode: z.enum(['manual', 'budget', 'real']).default('manual'),
  manualContribution: z.number().min(0).describe('Contribution mensuelle en CAD'),
  initialBalances: z.object({
    celi: z.number().min(0).default(0),
    reer: z.number().min(0).default(0),
    nonReg: z.number().min(0).default(0),
    cash: z.number().min(0).default(0),
    crypto: z.number().min(0).default(0),
  }),
  // Optionnel : stress test
  stressTest: z.object({
    enabled: z.boolean().default(false),
    yearOfShock: z.number().min(1).max(15).optional(),
    portfolioDropPercent: z.number().min(0).max(0.6).optional(),
    recoveryMonths: z.number().min(6).max(60).optional(),
  }).optional(),
});

export type ProjectionInput = z.infer<typeof ProjectionInputSchema>;

export const ProjectionOutputSchema = z.object({
  timeline: z.array(z.object({
    year: z.number(),
    totalNetWorth: z.number(),
    byAccount: z.object({
      celi: z.number(),
      reer: z.number(),
      nonReg: z.number(),
      cash: z.number(),
      crypto: z.number(),
    }),
  })),
  summary: z.object({
    finalNetWorth: z.number(),
    totalContributions: z.number(),
    totalGrowth: z.number(),
    cagr: z.number(),
  }),
});

export type ProjectionOutput = z.infer<typeof ProjectionOutputSchema>;
```

### `mcp/tools/projection.tools.ts`

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ProjectionInputSchema,
  ProjectionOutputSchema,
  type ProjectionInput,
} from '../schemas/projection.schema.js';

// ⚠️ Adapter ce import au vrai nom de fonction dans services/
import { runProjection } from '../../services/projection.js';

export function registerProjectionTools(server: McpServer) {
  server.tool(
    'run_projection',
    'Lance une projection financière sur N années avec stress test optionnel. Retourne la timeline année par année et un résumé. Utilise pour répondre à "où je serai dans X ans si je continue à épargner Y par mois".',
    ProjectionInputSchema.shape,
    async (input: ProjectionInput) => {
      // Adapter la transformation input → format attendu par services/projection.ts
      const result = await runProjection({
        years: input.years,
        returnRate: input.returnRate,
        inflationRate: input.inflationRate,
        savingsMode: input.savingsMode,
        manualContribution: input.manualContribution,
        initialBalances: input.initialBalances,
        // ... autres champs
      });

      // Adapter le résultat au schéma de sortie
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              timeline: result.timeline,
              summary: result.summary,
            }, null, 2),
          },
        ],
      };
    }
  );
}
```

### `netlify/functions/mcp.ts`

```typescript
import { Handler } from '@netlify/functions';
import { createServer } from '../../mcp/server.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

// ⚠️ Le pattern HTTP du SDK MCP évolue.
// Vérifier la doc officielle : https://modelcontextprotocol.io/docs/concepts/transports
// Ce code est un squelette à adapter.

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    };
  }

  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });

  await server.connect(transport);

  // Router la requête HTTP vers le transport
  // (détails exacts à voir dans la doc du SDK)
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'mcp_endpoint_active' }),
  };
};
```

### `netlify.toml` (à ajouter ou compléter)

```toml
[functions]
  node_bundler = "esbuild"
  external_node_modules = ["@modelcontextprotocol/sdk"]

[[redirects]]
  from = "/api/mcp/*"
  to = "/.netlify/functions/mcp/:splat"
  status = 200
```

### `package.json` — scripts à ajouter

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "mcp:dev": "tsx mcp/stdio.ts",
    "mcp:typecheck": "tsc --noEmit -p mcp/tsconfig.json"
  }
}
```

### Configuration Claude Desktop locale

Dans `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) ou `%APPDATA%\Claude\claude_desktop_config.json` (Windows) :

```json
{
  "mcpServers": {
    "financeai": {
      "command": "node",
      "args": ["--experimental-strip-types", "/chemin/absolu/vers/mcp/stdio.ts"],
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

Ou avec `tsx` :

```json
{
  "mcpServers": {
    "financeai": {
      "command": "npx",
      "args": ["tsx", "/chemin/absolu/vers/mcp/stdio.ts"]
    }
  }
}
```

---

## 9. Pattern d'évolution — ajouter un nouveau tool

Quand Marc ajoute une nouvelle feature à l'app (par exemple : calculateur de RREE pour les études des enfants), le pattern est :

**Étape 1 — Écrire la logique métier** (comme d'habitude)

```typescript
// services/childEducation.ts
export function calculateReeProjection(child: ChildGoal, years: number) {
  // ... logique de calcul
  return { totalContributed, governmentMatch, finalValue, ... };
}
```

**Étape 2 — Définir le schéma Zod**

```typescript
// mcp/schemas/childEducation.schema.ts
export const ReeProjectionInputSchema = z.object({
  child: ChildGoalSchema,
  years: z.number().min(1).max(25),
});
```

**Étape 3 — Enregistrer le tool**

```typescript
// mcp/tools/childEducation.tools.ts
export function registerChildEducationTools(server: McpServer) {
  server.tool(
    'calculate_ree_projection',
    'Projette le montant accumulé dans un REEE...',
    ReeProjectionInputSchema.shape,
    async (input) => {
      const result = calculateReeProjection(input.child, input.years);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );
}
```

**Étape 4 — Brancher dans le server**

```typescript
// mcp/server.ts
import { registerChildEducationTools } from './tools/childEducation.tools.js';
// ...
registerChildEducationTools(server);
```

**4 lignes ajoutées, 1 fichier de schéma + 1 fichier de tool créés. C'est tout.**

---

## 10. Tests & validation

### Tests unitaires (optionnels mais recommandés)

Pour chaque tool, un test qui :
1. Construit un input valide via Zod
2. Vérifie que le wrapper appelle bien le service avec les bons params
3. Vérifie que l'output respecte le schéma

Stack suggérée : `vitest` (déjà familier dans l'écosystème Vite).

### Tests d'intégration manuels via Claude Desktop

Cas de test minimum pour Sprint 1 :

| # | Prompt utilisateur | Tools attendus | Résultat attendu |
|---|---|---|---|
| 1 | « Ping mon MCP financeai » | `ping` | Pong avec timestamp |
| 2 | « Projette 35k$ initial avec 1500$/mois pendant 15 ans à 7% » | `run_projection` | Timeline + final net worth |
| 3 | « Combien me reste-t-il dans mon CELI ? » | `get_tax_room` | Plafond restant calculé |
| 4 | « Acheter un duplex à 450k$ vs louer à 1800$/mois, mieux quoi ? » | `calculate_real_estate` | Analyse buy vs rent |
| 5 | « Combien j'ai dépensé restos sur 90j, et est-ce que je peux atteindre mon plafond CELI cette année ? » | Era + `get_tax_room` + `run_projection` | Synthèse multi-MCP |

### Validation observable

Le serveur stdio loggue chaque appel de tool sur `stderr` (ne PAS utiliser `stdout` car réservé au protocole) :

```typescript
console.error(`[tool] run_projection called with`, JSON.stringify(input));
```

---

## 11. Combinaison avec Era Context

Pour rappel, Era Context expose entre autres :
- `accounts__list_financial_accounts` — soldes par compte
- `insights__analyze_spending(period, group_by, category)` — ventilation des dépenses
- `insights__get_cash_flow(num_periods, granularity)` — flux mensuels
- `transactions__search_transactions(query, period, ...)` — recherche transactions
- `transactions__list_recurring_charges` — abonnements/factures détectés
- `knowledge__get_financial_context_and_overview` — snapshot complet
- `knowledge__remember` — sauvegarder un fait/objectif persistant

**Pattern de combinaison** : Claude utilise Era pour les **données réelles** et FinanceAI MCP pour le **calcul/raisonnement**.

### Exemples de combinaisons puissantes

**1. Projection ajustée aux dépenses réelles**
```
User: "Projette-moi en utilisant mon vrai rythme d'épargne des 90 derniers jours"
→ Era.insights__get_cash_flow(num_periods=3) → real savings rate
→ FinanceAI.run_projection(manualContribution = real_rate)
→ Claude synthétise
```

**2. Optimisation CELI vs réalité**
```
User: "Vais-je atteindre mon plafond CELI cette année?"
→ FinanceAI.get_tax_room('CELI') → plafond restant
→ Era.insights__analyze_spending(period='this_year') → dépenses YTD
→ FinanceAI.run_projection(years=1, contributionFromActualSavings)
→ Claude : "À ce rythme tu seras à X $ de ton plafond"
```

**3. Faisabilité d'un goal immobilier**
```
User: "Est-ce que je peux acheter un duplex à 500k$ en 2028 ?"
→ Era.knowledge__get_financial_context_and_overview → net worth, income
→ FinanceAI.calculate_real_estate(price=500000, year=2028)
→ FinanceAI.run_projection(years=2) → projection mise de fonds
→ Claude évalue faisabilité
```

---

## 12. Décisions ouvertes à trancher

Ces décisions n'ont pas besoin d'être prises avant le Sprint 1, mais doivent être documentées pour le Sprint 2 et au-delà.

### 12.1. Authentification multi-utilisateurs

**Phase 1 (local) :** pas d'auth. Le MCP stdio tourne sur la machine de Marc.

**Phase 2 (Netlify, mono-utilisateur) :** bearer token statique dans header `Authorization: Bearer <token>`. Token en variable d'environnement Netlify.

**Phase 3 (multi-utilisateurs) :** OAuth ou JWT. À designer plus tard.

### 12.2. Stateful vs stateless

Tier 1 et Tier 2 sont stateless. Tier 3 (mutations de goals) nécessite de l'état. Options :

- **A.** Le MCP reste stateless ; les goals vivent dans le localStorage de l'app React. Pour qu'un appel MCP modifie un goal, il faut un bridge front-back (websocket, polling). Complexe.
- **B.** Migrer l'état vers Supabase / Postgres ; MCP et React app lisent tous deux dedans. Plus propre mais demande de toucher au store Zustand.
- **C.** Au stade actuel, **ne pas implémenter Tier 3 du tout** dans le MCP — Claude lit l'état via export JSON ponctuel.

**Recommandation : C pour Sprint 1–3, B quand l'app passera à un backend.**

### 12.3. Versioning du protocole

- Versionner le MCP : `0.1.0` au démarrage, bump à chaque breaking change de schéma
- Mettre `version` dans le `McpServer` constructor
- Quand on changera un schema, **incrémenter major** si c'est breaking, **minor** si addition seulement

### 12.4. Internationalisation des réponses

L'app est en FR/EN. Le MCP retourne du JSON (donc neutre), mais les `description` des tools sont en français dans le code de démarrage. Décision : **garder les descriptions en français** (Claude comprend les deux ; ça documente l'intention en FR pour Marc).

### 12.5. Gemini vs Claude pour les features AI internes de l'app

L'app utilise déjà `@google/genai`. Une opportunité non liée au MCP : remplacer ou compléter Gemini avec l'API Claude pour les tâches de raisonnement (génération de `rationale` et `actionPlan` des `FinancialGoal`, conseils fiscaux).

**À reporter** après le Sprint 1 MCP — ne pas mélanger les deux chantiers.

---

## 13. Anti-patterns à éviter

### ❌ Dupliquer la logique métier dans `mcp/tools/`

Si tu te retrouves à copier-coller du code de `services/projection.ts` dans `mcp/tools/projection.tools.ts`, **arrête**. Le wrapper doit être un thin layer qui valide l'input Zod, appelle la fonction service, et map l'output. Si la fonction service n'a pas la bonne signature, **refactor la fonction service** plutôt que de copier.

### ❌ Mettre de l'état dans `mcp/server.ts`

Le serveur MCP doit être stateless (Phase 1). Pas de variables globales, pas de cache mémoire avec données utilisateur.

### ❌ Renvoyer du HTML ou du markdown formaté dans les tools

Les tools retournent du JSON structuré. **C'est Claude qui formate pour l'utilisateur final.** Ça permet à Claude de combiner plusieurs outputs intelligemment.

### ❌ Logger sur stdout

En transport stdio, **stdout est réservé au protocole MCP**. Tout log doit aller sur stderr (`console.error`) sinon ça casse le parsing.

### ❌ Faire des appels réseau bloquants dans un tool

Les tools doivent compléter rapidement (sous 10 s sur free, 26 s sur Netlify Pro). Pas d'appels API tiers synchrones lents. Si nécessaire, pattern : retourner un job ID et un autre tool `check_job_status`.

### ❌ Schémas Zod trop permissifs

Tentation : utiliser `z.any()` partout pour aller vite. **Non.** Les Zod schemas servent à Claude pour comprendre comment appeler le tool. Plus le schéma est précis (enums, ranges, descriptions), mieux Claude pilote.

### ❌ Tools trop génériques

`run_calculation(type, params)` est tentant mais nul. Préférer 5 tools spécifiques (`run_projection`, `calculate_real_estate`, etc.) — Claude choisit mieux.

### ❌ Casser le `tsconfig.json` existant

Le dossier `mcp/` peut nécessiter des settings TS spécifiques (`module: NodeNext`, `target: ES2022`). Créer `mcp/tsconfig.json` qui hérite et override, plutôt que de modifier le tsconfig racine et risquer de casser le build Vite.

---

## 14. Travaux annexes recommandés (hors scope MCP)

Pendant que tu es dans le repo, voici des chantiers à signaler à Marc :

### 14.1. Fixer le build cassé

Le fichier `build_error.txt` indique que le dernier build échoue avec 4 erreurs JSX dans `components/FutureProjection.tsx` ligne 2037 :
- Caractère `}` invalide dans un élément JSX (lignes 2037)
- Tag de fermeture `</motion.div>` qui ne correspond pas à `<div>` ouvrant (ligne 2038)
- Regex non terminée (ligne 2039)

**Action :** lire `FutureProjection.tsx` autour de la ligne 2030–2042, identifier l'expression IIFE mal fermée. Probable refactor : extraire le JSX conditionnel en variable nommée plutôt qu'en IIFE inline.

### 14.2. Refactor de `FutureProjection.tsx`

2 000+ lignes dans un seul composant React = code smell. À découper en sous-composants logiques (graphique principal, panneau paramètres, légende, etc.). Pas urgent mais à planifier.

### 14.3. Extraction des services purs

Pour faciliter l'exposition MCP, les services doivent être :
- Des fonctions **pures** (input → output, pas d'effet de bord)
- Sans dépendance au DOM ou à React
- Sans accès direct au localStorage / Zustand

Si certains services dépendent du store, les refactorer pour prendre l'état en paramètre. Pattern :

```typescript
// Avant
export function getProjection() {
  const state = useStore.getState(); // dépendance forte
  return compute(state);
}

// Après
export function getProjection(input: ProjectionInput) {
  return compute(input);
}

// Le composant React passe l'état explicitement
const result = getProjection(useStore.getState().projectionConfig);
```

### 14.4. Tests unitaires des services

Aucun test détecté dans le repo. Avant de wrapper en MCP, ajouter des tests vitest sur les fonctions principales de `services/` garantit qu'on n'introduit pas de régression en exposant.

---

## 15. Definition of Done — Sprint 1

À la fin du Sprint 1, ce qui doit être vrai :

- [ ] Le repo contient un dossier `mcp/` complet avec `server.ts`, `stdio.ts`, et au moins 3 tools opérationnels
- [ ] `npm run mcp:dev` lance le serveur stdio sans erreur
- [ ] `npm run mcp:typecheck` passe sans warning
- [ ] Claude Desktop, connecté en local, peut appeler les 3 tools et reçoit des réponses cohérentes
- [ ] `netlify/functions/mcp.ts` est déployé en production
- [ ] L'URL `https://<app>.netlify.app/api/mcp` répond
- [ ] Test de combinaison avec Era Context passe (test #5 de la section 10)
- [ ] `mcp/README.md` existe et explique comment lancer en dev + comment ajouter un nouveau tool
- [ ] Au moins une nouvelle entrée dans `CHANGELOG_COMPLET.md` documentant l'ajout MCP
- [ ] La logique de `services/` n'a pas été dupliquée — chaque tool est un thin wrapper

---

## 16. Annexe — Glossaire

**MCP (Model Context Protocol)** : protocole open-source d'Anthropic permettant à une IA d'appeler des fonctions externes de manière standardisée. https://modelcontextprotocol.io

**Tool (MCP)** : fonction exposée par un serveur MCP, avec un nom, une description, un schéma d'input (Zod/JSON Schema) et une implémentation.

**Transport** : le canal de communication entre client (Claude) et serveur (votre MCP). Principaux : stdio (local), HTTP/SSE (distant), streamable HTTP (nouveau).

**Era Context** : serveur MCP tiers utilisé par Marc qui agrège ses comptes financiers (Desjardins, Disnat) et fournit des insights sur les dépenses.

**Stateless** : sans persistance d'état entre appels. Chaque appel est indépendant.

**Zod** : bibliothèque TypeScript de validation de schémas runtime, utilisée pour valider les inputs des tools MCP.

---

## 17. Ressources externes

- MCP TypeScript SDK : https://github.com/modelcontextprotocol/typescript-sdk
- MCP spec : https://spec.modelcontextprotocol.io
- Claude Desktop MCP config : https://modelcontextprotocol.io/quickstart/user
- Netlify Functions docs : https://docs.netlify.com/functions/overview/
- Zod docs : https://zod.dev

---

*Fin du document. Bonne implémentation. — Marc (avec Claude, 13 mai 2026)*
