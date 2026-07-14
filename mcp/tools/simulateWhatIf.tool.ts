// mcp/tools/simulateWhatIf.tool.ts
//
// [MCP-WHATIF] — « si j'achète une voiture demain, comment ça affecte mes
// finances ? » sur les VRAIES données. Traduit les changements hypothétiques
// vers les structures que le moteur consomme déjà (mcp/whatIf.ts), roule le
// VRAI moteur deux fois (état réel vs état réel + changements) et renvoie les
// deltas + les deux séries annuelles pour tracer des graphiques EXACTS.
// Aucun chiffre inventé : Claude reçoit les points du moteur, il n'en calcule aucun.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppState } from '../../types';
import { calculateFutureProjection } from '../../services/projection';
import type { ProjectionResult } from '../../services/projection/types';
import {
    applyWhatIfChanges,
    buildWhatIfParams,
    compareAtHorizons,
    extractYearlySeries,
    fireAgeOf,
    type WhatIfChange,
} from '../whatIf';
import { jsonContent, withState, type StateProvider } from './_dataAware';

const financingSchema = z.object({
    downPayment: z.number().finite().min(0).describe('Mise de fonds comptant ($)'),
    ratePct: z.number().finite().min(0).max(50).describe('Taux annuel du prêt (%)'),
    termYears: z.number().int().min(1).max(40).describe('Durée du prêt (années)'),
});

const changeSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('achat_ponctuel'),
        label: z.string().min(1).describe('Nom de l’achat (ex. « Voiture »)'),
        amount: z.number().finite().positive().describe('Coût total ($ d’aujourd’hui)'),
        monthsFromNow: z.number().int().min(0).max(600).optional()
            .describe('Dans combien de mois (défaut 1 = le mois prochain)'),
        financing: financingSchema.optional()
            .describe('Si financé : mise de fonds + prêt amorti au lieu d’un débit comptant'),
    }).describe('Grosse dépense ponctuelle : voiture, réno, voyage…'),
    z.object({
        kind: z.literal('salaire'),
        userIndex: z.union([z.literal(0), z.literal(1)]).optional().describe('0 = premier conjoint (défaut), 1 = second'),
        changePct: z.number().finite().min(-100).max(500).optional().describe('Variation en % (ex. 10 pour +10 %)'),
        newGrossMonthly: z.number().finite().min(0).optional().describe('Nouveau salaire BRUT MENSUEL ($)'),
        newNetMonthly: z.number().finite().min(0).optional()
            .describe('Nouveau salaire NET MENSUEL ($) — sinon ajusté proportionnellement au brut'),
    }).describe('Changement de salaire : promotion, temps partiel, perte…'),
    z.object({
        kind: z.literal('depense_recurrente'),
        label: z.string().min(1),
        monthlyAmount: z.number().finite().describe('$/mois — positif = dépense EN PLUS, négatif = réduction'),
    }).describe('Dépense récurrente en plus ou en moins ($/mois)'),
    z.object({
        kind: z.literal('nouvelle_dette'),
        label: z.string().min(1),
        amount: z.number().finite().positive().describe('Montant emprunté ($)'),
        ratePct: z.number().finite().min(0).max(50).describe('Taux annuel (%)'),
        termYears: z.number().int().min(1).max(40).optional().describe('Amortissement (années, défaut 5)'),
        monthlyPayment: z.number().finite().positive().optional().describe('Paiement mensuel imposé (sinon calculé)'),
        category: z.enum(['CreditCard', 'Car', 'Student', 'Personal', 'Other']).optional(),
    }).describe('Nouvel emprunt à la consommation'),
    z.object({
        kind: z.literal('achat_immobilier'),
        price: z.number().finite().positive().describe('Prix d’achat ($)'),
        downPayment: z.number().finite().min(0).optional().describe('Mise de fonds absolue ($)'),
        downPaymentPct: z.number().finite().min(0).max(100).optional().describe('Mise de fonds en % du prix (défaut 20)'),
        ratePct: z.number().finite().min(0).max(25).describe('Taux hypothécaire annuel (%)'),
        amortYears: z.number().int().min(1).max(35).optional().describe('Amortissement (années, défaut 25)'),
        monthsFromNow: z.number().int().min(0).max(600).optional().describe('Dans combien de mois (défaut 3)'),
        isPrimaryResidence: z.boolean().optional().describe('Résidence principale (défaut true)'),
        municipality: z.enum(['montreal', 'reste_qc']).optional()
            .describe('Municipalité (taxe de bienvenue) — absent = repli conservateur Montréal'),
        monthlyCharges: z.number().finite().min(0).optional()
            .describe('Charges mensuelles non récupérables : taxes, chauffage, condo ($/mois)'),
    }).describe('Achat immobilier (résidence ou locatif)'),
]);

