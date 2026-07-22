# FinanceAI MCP Server (v0.7.3)

Serveur MCP (Model Context Protocol) qui expose FinanceAI à Claude : **poser des
questions** sur ses vraies finances (patrimoine, projection, impôts, retraite) ET
**déposer des documents** (paie, relevés, feuillets) que Claude **range au bon
endroit** — le tout synchronisé **automatiquement** avec l'app via Google Drive.

> FinanceAI est **local-first, sans backend**. L'état vit dans le navigateur + le
> **Google Drive** de l'utilisateur (blob `financeai-sync.json`). Le serveur MCP est
> un process séparé qui lit/écrit l'état depuis une **source** abstraite :
> - **`FileStateSource`** — un export JSON local (`$FINANCEAI_STATE_FILE`), pour
>   prototyper sans Google ;
> - **`DriveStateSource`** (recommandé) — le **même blob Drive que l'app** → synchro
>   automatique (Claude écrit, l'app récupère). Activée par `npm run mcp:auth`.
>
> Les tools (lecture + écriture) sont identiques quelle que soit la source.

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
| `get_holdings` | Liste les PLACEMENTS individuels (chaque titre) : symbole, nom, quantité, prix natif (USD/EUR/CAD), devise, **valeur CAD** (source unique `assetValueCad`), compte, rendement — trié par valeur, avec total et ventilation par compte. Répond à « qu'est-ce que je détiens », « ma plus grosse position », « combien en CELI » |
| `get_projection` | Projection long terme sur SES vraies données (valeur nette dans le temps, âge d'épuisement éventuel). `includeSeries: true` → série ANNUELLE exacte (patrimoine nominal/réel, comptes, dettes, par âge) pour tracer des graphiques |
| `simulate_what_if` | « Si j'achète une voiture demain ? » — changements HYPOTHÉTIQUES (achat ponctuel ou financé, salaire ±, dépense récurrente, nouvelle dette, achat immobilier) simulés sur SES vraies données : le moteur roule 2× (avec/sans) → deltas de patrimoine à 1/2/5/10/20 ans, impact FIRE/impôts, hypothèses explicites, séries annuelles base+scénario pour graphiques comparés. Aucun chiffre inventé : tout sort du moteur |
| `get_tax_situation` | Situation fiscale réelle, calculée **PAR CONJOINT puis sommée** (fiscalité canadienne individuelle — jamais de fusion des 2 salaires) : impôt fédéral/QC, marginal par conjoint (`perUser`), espace REER/CELI du ménage. **v0.7.3** : assiette imposable = salaire + revenu de placement estimé (`taxableInvestmentIncome`, même base que l'onglet Impôt) ; cotisations RRQ/RQAP/AE sur le SALAIRE seul (`[FISC-PAYROLL-BASE-INVEST]`) ; `averageRatePct` sur l'assiette imposable réelle |
| `get_retirement_outlook` | Perspective retraite/FIRE : âge cible/FIRE, revenu décomposé (rentes RRQ/PSV + pensions privées + **décaissement du portefeuille** REER/CELI + loyers, moyenne 1re année, $ d'aujourd'hui), verdict `meetsIncomeTarget` basé sur la **soutenabilité du plan** (minNetWorth + Monte Carlo), pas sur les rentes seules |
| `get_next_best_actions` | Prochaines meilleures actions priorisées (REER vs CELI, dette, coussin, etc.) |
| `search_transactions` | Recherche dans SES transactions (filtre texte/catégorie/montant) |

### Écriture (Lot 2) — ingestion de documents
Claude lit la pièce jointe (PDF/image) et en extrait les valeurs ; le tool ne fait que la **fusion sûre**
(sauvegarde horodatée avant écriture — fichier `.bak` local en mode fichier, **backup Drive**
`financeai-sync.json.<ISO>.bak.json` rolling 5 dans appDataFolder en mode Drive — dédup, résumé).
Écriture Drive protégée par une **garde de concurrence** : si l'app a synchronisé entre la lecture et
l'écriture, le tool refuse (rien d'écrasé) et invite à relancer. Exposés uniquement si une source
**inscriptible** est configurée.

| Tool | Effet |
|------|-------|
| `apply_payslip` | Fiche de paie → salaire brut/net (annuel → mensuel) + REER de l'utilisateur ciblé. v0.7.1 : `employer` (provenance `salarySource`, affichée dans l'onglet Impôt) |
| `apply_bank_statement` | Ajoute les transactions (dédup date+montant+marchand), compte optionnel |
| `apply_broker_statement` | Met à jour / ajoute les positions (par symbole + compte fiscal) |
| `apply_tax_slip` | T4 / RL-1 → revenu d'emploi annuel (→ brut mensuel) + cotisations REER |
| `apply_debt` | Dette RÉELLE (prêt auto, carte, perso) — ajout ou mise à jour PAR NOM, PARTIELLE (seuls les champs fournis changent ; même nom = écrasement, jamais de doublon). ⚠️ Dettes déjà contractées seulement : la projection les sert dès le mois 0 ; un achat FUTUR/hypothétique passe par `simulate_what_if` |

### Connexion (amorçage)
| `connect_drive` | Autorise le Google Drive de l'utilisateur **dans la conversation** (consentement navigateur, client OAuth partagé) — pour l'install `.mcpb` sans terminal |

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

### Option recommandée — une commande

```bash
npm run mcp:setup
# ou avec un chemin d'état explicite :
npm run mcp:setup -- "/chemin/vers/financeai-state.json"
```

Écrit (ou met à jour) l'entrée `financeai` dans le `claude_desktop_config.json` de
Claude Desktop avec des **chemins absolus** (`node` courant + `tsx` + `mcp/stdio.ts`),
sans dépendre de `npx`/PATH et en gérant les espaces dans le chemin (OneDrive…).
Les autres serveurs MCP déjà configurés sont préservés. Par défaut, l'état est
attendu à `~/financeai-state.json`. Ensuite : quitter **complètement** Claude
Desktop et le rouvrir ; vérifier **Settings → Developer** (`financeai` = `running`).

### Option manuelle

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

Redémarrer Claude Desktop. Les tools apparaissent dans le sélecteur MCP.

## Transport HTTP (Streamable HTTP) — chantier claude.ai (Lot 2)

Pour brancher **claude.ai (web/mobile)**, le serveur doit être joignable en HTTP.
L'entrée `mcp/http.ts` expose le MÊME registre de tools en **Streamable HTTP** :

```bash
npm run mcp:http          # local : http://127.0.0.1:8080/mcp (santé : /health)
MCP_HTTP_PORT=9090 npm run mcp:http   # port custom
```

- **Sessions** : `initialize` → en-tête `mcp-session-id`, à renvoyer sur chaque requête
  (POST/GET/DELETE `/mcp`). Sessions inactives fermées après 1 h.
- **Local par défaut = loopback** (`127.0.0.1`) + protection anti-DNS-rebinding (Host + Origin).
  Sur **Cloud Run**, `$PORT` est défini par la plateforme → écoute `0.0.0.0:$PORT`.
  Un hôte non-loopback SANS `$PORT` est **refusé au démarrage** (données financières sans auth) —
  opt-in explicite `MCP_HTTP_ALLOW_EXPOSED=1` en connaissance de cause.
- Corps de requête plafonné (5 Mo → 413) ; arrêt SIGTERM borné (grâce 5 s puis fermeture forcée loguée).
- Le mode **stdio** (`npm run mcp:dev`, Claude Desktop) reste inchangé.
- **Authentification (Lot 3)** : définir `FINANCEAI_OAUTH_SIGNING_KEY` (≥32 car.) +
  `FINANCEAI_ACCESS_KEY` (≥16 car.) + `FINANCEAI_PUBLIC_URL` active un **OAuth 2.1
  mono-utilisateur** : `/mcp` exige alors un Bearer, claude.ai fait le flux
  authorize/token, et la « porte » est ta clé d'accès (saisie une fois). Sans ces
  variables, le serveur refuse de démarrer sur un hôte exposé (loopback seulement).
  Le refresh token Google va en **Secret Manager** si `FINANCEAI_GOOGLE_SECRET` est
  défini (Cloud Run), sinon dans le fichier local.

### Générer les clés (PowerShell — poste de Marc, openssl absent)

```powershell
# clé de signature (48 octets) et clé d'accès (24 octets)
node -e "console.log('SIGNING=' + require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log('ACCESS='  + require('crypto').randomBytes(24).toString('base64url'))"
```

## Hub perso — GET /hub/summary (HUB-01)

Le serveur HTTP expose un résumé pour le dashboard du hub (`hubperso.com`), conforme au
contrat [`@mokarade/hub-contract` v1](https://github.com/MoKarade/hub-contract) (pinné
`#v1.0.0` dans `package.json`) :

- **Activation** : définir `FINANCEAI_HUB_TOKEN` (≥16 caractères — refus de démarrer
  sinon). Sans la variable, la route n'existe pas (404).
- **Auth** : le hub envoie le header `x-hub-token` ; comparaison en temps constant,
  **401** si absent ou invalide. Réponse toujours en `Cache-Control: no-store`.
- **Données** : VRAIES métriques (`buildFinancialOverview`) + signaux financiers
  (`mcp/financialSignals.ts`, partagés avec `get_next_best_actions`) → metrics/alerts.
  État de plus de 6 h (`freshness`) → `status: "degraded"` + `dataAsOf` ; état illisible
  → summary `status: "error"` (HTTP 200) — le widget montre la panne, jamais du vide.

### En local (stdio n'expose rien ; HTTP seulement)

```powershell
# jeton (≥16 caractères)
node -e "console.log('HUB=' + require('crypto').randomBytes(24).toString('base64url'))"
# puis
$env:FINANCEAI_HUB_TOKEN="le-jeton" ; npm run mcp:http
```

### Sur Cloud Run — via Secret Manager (durable)

⚠️ Poser `FINANCEAI_HUB_TOKEN` à la main avec `gcloud run services update --update-env-vars`
**ne marche pas durablement** : (1) ça ne rebuild pas l'image (le code `/hub/summary`
doit être déployé, pas seulement la variable), et (2) le prochain `deploy.sh`
l'efface (`--set-env-vars` remplace tout). Le jeton doit donc vivre dans **Secret
Manager**, comme les clés OAuth — `deploy.sh` le monte alors automatiquement, à chaque
déploiement, s'il existe.

