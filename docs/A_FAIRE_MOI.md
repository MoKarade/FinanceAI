# À FAIRE — Marc (tâches humaines) + blocages remontés par Claude

> Ce que **Claude ne peut pas faire seul** (comptes Google/Drive/Cloudflare/Vercel,
> ressenti visuel sur device, secrets) + les **blocages** que Claude découvre en
> chemin. Claude **ajoute** ici ; Marc coche. Détail des tests manuels par onglet :
> `docs/MANUAL_TEST_CHECKLIST.md`. Tâches que Claude peut faire : `docs/BACKLOG.md`.

---

## O1 — Auth : RETIRER Cloudflare → ✅ **FAIT (2026-06-16)**
> Cloudflare RETIRÉ de FinanceAI : Access (mur) supprimé + apex/www dé-proxifiés (DNS only → Vercel TLS direct).
> Auth = **gate Google in-app** actif (`VITE_GOOGLE_GATE=1`). Le tunnel CF du `hub` reste (projet séparé).
> ⚠️ Piège vécu : le client OAuth était PARTAGÉ avec CF Access (redirect_uri `cdn-cgi/access/callback`) → l'avoir
> retiré cassait le login CF → restauré le temps de valider, puis CF retiré proprement.

- [x] **A. Client OAuth Google créé** (`550313627083-…`, débloque aussi la sync Drive).
- [x] **B. Gate activé** : `VITE_GOOGLE_CLIENT_ID` + `VITE_GOOGLE_GATE=1` (Vercel) + redéployé.
- [x] **C. Validé** : login Google → données reviennent ; `?nogate=1` OK ; reload sans re-login.
- [x] **D. Cloudflare retiré** : app Access supprimée ; apex+www en « DNS only » (gris) → Vercel.
- [x] **E. CSP nettoyée** par Claude (`cloudflareinsights` retiré de `vercel.json` + `index.html`) + docs MAJ.
- **Ce que ça engendre** : tu PERDS l'auth CF (→ gate Google, qui ouvre au multi-user), le WAF/anti-bot/DDoS
  CF, et CF Web Analytics. Tu GARDES TLS + CDN (Vercel). Bonus : disparition d'un déclencheur du bug
  « Failed to fetch chunk » (CF Access 302 sur session expirée, PH1-b). **Risque** : plus de WAF/DDoS CF —
  acceptable en perso/petit groupe ; pour un vrai produit public → backend + rate-limiting (O4/P0-PROXY).
- **Côté Claude (sur ton GO)** : CSP cleanup (E), durcir le gate (bouton « déconnexion », sélecteur de
  compte), MAJ docs (CLAUDE.md « Cloudflare en place » → retiré, SESSION_HANDOVER). Claude ne fait RIEN
  qui expose l'app avant ta confirmation que le gate est validé.

## O6 — Questions du brief 2026-06-10 (réponses requises, Claude ne devine pas)
- [x] ~~**Q2 (Phase 1 / Cloudflare)** / **Analyse Cloudflare (PH1-b)**~~ — **CADUC (2026-06-16)** : Cloudflare complètement retiré (O1). Apex+www en DNS only → Vercel direct.
- [ ] **Q1 (Phase 4 / Futur — à répondre avant que Claude code PH4-FUT)** : qu'est-ce que tu veux
  voir ANNOTÉ sur la courbe ? (âge de retraite ? épuisement d'un compte ? bascule de stratégie ?
  début RRQ/PSV ? autre ?)

## O2 — Connecteur MCP : héberger le `.mcpb` (1 clic)
Le code est prêt et déployé ; il manque l'hébergement du bundle (Marc avait signalé
« le fichier mcp arrive pas à télécharger » — cause : `.mcpb` jamais hébergé).
- [ ] Créer `mcp/drive/connector-client.json` (copier `.example`) avec le client OAuth
  **« Desktop » PARTAGÉ** (id + secret). **Gitignoré** — jamais commité.
- [ ] `npm run mcp:pack` → `dist/FinanceAI.mcpb`.
- [ ] Héberger : déposer dans `public/financeai-connector.mcpb` (redéployer) **ou**
  pointer `VITE_CONNECTOR_MCPB_URL` vers une release.
- [ ] Tester l'install 1 clic (Claude Desktop) + « connecte mes finances » → vraies données.

## O8 — Déployer le serveur MCP sur Cloud Run → claude.ai web/mobile (Lot 4 livré, actions GCP restantes)
Le code des 4 lots est mergé (what-if + séries, transport HTTP, OAuth 2.1, Docker/deploy/CI). Pas-à-pas
COMPLET dans `mcp/README.md` § « Déployer sur Cloud Run ». Résumé des actions Marc (Google Cloud, ~15 min) :
- [ ] Projet GCP + `gcloud auth login` + activer les API (run, secretmanager, cloudbuild, artifactregistry).
- [ ] Générer 2 clés (`node -e "…randomBytes…"` — PowerShell natif, cf README) : signature + **ta clé d'accès**.
- [ ] `npm run mcp:auth` en local → créer les **3 secrets** Secret Manager (signing-key, access-key,
  google-refresh depuis `~/.financeai-mcp/credentials.json`) + IAM `secretAccessor` sur google-refresh.