const inputSchema = {
    changes: z.array(changeSchema).min(1)
        .describe('Le ou les changements hypothétiques à simuler (combinables : ex. achat + nouvelle dette)'),
    years: z.number().int().min(1).max(50).optional()
        .describe('Horizon en années (défaut : l’horizon configuré dans l’app)'),
    includeSeries: z.boolean().default(true)
        .describe('Inclure les séries annuelles (base + scénario) pour tracer des graphiques'),
};

export const registerSimulateWhatIf = (server: McpServer, getState: StateProvider): void => {
    server.tool(
        'simulate_what_if',
        'Simule un changement HYPOTHÉTIQUE (« si j’achète une voiture demain ? », « si mon salaire baisse de 20 % ? », ' +
        '« si j’achète un condo à 450 k$ ? ») sur les VRAIES données de l’utilisateur : le moteur complet de FinanceAI ' +
        'tourne deux fois (trajectoire actuelle vs trajectoire avec le changement) et renvoie les écarts de patrimoine ' +
        'à 1/2/5/10/20 ans, l’impact sur l’âge FIRE et les impôts, plus les deux séries annuelles pour tracer des ' +
        'graphiques comparés. IMPORTANT : présente toujours à l’utilisateur les hypothèses (`assumptions`) retournées, ' +
        'et n’invente JAMAIS de chiffre — tout vient du moteur.',
        inputSchema,
        async ({ changes, years, includeSeries }) => withState(getState, (state: AppState) => {
            const now = new Date();
            const horizon = years ?? state.projection?.years ?? 25;

            const application = applyWhatIfChanges(state, changes as WhatIfChange[], now, { horizonMonths: horizon * 12 });

            // Deux runs DÉTERMINISTES du vrai moteur, même `now` (aucune divergence
            // d'horloge entre base et scénario), scénario BASE, sans Monte Carlo.
            const baseParams = buildWhatIfParams(state, now, horizon, 0);
            const whatIfParams = buildWhatIfParams(application.state, now, horizon, application.monthlySavingsDelta);
            const baseRun: ProjectionResult = calculateFutureProjection(baseParams, false, 0);
            const whatIfRun: ProjectionResult = calculateFutureProjection(whatIfParams, false, 0);

            const baseChart = baseRun.chartData ?? [];
            const whatIfChart = whatIfRun.chartData ?? [];

            const summarize = (run: ProjectionResult, chart: typeof baseChart) => {
                const last = chart[chart.length - 1];
                return {
                    finalNetWorthNominal: Math.round(last?.NetWorth ?? run.finalNetWorth ?? 0),
                    finalNetWorthReal: Math.round(last?.realNetWorth ?? last?.NetWorth ?? 0),
                    fireAge: fireAgeOf(chart),
                    // [PROJ-TAXPAID-LABEL] — même rename que get_projection : ce compteur moteur
                    // n'agrège que les régularisations d'avril (négatif = remboursements REER),
                    // PAS l'impôt total payé. Jamais exposé sous un nom trompeur.
                    netTaxSettlements: Math.round(run.totalTaxesPaid ?? 0),
                    minNetWorth: Math.round(run.minNetWorth ?? 0),
                };
            };

            const base = summarize(baseRun, baseChart);
            const whatIf = summarize(whatIfRun, whatIfChart);

            return jsonContent({
                currency: 'CAD',
                horizonYears: horizon,
                changesApplied: application.applied,
                assumptions: application.assumptions,
                base,
                whatIf,
                impact: {
                    finalNetWorthDelta: whatIf.finalNetWorthNominal - base.finalNetWorthNominal,
                    finalNetWorthDeltaReal: whatIf.finalNetWorthReal - base.finalNetWorthReal,
                    // Delta des RÉGULARISATIONS fiscales (avril), pas de l'impôt total — cf note.
                    netTaxSettlementsDelta: whatIf.netTaxSettlements - base.netTaxSettlements,
                    fireAgeDelta: (base.fireAge != null && whatIf.fireAge != null)
                        ? whatIf.fireAge - base.fireAge
                        : null,
                },
                netTaxSettlementsNote:
                    "netTaxSettlements = somme des régularisations fiscales d'avril (négatif = " +
                    "remboursements nets, ex. grosses cotisations REER) — PAS l'impôt total payé. " +
                    'Pour la charge fiscale courante : get_tax_situation.',
                deltasByHorizon: compareAtHorizons(baseChart, whatIfChart, horizon),
                series: includeSeries
                    ? { base: extractYearlySeries(baseChart), whatIf: extractYearlySeries(whatIfChart) }
                    : null,
            });
        }),
    );
};
