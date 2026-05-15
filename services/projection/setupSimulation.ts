// services/projection/setupSimulation.ts
// Cycle 22: extraction de 5 sous-helpers Pure Function du setup runScenario.
// Approche ciblée: au lieu d'un setupSimulation monolithique qui retourne 100+
// champs (verbose et fragile), on extrait 5 calculs purs réutilisables et
// directement testables.
//
// Le caller (runScenario dans projection.ts) garde l'init des let mutables
// (compteurs, snapshots) en local et consomme ces helpers pour les constantes
// dérivées.

import { mulberry32 } from './helpers';
import { calculateCeliRoom, RRSP_ANNUAL_LIMITS } from '../../utils/tax';
import type { FutureScenarioType } from '../projection';

/**
 * Construit un RNG mulberry32 seedé déterministiquement à partir des
 * dimensions de la simulation (scenario + strategy + iteration).
 * Pas de dépendance au capital initial — permet de comparer 100k$ vs 100.001$
 * sur des trajectoires identiques.
 */
export function buildSeededRng(
    scenarioType: string,
    strategy: string,
    mcIterationIndex: number,
): () => number {
    const baseSeedStr = `${scenarioType}-${strategy}-${mcIterationIndex}`;
    let baseSeedNum = 0;
    for (let i = 0; i < baseSeedStr.length; i++) {
        baseSeedNum = (baseSeedNum << 5) - baseSeedNum + baseSeedStr.charCodeAt(i);
        baseSeedNum |= 0;
    }
    return mulberry32(Math.abs(baseSeedNum) || 42);
}

export interface ContributionRoomResult {
    totalHistoricalCeliRoom: number;
    totalHistoricalRrspRoom: number;
    activeUsersCount: number;
}

/**
 * V38: Calcul historique des droits CELI/REER selon résidence et âge.
 * Pour chaque user actif, accumule l'espace CELI depuis 18 ans/arrivée
 * et l'espace REER depuis l'arrivée (18% du salaire passé - FE).
 */
export function computeHistoricalContributionRoom(
    users: Array<{ birthYear?: number; age?: number; canadaArrivalYear?: number; facteurEquivalence?: number } | undefined>,
    baseGrossAnnual: number,
    startYear: number,
): ContributionRoomResult {
    let totalHistoricalCeliRoom = 0;
    let totalHistoricalRrspRoom = 0;
    let activeUsersCount = 0;

    const activeUsers = users.filter(u => u);
    activeUsers.forEach(u => {
        activeUsersCount++;
        const birthYear = u!.birthYear || (startYear - (u!.age || 30));
        const arrivalYear = u!.canadaArrivalYear || (startYear - 5);
        totalHistoricalCeliRoom += calculateCeliRoom(birthYear, arrivalYear, startYear);
        const yearsInCanadaBeforeStart = Math.max(0, startYear - arrivalYear);
        if (yearsInCanadaBeforeStart > 0) {
            const individualSalaryPortion = baseGrossAnnual / (activeUsers.length || 1);
            const totalFE = users.reduce((acc, user) => acc + (user?.facteurEquivalence || 0), 0);
            for (let y = 1; y <= yearsInCanadaBeforeStart; y++) {
                const histYear = startYear - y;
                const pastSalary = individualSalaryPortion / Math.pow(1.02, y);
                const annualCap = RRSP_ANNUAL_LIMITS[histYear] || 32490;
                totalHistoricalRrspRoom += Math.max(0, Math.min(pastSalary * 0.18, annualCap) - (totalFE / (activeUsers.length || 1)));
            }
        }
    });

    if (activeUsersCount === 0) activeUsersCount = 1;
    return { totalHistoricalCeliRoom, totalHistoricalRrspRoom, activeUsersCount };
}

export interface RrqAdjustmentResult {
    effectivePensionStartAge: number;
    rrqAdjustmentFactor: number;
    rrqBasePension: number;
    psvBasePension: number;
}

/**
 * Facteur d'ajustement RRQ selon l'âge de prise des pensions:
 * - Anticipation (60-65): -0.6%/mois (max -36% à 60)
 * - Report (65-70): +0.7%/mois (max +42% à 70)
 * RRQ = 65% du governmentPension; PSV = 35%.
 *
 * Note: effectivePensionStartAge est l'âge de déblocage des pensions
 * gouvernementales (65 par défaut, 70 si delayPensions). Distinct de
 * effectiveRetirementAge (âge où la personne arrête de travailler).
 */
