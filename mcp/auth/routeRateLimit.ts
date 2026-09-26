// mcp/auth/routeRateLimit.ts
//
// [MCP-RATE-LIMIT] Limites de débit des routes du serveur MCP autres que `/oauth/authorize` (qui a déjà son
// limiteur d'échecs, `rateLimit.ts`) : `/mcp`, `/refresh`, `/fintable-sync`, `/hub/summary`, `/vehicule/bail`.
// Audit sécurité P3-P6 (moyenne 8) : aucune borne d'abus ni de coût (chaque `/refresh` appelle des fournisseurs
// de cours, chaque `/fintable-sync` lit puis écrit l'état sur Drive).
//
// Deux compteurs par route, tous deux GLOBAUX (pas par IP : derrière Cloud Run, `X-Forwarded-For` est en partie
// contrôlé par le client, une clé par IP se contourne — même raisonnement que `rateLimit.ts`, serveur mono-utilisateur) :
//  1. ÉCHECS d'authentification (401/403) : au-delà de `AUTH_FAILURE_MAX` par fenêtre, la route répond 429 AVANT
//     d'examiner le secret (comme `/oauth/authorize`). Prix assumé : un tiers qui pilonne peut retarder un appel
//     légitime d'une fenêtre ; les secrets ont ≥ 16 caractères, la vraie valeur ici est de borner le coût.
//  2. VOLUME d'appels réussis : plafond par fenêtre. Une requête refusée en 401/403 est REMBOURSÉE (elle ne consomme
//     pas le budget légitime) : un flot de requêtes non authentifiées ne peut pas affamer le cron de Marc.
//
// ⚠️ LIMITE (Cloud Run scale-to-zero) : mémoire du processus ; un cold-start repart de zéro (même compromis que
// `rateLimit.ts`). Module PUR : horloge injectable, aucun réseau.

import { makeAttemptLimiter, type AttemptLimiter } from './rateLimit';

export type LimitedRoute = '/mcp' | '/hub/summary' | '/refresh' | '/fintable-sync' | '/vehicule/bail';

export interface RouteLimit { max: number; windowMs: number }

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Plafonds par route (appels réussis / fenêtre). Généreux pour l'usage réel : cron /refresh toutes les 6 h,
 *  /fintable-sync quotidien, /hub/summary interrogé par le hub, rafales d'outils de claude.ai sur /mcp. */
export const ROUTE_LIMITS: Record<LimitedRoute, RouteLimit> = {
    '/mcp': { max: 300, windowMs: MINUTE },
    '/refresh': { max: 12, windowMs: HOUR },
    '/fintable-sync': { max: 12, windowMs: HOUR },
    '/hub/summary': { max: 120, windowMs: HOUR },
    '/vehicule/bail': { max: 60, windowMs: HOUR },
};

/** Échecs d'authentification tolérés par route et par fenêtre avant blocage. */
export const AUTH_FAILURE_MAX = 20;
export const AUTH_FAILURE_WINDOW_MS = 15 * MINUTE;

export type RefusReason = 'echecs' | 'debit';

export type RouteEntry =
    | { ok: true; /** À appeler à la FIN de la réponse avec son code HTTP. */ done: (status: number) => void }
    | { ok: false; reason: RefusReason; retryAfterSeconds: number };

export interface RouteGuard {
    enter: (route: LimitedRoute) => RouteEntry;
}

interface Bucket { hits: number[]; limit: RouteLimit; failures: AttemptLimiter }

export function makeRouteGuard(opts: {
    now?: () => number;
    limits?: Partial<Record<LimitedRoute, RouteLimit>>;
    failureMax?: number;
    failureWindowMs?: number;
} = {}): RouteGuard {
    const now = opts.now ?? (() => Date.now());
    const buckets = new Map<LimitedRoute, Bucket>();
    const bucket = (route: LimitedRoute): Bucket => {
        let b = buckets.get(route);
        if (!b) {
            b = {
                hits: [],
                limit: opts.limits?.[route] ?? ROUTE_LIMITS[route],
                failures: makeAttemptLimiter({
                    maxFailures: opts.failureMax ?? AUTH_FAILURE_MAX,
                    windowMs: opts.failureWindowMs ?? AUTH_FAILURE_WINDOW_MS,
                    now,
                }),
            };
            buckets.set(route, b);
        }
        return b;
    };

    return {
        enter(route) {
            const b = bucket(route);
            if (b.failures.isBlocked()) {
                return { ok: false, reason: 'echecs', retryAfterSeconds: b.failures.retryAfterSeconds() };
            }
            const t = now();
            b.hits = b.hits.filter((h) => h > t - b.limit.windowMs);
            if (b.hits.length >= b.limit.max) {
                const retry = Math.max(1, Math.ceil((b.hits[0] + b.limit.windowMs - t) / 1000));
                return { ok: false, reason: 'debit', retryAfterSeconds: retry };
            }
            b.hits.push(t);
            return {
                ok: true,
                done: (status) => {
                    if (status !== 401 && status !== 403) return;
                    // Refus d'authentification : on rembourse le volume et on compte l'échec.
                    const i = b.hits.lastIndexOf(t);
                    if (i >= 0) b.hits.splice(i, 1);
                    b.failures.recordFailure();
                },
            };
        },
    };
}
