// mcp/tools/getNextBestActions.tool.ts
//
// Lot 1 — « prochaines meilleures actions ». Choix d'architecture (cf design §6) :
// dans un connecteur MCP, CLAUDE fait le raisonnement. On ne rappelle donc PAS
// l'API Anthropic ici (pas de clé, moins de surface, moins de coût) : on renvoie
// des SIGNAUX financiers calculés PUREMENT (espace REER/CELI inexploité, dettes à
// taux élevé, cashflow, coussin d'urgence, statut FIRE) et Claude rédige les
// recommandations à partir de ces faits.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppState, User } from '../../types';
import { buildFinancialOverview } from '../../services/financialSnapshot';
import { computeHistoricalContributionRoom } from '../../services/projection/setupSimulation';
import { computeAssetBreakdown } from '../../services/portfolio';
import { computeBaseGrossAnnual } from '../../services/projection/buildSimulationParams';
import { jsonContent, withState, type StateProvider } from './_dataAware';

interface Signal {
    id: string;
    priority: 'high' | 'medium' | 'low';
    observation: string;
    metricCad?: number;
}

export const registerGetNextBestActions = (server: McpServer, getState: StateProvider): void => {
    server.tool(
        'get_next_best_actions',
        "Signaux financiers priorisés (calculés sur les VRAIES données) pour guider les prochaines " +
        "actions de l'utilisateur : espace REER/CELI inexploité, dettes à taux élevé, cashflow mensuel, " +
        'coussin de sécurité, statut FIRE. Renvoie des FAITS chiffrés (pas de prose) — à toi, Claude, ' +
        'de formuler les recommandations québécoises concrètes à partir de ces signaux.',
        {},
        async () => withState(getState, (state: AppState) => {
            const overview = buildFinancialOverview(state);
            const users = (state.config?.users ?? []) as unknown as User[];
            const activeUsers = users.filter((u) => u && (u.grossSalary || u.netSalary));
            const grossAnnual = computeBaseGrossAnnual(users);
            const year = new Date().getFullYear();
            const room = computeHistoricalContributionRoom(activeUsers, grossAnnual, year);
            const breakdown = computeAssetBreakdown(state.assets ?? [], state.fxRates ?? {});
            const celiRoom = Math.max(0, room.totalHistoricalCeliRoom - breakdown.celi);
            const reerRoom = Math.max(0, room.totalHistoricalRrspRoom - breakdown.reer);

            const signals: Signal[] = [];

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

            return jsonContent({
                currency: 'CAD',
                snapshot: {
                    netWorth: Math.round(overview.netWorth),
                    monthlyCashflow: Math.round(overview.monthlyCashflow),
                    liquidity: Math.round(overview.liquidity),
                    totalDebt: Math.round(overview.totalDebt),
                    celiRoomRemaining: Math.round(celiRoom),
                    reerRoomRemaining: Math.round(reerRoom),
                },
                signals,
                guidance:
                    'Formule 3 à 5 actions québécoises concrètes (REER, CELI, CELIAPP, RAP, remboursement ' +
                    'dette, coussin) priorisées par impact, en citant les montants ci-dessus.',
            });
        }),
    );
};