- [ ] `PROJECT_ID=… ./mcp/deploy.sh` → récupère l'URL `https://…run.app/mcp`.
- [ ] claude.ai (ou mobile) → Settings → Connectors → Add custom connector → coller l'URL → autoriser avec la clé d'accès.
- [ ] (Optionnel) déploiement continu : configurer `GCP_PROJECT_ID` (var repo) + `GCP_WIF_PROVIDER`/`GCP_DEPLOY_SA` (secrets).
- ⚠️ **Avant exposition** (BACKLOG `MCP-CLOUDRUN-AUTH-HARDENING`) : clé d'accès aléatoire (fait à l'étape 2),
  `min-instances 1` (déjà dans deploy.sh), rate-limit `/oauth/authorize` recommandé. Kill-switch : régénérer signing-key.
- (Optionnel) définir `VITE_MCP_SERVER_URL` sur Vercel → la carte « Connecter à Claude » de l'app affiche l'URL du connecteur.

## O3 — Prouver la sync Drive en réel (P0 produit multi-user)
- [x] ~~Créer le `VITE_GOOGLE_CLIENT_ID`~~ — ✅ **FAIT (O1-A)** : client OAuth Google déployé.
- [ ] **Valider sur hubperso.com** : fenêtre privée neuve → login Google → toutes les données + clés API reviennent
  (cf checklist `docs/BACKLOG.md` § sync).

## O4 — Relais BYOK pour Claude (P0-PROXY, dark-launch awaiting env+flag)
Code livré (2026-07-06, phases 1-2 seulement) : relais Edge Vercel, token chiffré, anti-abus.
- [ ] **(1) Générer le token** : `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" (PowerShell : openssl absent sur Windows)` → copier.
- [ ] **(2) Poser l'env Vercel SERVEUR** (`PROXY_ACCESS_TOKEN`) : ce token → Settings → Environment Variables
  → Category **Functions** (serveur-side seulement) → `PROXY_ACCESS_TOKEN=<token>`.
- [ ] **(3) Poser l'env build** (`VITE_PROXY_ACCESS_TOKEN`) → Category **Production** (ou **Preview** pour tester)
  → `VITE_PROXY_ACCESS_TOKEN=<token>`.
- [ ] **(4) Redéployer** Vercel (les nouvelles vars sont injected au build+Functions).
- [ ] **(5) Smoke test** : dans l'app prod, activeR une fonction IA (« Résumer mes finances »). Doit fonctionner.
- [ ] **(6) OPTIONNEL — basculer le transport** : une fois satisfait, poser `VITE_CLAUDE_TRANSPORT=proxy` (Production)
  pour passer du relais par défaut (Vision en direct pour l'instant). Redéployer. Note : rollback = retirer le flag.

⚠️ **Aucune clé Anthropic serveur à créer** — le relais utilise TA clé client (via le navigateur au premier appel
  token=null), puis la chiffre via le token Vercel, réemballe + envoie à Anthropic. Zéro exposition cloud.

## O5 — Validations manuelles sur device (ressenti / prod)
- [ ] Fluidité zoom 60 fps sur tous les onglets ; PDF complet ; iOS Safari ; Lighthouse re-run.
  Liste vivante détaillée : `docs/BACKLOG.md` § « Tests manuels ».
- [ ] **[RECH-ACTION-UX] confirmer le bug « sélectionner le prix fait quitter la page »** avec une **clé Finnhub
  configurée** (Investissement → Ajouter une action → tape un nom → sélectionne une suggestion). Le dropdown
  d'autocomplétion n'apparaît qu'avec une clé, que je n'ai pas en dev → je n'ai pas pu reproduire le symptôme
  exact. J'ai corrigé la cause la plus évidente (Escape fermait toute la modale, désormais ferme juste le menu,
  testé) + agrandi le dropdown + fallback gracieux si le symbole n'a pas de cours. Si le bug persiste avec ta
  clé, dis-moi **exactement** quel geste le déclenche (clic suggestion ? « Suggérer prix historique » ? Entrée ?).

---

## Blocages / trous remontés par Claude (gouvernance G0, 2026-06-05)
- [x] ~~Action `backlog-autocheck`~~ — **RETIRÉE (2026-06-09, demande Marc)** : workflow + script
  supprimés, conditions `[skip-backlog]` retirées de `ci.yml`. Désormais **Claude coche lui-même**
  le BACKLOG au merge de chaque PR (cf CLAUDE.md « Backlog tenu par Claude »). Plus rien à valider.
