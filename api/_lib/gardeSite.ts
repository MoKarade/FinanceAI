// api/_lib/gardeSite.ts
// [SESSION-HUB] 2026-10-28 (FinanceAI#1159) — la décision du middleware, en code pur Web-standard (Request → Response | null).
// `middleware.ts` (racine) ne fait que la brancher sur `next()` de Vercel ; tout ce qui se teste vit ici.
//
// Règles (chacune a un test) :
//   - `/api/sante` est PUBLIQUE (sonde de fumée commune, ne lit rien), ainsi que le manifeste PWA et ses icônes (GET/HEAD seulement,
//     chemins exacts, FinanceAI#39 : l'installation de l'app et les vérifications du hub les lisent sans session) ; tout le reste exige la session du hub ;
//   - sans session : une PAGE (GET/HEAD hors `/api`) est redirigée (302) vers la connexion du hub, avec de quoi revenir ici ;
//     `/api/*` et toute autre méthode reçoivent un 401 JSON (jamais une redirection que `fetch` suivrait vers une autre origine) ;
//   - session d'un autre courriel (invité du hub) : 403, sans redirection (elle bouclerait : le hub renverrait aussitôt ici) ;
//   - hub injoignable ou hors contrat : 503, jamais un passage libre.
// Réponses `no-store` : un refus ne se met JAMAIS en cache.
import { URL_HUB_DEFAUT } from '../../services/lia/contrat.js';
import { controlerAcces, messageRefus, statutRefus, type OptionsAcces, type RaisonRefus } from './accesHub.js';

const CHEMIN_PUBLIC = '/api/sante';
/**
 * Fichiers statiques lisibles sans session : le manifeste PWA et les icônes qu'il cite (aucune donnée de l'utilisateur).
 * Égalité stricte sur le chemin, jamais un préfixe ni un motif. ⚠️ `/robots.txt` n'y est PAS : c'est la sonde de session
 * expirée de l'app (`utils/sessionAccess.ts`), elle doit rester derrière la garde pour voir la redirection.
 */
const CHEMINS_STATIQUES_PUBLICS: ReadonlySet<string> = new Set([
    '/manifest.webmanifest',
    '/manifest.json',
    '/icon.svg',
    '/icon-192.png',
    '/icon-512.png',
    '/icon-maskable-512.png',
    '/apple-touch-icon.png',
]);
const CHEMIN_CONNEXION_HUB = '/login';

const ENTETES = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } as const;

/** Corps JSON lisible par les deux clients de l'app : enveloppe Anthropic `{ type, error: { type, message } }` et `{ error: { message } }`. */
function refusJson(raison: RaisonRefus): Response {
    const statut = statutRefus(raison);
    const type = statut === 401 ? 'authentication_error' : statut === 403 ? 'permission_error' : 'api_error';
    return new Response(JSON.stringify({ type: 'error', error: { type, message: messageRefus(raison) } }), {
        status: statut,
        headers: { ...ENTETES, 'content-type': 'application/json' },
    });
}

/** Page d'erreur minimale (403, 503) : pas de redirection, aucune donnée. */
function refusPage(raison: RaisonRefus): Response {
    const message = messageRefus(raison);
    const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FinanceAI</title><body style="font:16px system-ui;margin:2rem;color-scheme:light dark"><p>${message}</p>`;
    return new Response(html, { status: statutRefus(raison), headers: { ...ENTETES, 'content-type': 'text/html; charset=utf-8' } });
}

/** Base du hub : `HUB_URL` si c'est une URL https, sinon le hub par défaut (jamais une destination http ou libre). */
function baseHub(get: (k: string) => string | undefined): string {
    const brut = get('HUB_URL')?.trim();
    if (!brut) return URL_HUB_DEFAUT;
    try {
        const u = new URL(brut);
        return u.protocol === 'https:' ? u.origin : URL_HUB_DEFAUT;
    } catch {
        return URL_HUB_DEFAUT;
    }
}

/** URL de connexion du hub ; la page demandée (chemin et requête de CETTE origine) est la destination de retour. */
export function urlConnexionHub(requete: URL, get: (k: string) => string | undefined): string {
    // Concaténation, jamais `new URL(chemin, origine)` : un chemin `//autre.example/x` y serait lu comme une AUTRE origine.
    const retour = `${requete.origin}${requete.pathname}${requete.search}`;
    const url = new URL(CHEMIN_CONNEXION_HUB, baseHub(get));
    url.searchParams.set('callbackUrl', retour);
    return url.toString();
}

/**
 * `null` = la requête peut continuer ; sinon la réponse à rendre. Ne lève jamais (un `controlerAcces` qui échouerait
 * est un refus 503 : on ne laisse pas passer sur une exception).
 */
export async function garderSite(
    request: Request,
    get: (k: string) => string | undefined,
    opts: OptionsAcces = {},
): Promise<Response | null> {
    const url = new URL(request.url);
    if (url.pathname === CHEMIN_PUBLIC) return null;
    if ((request.method === 'GET' || request.method === 'HEAD') && CHEMINS_STATIQUES_PUBLICS.has(url.pathname)) return null;

    let verdict;
    try {
        verdict = await controlerAcces(request.headers, opts);
    } catch {
        verdict = { autorise: false, raison: 'hub_indisponible' } as const;
    }
    if (verdict.autorise) return null;
    const raison = verdict.raison ?? 'session_absente';

    const estPage = (request.method === 'GET' || request.method === 'HEAD') && !url.pathname.startsWith('/api/');
    if (!estPage) return refusJson(raison);
    if (raison === 'session_absente') {
        return new Response(null, { status: 302, headers: { ...ENTETES, location: urlConnexionHub(url, get) } });
    }
    return refusPage(raison);
}
