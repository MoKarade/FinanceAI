// api/lia/ask.ts — fonction Vercel (runtime Node.js) : la question de Marc à LIA, relayée au hub (cf api/_lib/lia.ts).
// Chemin STATIQUE exact (Vercel ne route pas les attrape-tout sur ce projet Vite, cf tests/api/relayRouteStatique.test.ts).
// Extension `.js` OBLIGATOIRE sur les imports relatifs : le runtime Node charge api/ en ESM natif.
import { repondreLiaAsk } from '../_lib/lia.js';
import { signalerErreur } from '../_lib/sentry.js';

export const config = { runtime: 'nodejs' };

export default {
    fetch(request: Request): Promise<Response> {
        // Ceinture finale : aucune exception ne sort en 500 plateforme brut. Trace = nom d'erreur SEUL
        // (jamais le message : il pourrait porter la question de Marc).
        return repondreLiaAsk(request).catch(async (e) => {
            console.error('[lia] exception non prévue:', (e as { name?: string })?.name ?? 'Error');
            await signalerErreur(e, 'lia-ask');
            return new Response(JSON.stringify({ error: 'erreur_interne' }), {
                status: 500,
                headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
            });
        });
    },
};
