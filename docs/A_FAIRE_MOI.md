# À FAIRE — Marc (tâches humaines) + blocages remontés par Claude

> Ce que **Claude ne peut pas faire seul** (comptes Google/Drive/Cloudflare/Vercel,
> ressenti visuel sur device, secrets) + les **blocages** que Claude découvre en
> chemin. Claude **ajoute** ici ; Marc coche. Détail des tests manuels par onglet :
> `docs/MANUAL_TEST_CHECKLIST.md`. Tâches que Claude peut faire : `docs/BACKLOG.md`.

---

## O1 — Auth : sortir de Cloudflare Access
- [ ] **Cloudflare Access encore EN PLACE** (verrouillé sur l'email de Marc). Cible =
  bascule sur le **gate Google in-app** (ADR 010) pour ouvrir à d'autres utilisateurs.
  Claude guide ; la désactivation Cloudflare est une action Marc (dashboard CF).

## O2 — Connecteur MCP : héberger le `.mcpb` (1 clic)
Le code est prêt et déployé ; il manque l'hébergement du bundle (Marc avait signalé
« le fichier mcp arrive pas à télécharger » — cause : `.mcpb` jamais hébergé).
- [ ] Créer `mcp/drive/connector-client.json` (copier `.example`) avec le client OAuth
  **« Desktop » PARTAGÉ** (id + secret). **Gitignoré** — jamais commité.
- [ ] `npm run mcp:pack` → `dist/FinanceAI.mcpb`.
- [ ] Héberger : déposer dans `public/financeai-connector.mcpb` (redéployer) **ou**
  pointer `VITE_CONNECTOR_MCPB_URL` vers une release.
- [ ] Tester l'install 1 clic (Claude Desktop) + « connecte mes finances » → vraies données.

## O3 — Prouver la sync Drive en réel (P0 produit multi-user)
- [ ] Créer le `VITE_GOOGLE_CLIENT_ID` (absent → sync inerte) ; cf `docs/GOOGLE_DRIVE_SETUP.md`.
- [ ] Fenêtre privée neuve → login Google → toutes les données + clés API reviennent
  (cf checklist `docs/BACKLOG.md` § sync).

## O4 — Proxy backend pour la clé Anthropic (P0 multi-user)
- [ ] `services/claude.ts` utilise `dangerouslyAllowBrowser` (clé exposée côté navigateur —
  OK solo, inacceptable pour des tiers). Cible : Vercel Edge (free tier). Claude peut coder
  le proxy ; le déploiement + secret Vercel = action Marc.

## O5 — Validations manuelles sur device (ressenti / prod)
- [ ] Fluidité zoom 60 fps sur tous les onglets ; PDF complet ; iOS Safari ; Lighthouse re-run.
  Liste vivante détaillée : `docs/BACKLOG.md` § « Tests manuels ».

---

## Blocages / trous remontés par Claude (gouvernance G0, 2026-06-05)
- [ ] **Action `backlog-autocheck` à créer** : CLAUDE.md (cochage auto du backlog via préfixe
  `[ID]`) et le garde `[skip-backlog]` de `ci.yml` la supposent, mais aucun workflow
  `.github/workflows/backlog-autocheck.yml` n'existe. Tant qu'elle manque, **Claude coche le
  backlog à la main** (exception documentée). C'est un bot qui **commit sur `main`** → Marc
  doit valider l'approche avant que Claude le crée (risque de boucle CI / commits auto).
- [x] **9 agents projet + `/review-all`** : étaient absents (`.claude/` était gitignoré en
  entier) → **créés par Claude** dans G0 et `.claude/` désormais committé pour les parties projet.
- [x] **CLAUDE.md + hooks absents du repo** → installés dans G0 (push/merge autonome, guard
  laisse passer le push).
- [ ] **Agents GLOBAUX (`~/.claude/agents/`)** : référencés par CLAUDE.md mais propres à chaque
  machine. En exécution **cloud**, Claude n'y a pas accès (seuls les agents projet committés et
  les agents génériques du harness sont dispo). Sur les PC de Marc, ils restent à installer via
  claude-config / ECC si voulu.
- [ ] **Docs périmées à resynchroniser** (non bloquant) : `SESSION_HANDOVER.md` cite encore
  1154 tests / PR #116 / Cloudflare comme auth « courante » ; réel = ~1704 tests, dernier merge
  bien plus loin. À rafraîchir lors de la prochaine grosse livraison.
