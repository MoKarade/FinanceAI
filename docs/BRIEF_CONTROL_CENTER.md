# Brief — Agent Control Center enrichi (FinanceAI)

> **File d'attente** : à exécuter **APRÈS** la feuille de route des chantiers (`docs/PLAN_CHANTIERS_2026-06-19.md`).
> ⚠️ **Ce brief n'est PAS de l'autonome complet** : exécution **LOT PAR LOT, plan-first** — 1 lot = 1 plan court +
> **OK de Marc** + 1 PR (gate + `/review-all`). **Ne coder RIEN avant l'OK de Marc sur le plan du lot.**
> Commencer par le **Lot 0 (un TEST, pas une PR)** et **revenir vers Marc avec le résultat** avant le Lot 1.
> Avant de commencer : `git fetch origin main` + `git merge --ff-only origin/main`.

## Objectif
Rendre l'Agent Control Center (`tools/agent-control-center/`) réellement utile et **constamment visible** : voir
les 14 agents (état + message reçu + transcription + fil de pensée), le **backlog complet** filtrable/cherchable
groupé par état, et les workflows — sans friction. **On ÉTEND l'ACC existant, on ne reconstruit rien.**

## Décisions déjà prises (ne pas re-poser)
- **Surface** : dashboard dans le **preview pane de l'app Claude Desktop** (Marc lance Claude Code via l'onglet Code, Windows). Filet si le preview ne fait pas tourner le JS → Lot 0 Voie 2.
- **« En cours »** = déduit de la **branche git active** (`claude/<slug>`) + PR ouvertes (pas de marqueur manuel).
- **Backlog** : **chips de filtre** (Tout / En cours / À venir / En attente de Marc / Fait) **+ recherche**.
- **Fil de pensée** : affiché **à la complétion** de l'agent (via `agent_transcript_path`), pas token par token.

