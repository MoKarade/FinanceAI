// services/projection/stochasticEvents.ts
// Cycle 8 split: extraction des événements stochastiques one-shot (CI + héritage)
// et de l'événement LTC (multi-mois mais simple).
//
// Pattern: chaque trigger retourne le nouveau flag d'état (ou undefined si
// inchangé) + applique les mutations via callbacks. Évite de manipuler
// directement les variables locales de runScenario.

import type { ProjectionConfig } from '../../types';

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
