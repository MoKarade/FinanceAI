// api/claude/[...path].ts — fonction Vercel EDGE : relais BYOK Anthropic (cf api/_lib/relay.ts).
// Catch-all : le SDK client (baseURL = <origine>/api/claude) appelle /api/claude/v1/messages ;
// toute autre route est rejetée 404 par le relais. Signature Web-standard → portable (dev Vite).
import { relayClaude, anthropicError } from '../_lib/relay';

export const config = { runtime: 'edge' };

export default function handler(request: Request): Promise<Response> {
    // Ceinture finale : AUCUNE exception ne doit sortir du contrat « enveloppe Anthropic »
    // (sinon le SDK client reçoit un 500 plateforme Vercel brut, opaque). Trace = nom d'erreur
    // SEUL (jamais le message brut : il peut porter des détails de requête).
    return relayClaude(request).catch((e) => {
        console.error('[relay] exception non prévue:', (e as { name?: string })?.name ?? 'Error');
        return anthropicError(500, 'api_error', 'Erreur interne du relais.');
    });
}
