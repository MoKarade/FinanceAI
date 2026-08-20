#!/usr/bin/env node
// SessionStart : injecte l'état du projet dans le contexte de Claude (stdout = contexte sur exit 0).
// [ACC Lot 5] démarre AUSSI le dashboard Agent Control Center dès le début de session (sans attendre
// qu'un agent tourne) + surface son URL → présence « un clic » (Marc épingle le preview une fois).
import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Racine du repo dérivée de la localisation du hook (INDÉPENDANT du cwd) — comme scripts/hooks/agent-status.mjs.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const head = (p, n) => existsSync(p) ? readFileSync(p, 'utf8').split('\n').slice(0, n).join('\n') : '';

// Démarre le serveur ACC détaché s'il n'est pas déjà up (il s'auto-termine sur EADDRINUSE). Retourne true
// SEULEMENT si le fichier existe ET le spawn n'a pas levé → on n'annonce l'URL que dans ce cas (pas de
// « serveur lancé » trompeur). Détaché (.unref) + cwd=ROOT. NON-BLOQUANT : ne casse JAMAIS le SessionStart.
function ensureAccServer() {
  try {
    const srv = join(ROOT, 'tools', 'agent-control-center', 'server.mjs');
    if (!existsSync(srv)) return false;
    spawn(process.execPath, [srv], { detached: true, stdio: 'ignore', cwd: ROOT }).unref();
    return true;
  } catch { return false; }
}
const accUp = ensureAccServer();

let out = '## Reprise de session (auto)\n';
out += 'Commence ta réponse par un point bref : Fait / État / Suite proposée / Planifié.\n\n';

if (accUp) {
  out += '### Agent Control Center (dashboard dev — auto-démarré)\n';
  out += 'Activité des 14 agents (message + transcription) · backlog filtrable/cherchable · workflows : ';
  out += '**http://127.0.0.1:4317**. Ouvre-le dans le preview pane (épingle l\'onglet une fois → il persiste). ';
  out += 'Il sert l\'exemple étiqueté tant qu\'aucun agent/workflow ne tourne.\n\n';
}

const ho = head(join(ROOT, 'HANDOVER.md'), 40);
if (ho) out += `### HANDOVER.md (début)\n${ho}\n\n`;

const blPath = join(ROOT, 'docs', 'BACKLOG.md');
if (existsSync(blPath)) {
  const bl = readFileSync(blPath, 'utf8');
  const i = bl.indexOf('Quick wins');
  if (i !== -1) out += '### Quick wins backlog\n' + bl.slice(i, i + 600) + '\n';
}
process.stdout.write(out);
