#!/usr/bin/env node
// PreToolUse (Bash) : sur un `git push`, RAPPELLE de capturer la leçon dans CLAUDE.md.
// NON-BLOQUANT (exit 0 toujours) — injecte juste un rappel via additionalContext.
// Applique la règle Marc « CLAUDE.md s'améliore À CHAQUE PUSH » (cf CLAUDE.md, section Workflow) :
// un fichier ne force rien, mais ce rappel apparaît au bon moment (juste avant le push).
import { readFileSync } from 'node:fs';

let cmd = '';
try { cmd = (JSON.parse(readFileSync(0, 'utf8')).tool_input?.command) || ''; } catch { process.exit(0); }

// Neutralise le CONTENU des chaînes entre guillemets : un message de commit
// (`git commit -m "...git push..."`) ne doit PAS déclencher le rappel.
const scan = cmd.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');

// Vrai `git push` uniquement (pas à travers un séparateur de commande).
if (!/\bgit\b[^|&;]*\bpush\b/.test(scan)) process.exit(0);

const reminder =
  'Rappel (règle « CLAUDE.md s\'améliore à chaque push ») : AVANT ce push, qu\'as-tu appris ' +
  '(bug d\'infra, convention, leçon, décision, piège) ? Si oui -> delta ciblé dans CLAUDE.md ' +
  '(section pertinente), dans la MÊME PR. Si non -> dire « push sans leçon » au point de contrôle. ' +
  'Ne pas parquer la leçon ailleurs (mémoire/chat) sans la porter dans CLAUDE.md.';

process.stdout.write(JSON.stringify({
  suppressOutput: true,
  hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: reminder },
}));
process.exit(0);
