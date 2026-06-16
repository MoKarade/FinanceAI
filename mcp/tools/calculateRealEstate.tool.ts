import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  calculateMortgagePayment,
  calculatePurchaseCosts,
  runAmortization,
} from '../../services/realEstate';

const inputSchema = {
  price: z.number().positive()
    .describe("Prix d'achat de la propriete en CAD"),
  downPayment: z.number().nonnegative()
    .describe('Mise de fonds en CAD'),
  rate: z.number().min(0).max(20)
    .describe('Taux hypothecaire annuel initial (%, ex: 4.5)'),
  amortization: z.number().int().min(5).max(40)
    .describe("Periode d'amortissement en annees (typique: 25)"),
  renewalRate: z.number().min(0).max(20).optional()
    .describe('Taux de renouvellement projete (% annuel, applique tous les 5 ans). Defaut: rate.'),
  propertyGrowthRate: z.number().min(0).max(20).optional()
    .describe('Appreciation annuelle projetee de la propriete (%). Defaut: 3.'),
  initialRenovations: z.number().nonnegative().optional()
    .describe('Renovations initiales avant emmenagement (CAD). Defaut: 0.'),
  yearlyRenovations: z.number().nonnegative().optional()
    .describe('Renovations annuelles recurrentes (CAD). Defaut: 0.'),
  maxValue: z.number().nonnegative().optional()
    .describe('Plafond de valeur projetee (CAD). 0 = aucun plafond. Defaut: 0.'),
  startYear: z.number().int().min(2000).max(2050).optional()
    .describe('Annee de depart de la projection. Defaut: annee courante.'),
  municipality: z.enum(['montreal', 'reste_qc']).optional()
    .describe("Municipalite du bien pour la taxe de bienvenue. 'montreal' = surtaxe municipale (jusqu'a 4%), 'reste_qc' = bareme provincial (max 2%). Non defini ⇒ repli conservateur Montreal."),
};

export const registerCalculateRealEstate = (server: McpServer): void => {
  server.tool(
    'calculate_real_estate',
    "Analyse complete d'un achat immobilier au Quebec : couts d'acquisition (mise de fonds + taxe de bienvenue selon la municipalite — Montreal jusqu'a 4%, reste du QC max 2% + notaire + inspection + renovations), mensualite hypothecaire, et schema d'amortissement annuel avec renouvellement automatique tous les 5 ans, plafond optionnel sur la valeur.",
    inputSchema,
    async (params) => {
      const purchaseCosts = calculatePurchaseCosts({
        price: params.price,
        downPayment: params.downPayment,
        initialRenovations: params.initialRenovations,
        municipality: params.municipality,
      });

      const mortgage = calculateMortgagePayment({
        price: params.price,
        downPayment: params.downPayment,
        rate: params.rate,
        amortization: params.amortization,
      });

      const amort = runAmortization({
        price: params.price,
        downPayment: params.downPayment,
        rate: params.rate,
        amortization: params.amortization,
        renewalRate: params.renewalRate,
        propertyGrowthRate: params.propertyGrowthRate,
        initialRenovations: params.initialRenovations,
        yearlyRenovations: params.yearlyRenovations,
        maxValue: params.maxValue,
        startYear: params.startYear,
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            currency: 'CAD',
            purchaseCosts,
            mortgage: {
              totalMortgage: mortgage.totalMortgage,
              monthlyPayment: Math.round(mortgage.monthlyMortgage),
              firstMonthInterest: Math.round(mortgage.monthlyInterest),
            },
            projection: {
              totalInterestPaid: Math.round(amort.totalInterest),
              finalPropertyValue: Math.round(amort.finalValue),
              yearlyBreakdown: amort.data,
            },
          }, null, 2),
        }],
      };
    },
  );
};
