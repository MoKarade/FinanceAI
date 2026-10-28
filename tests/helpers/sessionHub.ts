// tests/helpers/sessionHub.ts — un hub FICTIF pour les tests du garde de session (FinanceAI#1159).
// Le garde transmet le cookie de session au hub (`GET /api/session/moi`, Hubperso#601) ; ici le hub est un `fetch` simulé qui
// répond selon le scénario. Aucun réseau, aucun cookie réel : les valeurs sont opaques et fictives.
import { vi } from 'vitest';

export const COOKIE_AUTHJS = '__Secure-authjs.session-token=valeur-opaque-de-test';
export const COOKIE_SIGNE = '__Secure-hub.session=autre-valeur-opaque-de-test';

export type ScenarioHub = 'proprietaire' | 'invite' | 'sans_session' | 'panne' | 'redirige' | 'hors_contrat' | 'non_json' | 'erreur_500';

const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } });

export function hubFictif(scenario: ScenarioHub) {
    const appels: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
        appels.push({ url: String(url), init: init ?? {} });
        switch (scenario) {
            case 'proprietaire': return json({ proprietaire: true });
            case 'invite': return json({ proprietaire: false });
            case 'sans_session': return json({ error: 'unauthorized' }, 401);
            case 'panne': throw new TypeError('fetch failed');
            case 'redirige': return new Response(null, { status: 308, headers: { location: 'https://www.hubperso.com/api/session/moi' } });
            case 'hors_contrat': return json({ proprietaire: 'oui' });
            case 'non_json': return new Response('<html>', { status: 200 });
            case 'erreur_500': return json({ error: 'boom' }, 500);
        }
    }) as unknown as typeof fetch & { mock: { calls: unknown[][] } };
    return { fetchImpl, appels };
}