## Lignes rouges (TOUS les lots)
- Dev-only, jamais shippé (pas une route de l'app React/Vercel). **Zéro dépendance** (Node natif), comme l'ACC actuel.
- **No-fake-data** : source `live`/`example` étiquetée, bandeau « Exemple » non masquable.
- **XSS-safe** : pas d'`innerHTML` (on injecte transcriptions/desc pouvant contenir du code).
- Hooks **non-bloquants** (exit 0 toujours) + **écriture atomique** (temp+rename), comme `agent-status.mjs`. Pas de scope non demandé.

## À prouver empiriquement (3 inconnues — tester AVANT de coder le lot concerné)
1. Le preview pane ouvre-t-il l'URL `http://127.0.0.1:4317` avec **JS live** ? (Lot 0)
2. Les **blocs de pensée** sont-ils dans le transcript `.jsonl` du sous-agent ? (début Lot 1)
3. Où les **dynamic workflows** exposent-ils leur état (fichiers de sortie, `claude agents --json`…) ? (Lot 4)
Si « non » : appliquer le repli documenté **et le signaler explicitement à Marc**.

## Lot 0 — Test de surface (PAS une PR)
`npm run acc`, puis dans le preview pane ouvrir **l'URL** `http://127.0.0.1:4317` (pas le fichier `index.html`). Observer :
(a) le JS poll-il `/status` et se rafraîchit-il seul ? (b) si le preview bloque le fetch vers `127.0.0.1` → le noter.
- **Voie 1 (idéale)** : preview ouvre l'URL + JS live → dashboard dynamique (poll `/status` + `/backlog`).
- **Voie 2 (repli)** : le capteur régénère un `status.html` auto-contenu (données inline) à chaque event, on compte sur le reload-sur-changement du preview.
**Revenir avec le résultat avant le Lot 1.**

## Lot 1 — Capteur enrichi (PR 1) [principe certain ; test interne au début]
Fichiers : `scripts/hooks/agent-status.mjs`, `.claude/settings.json`. Détails (doc Claude Code 2026-06) :
hook **`SubagentStop`** → stdin a `agent_id` + **`agent_transcript_path`** (`.jsonl` complet) + `stop_hook_active` ;
les `Pre/PostToolUse` DANS un sous-agent portent `agent_id` + `agent_type`.
- Garder le **prompt complet** (au lieu de tronquer à 80 car) → `agents[nom].message`.
- Hook `SubagentStop` : lire `agent_transcript_path`, extraire transcription + blocs de pensée, écrire dans
  **`.claude/agent-transcripts/<id>.json`** (gitignored ; NE PAS gonfler `status.json` — y mettre référence + extrait borné).
- Logger les **outils au fil de l'eau** via `agent_id`. **Test interne d'abord** : confirmer que les blocs de pensée sont dans un vrai `.jsonl` ; s'ils sont absents → afficher la sortie seule et le signaler.
- Fini : `status.json` porte message complet + chemin transcript + extrait ; outils internes loggés ; hook non-bloquant+atomique ; `.claude/agent-transcripts/` gitignored.

## Lot 2 — Lecture backlog + git (PR 2) [parsing tolérant]
Fichiers : nouveau `tools/agent-control-center/backlog-scan.mjs` (Node natif) + route `/backlog` dans `server.mjs`.
Sources : `BACKLOG.md`, `docs/A_FAIRE_MOI.md`, `git`, `HANDOVER.md` (nb de tests déjà tenu).
- Parser BACKLOG : items `[ID]`, état (`[x]`=fait), priorité (P0–P3 ou dérivée de section), marqueur (Claude/Marc/humain), desc. **Parsing tolérant** + mode dégradé (format semi-libre).
- **En cours** : `git branch --show-current` → `claude/<slug>` mappé à l'ID + PR ouvertes. **En attente de Marc** : items « décision Marc » + `A_FAIRE_MOI.md`. **Phases** depuis BACKLOG/HANDOVER. **Métriques** : nb tests **lu** (pas de re-run vitest) + vélocité `git log --since`.
- Fini : `/backlog` → `{ enCours[], aVenir[], enAttente[], fait[], phases[], metrics{} }` en réel.

## Lot 3 — Dashboard enrichi (PR 3, la plus grosse) [dépend de 1+2]
Fichiers : `tools/agent-control-center/index.html` (auto-contenu + XSS-safe sans `innerHTML`).
- **Bloc agents** : roster 14 agents (idle/running/completed/pending) + agent en cours en avant + panneau détail (message/transcription/fil de pensée) + strip workflows.
- **Bloc avancement** : métriques + barres de phases + **backlog groupé** + **chips de filtre** + **recherche**. Poll `/status`+`/backlog` (2 s). Bandeau source non masquable. Style fintech dark cohérent.
- Fini : conforme à la maquette validée, données réelles, filtres+recherche, XSS-safe, lisible en dark.

## Lot 4 — Workflows (PR 4) [découverte d'abord]
Découverte : où les workflows exposent leur état. Fichiers : capteur + route `/workflows` + strip dashboard. Fini : un workflow en cours apparaît (agents + progression).

## Lot 5 — Présence (PR 5) [le moins certain]
But : dashboard visible sans friction au démarrage. Limite : un hook ne pilote pas forcément l'UI de l'app.
Fichiers : `scripts/hooks/session-brief.mjs` ou nouveau `SessionStart`. Replis : injecter chemin/URL + consigne d'ouvrir le preview ; ou Marc épingle le preview une fois. Viser « zéro ou un clic ».

## Séquençage
`Lot 0 (test → revenir avec le résultat)` → `Lots 1, 2, 3 (MVP)` → `Lots 4, 5`. 1 lot = plan court + OK Marc + PR gated.
MAJ doc au push (`tools/agent-control-center/README.md`, CHANGELOG…).

## Définition de « fini » (global)
Dans l'app, Marc voit en permanence : 14 agents (état + message + transcription + fil de pensée), backlog complet filtrable/cherchable groupé par état, workflows — sans friction. Tests verts, gate vert.

## Suite (hors brief, à cadrer plus tard)
Consolidation de la redondance documentaire (HANDOVER/BACKLOG/A_FAIRE_MOI/CHANGELOG qui se chevauchent ; CLAUDE.md ~44 Ko ; dérive « 13 vs 14 agents ») + garde-fou anti-dérive.

---
*Source : `BRIEF_CONTROL_CENTER.md` fourni par Marc 2026-06-19, capturé dans le repo (l'original était dans `Downloads/`).*
