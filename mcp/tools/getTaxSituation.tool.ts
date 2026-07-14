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
        'Québec estimé PAR CONTRIBUABLE puis sommé (fiscalité canadienne = individuelle, pas de ' +
        'déclaration conjointe), taux marginal par conjoint, cotisations RRQ/RQAP/AE, revenu net, ET ' +
        "l'espace de cotisation RESTANT REER et CELI du MÉNAGE (droits historiques cumulés moins " +
        'soldes actuels).',
        inputSchema,
        async ({ year }) => withState(getState, (state: AppState) => {
            const users = (state.config?.users ?? []) as unknown as User[];
            const activeUsers = users.filter((u) => u && (u.grossSalary || u.netSalary));
            const grossAnnual = computeBaseGrossAnnual(users);

            // [MCP-TAX-COUPLE] — impôt PAR CONJOINT puis sommé, comme le moteur (taxDecember.ts
            // calcule taxMarcReal et taxAnnaReal SÉPARÉMENT). L'ancien code sommait les 2 salaires
            // dans UN calculateFiscalReport (un seul BPA, un seul barème progressif) → ~+11 300 $/an
            // de sur-estimation pour un couple 60k/60k et un marginal de ménage (45,7 %) au lieu du
            // marginal individuel (36,1 %) — audit adversarial 2026-07-14, mesuré 3/3.
            // Chaque user est imposé sur SON brut annualisé avec SES déductions REER/CELIAPP.
            // NB : un user avec SEULEMENT netSalary (pas de brut) est dans activeUsers mais EXCLU
            // de perUserReports (brut inconnu → impôt incalculable, même convention gross-only que
            // computeBaseGrossAnnual/le moteur) → perUser.length peut être < activeUsers.length,
            // et ses rrspContributed/fhsaBalance ne déduisent RIEN (correct : une déduction ne
            // réduit que le revenu de SON titulaire — l'ancien code fusionné l'appliquait à tort
            // au revenu de l'autre conjoint).
            const perUserReports = activeUsers
                .map((u) => ({ user: u, grossAnnual: (u.grossSalary || 0) * 12 }))
                .filter(({ grossAnnual: g }) => g > 0)
                .map(({ user: u, grossAnnual: g }) => ({
                    name: u.name || null,
                    grossAnnual: g,
                    report: calculateFiscalReport(g, u.rrspContributed || 0, u.fhsaBalance || 0, year, true),
                }));

            const sum = (f: (r: (typeof perUserReports)[number]) => number): number =>
                perUserReports.reduce((s, r) => s + f(r), 0);
            const totalTax = sum((r) => r.report.totalTax);
            // Marginal du ménage = celui du conjoint au revenu le plus élevé (JAMAIS le marginal du
            // total fusionné) ; le détail par conjoint est dans perUser.
            const topMarginal = perUserReports.reduce((m, r) => Math.max(m, r.report.marginalRate), 0);

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
                taxFederal: Math.round(sum((r) => r.report.fedTax)),
                taxQuebec: Math.round(sum((r) => r.report.qcTax)),
                totalTax: Math.round(totalTax),
                marginalRatePct: Number((topMarginal * 100).toFixed(1)),
                averageRatePct: grossAnnual > 0 ? Number(((totalTax / grossAnnual) * 100).toFixed(1)) : 0,
                netIncome: Math.round(sum((r) => r.report.netIncome)),
                payrollDeductions: {
                    rrq: Math.round(sum((r) => r.report.rrq)),
                    rqap: Math.round(sum((r) => r.report.rqap)),
                    ae: Math.round(sum((r) => r.report.ae)),
                },
                // Détail PAR CONTRIBUABLE (fiscalité individuelle) — c'est le marginal de CHAQUE
                // conjoint qui guide une décision REER, pas celui du ménage.
                perUser: perUserReports.map((r) => ({
                    name: r.name,
                    grossAnnual: Math.round(r.grossAnnual),
                    totalTax: Math.round(r.report.totalTax),
                    marginalRatePct: Number((r.report.marginalRate * 100).toFixed(1)),
                    averageRatePct: Number(r.report.averageRate.toFixed(1)),
                    netIncome: Math.round(r.report.netIncome),
                })),
                celiRoomRemaining: Math.round(celiRoomRemaining),
                reerRoomRemaining: Math.round(reerRoomRemaining),
                currentBalances: {
                    celi: Math.round(breakdown.celi),
                    reer: Math.round(breakdown.reer),
                },
                notes:
                    'Impôt calculé PAR CONTRIBUABLE puis sommé (aucune fusion des revenus du couple). ' +
                    "marginalRatePct = marginal du conjoint au plus haut revenu ; voir perUser pour chacun. " +
                    'celiRoomRemaining/reerRoomRemaining sont des AGRÉGATS du ménage (somme des droits des ' +
                    "2 comptes légaux distincts) — ne pas verser tout l'espace dans le compte d'UNE personne. " +
                    "Estimation sur salaires bruts annualisés ; n'inclut pas tous les crédits/revenus de placement.",
            });
        }),
    );
};
