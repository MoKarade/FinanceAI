#!/usr/bin/env node
// PreToolUse (Bash) : avant tout `git commit`, exige typecheck + test + build verts. exit 2 = bloque.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

let cmd = '';
try { cmd = (JSON.parse(readFileSync(0, 'utf8')).tool_input?.command) || ''; } catch { process.exit(0); }
if (!/\bgit\s+commit\b/.test(cmd)) process.exit(0);

// Le gate (typecheck/test/build) ne peut être affecté QUE par du source TS. Si aucun
// fichier .ts/.tsx n'est stagé (commit de docs/.md, hooks .mjs, .json, .yml, CI…), on
// saute la suite complète (~5 min) — gain énorme en cloud sans rien sacrifier. Garde-fou :
// si on n'arrive pas à lister les fichiers stagés, on lance le gate (défaut sûr).
let staged = '';
try { staged = execSync('git diff --cached --name-only', { encoding: 'utf8' }); } catch { /* défaut sûr ci-dessous */ }
const stagedFiles = staged.split('\n').filter(Boolean);
const touchesSource = stagedFiles.length === 0 || stagedFiles.some(f => /\.(ts|tsx)$/.test(f));
if (!touchesSource) process.exit(0);

for (const [name, c] of [['typecheck','npm run typecheck'],['tests','npm run test'],['build','npm run build']]) {
  try { execSync(c, { stdio: 'pipe' }); }
  catch (e) {
    const tail = ((e.stdout?.toString() || '') + (e.stderr?.toString() || '')).split('\n').slice(-25).join('\n');
    process.stderr.write(`Commit bloqué : ${name} a échoué. Corrige avant de committer.\n${tail}\n`);
    process.exit(2);
  }
}
process.exit(0);
