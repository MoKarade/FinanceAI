#!/usr/bin/env node
// PreToolUse (Bash) : sur un `git push`, RAPPELLE de capturer la leçon dans CLAUDE.md
// ET de mettre à jour un agent `.claude/agents/` si besoin.
// NON-BLOQUANT (exit 0 toujours) — injecte juste un rappel via additionalContext.
// Applique les règles Marc « CLAUDE.md s'améliore À CHAQUE PUSH » + « les agents s'améliorent à
// chaque push » (cf CLAUDE.md, sections Workflow + Agents) : un fichier ne force rien, mais ce
// rappel apparaît au bon moment (juste avant le push).
import { readFileSync } from 'node:fs';

let cmd = '';
try { cmd = (JSON.parse(readFileSync(0, 'utf8')).tool_input?.command) || ''; } catch { process.exit(0); }

// Neutralise le CONTENU des chaînes entre guillemets : un message de commit
// (`git commit -m "...git push..."`) ne doit PAS déclencher le rappel.
const scan = cmd.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');

// `push` doit être la SOUS-COMMANDE git (juste après `git` + d'éventuelles options
// globales), PAS « push » apparaissant n'importe où — sinon faux positif sur un nom
// de branche/chemin en -push (ex. `git branch -D claude/hook-learn-on-push`).
if (!/(^|\s)git\s+(?:-[cC]\s+\S+\s+|-{1,2}\S+\s+)*push(?:\s|$)/.test(scan)) process.exit(0);

const reminder =
  'Rappel (règles « CLAUDE.md/agents/docs s\'améliorent à chaque push ») : AVANT ce push — ' +
  '(1) Qu\'as-tu appris (bug d\'infra, convention, leçon, décision, piège) ? Si oui -> delta ciblé ' +
  'dans CLAUDE.md (section pertinente), MÊME PR ; si non -> dire « push sans leçon » au point de contrôle. ' +
  '(2) Un agent .claude/agents/ a-t-il produit du bruit, raté un angle mort, ou une convention a-t-elle ' +
  'changé ? Si oui -> mettre à jour le fichier de l\'agent (et docs/agents.md si le rôle bouge), MÊME PR. ' +
  '(3) TOUS les docs touchés sont-ils à jour dans CETTE PR ? `HANDOVER.md` (état + bandeau de ' +
  'tête : ce que la PR vient de livrer — NON optionnel, c\'est le job de `documentation-manager`), ' +
  '`BACKLOG.md` (ID cochés + découvertes), `CHANGELOG.md`, et les docs techniques (PROJECTION/' +
  'FISCAL_REFERENCE/ARCHITECTURE) si un champ/calcul/règle a changé. Doc périmée = doc qui trompe la prochaine session. ' +
  'Ne pas parquer la leçon/MAJ ailleurs (mémoire/chat) sans la porter dans le repo.';

process.stdout.write(JSON.stringify({
  suppressOutput: true,
  hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: reminder },
}));
process.exit(0);
