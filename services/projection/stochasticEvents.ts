// services/projection/stochasticEvents.ts
// Cycle 8 split: extraction des événements stochastiques one-shot (CI + héritage)
// et de l'événement LTC (multi-mois mais simple).
//
// Pattern: chaque trigger retourne le nouveau flag d'état (ou undefined si
// inchangé) + applique les mutations via callbacks. Évite de manipuler
// directement les variables locales de runScenario.

import type { ProjectionConfig } from '../../types';
import { ltcAnnualProbability, mortalityAnnualProbability } from './helpers';

export interface StochasticContext {
    m: number;
    currentMonthIndex: number;
    age: number;
    currentAge: number;
    expenseMultiplier: number;
    enableMonteCarlo: boolean;
    rng: () => number;
}

export interface StochasticMutator {
    addLiquid: (amount: number) => void;
    addExpense: (amount: number) => void;
    logLife: (msg: string) => void;
}

/**
 * W3.3 — Maladie grave (one-shot).
 * Retourne true si le trigger a déclenché (caller met à jour son flag ciTriggered).
 */
export function tryCriticalIllness(
    ctx: StochasticContext,
    proj: ProjectionConfig,
    ciAlreadyTriggered: boolean,
    state: StochasticMutator,
): boolean {
    if (!proj.criticalIllnessEnabled || !ctx.enableMonteCarlo) return false;
    if (ciAlreadyTriggered) return false;
    if (ctx.currentMonthIndex !== 0 || ctx.m === 0) return false;
    const pAnnual = proj.ciAnnualProbability ?? 0.003;
    if (ctx.rng() >= pAnnual) return false;

    const payout = proj.ciPayoutAmount || 0;
    if (payout > 0) state.addLiquid(payout);
    const extra = proj.ciExtraMonthlyExpense || 0;
    if (extra > 0) state.addExpense(extra * ctx.expenseMultiplier);
    state.logLife(`🩺 Maladie grave (capital +${payout}\$, dépenses +${extra}\$/mois)`);
    return true;
}

/**
 * W3.4 — Héritage probabilisé (one-shot).
 * Fenêtre [expectedAge ± uncertaintyY], probabilité totale `probInWindow` étalée.
 * Si uncertaintyY = 0 : événement ponctuel à expectedAge exactement.
 * Retourne true si l'héritage est reçu ce mois-ci.
 */
export function tryInheritance(
    ctx: StochasticContext,
    proj: ProjectionConfig,
    inheritanceAlreadyReceived: boolean,
    state: StochasticMutator,
): boolean {
    if (!proj.inheritanceEnabled || !ctx.enableMonteCarlo) return false;
    if (inheritanceAlreadyReceived) return false;
    if (ctx.currentMonthIndex !== 0 || ctx.m === 0) return false;

    const expectedAge = proj.inheritanceExpectedAtAge ?? (ctx.currentAge + 25);
    const uncertaintyY = proj.inheritanceUncertaintyYears ?? 5;
    const probInWindow = proj.inheritanceProbability ?? 0.8;
    const amount = proj.inheritanceExpectedAmount || 0;
    if (amount <= 0) return false;

    let triggers = false;
    if (uncertaintyY <= 0) {
        triggers = ctx.age === expectedAge && ctx.rng() < probInWindow;
    } else if (ctx.age >= expectedAge - uncertaintyY && ctx.age <= expectedAge + uncertaintyY) {
        const yearsInWindow = uncertaintyY * 2 + 1;
        triggers = ctx.rng() < (probInWindow / yearsInWindow);
    }
    if (!triggers) return false;

    state.addLiquid(amount);
    state.logLife(`🎁 Héritage reçu: +${amount.toLocaleString('fr-CA')}\$`);
    return true;
}

/**
 * D2.8 — Mortalité stochastique. Tirage annuel en janvier.
 * Retourne true si le décès est tiré ce cycle (caller doit alors break la simulation).
 */
export function tryMortality(
    ctx: { m: number; currentMonthIndex: number; age: number; enableMonteCarlo: boolean; rng: () => number },
    proj: ProjectionConfig,
    alreadyDead: boolean,
): boolean {
    if (!proj.useStochasticMortality || !ctx.enableMonteCarlo) return false;
    if (alreadyDead) return false;
    if (ctx.currentMonthIndex !== 0 || ctx.m === 0) return false;
    const pYear = mortalityAnnualProbability(ctx.age);
    return ctx.rng() < pYear;
}

/**
 * W1.4 — Mortalité du conjoint. Tirage annuel; si déclenché, retourne true
 * (caller bascule en mode survivant).
 */
export function trySpouseMortality(
    ctx: { m: number; currentMonthIndex: number; enableMonteCarlo: boolean; rng: () => number },
    proj: ProjectionConfig,
    spouseAge: number,
    spouseAlive: boolean,
    survivorModeActive: boolean,
): boolean {
    if (!proj.modelSurvivor || !ctx.enableMonteCarlo) return false;
    if (!spouseAlive || survivorModeActive) return false;
    if (ctx.currentMonthIndex !== 0 || ctx.m === 0) return false;
    const pYear = mortalityAnnualProbability(spouseAge);
    return ctx.rng() < pYear;
}

