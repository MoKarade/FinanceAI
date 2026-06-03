// mcp/tools/getTaxSituation.tool.ts
// Lot 1 — situation fiscale RÉELLE : impôt courant + espace REER/CELI restant.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppState, User } from '../../types';
import { calculateFiscalReport } from '../../utils/tax';
import { computeHistoricalContributionRoom } from '../../services/projection/setupSimulation';
import { computeAssetBreakdown } from '../../services/portfolio';
import { computeBaseGrossAnnual } from '../../services/projection/buildSimulationParams';
import { jsonContent, withState, type StateProvider } from './_dataAware';

const inputSchema = {
    year: z.number().int().min(2024).max(2050).default(2026)
        .describe("Année d'imposition (défaut: 2026)."),
};

export const registerGetTaxSituation = (server: McpServer, getState: StateProvider): void => {
    server.tool(
        'get_tax_situation',
        "Situation fiscale québécoise RÉELLE de l'utilisateur, dérivée de son état : impôt fédéral + " +
        'Québec estimé, taux marginal et moyen, cotisations RRQ/RQAP/AE, revenu net, ET surtout ' +
        "l'espace de cotisation RESTANT REER et CELI (droits historiques cumulés moins soldes actuels). " +
        'Le revenu brut est la somme des salaires bruts annualisés des utilisateurs configurés.',
        inputSchema,
        async ({ year }) => withState(getState, (state: AppState) => {
            const users = (state.config?.users ?? []) as unknown as User[];
            const activeUsers = users.filter((u) => u && (u.grossSalary || u.netSalary));
            const grossAnnual = computeBaseGrossAnnual(users);

            // Cotisations REER/CELIAPP déclarées (annuelles) — somme sur les users.
            const rrspContribAnnual = activeUsers.reduce((s, u) => s + ((u.rrspContributed || 0)), 0);
            const fhsaContribAnnual = activeUsers.reduce((s, u) => s + ((u.fhsaBalance || 0)), 0);

            const report = calculateFiscalReport(grossAnnual, rrspContribAnnual, fhsaContribAnnual, year, true);

            // Espace de cotisation : droits historiques cumulés − soldes actuels.
            // Aligne la sémantique du moteur (rrspRoom = totalHistoriqueREER − REER).
            const room = computeHistoricalContributionRoom(activeUsers, grossAnnual, year);
            const breakdown = computeAssetBreakdown(state.assets ?? [], state.fxRates ?? {});
            const celiRoomRemaining = Math.max(0, room.totalHistoricalCeliRoom - breakdown.celi);
            const reerRoomRemaining = Math.max(0, room.totalHistoricalRrspRoom - breakdown.reer);

            return jsonContent({
                currency: 'CAD',
                year,
                grossAnnualIncome: Math.round(grossAnnual),
                taxFederal: Math.round(report.fedTax),
                taxQuebec: Math.round(report.qcTax),
                totalTax: Math.round(report.totalTax),
                marginalRatePct: Number((report.marginalRate * 100).toFixed(1)),
                averageRatePct: Number(report.averageRate.toFixed(1)),
                netIncome: Math.round(report.netIncome),
                payrollDeductions: {
                    rrq: Math.round(report.rrq),
                    rqap: Math.round(report.rqap),
                    ae: Math.round(report.ae),
                },
                celiRoomRemaining: Math.round(celiRoomRemaining),
                reerRoomRemaining: Math.round(reerRoomRemaining),
                currentBalances: {
                    celi: Math.round(breakdown.celi),
                    reer: Math.round(breakdown.reer),
                },
                notes:
                    "Estimation sur salaires bruts annualisés ; n'inclut pas tous les crédits/revenus de " +
                    'placement. L\'espace REER/CELI suppose que les soldes de placement reflètent les ' +
                    'cotisations cumulées.',
            });
        }),
    );
};
