# FinanceAI - Architecture et contrats

> Carte du dépôt pour NotebookLM (carnet du dépôt et Carnet Maître inter-apps). À mettre à jour dans la même PR quand une interface publique, une dépendance externe ou un terme métier change. Rédigé à partir de main au commit 4b53a712d4f6, le 2026-10-13.

## 1. Responsabilité du dépôt
**Domaine :** finances personnelles et planification financière, avec fiscalité canadienne et québécoise (ARC + Revenu Québec).
**Rôle :** application web personnelle qui suit le patrimoine, le budget, les transactions et les placements, et projette l'avenir (moteur de projection mensuel, 7 scénarios, Monte Carlo de la retraite). Elle vit dans le navigateur (aucune base de données serveur) et s'accompagne de deux couches serveur : un relais Vercel pour les appels à Claude et un serveur MCP qui expose les données financières aux agents IA.
**Déploiement :** app et fonctions `api/` sur Vercel (`vercel.json`, CSP stricte, protection Cloudflare Access) ; serveur MCP empaqueté en conteneur (`Dockerfile`, `.gcloudignore`, `mcp/deploy.sh`, workflow `deploy-mcp.yml`) - plateforme et URL exactes [à compléter].

## 2. Interfaces publiques (contrats)
*Ce que les autres dépôts, Hubperso, Claude ou l'utilisateur peuvent appeler.*
- `? /api/claude/v1/messages` : relais des appels Claude (clé de l'utilisateur, BYOK) ; peut router les appels Haiku/Sonnet vers la passerelle IA locale de l'Atelier (Ollama) avec bascule automatique sur Anthropic (ADR 0018).
- `? /api/yahoo/history` : historique de cours via Yahoo Finance (proxy serveur).
- `? /api/yahoo/search` : recherche de titre Yahoo par nom (la doc d'architecture parle de `/api/search/yahoo`, à vérifier).
- `? /api/proxy/fintable` : proxy vers Fintable (synchronisation bancaire, ADR 0010).
- `api/_lib/*` : code partagé du relais (garde, JWT Cloudflare Access, proxys), pas des routes.
- Outils MCP (`mcp/tools/`, un fichier `<outil>.spec.ts` pour la logique pure + un `<outil>.tool.ts` pour l'enregistrement) : lecture `getFinancialOverview`, `getHoldings`, `getProjection`, `runProjection`, `simulateWhatIf`, `getRetirementOutlook`, `getTaxRoom`, `getTaxSituation`, `getNextBestActions`, `searchTransactions`, `calculateRealEstate` ; écriture `applyBankStatement`, `applyBrokerStatement`, `applyPayslip`, `applyTaxSlip`, `applyDebt`, `setCash`, `setBudgetItem`, `deleteItem` ; utilitaires `ping`, `connect_drive`. Noms de modules ; noms exposés exacts autres que `ping` et `connect_drive` [à compléter].
- Écritures MCP : confirmation par jeton (ADR 0023) et verrou d'écriture hors chat (ADR 0025).
- Transports MCP : stdio (`mcp/stdio.ts`, `npm run mcp:dev`) et HTTP (`mcp/http.ts`, OAuth dans `mcp/auth/` et `mcp/http/oauth.ts`, routes planifiées dans `mcp/http/routesPlanifiees.ts`).
- Contrat Hub : dépend de `@mokarade/hub-contract` (v1.3.1) ; résumé pour le hub dans `mcp/hubSummary.ts` (détails dans `docs/claude/hub.md`).
- CarAI : endpoint de bail véhicule (ADR 0017, `mcp/vehiculeBail.ts`) ; chemin exact [à compléter].
- Chat Claude in-app : réutilise les specs des outils MCP via `services/aiTools/` (outil SDK Anthropic).

## 3. Dépendances externes
*Ce que ce dépôt appelle.*
- **Autres dépôts de Marc :** hub-contract (paquet npm depuis GitHub) ; Hubperso (via le contrat Hub) ; CarAI (consomme le bail véhicule) ; atelier (passerelle IA locale via le relais).
- **Services externes :** Anthropic Claude (Haiku 4.5, Sonnet 4.6, Opus ; vision pour relevés et paies) ; Finnhub (cours actions/ETF, profils) ; CoinGecko (crypto) ; Yahoo Finance (via proxy) ; Google Drive (synchronisation chiffrée, sauvegardes, état lu par le MCP) ; Fintable (synchronisation bancaire) ; Cloudflare Access (authentification) ; Vercel ; Era Context (dormant, MCP seulement).
- **Données :** état dans le navigateur (localStorage via Zustand `persist`, IndexedDB chiffré AES-256-GCM pour les clés) ; sauvegardes chiffrées sur Google Drive ; pas de base de données serveur.

## 4. Carte structurelle
*L'arbre complet est généré automatiquement dans la source 00 ; ici, seulement le rôle des dossiers.*
```text
App.tsx, index.tsx       -> point d'entrée React (Layout + TabRouter)
components/              -> UI React, un composant par onglet ; ui/ = primitives
hooks/                   -> hooks React (chat IA, navigation, hydratation, viewport)
services/                -> logique métier pure (n'importe jamais components/)
services/projection*     -> moteur de projection (orchestrateur + ~60 sous-modules, worker MC)
services/tax*.ts         -> impôt fédéral et Québec ; constantes dans utils/tax.ts
services/sync/           -> synchronisation Google Drive (push/pull, phrase de passe)
services/fintable/       -> synchronisation bancaire Fintable
services/marketData/     -> fournisseurs de cours (Finnhub, CoinGecko, Yahoo)
services/history/        -> reconstruction de l'historique (portefeuille, liquidités)
services/aiChat/, aiTools/ -> chat Claude in-app et boucle d'outils
services/testPersonas/   -> personas fictives du mode test
store/                   -> store Zustand unique (schéma v7, migrations)
utils/                   -> helpers (formatage, budget, santé financière, gardes fiscales)
locales/, i18n.ts        -> traductions fr/en (i18next)
api/                     -> fonctions Vercel (relais Claude, proxys)
mcp/                     -> serveur MCP (outils, état, ingestion de documents, auth, Drive)
tests/                   -> tests Vitest ; e2e/ -> tests Playwright
scripts/, tools/, qualite/, modeles/ -> outillage, hooks, mesures, centre de contrôle des agents
.github/, .claude/       -> CI, agents de revue et commandes
docs/                    -> architecture, ADR, référence fiscale, projection, historique
```

## 5. Glossaire métier (anti-hallucination)
- **No-fake-data :** aucune donnée simulée en production ; valeur absente affichée « — » ou `null`, jamais `0`.
- **`<ProjectionRequired>` :** écran affiché quand la projection n'est pas encore calculée.
- **`lastProjection.chartData` :** source unique du futur ; tout calcul long terme en dérive.
- **`computeRawNetWorth` :** source unique du patrimoine net.
- **Scénarios :** BASE, LIBERTE_55, HYPER_INFLATION, WINDFALL, ECONOMIC_WINTER, COMPOUND_STRESS, LATE_INHERITANCE.
- **Monte Carlo :** 100 itérations déterministes (PRNG à graine), bandes P10/P50/P90 et taux de succès.
- **9 phases mensuelles :** étapes de la boucle du moteur (croissance, revenus, immobilier, événements, impôts, etc.).
- **FVI :** Indice de Vitalité Financière.
- **Sequence risk :** risque lié à l'ordre des rendements.
- **ARC / Revenu Québec :** fisc fédéral et québécois ; constantes datées et sourcées dans `docs/FISCAL_REFERENCE.md`.
- **REER, CELI, FERR, REEE :** comptes enregistrés canadiens.
- **RRQ, PSV, SRG, RQAP :** régimes publics (rentes du Québec, sécurité de la vieillesse, supplément, assurance parentale).
- **ACB :** prix de base rajusté suivi pour les comptes non enregistrés (NonReg).
- **BYOK :** l'utilisateur fournit sa propre clé API (relais, ADR 0002).
- **Mode test :** bascule sur des personas fictives ; non persisté (migration v7).
- **Mode discret :** masquage de tous les montants à l'écran.
- **Mode données fictives (sandbox) :** les prompts IA signalent un scénario hypothétique.
- **Spec / register :** séparation d'un outil MCP en logique pure (`.spec.ts`) et enregistrement serveur (`.tool.ts`).
- **Grand livre courtier :** journal des opérations de courtage (ADR 0020).
- **`formatCAD` / `assetValueCad` :** formatage monétaire obligatoire et conversion en CAD.
- **`pendingFocus` / `navigateWithFocus` :** lien profond inter-onglets.
- **Salaires MENSUELS :** les salaires sont saisis par mois (×12 pour l'annuel).

## 6. Pour aller plus loin
- `docs/ARCHITECTURE.md` : stack, topologie, store, pipelines données et IA.
- `docs/PROJECTION.md` et `docs/PROJECTION_OUTPUT_SCHEMA.md` : moteur et schéma de `chartData`.
- `docs/FISCAL_REFERENCE.md` : valeurs fiscales sourcées. `docs/adr/` : décisions (0001 à 0026).
- `mcp/README.md` : serveur MCP. `docs/claude/hub.md` : intégration Hub et CarAI.
- `CLAUDE.md` : règles de travail · `HANDOVER.md` : état courant · `BACKLOG.md` : tâches · `CHANGELOG.md` : historique.
