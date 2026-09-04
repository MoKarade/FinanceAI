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
// La liste est ÉCRITE À LA MAIN (une garde qui dérive sa liste de ce qu'elle scanne est circulaire).

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

/** Un import RÉEL du store (pas une mention en prose) : chemin du module dans un from/import(). */
const IMPORT_STORE = /from\s+['"][^'"]*store\/useFinanceStore['"]|import\(\s*['"][^'"]*store\/useFinanceStore['"]/;

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