/**
 * D2.8 — Long-Term Care trigger. Probabilité annuelle convertie mensuelle.
 * Une fois actif, NE SE DÉCLENCHE PAS À NOUVEAU (caller garde le flag).
 * Retourne true si le LTC vient juste de s'activer.
 */
export function tryLtcTrigger(
    ctx: { age: number; enableMonteCarlo: boolean; rng: () => number },
    proj: ProjectionConfig,
    ltcAlreadyActive: boolean,
): boolean {
    if (!proj.ltcEnabled || !ctx.enableMonteCarlo) return false;
    if (ltcAlreadyActive || ctx.age < 65) return false;
    const annualP = ltcAnnualProbability(ctx.age);
    const monthlyP = 1 - Math.pow(1 - annualP, 1 / 12);
    return ctx.rng() < monthlyP;
}

/**
 * Calcule le coût mensuel de LTC une fois actif (avec multiplicateur d'inflation).
 */
export function ltcMonthlyCost(proj: ProjectionConfig, expenseMultiplier: number): number {
    return (proj.ltcMonthlyCost || 5000) * expenseMultiplier;
}

/**
 * D2.10 — Perte d'emploi stochastique (multi-mois).
 * Si actuellement en chômage (`monthsRemaining > 0`), décrémente.
 * Sinon, peut déclencher si conditions remplies.
 *
 * Retourne: { newMonthsRemaining, triggered }
 * - newMonthsRemaining: durée restante à jour (décrémentée si déjà actif)
 * - triggered: true si la perte d'emploi vient d'être tirée ce cycle (pour log)
 */
export function tickJobLoss(
    ctx: { m: number; currentMonthIndex: number; enableMonteCarlo: boolean; rng: () => number },
    proj: ProjectionConfig,
    monthsRemaining: number,
): { newMonthsRemaining: number; triggered: boolean; duration: number } {
    // Tick existing unemployment (décrémenter d'abord)
    if (monthsRemaining > 0) {
        return { newMonthsRemaining: monthsRemaining - 1, triggered: false, duration: 0 };
    }
    // Tirage d'un nouveau chômage (janvier uniquement, MC requis)
    if (!proj.jobLossEnabled || !ctx.enableMonteCarlo) return { newMonthsRemaining: 0, triggered: false, duration: 0 };
    if (ctx.currentMonthIndex !== 0 || ctx.m === 0) return { newMonthsRemaining: 0, triggered: false, duration: 0 };
    const pAnnual = proj.jobLossAnnualProbability ?? 0.03;
    if (ctx.rng() >= pAnnual) return { newMonthsRemaining: 0, triggered: false, duration: 0 };

    const duration = proj.jobLossDurationMonths || 6;
    return { newMonthsRemaining: duration, triggered: true, duration };
}

/**
 * W3.2 — Invalidité longue durée (LTD) multi-mois.
 * Comme tickJobLoss mais avec un flag de log séparé (log une fois au début).
 */
/**
 * W3.1 — Divorce stochastique (one-shot).
 * Le split est COMPLEXE (12+ variables à diviser) — caller fournit un splitter
 * qui mute ses propres locales (liquid, celi, reer, etc., et propertiesState).
 *
 * Retourne true si le divorce vient de se produire (caller met à jour `divorced`).
 */
export function tryDivorce(
    ctx: { m: number; currentMonthIndex: number; enableMonteCarlo: boolean; rng: () => number },
    proj: ProjectionConfig,
    alreadyDivorced: boolean,
    applySplit: (keepFraction: number) => void,
): boolean {
    if (!proj.divorceEnabled || !ctx.enableMonteCarlo) return false;
    if (alreadyDivorced) return false;
    if (ctx.currentMonthIndex !== 0 || ctx.m === 0) return false;
    const pAnnual = proj.divorceAnnualProbability ?? 0.015;
    if (ctx.rng() >= pAnnual) return false;

    const splitPct = (proj.divorceSplitPct ?? 50) / 100;
    const keep = 1 - splitPct;
    applySplit(keep);
    return true;
}

export function tickLtd(
    ctx: { m: number; currentMonthIndex: number; enableMonteCarlo: boolean; rng: () => number },
    proj: ProjectionConfig,
    monthsRemaining: number,
    alreadyLogged: boolean,
): { newMonthsRemaining: number; needsLog: boolean; duration: number } {
    if (monthsRemaining > 0) {
        return {
            newMonthsRemaining: monthsRemaining - 1,
            needsLog: !alreadyLogged,
            duration: monthsRemaining,
        };
    }
    if (!proj.ltdEnabled || !ctx.enableMonteCarlo) return { newMonthsRemaining: 0, needsLog: false, duration: 0 };
    if (ctx.currentMonthIndex !== 0 || ctx.m === 0) return { newMonthsRemaining: 0, needsLog: false, duration: 0 };
    const pAnnual = proj.ltdAnnualProbability ?? 0.005;
    if (ctx.rng() >= pAnnual) return { newMonthsRemaining: 0, needsLog: false, duration: 0 };

    const duration = proj.ltdDurationMonths || 24;
    return { newMonthsRemaining: duration, needsLog: false, duration };
}
