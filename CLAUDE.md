# FinanceAI — CLAUDE.md

App perso de planif financière (fiscalité ARC + Revenu Québec, Monte Carlo retraite,
assistant Claude). 100 % navigateur, pas de backend. TS strict, ~1780 tests Vitest.
Tout en français.

Fichier dense et court (il se charge à chaque session = coûte des tokens).
Doc détaillée dans `docs/`, qui fait foi.

## Système de docs (qui sert à quoi)
- `docs/BACKLOG.md`          — tâches que CLAUDE peut faire (schéma + règles ci-dessous)
- `docs/A_FAIRE_MOI.md`      — tâches HUMAINES (Claude y ajoute ses blocages)
- `docs/SESSION_HANDOVER.md` — état actuel de l'app + reprise rapide
- `docs/VISION.md`           — où va le projet (futur)
- `docs/FISCAL_REFERENCE.md` — valeurs fiscales : SOURCE DE VÉRITÉ (datée + sourcée)
- `docs/ARCHITECTURE.md`, `docs/PROJECTION.md`, `mcp/README.md`, `CHANGELOG.md`

## Réponses & reprise de session
- Réponses **structurées** : titres courts, listes, l'essentiel d'abord.
  Étiqueter l'incertitude : [Certain] / [Probable] / [Supposition].
- **PAS d'emojis dans le chat** sauf demande explicite (docs/commits en contiennent, OK).
  Français toujours, tutoiement, ton direct et technique.
- **À CHAQUE reprise de chat**, commencer par un point bref (lu depuis
  `docs/SESSION_HANDOVER.md` + `docs/BACKLOG.md`) :
  1. **Fait** — terminé depuis la dernière fois
  2. **État** — build/tests, chantiers ouverts
  3. **Suite proposée** — prochaine étape recommandée (+ ID)
  4. **Planifié** — ce qui est déjà prévu après (IDs)

## Workflow (validé)
- **Plan d'abord, TOUJOURS** : proposer un plan, attendre validation avant de coder.
- **Git — cycle autonome** : Claude gère le cycle COMPLET. Branche `claude/<slug>`
  → commits en français **préfixés par l'ID** (`[A12a] desc`), gated → `git push`
  → PR (draft par défaut) → **Claude merge lui-même** (squash sur `main`) une fois
  le gate vert et `/review-all` fait. Le push sur `main` déclenche le déploiement
  Vercel : Claude en est responsable (choix de Marc, 2026-06 — plus de gate humain).
- **Merge SANS attente active** : après `/review-all` + gate vert → push → PR ready →
  **`enable_pr_auto_merge` (squash)** : GitHub merge tout seul dès la CI verte. PAS de timers
  `sleep` pour « surveiller » la CI (c'était ~7 min d'inactivité par PR). Vérifier le merge au
  point de contrôle suivant. Échec CI réel → le webhook réveille la session de toute façon.
  (Pré-requis repo : Settings → General → « Allow auto-merge » coché.)
- **Pourquoi un merge prend ~10 min quand même** : commit-gate local (typecheck+tests+build
  ≈ 5 min si `.ts/.tsx` stagés) PUIS la même suite en CI (≈ 5 min) — redondant mais voulu
  (gate = filet local, CI = vérité partagée). Pour raccourcir, l'option serait un gate allégé
  (typecheck+build+tests `related` seulement) avec la suite complète en CI — décision Marc.
