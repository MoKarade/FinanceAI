// scripts/mesureStripComments.mjs
//
// [GUARD-STRIPCOMMENTS-CONSOLIDER] Re-dérive la mesure citée dans le lot 37 : combien de fichiers
// du dépôt le décommenteur NAÏF (celui des copies recopiées) mutile-t-il, et combien de caractères
// de code jette-t-il ?
//
// ⚠️ Pourquoi ce script est COMMITTÉ. Le panel de la PR #763 a recalculé mes deux chiffres agrégés
// et obtenu 63-64 fichiers / 8 600-8 850 caractères là où j'avais écrit 60 / 8 722 : même ordre de
// grandeur, chiffre exact non re-dérivable. Les deux mesures étaient justes — elles portaient sur
// des INSTANTANÉS différents de l'arbre (le mien précédait l'ajout du fichier de ratchet) et sur
// des variantes du « contrat naïf ». C'est exactement ce que la leçon `UN-RAPPORT-D-AGENT-N-EST-PAS-UNE-SOURCE`
// prescrit : un montant cité dans le dépôt exige un script de reproduction qui nomme CHAQUE
// paramètre. Les deux paramètres sont ici explicites : la liste de fichiers, et la version naïve.
//
// Usage : node --experimental-strip-types scripts/mesureStripComments.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const IGNORES = new Set(['node_modules', '.git', 'dist', 'coverage', '.vercel', 'e2e-results', 'playwright-report']);

/** PARAMÈTRE 1 — la version NAÏVE mesurée : celle des copies d'`utils/`, qui BLANCHIT (les copies
 *  de `tests/` supprimaient ; le compte de fichiers différents est le même, seul le total de
 *  caractères varierait). */
const naif = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

const fichiers = (dir, acc = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) { if (!IGNORES.has(e.name)) fichiers(join(dir, e.name), acc); }
        else if (/\.(ts|tsx)$/.test(e.name)) acc.push(join(dir, e.name));
    }
    return acc;
};

const { stripComments } = await import(join(RACINE, 'utils/stripComments.ts'));
const nonBlancs = (s) => s.replace(/\s/g, '').length;

/** PARAMÈTRE 2 — la liste de fichiers, donc l'INSTANTANÉ de l'arbre. Il est imprimé pour que deux
 *  exécutions qui divergent puissent se comparer sur autre chose que l'intuition. */
const liste = fichiers(RACINE);
let differents = 0, jetes = 0;
const pires = [];
for (const f of liste) {
    const raw = readFileSync(f, 'utf8');
    const a = naif(raw), b = stripComments(raw);
    if (a === b) continue;
    differents++;
    const delta = nonBlancs(b) - nonBlancs(a);
    jetes += delta;
    if (delta !== 0) pires.push([delta, f.slice(RACINE.length + 1)]);
}
pires.sort((x, y) => y[0] - x[0]);

console.log(`fichiers .ts/.tsx scannés            : ${liste.length}`);
console.log(`sorties différentes (naïf vs durci)  : ${differents}`);
console.log(`caractères de code jetés par le naïf : ${jetes}`);
console.log('pires cas :');
for (const [d, f] of pires.slice(0, 5)) console.log(`  +${d}\t${f}`);
