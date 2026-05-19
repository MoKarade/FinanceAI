// services/projection/realEstateMonth.ts
// Cycle 20: extraction du bloc immobilier mensuel (~187 lignes).
// Inclut: achat (RAP/CELI/NonReg/REER cascade), amortissement avec
// renouvellement 5 ans, croissance valeur, Smith Manoeuvre + LTV margin call,
// revenus locatifs, RAP repayment, ajustement loyer post-achat.
//
// Pattern: State Object — toutes les variables mutables dans RealEstateState.
// propertiesState est mutée en place (objets référencés).

import type { RealEstateGoal } from '../../types';
import { RAP_LIMIT_PER_USER } from '../../utils/tax';
import { calculateB20StressTest, validateMortgageParameters, calculateSchlPremium } from '../realEstate';

type GetMarginalRateFn = (annualGross: number) => number;
type GetMonthOffsetFn = (dateStr: string) => number;
type WelcomeTaxFn = (price: number) => number;

export interface PropertyStateMutable {
    id: string;
    isBought: boolean;
    mortgage: number;
    currentValue: number;
    calculatedPmt: number;
    isSold?: boolean;
    isPaidOff?: boolean;
}

export interface RealEstateState {
    liquid: number;
    celi: number;
    celiapp: number;
    reer: number;
    nonReg: number;
    nonRegACB: number;
    capitalLossBank: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    accRentesYear: number;
    accCapitalGainsYear: number;
    realEstateEquity: number;
    mortgageBalance: number;
    hasPurchasedPrimary: boolean;
    hasUsedRap: boolean;
    rapBorrowed: number;
    rapRepaymentDueTotal: number;
    rapRepaymentStartOffset: number;
    smithManoeuvreDebt: number;
    smithInterestDeductibleYear: number;
    fhsaClosingYear: number | null;
    taxCurrentYearReer: number;
    impotReerMois: number;
    withdrawalLiquid: number;
    withdrawalCELI: number;
    withdrawalNonReg: number;
    withdrawalREER: number;
    contribLiquid: number;
    celiWithdrawalsThisYear: number;
    retraitCeliMois: number;
    immoInterest: number;
    immoPrincipal: number;
    immoHypo: number;
    immoCharges: number;
    totalRentalIncome: number;
    lifeEventLogs: string[];
    flowEventLogs: string[];
}

export interface RealEstateCtx {
    m: number;
    loopYear: number;
    isRetired: boolean;
    activeUsersCount: number;
    simInflation: number;
    simSalaryGrowth: number;
    grossMarcBaseAnnual: number;
    grossAnnaBaseAnnual: number;
    incomeRetirement: number;
    useSmithManoeuvre: boolean;
    currentRentExpense: number;
}

import { handleNonRegSale } from './portfolioOps';

/**
 * Traite tout l'immobilier pour le mois courant.
 * Mute state en place. propertiesState[] est mutée par référence.
 */
