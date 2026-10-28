// api/_lib/accesHub.ts
// [SESSION-HUB] 2026-10-28 (FinanceAI#1159, reco B de Marc) — le mur de FinanceAI est la SESSION DU HUB.
//
// Remplace le contrôle du jeton Cloudflare Access (ADR 0022), qui n'a jamais été posé : sans mur Cloudflare, ce contrôle
// tournait en « observation » et laissait tout passer. FinanceAI est une SPA Vite sans session serveur ni `AUTH_SECRET` : elle
// ne sait pas lire le cookie chiffré du hub, et le cookie signé ES256 que les satellites liront plus tard n'est pas encore
// émis (phase 2 de la session asymétrique, Hubperso docs/SECURITE.md). Elle TRANSMET donc le cookie de session au hub
// (`GET /api/session/moi`, Hubperso#601), qui le lit avec ce qu'il détient déjà et répond `{ proprietaire: true | false }`.
// Aucun secret ni variable à poser ici ; le hub reste le seul à décider qui est connecté.
//
// Deux endroits appellent `controlerAcces`, chacun SEUL suffisant (ceinture et bretelles) :
//   - `middleware.ts` (racine) : toutes les pages et tout `/api/*` sauf `/api/sante` ;
//   - les fonctions `api/` (relais Claude, proxys Yahoo et Fintable) : elles revérifient, pour qu'un contournement du
//     routage (ou un futur retrait du middleware) ne rouvre pas l'API.
//
// ÉCHEC FERMÉ, sans mode « observation » ni variable qui coupe le contrôle :
//   - aucun cookie de session du hub → 401, SANS appel réseau ;
//   - le hub répond 401 → 401 ; `proprietaire: false` (invité du hub) → 403 ;
//   - le hub injoignable, trop lent, en erreur ou hors contrat → 503 (jamais un passage libre).
// Un refus n'est JAMAIS mis en cache. Un « oui » l'est 60 s, en mémoire de l'instance, sous l'empreinte SHA-256 du cookie
// (jamais le cookie lui-même) : une révocation prend effet au plus tard une minute après, comme `aAccesHub` des autres apps.
// Le cookie transmis au hub se limite aux cookies de SESSION du hub ; il n'est jamais journalisé.
//
// ⚠️ Le hub est visé en `www.hubperso.com` : `hubperso.com` répond 308 vers `www`, et `fetch` retire l'en-tête `cookie` à
// cette redirection entre origines (même piège que BatchChef /api/lia/etat). `redirect: 'manual'` : toute redirection = 503.

export type RaisonRefus = 'session_absente' | 'autre_courriel' | 'hub_indisponible';

export interface VerdictAcces {
    /** L'appel peut continuer. */
    autorise: boolean;
    /** Présente seulement si `autorise` est faux. */
    raison?: RaisonRefus;
}

export interface OptionsAcces {
    /** `fetch` injectable (tests). */
    fetchImpl?: typeof fetch;
    /** Horloge injectable (tests), en millisecondes. */
    maintenantMs?: number;
}

/** Hub, côté serveur à serveur (jamais l'apex, qui redirige). */
export const URL_HUB_SESSION = 'https://www.hubperso.com';
export const CHEMIN_SESSION_HUB = '/api/session/moi';
/** Cookie signé ES256 (phase 2 du hub, pas encore émis) et cookie Auth.js partagé (peut être découpé en `.0`, `.1`…). */
export const NOM_COOKIE_SESSION_HUB = '__Secure-hub.session';
export const NOM_COOKIE_AUTHJS = '__Secure-authjs.session-token';

const DELAI_HUB_MS = 4_000;
const VALIDITE_OUI_MS = 60_000;
const ENTREES_MAX = 50;
const COOKIE_MAX_OCTETS = 8 * 1024;

const AUTHJS_DECOUPE = /^__Secure-authjs\.session-token\.\d{1,2}$/;
const estCookieDeSession = (nom: string): boolean => nom === NOM_COOKIE_SESSION_HUB || nom === NOM_COOKIE_AUTHJS || AUTHJS_DECOUPE.test(nom);