export function computeRrqAdjustment(
    delayPensions: boolean,
    retirementGoal: { governmentPension: number },
): RrqAdjustmentResult {
    const effectivePensionStartAge = delayPensions ? 70 : 65;
    const rrqMonthsFromRef = (effectivePensionStartAge - 65) * 12;

    let rrqAdjustmentFactor = 1.0;
    if (rrqMonthsFromRef < 0) {
        rrqAdjustmentFactor = 1 + Math.max(rrqMonthsFromRef, -60) * 0.006;
    } else if (rrqMonthsFromRef > 0) {
        rrqAdjustmentFactor = 1 + Math.min(rrqMonthsFromRef, 60) * 0.007;
    }

    return {
        effectivePensionStartAge,
        rrqAdjustmentFactor,
        rrqBasePension: retirementGoal.governmentPension * 0.65 * rrqAdjustmentFactor,
        psvBasePension: retirementGoal.governmentPension * 0.35,
    };
}

export interface IncomeBaselineResult {
    incomeMarcNetMonthly: number;
    incomeAnnaNetMonthly: number;
    grossMarcBaseAnnual: number;
    grossAnnaBaseAnnual: number;
}

/**
 * Calcule les revenus de base (net mensuel + brut annuel) pour les 2 users.
 * Mode useTheoretical: split 55/45 du theoreticalIncome.
 * Mode réel: lit netSalary/grossSalary depuis config.users.
 * Brut estimé à net*1.35 si grossSalary manquant (proxy taux marginal moyen).
 */
export function computeIncomeBaseline(
    projection: { useTheoretical?: boolean; theoreticalIncome?: number },
    users: Array<{ netSalary?: number; grossSalary?: number } | undefined>,
): IncomeBaselineResult {
    const useTheo = projection.useTheoretical;
    const theoIncome = projection.theoreticalIncome || 8000;

    const incomeMarcNetMonthly = useTheo ? (theoIncome * 0.55) : (users[0]?.netSalary || 0);
    const incomeAnnaNetMonthly = useTheo ? (theoIncome * 0.45) : (users[1]?.netSalary || 0);
    const grossMarcBaseAnnual = useTheo
        ? (incomeMarcNetMonthly * 12 * 1.35)
        : (users[0]?.grossSalary || (incomeMarcNetMonthly * 12 * 1.35));
    const grossAnnaBaseAnnual = useTheo
        ? (incomeAnnaNetMonthly * 12 * 1.35)
        : (users[1]?.grossSalary || (incomeAnnaNetMonthly * 12 * 1.35));

    return { incomeMarcNetMonthly, incomeAnnaNetMonthly, grossMarcBaseAnnual, grossAnnaBaseAnnual };
}

export interface ScenarioOverrideResult {
    simInflation: number;
    baseRates: { celi: number; reer: number; nonReg: number; crypto: number; cash: number };
}

/**
 * V90: Override des paramètres macro selon le scenario alternatif.
 * - HYPER_INFLATION: simInflation = 5.5% (vs ~2% par défaut)
 * - ECONOMIC_WINTER: rendements compressés à inflation+1%
 * - LIBERTE_55: pas d'override macro (juste retirement age, géré ailleurs)
 */
export function computeScenarioOverrides(
    projection: { inflationRate?: number; rates?: { celi: number; reer: number; nonReg: number; crypto: number; cash: number } } & Record<string, any>,
    scenarioType: FutureScenarioType,
): ScenarioOverrideResult {
    let simInflation = projection.inflationRate || 2.0;
    if (scenarioType === 'HYPER_INFLATION') simInflation = 5.5;

    const baseRates = (scenarioType === 'ECONOMIC_WINTER')
        ? { celi: 3.0, reer: 3.0, nonReg: 2.0, crypto: 5.0, cash: 1.0 }
        : (projection.rates || { celi: 7, reer: 6.5, nonReg: 6.5, crypto: 10, cash: 3 });

    return { simInflation, baseRates };
}

/**
 * D2.5: Smile Curve — facteur de style de vie par âge en retraite.
 * Référence: étude CIBC "Spending in Retirement".
 *  - Avant 75: 1.15 (Go-go years — voyages, loisirs)
 *  - 75-85: 1.00 (Slow-go)
 *  - 85+: 0.90 (No-go — coûts santé déjà gérés ailleurs)
 * Retourne 1.0 si useSmileCurve désactivé.
 */
export function makeSmileLifestyleFactor(useSmileCurve: boolean | undefined): (ageAtMonth: number) => number {
    return (ageAtMonth: number): number => {
        if (!useSmileCurve) return 1;
        if (ageAtMonth < 75) return 1.15;
        if (ageAtMonth < 85) return 1.00;
        return 0.90;
    };
}
