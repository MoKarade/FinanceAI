// api/claude/v1/messages.ts — fonction Vercel (runtime Node.js) : relais BYOK Anthropic (cf api/_lib/relay.ts).
// Le SDK client (baseURL = <origine>/api/claude) appelle /api/claude/v1/messages : c'est la SEULE route du
// relais, d'où un fichier au chemin EXACT.
//
// [IA-LOCALE-ROUTE] 2026-09-23 : l'ancien fichier « attrape-tout » `api/claude/[...path].ts` n'était PAS
// routé par Vercel sur ce projet Vite (hors Next.js) : la requête tombait sur la réécriture SPA
// `/(.*) → /index.html` et rendait 405. Mesuré en prod (POST → 405, GET → index.html) ; le relais
// n'avait jamais été allumé avant, le défaut était donc latent depuis P0-PROXY. Un chemin statique est
// servi par le système de fichiers AVANT toute réécriture.
//
// [IA-LOCALE] Runtime Node.js (plus Edge) : Edge doit commencer à répondre en 25 s, or un appel non-flux
// servi par l'IA locale puis, en cas d'échec, rejoué sur Anthropic peut dépasser ce délai. Node sur
// Fluid compute n'a pas cette contrainte (durée max 300 s par défaut) et Vercel recommande Node.
// L'annulation client (request.signal) est activée par `supportsCancellation` dans vercel.json.
// Extension `.js` OBLIGATOIRE : le runtime Node charge ces fichiers en ESM natif (package.json
// "type": "module"), qui ne résout pas les imports sans extension (mesuré : ERR_MODULE_NOT_FOUND).
import { relayClaude, anthropicError } from '../../_lib/relay.js';

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
