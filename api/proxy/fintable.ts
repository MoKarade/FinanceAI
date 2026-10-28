// api/proxy/fintable.ts — proxy gardé de l'API Fintable (cf api/_lib/proxies.ts). vercel.json y réécrit /api/fintable/:path*.
import { proxyFintable } from '../_lib/proxies.js';
import { signalerErreur } from '../_lib/sentry.js';

export const config = { runtime: 'nodejs' };

export default {
    fetch(request: Request): Promise<Response> {
        return proxyFintable(request).catch(async (e) => {
            console.error('[proxy] exception non prévue:', (e as { name?: string })?.name ?? 'Error');
            await signalerErreur(e, 'proxy-fintable');
            return new Response(JSON.stringify({ error: 'Erreur interne.' }), { status: 500, headers: { 'content-type': 'application/json' } });
        });
    },
};
