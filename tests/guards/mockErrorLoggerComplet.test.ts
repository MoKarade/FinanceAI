// tests/guards/mockErrorLoggerComplet.test.ts
//
// [NAV-MERGE-SANTE-FUTUR, 2ᵉ occurrence] Un nouvel IMPORT STATIQUE élargit silencieusement le
// contrat de mock de TOUS les fichiers qui montent le composant.
//
// CE QUI S'EST PASSÉ, et c'est la CI qui l'a dit : `useSimulationParams` s'est mis à importer
// `holdingsCadByRegime`, qui importe `logErrorThrottled`. Les tests qui montent `ProjectionEngine`
// mockaient `errorLogger` avec le seul `logError` — parfaitement valide la veille. Ils ont tous
// explosé sur « No "logErrorThrottled" export is defined on the mock », alors qu'AUCUN d'eux ne
// parle de journalisation : le contrat qu'ils déclarent n'est pas celui qu'ils utilisent, c'est
// celui de tout le graphe d'imports sous eux.
//
// ⚠️ La garde ne cherche PAS les fichiers qui plantent aujourd'hui — cette liste change à chaque
// import ajouté ailleurs, donc elle serait fausse demain. Elle exige que TOUT mock du module
// déclare la surface COMPLÈTE, ce qui rend la classe impossible quel que soit l'import futur.
//
// Un mock qui ÉTALE l'original (`...(await importOriginal())`) est exempté : il porte la surface
// entière par construction, et c'est la forme à préférer.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ce qu'un mock DOIT fournir : les noms que le code de PRODUCTION importe réellement de ce module.
 *
 * ⚠️ Et PAS « tous les exports du module ». Mon premier jet dérivait de `export function` et sortait
 * 232 fautifs : le module expose aussi de quoi LIRE et VIDER le journal, qu'aucun consommateur de
 * production n'appelle et qu'aucun test n'a de raison de mocker. Une garde qui exige plus que ce
 * que la réalité consomme ne protège rien de plus — elle se fait désactiver.
 * (`CRITERE-D-INCLUSION-TROP-ETROIT-EST-LE-BUG`, pris par l'autre bout.)
 */
function nomsImportesEnProduction(): string[] {
    const noms = new Set<string>();
    // ⚠️ PÉRIMÈTRE MESURÉ, et resserré APRÈS une première version fausse. Balayer toute la
    // production demandait aussi `installGlobalErrorHandlers`, `getErrors`, `clearErrors`… —
    // 203 « fautifs » dont aucun ne pouvait causer la panne : ces fonctions-là ne sont appelées que
    // par `App` et le visualiseur de journal, jamais par une dépendance profonde d'un composant.
    // Le périmètre qui compte est la COUCHE SERVICES : c'est elle que tout montage de composant
    // traîne derrière lui sans que le test le sache. Mesuré le 2026-09-16 : elle n'importe que
    // `logError` et `logErrorThrottled` — exactement la paire qui a fait exploser la CI.
    for (const dir of ['services']) {
        for (const f of fichiersSource(dir)) {
            const src = readFileSync(f, 'utf-8');
            for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]*errorLogger['"]/g)) {
                for (const brut of m[1].split(',')) {
                    const nom = brut.trim().split(/\s+as\s+/)[0].trim();
                    if (/^[A-Za-z_]\w*$/.test(nom)) noms.add(nom);
                }
            }
        }
    }
    return [...noms].sort();
}

function fichiersSource(dir: string): string[] {
    const out: string[] = [];
    let entrees;
    try { entrees = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entrees) {
        const p = join(dir, e.name);
        if (e.isDirectory()) out.push(...fichiersSource(p));
        else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
    }
    return out;
}

function fichiersDeTest(dir: string): string[] {
    const out: string[] = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) out.push(...fichiersDeTest(p));
        else if (/\.test\.tsx?$/.test(e.name)) out.push(p);
    }
    return out;
}

describe('[MOCK-ERRORLOGGER-COMPLET] tout mock de errorLogger déclare la surface entière', () => {
    const attendus = nomsImportesEnProduction();

    it('anti-vacuité : la production importe bien les deux fonctions que la garde protège', () => {
        // Sans ça, « aucun mock incomplet » serait tout aussi vrai d'un recenseur qui ne trouve
        // plus rien — le cas le plus probable quand un motif d'import cesse de correspondre.
        expect(attendus).toContain('logError');
        expect(attendus).toContain('logErrorThrottled');
    });

    it('aucun mock « objet nu » n\'omet un export du module', () => {
        const fautifs: string[] = [];
        for (const f of fichiersDeTest('tests')) {
            const src = readFileSync(f, 'utf-8');
            // Seuls les mocks à FABRIQUE LITTÉRALE sont concernés : `...(await importOriginal())`
            // porte la surface complète par construction.
            for (const m of src.matchAll(/vi\.mock\((['"])(?:\.\.\/)+services\/errorLogger\1\s*,\s*\(\)\s*=>\s*\(\{([\s\S]*?)\}\)\)/g)) {
                const corps = m[2];
                for (const nom of attendus) {
                    if (!corps.includes(`${nom}:`)) fautifs.push(`${f} → ${nom}`);
                }
            }
        }
        expect(fautifs, 'mock incomplet : le prochain import statique ajouté en amont fera exploser ces fichiers').toEqual([]);
    });
});
