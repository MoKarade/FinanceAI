// api/_lib/lia.ts — la question de Marc à LIA, relayée au hub (qui la passe à MemoryAI).
//
// Une fonction Vercel SANS état : FinanceAI est une SPA Vite sans session serveur, donc la fonction vérifie
// ELLE-MÊME le cookie signé du hub (`__Secure-hub.session`, ES256, clés PUBLIQUES seulement : elle ne peut
// pas fabriquer de session). Le mur de l'app, lui, passe par le hub (accesHub.ts, #1159) ; LIA n'en dépend pas encore.
//
// Échec FERMÉ, dans cet ordre : méthode (405) → origine (403) → session (401) → propriétaire (403) → corps
// (413/400) → hub (503). Le jeton de l'app (`HUB_TOKEN`) ne sort jamais du serveur ; la question n'est ni
// journalisée ni mise en cache. Pas de repli : sans clés publiques, sans `AUTHORIZED_EMAIL` ou sans
// `HUB_TOKEN`, personne n'est servi.
import { verifierSession } from '@mokarade/hub-contract/session';
import {
    CHEMIN_ASK_HUB,
    CORPS_ASK_MAX_OCTETS,
    DELAI_HUB_MS,
    DemandeLia,
    ReponseLiaApp,
    URL_HUB_DEFAUT,
    estProprietaire,
} from '../../services/lia/contrat.js';
import { CorpsTropGros, lireCorpsBorne, origineAutorisee } from './garde.js';

/** Nom du cookie signé posé par Hubperso, domaine `.hubperso.com`. */
export const NOM_COOKIE_SESSION_HUB = '__Secure-hub.session';

export class LiaIndisponible extends Error {
    constructor(raison: string) {
        super(`LIA indisponible : ${raison}`);
        this.name = 'LiaIndisponible';
    }
}

export interface DepsLia {
    env?: Readonly<Record<string, string | undefined>>;
    fetchImpl?: typeof fetch;
    maintenant?: Date;
}

const ENTETES = { 'content-type': 'application/json', 'cache-control': 'no-store' } as const;

const reponse = (corps: unknown, status: number, extra: Record<string, string> = {}): Response =>
    new Response(JSON.stringify(corps), { status, headers: { ...ENTETES, ...extra } });

/** Valeur du cookie `nom` dans l'en-tête `Cookie`, ou `undefined`. */
export function lireCookie(entete: string | null, nom: string): string | undefined {
    if (!entete) return undefined;
    for (const morceau of entete.split(';')) {
        const i = morceau.indexOf('=');
        if (i < 0) continue;
        if (morceau.slice(0, i).trim() === nom) return morceau.slice(i + 1).trim();
    }
    return undefined;
}

/** JWKS publié par le hub, en JSON dans `HUB_SESSION_PUBLIC_KEYS`. Absent ou illisible → `null`, jamais d'exception. */
function clesPubliques(brut: string | undefined): unknown {
    const texte = brut?.trim();
    if (!texte) return null;
    try {
        return JSON.parse(texte);
    } catch {
        return null;
    }
}

/** URL de l'API ask du hub ; https obligatoire (le jeton voyage dans l'en-tête). */
function urlAsk(base: string): string {
    let url: URL;
    try {
        url = new URL(base);
    } catch {
        throw new LiaIndisponible('HUB_URL invalide');
    }
    if (url.protocol !== 'https:') throw new LiaIndisponible('HUB_URL doit être en https');
    return new URL(CHEMIN_ASK_HUB, url).toString();
}

/** Le saut serveur → hub. Toute anomalie (jeton absent, délai, statut, réponse non conforme) est `LiaIndisponible`. */
export async function demanderAuHub(
    demande: DemandeLia,
    { signal, fetchImpl = fetch, env = process.env }: { signal?: AbortSignal } & DepsLia = {},
): Promise<ReponseLiaApp> {
    const jeton = env.HUB_TOKEN;
    if (!jeton) throw new LiaIndisponible('HUB_TOKEN absent');
    const url = urlAsk(env.HUB_URL?.trim() || URL_HUB_DEFAUT);

    const delai = AbortSignal.timeout(DELAI_HUB_MS);
    let res: Response;
    try {
        res = await fetchImpl(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-hub-token': jeton },
            // FinanceAI n'a que Marc : `proprietaire` est TOUJOURS vrai ici, la route a déjà refusé tout autre.
            body: JSON.stringify({ ...demande, proprietaire: true }),
            cache: 'no-store',
            signal: signal ? AbortSignal.any([signal, delai]) : delai,
        });
    } catch {
        throw new LiaIndisponible('hub injoignable ou trop lent');
    }
    if (!res.ok) throw new LiaIndisponible(`hub a répondu ${res.status}`);
    let json: unknown;
    try {
        json = await res.json();
    } catch {
        throw new LiaIndisponible('réponse du hub illisible');
    }
    const lue = ReponseLiaApp.safeParse(json);
    if (!lue.success) throw new LiaIndisponible('réponse du hub non conforme');
    return lue.data;
}

export async function repondreLiaAsk(request: Request, deps: DepsLia = {}): Promise<Response> {
    const env = deps.env ?? process.env;
    if (request.method !== 'POST') return reponse({ error: 'methode_non_permise' }, 405, { allow: 'POST' });

    // Anti-CSRF : un POST de navigateur porte toujours `Origin` ; absent ou étranger → refus.
    if (!origineAutorisee(request.headers.get('origin'), (k) => env[k])) return reponse({ error: 'origine_refusee' }, 403);

    const identite = await verifierSession(
        lireCookie(request.headers.get('cookie'), NOM_COOKIE_SESSION_HUB),
        clesPubliques(env.HUB_SESSION_PUBLIC_KEYS),
        deps.maintenant ? { maintenant: deps.maintenant } : {},
    );
    if (!identite) return reponse({ error: 'unauthenticated' }, 401);
    if (!estProprietaire(identite.email, env.AUTHORIZED_EMAIL)) return reponse({ error: 'reserve_au_proprietaire' }, 403);

    let brut: string;
    try {
        brut = await lireCorpsBorne(request, CORPS_ASK_MAX_OCTETS);
    } catch (e) {
        if (e instanceof CorpsTropGros) return reponse({ error: 'corps_trop_grand' }, 413);
        throw e;
    }
    let json: unknown;
    try {
        json = JSON.parse(brut);
    } catch {
        return reponse({ error: 'corps_invalide' }, 400);
    }
    const demande = DemandeLia.safeParse(json);
    if (!demande.success) return reponse({ error: 'corps_invalide' }, 400);

    try {
        return reponse(await demanderAuHub(demande.data, { signal: request.signal, env, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) }), 200);
    } catch (e) {
        if (e instanceof LiaIndisponible) return reponse({ error: 'lia_indisponible' }, 503);
        throw e;
    }
}
