// mcp/marche/lecteursReseau.ts
//
// [MARCHE-LECTEURS] Les deux lectures réseau de la passe : EODHD (clôtures) et la Banque du Canada (taux).
// Le `fetch` est INJECTÉ (testable sans réseau ; le conteneur de développement n'atteint pas ces hôtes).
// Construction des URL et lecture des réponses : `services/marche/clientsMarche.ts` (pur).
//
// ⚠️ Vie privée : la clé EODHD voyage dans l'URL. Aucune erreur levée ici ne contient l'URL, la clé, le
// symbole ni le corps de la réponse : seulement une cause FIXE. La passe compte la panne sans la citer.
import type { LecteursMarche } from '../../services/marche/passeMagasin';
import { lireReponseEodhd, lireSerieDateeBdc, urlCloturesEodhd, urlSerieBdc } from '../../services/marche/clientsMarche';

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const DELAI_MS = 20_000;

async function lireJson(fetchFn: Fetch, url: string): Promise<unknown> {
    let reponse;
    try {
        reponse = await fetchFn(url, { signal: AbortSignal.timeout(DELAI_MS) });
    } catch {
        throw new Error('source injoignable ou trop lente');
    }
    if (!reponse.ok) throw new Error(`source : HTTP ${reponse.status}`);
    try {
        return await reponse.json();
    } catch {
        throw new Error('source : réponse non JSON');
    }
}

export function creerLecteursReseau(cleEodhd: string, fetchFn: Fetch = fetch as unknown as Fetch): LecteursMarche {
    return {
        lireClotures: async (symbole, du, au) => lireReponseEodhd(await lireJson(fetchFn, urlCloturesEodhd(symbole, du, au, cleEodhd))),
        lireTaux: async (devise, du, au) => lireSerieDateeBdc(await lireJson(fetchFn, urlSerieBdc(devise, du, au)), devise),
    };
}
