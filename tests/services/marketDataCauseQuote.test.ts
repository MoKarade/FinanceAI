// tests/services/marketDataCauseQuote.test.ts
//
// [AI-FINNHUB-CAUSE-COLLAPSE] La façade de cours doit PUBLIER la cause d'un échec, pas la réduire
// à `null`. Mesuré avant ce lot, sur cette même sonde : 401 (clé refusée), 429 (quota) et panne
// réseau rendaient TOUS `null`, sans jamais lever — indiscernables d'un symbole inconnu.
//
// ⚠️ Ces cas passent par le VRAI module (aucun faux `marketData`) : seul `fetch` est simulé. C'est
// la seule façon de mesurer le contrat d'erreur RÉEL — un faux module encode le contrat qu'on
// croit avoir, et c'est précisément cette croyance qui était fausse ici.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { messageEchecMarche } from '../../services/marketData/messageEchec';
import type { MarketDataErrorCode } from '../../services/marketData/types';

const CLE = 'cle-de-test-1234567890';

async function demanderCours(reponse: () => Promise<Response>) {
    const mod = await import('../../services/marketData');
    mod.clearMarketDataCache();
    mod.clearNegativeCache();
    mod.configureMarketDataProvider({ finnhubKey: CLE });
    vi.stubGlobal('fetch', vi.fn(reponse));
    const detaille = await mod.getQuoteDetaille('NASDAQ:NVDA');
    // Le contrat HISTORIQUE de `getQuote` ne bouge pas : `priceRefresh` et les boucles pacées
    // reposent dessus (« ne rejette jamais », `null` = pas de cours).
    mod.clearMarketDataCache();
    const simple = await mod.getQuote('NASDAQ:NVDA');
    return { detaille, simple };
}

const REPONSES = {
    auth: async () => new Response('', { status: 401 }),
    quota: async () => new Response('', { status: 429 }),
    reseau: async () => { throw new TypeError('Failed to fetch'); },
    inconnu: async () => new Response(JSON.stringify({ c: 0 }), { status: 200, headers: { 'content-type': 'application/json' } }),
} as const;

describe('[AI-FINNHUB-CAUSE-COLLAPSE] la chaîne de cours nomme sa cause', () => {
    beforeEach(() => { vi.resetModules(); });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('401 → échec AUTH (et pas une absence)', async () => {
        const { detaille, simple } = await demanderCours(REPONSES.auth);
        expect(detaille.forme).toBe('echec');
        expect(detaille.forme === 'echec' && detaille.echec.cause).toBe('AUTH');
        expect(simple).toBeNull(); // contrat historique intact
    });

    it('429 → échec RATE_LIMIT', async () => {
        const { detaille } = await demanderCours(REPONSES.quota);
        expect(detaille.forme === 'echec' && detaille.echec.cause).toBe('RATE_LIMIT');
    });

    it('panne réseau → échec NETWORK', async () => {
        const { detaille } = await demanderCours(REPONSES.reseau);
        expect(detaille.forme === 'echec' && detaille.echec.cause).toBe('NETWORK');
    });

    it('symbole inconnu (réponse VALIDE sans cours) → absence, jamais un échec', async () => {
        const { detaille, simple } = await demanderCours(REPONSES.inconnu);
        // La distinction qui manquait : ici rien n'a échoué, le titre n'est simplement pas coté.
        expect(detaille.forme).toBe('absent');
        expect(simple).toBeNull();
    });

    // ANTI-EFFONDREMENT : c'est CETTE assertion qui rougirait si un jour les quatre situations
    // reconvergeaient vers une seule valeur (le défaut d'origine). Les trois précédentes, prises
    // séparément, resteraient vertes sous un mapping constant si on les écrivait « ≠ null ».
    it('les quatre situations restent DISTINGUABLES de bout en bout', async () => {
        const vus: string[] = [];
        for (const rep of [REPONSES.auth, REPONSES.quota, REPONSES.reseau, REPONSES.inconnu]) {
            const { detaille } = await demanderCours(rep);
            vus.push(detaille.forme === 'echec' ? `echec:${detaille.echec.cause}` : detaille.forme);
        }
        expect(new Set(vus).size).toBe(4);
    });
});

describe('[AI-FINNHUB-CAUSE-COLLAPSE] chaque cause a SA phrase', () => {
    const CAUSES: MarketDataErrorCode[] = ['AUTH', 'RATE_LIMIT', 'NOT_FOUND', 'NETWORK', 'UNKNOWN'];

    it('cinq causes, cinq messages distincts et non vides', () => {
        const messages = CAUSES.map((c) => messageEchecMarche(c, 'finnhub'));
        expect(new Set(messages).size).toBe(CAUSES.length);
        for (const m of messages) expect(m.trim().length).toBeGreaterThan(20);
    });

    it('le message envoie au BON endroit (une clé refusée renvoie aux Réglages, pas le réseau)', () => {
        expect(messageEchecMarche('AUTH', 'finnhub')).toMatch(/Réglages/);
        expect(messageEchecMarche('NETWORK', 'finnhub')).not.toMatch(/Réglages|clé/i);
        expect(messageEchecMarche('RATE_LIMIT', 'finnhub')).not.toMatch(/Réglages|clé/i);
    });
});
