# Agent Control Center (dev-only)

Tableau de bord LOCAL qui visualise l'activité des **14 agents Claude Code** de FinanceAI pendant le dev.
**Séparé de l'app finance** (ne ship JAMAIS aux utilisateurs ; pas une route de l'app React/Vercel).

## Lancer

**Auto [Lot 5]** : le hook `SessionStart` (`scripts/hooks/session-brief.mjs`) **démarre le serveur au début de chaque session** et surface l'URL dans le brief → en général rien à lancer. Ouvre **http://127.0.0.1:4317** dans le preview pane (épingle l'onglet une fois → il persiste). Lancement manuel si besoin :

```bash
npm run acc          # → http://127.0.0.1:4317   (port via env ACC_PORT ; s'auto-termine si déjà up)
```

Puis lance une revue d'agents (`/review-all`, `/audit-financier`, ou un agent seul) ou un workflow dans Claude Code :
le hook capte chaque invocation et le dashboard se met à jour (polling 2 s).

## Comment ça marche (données 100 % RÉELLES)

```
boucle Claude lance un agent (outil Task/Agent)
        │  PreToolUse / PostToolUse  (matcher "Task|Agent")   ── prompt COMPLET → agents[nom].message
        ▼
scripts/hooks/agent-status.mjs   ── écrit ──►  .claude/status.json     (snapshot, atomique)
        ▲                        ── append ─►  .claude/agent-events.jsonl (historique)
        │
   l'agent termine  ── SubagentStop (agent_transcript_path) ──► extrait FIL DE PENSÉE + sortie + outils
        │                              └─► .claude/agent-transcripts/<id>.json (détail complet, gitignored)
        │                              └─► status.json : agents[nom].transcript = { extraits bornés, tools, hasThinking }
        ▼
   server.mjs (Node natif, 127.0.0.1)  ── GET /status + /backlog + /workflows ──►  dashboard (poll 2 s)
```

- **Message complet** (Lot 1) : le prompt reçu par chaque agent est gardé ENTIER dans `agents[nom].message` (plus de troncature à 80 car).
- **Transcription + outils** (Lot 1) : au `SubagentStop`, le hook lit `agent_transcript_path` (le `.jsonl` du sous-agent), en extrait la **sortie finale** (le rapport de l'agent) + les **outils utilisés** + (si présents) les blocs `thinking`. ⚠️ **Vérifié LIVE 2026-06-19 : les transcripts SOUS-AGENTS ne contiennent PAS de blocs `thinking`** (`hasThinking:false`) → on affiche la sortie + les outils, pas un « fil de pensée » (qui n'existe que pour la boucle principale). Corrélation agent→nom par CONTENU (le prompt ENTIER enregistré est sous-chaîne du 1er message user — robuste en panel parallèle MÊME avec un préambule de briefing commun). Détail complet dans `.claude/agent-transcripts/<id>.json` (gitignored) ; seuls des EXTRAITS bornés vont dans `status.json`. Transcript > 30 Mo → non extrait mais SIGNALÉ (`oversize`).
- **Workflows** (Lot 4) : les dynamic workflows **se journalisent eux-mêmes** (PAS de hook) dans le dossier de session : run TERMINÉ → `<session>/workflows/wf_<runId>.json` (journal complet) ; run EN COURS → `<session>/subagents/workflows/<runId>/journal.jsonl` (stream live, le `wf_*.json` final n'existe pas encore). ⚠️ Les agents INTERNES d'un workflow **ne déclenchent PAS** `agent-status.mjs` (workflows et les 14 agents = 2 systèmes séparés). `workflow-scan.mjs` lit ces fichiers (read-only) → `/workflows`.
- **`source: "live"`** = vraie activité. **`source: "example"`** = `status.example.json` servi en repli, avec un **bandeau « Exemple » non masquable** (règle no-fake-data).
- `.claude/status.json`, `.claude/agent-events.jsonl`, `.claude/agent-transcripts/` sont **gitignored** (état runtime local).

## 5 sections & maturité

| Section | v1 (réel, fiable) | Plus tard |
|---|---|---|
| 1. Métriques + 2. Pipeline + 3. Agents | ✅ alimentées par le hook (statut/tâche/durée/`stale`) | — |
| 4. Risques | étiqueté « best-effort » : le hook compte les sévérités dans le texte (approximatif) | **v2** : format de finding structuré imposé aux agents |
| 5. Audits | idem | **v2** : lier aux `docs/AUDIT_FINANCIER_*.md` |
| Verdict GO/NO-GO + scores | étiqueté « best-effort » | **v3** : une fois 3+4 fiables |

## Fichiers

- `server.mjs` — serveur Node natif (statiques + `/status` + `/health` + **`/backlog`** [Lot 2] + **`/workflows`** [Lot 4]), bind `127.0.0.1`, zéro dépendance.
- `backlog-scan.mjs` [Lot 2] — scan READ-ONLY (Node natif, `execFileSync` sans shell) de `docs/BACKLOG.md` + `A_FAIRE_MOI.md` + git → `/backlog` rend `{ enCours, enAttente, aVenir, fait, phases, metrics }`. Parsing TOLÉRANT (format semi-libre). « En cours » = branche `claude/<slug>` + PR ouvertes ; « en attente » = items 🧭 + A_FAIRE_MOI ; tests **lus** du HANDOVER (pas de re-run vitest). Cache 2 s côté serveur.
- `workflow-scan.mjs` [Lot 4] — scan READ-ONLY (Node natif, PUR `fs`, zéro dép) des runs de workflows (`<session>/workflows/wf_*.json` terminés + `subagents/workflows/<runId>/journal.jsonl` en cours) → `/workflows` rend `{ enCours[], recents[] }` (nom, statut, phases, agents+état, tokens, durée). Dossier projet = `cwd.replace(/[^a-zA-Z0-9]/g,'-')` (repli basename + `console.warn`). Run sans json final > 2 h = `stale`. Cache 2 s.
- `index.html` — dashboard **auto-contenu** (CSS + JS + données d'exemple inline ; fintech dark, XSS-safe via `el()`/`textContent`, **zéro `innerHTML`**). Beau partout : sans serveur, il affiche l'exemple ÉTIQUETÉ ; avec `npm run acc`, il poll `/status` + `/backlog` + `/workflows` (réel). **Trois blocs** : (1) **Agents [Lot 3]** — métriques + pipeline + cartes CLIQUABLES → tiroir détail (message reçu + sortie + outils, focus-trap `inert`, fermeture Échap/fond/✕) + risques/audits/verdict ; (2) **Avancement [Lot 3]** — métriques backlog + barres de phases + backlog groupé (en cours / attente Marc / à venir / fait) avec **chips de filtre** + **recherche** client ; (3) **Workflows [Lot 4]** — cartes de run (nom, statut, phases, agents+état, tokens, durée), run EN COURS surligné en tête. Polling avec détection de changement (re-render seulement si les données bougent).
- `agents.meta.json` — métadonnées statiques des 14 agents (référence ; le dashboard les embarque aussi inline).
- `status.example.json` — exemple étiqueté (repli serveur + fixture).
- `../../scripts/hooks/agent-status.mjs` — le hook capteur (branché dans `.claude/settings.json`).