```bash
# 1. Créer le secret (nouveau jeton — occasion de faire la rotation si l'ancien a fuité)
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))" \
  | tr -d '\n' | gcloud secrets create financeai-hub-token --data-file=- --project="$PROJECT_ID"

# 2. Donner au compte de service Cloud Run l'accès en lecture (même SA que les 3 autres secrets)
gcloud secrets add-iam-policy-binding financeai-hub-token \
  --member="serviceAccount:$RUNTIME_SA" \
  --role="roles/secretmanager.secretAccessor" --project="$PROJECT_ID"

# 3. Redéployer : deploy.sh détecte le secret, le monte, et rebuild l'image à jour
PROJECT_ID="$PROJECT_ID" ./mcp/deploy.sh
```

Le hub enverra ce même jeton dans le header `x-hub-token`. Rotation : ajoute une nouvelle
version au secret (`gcloud secrets versions add financeai-hub-token --data-file=-`) puis
redéploie.

## Refresh planifié — POST /refresh (HUB-REFRESH-CRON)

Jusqu'ici, **seule l'app navigateur** poussait l'état dans Drive : dès l'onglet fermé, la
valeur nette figeait (les cours ne bougeaient plus). Cette route permet à un déclencheur
EXTERNE de rafraîchir les prix côté serveur — plus besoin d'ouvrir FinanceAI pour que le
hub soit à jour.

