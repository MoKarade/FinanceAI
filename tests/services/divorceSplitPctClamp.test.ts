// tests/services/divorceSplitPctClamp.test.ts
//
// [ENG-DIVORCE-SPLITPCT-UNBOUNDED] `divorceSplitPct` n'était borné NULLE PART : ni au moteur
// (`keep = 1 − splitPct`, sans clamp), ni à l'`<input type="number">` qui l'alimente (aucun
// `min`/`max`). Trois conséquences, toutes MESURÉES par le panel de re-revue, toutes silencieuses :
//
//   • −100  → `keep = 2`   : patrimoine final 2 210 335 $ contre 755 482 $ à 50 %. Le divorce
//                            ENRICHIT — l'inverse exact de ce que la fonction modélise.
//   • 1e9   → `keep` très négatif : les DETTES multipliées par un facteur négatif deviennent un
//                            actif fantôme → patrimoine final −7 782 605 996 $.
//   • NaN   → tous les soldes × NaN, actifs zéroïsés, AUCUN `logError`.
//
// ⚠️ Le clamp est au MOTEUR, pas seulement à l'UI : une borne posée uniquement sur l'input
// laisserait passer un import de sauvegarde, un scénario de test, ou un futur appelant. L'input
// porte la même règle IMPORTÉE (source unique) pour que l'utilisateur voie la borne.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clampSplitPct, DIVORCE_SPLIT_PCT_DEFAULT, tryDivorce } from '../../services/projection/stochasticEvents';
import type { ProjectionConfig } from '../../types';

describe('clampSplitPct — la borne, au seul point de passage', () => {
    it('laisse passer l\'intervalle légitime, bornes comprises', () => {
        for (const v of [0, 1, 25, 50, 99, 100]) expect(clampSplitPct(v)).toBe(v);
    });

    it('borne les valeurs hors [0, 100] au lieu de les propager', () => {
        expect(clampSplitPct(-100)).toBe(0);
        expect(clampSplitPct(1e9)).toBe(100);
        expect(clampSplitPct(101)).toBe(100);
        expect(clampSplitPct(-0.5)).toBe(0);
    });

    it('une valeur NON FINIE retombe sur le DÉFAUT, pas sur 0', () => {
        // « 0 % de partage » serait une réponse aussi inventée que le NaN d'origine : le seul
        // repli défendable est la règle du patrimoine familial.
        expect(clampSplitPct(Number.NaN)).toBe(DIVORCE_SPLIT_PCT_DEFAULT);
        expect(clampSplitPct(Number.POSITIVE_INFINITY)).toBe(DIVORCE_SPLIT_PCT_DEFAULT);
        expect(clampSplitPct(Number.NEGATIVE_INFINITY)).toBe(DIVORCE_SPLIT_PCT_DEFAULT);
        expect(Number.isNaN(clampSplitPct(Number.NaN))).toBe(false);
    });
});

// ── LE test discriminant : `keep` observé À LA SOURCE, pas déduit d'un patrimoine final. ──
describe('[ENG-DIVORCE-SPLITPCT-UNBOUNDED] `keep` reste dans [0, 1], quoi qu\'on lui donne', () => {
    /** Déclenche un divorce à coup sûr et capture le `keep` REELLEMENT passé au splitter. */
    const keepFor = (divorceSplitPct: number | undefined): number => {
        let captured = Number.NaN;
        const fired = tryDivorce(
            // `rng: () => 0` < toute probabilité ⇒ le divorce se déclenche systématiquement.
            { m: 12, currentMonthIndex: 0, enableMonteCarlo: true, rng: () => 0 },
            { divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct } as unknown as ProjectionConfig,
            false,
            (keep: number) => { captured = keep; },
        );
        expect(fired, 'le divorce ne s\'est pas déclenché : le test ne mesure rien').toBe(true);
        return captured;
    };

    it('valeur normale : `keep` est le complément exact', () => {
        expect(keepFor(50)).toBeCloseTo(0.5, 10);
        expect(keepFor(0)).toBeCloseTo(1, 10);
        expect(keepFor(100)).toBeCloseTo(0, 10);
    });

    it('−100 ne peut plus donner `keep = 2` (le divorce ENRICHISSAIT)', () => {
        const keep = keepFor(-100);
        expect(keep, 'keep > 1 : le divorcé garde PLUS que ce qu\'il avait').toBeLessThanOrEqual(1);
        expect(keep).toBeCloseTo(1, 10);
    });

    it('1e9 ne peut plus donner un `keep` NÉGATIF (dettes → actif fantôme)', () => {
        const keep = keepFor(1e9);
        expect(keep, 'keep < 0 : les dettes deviennent un actif').toBeGreaterThanOrEqual(0);
        expect(keep).toBeCloseTo(0, 10);
    });

    it('NaN ne peut plus zéroïser le bilan en silence', () => {
        const keep = keepFor(Number.NaN);
        expect(Number.isFinite(keep), 'un keep non fini multiplie TOUS les soldes').toBe(true);
        expect(keep).toBeCloseTo(1 - DIVORCE_SPLIT_PCT_DEFAULT / 100, 10);
    });

    it('`undefined` (champ absent d\'une vieille sauvegarde) donne le défaut', () => {
        expect(keepFor(undefined)).toBeCloseTo(1 - DIVORCE_SPLIT_PCT_DEFAULT / 100, 10);
    });
});

// ── Le LIBELLÉ doit dire ce que le moteur a fait (revue Vercel #621) ──────────
// Avant le clamp, le libellé et le calcul étaient faux ENSEMBLE, donc cohérents. Le clamp seul
// aurait rendu le calcul juste en laissant le libellé annoncer « partage de 150 % » — la classe
// « règle dupliquée corrigée à moitié », qui est PIRE que l'erreur d'origine parce qu'elle fait
// mentir une trace que l'utilisateur lit.
describe('le libellé du divorce annonce le pourcentage RÉELLEMENT appliqué', () => {
    it('une saisie hors bornes est annoncée bornée, pas verbatim', () => {
        // La garde est un scan de SOURCE : le libellé est construit dans `projection.ts`, hors de
        // portée d'un test unitaire sans faire tourner un scénario MC complet. On vérifie donc que
        // le site d'interpolation passe par `clampSplitPct` — c'est CE couplage qui doit tenir.
        const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
        const src = readFileSync(path.join(root, 'services/projection.ts'), 'utf8');
        const ligne = src.split('\n').find((l) => l.includes('Divorce — partage de'));
        expect(ligne, 'le libellé du divorce a disparu — mettre cette garde à jour').toBeDefined();
        expect(ligne, 'le libellé interpole la valeur BRUTE : il peut mentir sur ce qui a été appliqué')
            .toMatch(/clampSplitPct\(/);
    });
});
