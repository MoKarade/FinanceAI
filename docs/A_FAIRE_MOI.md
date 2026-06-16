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
- [ ] **Q2 (Phase 1 / Cloudflare)** : confirmer que le domaine prod passe bien par le proxy
  Cloudflare (nuage ORANGE dans le dashboard DNS) devant Vercel, et vérifier s'il existe une
  **Page Rule / Cache Rule « Cache Everything »** (c'est le seul cas où CF servirait un
  index.html périmé — par défaut CF ne cache pas le HTML et respecte le `no-cache` d'origine).
- [ ] **Analyse Cloudflare (PH1-b)** — est-il la cause du « Failed to fetch dynamically imported
  module » ? [Probable] déclencheurs réels : (a) deploy Vercel pendant une session ouverte (les
  anciens chunks hashés disparaissent atomiquement) ; (b) **Cloudflare Access** : session expirée →
  la requête du chunk `.js` reçoit un 302 vers la page de login HTML → import échoué même si le
  chunk existe. [Peu probable] cache CF d'un index périmé (cf Q2). Le vrai bug CÔTÉ APP (le seul
  chunk sans filet de retry/reload) est corrigé (PH1-a).
  **Procédure de retrait Cloudflare → voir O1 ci-dessus** (consolidée 2026-06-16 ; le gate Google est
  désormais code-ready, il reste 2 variables d'env + des clics dashboard).
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
- [ ] **Docs périmées à resynchroniser** (non bloquant) : `SESSION_HANDOVER.md` cite encore
  1154 tests / PR #116 / Cloudflare comme auth « courante » ; réel = ~1704 tests, dernier merge
  bien plus loin. À rafraîchir lors de la prochaine grosse livraison.


## Décisions design Phase 4 (Claude a fait tout l'autonome — 12 PR #250-261)
> Les gains CONCRETS des onglets Futur/Investissement/Transactions/Retraite sont livrés. Restent 2
> refontes purement DESIGN qui ont besoin de ta vision (Claude refuse de deviner = risque hors-sujet) :
- **[PH4-BUD] Budget — refonte complète** : donne 2-3 irritants concrets (ce qui te gêne aujourd'hui)
  pour cadrer. Pistes Claude : vue prévu/réel par groupe (Besoin/Envie/Épargne) en tête ; lien
  budget→projection plus visible ; réduire les sous-sections.
- **[PH4-FUT] annotations sur la courbe (Q1 de ton brief)** : QUOI annoter ? (âge retraite / épuisement
  d'un compte / bascule de stratégie / événements de vie). + « Paramètres » renommé/allégé, conseils du
  plan d'action déclinés mois/trimestre/semestre/année.
