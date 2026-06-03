# FinanceAI MCP Server (v0.2.0)

Serveur MCP (Model Context Protocol) qui expose la logique pure de FinanceAI
sous forme de tools appelables conversationnellement par Claude. Objectif : poser
à Claude des questions sur SES vraies finances (patrimoine, projection, impôts,
retraite, prochaines actions) depuis Claude Desktop.

> FinanceAI est **local-first, sans backend**. L'état vit dans le navigateur (+ le
> Google Drive de l'utilisateur). Un serveur MCP est un process séparé : il lit
> l'état depuis une **source**. En mode stdio (ci-dessous), la source est un
> **fichier JSON local** exporté depuis l'app. Un loader « fetch Drive » (Lot 3)
> se branchera plus tard SANS réécrire les tools.

## Tools exposés

Deux familles.

### Sans état — « calculatrice » (marchent toujours, même sans export)
Ils prennent tous leurs paramètres en entrée.

| Tool | Source | Description |
|------|--------|-------------|
| `ping` | _aucun_ | Health check, renvoie pong + timestamp |
| `get_tax_room` | `services/tax.ts` | Plafond CELI cumulé et espace restant (à partir de paramètres) |
| `calculate_real_estate` | `services/realEstate.ts` | Coûts d'achat + mensualité + amortissement |
| `run_projection` | _autonome_ | Projection composée simple (à partir de paramètres) |

### Data-aware (Lot 1) — lisent l'état RÉEL de l'utilisateur
Aucun paramètre : répondent sur l'`AppState` chargé via `$FINANCEAI_STATE_FILE`.
Sans source d'état configurée, ces tools renvoient une **erreur claire** (« configure
ta source d'état ») au lieu de planter.

