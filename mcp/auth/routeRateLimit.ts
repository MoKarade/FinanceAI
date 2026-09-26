// mcp/auth/routeRateLimit.ts
//
// [MCP-RATE-LIMIT] Limites de débit des routes du serveur MCP autres que `/oauth/authorize` : `/mcp`, `/refresh`,
// `/fintable-sync`, `/hub/summary`, `/vehicule/bail`. Audit sécurité P3-P6 (moyenne 8) : aucune borne d'abus ni de coût
// (chaque `/refresh` appelle des fournisseurs de cours, chaque `/fintable-sync` lit puis écrit l'état sur Drive).
//
// RÈGLE CARDINALE (avis pole-securite) : ON VÉRIFIE D'ABORD, ON REFUSE APRÈS. Une requête qui porte un secret VALIDE
// n'est JAMAIS bloquée par un compteur d'échecs, et une requête sans secret valide ne consomme JAMAIS le budget de
// volume légitime. Le serveur Cloud Run est public : un blocage global sur échecs (20 requêtes invalides par 15 min)
// serait un déni de service ouvert à tout Internet, pour aucun gain (les secrets font ≥ 16 caractères, forcer est
// hors de portée). C'est donc l'appelant (`mcp/http.ts`) qui vérifie le secret et passe `authentifie` à `enter`.
//
// Deux compteurs :
//  1. VOLUME des appels AUTHENTIFIÉS, par route (global : un seul utilisateur légitime). Protège le COÛT (Drive,
//     fournisseurs de cours) si un secret fuitait ou si un client boucle. Ce budget ne voit que des appels valides.
//  2. ÉCHECS d'authentification, PAR ADRESSE (`adresseClient`), seuil haut : borne le bruit d'un scanneur sans jamais
//     toucher un autre appelant ni un appelant muni d'un secret valide. Table bornée (`MAX_ADRESSES`).
//
// ⚠️ LIMITES : mémoire du processus (un cold-start repart de zéro, même compromis que `rateLimit.ts`) ; l'adresse vient de
// `X-Forwarded-For`, dont Cloud Run AJOUTE l'adresse réelle en DERNIER : on ne lit que ce dernier élément (les précédents
// sont fournis par le client). Module PUR : horloge injectable, aucun réseau.

import { makeAttemptLimiter, type AttemptLimiter } from './rateLimit';

export type LimitedRoute = '/mcp' | '/hub/summary' | '/refresh' | '/fintable-sync' | '/vehicule/bail';

export interface RouteLimit { max: number; windowMs: number }

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Plafonds par route (appels AUTHENTIFIÉS / fenêtre). Généreux pour l'usage réel : cron /refresh toutes les 6 h,
 *  /fintable-sync quotidien, /hub/summary interrogé par le hub, rafales d'outils de claude.ai sur /mcp. */
export const ROUTE_LIMITS: Record<LimitedRoute, RouteLimit> = {
    '/mcp': { max: 300, windowMs: MINUTE },
    '/refresh': { max: 12, windowMs: HOUR },
    '/fintable-sync': { max: 12, windowMs: HOUR },
    '/hub/summary': { max: 120, windowMs: HOUR },
    '/vehicule/bail': { max: 60, windowMs: HOUR },
};

/** Échecs d'authentification tolérés PAR ADRESSE et par fenêtre (seuil haut : un humain ou un cron mal réglé ne
 *  l'atteint pas ; un scanneur oui). */
export const AUTH_FAILURE_MAX_PAR_ADRESSE = 100;
export const AUTH_FAILURE_WINDOW_MS = 15 * MINUTE;
/** Adresses suivies en mémoire (au-delà, les plus anciennes sont oubliées). */
export const MAX_ADRESSES = 2000;

export type RefusReason = 'echecs' | 'debit';

export type RouteEntry =
    | { ok: true; /** À appeler à la FIN de la réponse avec son code HTTP. */ done: (status: number) => void }
    | { ok: false; reason: RefusReason; retryAfterSeconds: number };

export interface RouteGuard {
    /** `authentifie` : le secret de la requête a DÉJÀ été vérifié valide (par l'appelant). */
    enter: (route: LimitedRoute, ctx: { authentifie: boolean; adresse: string }) => RouteEntry;
}

/** Adresse du client vue par Cloud Run : DERNIER élément de `X-Forwarded-For` (les précédents viennent du client),
 *  à défaut l'adresse de la socket. Jamais vide. */
export function adresseClient(xForwardedFor: string | string[] | undefined, socketAddress: string | undefined): string {
    const brut = Array.isArray(xForwardedFor) ? xForwardedFor.join(',') : (xForwardedFor ?? '');
    const dernier = brut.split(',').map((s) => s.trim()).filter(Boolean).pop();
    return dernier ?? socketAddress ?? 'inconnue';
}

export function makeRouteGuard(opts: {
    now?: () => number;
    limits?: Partial<Record<LimitedRoute, RouteLimit>>;
    failureMax?: number;
    failureWindowMs?: number;
    maxAdresses?: number;
} = {}): RouteGuard {
    const now = opts.now ?? (() => Date.now());
    const maxAdresses = opts.maxAdresses ?? MAX_ADRESSES;
    const hits = new Map<LimitedRoute, number[]>();
    const echecs = new Map<string, AttemptLimiter>(); // clé : route + adresse

    const limiteurEchecs = (cle: string): AttemptLimiter => {
        let l = echecs.get(cle);
        if (!l) {
            while (echecs.size >= maxAdresses) {
                const plusAncienne = echecs.keys().next().value;
                if (plusAncienne === undefined) break;
                echecs.delete(plusAncienne);
            }
            l = makeAttemptLimiter({
                maxFailures: opts.failureMax ?? AUTH_FAILURE_MAX_PAR_ADRESSE,
                windowMs: opts.failureWindowMs ?? AUTH_FAILURE_WINDOW_MS,
                now,
            });
            echecs.set(cle, l);
        }
        return l;
    };

    return {
        enter(route, ctx) {
            if (!ctx.authentifie) {
                // Non authentifié : aucun budget de volume touché. Seul le compteur d'échecs de CETTE adresse compte.
                const l = limiteurEchecs(`${route}|${ctx.adresse}`);
                if (l.isBlocked()) return { ok: false, reason: 'echecs', retryAfterSeconds: l.retryAfterSeconds() };
                return { ok: true, done: (status) => { if (status === 401 || status === 403) l.recordFailure(); } };
            }
            const limit = opts.limits?.[route] ?? ROUTE_LIMITS[route];
            const t = now();
            const recents = (hits.get(route) ?? []).filter((h) => h > t - limit.windowMs);
            if (recents.length >= limit.max) {
                hits.set(route, recents);
                return { ok: false, reason: 'debit', retryAfterSeconds: Math.max(1, Math.ceil((recents[0] + limit.windowMs - t) / 1000)) };
            }
            recents.push(t);
            hits.set(route, recents);
            return { ok: true, done: () => undefined };
        },
    };
}
