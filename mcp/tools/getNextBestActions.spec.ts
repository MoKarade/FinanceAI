// mcp/tools/getNextBestActions.spec.ts
// [ARCH-AITOOLS-SPLIT] SPEC pur (browser-safe) — logique VERBATIM de l'ancien tool, sans SDK MCP.
// Enregistrement serveur : getNextBestActions.tool.ts. Parité app/MCP : tests/aiTools/registryParity.
//
// Lot 1 — « prochaines meilleures actions ». Choix d'architecture (cf design §6) :
// dans un connecteur MCP, CLAUDE fait le raisonnement. On ne rappelle donc PAS
// l'API Anthropic ici (pas de clé, moins de surface, moins de coût) : on renvoie
// des SIGNAUX financiers calculés PUREMENT (espace REER/CELI inexploité, dettes à
// taux élevé, cashflow, coussin d'urgence, statut FIRE) et Claude rédige les
// recommandations à partir de ces faits.

import type { AppState } from '../../types';
import { computeFinancialSignals } from '../financialSignals';
import { jsonContent, withState } from './_dataAware';
import type { ReadToolSpec } from './_toolSpec';

// `satisfies` (pas une annotation) : préserve les types concrets → inférence server.tool correcte.
export const getNextBestActionsSpec = {
    kind: 'read',
    name: 'get_next_best_actions',
    description:
        "Signaux financiers priorisés (calculés sur les VRAIES données) pour guider les prochaines " +
        "actions de l'utilisateur : espace REER/CELI inexploité, dettes à taux élevé, cashflow mensuel, " +
        'coussin de sécurité, statut FIRE. Renvoie des FAITS chiffrés (pas de prose) — à toi, Claude, ' +
        'de formuler les recommandations québécoises concrètes à partir de ces signaux.',
    inputSchema: {},
    handler: async (_args, getState) => withState(getState, (state: AppState) => {
        // [HUB-01] calcul extrait dans mcp/financialSignals.ts, partagé avec /hub/summary.
        const { overview, celiRoom, reerRoom, signals } = computeFinancialSignals(state);

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
} satisfies ReadToolSpec<Record<string, never>>;
