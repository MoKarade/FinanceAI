// api/claude/[...path].ts — fonction Vercel (runtime Node.js) : relais BYOK Anthropic (cf api/_lib/relay.ts).
// Catch-all : le SDK client (baseURL = <origine>/api/claude) appelle /api/claude/v1/messages ;
// toute autre route est rejetée 404 par le relais. Signature Web-standard → portable (dev Vite).
//
// [IA-LOCALE] Runtime Node.js (plus Edge) : Edge doit commencer à répondre en 25 s, or un appel non-flux
// servi par l'IA locale puis, en cas d'échec, rejoué sur Anthropic peut dépasser ce délai. Node sur
// Fluid compute n'a pas cette contrainte (durée max 300 s par défaut) et Vercel recommande Node.
// L'annulation client (request.signal) est activée par `supportsCancellation` dans vercel.json.
import { relayClaude, anthropicError } from '../_lib/relay';

export const config = { runtime: 'nodejs' };

export default {
    fetch(request: Request): Promise<Response> {
        // Ceinture finale : AUCUNE exception ne doit sortir du contrat « enveloppe Anthropic »
        // (sinon le SDK client reçoit un 500 plateforme Vercel brut, opaque). Trace = nom d'erreur
        // SEUL (jamais le message brut : il peut porter des détails de requête).
        return relayClaude(request).catch((e) => {
            console.error('[relay] exception non prévue:', (e as { name?: string })?.name ?? 'Error');
            return anthropicError(500, 'api_error', 'Erreur interne du relais.');
        });
    },
};
