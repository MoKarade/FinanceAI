# FinanceAI MCP Server (Sprint 1)

Serveur MCP (Model Context Protocol) qui expose la logique pure de FinanceAI
sous forme de tools appelables conversationnellement par Claude.

## Tools exposes

| Tool | Source service | Description |
|------|----------------|-------------|
| `ping` | _aucun_ | Health check, renvoie pong + timestamp |
| `get_tax_room` | `services/tax.ts` | Plafond CELI cumule et espace restant |
| `calculate_real_estate` | `services/realEstate.ts` | Couts d'achat + mensualite + amortissement annuel |
| `run_projection` | _autonome_ | Projection composee simple (Sprint 2 : moteur complet) |

## Lancement local (stdio)

```bash
npm install
npm run mcp:dev
```

Le serveur ecoute sur stdin/stdout. **Tous les logs vont sur stderr** (stdout reserve
au protocole MCP) — un `console.log` dans un tool casse le parsing cote client.

## Configuration Claude Desktop

Editer `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
ou `%APPDATA%\Claude\claude_desktop_config.json` (Windows) :

```json
{
  "mcpServers": {
    "financeai": {
      "command": "npx",
      "args": ["tsx", "/chemin/absolu/vers/financeai/mcp/stdio.ts"]
    }
  }
}
```

Redemarrer Claude Desktop. Les 4 tools apparaissent dans le selecteur MCP.

## Test rapide

Depuis Claude Desktop :

- "Ping mon MCP financeai" -> pong + timestamp
- "Combien d'espace CELI il me reste si je suis ne en 1992, arrive au Canada en 2010, qu'on est en 2026 et que j'ai deja 25k$ dedans ?"
- "Calcule les couts d'achat d'un duplex a 600k$ avec 20% mise de fonds a 5% sur 25 ans"
- "Projette 80k$ avec 2000$/mois pendant 20 ans a 7% de rendement"

## Ajouter un nouveau tool

1. Verifier que la logique vit deja dans `services/<domaine>.ts` (fonction pure,
   sans React, sans localStorage direct).
2. Creer `mcp/tools/<nom>.tool.ts` :
   - Definir un objet `inputSchema` avec des champs Zod descriptifs
   - Implementer le handler thin wrapper qui appelle le service
   - Exporter `register<Nom>(server: McpServer)`
3. Importer et appeler dans `mcp/server.ts`.

Voir `tools/getTaxRoom.tool.ts` pour un exemple minimal (~30 lignes).

## Architecture

```
Claude Desktop
     |
     |--stdio--> mcp/stdio.ts
                      |
                      v
               mcp/server.ts (registry)
                      |
          +-----------+-----------+
          |           |           |
     ping.tool   getTaxRoom   calculateRealEstate    runProjection
                      |           |                         |
                      v           v                         v
              services/tax  services/realEstate     (autonome Sprint 1)
```

## Roadmap

- **Sprint 1 (livre)** : stdio local, 4 tools (ping + 3 metiers)
- **Sprint 2** : moteur de projection complet (SimulationParams Zod), wrapper
  Netlify Function pour acces multi-device
- **Sprint 3+** : tools de mutation (creer/modifier objectifs financiers),
  query state Zustand (necessite design d'auth)

Voir `plan_mcp_financeai.md` a la racine pour le plan complet.
