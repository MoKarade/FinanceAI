/**
 * [REFONTE-NAV-L2a] `computeNetWorthVariation` — la série `Total` de l'ex-Accueil réduite à ses
 * deux bornes sur une fenêtre glissante, pour la tuile « Variation 30 j » du Futur.
 *
 * Ce qu'on verrouille :
 *  - le calcul (diff/pct) sur ≥ 2 points, avec cash + buckets TOTAL_* + immo − dettes ;
 *  - le no-fake-data : < 2 points dans la fenêtre ou borne non finie → `null`, JAMAIS un 0 ;
 *  - la classe #544 : un compte découvert via TRANSACTION (absent d'initialBalances) est amorcé
 *    à 0 — sans amorçage, la borne de départ serait NaN et la variation muette en permanence ;
 *  - `pct: null` quand le point de départ est ≤ 0 (l'ex-Accueil affichait un « 0 % » trompeur).
 *
 * Note discriminance : fonction NOUVELLE — `git stash` ferait échouer la suite par module
 * absent (preuve vide). La discriminance réelle est portée par les cas qui tuent chacun les
 * implémentations plausibles fausses : sans amorçage → null ; sans filtre de fenêtre → diff
 * calculé depuis le point hors fenêtre ; avec `pct || 0` → 0 au lieu de null.
 */
import { describe, it, expect } from 'vitest';
import { computeNetWorthVariation } from '../../hooks/useNetWorthVariation';
import type { MarketDataPoint } from '../../services/finance';
import type { Transaction, Debt, RealEstateGoal } from '../../types';

const NOW = new Date('2026-08-12T12:00:00');
const iso = (daysAgo: number): string => {
    const d = new Date(NOW);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().slice(0, 10);
};

const row = (daysAgo: number, buckets: Record<string, number> = {}): MarketDataPoint =>
    ({ date: iso(daysAgo), ...buckets });

const tx = (daysAgo: number, amount: number, accountName: string, over: Partial<Transaction> = {}): Transaction =>
    ({ id: daysAgo * 1000 + Math.round(amount), date: iso(daysAgo), payee: 'Test', amount, category: 'Autre', status: 'processed', accountName, ...over });

const debt = (balance: number): Debt =>
    ({ id: 'd1', name: 'Marge', balance, interestRate: 5, minimumPayment: 50, category: 'Personal' });

/** Bien PASSÉ à valeur/hypothèque EXPLICITES (priment sur la reconstruction) → équité 100 000 $. */
const goal: RealEstateGoal = {
    id: 'g1', name: 'Maison', isActive: true, purchaseDate: '2020-01-01',
    price: 350_000, downPayment: 70_000, mortgageRate: 4, amortization: 25,
    totalClosingCosts: 0, monthlyPayment: 1_500, unrecoverableMonthly: 0,
    isPrimaryResidence: true, currentValue: 400_000, mortgageBalance: 300_000,
};

const compute = (
    rows: MarketDataPoint[],
    transactions: Transaction[] = [],
    initialBalances: Record<string, number> = {},
    debts: Debt[] = [],
    goals: RealEstateGoal[] = [],
) => computeNetWorthVariation(rows, transactions, initialBalances, debts, goals, 30, NOW);

describe('computeNetWorthVariation — calcul', () => {
    it('2 points dans la fenêtre → diff et pct exacts (cash + buckets TOTAL_*)', () => {
        const res = compute(
            [row(10, { TOTAL_CELI: 100 }), row(1, { TOTAL_CELI: 150 })],
            [], { Compte: 1000 },
        );
        // Totaux : 1000+100 = 1100 → 1000+150 = 1150.
        expect(res).not.toBeNull();
        expect(res!.diff).toBeCloseTo(50, 6);
        expect(res!.pct).toBeCloseTo((50 / 1100) * 100, 6);
    });

    it('les transactions font bouger le cash entre les deux bornes', () => {
        const res = compute(
            [row(10), row(1)],
            [tx(5, 200, 'Compte')],
            { Compte: 1000 },
        );
        expect(res!.diff).toBeCloseTo(200, 6);
    });

    it('doublons et virements sont EXCLUS du cash (mêmes règles que l\'ex-Accueil)', () => {
        const res = compute(
            [row(10), row(1)],
            [tx(5, 500, 'Compte', { isDuplicate: true }), tx(4, 300, 'Compte', { isTransfer: true })],
            { Compte: 1000 },
        );
        expect(res!.diff).toBeCloseTo(0, 6);
    });

    it('un point HORS fenêtre ne sert pas de borne, mais son cash s\'accumule quand même', () => {
        const res = compute(
            [row(40, { TOTAL_CELI: 1000 }), row(10, { TOTAL_CELI: 100 }), row(1, { TOTAL_CELI: 150 })],
            [tx(35, 400, 'Compte')], // AVANT la fenêtre : doit être dans les DEUX bornes.
            { Compte: 1000 },
        );
        // Bornes : (1000+400)+100 = 1500 → (1000+400)+150 = 1550 — jamais le point à 40 j.
        expect(res!.diff).toBeCloseTo(50, 6);
        expect(res!.pct).toBeCloseTo((50 / 1500) * 100, 6);
    });

    it('dettes constantes : le diff est inchangé, l\'assiette du pct les soustrait', () => {
        const res = compute(
            [row(10, { TOTAL_CELI: 100 }), row(1, { TOTAL_CELI: 150 })],
            [], { Compte: 1000 }, [debt(200)],
        );
        expect(res!.diff).toBeCloseTo(50, 6);
        expect(res!.pct).toBeCloseTo((50 / 900) * 100, 6);
    });

    it('équité immobilière (année courante) incluse dans l\'assiette des deux bornes', () => {
        const res = compute(
            [row(10, { TOTAL_CELI: 100 }), row(1, { TOTAL_CELI: 150 })],
            [], { Compte: 1000 }, [], [goal],
        );
        // Équité explicite 400 000 − 300 000 = 100 000 aux deux bornes.
        expect(res!.diff).toBeCloseTo(50, 6);
        expect(res!.pct).toBeCloseTo((50 / 101_100) * 100, 6);
    });
});

describe('computeNetWorthVariation — no-fake-data', () => {
    it('aucune ligne de marché → null (jamais 0)', () => {
        expect(compute([])).toBeNull();
    });

    it('un seul point dans la fenêtre → null (couverture insuffisante)', () => {
        expect(compute([row(40, { TOTAL_CELI: 100 }), row(1, { TOTAL_CELI: 150 })])).toBeNull();
    });

    it('solde initial non fini → null, jamais un chiffre crédible', () => {
        expect(compute([row(10), row(1)], [], { Compte: Number.NaN })).toBeNull();
    });

    it('point de départ ≤ 0 → pct null (l\'ex-Accueil affichait un 0 % trompeur), diff conservé', () => {
        const res = compute([row(10), row(1)], [tx(5, 100, 'Compte')], { Compte: -500 });
        expect(res).not.toBeNull();
        expect(res!.diff).toBeCloseTo(100, 6);
        expect(res!.pct).toBeNull();
    });

    it('classe #544 : compte découvert via transaction (hors initialBalances) amorcé à 0 — pas de NaN muet', () => {
        const res = compute(
            [row(25), row(1)],
            [tx(20, 500, 'NouveauCompte')], // 1re borne AVANT la 1re transaction du compte.
            {},
        );
        // Sans amorçage : rc[NouveauCompte] undefined à la 1re borne → NaN → null. Ici : 0 → 500.
        expect(res).not.toBeNull();
        expect(res!.diff).toBeCloseTo(500, 6);
    });
});
