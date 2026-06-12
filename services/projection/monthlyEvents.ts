// services/projection/monthlyEvents.ts
// Cycle 16: applyTravelExpenses + applyLifeEvents + computeStressTest.
// Trois helpers indépendants groupés car ils tournent tous au même moment
// du loop mensuel (après les dépenses enfants, avant shortfall).

import type { TravelGoal, LifeEvent, ProjectionConfig, SavingsGoal, FinancialGoal } from '../../types';

// ── Voyages ──────────────────────────────────────────────────────────────────

export function applyTravelExpenses(
    travelGoals: TravelGoal[],
    currentIsoMonth: string,
    expenseMultiplier: number,
    state: { addExpense: (n: number) => void; logFlow: (s: string) => void },
): void {
    for (const t of travelGoals) {
        // Defensive 2026-05-21 : skip si date manquante/invalide (crash Worker observé)
        if (!t.date || typeof t.date !== 'string') continue;
        if (t.date.startsWith(currentIsoMonth)) {
            const effectiveCost = (t.totalCost ?? 0) * expenseMultiplier;
            state.addExpense(effectiveCost);
            state.logFlow(`✈️ Voyage (${t.destination}): -${Math.round(effectiveCost).toLocaleString('fr-CA')}$`);
        }
    }
}

// ── Événements de vie ─────────────────────────────────────────────────────────

export interface PropertyStateMutable {
    isBought: boolean;
    mortgage: number;
    currentValue: number;
    isSold?: boolean;
    /** RE-GAIN — coût d'achat (ACB approximé = prix payé), pour le gain en capital à la disposition. */
    cost?: number;
    /** RE-GAIN — résidence principale (gain EXEMPT, LIR 40(2)b) vs locatif (gain imposable). */
    isPrimaryResidence?: boolean;
    [key: string]: unknown;
}

export interface LifeEventMutator {
    shockPortfolio: (factor: number) => void;
    addLiquid: (amt: number) => void;
    addExpense: (amt: number) => void;
    adjustRealEstate: (equityDelta: number, mortgageDelta: number) => void;
    /** RE-GAIN — réalise un gain en capital BRUT (100 %) ; l'inclusion 50 % est appliquée en aval
     *  (accCapitalGainsYear × 0,5). Sert à imposer la vente d'un IMMEUBLE LOCATIF. */
    realizeCapitalGain: (grossGain: number) => void;
    logLife: (msg: string) => void;
    logFlow: (msg: string) => void;
}

export function applyLifeEvents(
    lifeEvents: LifeEvent[],
    currentIsoMonth: string,
    expenseMultiplier: number,
    propertiesState: PropertyStateMutable[],
    state: LifeEventMutator,
): void {
    for (const e of lifeEvents) {
        // Defensive 2026-05-21 : skip si date manquante/invalide
        if (!e.date || typeof e.date !== 'string') continue;
        if (!e.date.startsWith(currentIsoMonth)) continue;

        if (e.type === 'KRACH') {
            const drop = 1 - ((e.impactPercent || 30) / 100);
            state.shockPortfolio(drop);
            state.logLife(`Krach (-${e.impactPercent}%) 📉`);
        } else {
            const isVente = e.name && e.name.toLowerCase().includes('vente');
            if (isVente) {
                const soldProp = propertiesState.find(p => p.isBought && p.mortgage < p.currentValue);
                if (soldProp) {
                    const saleNet = soldProp.currentValue * 0.95 - soldProp.mortgage;
                    state.addLiquid(Math.max(0, saleNet));
                    state.adjustRealEstate(
                        -(soldProp.currentValue - soldProp.mortgage),
                        -soldProp.mortgage,
                    );
                    // RE-GAIN — gain en capital à la disposition : EXEMPT pour la résidence principale
                    // (LIR 40(2)b) ; IMPOSABLE pour un locatif = produit net (95 %) − coût d'achat, 50 %
                    // inclus en aval. Coût absent → 0 (conservateur : tout le produit devient gain).
                    if (!soldProp.isPrimaryResidence) {
                        const gain = Math.max(0, soldProp.currentValue * 0.95 - (soldProp.cost ?? 0));
                        if (gain > 0) {
                            state.realizeCapitalGain(gain);
                            state.logFlow(`🏠 Gain en capital (locatif) réalisé : ${Math.round(gain).toLocaleString('fr-CA')}$ — 50 % imposable`);
                        }
                    }
                    soldProp.isBought = false;
                    soldProp.mortgage = 0;
                    soldProp.isSold = true;
                    state.logLife(`🏠 Vente (net 95%): +${Math.round(Math.max(0, saleNet)).toLocaleString('fr-CA')}$`);
                }
            } else {
                const effectiveImpact = (e.impactAmount ?? 0) * expenseMultiplier;
                state.addExpense(effectiveImpact);
                state.logLife(`${e.name} 💸`);
                state.logFlow(`🔔 Événement (${e.name}): -${Math.round(effectiveImpact).toLocaleString('fr-CA')}$`);
            }
        }
    }
}

