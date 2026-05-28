/**
 * Lot 2 — taxJanuary.processJanuaryReset : réinitialisation annuelle de janvier
 * (plafonds CELI/FHSA/REER, FERR 72+, fermeture CELIAPP, Guyton-Klinger).
 * Sans test direct. `RRIF_RATES` et `calculateFiscalReport` sont injectés → on
 * les STUB pour des montants exacts indépendants des tables fiscales réelles.
 */
import { describe, it, expect } from 'vitest';
import {
    processJanuaryReset,
    type JanuaryContext,
    type JanuaryHelpers,
} from '../../services/projection/taxJanuary';
import type { FiscalReport } from '../../utils/tax';

const helpers: JanuaryHelpers = {
    RRIF_RATES: { 72: 0.054, 80: 0.0682 },
    calculateFiscalReport: () => ({ marginalRate: 30, netIncome: 50000 } as unknown as FiscalReport),
};

const baseCtx = (o: Partial<JanuaryContext> = {}): JanuaryContext => ({
    m: 12, startYear: 2026, simInflation: 2, age: 40, isRetired: false,
    activeUsersCount: 1, oasClawbackNextPeriod: 0, hasPurchasedPrimary: false,
    celiappOpeningYear: 2026, fhsaEligibleUsersCount: 1,
    users: [{ birthYear: 1986 }],
    celiapp: 0, reer: 100000, liquid: 50000, nonReg: 0, crypto: 0, celi: 0,
    accGrossIncomeYear: 80000, accRetraitsReerYearOld: 0, incomeRetirementMonthly: 0,
    fhsaRoomCurrent: 0, fhsaLifetimeContrib: 0, celiRoomCurrent: 0, rrspRoomCurrent: 0,
    taxCurrentYearGains: 0, prevPortfolioNW: 0, loopYear: 2027,
    ...o,
});

describe('processJanuaryReset — gate « uniquement en janvier, m>0 »', () => {
    it('mois ≠ janvier → null', () => {
        expect(processJanuaryReset(5, baseCtx(), helpers)).toBeNull();
    });
    it('janvier mais m === 0 (tout premier mois) → null', () => {
        expect(processJanuaryReset(0, baseCtx({ m: 0 }), helpers)).toBeNull();
    });
    it('janvier avec m > 0 → résultat non-null', () => {
        expect(processJanuaryReset(0, baseCtx(), helpers)).not.toBeNull();
    });
});

describe('processJanuaryReset — plafonds CELI / REER', () => {
    it('adulte éligible : droit CELI annuel positif', () => {
        const r = processJanuaryReset(0, baseCtx(), helpers)!;
        expect(r.celiRoomDelta).toBeGreaterThan(0);
    });
    it('mineur : aucun droit CELI', () => {
        const r = processJanuaryReset(0, baseCtx({ users: [{ birthYear: 2020 }] }), helpers)!;
        expect(r.celiRoomDelta).toBe(0);
    });
    it('REER : droit positif avant 71 ans, remis à zéro après', () => {
        const young = processJanuaryReset(0, baseCtx({ age: 40 }), helpers)!;
        expect(young.rrspRoomReset).toBe(false);
        expect(young.rrspRoomDelta).toBeGreaterThan(0);
        const old = processJanuaryReset(0, baseCtx({ age: 75 }), helpers)!;
        expect(old.rrspRoomReset).toBe(true);
        expect(old.rrspRoomDelta).toBe(0);
    });
});

describe('processJanuaryReset — FERR (retrait minimum à 72+)', () => {
    it('avant 72 ans : aucun FERR', () => {
        const r = processJanuaryReset(0, baseCtx({ age: 65 }), helpers)!;
        expect(r.ferrMandatoryGross).toBe(0);
        expect(r.ferrLogMsg).toBeUndefined();
    });
    it('à 72 ans : brut = REER × taux RRIF, impôt = brut × taux marginal stubé', () => {
        const r = processJanuaryReset(0, baseCtx({ age: 72, reer: 100000 }), helpers)!;
        expect(r.ferrMandatoryGross).toBeCloseTo(100000 * 0.054, 5); // 5400
        expect(r.ferrTaxOnRrif).toBeCloseTo(5400 * 0.3, 5); // marginalRate stubé = 30 %
        expect(r.ferrLogMsg).toBeDefined();
    });
});

describe('processJanuaryReset — CELIAPP & Guyton-Klinger', () => {
    it('fermeture CELIAPP après 15 ans : solde transféré au REER', () => {
        const r = processJanuaryReset(0, baseCtx({ celiappOpeningYear: 2010, celiapp: 8000 }), helpers)!;
        expect(r.celiappTransferToReer).toBe(8000);
        expect(r.logs.some(l => l.includes('CELIAPP'))).toBe(true);
    });
    it('Guyton-Klinger : gel si portefeuille < 95 % du précédent (retraité, m>12)', () => {
        // portefeuille courant = 50k + 0 + 100k = 150k ; précédent 200k → 150k < 190k → gel.
        const r = processJanuaryReset(0, baseCtx({ isRetired: true, m: 24, prevPortfolioNW: 200000 }), helpers)!;
        expect(r.guytonKlingerFreeze).toBe(true);
        expect(r.newPrevPortfolioNW).toBe(150000);
    });
    it('réduction PSV mensualisée = clawback annuel / 12', () => {
        const r = processJanuaryReset(0, baseCtx({ oasClawbackNextPeriod: 1200 }), helpers)!;
        expect(r.monthlyOasReduction).toBe(100);
    });
});
