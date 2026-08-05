// mcp/auth/rateLimit.ts
//
// [MCP-CLOUDRUN-AUTH-HARDENING] Limiteur de tentatives pour `POST /oauth/authorize` — la SEULE
// porte réellement devinable du serveur MCP.
//
// Pourquoi ici et pas ailleurs : `/oauth/token` exige un code SIGNÉ (HMAC) qu'on ne peut pas
// deviner, et `/oauth/register` ne donne rien de plus qu'un client_id public. `/oauth/authorize`,
// lui, compare une CLÉ D'ACCÈS saisie à la main : c'est le seul endroit où réessayer en boucle a un
// sens pour un attaquant. Sans plafond, `FINANCEAI_ACCESS_KEY` (16 caractères minimum) est
// attaquable au débit que la machine veut bien servir.
//
// ⚠️ CHOIX : on compte les ÉCHECS, pas les tentatives.
//   - Un succès ne consomme rien → Marc n'est JAMAIS bloqué par son propre usage légitime, même
//     après plusieurs autorisations d'affilée (ré-appairage du connecteur, changement d'appareil).
//   - Le compteur est GLOBAL, pas par IP. Derrière le load balancer Cloud Run, `X-Forwarded-For`
//     est un en-tête que le client contrôle en partie : une clé par IP se contourne en variant
//     l'en-tête, donc elle donnerait une illusion de protection. Sur un serveur MONO-UTILISATEUR,
//     un plafond global est à la fois plus honnête et plus strict. Le prix assumé : un tiers qui
//     pilonne peut retarder une autorisation de Marc d'une fenêtre — nettement préférable à une
//     clé d'accès brute-forçable, et sans effet sur les requêtes MCP déjà authentifiées.
//
// ⚠️ LIMITE ASSUMÉE (Cloud Run scale-to-zero) : l'état vit en MÉMOIRE, donc un cold-start ou une
// 2ᵉ instance repart de zéro — même compromis, et même raison, que le registre `consumedJti` de
// `oauthProvider.ts`. Ça ralentit massivement une attaque soutenue (qui garde l'instance chaude,
// donc le compteur vivant) sans prétendre à une garantie distribuée. Le kill-switch d'incident
// reste la rotation de `FINANCEAI_OAUTH_SIGNING_KEY` (runbook : `mcp/README.md`).
//
// Module PUR : aucune horloge implicite (`now` injectable), aucun réseau. Le câblage vit dans
// `mcp/http.ts`.

/** Échecs tolérés dans la fenêtre avant blocage. Une saisie humaine se trompe 2-3 fois, pas 8. */
export const AUTHORIZE_MAX_FAILURES = 8;
/** Fenêtre glissante. 15 min : assez court pour ne pas punir Marc, assez long pour tuer un débit. */
export const AUTHORIZE_WINDOW_MS = 15 * 60_000;

export interface AttemptLimiter {
    /** `true` si la tentative est BLOQUÉE (quota d'échecs épuisé) — à appeler AVANT de vérifier la clé. */
    isBlocked: () => boolean;
    /** Secondes avant déblocage (pour l'en-tête `Retry-After`). 0 si non bloqué. */
    retryAfterSeconds: () => number;
    /** Enregistre un ÉCHEC. Les succès n'appellent jamais ceci — voir l'en-tête. */
    recordFailure: () => void;
    /** Efface l'historique (un succès prouve que ce n'est pas une attaque en cours). */
    reset: () => void;
}

export function makeAttemptLimiter(opts: {
    maxFailures?: number;
    windowMs?: number;
    now?: () => number;
} = {}): AttemptLimiter {
    const maxFailures = opts.maxFailures ?? AUTHORIZE_MAX_FAILURES;
    const windowMs = opts.windowMs ?? AUTHORIZE_WINDOW_MS;
    const now = opts.now ?? (() => Date.now());

    // Horodatages des échecs, du plus ancien au plus récent. Borné par `maxFailures` : on purge
    // AVANT d'ajouter, donc le tableau ne peut pas fuir la mémoire même sous pilonnage.
    let failures: number[] = [];

    const purge = (): number[] => {
        const cutoff = now() - windowMs;
        failures = failures.filter((t) => t > cutoff);
        return failures;
    };

    return {
        isBlocked: () => purge().length >= maxFailures,
        retryAfterSeconds: () => {
            const live = purge();
            if (live.length < maxFailures) return 0;
            // Déblocage quand le PLUS ANCIEN échec sort de la fenêtre.
            const remainingMs = live[0] + windowMs - now();
            return Math.max(1, Math.ceil(remainingMs / 1000));
        },
        recordFailure: () => {
            purge();
            failures.push(now());
        },
        reset: () => { failures = []; },
    };
}
