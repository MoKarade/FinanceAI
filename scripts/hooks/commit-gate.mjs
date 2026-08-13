#!/usr/bin/env node
// PreToolUse (Bash) : avant tout `git commit`, exige typecheck + tests (ciblés) + build verts. exit 2 = bloque.
import { readFileSync, existsSync } from 'node:fs';
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

// Tests CIBLÉS : on ne lance que les tests AFFECTÉS par les fichiers stagés
// (`vitest related` suit le graphe d'imports) au lieu de toute la suite
// (~3.5 min → quelques secondes). La suite COMPLÈTE reste exécutée en CI
// (push/PR). Fallback sûr = suite complète si la liste des fichiers stagés est
// indisponible (touchesSource via stagedFiles vide).
const sourceFiles = stagedFiles.filter(f => /\.(ts|tsx)$/.test(f) && existsSync(f));
// ⚠️ [GATE-SCAN-GUARDS 2026-08-12] Les tests-GARDES qui lisent le SOURCE par readFileSync (scan)
// n'IMPORTENT pas les modules qu'ils surveillent → `vitest related` ne les sélectionne JAMAIS,
// pour aucune modification. Mesuré : TAX_DUE_DAY a passé la gate locale et a été attrapé par la
// CI seule (fiscalConstantsGuardV2). Ils sont donc TOUJOURS ajoutés dès que du source est stagé.
// La liste est DÉRIVÉE (grep readFileSync dans tests/) — la re-dériver si un nouveau garde-scan
// apparaît ; un garde absent d'ici reste couvert par la CI (suite complète).
const SCAN_GUARD_TESTS = [
  'tests/fiscalConstantsGuardV2.test.ts',
  'tests/fiscalConstants.guard.test.ts',
  'tests/components/futureProjection.curveFields.test.ts',
  'tests/services/assetFxGuard.test.ts',
  'tests/services/visionInjectionGuard.test.ts',
  'tests/aiTools/noMcpSdkInSpecs.test.ts',
  'tests/aiTools/specFiniteGuard.test.ts',
  'tests/mcp/chartDataSumGuard.test.ts',
  // [revue #608] Garde du mode discret dans les graphiques : elle scanne `components/**/*.tsx` par
  // readFileSync → invisible à `vitest related`, exactement le cas que ce bloc existe pour couvrir.
  'tests/components/chartPrivacyScan.test.ts',
].filter(existsSync);
const testCmd = sourceFiles.length > 0
  ? `npx vitest related --run ${sourceFiles.map(f => `'${f}'`).join(' ')} && npx vitest run ${SCAN_GUARD_TESTS.join(' ')}`
  : 'npm run test';

for (const [name, c] of [['typecheck','npm run typecheck'],['tests (affectés)', testCmd],['build','npm run build']]) {
  try { execSync(c, { stdio: 'pipe' }); }
  catch (e) {
    const tail = ((e.stdout?.toString() || '') + (e.stderr?.toString() || '')).split('\n').slice(-25).join('\n');
    process.stderr.write(`Commit bloqué : ${name} a échoué. Corrige avant de committer.\n${tail}\n`);
    process.exit(2);
  }
}
process.exit(0);
