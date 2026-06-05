#!/usr/bin/env node
// SessionStart : injecte l'état du projet dans le contexte de Claude (stdout = contexte sur exit 0).
import { readFileSync, existsSync } from 'node:fs';

const head = (p, n) => existsSync(p) ? readFileSync(p, 'utf8').split('\n').slice(0, n).join('\n') : '';

let out = '## Reprise de session (auto)\n';
out += 'Commence ta réponse par un point bref : Fait / État / Suite proposée / Planifié.\n\n';

const ho = head('docs/SESSION_HANDOVER.md', 40);
if (ho) out += `### docs/SESSION_HANDOVER.md (début)\n${ho}\n\n`;

if (existsSync('docs/BACKLOG.md')) {
  const bl = readFileSync('docs/BACKLOG.md', 'utf8');
  const i = bl.indexOf('Quick wins');
  if (i !== -1) out += '### Quick wins backlog\n' + bl.slice(i, i + 600) + '\n';
}
process.stdout.write(out);