- [x] **Branches mortes supprimées (2026-06-15)** — 16 distantes (12 mergées + `jolly-davinci-PQpC1`
  qui portait 56 PR + `dependabot` PR #286 fermée + `chore/refresh-screenshots` + `loving-faraday`)
  via l'API GitHub, et 7 locales mergées. `main` est désormais la **seule** branche (local + distant).
  « Automatically delete head branches » est coché → les branches de PR mergées disparaissent seules.
- [x] **Auto-merge débloqué + prouvé (2026-06-15)** — « Allow auto-merge » coché ; ruleset `main`
  exige `Lint / Typecheck / Tests / Build` + `E2E (Playwright / Chromium)`. 4 PR (#288→#291) mergées
  seules dès CI verte cette session, zéro intervention. Claude arme `--auto --squash` à la création de
  chaque PR. (Reste à vérifier d'un œil le **bypass actor** de la ruleset — une app autorisée à contourner.)
- [x] **9 agents projet + `/review-all`** : étaient absents (`.claude/` était gitignoré en
  entier) → **créés par Claude** dans G0 et `.claude/` désormais committé pour les parties projet.
- [x] **CLAUDE.md + hooks absents du repo** → installés dans G0 (push/merge autonome, guard
  laisse passer le push).
- [ ] **Agents GLOBAUX (`~/.claude/agents/`)** : référencés par CLAUDE.md mais propres à chaque
  machine. En exécution **cloud**, Claude n'y a pas accès (seuls les agents projet committés et
  les agents génériques du harness sont dispo). Sur les PC de Marc, ils restent à installer via
  claude-config / ECC si voulu.
- [x] **Docs périmées resynchronisées (PR #351, 2026-06-18)** : table §1 de `SESSION_HANDOVER.md` mise à
  jour (#292/2042 tests/Cloudflare → #350/~2077 tests/gate Google in-app). Le reste du HANDOVER (bandeau de
  tête + sessions) était déjà à jour.


## Décisions design Phase 4 (Claude a fait tout l'autonome — 12 PR #250-261)
> Les gains CONCRETS des onglets Futur/Investissement/Transactions/Retraite sont livrés. Restent 2
> refontes purement DESIGN qui ont besoin de ta vision (Claude refuse de deviner = risque hors-sujet) :
- **[PH4-BUD] Budget — refonte complète** : donne 2-3 irritants concrets (ce qui te gêne aujourd'hui)
  pour cadrer. Pistes Claude : vue prévu/réel par groupe (Besoin/Envie/Épargne) en tête ; lien
  budget→projection plus visible ; réduire les sous-sections.
- **[PH4-FUT] annotations sur la courbe (Q1 de ton brief)** : QUOI annoter ? (âge retraite / épuisement
  d'un compte / bascule de stratégie / événements de vie). + « Paramètres » renommé/allégé, conseils du
  plan d'action déclinés mois/trimestre/semestre/année.


## O7 — Valeurs fiscales RQ 2026 requises + décisions (résolu 2026-07-06)
- [x] ✅ **[FISC-WELCOME-2026]** — données reçues 2026-07-06. Seuils reste du Québec 2026 (source *Gazette officielle du Québec,
  Partie 1, 2025-06-07*) : **62 900 / 315 000** (indexation +2,3438 % vs 2025). Transcrit `FISCAL_REFERENCE.md` §8.
  Item BACKLOG moisi en 🔧 ACTIONNABLE (effort S une fois les sources). Claude procède.
- [x] ✅ **[W5-TAX-PROXY]** — décision Marc : **(a) garder les proxies plats** (0,45 locatif / 0,36 CCPC) documentés
  en tant qu'estimation de taux marginal QC. Ajouter une mention UI + source QC dans `FISCAL_REFERENCE.md` (rapide).
  Clos, reste UI+doc à Claude.
- [x] ✅ **[HIST-NW-DEBT-DISCLAIMER]** — décision Marc : **(b) disclaimer visuel** sur la zone passée du graphe (honnête,
  zéro fausse donnée). Code documenté (HIST-NW-NO-DEBT), reste le visuel UI → item 🔧 BACKLOG.
- [ ] **[TP1G-VIVANT-SEUL]** — données reçues 2026-07-06. Grille crédit 65+/personne vivant seule (source MFQ fiche 110606)
  : 2 172 $ (base) + supplément monoparental 2 681 $. Seuil revenu 42 955 $. Transcrit `FISCAL_REFERENCE.md` §4.
  Item 🔧 ACTIONNABLE moyen (plan-first + discriminant git-stash + panel).
- [ ] ~~**[FISC-TAXDEC-INCR]**~~ — **À CONFIRMER** : interprétation de la réponse Marc « ok » 2026-07-06. Signifie-t-il
  (a) COD ER le fix risqué (re-baser golden + tests), ou (b) statu quo/différé ? En attente d'un « go » ou « wait »
  explicite avant de coder (risque $ élevé).
