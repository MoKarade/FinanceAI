#!/usr/bin/env node
// PreToolUse (Bash) : avant tout `git commit`, exige typecheck + tests (ciblés) + build verts. exit 2 = bloque.
//
// ⚠️ LIMITES CONNUES — garde-fou LOCAL, pas une frontière de sécurité ; la CI reste le filet :
//   (a) `printf 'commit' | xargs git` : `git` et `commit` sont dans des segments différents → non détecté ;
//   (b) `g${x}it commit` : `git` absent du texte normalisé → non détecté ;
//   (c) un script qui lance `git commit` en interne (`sh script.sh`, `npm run …`) n'est pas analysable.
// Ces trois cas sont figés (comportement actuel) dans tests/gateCommitAnalyse.test.ts, « limite connue ».
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { testsHomonymes } from './lib/testsHomonymes.mjs';
import { execSync, execFileSync } from 'node:child_process';
import { analyseCommande, fichiersAttendus, toucheLeGate, estConfigGlobale, finDeSortie } from './lib/analyseCommande.mjs';

// [GATE-COMMIT-ANALYSE] Entrée illisible = on ne sait pas ce qui va être lancé : fail-closed (exit 2 + message),
// jamais « laisse passer » (l'ancienne version sortait en 0).
let cmd;
try {
  const entree = JSON.parse(readFileSync(0, 'utf8'));
  cmd = entree?.tool_input?.command ?? '';
} catch (e) {
  process.stderr.write(`Commit-gate : entrée du hook illisible (${e?.message ?? e}). Bloqué par prudence.\n`);
  process.exit(2);
}

// On ne réagit qu'à un VRAI segment shell `git commit` (pas au texte d'un echo, d'un heredoc ou d'un rapport
// qui contient ces mots) ; analyse pure et testée : lib/analyseCommande.mjs. Incertain → suite complète.
const analyse = analyseCommande(cmd);
if (!analyse.estCommit) process.exit(0);

// ⚠️ SANS SHELL : les chemins viennent du texte de la commande, AVANT qu'elle soit approuvée. `execSync(chaîne)`
// passe par cmd.exe (Windows) ou sh : une apostrophe ne protège rien. `execFileSync(programme, [tableau])`
// n'interprète rien ; les chemins viennent après `--`.
const MAX = 64 * 1024 * 1024;
const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: MAX }).split('\0').filter(Boolean);
// `git status --porcelain -z` : « XY chemin » ; pour un renommage, l'entrée suivante est l'ancien nom.
const statut = ({ chemins = [], sansNonSuivis = false }) => {
  const args = ['status', '--porcelain', '-z', `--untracked-files=${sansNonSuivis ? 'no' : 'all'}`];
  if (chemins.length) args.push('--', ...chemins);
  const entrees = git(args);
  const out = [];
  for (let i = 0; i < entrees.length; i++) {
    out.push(entrees[i].slice(3));
    if (/^[RC]/.test(entrees[i])) i++;
  }
  return out;
};

// Le gate (typecheck/test/build) ne peut être affecté QUE par du source TS. Si aucun
// fichier .ts/.tsx n'est concerné (commit de docs/.md, hooks .mjs, .json, .yml, CI…), on
// saute la suite complète (~5 min) — gain énorme en cloud sans rien sacrifier.
// Les fichiers concernés sont ceux que le commit EMBARQUERA : quand un `git add` précède dans la même
// commande (ou `commit -a`, `--amend`), l'index actuel est incomplet → `fichiersAttendus` les calcule.
// Garde-fou : analyse incertaine ou git en échec → liste vide → suite complète (défaut sûr).
const attendus = fichiersAttendus(analyse, {
  index: () => git(['diff', '--cached', '--name-only', '-z']),
  suivisModifies: () => git(['diff', '--name-only', '-z']),
  dernierCommit: () => git(['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', 'HEAD']),
  status: statut,
});
const stagedFiles = attendus ?? [];
// Liste BLANCHE des fichiers sans effet (*.md, docs/**) : package.json, lockfile, tsconfig*, configs vite/vitest,
// .css, scripts .mjs, workflows… comptent comme du source (avant : seul .ts/.tsx).
if (!toucheLeGate(stagedFiles)) process.exit(0);

