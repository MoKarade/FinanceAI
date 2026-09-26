// api/yahoo/history.ts — proxy gardé de l'historique Yahoo (cf api/_lib/proxies.ts). Chemin STATIQUE : vercel.json y
// réécrit /api/history/yahoo/:symbol. Extension `.js` OBLIGATOIRE (ESM natif du runtime Node, cf api/claude/v1/messages.ts).
import { proxyYahooHistorique } from '../_lib/proxies.js';

export const config = { runtime: 'nodejs' };

export default {
    fetch(request: Request): Promise<Response> {
        return proxyYahooHistorique(request).catch((e) => {
            console.error('[proxy] exception non prévue:', (e as { name?: string })?.name ?? 'Error');
            return new Response(JSON.stringify({ error: 'Erreur interne.' }), { status: 500, headers: { 'content-type': 'application/json' } });
        });
    },
};
