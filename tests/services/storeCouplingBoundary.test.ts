// tests/services/storeCouplingBoundary.test.ts
//
// [SVC-STORE-COUPLING] La frontière RÉELLE entre services/ et le store Zustand, gardée dans ses
// TROIS directions (recensement 2026-09-04, contre le code — le ticket annonçait « 8 fichiers »,
// le 8e (`quotaStorage.ts`) ne CITE le store que dans un commentaire, classe SCAN-QUI-MATCHE-LA-PROSE) :
//
//  1. Le MOTEUR reste PUR : rien sous `services/projection*` (orchestrateur, 57 sous-modules,
//     worker) n'importe le store. C'est ce qui rend chaque calcul money-critical testable par
//     fixture — un import du store ici serait une régression d'architecture, pas un détail.
//  2. L'INVENTAIRE des services d'orchestration/IO qui lisent le store est FERMÉ, dans les deux
//     sens : un fichier de services/ qui se met à importer le store doit être ajouté ICI (décision
//     délibérée, documentée dans docs/ARCHITECTURE.md §2), et une entrée qui n'importe plus le
//     store doit sortir de la liste (un inventaire qui ne sait que refuser des ajouts survit à sa
//     raison d'être).
//  3. tsc GARDE PRISE : aucun `getState() as …` dans services/ — les `as unknown as AppState`
//     historiques étaient du bruit (`FinanceState extends AppState`, l'assignation directe est
//     déjà typée) et désactivaient le compilateur exactement sur le chemin d'écriture piloté par
//     l'IA/MCP. Ce lot les a retirés ; cette assertion interdit leur retour.
//
// L'INVENTAIRE est ÉCRIT À LA MAIN (une garde qui dérive sa liste de ce qu'elle scanne est
// circulaire). Le DÉTECTEUR, lui, est dérivé — il scanne `store/`, pas `services/` : voir le
// bloc `MODULES_STORE` plus bas et ce que son absence a coûté le 2026-09-21.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../../utils/stripComments';

/** Inventaire fermé — services d'orchestration/IO autorisés à lire le store (2026-09-04). */
const SERVICES_STORE_AUTORISES = [
    'services/aiTools/appStateProvider.ts',
    'services/aiTools/writeExecutor.ts',
    'services/fintable/autoSync.ts',
    'services/pdfReport.ts',
    'services/sync/syncPull.ts',
    'services/sync/syncPush.ts',
    'services/sync/syncSnapshot.ts',
];

/**
 * Les modules de `store/` par lesquels un fichier de services/ atteint le store — DÉRIVÉS, jamais
 * écrits à la main.
 *
 * ⚠️ POURQUOI CE N'EST PLUS UN SEUL NOM (2026-09-21, trouvé par la CI). La garde ne cherchait que
 * `store/useFinanceStore`. Le lot `[SANDBOX-ETANCHEITE-FICHIERS]` a extrait le prédicat « données
 * fictives ? » — qui vivait en DEUX copies non exportées — dans `store/modeTestActif.ts` ; du jour
 * au lendemain `services/sync/syncPush.ts` atteignait le store par cet alias et la garde ne le
 * voyait PLUS, dans les deux sens (« importeur non déclaré » ET « entrée à retirer »). Le FAIT
 * qu'elle défend n'a pourtant pas bougé d'un pouce : ce fichier traîne toujours `useFinanceStore`
 * dans son graphe d'imports. Elle ancrait l'ORTHOGRAPHE d'un import au lieu du fait, et le geste
 * même que le dépôt encourage — extraire une source unique — suffisait à la rendre aveugle.
 *
 * La dérivation est UNE marche, et elle n'est pas circulaire : elle scanne `store/` (tout module
 * qui importe lui-même `useFinanceStore`) pour juger `services/`.
 */
const MODULES_STORE: string[] = (() => {
    const racine = 'store/useFinanceStore';
    const alias = (readdirSync('store', { recursive: true }) as string[])
        .filter((f) => /\.ts$/.test(f) && !f.endsWith('.d.ts'))
        .map((f) => `store/${f}`.replace(/\\/g, '/').replace(/\.ts$/, ''))
        .filter((f) => f !== racine)
        .filter((f) => /from\s+['"][^'"]*useFinanceStore['"]/.test(stripComments(readFileSync(`${f}.ts`, 'utf8'))));
    return [racine, ...alias].sort();
})();

/** Un import RÉEL du store (pas une mention en prose) : chemin du module dans un from/import(). */
const IMPORT_STORE = new RegExp(
    `(?:from\\s+|import\\(\\s*)['"][^'"]*(?:${MODULES_STORE.join('|')})['"]`,
);

function fichiersTs(dir: string): string[] {
    return (readdirSync(dir, { recursive: true }) as string[])
        .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts'))
        .map((f) => join(dir, f).replace(/\\/g, '/'));
}