- **CLAUDE.md s'améliore À CHAQUE PUSH** (règle Marc 2026-06-09) : tout push qui a appris
  quelque chose (bug d'infra, convention découverte, leçon, décision) met à jour CLAUDE.md
  dans le MÊME commit — petit delta ciblé, jamais de réécriture. Un push sans leçon = OK sans delta,
  mais se poser la question à chaque fois.
- **Backlog tenu par Claude** (l'Action `backlog-autocheck` a été RETIRÉE — choix Marc 2026-06-09) :
  au moment du MERGE d'une PR, Claude coche lui-même les `[ID]` livrés dans `docs/BACKLOG.md`
  (dans la PR même ou la suivante), ajoute les découvertes, et route les blocages humains
  vers `docs/A_FAIRE_MOI.md`. Fin de session : BACKLOG + SESSION_HANDOVER à jour = partie du travail.
- **Garde-fou (non négociable)** : avant CHAQUE commit, `typecheck` clean + `build`
  qui passe + `test` vert (hook `commit-gate`). Jamais `--no-verify`.
- **Vigilance** (à signaler dans le plan, pas interdit) : migrations schema Zustand
  (persist v7) — une erreur corrompt les données persistées.

## Exécution cloud — résilience (leçons 2026-06-09)
- **Le conteneur peut REVERTIR le working tree** (resets périodiques) : ne JAMAIS faire confiance
  à l'état local après une reprise. Avant tout commit/push : `git fetch origin main` puis vérifier
  `git merge-base --is-ancestor origin/main HEAD`. Divergence → reset sur `origin/main` + ré-appliquer
  le diff proprement (jamais de merge de branches divergées). **Origin = seule source de vérité.**
- **CI qui ne se déclenche pas** sur une PR = symptôme n°1 d'une branche divergée → re-baser, force-push
  (`--force-with-lease`), la CI repart.
- **E2E rouge** : lire le log AVANT de débugger — si l'échec est infra (install navigateurs, apt mirror),
  `rerun_failed_jobs` une fois ; n'investiguer que si ça re-échoue.
- **`npm install` après reprise** (le conteneur peut perdre `node_modules` — symptôme : tsc casse sur
  un module manquant type `lucide-react`).
- **Propreté** : GitHub auto-supprime les branches mergées ; supprimer soi-même toute branche de PR
  fermée-non-mergée. Zéro tâche de fond orpheline en fin de session (timers/agents terminés).
- Un commit de merge GitHub (`noreply@github.com` sur `main`) signalé « Unverified » par le stop-hook
  n'est PAS un commit local à corriger — l'ignorer.

## Agents — deux niveaux
**Globaux** (`~/.claude/agents/` via claude-config / ECC) : dispo dans tous les projets.
**Projet** (`.claude/agents/` ici, 9) : spécialisés FinanceAI, SURCHARGENT les globaux par nom.

**Déclenchement PROACTIF + PANEL** (ne pas attendre qu'on le demande). À chaque feature finie ou
avant commit, lancer EN PARALLÈLE tous les agents pertinents (commande `/review-all`), puis synthétiser :
- Toujours → `code-reviewer`, `silent-failure-hunter`.
- Secrets/crypto/CSP/persistance/LLM → `security-reviewer`.
- Logique métier ajoutée → `test-writer`.
- `services/projection/` ou calcul long-terme → `projection-validator`, `performance-optimizer`.
- Valeur fiscale (ou 1×/période d'impôts) → `fiscal-accuracy` (vs `docs/FISCAL_REFERENCE.md`).
- UI notable → `a11y-auditor`.
- Dette/audit large → `code-analyzer` (→ entrées BACKLOG).

Seule limite : la PERTINENCE. Lancer tous les agents qui s'appliquent ; aucun hors sujet.

## Qualité d'abord (coût tokens non contraint)
- **Tâches à 100 %** : pas de stub ni de « TODO plus tard » non demandé ; tests verts avant commit.
- Privilégier la THOROUGHNESS : passes multiples, panel d'agents en parallèle aux gates,
  vérifications exhaustives. Le coût en tokens n'est PAS une contrainte.
- Seule limite : le SIGNAL. Ne pas lancer d'agent hors sujet ni produire du bruit que personne ne lira.
- Réponses structurées, essentiel d'abord (clarté ≠ économie).

## Posture de l'agent
- Pas de complaisance : si une approche est mauvaise, le dire et proposer mieux.
- Pas de validation gratuite ni d'intro inutile.

## Commandes (exactes, package.json)
- Dev `npm run dev` · Build `npm run build` (⚠️ `prebuild` = `lint` ; build CASSE si lint échoue)
- `npm run lint` · `npm run typecheck` (clean) · `npm run test` · `test:watch` · `test:e2e`
- `npm run knip` · `npm run check-contrast` · MCP : `mcp:dev`/`mcp:auth`/`mcp:connect`/`mcp:pack`

## Tests
- Tests pour TOUTE nouvelle logique. Priorité `services/projection/`. Ne pas baisser la couverture.

## Stack
React 19.2 + Vite 6 + TS 5.8 strict + Tailwind 3 · Zustand 5 (persist+partialize, schema v7,
migrations v1→v7) · Zod 3 · Recharts 3 (lazy) · Vitest 4 + Testing Library + axe-core ·
@anthropic-ai/sdk (Sonnet 4.6 + Haiku 4.5) · @modelcontextprotocol/sdk · Finnhub + CoinGecko ·
i18next · jspdf. Prod : **Vercel** (`vercel.json` : headers sécurité + cache + SPA).

## Structure (PLAT — pas de src/)
Racine : `App.tsx`, `index.tsx`, `constants.ts`, `types.ts`, `i18n.ts`.
Dossiers : `components/ hooks/ services/ store/ utils/ locales/ mcp/ e2e/ tests/ scripts/ docs/`.
Cœur : `services/projection.ts` + `services/projection/` (31 sous-modules).

## Règles non négociables
- **Future = source unique** : tout calcul long-terme vient de `lastProjection.chartData`.
  Réf : `docs/CENTRALIZED_CALC_PROGRESS.md`, `docs/PROJECTION_OUTPUT_SCHEMA.md`.
- **No-fake-data** : zéro donnée simulée en prod. Projection non calculée → `<ProjectionRequired>`.
- **Valeurs fiscales** : toute constante fiscale (plafonds, paliers, taux, RRQ/PSV/SRG, montants
  de base) DOIT venir de `docs/FISCAL_REFERENCE.md` (datée + sourcée). Jamais de chiffre fiscal
  en dur non sourcé. Audit : agent `fiscal-accuracy`.
- **Secrets** : clés via l'UI seulement, jamais en dur/versionnées, exclues du localStorage/backups.

## Automatisation (hooks `.claude/settings.json`)
- **SessionStart** → `session-brief` injecte l'état (SESSION_HANDOVER + quick wins) : la reprise est automatique.
- **PostToolUse (Edit|Write)** → `auto-lint` : `eslint --fix` sur le `.ts/.tsx` modifié (jamais bloquant).
- **PreToolUse (Bash)** :
  - `commit-gate` → avant tout `git commit` : `typecheck` + `test` + `build` doivent passer, sinon commit BLOQUÉ.
  - `guard` → bloque `rm -rf` sensible, `--no-verify`, écriture `.env`. **Le `git push` est AUTORISÉ**
    (Claude gère commit→push→PR→merge ; cf Workflow ci-dessus).
- Avant de merger, lancer `/review-all` (panel d'agents), puis `commit-gate` fait la vérif déterministe.
- ⚠️ Les hooks tournent AUSSI en exécution cloud (Claude Code web) dès que `.claude/settings.json`
  est committé. `commit-gate` relance la suite complète **uniquement si des `.ts/.tsx` sont stagés**
  (~5 min — voulu) ; un commit de docs/config/hooks est instantané. `guard` laisse passer le push
  mais bloque toujours `rm -rf` sensible / `--no-verify` / `.env` (en ignorant le corps des messages).

## Notes
- `services/eraContext.ts` DORMANT (MCP-only).
- MCP : connecteur livré (Lots 0-3) — y toucher seulement sur demande ; reste = héberger le `.mcpb`.
- Auth : **Cloudflare Access encore EN PLACE**. Cible = bascule sur le **gate Google in-app**
  (ADR 010, `A_FAIRE_MOI` O1) — pas encore fait.
- Persistance : localStorage + IndexedDB chiffré (AES-256-GCM, PBKDF2 600k). apiKeys exclues.
- Mode test : PERSISTÉ depuis #217 (bannière survit au reload) ; push Drive coupé en test
  (`shouldPush`). Switch de persona = base propre (`personaResetBase`), zéro fuite inter-persona.
