// scripts/hooks/lib/testsHomonymes.mjs
//
// [GATE-RELATED-RELIABILITY 2026-08-24] Sélection des tests qui portent le NOM d'un module stagé.
//
// ⚠️ POURQUOI CE MODULE EXISTE À PART. La fonction vit ici, et pas dans `commit-gate.mjs`, parce que
// ce dernier LIT STDIN au chargement (c'est un hook PreToolUse : il reçoit le JSON de l'appel d'outil
// sur l'entrée standard). L'importer depuis un test BLOQUE le processus, en attente d'une entrée qui
// ne viendra jamais — vérifié en essayant. Un module sans effet de bord est la condition pour que la
// logique soit testable ; c'est le même geste que `scripts/lib/ctaContrast.ts`.
import { readdirSync } from 'node:fs';

/**
 * Rend les fichiers de test dont le nom de base correspond à celui d'un module source stagé
 * (`services/projection/monthlyEvents.ts` → `tests/services/monthlyEvents.test.ts`).
 *
 * ⚠️ Ce n'est PAS un remplacement de `vitest related` : le graphe d'imports attrape des tests qui ne
 * portent pas le nom du module. C'est un FILET pour la classe qui a échappé au graphe une fois
 * (incident PR #594), là où la convention de nommage rend la vérification possible.
 */
export function testsHomonymes(fichiersSource, racineTests = 'tests') {
    const bases = new Set(
        fichiersSource.map((f) => f.replace(/^.*\//, '').replace(/\.tsx?$/, '')),
    );
    if (bases.size === 0) return [];
    const trouves = [];
    const parcourir = (dir) => {
        let entrees = [];
        try { entrees = readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entrees) {
            const chemin = `${dir}/${e.name}`;
            if (e.isDirectory()) { parcourir(chemin); continue; }
            const m = e.name.match(/^(.+)\.test\.tsx?$/);
            if (m && bases.has(m[1])) trouves.push(chemin);
        }
    };
    parcourir(racineTests);
    return trouves.sort();
}
