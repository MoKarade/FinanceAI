// mcp/tools/getTaxSituation.tool.ts
// Lot 1 — situation fiscale RÉELLE : impôt courant + espace REER/CELI restant.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppState, Transaction, User } from '../../types';
import { calculateFiscalReport } from '../../utils/tax';
import { computeMonthlyActualAverages } from '../../utils/budgetSync';
import { computeHistoricalContributionRoom } from '../../services/projection/setupSimulation';
import { computeAssetBreakdown } from '../../services/portfolio';
import { estimateTaxableInvestmentIncome } from '../../services/taxEstimate';
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
            // [TAX-APP-MCP-BASE] même assiette que l'onglet Impôt : le revenu de placement imposable
            // (non-enreg/crypto, helper PARTAGÉ services/taxEstimate) s'ajoute au revenu imposable, réparti
            // par conjoint comme dans TaxCenter (÷ nombre de users, tuple [User,User] → ratio 1/2).
            // [FISC-PAYROLL-BASE-INVEST] mais l'assiette EMPLOI (RRQ/RQAP/AE) reste le SALAIRE seul (`g`)
            // — le placement ne cotise pas. NB (limite documentée, à traiter au BACKLOG [FISC-SOLO-INVEST-SPLIT])
            // : le split par longueur de tuple laisse la part d'un conjoint SANS brut (exclu de perUserReports,
            // ou payé en net seul) NON imposée — sous-imposition du placement d'un solo/mono-salarié.
            const taxableAddOn = estimateTaxableInvestmentIncome(
                (state.assets ?? []) as AppState['assets'],
                state.fxRates ?? {},
            );
            const splitRatio = users.length > 0 ? 1 / users.length : 1;
            const perUserReports = activeUsers
                .map((u) => ({ user: u, grossAnnual: (u.grossSalary || 0) * 12 }))
                .filter(({ grossAnnual: g }) => g > 0)
                .map(({ user: u, grossAnnual: g }) => {
                    // Assiette IMPOSABLE = salaire + part de placement ; assiette EMPLOI = salaire (`g`).
                    const taxableBase = g + taxableAddOn * splitRatio;
                    return {
                        name: u.name || null,
                        grossAnnual: g,
                        taxableBase,
                        salarySource: u.salarySource,
                        report: calculateFiscalReport(
                            taxableBase,
                            u.rrspContributed || 0, u.fhsaBalance || 0, year, true,
                            undefined, g,
                        ),
                    };
                });

            // [TAX-REAL-SPENDING] mêmes moyennes que l'app (utils/budgetSync, source unique).
            const realAverages = computeMonthlyActualAverages((state.transactions ?? []) as Transaction[]);

            const sum = (f: (r: (typeof perUserReports)[number]) => number): number =>
                perUserReports.reduce((s, r) => s + f(r), 0);
            const totalTax = sum((r) => r.report.totalTax);
            // [code-reviewer] cohérence : totalTax/netIncome portent sur salaire+placement → le taux MOYEN
            // et la reconstructabilité doivent utiliser la MÊME assiette (sinon averageRatePct sur-estimé
            // et netIncome ≠ grossAnnualIncome − totalTax). taxableInvestmentIncome = part réellement imposée.
            const totalTaxableIncome = sum((r) => r.taxableBase);
            const taxedInvestmentIncome = Math.max(0, totalTaxableIncome - sum((r) => r.grossAnnual));
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
                // [TAX-APP-MCP-BASE] revenu de placement imposable estimé (non-enreg/crypto) inclus dans
                // l'assiette d'impôt → exposé pour que netIncome soit reconstructible.
                taxableInvestmentIncome: Math.round(taxedInvestmentIncome),
                taxFederal: Math.round(sum((r) => r.report.fedTax)),
                taxQuebec: Math.round(sum((r) => r.report.qcTax)),
                totalTax: Math.round(totalTax),
                marginalRatePct: Number((topMarginal * 100).toFixed(1)),
                // Taux MOYEN sur l'assiette imposable RÉELLE (salaire + placement), cohérent avec totalTax.
                averageRatePct: totalTaxableIncome > 0 ? Number(((totalTax / totalTaxableIncome) * 100).toFixed(1)) : 0,
                netIncome: Math.round(sum((r) => r.report.netIncome)),
                payrollDeductions: {
                    rrq: Math.round(sum((r) => r.report.rrq)),
                    rqap: Math.round(sum((r) => r.report.rqap)),
                    ae: Math.round(sum((r) => r.report.ae)),
                },
                // Détail PAR CONTRIBUABLE (fiscalité individuelle) — c'est le marginal de CHAQUE
                // conjoint qui guide une décision REER, pas celui du ménage. [TAX-DETAIL] retenues
                // détaillées + provenance du salaire (fiche de paie = source unique, demande Marc).
                perUser: perUserReports.map((r) => ({
                    name: r.name,
                    grossAnnual: Math.round(r.grossAnnual),
                    totalTax: Math.round(r.report.totalTax),
                    marginalRatePct: Number((r.report.marginalRate * 100).toFixed(1)),
                    averageRatePct: Number(r.report.averageRate.toFixed(1)),
                    netIncome: Math.round(r.report.netIncome),
                    netMonthly: Math.round(r.report.netIncome / 12),
                    withholdings: {
                        federal: Math.round(r.report.fedTax),
                        quebec: Math.round(r.report.qcTax),
                        rrq: Math.round(r.report.rrq),
                        rqap: Math.round(r.report.rqap),
                        ae: Math.round(r.report.ae),
                    },
                    salarySource: r.salarySource ?? null,
                })),
                // [TAX-REAL-SPENDING] Réel des transactions (mois pleins) — « ce que je gagne et
                // dépense » aussi côté connecteur, mêmes chiffres que l'app (source unique).
                realMonthlyAverages: {
                    income: realAverages.incomeAvg,
                    expenses: realAverages.expenseAvg,
                    net: realAverages.incomeAvg - realAverages.expenseAvg,
                    fullMonths: realAverages.fullMonths,
                },
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
                    "Assiette imposable = salaires bruts annualisés + revenu de placement IMPOSABLE ESTIMÉ du " +
                    "non-enregistré/crypto (dividendes ~2 % + gains ~7 %×50 %, champ taxableInvestmentIncome) ; les " +
                    "cotisations RRQ/RQAP/AE portent sur le SALAIRE seul. N'inclut pas : revenu locatif, tous les crédits. " +
                    'perUser.withholdings = retenues détaillées ; perUser.salarySource = provenance du salaire ' +
                    '(fiche de paie = source unique — null = saisie manuelle) ; realMonthlyAverages = réel des ' +
                    'transactions (mois pleins, hors transferts), mêmes chiffres que l\'onglet Budget.',
            });
        }),
    );
};
