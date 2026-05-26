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
import type { AllocationStrategy } from './types';
import type { ContributionOrder } from './strategyConfig';
import { PBMA_THRESHOLD_PER_USER, OAS_CLAWBACK_THRESHOLD_2026, type FiscalReport } from '../../utils/tax';

// Plafond du palier 1 (14% fédéral + 14% Québec) par utilisateur. Combinaison
// marginale ≈ 28%, comparable à la retenue REER de 21% — donc encore avantageux
// de puiser dans le REER plutôt que dans le CELI quand on est sous ce seuil.
// Source: utils/tax.ts QC_BRACKETS[0].upTo + FED_BRACKETS[0].upTo (le plus restrictif des deux).
const SAFE_REER_BRACKET_TOP_PER_USER = 54345;

type FiscalReportFn = (
    grossIncome: number,
    rrspContrib: number,
    fhsaContrib: number,
    year: number,
    skipBreakdown: boolean,
) => FiscalReport;

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
    contribCELIAPP: number;
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
    // G21 C5 — leviers découplés de l'enum AllocationStrategy. Absents ⇒ on retombe
    // sur le comportement historique dérivé de `strategy` (aucune régression).
    /** Ordre de cotisation en accumulation, indépendant de l'ordre de retrait. */
    contributionOrder?: ContributionOrder;
    /** Rembourser toutes les dettes avant d'investir (vs seulement toxiques >7%). */
    debtFirst?: boolean;
}

