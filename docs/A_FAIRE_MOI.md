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
- [x] ~~Action `backlog-autocheck`~~ — **RETIRÉE (2026-06-09, demande Marc)** : workflow + script
  supprimés, conditions `[skip-backlog]` retirées de `ci.yml`. Désormais **Claude coche lui-même**
  le BACKLOG au merge de chaque PR (cf CLAUDE.md « Backlog tenu par Claude »). Plus rien à valider.
- [ ] **Supprimer 14 branches mortes (30 s)** — le proxy git de l'exécution cloud REFUSE la
  suppression de branches (403, Claude ne peut pousser que sur sa branche de session) ; à faire
  depuis ton PC (ou GitHub → Branches). Toutes mergées ou de PR fermée (#123) — aucune perte :
  ```
  git push origin --delete claude/audit-fixes claude/couple-fiscal-a1 \
    claude/e2e-refresh-screenshots claude/mcp-connector-design claude/mcp-lot0-lot1 \
    claude/multiuser-epic1 claude/peaceful-bell-YaBUD claude/polish-marginal \
    claude/post-main-salvage claude/retraite-tax-precise claude/runbook-multiuser \
    claude/sync-passphrase claude/loving-faraday-r2GYW chore/refresh-screenshots-27157396499
  ```
  💡 Pour l'avenir : GitHub → Settings → General → cocher **« Automatically delete head branches »**
  (les branches de PR mergées disparaîtront seules ; c'est déjà le cas des branches de session Claude).
- [ ] **Débloquer l'auto-merge (2 min) — supprime l'attente active de Claude sur chaque PR** :
  1. Settings → General → cocher **« Allow auto-merge »** ;
  2. Settings → Branches → règle sur `main` → **Require status checks to pass** → cocher
     `Lint / Typecheck / Tests / Build` et `E2E (Playwright / Chromium)`.
  Sans checks REQUIS, GitHub refuse d'armer l'auto-merge (testé 2026-06-09 sur #219 : « unstable »).
  Une fois fait, Claude arme l'auto-merge à la création de chaque PR et passe à la suite.
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
