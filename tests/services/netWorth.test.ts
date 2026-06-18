// tests/services/netWorth.test.ts
// [HARDEN-NETWORTH-EXHAUSTIVE] garde anti MONEY-PHANTOM (bug Marc « -193 k$ » 2026-06-16 : une copie
// de la formule du patrimoine net OUBLIAIT un terme de dette → patrimoine faux). Ici on PROUVE que la
// formule littérale `computeRawNetWorth` utilise EXACTEMENT les termes classés dans `NET_WORTH_SIGN` —
// donc qu'un futur champ d'actif/dette ajouté à l'interface mais oublié dans la formule est attrapé.

import { describe, it, expect } from 'vitest';
import { computeRawNetWorth, NET_WORTH_SIGN, type NetWorthParts } from '../../services/projection/netWorth';

const sample: NetWorthParts = {
    liquid: 10_000, celi: 40_000, celiapp: 5_000, reer: 80_000, nonReg: 25_000, crypto: 8_000, reee: 12_000,
    realEstateEquity: 150_000, liquidDebt: 2_000, smithManoeuvreDebt: 50_000, activeDebtsTotal: 9_000,
};

describe('computeRawNetWorth — [HARDEN-NETWORTH-EXHAUSTIVE]', () => {
    it('valeur de référence (golden) : Σactifs − Σdettes', () => {
        // actifs 10k+40k+5k+80k+25k+8k+12k+150k = 330k ; dettes 2k+50k+9k = 61k → NW 269k.
        expect(computeRawNetWorth(sample)).toBe(269_000);
    });

    it('DISCRIMINANT : la formule littérale == Σ NET_WORTH_SIGN[k] × p[k] (aucun terme oublié)', () => {
        // Source unique de la classification (sign-map exhaustif par le type). Si un champ est ajouté à
        // NetWorthParts + NET_WORTH_SIGN mais OUBLIÉ dans la formule littérale, les deux divergent → échec.
        const keys = Object.keys(NET_WORTH_SIGN) as (keyof NetWorthParts)[];
        const derived = keys.reduce((s, k) => s + NET_WORTH_SIGN[k] * sample[k], 0);
        expect(computeRawNetWorth(sample)).toBe(derived);
    });

    it('valeurs ALÉATOIRES bornées : littéral == dérivé (robustesse de l’équivalence)', () => {
        const keys = Object.keys(NET_WORTH_SIGN) as (keyof NetWorthParts)[];
        // 50 tirages déterministes (LCG) — pas de Math.random (déterminisme test).
        let seed = 123456789;
        const next = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
        for (let i = 0; i < 50; i++) {
            const p = {} as NetWorthParts;
            for (const k of keys) p[k] = Math.round((next() * 2 - 0.5) * 200_000); // ∈ [-100k, 300k]
            const derived = keys.reduce((s, k) => s + NET_WORTH_SIGN[k] * p[k], 0);
            expect(computeRawNetWorth(p)).toBe(derived);
        }
    });

    it('NET_WORTH_SIGN classe EXACTEMENT les 11 champs de NetWorthParts', () => {
        expect(Object.keys(NET_WORTH_SIGN).sort()).toEqual([
            'activeDebtsTotal', 'celi', 'celiapp', 'crypto', 'liquid', 'liquidDebt',
            'nonReg', 'realEstateEquity', 'reee', 'reer', 'smithManoeuvreDebt',
        ]);
    });

    it('signes cohérents : dettes = −1, tout le reste = +1', () => {
        const debts = new Set(['liquidDebt', 'smithManoeuvreDebt', 'activeDebtsTotal']);
        for (const [k, sign] of Object.entries(NET_WORTH_SIGN)) {
            expect(sign).toBe(debts.has(k) ? -1 : 1);
        }
    });

    it('realEstateEquity est DÉJÀ net d’hypothèque (compté en +, sans re-soustraction)', () => {
        // +1 : on n’ajoute pas mortgageBalance ici (convention source unique).
        expect(NET_WORTH_SIGN.realEstateEquity).toBe(1);
        const withEquity = computeRawNetWorth({ ...sample, realEstateEquity: 200_000 });
        const without = computeRawNetWorth({ ...sample, realEstateEquity: 0 });
        expect(withEquity - without).toBe(200_000);
    });
});
