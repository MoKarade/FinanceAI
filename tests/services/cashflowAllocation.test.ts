// services/projection/cashflowAllocation.ts — filet de tests directs (le module « cœur du mois »
// n'en avait aucun). On exerce la VRAIE fonction `processCashflowAllocation` (pas une réplique) :
// conservation des flux (le surplus/déficit ne doit ni créer ni détruire d'argent), priorité du
// coussin, cascade de retraits, ordre de cotisation. Stubs injectés pour la fiscalité.
import { describe, it, expect } from 'vitest';
import {
    processCashflowAllocation,
    type CashflowState,
    type CashflowCtx,
} from '../../services/projection/cashflowAllocation';
import type { FiscalReport } from '../../utils/tax';
import type { Debt } from '../../types';

// --- stubs fiscaux (seul .marginalRate est lu par le module, en EXCESS non-retraité) ---
const fiscalStub = (marginalDecimal = 0.30) =>
    ((): FiscalReport => ({ marginalRate: marginalDecimal } as unknown as FiscalReport)) as unknown as
        (g: number, r: number, f: number, y: number, mc: boolean) => FiscalReport;
// retenue REER ~25 % : net désiré → brut
const withholdingStub = (netDesired: number) => ({ gross: netDesired / 0.75 });

const baseState = (over: Partial<CashflowState> = {}): CashflowState => ({
    liquid: 0, celi: 0, reer: 0, celiapp: 0, nonReg: 0, nonRegACB: 0, capitalLossBank: 0, crypto: 0,
    celiRoom: 0, rrspRoom: 0, fhsaRoom: 0, taxCurrentYearReer: 0, accRetraitsReerYear: 0,
    accCapitalGainsYear: 0, accRrspYear: 0, accFhsaYear: 0, fhsaLifetimeContrib: 0,
    celiWithdrawalsThisYear: 0, retraitReerMois: 0, retraitCeliMois: 0,
    withdrawalREER: 0, withdrawalCELI: 0, withdrawalNonReg: 0, withdrawalCrypto: 0,
    contribCELI: 0, contribREER: 0, contribNonReg: 0, contribCELIAPP: 0,
    shortfallMonths: 0, flowEventLogs: [],
    ...over,
});

const baseCtx = (over: Partial<CashflowCtx> = {}): CashflowCtx => ({
    monthlyCashflow: 0, targetEF: 10000, criticalThreshold: 2000, isRetired: false,
    strategy: 'AUTO_MARGINAL', m: 0, loopYear: 2026, enableMonteCarlo: false, activeUsersCount: 1,
    grossMarcBaseAnnual: 80000, grossAnnaBaseAnnual: 0, simSalaryGrowth: 2,
    incomeRetirement: 0, accRentesYear: 0, hasFuturePurchase: false, hasPurchasedPrimary: false,
    ...over,
});

const assets = (s: CashflowState) => s.liquid + s.celi + s.reer + s.celiapp + s.nonReg + s.crypto;

describe('processCashflowAllocation — conservation des flux', () => {
    it('EXCESS coussin déjà plein : tout le surplus est investi (Δactifs = surplus)', () => {
        const s = baseState({ liquid: 10000, celiRoom: 100000, rrspRoom: 100000 });
        const before = assets(s);
        processCashflowAllocation(s, baseCtx({ monthlyCashflow: 3000 }), [], fiscalStub(), withholdingStub);
        expect(s.liquid).toBe(10000);                 // coussin inchangé
        expect(assets(s) - before).toBeCloseTo(3000); // conservation : rien créé/détruit
    });

    it('EXCESS coussin partiellement vide : remplit le coussin PUIS investit (conservation)', () => {
        const s = baseState({ liquid: 8000, celiRoom: 100000 });
        const before = assets(s);
        processCashflowAllocation(s, baseCtx({ monthlyCashflow: 5000, targetEF: 10000 }), [], fiscalStub(), withholdingStub);
        expect(s.liquid).toBe(10000);                 // coussin rempli (8000 + 2000)
        expect(assets(s) - before).toBeCloseTo(5000); // les 3000 restants → CELI
        expect(s.celi).toBeCloseTo(3000);
    });

    it('EXCESS surplus INSUFFISANT pour remplir le coussin : ne crée PAS d\'argent', () => {
        // Régression : la fin de branche forçait liquid = targetEF même quand le surplus ne
        // suffisait pas → fabrication d'argent (patrimoine surévalué). Doit conserver.
        const s = baseState({ liquid: 5000 });
        const before = assets(s); // 5000
        processCashflowAllocation(s, baseCtx({ monthlyCashflow: 1000, targetEF: 10000 }), [], fiscalStub(), withholdingStub);
        expect(assets(s) - before).toBeCloseTo(1000); // surplus = 1000, pas 5000
        expect(s.liquid).toBe(6000);                  // 5000 + 1000, PAS 10000
    });

    it('SHORTFALL couvert par le liquide seul : rien d\'autre n\'est touché', () => {
        const s = baseState({ liquid: 10000, celi: 5000, reer: 5000 });
        processCashflowAllocation(s, baseCtx({ monthlyCashflow: -3000, criticalThreshold: 2000 }), [], fiscalStub(), withholdingStub);
        expect(s.liquid).toBe(7000);
        expect(s.celi).toBe(5000);
        expect(s.reer).toBe(5000);
        expect(s.shortfallMonths).toBe(0);
    });

    it('SHORTFALL > liquide : pige le liquide jusqu\'au seuil critique puis VEND du CELI', () => {
        // Faits non contestables : le liquide descend au seuil critique, le CELI est vendu pour
        // couvrir le reste, et le mois est compté comme déficitaire (shortfallMonths++).
        // NB : la conservation EXACTE dans ce chemin (liquide ré-alimenté par la vente sans que
        // la dépense ne soit redéduite) est un point SUSPECT signalé dans docs/BACKLOG.md
        // (finding « cashflowAllocation — décaissement »). On n'épingle donc PAS ici le niveau
        // final de liquide tant que la sémantique de décaissement n'est pas tranchée avec Marc.
        const s = baseState({ liquid: 3000, celi: 20000 });
        processCashflowAllocation(s, baseCtx({ monthlyCashflow: -5000, criticalThreshold: 2000, strategy: 'PRIO_CELI' }), [], fiscalStub(), withholdingStub);
        expect(s.celi).toBe(16000);          // 4000 de CELI vendus pour couvrir le déficit
        expect(s.shortfallMonths).toBe(1);   // mois déficitaire (le liquide ne suffisait pas)
        expect(s.withdrawalCELI).toBe(4000); // retrait CELI tracé
    });

    it('SHORTFALL non couvrable (aucun actif) : incrémente shortfallMonths', () => {
        const s = baseState({ liquid: 2000 });
        processCashflowAllocation(s, baseCtx({ monthlyCashflow: -4000, criticalThreshold: 2000 }), [], fiscalStub(), withholdingStub);
        expect(s.shortfallMonths).toBe(1);
    });
});

