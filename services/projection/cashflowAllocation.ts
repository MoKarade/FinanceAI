// services/projection/cashflowAllocation.ts
// Cycle 19: extraction du bloc shortfall + excess allocation (~180 lignes).
//
// Pattern: State Object — toutes les variables mutables sont regroupées dans
// CashflowState et passées par référence. Le caller copie ses locales dans
// l'objet, appelle la fonction, puis destructure les nouvelles valeurs.
//
// handleNonRegSale est ré-implémenté en interne (depend de nonReg/nonRegACB/
// capitalLossBank/accCapitalGainsYear, tous dans state).

import type { Debt } from '../../types';
import type { AllocationStrategy } from '../projection';

type FiscalReportFn = (
    grossIncome: number,
    rrspContrib: number,
    fhsaContrib: number,
    year: number,
    skipBreakdown: boolean,
) => { marginalRate: number };

type GrossWithholdingFn = (netDesired: number) => { gross: number };

export interface CashflowState {
    liquid: number;
    celi: number;
    reer: number;
    celiapp: number;
    nonReg: number;
    nonRegACB: number;
    capitalLossBank: number;
    crypto: number;
    celiRoom: number;
    rrspRoom: number;
    fhsaRoom: number;
    taxCurrentYearReer: number;
    accRetraitsReerYear: number;
    accCapitalGainsYear: number;
    accRrspYear: number;
    accFhsaYear: number;
    fhsaLifetimeContrib: number;
    celiWithdrawalsThisYear: number;
    retraitReerMois: number;
    retraitCeliMois: number;
    withdrawalREER: number;
    withdrawalCELI: number;
    withdrawalNonReg: number;
    withdrawalCrypto: number;
    contribCELI: number;
    contribREER: number;
    contribNonReg: number;
    shortfallMonths: number;
    flowEventLogs: string[];
}

export interface CashflowCtx {
    monthlyCashflow: number;
    targetEF: number;
    criticalThreshold: number;
    isRetired: boolean;
    strategy: AllocationStrategy;
    m: number;
    loopYear: number;
    enableMonteCarlo: boolean;
    activeUsersCount: number;
    grossMarcBaseAnnual: number;
    grossAnnaBaseAnnual: number;
    simSalaryGrowth: number;
    incomeRetirement: number;
    accRentesYear: number;
    hasFuturePurchase: boolean;
    hasPurchasedPrimary: boolean;
}

function handleNonRegSale(state: CashflowState, amount: number): number {
    const sold = Math.min(state.nonReg, amount);
    if (sold > 0) {
        const proportion = state.nonRegACB > 0 && state.nonReg > 0
            ? Math.min(1, state.nonRegACB / state.nonReg) : 0;
        const costBasis = sold * proportion;
        state.nonReg -= sold;
        state.nonRegACB = Math.max(0, state.nonRegACB - costBasis);
        const rawGain = sold - costBasis;
        if (rawGain < 0) {
            state.capitalLossBank += Math.abs(rawGain);
        } else {
            const usableLoss = Math.min(rawGain, state.capitalLossBank);
            const taxableGain = rawGain - usableLoss;
            state.capitalLossBank -= usableLoss;
            state.accCapitalGainsYear += taxableGain;
        }
    }
    return sold;
}

function rrspWithholding(grossDraw: number): number {
    if (grossDraw <= 5000) return grossDraw * 0.21;
    if (grossDraw <= 15000) return grossDraw * 0.26;
    return grossDraw * 0.30;
}

/**
 * Traite le cashflow mensuel: shortfall (cascade retraits) ou excess
 * (EF + dettes toxiques + FHSA + REER/CELI selon stratégie + NonReg).
 * Mute state en place.
 */
