// mcp/tools/getNextBestActions.tool.ts
//
// Lot 1 — « prochaines meilleures actions ». Choix d'architecture (cf design §6) :
// dans un connecteur MCP, CLAUDE fait le raisonnement. On ne rappelle donc PAS
// l'API Anthropic ici (pas de clé, moins de surface, moins de coût) : on renvoie
// des SIGNAUX financiers calculés PUREMENT (espace REER/CELI inexploité, dettes à
// taux élevé, cashflow, coussin d'urgence, statut FIRE) et Claude rédige les
// recommandations à partir de ces faits.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppState } from '../../types';
import { computeFinancialSignals } from '../financialSignals';
import { jsonContent, withState, type StateProvider } from './_dataAware';

export const registerGetNextBestActions = (server: McpServer, getState: StateProvider): void => {
    server.tool(
        'get_next_best_actions',
        "Signaux financiers priorisés (calculés sur les VRAIES données) pour guider les prochaines " +
        "actions de l'utilisateur : espace REER/CELI inexploité, dettes à taux élevé, cashflow mensuel, " +
        'coussin de sécurité, statut FIRE. Renvoie des FAITS chiffrés (pas de prose) — à toi, Claude, ' +
        'de formuler les recommandations québécoises concrètes à partir de ces signaux.',
        {},
        async () => withState(getState, (state: AppState) => {
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
    );
};
