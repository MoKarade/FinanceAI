#!/usr/bin/env node
// PreToolUse (Bash) : bloque le vraiment dangereux. exit 2 = bloque.
//
// NOTE (2026-06) : le `git push` est AUTORISÉ. Claude gère le cycle complet
// commit (gated) -> push -> PR -> merge lui-même (cf CLAUDE.md, choix de Marc).
// Le garde-fou qualité reste `commit-gate.mjs` (typecheck+test+build avant commit).
import { readFileSync } from 'node:fs';

let cmd = '';
try { cmd = (JSON.parse(readFileSync(0, 'utf8')).tool_input?.command) || ''; } catch { process.exit(0); }
const block = (m) => { process.stderr.write(m + '\n'); process.exit(2); };

// On neutralise le CONTENU des chaînes entre guillemets avant d'inspecter la commande :
// un message de commit (`git commit -m "...rm -rf... --no-verify..."`) ne doit PAS
// déclencher les gardes — seuls les vrais flags / redirections HORS guillemets comptent.
const scan = cmd.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');

if (/\brm\s+-rf?\b/.test(scan) && /(^|\s)(\/|~|\.\/|\$HOME)/.test(scan))
  block('Bloqué : rm -rf sur chemin sensible. Donne un chemin sûr et explicite.');

if (/\bgit\s+commit\b/.test(scan) && /--no-verify\b/.test(scan))
  block('Bloqué : --no-verify contourne le gate qualité (commit-gate).');

if (/>\s*\.env/.test(scan))
  block('Bloqué : ne pas écrire .env. Clés API via l\'UI uniquement.');

process.exit(0);