// Tests CIBLÉS : on ne lance que les tests AFFECTÉS par les fichiers stagés
// (`vitest related` suit le graphe d'imports) au lieu de toute la suite
// (~3.5 min → quelques secondes). La suite COMPLÈTE reste exécutée en CI
// (push/PR). Fallback sûr = suite complète si la liste des fichiers stagés est
// indisponible (touchesSource via stagedFiles vide).
const sourceFiles = stagedFiles.filter(f => /\.(ts|tsx|mjs|js)$/.test(f) && existsSync(f));
// Une configuration globale (package.json, lockfile, tsconfig*, vite/vitest, .css…) ne se cible pas par le graphe
// d'imports : suite complète. Un nom commençant par « - » serait pris pour une option : suite complète aussi.
const cibleImpossible = stagedFiles.some(estConfigGlobale) || sourceFiles.some(f => f.startsWith('-'));
const vitestBin = resolve('node_modules', 'vitest', 'vitest.mjs');
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
// ⚠️ [GATE-RELATED-RELIABILITY 2026-08-24] Le test HOMONYME est ajouté EXPLICITEMENT.
//
// L'incident d'origine (PR #594, 2× dans la même PR) : `services/projection/monthlyEvents.ts` stagé,
// et `tests/services/monthlyEvents.test.ts` NON sélectionné par `vitest related` — l'échec n'a été
// vu qu'en CI. Re-mesuré le 2026-08-24 sur Vitest 4.1.8, avec la forme EXACTE de cette commande
// (guillemets simples, un puis deux fichiers stagés) : la sélection contient bien le test homonyme
// (72 puis 87 fichiers). Le symptôme ne se reproduit donc plus, et sa cause reste INCONNUE.
//
// Plutôt que de clore sur « ça marche maintenant », on rend la classe impossible là où elle est
// vérifiable : quand un module stagé a un test qui porte SON nom, ce test est lancé, que le graphe
// d'imports l'ait retrouvé ou non. Quelques secondes de plus, et aucune hypothèse sur le pourquoi.
// (Même geste que `SCAN_GUARD_TESTS` ci-dessus, pour une autre cause.)
const TESTS_HOMONYMES = testsHomonymes(sourceFiles).filter(existsSync);
const TOUJOURS = [...new Set([...SCAN_GUARD_TESTS, ...TESTS_HOMONYMES])];
// [GARDE-HOOK] Un commit de fichiers non-TS qui ne sont PAS une configuration globale (workflow, .gitattributes,
// json de données, .mjs sans importeur…) n'a pas de graphe d'imports à suivre : typecheck + gardes-scan + build
// suffisent, la suite complète reste celle de la CI. Liste vide (inconnu) = suite complète, comme avant.
const ciblable = (sourceFiles.length > 0 || stagedFiles.length > 0) && !cibleImpossible && existsSync(vitestBin);
const vitest = (...args) => execFileSync(process.execPath, [vitestBin, ...args], { stdio: 'pipe', maxBuffer: 256 * 1024 * 1024 });
const testsAffectes = () => {
  if (sourceFiles.length > 0) vitest('related', '--run', '--passWithNoTests', ...sourceFiles);
  vitest('run', ...TOUJOURS);
};
const npm = (script) => () => execSync(`npm run ${script}`, { stdio: 'pipe', maxBuffer: 256 * 1024 * 1024 });

for (const [name, run] of [
  ['typecheck', npm('typecheck')],
  ['tests (affectés)', ciblable ? testsAffectes : npm('test')],
  ['build', npm('build')],
]) {
  try { run(); }
  catch (e) {
    // [GATE-COMMIT-ANALYSE] L'erreur d'origine (fin plafonnée) : sortie standard + erreur + cause système
    // (ENOBUFS, signal, code de sortie) — l'ancienne version perdait tout sur un dépassement de tampon.
    const sortie = ((e.stdout?.toString() || '') + (e.stderr?.toString() || '')).trimEnd();
    const cause = [e.code && `code=${e.code}`, e.signal && `signal=${e.signal}`, e.status != null && `sortie=${e.status}`].filter(Boolean).join(' ');
    process.stderr.write(`Commit bloqué : ${name} a échoué${cause ? ' (' + cause + ')' : ''}. Corrige avant de committer.\n`);
    process.stderr.write(finDeSortie(sortie || e.message || String(e)) + '\n');
    process.exit(2);
  }
}
process.exit(0);