import { handleNonRegSale } from './portfolioOps';

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
        contributionOrder, debtFirst,
    } = ctx;

    // G21 C5 — résolution des leviers : override explicite sinon dérivé de l'enum
    // (comportement historique). `debtFirstActive` remplace les tests directs sur
    // strategy === 'DEBT_FIRST' ; `reerFirstContrib` remplace la dérivation de
    // l'ordre de cotisation depuis l'ordre de retrait.
    const debtFirstActive = debtFirst ?? (strategy === 'DEBT_FIRST');

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

            let runningGross = currentAnnualGrossTotal;
            const pbmaThreshold = PBMA_THRESHOLD_PER_USER * activeUsersCount;
            const bracket1Top = SAFE_REER_BRACKET_TOP_PER_USER * activeUsersCount;
            // OAS clawback ne s'applique qu'aux 65+. On le proxy par isRetired puisque
            // l'âge n'est pas dans le contexte; les retraités < 65 ne reçoivent pas PSV
            // donc le cap est sans effet pour eux (revenus typiquement < 93k).
            const oasCap = isRetired ? OAS_CLAWBACK_THRESHOLD_2026 * activeUsersCount : Infinity;

            // Helper local: cap-aware REER draw. Mute state, retourne brut tiré.
            const drawReer = (capRoomGross: number, label: string): number => {
                if (shortfall <= 0 || state.reer <= 0 || capRoomGross <= 0) return 0;
                const { gross: grossAttempt } = calculateGrossWithholdingRRSP(shortfall);
                const actualGross = Math.min(state.reer, grossAttempt, capRoomGross);
                if (actualGross <= 0) return 0;
                const actualWithholding = rrspWithholding(actualGross);
                const actualNet = Math.min(actualGross - actualWithholding, shortfall);

                state.reer -= actualGross;
                state.liquid += actualNet;
                state.accRetraitsReerYear += actualGross;
                state.retraitReerMois += actualGross;
                state.withdrawalREER += actualGross;
                state.taxCurrentYearReer += actualWithholding;
                runningGross += actualGross;
                shortfall -= actualNet;
                state.flowEventLogs.push(`🏦 ↳ Retrait REER (${label}) : +${Math.round(actualGross).toLocaleString('fr-CA')} $ brut → +${Math.round(actualNet).toLocaleString('fr-CA')} $ net après impôt`);
                return actualGross;
            };

            // Logique #1 — PBMA: REER au taux 0% marginal (palier 0).
            // Toutes stratégies en profitent (ne pas laisser de la place gaspillée).
            const pbmaRoom = Math.min(
                Math.max(0, pbmaThreshold - runningGross),
                Math.max(0, oasCap - runningGross),
            );
            drawReer(pbmaRoom, 'Palier 0%');

            // Logique #1b — Bracket-1 fill (AUTO_MARGINAL uniquement, optim 2026).
            // Sous le palier 1 (~54k/usager), marginal combiné fed+QC ≈ 28%, déjà
            // proche de la retenue à la source REER. Préférer REER ici évite de
            // gaspiller du CELI dont le rendement futur est non-imposable.
            if (strategy === 'AUTO_MARGINAL') {
                const bracket1Room = Math.min(
                    Math.max(0, bracket1Top - runningGross),
                    Math.max(0, oasCap - runningGross),
                );
                drawReer(bracket1Room, 'Palier 14%');
            }

            let buckets: string[];
            if (strategy === 'PRIO_REER') buckets = ['REER', 'CELI', 'NONREG', 'CRYPTO'];
            else if (strategy === 'PRIO_CELI' || strategy === 'PRIO_CELI_NO_RAP') buckets = ['CELI', 'NONREG', 'REER', 'CRYPTO'];
            else buckets = ['CELI', 'REER', 'NONREG', 'CRYPTO'];

            // Optim 2026: banque de pertes en capital — si on a des pertes accumulées
            // significatives, on préfère vendre du NonReg avant le REER pour les
            // utiliser (le gain compensé devient effectivement non-imposable).
            if (state.capitalLossBank > 1000 && state.nonReg > 0) {
                const reerIdx = buckets.indexOf('REER');
                const nonRegIdx = buckets.indexOf('NONREG');
                if (reerIdx !== -1 && nonRegIdx !== -1 && nonRegIdx > reerIdx) {
                    buckets[reerIdx] = 'NONREG';
                    buckets[nonRegIdx] = 'REER';
                }
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
                    state.flowEventLogs.push(`🏦 ↳ Retrait CELI (sans impôt) : +${Math.round(drawn).toLocaleString('fr-CA')} $`);
                } else if (bucket === 'NONREG' && state.nonReg > 0) {
                    const drawnNonReg = handleNonRegSale(state, shortfall);
                    state.liquid += drawnNonReg;
                    state.withdrawalNonReg += drawnNonReg;
                    shortfall -= drawnNonReg;
                    state.flowEventLogs.push(`🏦 ↳ Retrait du compte non-enregistré : +${Math.round(drawnNonReg).toLocaleString('fr-CA')} $`);
                } else if (bucket === 'REER' && state.reer > 0) {
                    // OAS guard appliqué ici aussi: on respecte le plafond clawback.
                    const reerCap = Math.max(0, oasCap - runningGross);
                    drawReer(reerCap, 'Standard');
                } else if (bucket === 'CRYPTO' && state.crypto > 0) {
                    const drawn = Math.min(state.crypto, shortfall);
                    state.crypto -= drawn;
                    state.liquid += drawn;
                    shortfall -= drawn;
                    state.withdrawalCrypto += drawn;
                    state.accCapitalGainsYear += drawn;
                    state.flowEventLogs.push(`🚨 Vente de crypto (dernier recours) : +${Math.round(drawn).toLocaleString('fr-CA')} $`);
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
                .filter(d => d.balance > 0 && (d.interestRate > 7 || debtFirstActive))
                .sort((a, b) => b.interestRate - a.interestRate);
            for (const d of sortedDebts) {
                const pay = Math.min(excess, d.balance);
                if (pay > 0) {
                    d.balance -= pay;
                    excess -= pay;
                    const label = d.interestRate > 7 ? 'dette à taux élevé' : 'remboursement accéléré';
                    state.flowEventLogs.push(`💸 Remboursement ${d.name} (${label}) : -${Math.round(pay).toLocaleString('fr-CA')} $`);
                }
            }
        }

        const hasRemainingDebtPostPay = activeDebts.some(d => d.balance > 0);

        // FHSA (sauf si DEBT_FIRST avec dettes restantes)
        if (excess > 0 && state.fhsaRoom > 0 && !isRetired && hasFuturePurchase && !hasPurchasedPrimary
            && (!debtFirstActive || !hasRemainingDebtPostPay)) {
            const fillFhsa = Math.min(state.fhsaRoom, excess);
            state.celiapp += fillFhsa;
            state.fhsaRoom -= fillFhsa;
            state.fhsaLifetimeContrib += fillFhsa;
            state.accFhsaYear += fillFhsa;
            state.contribCELIAPP += fillFhsa;
            excess -= fillFhsa;
        }

        if (!isRetired) {
            const yearsElapsedForMarg = Math.floor(m / 12);
            const estAnnualGross = (grossMarcBaseAnnual + grossAnnaBaseAnnual) * Math.pow(1 + simSalaryGrowth / 100, yearsElapsedForMarg);
            const marginal = calculateFiscalReport(estAnnualGross / activeUsersCount, 0, 0, loopYear, enableMonteCarlo).marginalRate;

            // Ordre de cotisation : override explicite sinon dérivé de l'enum (REER
            // d'abord si PRIO_REER, ou si AUTO_MARGINAL à taux marginal élevé).
            const reerFirstContrib = contributionOrder
                ? contributionOrder === 'REER_FIRST'
                : (strategy === 'PRIO_REER' || (strategy === 'AUTO_MARGINAL' && marginal >= 40));

            if (debtFirstActive && hasRemainingDebtPostPay) {
                // Skip investments — excess will flow to liquid below
            } else if (reerFirstContrib) {
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
                state.flowEventLogs.push(`💰 ↳ Surplus placé dans le CELI : +${Math.round(fill).toLocaleString('fr-CA')} $`);
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
