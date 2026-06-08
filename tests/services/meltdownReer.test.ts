/**
 * Lot 2 — meltdownReer.processReerMeltdown : stratégie de décaissement REER
 * agressif (« meltdown ») pour éviter la bombe fiscale au décès. Sans test
 * direct. On verrouille les gardes (null), les paliers de patrimoine net, et
 * la retenue par tranche (source de vérité RRSP_WITHHOLDING_QC : 19/24/29 %,
 * tranche déterminée sur le brut mensuel — fix audit 2026-06, avant : 30/38 % en dur).
 */
import { describe, it, expect } from 'vitest';
import { processReerMeltdown, type MeltdownCtx } from '../../services/projection/meltdownReer';
import type { AllocationStrategy } from '../../services/projection/types';

const MELT = 'MELTDOWN_REER' as AllocationStrategy;

const baseCtx = (o: Partial<MeltdownCtx> = {}): MeltdownCtx => ({
    m: 0, isRetired: true, simSalaryGrowth: 2, activeUsersCount: 1,
    incomeRetirement: 2000, accRetraitsReerYear: 0, accRentesYear: 0,
    grossMarcBaseAnnual: 0, grossAnnaBaseAnnual: 0,
    reer: 500000, nonReg: 100000, celi: 50000, realEstateEquity: 0, ...o,
});

describe('processReerMeltdown — gardes (null)', () => {
    it('stratégie ≠ MELTDOWN_REER → null', () => {
        expect(processReerMeltdown(baseCtx(), 'AGGRESSIVE' as AllocationStrategy)).toBeNull();
    });
    it('REER vide → null', () => {
        expect(processReerMeltdown(baseCtx({ reer: 0 }), MELT)).toBeNull();
    });
    it('revenu déjà ≥ cible → null', () => {
        // retraité avec 120k$/an de revenu ≥ cible base 90k$ → rien à melt
        expect(processReerMeltdown(baseCtx({ incomeRetirement: 10000 }), MELT)).toBeNull();
    });
    it('montant mensuel ≤ 200$ → null (écart négligeable)', () => {
        // 88 800$/an → écart 1 200$ → /12 = 100$ ≤ 200 → null
        expect(processReerMeltdown(baseCtx({ incomeRetirement: 7400 }), MELT)).toBeNull();
    });
});

describe('processReerMeltdown — décaissement actif & paliers', () => {
    it('patrimoine de base (<1 M$) : cible 90k$, retenue tranche 2 (24 %)', () => {
        const r = processReerMeltdown(baseCtx(), MELT)!;
        // currentGross = 24 000 ; (90 000 − 24 000)/12 = 5 500 ; 5 500 > 5 000 → tranche 2 = 24 %
        expect(r.reerDrawn).toBeCloseTo(5500, 2);
        expect(r.withholding).toBeCloseTo(5500 * 0.24, 2);
        expect(r.nonRegAdd).toBeCloseTo(5500 * 0.76, 2);
    });

    it('très haut patrimoine (>2 M$) : gros brut mensuel → retenue tranche 3 (29 %)', () => {
        const r = processReerMeltdown(baseCtx({ reer: 2_500_000 }), MELT)!;
        // cible 220k ; (220 000 − 24 000)/12 ≈ 16 333 > 15 000 → tranche 3 = 29 %
        expect(r.withholding / r.reerDrawn).toBeCloseTo(0.29, 5);
    });

    it('en emploi (non retraité) : revenu projeté pris en compte', () => {
        const r = processReerMeltdown(
            baseCtx({ isRetired: false, grossMarcBaseAnnual: 50000, incomeRetirement: 0 }),
            MELT,
        )!;
        // currentGross = 50 000 ; (90 000 − 50 000)/12 ≈ 3 333
        expect(r.reerDrawn).toBeCloseTo(40000 / 12, 2);
    });
});
