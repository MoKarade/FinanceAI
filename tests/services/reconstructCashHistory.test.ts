import { describe, it, expect } from 'vitest';
import { reconstructCashHistory } from '../../services/history/reconstructCashHistory';
import { reconstructRealEstateEquityByYear } from '../../services/history/reconstructRealEstateEquity';
import type { RealEstateGoal } from '../../types';

// G22-B1 — reconstruction du passé (cash + équité immo) pour la VN passée du Futur.

describe('reconstructCashHistory', () => {
    it('aucune transaction → vide', () => {
        const r = reconstructCashHistory([], 5000, '2026-03');
        expect(r.points).toEqual([]);
        expect(r.firstMonth).toBeNull();
    });

    it('remonte le cash en soustrayant les flux des mois suivants', () => {
        // Cash actuel (fin 2026-03) = 5000. Flux : +1000 en 2026-03, -500 en 2026-02.
        // Fin 2026-02 = 5000 − 1000 = 4000. Fin 2026-01 = 4000 − (−500) = 4500.
        const tx = [
            { date: '2026-03-10', amount: 1000 },
            { date: '2026-02-15', amount: -500 },
        ];
        const r = reconstructCashHistory(tx, 5000, '2026-03');
        expect(r.firstMonth).toBe('2026-02');
        // Points passés (avant le mois courant) : 2026-01 et 2026-02… mais firstMonth=2026-02
        // donc on ne descend pas sous 2026-02. Point produit : 2026-02 = 4000.
        expect(r.points).toEqual([{ month: '2026-02', cash: 4000 }]);
    });

    it('plusieurs mois : ordre chronologique croissant', () => {
        const tx = [
            { date: '2026-01-05', amount: 2000 },
            { date: '2026-02-05', amount: 2000 },
            { date: '2026-03-05', amount: 2000 },
        ];
        // Cash fin 2026-03 = 10000. Fin 02 = 10000−2000 = 8000. Fin 01 = 8000−2000 = 6000.
        const r = reconstructCashHistory(tx, 10000, '2026-03');
        expect(r.points.map(p => p.month)).toEqual(['2026-01', '2026-02']);
        expect(r.points.map(p => p.cash)).toEqual([6000, 8000]);
    });

    it('ignore montants NaN et dates invalides', () => {
        const tx = [
            { date: '2026-03-05', amount: 1000 },
            { date: '', amount: 999 },
            { date: '2026-02-05', amount: NaN },
        ];
        const r = reconstructCashHistory(tx, 5000, '2026-03');
        // 2026-02 a un montant NaN → ignoré ; seule 2026-03 (valide) compte.
        expect(r.firstMonth).toBe('2026-03');
    });

    // [FUTUR-REAL-HISTORY] Cohérence de base ancre↔walk-back : `computeStartingCash` (cash présent du moteur)
    // EXCLUT isDuplicate ET isTransfer → le walk-back DOIT les exclure aussi, sinon les deux bouts de la même
    // courbe divergent (finding financial-integrity 2026-07-24). Discriminant : sur le code d'avant (qui sommait
    // TOUTES les transactions), le virement d'un mois passé décalait le cash reconstruit de son montant.
    it('[FUTUR-REAL-HISTORY] exclut isTransfer du walk-back (aligné sur computeStartingCash)', () => {
        // Cash actuel (fin 2026-03) = 5000. En 2026-03 : un vrai flux −800 (épicerie) ET un virement −5000
        // vers le CELI (isTransfer, NE compte PAS dans le cash de ce modèle). Fin 2026-02 = 5000 − (−800) = 5800,
        // SANS réintégrer le virement (sinon 5000 − (−800 − 5000) = 10 800, faux).
        const tx = [
            { date: '2026-03-10', amount: -800 },
            { date: '2026-03-12', amount: -5000, isTransfer: true },
            { date: '2026-02-15', amount: 0 }, // borne firstMonth = 2026-02
        ];
        const r = reconstructCashHistory(tx, 5000, '2026-03');
        expect(r.firstMonth).toBe('2026-02');
        expect(r.points).toEqual([{ month: '2026-02', cash: 5800 }]); // 5000 − (−800), virement ignoré
    });

    it('[FUTUR-REAL-HISTORY] exclut isDuplicate du walk-back (artefact, pas un vrai mouvement)', () => {
        const tx = [
            { date: '2026-03-10', amount: -300 },
            { date: '2026-03-11', amount: -300, isDuplicate: true }, // doublon → ignoré
            { date: '2026-02-01', amount: 0 },
        ];
        const r = reconstructCashHistory(tx, 4000, '2026-03');
        // Fin 2026-02 = 4000 − (−300) = 4300 (le doublon ne double PAS le retrait).
        expect(r.points).toEqual([{ month: '2026-02', cash: 4300 }]);
    });

    it('[FUTUR-REAL-HISTORY] un mois SANS flux réel (que des dup/transfert) → cash inchangé', () => {
        const tx = [
            { date: '2026-03-05', amount: -1000, isTransfer: true },
            { date: '2026-02-05', amount: 500 }, // vrai flux, borne firstMonth
        ];
        const r = reconstructCashHistory(tx, 7000, '2026-03');
        // 2026-03 n'a QUE le virement (ignoré) → fin 2026-02 = 7000 (aucun flux réel retiré).
        expect(r.points).toEqual([{ month: '2026-02', cash: 7000 }]);
    });
});

describe('reconstructRealEstateEquityByYear', () => {
    const prop = (over: Partial<RealEstateGoal> = {}): RealEstateGoal => ({
        id: 'p1', isActive: true, purchaseDate: '2020-06-01', price: 400000, downPayment: 80000,
        mortgageRate: 5, amortization: 25, totalClosingCosts: 0, monthlyPayment: 0,
        unrecoverableMonthly: 0, isPrimaryResidence: true, propertyGrowthRate: 3, ...over,
    } as RealEstateGoal);

    it('propriété achetée en 2020 → équité croissante jusqu\'à aujourd\'hui', () => {
        const m = reconstructRealEstateEquityByYear([prop()], 2026);
        expect(m.get(2020)).toBe(80000); // année d'achat ≈ mise de fonds
        const e2026 = m.get(2026)!;
        expect(e2026).toBeGreaterThan(80000); // équité monte (remboursement + appréciation)
        // Pas d'années futures.
        expect(m.has(2027)).toBe(false);
    });

    it('achat futur → ignoré (pas dans le passé)', () => {
        const m = reconstructRealEstateEquityByYear([prop({ purchaseDate: '2030-01-01' })], 2026);
        expect(m.size).toBe(0);
    });

    it('propriété inactive → ignorée', () => {
        const m = reconstructRealEstateEquityByYear([prop({ isActive: false })], 2026);
        expect(m.size).toBe(0);
    });

    it('deux propriétés → équités sommées par année', () => {
        const m = reconstructRealEstateEquityByYear([prop(), prop({ id: 'p2', downPayment: 50000 })], 2026);
        expect(m.get(2020)).toBe(130000); // 80000 + 50000
    });
});
