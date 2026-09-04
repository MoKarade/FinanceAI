// mcp/http/routesPlanifiees.ts
// [GODFILE-MCPHTTP] Routes hors-protocole du serveur HTTP MCP : les déclencheurs planifiés
// (POST /refresh, POST /fintable-sync — secrets Bearer DISTINCTS, comparés en temps constant)
// et GET /hub/summary (contrat hub). Extraites telles quelles de `mcp/http.ts` ; le STORE
// d'état arrive en paramètre (il vivait en closure dans `startHttpServer`).

import type { IncomingMessage, ServerResponse } from 'node:http';
import { HUB_TOKEN_HEADER, serveSummary } from '@mokarade/hub-contract/endpoint';
import type { ResolvedState } from '../bootstrap';
import { buildHubSummary, errorHubSummary } from '../hubSummary';
import { runPriceRefresh } from '../refreshPrices';
import { runFintableSync } from '../runFintableSync';
import { FintableClient } from '../../services/fintable/client';
import type { FintableMappingConfig } from '../../services/fintable/mapSnapshot';
import { isStateConflictError } from '../state/stateErrors';
import { configureMarketDataProvider } from '../../services/marketData';
import { HUB_NO_STORE, hubTokensMatch, sendJson } from './plomberie';

/** Le store d'état résolu (blob local ou Drive) — même objet que celui du serveur. */
type StoreEtat = ResolvedState['store'];

// [HUB-REFRESH-CRON] POST /refresh — rafraîchit les prix de marché dans le blob Drive, sans
// ouvrir l'app. Déclenché par un job planifié EXTERNE (GitHub Actions), authentifié par un
// secret dédié (Authorization: Bearer). Réponses : 200 { ok:true, saved, refreshed[], skipped[] }
// au succès ; 200 { ok:false, conflict:true } si l'app a poussé entre-temps (transitoire, le
// prochain tick réessaie) ; 5xx sur panne RÉELLE (Drive KO, jeton révoqué, coffre chiffré) pour
// que le cron rougisse au lieu de rester vert sur des prix figés. Ne modifie QUE les cours.
export const handleRefresh = (req: IncomingMessage, res: ServerResponse, store: StoreEtat, refreshSecret: string, finnhubKey?: string): void => {
    if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'POST uniquement.' }, HUB_NO_STORE);
        return;
    }
    const header = req.headers.authorization;
    const provided = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!provided || !hubTokensMatch(provided, refreshSecret)) {
        sendJson(res, 401, { error: 'Authorization: Bearer absent ou invalide.' }, HUB_NO_STORE);
        return;
    }
    if (finnhubKey) configureMarketDataProvider({ finnhubKey });
    runPriceRefresh(store)
        .then((outcome) => sendJson(res, 200, { ok: true, ...outcome }, HUB_NO_STORE))
        .catch((err: unknown) => {
            const reason = err instanceof Error ? err.message : String(err);
            // Conflit OCC (l'app a poussé entre-temps) = TRANSITOIRE, rien d'écrasé → 200 { ok:false,
            // conflict:true } : le prochain tick réessaie, le cron ne doit pas rougir. Toute AUTRE
            // erreur (source non inscriptible, jeton Drive révoqué, coffre chiffré, Drive KO) est une
            // panne RÉELLE → 5xx, pour que le job planifié rougisse et alerte au lieu de rester vert
            // à jamais sur des prix qui ne se rafraîchissent plus (silence = pire que l'erreur).
            if (isStateConflictError(err)) {
                sendJson(res, 200, { ok: false, conflict: true, error: reason }, HUB_NO_STORE);
                return;
            }
            console.error('[FinanceAI MCP http] /refresh : échec —', reason);
            sendJson(res, 503, { ok: false, error: reason }, HUB_NO_STORE);
        });
};

