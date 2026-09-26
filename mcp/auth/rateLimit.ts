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

// ── [MCP-RATE-LIMIT] /oauth/authorize : compteur PAR ADRESSE + plafond global de sécurité ─────────────────────────
// Avis pole-securite : le limiteur d'échecs GLOBAL ci-dessus (8 par 15 min) laissait n'importe qui sur Internet interdire
// à Marc toute NOUVELLE autorisation (le serveur Cloud Run est public) avec 8 requêtes. Désormais :
//  - un seuil BAS PAR ADRESSE (8 : cette porte est la seule protégée par la clé d'accès, potentiellement faible) ;
//  - un plafond GLOBAL beaucoup plus haut (200 par 15 min) : il ne sert qu'à borner une attaque distribuée, et n'est appliqué QUE si la clé
//    d'accès est faible (< 32 caractères) : avec une clé conforme, la force brute est hors de portée et un plafond global ne ferait
//    qu'offrir un déni de service à un attaquant disposant de nombreuses adresses (avis pole-securite) ;
//  - un succès n'efface que les échecs de SON adresse (jamais le compteur global : un attaquant ne peut pas le remettre à zéro).
// ⚠️ Le blocage reste appliqué AVANT la comparaison de la clé, pour une adresse au quota épuisé ET pour le plafond global :
// vérifier la clé « d'abord » depuis une adresse bloquée laisserait deviner à la vitesse de la ligne (un essai juste passerait,
// un faux répondrait 429 comme le blocage) et viderait la protection de son sens. Conséquence assumée : Marc, après 8 fautes de
// frappe, attend la fin de la fenêtre DEPUIS CETTE ADRESSE seulement ; les sessions déjà autorisées ne sont pas touchées.
// Mémoire du processus, table d'adresses bornée ; l'adresse est le DERNIER élément de X-Forwarded-For (voir routeRateLimit.ts).

export const AUTHORIZE_MAX_FAILURES_PAR_ADRESSE = 8;
export const AUTHORIZE_MAX_FAILURES_GLOBAL = 200;
export const AUTHORIZE_MAX_ADRESSES = 2000;

export interface AddressAttemptLimiter {
    /** `true` si cette adresse OU le plafond global est bloqué — à appeler AVANT de vérifier la clé. */
    isBlocked: (adresse: string) => boolean;
    retryAfterSeconds: (adresse: string) => number;
    recordFailure: (adresse: string) => void;
    /** Succès : efface les échecs de CETTE adresse seulement. */
    reset: (adresse: string) => void;
}

export function makeAddressAttemptLimiter(opts: {
    perAddressMax?: number;
    /** Plafond global d'échecs ; `null` = AUCUN plafond global (seul le compteur par adresse s'applique). */
    globalMax?: number | null;
    windowMs?: number;
    maxAdresses?: number;
    now?: () => number;
} = {}): AddressAttemptLimiter {
    const windowMs = opts.windowMs ?? AUTHORIZE_WINDOW_MS;
    const now = opts.now ?? (() => Date.now());
    const maxAdresses = opts.maxAdresses ?? AUTHORIZE_MAX_ADRESSES;
    const perAddressMax = opts.perAddressMax ?? AUTHORIZE_MAX_FAILURES_PAR_ADRESSE;
    const global = opts.globalMax === null ? null : makeAttemptLimiter({ maxFailures: opts.globalMax ?? AUTHORIZE_MAX_FAILURES_GLOBAL, windowMs, now });
    const parAdresse = new Map<string, AttemptLimiter>();

    const de = (adresse: string): AttemptLimiter => {
        let l = parAdresse.get(adresse);
        if (!l) {
            while (parAdresse.size >= maxAdresses) {
                const plusAncienne = parAdresse.keys().next().value;
                if (plusAncienne === undefined) break;
                parAdresse.delete(plusAncienne);
            }
            l = makeAttemptLimiter({ maxFailures: perAddressMax, windowMs, now });
            parAdresse.set(adresse, l);
        }
        return l;
    };

    return {
        isBlocked: (adresse) => (global?.isBlocked() ?? false) || de(adresse).isBlocked(),
        retryAfterSeconds: (adresse) => Math.max(global?.retryAfterSeconds() ?? 0, de(adresse).retryAfterSeconds()),
        recordFailure: (adresse) => { global?.recordFailure(); de(adresse).recordFailure(); },
        reset: (adresse) => { de(adresse).reset(); },
    };
}