| Tool | Répond à |
|------|----------|
| `get_financial_overview` | Patrimoine net, liquidités, placements, ventilation par compte (CELI/REER/CELIAPP/REEE/non-enregistré/crypto), revenu/dépenses/cashflow mensuels, dette totale, objectifs actifs |
| `get_projection` | Projection long terme sur SES vraies données (valeur nette dans le temps, âge d'épuisement éventuel) |
| `get_tax_situation` | Situation fiscale réelle (revenu imposable, impôt fédéral/QC, taux moyen et marginal) |
| `get_retirement_outlook` | Perspective retraite/FIRE (âge cible et âge FIRE atteignable, revenu de retraite projeté RRQ/PSV + pensions privées, cible de revenu, verdict de suffisance) |
| `get_next_best_actions` | Prochaines meilleures actions priorisées (REER vs CELI, dette, coussin, etc.) |
| `search_transactions` | Recherche dans SES transactions (filtre texte/catégorie/montant) |

## Lancement local (stdio)

```bash
npm install
# avec l'état réel (recommandé) :
FINANCEAI_STATE_FILE=/chemin/vers/financeai-state.json npm run mcp:dev
# ou en passant le chemin en argument :
npm run mcp:dev -- /chemin/vers/financeai-state.json
# sans état (seuls les tools « calculatrice » répondent) :
npm run mcp:dev
```

Au démarrage, le serveur écrit sur **stderr** soit `Etat charge depuis : fichier
local …` (bon signe), soit un avertissement « aucune source d'état ». Le serveur
écoute ensuite stdin/stdout pour le protocole MCP — c'est normal qu'il « reste là »
sans rien afficher d'autre ; `Ctrl+C` pour quitter. **Tous les logs vont sur stderr**
(stdout est réservé au protocole) — un `console.log` dans un tool casse le parsing client.

## Exporter ton état FinanceAI → `financeai-state.json`

L'état persisté de l'app est stocké sous la clé `financeai-storage` (format Zustand
`{ state, version }`). Le loader attend l'`AppState` **nu** : il faut donc extraire
`.state`.

1. Ouvre l'app dans ton navigateur, **F12** → onglet **Console**.
2. Colle :
   ```js
   copy(JSON.stringify(JSON.parse(localStorage.getItem('financeai-storage')).state, null, 2))
   ```
   (`copy()` met le résultat dans le presse-papier.)
3. Crée un fichier `financeai-state.json` et **colle** dedans. C'est ton chemin
   `FINANCEAI_STATE_FILE`.

> Le loader tolère aussi l'enveloppe `{ "payload": <AppState> }` (format blob Drive),
> et normalise un état partiel (les champs manquants prennent les valeurs par défaut).
>
> ⚠️ Le fichier est en **clair sur ton disque** — garde-le local, ne le commit pas.
> Les **clés API** (Anthropic/Finnhub) ne sont pas dans cet export (elles vivent
> chiffrées dans IndexedDB) ; ce n'est pas un problème : **aucun** des tools data-aware
> n'en a besoin (moteur pur, hors-ligne). C'est un **instantané** : ré-exporte pour
> rafraîchir après des changements dans l'app.

## Configuration Claude Desktop

Éditer le fichier de config :
- **Windows** : `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS** : `~/Library/Application Support/Claude/claude_desktop_config.json`

```jsonc
{
  "mcpServers": {
    "financeai": {
      "command": "npx",
      "args": ["-y", "tsx", "C:\\chemin\\vers\\financeai\\mcp\\stdio.ts"],
      "env": {
        "FINANCEAI_STATE_FILE": "C:\\chemin\\vers\\financeai-state.json"
      }
    }
  }
}
```

- Remplace les deux chemins par les tiens (sous Windows, **double les backslashes** `\\`).
- `tsx` résout les dépendances depuis le `node_modules` du projet (le chemin pointe
  dans `financeai/`), donc le répertoire de lancement n'a pas d'importance — mais
  `npm install` doit avoir été fait dans le projet.
- macOS/Linux : chemins en `/Users/...` (un seul slash), reste identique.

Redémarrer Claude Desktop. Les 10 tools apparaissent dans le sélecteur MCP.

## Test rapide depuis Claude Desktop

Calculatrice (sans état) :
- « Ping mon MCP financeai »
- « Combien d'espace CELI me reste-t-il si je suis né en 1992, arrivé au Canada en 2010, qu'on est en 2026 et que j'ai déjà 25k$ dedans ? »
- « Calcule les coûts d'achat d'un duplex à 600k$ avec 20% de mise de fonds à 5% sur 25 ans »

Sur tes vraies données (data-aware) :
- « Donne-moi une vue d'ensemble de mes finances » → `get_financial_overview`
- « À quel âge mon épargne s'épuise-t-elle selon ma projection ? » → `get_projection`
- « Quel est mon taux marginal d'impôt cette année ? » → `get_tax_situation`
- « Est-ce que je suis sur la bonne voie pour la retraite ? » → `get_retirement_outlook`
- « Quelles sont mes 3 prochaines meilleures actions financières ? » → `get_next_best_actions`
- « Cherche mes transactions “épicerie” de plus de 200$ » → `search_transactions`

## Ajouter un nouveau tool

1. Vérifier que la logique vit déjà dans un service pur (`services/<domaine>.ts`,
   sans React, sans localStorage direct). Pour un tool data-aware, dériver une vue
   pure de l'`AppState` (cf `services/financialSnapshot.ts`).
2. Créer `mcp/tools/<nom>.tool.ts` :
   - `inputSchema` Zod descriptif (vide `{}` pour un tool data-aware sans paramètre)
   - handler thin-wrapper ; data-aware → encapsuler avec `withState(getState, …)` et
     renvoyer via `jsonContent(...)` (cf `tools/_dataAware.ts`)
   - exporter `register<Nom>(server, getState?)`
3. Importer et appeler dans `mcp/server.ts`.

Exemples : `tools/getTaxRoom.tool.ts` (calculatrice, ~30 lignes),
`tools/getFinancialOverview.tool.ts` (data-aware).

## Architecture

```
Claude Desktop
     |
     |-- stdio --> mcp/stdio.ts ── resolveDefaultStateSource($FINANCEAI_STATE_FILE)
                       |                         |
                       v                         v
                 mcp/server.ts (registry)   FileStateSource → loadAppStateFromSource
                       |                         (JSON → validate (zod) → normalize)
        +--------------+--------------+                    |
        |                             |                    v
   sans état                     data-aware  ── getState() → AppState réel
   ping / get_tax_room /         get_financial_overview / get_projection /
   calculate_real_estate /       get_tax_situation / get_retirement_outlook /
   run_projection                get_next_best_actions / search_transactions
        |                             |
        v                             v
   services purs (tax,          services/financialSnapshot, buildSimulationParams,
   realEstate, …)               services/projection, utils/tax — moteur pur partagé
```

## Roadmap

- **Lot 0 (livré)** : adaptateur pur `AppState → SimulationParams` extrait de l'UI,
  `buildFinancialSnapshot` — réutilisables hors React.
- **Lot 1 (livré)** : 6 tools data-aware sur fichier local (stdio).
- **Lot 2 (à venir)** : ingestion de documents (fiche de paie, relevé bancaire,
  relevé de courtage, feuillets fiscaux) → écriture dans l'état, anti-perte, dédup.
- **Lot 3 (à venir)** : transport HTTP + OAuth offline + source « fetch Drive »
  pour un accès distant via claude.ai (nécessite un backend de tokens — cf
  `docs/MCP_CONNECTOR_DESIGN.md`).
