// [CF-ACCESS] 2026-09-25 — détecter une session Cloudflare Access expirée et recharger la page pour se reconnecter.
//
// LEÇON DE JUIN 2026 (A_FAIRE_MOI O1) : quand la session Access expire, Cloudflare répond 302 vers sa page de connexion
// (autre origine) à TOUTE requête : les fetch et les chunks JS échouent en « Failed to fetch » sans que l'app comprenne
// pourquoi. Ici, une sonde légère et sans donnée (`/icon.svg`, fichier statique de l'app) est demandée avec
// `redirect: 'manual'` : une redirection revient en réponse « opaqueredirect » = session expirée → on recharge la page
// (la navigation, elle, sait suivre la redirection et afficher le code e-mail).
//
// Sans Cloudflare Access (aujourd'hui, ou en cas de retour arrière DNS) la sonde répond 200 : rien ne se passe.
// Une panne RÉSEAU (fetch qui rejette) n'est PAS une session expirée : on ne recharge pas (hors ligne = PWA, cache local).
// Garde anti-boucle : au plus un rechargement par minute (horodatage en sessionStorage), comme lazyWithRetry.

const CLE_RECHARGEMENT = 'financeai:sessionAccessReload:v1';
const INTERVALLE_MIN_MS = 60_000;
const ABSENCE_MIN_MS = 60_000;
const URL_SONDE = '/icon.svg';

export type EtatSession = 'ok' | 'expiree' | 'inconnu';

/** Une réponse qui n'est pas celle de NOTRE origine : redirection (opaque) ou statut 0. */
export function reponseDeSessionExpiree(res: { type?: string; redirected?: boolean; status: number }): boolean {
    return res.type === 'opaqueredirect' || res.type === 'opaque' || res.redirected === true || res.status === 0;
}

export async function verifierSession(fetchImpl: typeof fetch = fetch): Promise<EtatSession> {
    try {
        const res = await fetchImpl(URL_SONDE, { redirect: 'manual', cache: 'no-store', credentials: 'same-origin' });
        return reponseDeSessionExpiree(res) ? 'expiree' : 'ok';
    } catch {
        return 'inconnu'; // réseau HS ≠ session expirée
    }
}

function rechargementPermis(maintenant: number): boolean {
    try {
        const dernier = Number(sessionStorage.getItem(CLE_RECHARGEMENT));
        return !(maintenant - dernier < INTERVALLE_MIN_MS); // NaN-safe
    } catch {
        return false; // pas de stockage : aucune garde anti-boucle possible → pas de rechargement automatique
    }
}

function noterRechargement(maintenant: number): boolean {
    try {
        sessionStorage.setItem(CLE_RECHARGEMENT, String(maintenant));
        return true;
    } catch {
        return false;
    }
}

export interface OptionsSurveillance {
    fetchImpl?: typeof fetch;
    recharger?: () => void;
    maintenant?: () => number;
}

/**
 * Vérifie la session au retour dans l'onglet (après ≥ 1 min d'absence) et au retour du réseau ; recharge si expirée.
 * Renvoie la fonction de nettoyage.
 */
export function surveillerSessionAccess(opts: OptionsSurveillance = {}): () => void {
    const maintenant = opts.maintenant ?? Date.now;
    const recharger = opts.recharger ?? (() => window.location.reload());
    let cacheDepuis: number | null = null;

    const controler = async () => {
        if ((await verifierSession(opts.fetchImpl)) !== 'expiree') return;
        const t = maintenant();
        if (rechargementPermis(t) && noterRechargement(t)) recharger();
    };
    const surVisibilite = () => {
        if (document.visibilityState === 'hidden') { cacheDepuis = maintenant(); return; }
        if (cacheDepuis !== null && maintenant() - cacheDepuis >= ABSENCE_MIN_MS) void controler();
        cacheDepuis = null;
    };
    const surReseau = () => { void controler(); };

    document.addEventListener('visibilitychange', surVisibilite);
    window.addEventListener('online', surReseau);
    return () => {
        document.removeEventListener('visibilitychange', surVisibilite);
        window.removeEventListener('online', surReseau);
    };
}