// ⚠️ Anti-vacuité AGRÉGÉE, pas par fichier : `services/tax.ts` est un alias de ré-export LÉGITIME
// à 26 caractères de code (mesuré 2026-09-04) — un seuil par fichier rougirait sur lui
// (`UN-SEUIL-D-ANTI-VACUITE-APPARTIENT-A-LA-PORTEE-QU-IL-MESURE`). Le témoin quotaStorage du
// test « sens 1 » prouve en plus que le décommentage AGIT là où il compte.
function sourceDecommentee(path: string): string {
    return stripComments(readFileSync(path, 'utf8'));
}

describe('[SVC-STORE-COUPLING] frontière services/ ↔ store', () => {
    const tous = fichiersTs('services');

    it('anti-vacuité du scan : le décommentage laisse l\'essentiel du code de services/', () => {
        let brut = 0;
        let code = 0;
        for (const f of tous) {
            brut += readFileSync(f, 'utf8').replace(/\s/g, '').length;
            code += sourceDecommentee(f).replace(/\s/g, '').length;
        }
        expect(brut).toBeGreaterThan(100_000); // le périmètre scanné n'est pas vide
        // Ratio MESURÉ le 2026-09-04 : 0,475 (services/ est commenté à ~52 %, par conception).
        // Le seuil attrape un décommenteur qui AVALE le code (ratio ≈ 0), pas la prose légitime.
        expect(code / brut).toBeGreaterThan(0.35);
    });

    it('le moteur de projection est PUR : zéro import du store sous services/projection*', () => {
        const moteur = tous.filter((f) =>
            f.startsWith('services/projection'), // projection.ts, projection/, projection.worker.ts
        );
        // Anti-vacuité : le périmètre scanné est bien le moteur entier (59 fichiers le 2026-09-04 :
        // orchestrateur + worker + 57 sous-modules ; plancher large pour ne pas rougir sur un split).
        expect(moteur.length).toBeGreaterThan(50);
        const offenders = moteur.filter((f) => IMPORT_STORE.test(sourceDecommentee(f)));
        expect(offenders, 'le moteur importe le store — régression de pureté (voir ARCHITECTURE §2)').toEqual([]);
    });

    it('la dérivation des modules du store TIRE : la racine ET au moins un alias', () => {
        // Sans ce cas, « aucun importeur non déclaré » serait aussi vrai d'une dérivation cassée
        // (liste réduite à la seule racine) que d'un inventaire complet — l'état exact dans lequel
        // la garde a laissé passer `syncPush.ts` le 2026-09-21.
        expect(MODULES_STORE).toContain('store/useFinanceStore');
        expect(MODULES_STORE.length, 'la dérivation ne voit plus aucun alias du store').toBeGreaterThan(1);
        // Témoin NOMMÉ, dans la forme la moins familière : un module qui n'expose PAS le store
        // lui-même mais un prédicat lu dessus. C'est celui qui a démasqué le défaut.
        expect(MODULES_STORE).toContain('store/modeTestActif');
        // …et la garde reconnaît bien l'import tel qu'un fichier de services/ l'écrit.
        expect(IMPORT_STORE.test("import { modeDonneesFictives } from '../../store/modeTestActif';")).toBe(true);
        // Contre-témoin : un chemin voisin qui ne mène pas au store reste ignoré.
        expect(IMPORT_STORE.test("import { x } from '../../utils/format';")).toBe(false);
    });

    it('inventaire fermé, sens 1 : tout fichier de services/ qui importe le store est déclaré ici', () => {
        const importeurs = tous.filter((f) => IMPORT_STORE.test(sourceDecommentee(f))).sort();
        // ⚠️ Témoin anti-prose : quotaStorage.ts CITE le store dans son en-tête (exemple d'usage) et
        // ne doit PAS être compté — c'est le décommentage qui l'écarte, et cette assertion le prouve.
        expect(importeurs).not.toContain('services/quotaStorage.ts');
        expect(importeurs, 'nouvel importeur du store dans services/ — décision à documenter (ARCHITECTURE §2) puis à ajouter à l\'inventaire')
            .toEqual([...SERVICES_STORE_AUTORISES].sort());
    });

    it('inventaire fermé, sens 2 : chaque entrée importe ENCORE le store (sinon, la retirer)', () => {
        for (const f of SERVICES_STORE_AUTORISES) {
            expect(IMPORT_STORE.test(sourceDecommentee(f)), `${f} n'importe plus le store — entrée à retirer`).toBe(true);
        }
    });

    it('tsc garde prise : aucun `getState() as …` dans services/ (les doubles casts ne reviennent pas)', () => {
        // Ancré sur l'USAGE (le résultat de getState() re-casté), pas sur la simple présence de `as`.
        const offenders: string[] = [];
        let sitesGetState = 0;
        for (const f of tous) {
            const code = sourceDecommentee(f);
            sitesGetState += (code.match(/\.getState\(\)/g) ?? []).length;
            if (/\.getState\(\)\s*as\b/.test(code)) offenders.push(f);
        }
        // Anti-vacuité : le motif de base voit bien les sites réels (12 mesurés le 2026-09-04).
        expect(sitesGetState).toBeGreaterThanOrEqual(10);
        expect(offenders, 'un cast sur getState() est revenu — FinanceState extends AppState, l\'assignation directe est déjà typée').toEqual([]);
    });
});
