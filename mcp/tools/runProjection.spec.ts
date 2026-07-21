// mcp/tools/runProjection.spec.ts
// [ARCH-AITOOLS-SPLIT] SPEC pur (browser-safe) — logique VERBATIM de l'ancien tool, sans SDK MCP.
// Enregistrement serveur : runProjection.tool.ts. Tool STATELESS (calculateur pur, ignore l'état).

import { z } from 'zod';
import type { ReadToolSpec } from './_toolSpec';

// Note Sprint 1 : projection simplifiee par capitalisation composee.
// Le moteur complet calculateFutureProjection (services/projection.ts) demande
// un SimulationParams de 30+ champs (immobilier, retraite, evenements de vie,
// Monte Carlo, scenarios). On l'exposera en Sprint 2 avec un schema dedie.

const inputSchema = {
  startingNetWorth: z.number()
    .describe('Patrimoine de depart en CAD (cash + investissements)'),
  monthlySavings: z.number()
    .describe('Epargne mensuelle moyenne en CAD'),
  years: z.number().int().min(1).max(50)
    .describe('Horizon de projection en annees'),
  returnRate: z.number().min(0).max(30).optional()
    .describe('Rendement annuel moyen attendu (%). Defaut: 7.'),
  inflationRate: z.number().min(0).max(15).optional()
    .describe("Inflation annuelle (%) pour calculer le pouvoir d'achat reel. Defaut: 2.5."),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

// `satisfies` (pas une annotation) : préserve les types CONCRETS de inputSchema → server.tool
// infère les bons args et le handler reste fortement typé (une annotation élargirait le shape).
export const runProjectionSpec = {
  kind: 'stateless',
  name: 'run_projection',
  description:
    "CALCULATEUR GÉNÉRIQUE de capitalisation composée sur les paramètres FOURNIS — ne lit PAS les données réelles de l'utilisateur (pour SA vraie projection : get_projection ; pour son plan de retraite : get_retirement_outlook ; pour un scénario sur SES données : simulate_what_if). Renvoie l'évolution annuelle du patrimoine en valeur nominale ET réelle (ajustée inflation), plus un sommaire (contributions totales, croissance, CAGR).",
  inputSchema,
  handler: async ({ startingNetWorth, monthlySavings, years, returnRate, inflationRate }, _getState) => {
    const r = (returnRate ?? 7) / 100;
    const inf = (inflationRate ?? 2.5) / 100;
    const yearlyContrib = monthlySavings * 12;

    const timeline: Array<{
      year: number;
      nominal: number;
      real: number;
      cumulativeContributions: number;
    }> = [];

    let nominal = startingNetWorth;
    let cumulativeContrib = 0;

    for (let y = 1; y <= years; y++) {
      nominal = nominal * (1 + r) + yearlyContrib;
      cumulativeContrib += yearlyContrib;
      const real = nominal / Math.pow(1 + inf, y);
      timeline.push({
        year: y,
        nominal: Math.round(nominal),
        real: Math.round(real),
        cumulativeContributions: Math.round(cumulativeContrib),
      });
    }

    const final = timeline[timeline.length - 1];
    const totalGrowth = (final?.nominal ?? startingNetWorth) - startingNetWorth - cumulativeContrib;
    const cagr = startingNetWorth > 0 && final
      ? Math.pow(final.nominal / startingNetWorth, 1 / years) - 1
      : 0;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          currency: 'CAD',
          inputs: {
            startingNetWorth,
            monthlySavings,
            years,
            returnRate: returnRate ?? 7,
            inflationRate: inflationRate ?? 2.5,
          },
          summary: {
            finalNetWorthNominal: final?.nominal ?? startingNetWorth,
            finalNetWorthReal: final?.real ?? startingNetWorth,
            totalContributions: Math.round(cumulativeContrib),
            totalGrowthFromReturns: Math.round(totalGrowth),
            cagrPercent: Number((cagr * 100).toFixed(2)),
          },
          yearlyTimeline: timeline,
        }, null, 2),
      }],
    };
  },
} satisfies ReadToolSpec<Args>;