describe('processCashflowAllocation — ordre de cotisation & dettes', () => {
    it('AUTO_MARGINAL à taux marginal bas (< 40 %) : cotise le CELI avant le REER', () => {
        const s = baseState({ liquid: 10000, celiRoom: 100000, rrspRoom: 100000 });
        processCashflowAllocation(s, baseCtx({ monthlyCashflow: 4000, strategy: 'AUTO_MARGINAL' }), [], fiscalStub(0.30), withholdingStub);
        expect(s.celi).toBeCloseTo(4000);
        expect(s.reer).toBe(0);
    });

    it('AUTO_MARGINAL à taux marginal élevé (≥ 40 %) : cotise le REER avant le CELI (CF-3)', () => {
        // Régression CF-3 : `marginalRate` est un décimal, donc le seuil doit être 0.40 (et non 40,
        // jamais atteint). À taux marginal élevé, AUTO_MARGINAL doit prioriser le REER.
        const s = baseState({ liquid: 10000, celiRoom: 100000, rrspRoom: 100000 });
        processCashflowAllocation(s, baseCtx({ monthlyCashflow: 4000, strategy: 'AUTO_MARGINAL' }), [], fiscalStub(0.45), withholdingStub);
        expect(s.reer).toBeCloseTo(4000);
        expect(s.celi).toBe(0);
    });

    it('PRIO_REER : cotise le REER avant le CELI', () => {
        const s = baseState({ liquid: 10000, celiRoom: 100000, rrspRoom: 100000 });
        processCashflowAllocation(s, baseCtx({ monthlyCashflow: 4000, strategy: 'PRIO_REER' }), [], fiscalStub(0.30), withholdingStub);
        expect(s.reer).toBeCloseTo(4000);
        expect(s.celi).toBe(0);
    });

    it('contributionOrder=REER_FIRST surcharge l\'enum (REER avant CELI)', () => {
        const s = baseState({ liquid: 10000, celiRoom: 100000, rrspRoom: 100000 });
        processCashflowAllocation(s, baseCtx({ monthlyCashflow: 4000, strategy: 'AUTO_MARGINAL', contributionOrder: 'REER_FIRST' }), [], fiscalStub(0.30), withholdingStub);
        expect(s.reer).toBeCloseTo(4000);
        expect(s.celi).toBe(0);
    });

    it('debtFirst : rembourse même une dette à faible taux (<7%) avant d\'investir', () => {
        const s = baseState({ liquid: 10000, celiRoom: 100000 });
        const debts: Debt[] = [{ name: 'Auto', balance: 2000, interestRate: 5 } as Debt];
        processCashflowAllocation(s, baseCtx({ monthlyCashflow: 5000, debtFirst: true }), debts, fiscalStub(0.30), withholdingStub);
        expect(debts[0].balance).toBe(0);            // dette remboursée
        // conservation : surplus = dette remboursée + investissements
        expect(2000 + s.celi).toBeCloseTo(5000);
    });

    it('défaut (sans debtFirst) : NE rembourse PAS une dette à faible taux', () => {
        const s = baseState({ liquid: 10000, celiRoom: 100000 });
        const debts: Debt[] = [{ name: 'Auto', balance: 2000, interestRate: 5 } as Debt];
        processCashflowAllocation(s, baseCtx({ monthlyCashflow: 5000, debtFirst: false }), debts, fiscalStub(0.30), withholdingStub);
        expect(debts[0].balance).toBe(2000);         // dette intacte
        expect(s.celi).toBeCloseTo(5000);            // tout investi
    });
});