export function processRealEstate(
    state: RealEstateState,
    ctx: RealEstateCtx,
    activeRE: RealEstateGoal[],
    propertiesState: PropertyStateMutable[],
    getMonthOffset: GetMonthOffsetFn,
    welcomeTax: WelcomeTaxFn,
    getMarginalRate: GetMarginalRateFn,
): void {
    const {
        m, loopYear, isRetired, activeUsersCount, simInflation, simSalaryGrowth,
        grossMarcBaseAnnual, grossAnnaBaseAnnual, incomeRetirement,
        useSmithManoeuvre, currentRentExpense,
    } = ctx;

    let totalImmoHypo = 0;
    let totalImmoEquity = 0;
    let totalImmoDebt = 0;

    activeRE.forEach((goal, i) => {
        const pState = propertiesState[i];
        if (!pState) return;

        const purchaseOffset = getMonthOffset(goal.purchaseDate);
        if (!goal.isActive || m < purchaseOffset) return;

        // ── ACHAT ──────────────────────────────────────────────────────
        if (!pState.isBought) {
            // §6.8 — Validation SCHL : mise de fonds min + amortissement max.
            // Informatif uniquement (n'empêche pas l'achat) — l'utilisateur peut
            // tout de même choisir de simuler un scénario non conforme.
            if (m === purchaseOffset) {
                const validation = validateMortgageParameters({
                    price: goal.price,
                    downPayment: goal.downPayment,
                    amortization: goal.amortization,
                    isFirstTimeBuyer: goal.isFirstTimeBuyer ?? false,
                    isNewConstruction: goal.isNewConstruction ?? false,
                });
                if (!validation.valid) {
                    validation.errors.forEach(err => {
                        state.lifeEventLogs.push(`⚠️ SCHL §6.8 (${goal.id}): ${err}`);
                    });
                }
            }

            const welcomeFees = welcomeTax(goal.price);
            const totalCashNeeded = goal.downPayment + goal.totalClosingCosts + welcomeFees;

            if (state.celiapp > 0) {
                state.liquid += state.celiapp;
                state.flowEventLogs.push(`Vente CELIAPP (${goal.id}): +${state.celiapp.toFixed(0)}$`);
                state.celiapp = 0;
                state.fhsaClosingYear = loopYear;
            }

            if (state.liquid < totalCashNeeded && state.reer > 0) {
                let remainingShortfall = totalCashNeeded - state.liquid;

                // Phase 1: RAP (si résidence principale et éligible)
                if (goal.isPrimaryResidence && (!state.hasUsedRap || state.rapRepaymentDueTotal === 0)) {
                    const rapLimit = RAP_LIMIT_PER_USER * activeUsersCount;
                    const rapAvailable = Math.max(0, rapLimit - state.rapBorrowed);
                    if (rapAvailable > 0) {
                        const rapAmount = Math.min(state.reer, rapAvailable, remainingShortfall);
                        if (rapAmount > 0) {
                            state.reer -= rapAmount;
                            state.liquid += rapAmount;
                            state.rapBorrowed += rapAmount;
                            state.rapRepaymentDueTotal += rapAmount;
                            state.hasUsedRap = true;
                            const graceYears = (loopYear >= 2022 && loopYear <= 2025) ? 5 : 2;
                            state.rapRepaymentStartOffset = m + (graceYears * 12);
                            state.withdrawalREER += rapAmount;
                            state.contribLiquid += rapAmount;
                            remainingShortfall -= rapAmount;
                            state.flowEventLogs.push(`↳ Retrait RAP (Non-imposable): +${Math.round(rapAmount).toLocaleString('fr-CA')}$`);
                        }
                    }
                }

                // Phase 2: CELI (sans impôt)
                if (remainingShortfall > 0 && state.celi > 0) {
                    const celiAmount = Math.min(state.celi, remainingShortfall);
                    state.celi -= celiAmount;
                    state.liquid += celiAmount;
                    state.withdrawalCELI += celiAmount;
                    state.celiWithdrawalsThisYear += celiAmount;
                    state.retraitCeliMois += celiAmount;
                    state.contribLiquid += celiAmount;
                    remainingShortfall -= celiAmount;
                    state.flowEventLogs.push(`↳ Retrait CELI (Achat Immo): +${Math.round(celiAmount).toLocaleString('fr-CA')}$`);
                }

                // Phase 3: NonReg
                if (remainingShortfall > 0 && state.nonReg > 0) {
                    const nonRegAmount = handleNonRegSale(state, remainingShortfall);
                    state.liquid += nonRegAmount;
                    state.withdrawalNonReg += nonRegAmount;
                    state.contribLiquid += nonRegAmount;
                    remainingShortfall -= nonRegAmount;
                    state.flowEventLogs.push(`↳ Retrait Non-Enreg (Achat Immo): +${Math.round(nonRegAmount).toLocaleString('fr-CA')}$`);
                }

                // Phase 4: REER imposable (dernier recours)
                if (remainingShortfall > 0 && state.reer > 0) {
                    const currentAnnualGross = (isRetired
                        ? incomeRetirement * 12
                        : (grossMarcBaseAnnual + grossAnnaBaseAnnual) * Math.pow(1 + simSalaryGrowth / 100, Math.floor(m / 12))
                    ) / activeUsersCount;
                    const margRate = getMarginalRate(currentAnnualGross);
                    const grossNeeded = remainingShortfall / Math.max(0.1, (1 - margRate));
                    const drawn = Math.min(state.reer, grossNeeded);
                    const tax = drawn * margRate;
                    state.reer -= drawn;
                    state.liquid += drawn;
                    state.withdrawalREER += drawn;
                    state.contribLiquid += drawn;
                    state.taxCurrentYearReer += tax;
                    state.impotReerMois += tax;
                    state.flowEventLogs.push(`🚨 Retrait REER Imposable (Achat Immo @${(margRate * 100).toFixed(0)}%): -${Math.round(drawn).toLocaleString('fr-CA')}$`);
                }
            }

            if (state.liquid >= totalCashNeeded) {
                state.liquid -= totalCashNeeded;
                state.withdrawalLiquid += totalCashNeeded;
                pState.isBought = true;

                // §6.5 — Prime SCHL si MDP < 20% (LTV > 80%). Ajoutée au principal
                // du prêt avant calcul du PMT.
                const schl = calculateSchlPremium({
                    price: goal.price,
                    downPayment: goal.downPayment,
                });
                if (schl.required) {
                    pState.mortgage += schl.premium;
                    state.lifeEventLogs.push(
                        `🏦 Prime SCHL §6.5 (${goal.id}): +${Math.round(schl.premium).toLocaleString('fr-CA')}$ ` +
                        `(${(schl.rate * 100).toFixed(2)}% sur LTV ${(schl.ltv * 100).toFixed(1)}%)`,
                    );
                }

                const r = (goal.mortgageRate / 100) / 12;
                const n = goal.amortization * 12;
                const p = pState.mortgage;
                pState.calculatedPmt = r > 0 ? p * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1) : p / n;
                state.lifeEventLogs.push(`🏠 Achat (${goal.id}): -${Math.round(totalCashNeeded).toLocaleString('fr-CA')}$`);
                state.flowEventLogs.push(`MBP: -${goal.downPayment.toLocaleString('fr-CA')}$ | Frais+TBienv.: -${Math.round(goal.totalClosingCosts + welcomeFees).toLocaleString('fr-CA')}$`);
                if (goal.isPrimaryResidence) state.hasPurchasedPrimary = true;

                // §6.6 — Stress test OSFI B-20 (qualifying rate + GDS/TDS).
                // Informatif uniquement : on logue un warning si l'achat ne passerait
                // pas une qualification réelle. L'achat est tout de même autorisé
                // dans la simulation (la décision finale appartient à l'utilisateur).
                //
                // Limitations connues (à améliorer dans futures PRs) :
                //  - `otherDebtMonthly = 0` : on n'a pas accès aux dettes (ctx.debts).
                //    Sous-estime TDS — un user avec dette auto/cartes pourrait échouer
                //    en réalité alors qu'on logue "passes" ici.
                //  - Composition mensuelle simple (`rate / 12`) vs semi-annuelle
                //    canadienne légale : biais conservateur léger (~0.05% sur PMT),
                //    cohérent avec le reste du moteur.
                if (Number.isFinite(goal.mortgageRate) && goal.mortgageRate > 0) {
                    const monthlyGross = ctx.isRetired
                        ? ctx.incomeRetirement
                        : ((ctx.grossMarcBaseAnnual + ctx.grossAnnaBaseAnnual)
                            * Math.pow(1 + ctx.simSalaryGrowth / 100, Math.floor(ctx.m / 12))) / 12;
                    // §6.6 MEDIUM-6 — indexer les charges logement par inflation pour
                    // cohérence avec le revenu nominal (sinon GDS s'améliore artificiellement
                    // sur achats futurs).
                    const inflFactor = Math.pow(1 + ctx.simInflation / 100, Math.floor(ctx.m / 12));
                    const monthlyHousingExcl = (
                        ((goal.taxesYearly || 0) / 12)
                        + (goal.heatingMonthly || 0)
                        + ((goal.condoFees || 0) * 0.5)
                    ) * inflFactor;
                    const stress = calculateB20StressTest({
                        contractRate: goal.mortgageRate,
                        loanAmount: pState.mortgage,
                        amortization: goal.amortization,
                        monthlyHousingChargesExclMortgage: monthlyHousingExcl,
                        monthlyGrossIncome: monthlyGross,
                        otherDebtMonthly: 0,
                    });
                    if (!stress.passes) {
                        state.lifeEventLogs.push(
                            `⚠️ Stress test B-20 OSFI (${goal.id}): ${stress.failReason} ` +
                            `(qualifying rate ${(stress.qualifyingRate * 100).toFixed(2)}%)`,
                        );
                    }
                } else {
                    state.flowEventLogs.push(
                        `ℹ️ Stress test B-20 ignoré pour ${goal.id} : taux contractuel invalide`,
                    );
                }
            } else if (m === purchaseOffset) {
                state.flowEventLogs.push(`⚠️ Achat (${goal.id}) reporté: liquidités insuffisantes`);
            }
        }

        // ── PROPRIÉTÉ DÉTENUE ──────────────────────────────────────────
        if (pState.isBought && !pState.isSold) {
            const monthsSincePurchase = m - purchaseOffset;
            // Renouvellement 5 ans
            if (monthsSincePurchase > 0 && monthsSincePurchase % 60 === 0) {
                const remainingMonths = goal.amortization * 12 - monthsSincePurchase;
                if (remainingMonths > 60 && pState.mortgage > 0) {
                    const rateShock = ((pState.id.charCodeAt(0) % 3) - 1) * 0.015;
                    const newRate = Math.max(0.01, goal.mortgageRate / 100 + rateShock);
                    const nr = newRate / 12;
                    pState.calculatedPmt = pState.mortgage * nr * Math.pow(1 + nr, remainingMonths) / (Math.pow(1 + nr, remainingMonths) - 1);
                    state.lifeEventLogs.push(`🏦 Renouvellement ${goal.id}: ${(newRate * 100).toFixed(2)}%`);
                }
            }
            pState.currentValue *= Math.pow(1 + (goal.propertyGrowthRate || 3) / 100, 1 / 12);
            if (goal.maxValue && pState.currentValue > goal.maxValue) pState.currentValue = goal.maxValue;

            const monthlyRate = (goal.mortgageRate / 100) / 12;
            const interestPaid = pState.mortgage * monthlyRate;
            const principalPaid = Math.max(0, pState.calculatedPmt - interestPaid);
            const prevMortgage = pState.mortgage;
            pState.mortgage = Math.max(0, pState.mortgage - principalPaid);
            if (prevMortgage > 0 && pState.mortgage <= 0 && !pState.isPaidOff) {
                pState.isPaidOff = true;
                pState.calculatedPmt = 0;
                state.lifeEventLogs.push(`🏠 Propriété payée à 100 % ! (${goal.id})`);
            }
            totalImmoHypo += pState.calculatedPmt;
            totalImmoEquity += pState.currentValue - pState.mortgage;
            totalImmoDebt += pState.mortgage;
            state.immoInterest += interestPaid;
            state.immoPrincipal += principalPaid;

            // Smith Manoeuvre (intérêts capitalisés)
            if (useSmithManoeuvre && goal.isPrimaryResidence && principalPaid > 0) {
                state.smithManoeuvreDebt += principalPaid;
                state.nonReg += principalPaid;
                state.nonRegACB += principalPaid;
                const smithInterest = state.smithManoeuvreDebt * (0.05 / 12);
                state.smithManoeuvreDebt += smithInterest;
                state.smithInterestDeductibleYear += smithInterest;
            }

            // LTV margin call (Smith Manoeuvre)
            if (state.smithManoeuvreDebt + pState.mortgage > pState.currentValue * 0.65) {
                const surplusMarginCall = (state.smithManoeuvreDebt + pState.mortgage) - (pState.currentValue * 0.65);
                if (surplusMarginCall > 0 && state.nonReg > 0) {
                    const call = handleNonRegSale(state, surplusMarginCall);
                    state.smithManoeuvreDebt -= call;
                    state.flowEventLogs.push(`🚨 Appell de marge (HELOC): Vente ${Math.round(call).toLocaleString('fr-CA')}$ NonReg`);
                }
            }

            // Revenus locatifs
            if (!goal.isPrimaryResidence && goal.rentalIncomeMonthly) {
                const rentalIncome = goal.rentalIncomeMonthly * Math.pow(1 + simInflation / 100, m / 12);
                state.monthlyIncome += rentalIncome;
                state.accRentesYear += rentalIncome;
                state.totalRentalIncome += rentalIncome;
            }

            const monthlyCharges = goal.unrecoverableMonthly || 0;
            state.monthlyExpenses += pState.calculatedPmt + monthlyCharges;
            state.immoHypo += pState.calculatedPmt;
            state.immoCharges += monthlyCharges;
        }
    });

    // Si résidence principale achetée, ne plus payer le loyer
    if (state.hasPurchasedPrimary) {
        state.monthlyExpenses -= currentRentExpense * Math.pow(1 + simInflation / 100, m / 12);
    }

    // RAP repayment
    if (state.hasUsedRap && state.rapRepaymentDueTotal > 0 && m >= state.rapRepaymentStartOffset) {
        const monthlyRepayment = (state.rapBorrowed / 15) / 12;
        const amnt = Math.min(state.rapRepaymentDueTotal, monthlyRepayment);
        if (state.liquid >= amnt) {
            state.liquid -= amnt;
            state.reer += amnt;
            state.rapRepaymentDueTotal -= amnt;
        }
    }

    state.realEstateEquity = totalImmoEquity;
    state.mortgageBalance = totalImmoDebt;
    state.immoHypo = totalImmoHypo;
}
