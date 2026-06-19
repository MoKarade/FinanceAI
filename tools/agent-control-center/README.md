# Agent Control Center (dev-only)

Tableau de bord LOCAL qui visualise l'activité des **14 agents Claude Code** de FinanceAI pendant le dev.
**Séparé de l'app finance** (ne ship JAMAIS aux utilisateurs ; pas une route de l'app React/Vercel).

## Lancer

```bash
npm run acc          # → http://127.0.0.1:4317   (port via env ACC_PORT)
```

Puis lance une revue d'agents (`/review-all`, `/audit-financier`, ou un agent seul) dans Claude Code :
le hook capte chaque invocation et le dashboard se met à jour (polling 2 s).

## Comment ça marche (données 100 % RÉELLES)

```
boucle Claude lance un agent (outil Task/Agent)
        │  PreToolUse / PostToolUse  (matcher "Task|Agent")
        ▼
scripts/hooks/agent-status.mjs   ── écrit ──►  .claude/status.json     (snapshot, atomique)
                                 ── append ─►  .claude/agent-events.jsonl (historique)
        ▲                                              │
   server.mjs (Node natif, 127.0.0.1)  ── GET /status ─┘
        ▲
   dashboard (index.html / dashboard.css / dashboard.js)  ── poll 2 s ──► rend 5 sections
```

- **`source: "live"`** = vraie activité. **`source: "example"`** = `status.example.json` servi en repli, avec un **bandeau « Exemple » non masquable** (jamais de fausse donnée présentée comme réelle — règle no-fake-data).
- `.claude/status.json` et `.claude/agent-events.jsonl` sont **gitignored** (état runtime local).

## 5 sections & maturité

| Section | v1 (réel, fiable) | Plus tard |
|---|---|---|
| 1. Métriques + 2. Pipeline + 3. Agents | ✅ alimentées par le hook (statut/tâche/durée/`stale`) | — |
| 4. Risques | étiqueté « best-effort » : le hook compte les sévérités dans le texte (approximatif) | **v2** : format de finding structuré imposé aux agents |
| 5. Audits | idem | **v2** : lier aux `docs/AUDIT_FINANCIER_*.md` |
| Verdict GO/NO-GO + scores | étiqueté « best-effort » | **v3** : une fois 3+4 fiables |

## Fichiers

- `server.mjs` — serveur Node natif (statiques + `/status` + `/health` + **`/backlog`** [Lot 2]), bind `127.0.0.1`, zéro dépendance.
- `backlog-scan.mjs` [Lot 2] — scan READ-ONLY (Node natif, `execFileSync` sans shell) de `docs/BACKLOG.md` + `A_FAIRE_MOI.md` + git → `/backlog` rend `{ enCours, enAttente, aVenir, fait, phases, metrics }`. Parsing TOLÉRANT (format semi-libre). « En cours » = branche `claude/<slug>` + PR ouvertes ; « en attente » = items 🧭 + A_FAIRE_MOI ; tests **lus** du HANDOVER (pas de re-run vitest). Cache 2 s côté serveur.
- `index.html` — dashboard **auto-contenu** (CSS + JS + données d'exemple inline ; fintech dark, XSS-safe sans `innerHTML`). Beau partout : sans serveur, il affiche l'exemple ÉTIQUETÉ ; avec `npm run acc`, il poll `/status` (réel).
- `agents.meta.json` — métadonnées statiques des 14 agents (référence ; le dashboard les embarque aussi inline).
- `status.example.json` — exemple étiqueté (repli serveur + fixture).
- `../../scripts/hooks/agent-status.mjs` — le hook capteur (branché dans `.claude/settings.json`).