export function processCashflowAllocation(
    state: CashflowState,
    ctx: CashflowCtx,
    activeDebts: Debt[],
    calculateFiscalReport: FiscalReportFn,
    calculateGrossWithholdingRRSP: GrossWithholdingFn,
): void {
    const {
        monthlyCashflow, targetEF, criticalThreshold, isRetired, strategy,
        m, loopYear, enableMonteCarlo, activeUsersCount,
        grossMarcBaseAnnual, grossAnnaBaseAnnual, simSalaryGrowth,
        incomeRetirement, accRentesYear, hasFuturePurchase, hasPurchasedPrimary,
    } = ctx;

    if (monthlyCashflow < 0) {
        // ── SHORTFALL ──────────────────────────────────────────────────
        let shortfall = -monthlyCashflow;

        // Piger dans les liquidités jusqu'au seuil critique
        if (state.liquid - shortfall >= criticalThreshold) {
            state.liquid -= shortfall;
            shortfall = 0;
        } else {
            const fromLiquid = Math.max(0, state.liquid - criticalThreshold);
            state.liquid -= fromLiquid;
            shortfall -= fromLiquid;
        }

        if (shortfall > 0) state.shortfallMonths++;

        if (shortfall > 0) {
            const currentAnnualGrossTotal = isRetired
                ? ((incomeRetirement * 12) + state.accRetraitsReerYear + accRentesYear)
                : ((grossMarcBaseAnnual + grossAnnaBaseAnnual) * Math.pow(1 + simSalaryGrowth / 100, Math.floor(m / 12)) + state.accRetraitsReerYear);

            const pbmaThreshold = 17183 * activeUsersCount;
            let pbmaRoom = Math.max(0, pbmaThreshold - currentAnnualGrossTotal);

            let buckets: string[];
            if (strategy === 'PRIO_REER') buckets = ['REER', 'CELI', 'NONREG', 'CRYPTO'];
            else if (strategy === 'PRIO_CELI') buckets = ['CELI', 'NONREG', 'REER', 'CRYPTO'];
            else buckets = ['CELI', 'REER', 'NONREG', 'CRYPTO'];

            // Logique #1: REER à 0% marginal (PBMA)
            if (shortfall > 0 && state.reer > 0 && pbmaRoom > 0) {
                const desiredNet = Math.min(shortfall, pbmaRoom);
                const { gross: grossAttempt } = calculateGrossWithholdingRRSP(desiredNet);
                const actualGrossToDraw = Math.min(state.reer, grossAttempt, pbmaRoom);
                const actualWithholding = rrspWithholding(actualGrossToDraw);
                const actualNet = Math.min(actualGrossToDraw - actualWithholding, shortfall);

                state.reer -= actualGrossToDraw;
                state.liquid += actualNet;
                state.accRetraitsReerYear += actualGrossToDraw;
                state.retraitReerMois += actualGrossToDraw;
                state.withdrawalREER += actualGrossToDraw;
                state.taxCurrentYearReer += actualWithholding;
                pbmaRoom -= actualGrossToDraw;
                shortfall -= actualNet;
                state.flowEventLogs.push(`↳ Retrait REER (Palier 0%): +${actualGrossToDraw.toFixed(0)}$ Brut -> +${actualNet.toFixed(0)}$ Net`);
            }

            // Cascade standard
            for (const bucket of buckets) {
                if (shortfall <= 0.1) break;

                if (bucket === 'CELI' && state.celi > 0) {
                    const drawn = Math.min(state.celi, shortfall);
                    state.celi -= drawn;
                    state.liquid += drawn;
                    state.celiWithdrawalsThisYear += drawn;
                    state.retraitCeliMois += drawn;
                    state.withdrawalCELI += drawn;
                    shortfall -= drawn;
                    state.flowEventLogs.push(`↳ Retrait CELI: +${Math.round(drawn).toLocaleString('fr-CA')}$`);
                } else if (bucket === 'NONREG' && state.nonReg > 0) {
                    const drawnNonReg = handleNonRegSale(state, shortfall);
                    state.liquid += drawnNonReg;
                    state.withdrawalNonReg += drawnNonReg;
                    shortfall -= drawnNonReg;
                    state.flowEventLogs.push(`↳ Retrait Non-Enreg: +${Math.round(drawnNonReg).toLocaleString('fr-CA')}$`);
                } else if (bucket === 'REER' && state.reer > 0) {
                    const { gross: grossAttempt } = calculateGrossWithholdingRRSP(shortfall);
                    const actualGrossToDraw = Math.min(state.reer, grossAttempt);
                    const actualWithholding = rrspWithholding(actualGrossToDraw);
                    const actualNet = actualGrossToDraw - actualWithholding;

                    state.reer -= actualGrossToDraw;
                    state.liquid += actualNet;
                    state.accRetraitsReerYear += actualGrossToDraw;
                    state.retraitReerMois += actualGrossToDraw;
                    state.withdrawalREER += actualGrossToDraw;
                    state.taxCurrentYearReer += actualWithholding;
                    shortfall -= actualNet;
                    state.flowEventLogs.push(`↳ Retrait REER (Standard): +${actualGrossToDraw.toFixed(0)}$ Brut -> +${actualNet.toFixed(0)}$ Net`);
                } else if (bucket === 'CRYPTO' && state.crypto > 0) {
                    const drawn = Math.min(state.crypto, shortfall);
                    state.crypto -= drawn;
                    state.liquid += drawn;
                    shortfall -= drawn;
                    state.withdrawalCrypto += drawn;
                    state.accCapitalGainsYear += drawn;
                    state.flowEventLogs.push(`🚨 Liquidation Crypto (Dernier Recours): +${drawn.toFixed(0)}$`);
                }
            }
        }
    } else {
        // ── EXCESS ─────────────────────────────────────────────────────
        let excess = monthlyCashflow;

        if (state.liquid < targetEF) {
            const fillEF = Math.min(excess, targetEF - state.liquid);
            state.liquid += fillEF;
            excess -= fillEF;
        }

        // Cash drag sweep
        if (state.liquid > targetEF) {
            const sweep = state.liquid - targetEF;
            state.liquid -= sweep;
            excess += sweep;
        }

        // Dettes toxiques (>7%) ou toutes si DEBT_FIRST
        if (excess > 0) {
            const sortedDebts = activeDebts
                .filter(d => d.balance > 0 && (d.interestRate > 7 || strategy === 'DEBT_FIRST'))
                .sort((a, b) => b.interestRate - a.interestRate);
            for (const d of sortedDebts) {
                const pay = Math.min(excess, d.balance);
                if (pay > 0) {
                    d.balance -= pay;
                    excess -= pay;
                    const label = d.interestRate > 7 ? 'Dette Toxique' : 'Dette (Strat. Briseur)';
                    state.flowEventLogs.push(`💸 Remboursement ${label} (${d.name}): -${Math.round(pay).toLocaleString('fr-CA')}$`);
                }
            }
        }

        const hasRemainingDebtPostPay = activeDebts.some(d => d.balance > 0);

        // FHSA (sauf si DEBT_FIRST avec dettes restantes)
        if (excess > 0 && state.fhsaRoom > 0 && !isRetired && hasFuturePurchase && !hasPurchasedPrimary
            && (strategy !== 'DEBT_FIRST' || !hasRemainingDebtPostPay)) {
            const fillFhsa = Math.min(state.fhsaRoom, excess);
            state.celiapp += fillFhsa;
            state.fhsaRoom -= fillFhsa;
            state.fhsaLifetimeContrib += fillFhsa;
            state.accFhsaYear += fillFhsa;
            excess -= fillFhsa;
        }

        if (!isRetired) {
            const yearsElapsedForMarg = Math.floor(m / 12);
            const estAnnualGross = (grossMarcBaseAnnual + grossAnnaBaseAnnual) * Math.pow(1 + simSalaryGrowth / 100, yearsElapsedForMarg);
            const marginal = calculateFiscalReport(estAnnualGross / activeUsersCount, 0, 0, loopYear, enableMonteCarlo).marginalRate;

            if (strategy === 'DEBT_FIRST' && hasRemainingDebtPostPay) {
                // Skip investments — excess will flow to liquid below
            } else if (strategy === 'PRIO_REER' || (strategy === 'AUTO_MARGINAL' && marginal >= 40)) {
                if (excess > 0 && state.rrspRoom > 0) {
                    const fill = Math.min(state.rrspRoom, excess);
                    state.reer += fill; state.rrspRoom -= fill; excess -= fill;
                    state.accRrspYear += fill; state.contribREER += fill;
                }
                if (excess > 0 && state.celiRoom > 0) {
                    const fill = Math.min(state.celiRoom, excess);
                    state.celi += fill; state.celiRoom -= fill; excess -= fill;
                    state.contribCELI += fill;
                }
            } else {
                if (excess > 0 && state.celiRoom > 0) {
                    const fill = Math.min(state.celiRoom, excess);
                    state.celi += fill; state.celiRoom -= fill; excess -= fill;
                    state.contribCELI += fill;
                }
                if (excess > 0 && state.rrspRoom > 0) {
                    const fill = Math.min(state.rrspRoom, excess);
                    state.reer += fill; state.rrspRoom -= fill; excess -= fill;
                    state.accRrspYear += fill; state.contribREER += fill;
                }
            }
        } else {
            // RRIF Overflow → CELI prioritaire
            if (excess > 0 && state.celiRoom > 0) {
                const fill = Math.min(state.celiRoom, excess);
                state.celi += fill;
                state.celiRoom -= fill;
                excess -= fill;
                state.contribCELI += fill;
                state.flowEventLogs.push(`↳ Surplus redirigé vers CELI: +${Math.round(fill).toLocaleString('fr-CA')}$`);
            }
        }

        if (excess > 0) {
            state.nonReg += excess;
            state.nonRegACB += excess;
            state.contribNonReg += excess;
        }
        state.liquid = targetEF;
    }
}