- **Ce que ça fait** : lit le blob Drive, rafraîchit les `currentPrice` via le moteur PARTAGÉ
  (`services/priceRefresh` — devise protégée, changement réel uniquement, provider-aware),
  et RÉÉCRIT le blob avec la garde de concurrence OCC (`save(next, version)`). **Ne touche
  QUE les cours** : dettes, budgets, relevés saisis ne sont jamais modifiés. Aucun prix
  inventé — un symbole sans provider est SKIPPÉ avec sa raison (no-fake-data).
- **Activation** : définir `FINANCEAI_REFRESH_SECRET` (≥16 caractères — refus de démarrer
  sinon). Sans la variable, la route n'existe pas (404), comme `/hub/summary`.
- **Auth** : header `Authorization: Bearer <secret>` ; comparaison en temps constant,
  **401** si absent ou invalide. Réponse `Cache-Control: no-store`.
- **Réponse** : `200 { ok:true, saved, refreshed[], unchanged[], skipped[] }` au succès. Un
  conflit de concurrence (l'app a poussé au même instant) renvoie `200 { ok:false, conflict:true }`
  — TRANSITOIRE, le prochain tick réessaie (le cron ne rougit pas). Une panne RÉELLE (Drive
  injoignable, jeton révoqué, coffre chiffré) renvoie un **5xx** → le job GitHub rougit et alerte,
  au lieu de rester vert sur des prix figés. Le secret n'est jamais dans le corps.
- **Cours des actions** : nécessite une clé Finnhub (`FINANCEAI_FINNHUB_KEY`). Sans elle,
  seule la crypto (CoinGecko, sans clé) est rafraîchie — le serveur le journalise au boot.

### Le déclencheur : GitHub Actions planifié (gratuit)

Cloud Run dort (scale-to-zero) : un `setInterval` interne ne tournerait pas. Un cron
EXTERNE le réveille. GitHub Actions est gratuit et sans la limite « 1×/jour » de Vercel Hobby
→ `.github/workflows/refresh-prices.yml` (toutes les 6 h + déclenchement manuel). Il POST
`${MCP_URL}/refresh` avec le Bearer et « rougit » seulement si le serveur est injoignable.

Secrets GitHub à créer (Settings → Secrets and variables → Actions) :

```
FINANCEAI_MCP_URL        = https://financeai-mcp-xxxx.run.app   # URL du service Cloud Run
FINANCEAI_REFRESH_SECRET = <le même secret que Cloud Run>
```

### Sur Cloud Run — via Secret Manager (comme le hub)

Même logique que `financeai-hub-token` : le secret vit dans Secret Manager, `deploy.sh` le
monte automatiquement s'il existe (survit à chaque redéploiement).

```bash
# 1. Le secret d'auth du refresh (≥16 caractères ; garde-le, c'est le même côté GitHub)
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))" \
  | tr -d '\n' | gcloud secrets create financeai-refresh-secret --data-file=- --project="$PROJECT_ID"

# 2. (Optionnel mais recommandé) la clé Finnhub, pour rafraîchir aussi les ACTIONS
printf '%s' "TA_CLE_FINNHUB" \
  | gcloud secrets create financeai-finnhub-key --data-file=- --project="$PROJECT_ID"

# 3. Accès en lecture au compte de service Cloud Run (même SA que les autres secrets)
for S in financeai-refresh-secret financeai-finnhub-key; do
  gcloud secrets add-iam-policy-binding "$S" \
    --member="serviceAccount:$RUNTIME_SA" \
    --role="roles/secretmanager.secretAccessor" --project="$PROJECT_ID"
done

# 4. Redéployer : deploy.sh détecte les secrets, les monte, rebuild l'image à jour
PROJECT_ID="$PROJECT_ID" ./mcp/deploy.sh
```

Rotation : `gcloud secrets versions add financeai-refresh-secret --data-file=-`, mets à jour
le secret GitHub `FINANCEAI_REFRESH_SECRET`, puis redéploie.

## Synchronisation Google Drive (auto) — recommandé

Au lieu d'exporter un fichier, le connecteur lit/écrit le **même blob Drive que l'app**
→ Claude voit les données à jour et ses écritures reviennent dans l'app (polling app 60 s + au focus).

```bash
# autorise une fois (consentement Google, refresh token stocké en local) :
npm run mcp:auth            # utilise le client OAuth FinanceAI PARTAGÉ (rien à créer dans Google Cloud)
# ou ton propre client OAuth « Desktop » :
npm run mcp:auth -- <client_id> <client_secret>
# tout-en-un (config Claude Desktop + autorisation) :
npm run mcp:connect
```

- Client OAuth « Desktop » partagé résolu via `$GOOGLE_DESKTOP_CLIENT_ID/SECRET` ou
  `mcp/drive/connector-client.json` (gitignoré, cf `.example`). Secret « Desktop »
  non-confidentiel par design (Google) — jamais commité.
- Au boot, `stdio.ts` choisit **Drive** si autorisé (`~/.financeai-mcp/credentials.json`),
  sinon le **fichier** local. Chaque utilisateur consent avec SON Google → SON Drive (isolé).
- ⚠️ Une **passphrase** active (coffre chiffré) empêche le connecteur de lire le Drive
  (message clair « retire la passphrase »).

## Déployer sur Cloud Run → utiliser depuis claude.ai (web + téléphone)

Pour parler à Claude de tes finances depuis le **web ou le téléphone** (pas seulement
Claude Desktop), le serveur MCP doit être hébergé. Recette Google Cloud Run. Coût :
**quasi nul** en `min-instances 0` (scale-to-zero — tu ne paies que les requêtes, ~0 $
à l'usage solo ; contrepartie : un cold start de ~2 s au réveil, qui vide le cache
anti-rejeu OAuth en mémoire). `MIN_INSTANCES=1` supprime le cold start et garde le cache
chaud, mais facture le temps d'inactivité (non gratuit). ⚠️ Commandes `gcloud`.

### Une fois (préparation GCP)

1. **Projet + CLI** : crée un projet sur console.cloud.google.com, installe `gcloud`,
   puis `gcloud auth login` et `gcloud config set project <TON_PROJET>`.
2. **Active les API** :
   ```
   gcloud services enable run.googleapis.com secretmanager.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
   ```
3. **Génère tes 2 clés** (PowerShell natif — pas d'openssl) :
   ```
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # clé de signature
   node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"   # TA clé d'accès (garde-la)
   ```
4. **Crée les 3 secrets** (colle chaque valeur quand demandé ; pour le refresh Google,
   lance d'abord `npm run mcp:auth` en local puis prends le contenu de
   `~/.financeai-mcp/credentials.json`) :
   ```
   gcloud secrets create financeai-oauth-signing-key --data-file=-   # colle la clé de signature, Ctrl+Z Entrée
   gcloud secrets create financeai-access-key        --data-file=-   # colle TA clé d'accès
   gcloud secrets create financeai-google-refresh    --data-file=credentials.json
   ```
5. **Donne au service l'accès aux 3 secrets** (le compte de service Cloud Run par défaut lit
   les 2 clés OAuth montées en env ET le refresh Google à l'exécution — les 3 sont requis, sinon
   la révision échoue « permission denied ») :
   ```
   $SA="<NUM>-compute@developer.gserviceaccount.com"   # <NUM> = numéro de projet (gcloud projects describe <TON_PROJET>)
   gcloud secrets add-iam-policy-binding financeai-oauth-signing-key --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"
   gcloud secrets add-iam-policy-binding financeai-access-key        --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"
   gcloud secrets add-iam-policy-binding financeai-google-refresh    --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"
   ```

### Déployer

```
# Windows PowerShell : $env:PROJECT_ID="ton-projet"; bash mcp/deploy.sh
PROJECT_ID=ton-projet ./mcp/deploy.sh
```
Le script déploie, récupère l'URL publique, puis re-déploie avec `FINANCEAI_PUBLIC_URL`
(l'issuer OAuth). Il affiche à la fin l'URL du connecteur (`https://…run.app/mcp`).

### Brancher claude.ai

Dans claude.ai (ou l'app mobile) → **Settings → Connectors → Add custom connector** →
colle `https://…run.app/mcp`. Claude découvre l'OAuth tout seul ; à la connexion, entre
**ta clé d'accès**. C'est fait — pose « si j'achète une voiture demain ? » sur tes vrais chiffres.

### Déploiement continu (optionnel)

`.github/workflows/deploy-mcp.yml` redéploie à chaque push `main` touchant le serveur, via
Workload Identity Federation (aucune clé de service en secret GitHub). Il ne tourne que si
les variables de repo `GCP_PROJECT_ID` + secrets `GCP_WIF_PROVIDER`/`GCP_DEPLOY_SA` sont
configurés — sinon il est ignoré (le déploiement manuel `mcp/deploy.sh` reste toujours valable).

> ⚠️ **Avant l'exposition publique** (cf `docs/BACKLOG.md` §MCP-CLOUDRUN-AUTH-HARDENING) :
> `FINANCEAI_ACCESS_KEY` DOIT être générée aléatoirement (étape 3), `min-instances 1`
> évite de vider le cache anti-rejeu à froid, et un rate-limit sur `/oauth/authorize`
> est recommandé. Kill-switch en cas d'incident : régénère `financeai-oauth-signing-key`
> (`gcloud secrets versions add`) PUIS force une nouvelle révision
> (`gcloud run services update <service> --region <region>`) — sinon une instance déjà
> chaude garde l'ancienne clé en mémoire et les jetons émis restent valides jusqu'à expiration.

## Installation 1 clic (bundle `.mcpb`)

Pour distribuer le connecteur sans terminal (Node est embarqué dans Claude Desktop) :

```bash
npm run mcp:pack            # → dist/FinanceAI.mcpb (esbuild bundle + manifest .mcpb v0.3 + client partagé)
```

L'utilisateur télécharge le `.mcpb`, l'ouvre (Claude Desktop l'installe en 1 clic), puis
dit « connecte mes finances » (tool `connect_drive`). La carte **« Connecter à Claude »**
(Réglages → Système de l'app) propose ce téléchargement (`VITE_CONNECTOR_MCPB_URL`,
défaut `/financeai-connector.mcpb`).

## Test rapide depuis Claude Desktop

Calculatrice (sans état) :
- « Ping mon MCP financeai »
- « Combien d'espace CELI me reste-t-il si je suis né en 1992, arrivé au Canada en 2010, qu'on est en 2026 et que j'ai déjà 25k$ dedans ? »
- « Calcule les coûts d'achat d'un duplex à 600k$ avec 20% de mise de fonds à 5% sur 25 ans »

Sur tes vraies données (data-aware) :
- « Donne-moi une vue d'ensemble de mes finances » → `get_financial_overview`
- « Qu'est-ce que je détiens ? Quelle est ma plus grosse position ? » → `get_holdings`
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
Claude Desktop / bundle .mcpb
     |
     |-- stdio --> mcp/stdio.ts ── source = DriveStateSource (si autorisé)  sinon  FileStateSource
                       |                          \__ makeStateStore (cache + get + save) __/
                       v                                          |
                 mcp/server.ts (registry)                         v
        +----------------+----------------+----------------+   AppState réel (read+write)
        |                |                |                |   (Drive blob OU fichier JSON)
   sans état        data-aware (read)  écriture (write)  connexion
   ping, …          get_financial_*,   apply_payslip,    connect_drive
                    get_projection, …  apply_bank/broker/tax
        |                |                |
        v                v                v
   services purs    moteur pur (projection,    applyDocument (fusion pure)
   (tax, realEstate) tax, snapshot, params)    → store.save → sauvegarde + écriture sûre
```

## Roadmap

- **Lot 0 (livré)** : adaptateur pur `AppState → SimulationParams` + `buildFinancialSnapshot`.
- **Lot 1 (livré)** : 6 tools data-aware (lecture) sur fichier local (stdio).
- **Lot 2 (livré)** : ingestion de documents — `apply_payslip` / `_bank_statement` /
  `_broker_statement` / `_tax_slip` → écriture gardée (sauvegarde horodatée, dédup).
- **Lot 3 (livré, local)** : source **`DriveStateSource`** (même blob que l'app) +
  **OAuth local** (loopback, `mcp:auth`) + **polling app** + bundle **`.mcpb`** 1 clic +
  client OAuth partagé. Cf `docs/MCP_CONNECTOR_DESIGN.md`.
- **Reste (backlog)** : héberger le `.mcpb` + test install réel ; ouverture bêta
  (mode Test Google → vérification `drive.appdata`) ; option transport HTTP distant
  (claude.ai de partout, nécessiterait un backend de tokens).