// ── Objectifs (SavingsGoal + FinancialGoal) ──────────────────────────────────
// Wiring 2026-05: ces deux types de goals étaient déclarés en types mais jamais
// consommés par le moteur. Au mois du deadline, on retire le manque à combler
// (targetAmount − currentAmount) du compte ciblé (FinancialGoal) ou du liquide
// (SavingsGoal). Permet à la projection de refléter l'impact des achats prévus.

export interface GoalDeadlineMutator {
    withdrawFromAccount: (account: 'CELI' | 'REER' | 'NON-ENREG' | 'CRYPTO' | 'LIQUID', amount: number) => number;
    addExpense: (amt: number) => void;
    logFlow: (msg: string) => void;
    /** [PV-11a] — remontée STRUCTURÉE d'un objectif partiellement financé (drawn < visé).
     *  Optionnel : les appelants hors-moteur (tests) peuvent l'omettre. */
    onGoalShortfall?: (goalName: string, asked: number, drawn: number) => void;
}

export function applySavingsGoalDeadlines(
    savingsGoals: SavingsGoal[],
    currentIsoMonth: string,
    expenseMultiplier: number,
    state: GoalDeadlineMutator,
): void {
    for (const g of savingsGoals) {
        if (!g.deadline || !g.deadline.startsWith(currentIsoMonth)) continue;
        const need = Math.max(0, (g.targetAmount || 0) - (g.currentAmount || 0));
        if (need <= 0) continue;
        const effective = need * expenseMultiplier;
        // SavingsGoal n'a pas de compte cible → cascade depuis liquide.
        const drawn = state.withdrawFromAccount('LIQUID', effective);
        if (drawn > 0) state.addExpense(drawn);
        // [PV-10 suivi] log HONNÊTE : montant réellement tiré (pas la cible) + mention du manque.
        const isShort = effective - drawn > 0.5;
        if (isShort) state.onGoalShortfall?.(g.name || 'Objectif', effective, drawn);
        const short = isShort ? ` (visé ${Math.round(effective).toLocaleString('fr-CA')}$ — fonds insuffisants)` : '';
        state.logFlow(`🎯 Objectif (${g.name}): -${Math.round(Math.max(0, drawn)).toLocaleString('fr-CA')}$${short}`);
    }
}

export function applyFinancialGoalDeadlines(
    financialGoals: FinancialGoal[],
    currentIsoMonth: string,
    expenseMultiplier: number,
    state: GoalDeadlineMutator,
): void {
    for (const g of financialGoals) {
        if (g.status === 'archived' || g.completed) continue;
        if (!g.deadline || !g.deadline.startsWith(currentIsoMonth)) continue;
        const need = Math.max(0, (g.targetAmount || 0) - (g.manualCurrentAmount || 0));
        if (need <= 0) continue;
        const effective = need * expenseMultiplier;
        const account = g.targetAccount || 'NON-ENREG';
        const drawn = state.withdrawFromAccount(account, effective);
        if (drawn > 0) state.addExpense(drawn);
        // [PV-10 suivi] log HONNÊTE : montant réellement tiré (pas la cible) + mention du manque.
        const isShort = effective - drawn > 0.5;
        if (isShort) state.onGoalShortfall?.(g.name || 'But financier', effective, drawn);
        const short = isShort ? ` (visé ${Math.round(effective).toLocaleString('fr-CA')}$ — fonds insuffisants)` : '';
        state.logFlow(`🏆 But financier (${g.name}): -${Math.round(Math.max(0, drawn)).toLocaleString('fr-CA')}$ depuis ${account}${short}`);
    }
}

// ── Stress test ───────────────────────────────────────────────────────────────

export interface StressTestResult {
    crashFactor: number;    // (1-drop) si mois du crash, sinon 1.0
    recoveryFactor: number; // (1+boost) si mois de reprise (sans crypto), sinon 1.0
    log: string | null;
}

/**
 * Calcule les facteurs de choc/reprise pour le mois courant.
 * Le caller applique crashFactor à CELI/REER/NonReg/Crypto,
 * et recoveryFactor à CELI/REER/NonReg uniquement.
 */
export function computeStressTest(
    proj: ProjectionConfig,
    m: number,
): StressTestResult {
    if (!proj.stressTestEnabled) return { crashFactor: 1, recoveryFactor: 1, log: null };

    const crashStartMonth = (proj.stressTestYear || 5) * 12;
    const recoveryMonths = proj.stressTestRecoveryMonths || 24;
    const drop = (proj.stressTestDrop || 30) / 100;

    if (m === crashStartMonth) {
        return {
            crashFactor: 1 - drop,
            recoveryFactor: 1,
            log: `📉 Choc Marché -${Math.round(drop * 100)}%`,
        };
    }
    if (m > crashStartMonth && m <= crashStartMonth + recoveryMonths) {
        return {
            crashFactor: 1,
            recoveryFactor: 1 + (drop / recoveryMonths) * 0.9,
            log: null,
        };
    }
    return { crashFactor: 1, recoveryFactor: 1, log: null };
}
