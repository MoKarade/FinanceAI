// api/yahoo/search.ts — proxy gardé de la recherche de symboles Yahoo (cf api/_lib/proxies.ts). vercel.json y réécrit /api/search/yahoo.
import { proxyYahooRecherche } from '../_lib/proxies.js';

export const config = { runtime: 'nodejs' };

export default {
    fetch(request: Request): Promise<Response> {
        return proxyYahooRecherche(request).catch((e) => {
            console.error('[proxy] exception non prévue:', (e as { name?: string })?.name ?? 'Error');
            return new Response(JSON.stringify({ error: 'Erreur interne.' }), { status: 500, headers: { 'content-type': 'application/json' } });
        });
    },
};