/** Les cookies de session du hub dans l'en-tête `Cookie`, rien d'autre ; `''` s'il n'y en a aucun. */
export function cookiesDeSession(entete: string | null): string {
    if (!entete) return '';
    const gardes: string[] = [];
    for (const morceau of entete.split(';')) {
        const i = morceau.indexOf('=');
        if (i < 0) continue;
        const nom = morceau.slice(0, i).trim();
        const valeur = morceau.slice(i + 1).trim();
        if (valeur && estCookieDeSession(nom)) gardes.push(`${nom}=${valeur}`);
    }
    const cookie = gardes.join('; ');
    return cookie.length <= COOKIE_MAX_OCTETS ? cookie : '';
}

async function empreinte(texte: string): Promise<string> {
    const octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
    return [...new Uint8Array(octets)].map((o) => o.toString(16).padStart(2, '0')).join('');
}

/** Oui déjà obtenus : empreinte du cookie → fin de validité. Les refus n'y entrent JAMAIS. */
const ouiRecents = new Map<string, number>();

/** Tests uniquement. */
export function reinitialiserCacheAcces(): void {
    ouiRecents.clear();
}

function retenirOui(cle: string, maintenant: number): void {
    ouiRecents.delete(cle);
    for (const [k, fin] of ouiRecents) if (fin <= maintenant) ouiRecents.delete(k);
    while (ouiRecents.size >= ENTREES_MAX) {
        const plusAncienne = ouiRecents.keys().next().value;
        if (plusAncienne === undefined) break;
        ouiRecents.delete(plusAncienne);
    }
    ouiRecents.set(cle, maintenant + VALIDITE_OUI_MS);
}

/** Le saut serveur → hub. Toute anomalie est `hub_indisponible`. */
async function interrogerHub(cookie: string, fetchImpl: typeof fetch): Promise<RaisonRefus | 'proprietaire'> {
    let res: Response;
    try {
        res = await fetchImpl(`${URL_HUB_SESSION}${CHEMIN_SESSION_HUB}`, {
            method: 'GET',
            headers: { cookie, accept: 'application/json' },
            redirect: 'manual',
            cache: 'no-store',
            signal: AbortSignal.timeout(DELAI_HUB_MS),
        });
    } catch {
        return 'hub_indisponible';
    }
    if (res.status === 401) return 'session_absente';
    if (res.status !== 200) return 'hub_indisponible';
    try {
        const json = (await res.json()) as { proprietaire?: unknown };
        if (json.proprietaire === true) return 'proprietaire';
        if (json.proprietaire === false) return 'autre_courriel';
    } catch {
        /* réponse illisible : traitée ci-dessous comme hors contrat */
    }
    return 'hub_indisponible';
}

/**
 * Contrôle d'accès d'une requête. Ne lève jamais. L'ordre compte : cookie (401, sans réseau) → cache d'un « oui » →
 * hub (401 / 403 / 503 / oui). Il ne lit AUCUNE variable d'environnement, et c'est voulu : rien ne peut le couper.
 */
export async function controlerAcces(headers: Headers, opts: OptionsAcces = {}): Promise<VerdictAcces> {
    const cookie = cookiesDeSession(headers.get('cookie'));
    if (!cookie) return { autorise: false, raison: 'session_absente' };

    const maintenant = opts.maintenantMs ?? Date.now();
    const cle = await empreinte(cookie);
    const fin = ouiRecents.get(cle);
    if (fin !== undefined && fin > maintenant) return { autorise: true };

    const verdict = await interrogerHub(cookie, opts.fetchImpl ?? fetch);
    if (verdict === 'proprietaire') {
        retenirOui(cle, maintenant);
        return { autorise: true };
    }
    ouiRecents.delete(cle); // un refus ne se met jamais en cache, et il efface un oui périmé
    return { autorise: false, raison: verdict };
}

/** Statut HTTP d'un refus. */
export function statutRefus(raison: RaisonRefus): 401 | 403 | 503 {
    return raison === 'session_absente' ? 401 : raison === 'autre_courriel' ? 403 : 503;
}

/** Message d'un refus : aucune donnée, aucun courriel. */
export function messageRefus(raison: RaisonRefus): string {
    switch (raison) {
        case 'session_absente':
            return 'Accès refusé : session du hub absente ou expirée. Reconnecte-toi sur hubperso.com.';
        case 'autre_courriel':
            return 'Accès refusé : FinanceAI est réservée à son propriétaire.';
        case 'hub_indisponible':
            return 'Accès indisponible : le hub ne répond pas, la session ne peut pas être vérifiée. Réessaie dans un instant.';
    }
}