// [FINTABLE-3] POST /fintable-sync — synchronise transactions/soldes/dettes depuis Fintable dans
// le blob Drive, sans ouvrir l'app. Déclenché par un cron EXTERNE (Cloud Scheduler), authentifié
// par un secret DÉDIÉ (distinct de FINANCEAI_REFRESH_SECRET — périmètre différent : celui-ci
// AUTORISE l'écriture de transactions/soldes réels, pas seulement des cours de marché). Réponses :
// 200 { ok:true, report } au succès (report = FintableSyncReport, TOUJOURS persisté aussi dans
// AppState — visible dans l'app sans notification proactive, choix Marc) ; 200 { ok:false,
// conflict:true } si l'app a poussé entre-temps (transitoire, le prochain tick réessaie) ; 5xx sur
// panne RÉELLE (Fintable KO/jeton révoqué, Drive KO) pour que le cron rougisse au lieu de rester
// vert sur une sync qui ne progresse plus.
export const handleFintableSync = (
    req: IncomingMessage, res: ServerResponse, store: StoreEtat, syncSecret: string,
    fintableToken: string | undefined, fintableRoles: FintableMappingConfig['roles'] | undefined,
): void => {
    if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'POST uniquement.' }, HUB_NO_STORE);
        return;
    }
    const header = req.headers.authorization;
    const provided = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!provided || !hubTokensMatch(provided, syncSecret)) {
        sendJson(res, 401, { error: 'Authorization: Bearer absent ou invalide.' }, HUB_NO_STORE);
        return;
    }
    if (!fintableToken) {
        sendJson(res, 503, { ok: false, error: 'FINTABLE_TOKEN absent : sync impossible.' }, HUB_NO_STORE);
        return;
    }
    const client = new FintableClient({ token: fintableToken });
    runFintableSync(store, { token: fintableToken, roles: fintableRoles ?? {}, client })
        .then((report) => sendJson(res, 200, { ok: true, report }, HUB_NO_STORE))
        .catch((err: unknown) => {
            const reason = err instanceof Error ? err.message : String(err);
            // Conflit OCC = TRANSITOIRE (cf /refresh) : rien d'écrasé, le prochain tick réessaie.
            if (isStateConflictError(err)) {
                sendJson(res, 200, { ok: false, conflict: true, error: reason }, HUB_NO_STORE);
                return;
            }
            console.error('[FinanceAI MCP http] /fintable-sync : échec —', reason);
            sendJson(res, 503, { ok: false, error: reason }, HUB_NO_STORE);
        });
};

// [HUB-01] GET /hub/summary — résumé conforme au contrat hub, données réelles.
//
// La mécanique (405, jeton comparé en temps constant, `no-store`, validation avant
// émission) vient de `serveSummary` (`@mokarade/hub-contract/endpoint`), écrite une fois
// pour toutes les apps. Elle est SANS framework, ce qui est exactement ce qu'il faut
// ici : ce serveur-ci est un `node:http` nu, pas un route handler Next.
//
// ⚠️ DEUX ÉCARTS VOULUS, tous deux préservés :
//
// 1. Le 503 « hub désactivé » de `serveSummary` ne peut pas se produire : cette route
//    n'est CÂBLÉE que si `options.hubToken` existe (voir le routeur plus bas). Sans
//    jeton, l'URL n'existe pas du tout — 404, et c'est plus discret qu'un 503 qui
//    confirmerait l'existence du endpoint à qui le sonde.
// 2. Un échec de lecture d'état renvoie un summary `status: "error"` en **HTTP 200**,
//    pas un 500 : le widget du hub affiche la panne au lieu de traiter l'app comme
//    injoignable. `serveSummary` répondrait 500 si son `build` JETAIT — d'où le `catch`
//    ci-dessous, qui EST le contrat et ne doit pas disparaître.
export const handleHubSummary = (req: IncomingMessage, res: ServerResponse, store: StoreEtat, hubToken: string): void => {
    const jeton = req.headers[HUB_TOKEN_HEADER];
    void serveSummary(
        { method: req.method ?? 'GET', token: typeof jeton === 'string' ? jeton : null },
        {
            expectedToken: hubToken,
            build: () =>
                store
                    .get()
                    .then((appState) => buildHubSummary(appState))
                    .catch((err: unknown) => {
                        const reason = err instanceof Error ? err.message : String(err);
                        console.error('[FinanceAI MCP http] /hub/summary : état indisponible —', reason);
                        return errorHubSummary(reason);
                    }),
        },
    ).then(({ status, headers, body }) => {
        res.writeHead(status, headers);
        res.end(body);
    });
};
