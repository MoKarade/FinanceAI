import { describe, it, expect } from 'vitest';
import { buildPastPrefix } from '../../services/history/buildPastPrefix';
import type { PortfolioHistoryPoint } from '../../services/history/reconstructPortfolioHistory';

// [FUTUR-HIST-WIRING-TEST] Prouve le CÂBLAGE money-critical du segment passé (extrait en fonction pure) :
// buckets → helper, dette COURANTE soustraite (Option A), alignement des dates, gate no-fake `hasNW`.
// Verrouille contre une substitution accidentelle `DetteTotale` (finding code-reviewer PR #513).

const invPoint = (date: string, o: Partial<PortfolioHistoryPoint> = {}): PortfolioHistoryPoint => ({
    date, monthIndex: 0, CELI: 0, CELIAPP: 0, REER: 0, REEE: 0, NonReg: 0, Crypto: 0, NetWorth: 0, ...o,
});

describe('[FUTUR-HIST-WIRING-TEST] buildPastPrefix', () => {
    // startYear/startMonth = janvier 2026 (mois 0). '2025-12' → mi=-1, '2025-11' → mi=-2.
    const base = {
        startYear: 2026, startMonth: 0,
        realEstateGoals: [],
        // 1 vraie transaction en 2025-12 → firstMonth = 2025-12 (firstTxnMi = -1).
        transactions: [{ date: '2025-12-15', amount: -500 }],
        calculatedStartingCash: 3000,
    };

    it('soustrait la dette COURANTE du patrimoine net (Option A) — reconstructabilité exacte', () => {
        const out = buildPastPrefix({
            ...base,
            pastHistoryPoints: [invPoint('2025-12-31', { CELI: 10_000, REER: 5_000, NonReg: 2_000, Crypto: 1_000 })],
            currentDebtNonImmo: 8_000,
        });
        const last = out[out.length - 1];
        expect(last.monthIndex).toBe(-1);
        // Σ placements (18 000) + cash (3 000) + immo (0) − dette (8 000) = 13 000.
        expect(last.NetWorth).toBe(13_000);
        // Reconstructabilité (INV-9 étendu au passé) : NW == Σ colonnes − dette.
        const cols = last.Liquidites + last.Immobilier + last.CELI + last.CELIAPP + last.REER + last.REEE + last.NonReg + last.Crypto;
        expect(cols - 8_000).toBe(last.NetWorth);
    });

    it('[discriminant] la dette réduit le NW d\'EXACTEMENT son montant (vs dette 0 = ancien comportement gonflé)', () => {
        const pts = [invPoint('2025-12-31', { CELI: 10_000, REER: 5_000, NonReg: 2_000, Crypto: 1_000 })];
        const avecDette = buildPastPrefix({ ...base, pastHistoryPoints: pts, currentDebtNonImmo: 8_000 });
        const sansDette = buildPastPrefix({ ...base, pastHistoryPoints: pts, currentDebtNonImmo: 0 });
        const nwAvec = avecDette[avecDette.length - 1].NetWorth!;
        const nwSans = sansDette[sansDette.length - 1].NetWorth!;
        expect(nwSans).toBe(21_000); // gonflé (sans dette) = l'ancien bug MONEY-PHANTOM
        expect(nwSans - nwAvec).toBe(8_000);
    });

    it('mappe les buckets 1:1 (CELI/CELIAPP/REER/REEE/NonReg/Crypto passés au bon champ)', () => {
        const out = buildPastPrefix({
            ...base,
            pastHistoryPoints: [invPoint('2025-12-31', { CELI: 1, CELIAPP: 2, REER: 3, REEE: 4, NonReg: 5, Crypto: 6 })],
            currentDebtNonImmo: 0,
        });
        const last = out[out.length - 1];
        expect([last.CELI, last.CELIAPP, last.REER, last.REEE, last.NonReg, last.Crypto]).toEqual([1, 2, 3, 4, 5, 6]);
        // NW = 1+2+3+4+5+6 (21) + cash 3000 = 3021.
        expect(last.NetWorth).toBe(3_021);
    });

    it('no-fake : avant la 1re transaction (mi < firstTxnMi) → NetWorth undefined + Liquidites 0', () => {
        const out = buildPastPrefix({
            ...base,
            // point placement à 2025-11 (mi=-2) < firstMonth 2025-12 (firstTxnMi=-1).
            pastHistoryPoints: [
                invPoint('2025-11-30', { CELI: 9_000 }),
                invPoint('2025-12-31', { CELI: 10_000 }),
            ],
            currentDebtNonImmo: 0,
        });
        const at2 = out.find(p => p.monthIndex === -2)!;
        const at1 = out.find(p => p.monthIndex === -1)!;
        expect(at2.NetWorth).toBeUndefined(); // avant la 1re transaction connue
        expect(at2.Liquidites).toBe(0);
        expect(at1.NetWorth).toBe(13_000); // 10 000 + cash 3 000
        expect(at1.dateLabel).toBe('2025-12');
    });

    it('aucun passé connu → []', () => {
        expect(buildPastPrefix({ ...base, transactions: [], pastHistoryPoints: [], currentDebtNonImmo: 0 })).toEqual([]);
    });
});
