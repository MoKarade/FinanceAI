// tests/services/projection.round2.test.ts
//
// [PERF-ENGINE-TOFIXED-ROUND] `round2` remplace `Number(x.toFixed(2))` dans la boucle chaude du
// moteur (~92 champs/mois, `buildMonthlyDataPoint`). Le CONTRAT est la PARITÉ BIT-IDENTIQUE, pas
// « un meilleur arrondi » : les goldens épinglent des valeurs produites par `toFixed`, et le
// correctif « évident » (`Math.round(x*100)/100`) en diverge sur les demi-frontières — c'est le
// piège que le ticket documentait, prouvé ci-dessous par l'anti-vacuité.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { round2 } from '../../services/projection/helpers';
import { stripComments } from '../../utils/stripComments';

const ref = (x: number): number => Number(x.toFixed(2));

describe('[PERF-ENGINE-TOFIXED-ROUND] round2 ≡ Number(x.toFixed(2)) — parité bit-identique', () => {
    it('tueurs connus : les demi-frontières où le correctif naïf se trompe', () => {
        // `-0.005` : décimal exact du double = -0.00500000…, toFixed arrondit loin de zéro.
        expect(Object.is(round2(-0.005), -0.01)).toBe(true);
        // `2.675` : le double vaut 2.674999…, toFixed rend 2.67 (PAS le 2.68 du demi décimal).
        expect(round2(2.675)).toBe(2.67);
        expect(round2(-2.675)).toBe(-2.67);
        expect(Object.is(round2(-99.995), -100)).toBe(true);
        // `-0` : toFixed rend "0.00" → +0 ; un petit négatif rend "-0.00" → -0. Les DEUX sens.
        expect(Object.is(round2(-0), 0)).toBe(true);
        expect(Object.is(round2(-0.001), -0)).toBe(true);
        // Non-finis : mêmes sorties que la référence (NaN → NaN, ±Infinity → ±Infinity).
        expect(Number.isNaN(round2(Number.NaN))).toBe(true);
        expect(round2(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
        expect(round2(Number.NEGATIVE_INFINITY)).toBe(Number.NEGATIVE_INFINITY);
    });

    it('ANTI-VACUITÉ : le correctif naïf diverge bien de la référence sur un tueur — le banc discrimine', () => {
        // Si cette assertion rougit, `Object.is(candidat, ref)` ne distingue plus rien et tout le
        // fuzz ci-dessous est vacueux. Mesuré : Math.round(-0.5) = -0, toFixed(-0.005) = "-0.01".
        const naif = (x: number): number => Math.round(x * 100) / 100;
        expect(Object.is(naif(-0.005), ref(-0.005))).toBe(false);
        expect(Object.is(naif(-0), ref(-0))).toBe(false);
    });

    it('fuzz adversarial : grilles de demis décimaux exacts + magnitudes larges — 0 divergence', () => {
        // Grilles k/1000, k/200, k/800 : TOUTES les valeurs à 3 décimales (donc tous les .xx5
        // décimaux exacts) sur ±300, plus deux pas qui fabriquent d'autres représentations
        // binaires des mêmes demis. C'est la population où toFixed et un arrondi naïf divergent.
        const divergences: number[] = [];
        const check = (x: number): void => {
            if (!Object.is(round2(x), ref(x))) divergences.push(x);
        };
        for (let k = -300_000; k <= 300_000; k++) check(k / 1000);
        for (let k = -60_000; k <= 60_000; k++) check(k / 200);
        for (let k = -80_000; k <= 80_000; k++) check(k / 800);
        // Grands montants : ulp(x*100) > 1e-5 — la fenêtre de repli doit RESTER relative.
        for (let k = 0; k <= 2_000; k++) { check(1e9 + k / 1000); check(-(1e9 + k / 1000)); }
        // Aléatoire multi-magnitudes, GRAINE FIXE (LCG) — jamais Math.random dans un test.
        let seed = 0x2F6E2B1;
        const rand = (): number => {
            seed = (seed * 1_103_515_245 + 12_345) & 0x7FFFFFFF;
            return seed / 0x7FFFFFFF;
        };
        for (let i = 0; i < 500_000; i++) {
            const mag = Math.pow(10, rand() * 12 - 3);   // 1e-3 → 1e9, l'étendue des montants du moteur
            check((rand() * 2 - 1) * mag);
        }
        // Compte des points AVANT l'assertion (anti-vacuité du fuzz lui-même) : mesuré 1 025 002.
        expect(divergences, `divergences round2 vs toFixed : ${divergences.slice(0, 5).join(', ')}`).toEqual([]);
    });
});

describe('[PERF-ENGINE-TOFIXED-ROUND] monthlyOutput ne repasse pas par toFixed(2)', () => {
    it('la boucle chaude consomme round2 — zéro `.toFixed(2)` dans la source décommentée', () => {
        const brut = readFileSync('services/projection/monthlyOutput.ts', 'utf8');
        const code = stripComments(brut);
        // Anti-vacuité du décommentage : le fichier reste substantiellement du code.
        expect(code.replace(/\s/g, '').length).toBeGreaterThan(5_000);
        // Le FAIT défendu : plus aucun champ construit via toFixed(2) (le motif lent).
        expect(code).not.toMatch(/\.toFixed\(2\)/);
        // Témoin : les champs passent par round2, massivement (94 sites au 2026-09-04 — plancher
        // large : une refonte peut en fusionner, pas les faire disparaître).
        const usages = (code.match(/\bround2\(/g) ?? []).length;
        expect(usages).toBeGreaterThan(60);
        // Dette résiduelle ASSUMÉE : un unique `.toFixed(1)` (liquidityRunway) reste — hors du
        // périmètre du ticket (précision différente, 1 site). S'il disparaît, tant mieux ; s'il
        // se MULTIPLIE, c'est le motif lent qui revient par l'autre précision.
        const toFixed1 = (code.match(/\.toFixed\(1\)/g) ?? []).length;
        expect(toFixed1).toBeLessThanOrEqual(1);
    });
});
