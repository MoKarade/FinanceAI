import { describe, it, expect } from 'vitest';
import { processCashflowAllocation, type CashflowState, type CashflowCtx } from '../../services/projection/cashflowAllocation';
import type { Debt } from '../../types';

// G21 C5 commit 1 — tests de sensibilité des leviers découplés (contributionOrder,
// debtFirst). On teste directement processCashflowAllocation : déterministe, rapide,
// et ça cible précisément le découplage sans exposer runScenario.

const makeState = (over: Partial<CashflowState> = {}): CashflowState => ({
    liquid: 0, celi: 0, reer: 0, celiapp: 0, nonReg: 0, nonRegACB: 0,
    capitalLossBank: 0, crypto: 0, celiRoom: 0, rrspRoom: 0, fhsaRoom: 0,
    taxCurrentYearReer: 0, accRetraitsReerYear: 0, accCapitalGainsYear: 0,
    accRrspYear: 0, accFhsaYear: 0, fhsaLifetimeContrib: 0, celiWithdrawalsThisYear: 0,
    retraitReerMois: 0, retraitCeliMois: 0, withdrawalREER: 0, withdrawalCELI: 0,
    withdrawalNonReg: 0, withdrawalCrypto: 0, contribCELI: 0, contribREER: 0,
    contribNonReg: 0, contribCELIAPP: 0, shortfallMonths: 0, flowEventLogs: [],
    ...over,
});

const makeCtx = (over: Partial<CashflowCtx> = {}): CashflowCtx => ({
    monthlyCashflow: 3000, targetEF: 0, criticalThreshold: 0, isRetired: false,
    strategy: 'AUTO_MARGINAL', m: 0, loopYear: 2026, enableMonteCarlo: false,
    activeUsersCount: 1, grossMarcBaseAnnual: 60000, grossAnnaBaseAnnual: 0,
    simSalaryGrowth: 0, incomeRetirement: 0, accRentesYear: 0,
    hasFuturePurchase: false, hasPurchasedPrimary: false,
    ...over,
});

// marginalRate bas (20%) → la dérivation auto ne force PAS REER d'abord ; on isole
// donc l'effet de contributionOrder.
const fiscalStub = () => ({ marginalRate: 20 } as any);
const grossStub = (net: number) => ({ gross: net / 0.7 });

describe('cashflowAllocation — levier contributionOrder', () => {
    // excess (3000) < rrspRoom & celiRoom (5000 chacun) → seul le 1er bucket se remplit.
    it("REER_FIRST cotise au REER en premier", () => {
        const state = makeState({ rrspRoom: 5000, celiRoom: 5000 });
        processCashflowAllocation(state, makeCtx({ contributionOrder: 'REER_FIRST' }), [], fiscalStub, grossStub);
        expect(state.contribREER).toBe(3000);
        expect(state.contribCELI).toBe(0);
    });

    it("CELI_FIRST cotise au CELI en premier", () => {
        const state = makeState({ rrspRoom: 5000, celiRoom: 5000 });
        processCashflowAllocation(state, makeCtx({ contributionOrder: 'CELI_FIRST' }), [], fiscalStub, grossStub);
        expect(state.contribCELI).toBe(3000);
        expect(state.contribREER).toBe(0);
    });

    it("sans override : AUTO_MARGINAL à taux bas cotise au CELI d'abord (comportement historique)", () => {
        const state = makeState({ rrspRoom: 5000, celiRoom: 5000 });
        processCashflowAllocation(state, makeCtx(), [], fiscalStub, grossStub);
        expect(state.contribCELI).toBe(3000);
        expect(state.contribREER).toBe(0);
    });
});

describe('cashflowAllocation — levier debtFirst', () => {
    const debt5pct = (): Debt => ({
        id: 'd1', name: 'Prêt auto', balance: 4000, interestRate: 5, minimumPayment: 100,
    } as Debt);

    it('debtFirst=true rembourse une dette non-toxique (5% < 7%)', () => {
        const state = makeState({ rrspRoom: 5000, celiRoom: 5000 });
        const debts = [debt5pct()];
        processCashflowAllocation(state, makeCtx({ debtFirst: true }), debts, fiscalStub, grossStub);
        expect(debts[0].balance).toBe(1000); // 3000 d'excess appliqués à la dette
        expect(state.contribCELI + state.contribREER).toBe(0); // rien investi
    });

    it('sans override : une dette à 5% n\'est PAS remboursée (seules les toxiques >7%)', () => {
        const state = makeState({ rrspRoom: 5000, celiRoom: 5000 });
        const debts = [debt5pct()];
        processCashflowAllocation(state, makeCtx(), debts, fiscalStub, grossStub);
        expect(debts[0].balance).toBe(4000); // intacte
        expect(state.contribCELI).toBe(3000); // excess investi
    });
});
