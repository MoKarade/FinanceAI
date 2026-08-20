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
import { calculateCeliRoom, calculateGrossFromNet, getResidencyStartYear, RRSP_ANNUAL_LIMITS, RRSP_ANNUAL_LIMIT_FALLBACK, rrqAdjustmentFactor as computeRrqFactor, GOV_PENSION_RRQ_SHARE, GOV_PENSION_PSV_SHARE, RRSP_ROOM_RATE } from '../../utils/tax';
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
    users: Array<{ birthYear?: number; age?: number; canadaArrivalYear?: number; isImmigrant?: boolean; facteurEquivalence?: number } | undefined>,
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
        const residencyStart = getResidencyStartYear(birthYear, u!.isImmigrant, u!.canadaArrivalYear);
        totalHistoricalCeliRoom += calculateCeliRoom(birthYear, residencyStart, startYear);
        // REER : droit accumulé depuis le plus tard de {18 ans, début de résidence}.
        const reerStartYear = Math.max(birthYear + 18, residencyStart);
        const yearsInCanadaBeforeStart = Math.max(0, startYear - reerStartYear);
        if (yearsInCanadaBeforeStart > 0) {
            const individualSalaryPortion = baseGrossAnnual / (activeUsers.length || 1);
            const totalFE = users.reduce((acc, user) => acc + (user?.facteurEquivalence || 0), 0);
            for (let y = 1; y <= yearsInCanadaBeforeStart; y++) {
                const histYear = startYear - y;
                const pastSalary = individualSalaryPortion / Math.pow(1.02, y);
                const annualCap = RRSP_ANNUAL_LIMITS[histYear] || RRSP_ANNUAL_LIMIT_FALLBACK;
                totalHistoricalRrspRoom += Math.max(0, Math.min(pastSalary * RRSP_ROOM_RATE, annualCap) - (totalFE / (activeUsers.length || 1)));
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
 * - Report (65-72): +0.7%/mois (max +58,8% à 72 — report étendu à 72 depuis 2024)
 *
 * Split RRQ/PSV du champ AGRÉGÉ legacy `governmentPension` : convention de MODÈLE 65/35
 * (GOV_PENSION_*_SHARE, utils/tax.ts — PAS une règle ARC/RQ, cf FISCAL_REFERENCE §6 FA-8).
 * Les champs précis `rrqEstimateMonthly`/`psvEstimateMonthly` priment dans retirementIncome ;
 * ce split ne sert que de repli/ancre.
 *
 * Note: effectivePensionStartAge est l'âge de déblocage des pensions
 * gouvernementales (65 par défaut, 72 si delayPensions). Distinct de
 * effectiveRetirementAge (âge où la personne arrête de travailler).
 */
export function computeRrqAdjustment(
    delayPensions: boolean,
    retirementGoal: { governmentPension: number },
): RrqAdjustmentResult {
    const effectivePensionStartAge = delayPensions ? 72 : 65;
    const rrqMonthsFromRef = (effectivePensionStartAge - 65) * 12;
    // Facteur d'ajustement RRQ : source unique utils/tax.ts (anticipation −0,6 %/mois max −60 mois,
    // report +0,7 %/mois max +84 mois → ×1,588 à 72 ans).
    const rrqAdjustmentFactor = computeRrqFactor(rrqMonthsFromRef);

    return {
        effectivePensionStartAge,
        rrqAdjustmentFactor,
        rrqBasePension: retirementGoal.governmentPension * GOV_PENSION_RRQ_SHARE * rrqAdjustmentFactor,
        // PSV de BASE (sans facteur de report) : sert d'ANCRE legacy. Le CAP du clawback PSV
        // utilise désormais la PSV réellement VERSÉE du breakdown (report/bonus 75+/prorata
        // inclus — FA-8, cf computeOasClawback) ; cette base n'est plus qu'un repli rétro-compat.
        psvBasePension: retirementGoal.governmentPension * GOV_PENSION_PSV_SHARE,
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
 * Brut DÉDUIT du net par inversion EXACTE du calcul fiscal quand `grossSalary` est absent
 * ([MIGRATE-GROSS-135]). C'était `net * 1.35`, un facteur plat dont l'erreur MESURÉE sur le barème
 * 2026 change de SIGNE selon le revenu : +2 681 $ à 30 k$ de net annuel, mais −22 028 $ à 100 k$ et
 * −132 196 $ à 250 k$. Aucun facteur plat ne peut donc convenir — la relation net→brut est convexe.
 * `calculateGrossFromNet` inverse par dichotomie à moins de 1 $ près.
 * ⚠️ Perf VÉRIFIÉE avant de câbler : 0,026 ms/appel, soit ~2 ms sur une dichotomie `goalSeek`
 * complète (qui relance le moteur ~40 fois). Négligeable devant le coût d'une projection.
 *
 * IMPORTANT — unités : `grossSalary` et `netSalary` sont stockés MENSUELS dans
 * le store (cf Budget.tsx, FutureProjection.tsx, Retirement.tsx, TaxCenter.tsx,
 * pdfReport.ts qui les multiplient tous par 12). On annualise donc le brut ici
 * (× 12) car le moteur fiscal en aval attend un revenu brut ANNUEL.
 * Bug historique : le brut mensuel était lu tel quel comme un brut annuel →
 * revenu 12× trop bas → impôt d'emploi ~0 sur toute la projection.
 */
export function computeIncomeBaseline(
    projection: { useTheoretical?: boolean; theoreticalIncome?: number },
    users: Array<{ netSalary?: number; grossSalary?: number } | undefined>,
): IncomeBaselineResult {
    const useTheo = projection.useTheoretical;
    const theoIncome = projection.theoreticalIncome || 8000;

    const incomeMarcNetMonthly = useTheo ? (theoIncome * 0.55) : (users[0]?.netSalary || 0);
    const incomeAnnaNetMonthly = useTheo ? (theoIncome * 0.45) : (users[1]?.netSalary || 0);
    // ⚠️ UNITÉS : les salaires du store sont MENSUELS, `calculateGrossFromNet` travaille en ANNUEL.
    const brutDeduit = (netMensuel: number): number =>
        (netMensuel > 0 ? calculateGrossFromNet(netMensuel * 12) : 0);
    const grossMarcBaseAnnual = useTheo
        ? brutDeduit(incomeMarcNetMonthly)
        : (users[0]?.grossSalary ? users[0].grossSalary * 12 : brutDeduit(incomeMarcNetMonthly));
    const grossAnnaBaseAnnual = useTheo
        ? brutDeduit(incomeAnnaNetMonthly)
        : (users[1]?.grossSalary ? users[1].grossSalary * 12 : brutDeduit(incomeAnnaNetMonthly));

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
    projection: { inflationRate?: number; returnRates?: { celi: number; reer: number; nonReg: number; crypto: number; cash: number }; [key: string]: unknown },
    scenarioType: FutureScenarioType,
): ScenarioOverrideResult {
    // `??` (pas `||`) : une inflation de 0 % est un choix LÉGITIME (« et si l'inflation s'arrêtait »)
    // que `|| 2.0` écrasait silencieusement à 2 %. Le slider d'inflation (ProjectionControls, range
    // [0,8]) produit TOUJOURS un nombre — 0 inclus — donc `?? 2.0` ne retombe sur le défaut que si la
    // valeur est réellement absente (config non initialisée, ou persistance relue `null` —
    // `JSON.stringify(NaN) === "null"`). Cohérent avec les 2 sites UI (Retirement label, ChildPlanning coûts).
    let simInflation = projection.inflationRate ?? 2.0;
    if (scenarioType === 'HYPER_INFLATION') simInflation = 5.5;
    // Phase 4 #4: COMPOUND_STRESS empile l'inflation soutenue ET les rendements
    // anémiques. La gestion de LTC se fait via le flag projection.ltcEnabled
    // forcé à true dans le runner (cf projection.ts effProj override).
    if (scenarioType === 'COMPOUND_STRESS') simInflation = 5.0;

    // 2026-05-22 : lisait `projection.rates` (champ inexistant) → toujours
    // undefined → fallback défaut, donc les sliders de rendement de l'UI
    // (qui écrivent `projection.returnRates`) n'avaient AUCUN effet. Aligné.
    const baseRates = (scenarioType === 'ECONOMIC_WINTER' || scenarioType === 'COMPOUND_STRESS')
        ? { celi: 3.0, reer: 3.0, nonReg: 2.0, crypto: 5.0, cash: 1.0 }
        : (projection.returnRates || { celi: 7, reer: 6.5, nonReg: 6.5, crypto: 10, cash: 3 });

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
