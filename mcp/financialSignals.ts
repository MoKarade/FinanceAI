// mcp/financialSignals.ts
//
// [HUB-01] Signaux financiers PURS, extraits de getNextBestActions.tool.ts pour être
// partagés entre l'outil MCP `get_next_best_actions` et le résumé hub (`/hub/summary`).
// Aucun appel LLM, aucune I/O : uniquement des faits chiffrés calculés sur l'état.
import type { AppState, User } from '../types';
import { buildFinancialOverview, type FinancialOverview } from '../services/financialSnapshot';
import { computeHistoricalContributionRoom } from '../services/projection/setupSimulation';
import { computeAssetBreakdown } from '../services/portfolio';
import { computeBaseGrossAnnual } from '../services/projection/buildSimulationParams';

export interface FinancialSignal {
    id: string;
    priority: 'high' | 'medium' | 'low';
    observation: string;
    metricCad?: number;
}

export interface FinancialSignals {
    overview: FinancialOverview;
    celiRoom: number;
    reerRoom: number;
    signals: FinancialSignal[];
}

/** Vue d'ensemble + signaux priorisés (dettes toxiques, cashflow, coussin, espace CELI/REER). */
export function computeFinancialSignals(
    state: AppState,
    year: number = new Date().getFullYear(),
): FinancialSignals {
    const overview = buildFinancialOverview(state);
    const users = (state.config?.users ?? []) as unknown as User[];
    const activeUsers = users.filter((u) => u && (u.grossSalary || u.netSalary));
    const grossAnnual = computeBaseGrossAnnual(users);
    const room = computeHistoricalContributionRoom(activeUsers, grossAnnual, year);
    const breakdown = computeAssetBreakdown(state.assets ?? [], state.fxRates ?? {});
    const celiRoom = Math.max(0, room.totalHistoricalCeliRoom - breakdown.celi);
    const reerRoom = Math.max(0, room.totalHistoricalRrspRoom - breakdown.reer);

    const signals: FinancialSignal[] = [];

    // Dettes à taux élevé (> 8%) = priorité absolue.
    const toxicDebts = (state.debts ?? []).filter((d) => (d.interestRate || 0) >= 8);
    if (toxicDebts.length > 0) {
        const total = toxicDebts.reduce((s, d) => s + (d.balance || 0), 0);
        signals.push({
            id: 'high_interest_debt',
            priority: 'high',
            observation: `${toxicDebts.length} dette(s) à taux ≥ 8% pour ${Math.round(total)}$ ` +
                `(${toxicDebts.map((d) => `${d.name} ${d.interestRate}%`).join(', ')}).`,
            metricCad: Math.round(total),
        });
    }

    // Coussin de sécurité : cashflow négatif ou liquidités < 3 mois de dépenses.
    if (overview.monthlyCashflow <= 0) {
        signals.push({
            id: 'negative_cashflow',
            priority: 'high',
            observation: `Cashflow mensuel ≤ 0 (épargne ${Math.round(overview.monthlyCashflow)}$/mois).`,
            metricCad: Math.round(overview.monthlyCashflow),
        });
    }
    const monthsCushion = overview.monthlyExpenses > 0
        ? overview.liquidity / overview.monthlyExpenses
        : Infinity;
    if (Number.isFinite(monthsCushion) && monthsCushion < 3) {
        signals.push({
            id: 'thin_emergency_fund',
            priority: 'medium',
            observation: `Coussin d'urgence ≈ ${monthsCushion.toFixed(1)} mois de dépenses (< 3 recommandés).`,
            metricCad: Math.round(overview.liquidity),
        });
    }

    // Espace CELI / REER inexploité.
    if (celiRoom > 1000) {
        signals.push({
            id: 'unused_celi_room',
            priority: 'medium',
            observation: `Espace CELI inexploité ≈ ${Math.round(celiRoom)}$ (croissance libre d'impôt).`,
            metricCad: Math.round(celiRoom),
        });
    }
    if (reerRoom > 1000 && grossAnnual > 0) {
        signals.push({
            id: 'unused_reer_room',
            priority: 'medium',
            observation: `Espace REER inexploité ≈ ${Math.round(reerRoom)}$ (déduction au taux marginal).`,
            metricCad: Math.round(reerRoom),
        });
    }

    return { overview, celiRoom, reerRoom, signals };
}
