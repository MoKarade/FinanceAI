/**
 * [FX-TAUX-JAMAIS-ARRIVES] La lecture Banque du Canada : ce qu'elle rend, et sa CAUSE.
 *
 * ⚠️ Avant ce lot, quatre pannes très différentes rendaient le même résultat muet : une coupure
 * réseau, un 500 du serveur, une réponse vide et un repli PARTIEL sortaient toutes par le bas de la
 * fonction sans que rien ne les distingue. L'écran ne pouvait alors dire qu'une chose — « taux
 * estimés » — donc il envoyait chercher la même solution pour tous les cas
 * (`UN-SERVICE-QUI-REND-LA-MEME-VALEUR-POUR-N-SITUATIONS-REND-SON-ECRAN-MUET`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../services/errorLogger', () => ({ logError: vi.fn(), logErrorThrottled: vi.fn() }));

import { fetchFxRates } from '../../../services/finance';

const obs = (usd?: unknown, eur?: unknown) => ({
    observations: [{
        d: '2026-09-16',
        ...(usd === undefined ? {} : { FXUSDCAD: { v: usd } }),
        ...(eur === undefined ? {} : { FXEURCAD: { v: eur } }),
    }],
});

function reponse(body: unknown, ok = true, status = 200): Response {
    return { ok, status, json: async () => body } as unknown as Response;
}

beforeEach(() => {
    try { localStorage.clear(); } catch { /* environnement sans Web Storage */ }
    vi.restoreAllMocks();
});
afterEach(() => { vi.restoreAllMocks(); });

describe('succès complet', () => {
    it('rend les deux taux, `source: api`, `cause: ok`', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => reponse(obs('1.3845', '1.4512'))));
        const r = await fetchFxRates({ force: true });
        expect(r.USD).toBe(1.3845);
        expect(r.EUR).toBe(1.4512);
        expect(r.source).toBe('api');
        expect(r.cause).toBe('ok');
        expect(r.estimated).toBe(false);
        expect(r.lastFetched).toBeGreaterThan(0);
    });
});

describe('les pannes se DISTINGUENT', () => {
    it('réseau coupé → `cause: reseau`, et surtout PAS `source: api`', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom'); }));
        const r = await fetchFxRates({ force: true });
        expect(r.cause).toBe('reseau');
        expect(r.source).toBe('repli');
        expect(r.lastFetched).toBe(0); // aucune lecture réussie n'est prétendue
    });

    it('⚠️ erreur HTTP → `cause: http`, distincte du réseau', async () => {
        // Avant ce lot, le `if (response.ok)` n'avait pas de `else` : un 500 tombait dans le MÊME
        // silence qu'une coupure, alors que les deux ne se corrigent pas pareil.
        vi.stubGlobal('fetch', vi.fn(async () => reponse({}, false, 503)));
        const r = await fetchFxRates({ force: true });
        expect(r.cause).toBe('http');
        expect(r.source).toBe('repli');
    });

    it('réponse sans observation → `cause: reponse-illisible`', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => reponse({ observations: [] })));
        const r = await fetchFxRates({ force: true });
        expect(r.cause).toBe('reponse-illisible');
    });

    it('⚠️ succès PARTIEL → `cause: partiel` ET `source: repli`', async () => {
        // Une série manquante fait retomber CE taux sur le littéral du dépôt. Le classer `api`
        // donnerait à un chiffre inventé l'autorité d'écrire un total de compte — le défaut exact
        // que ce lot corrige, une marche plus bas.
        vi.stubGlobal('fetch', vi.fn(async () => reponse(obs('1.3845', undefined))));
        const r = await fetchFxRates({ force: true });
        expect(r.USD).toBe(1.3845);
        expect(r.EUR).toBe(1.47); // le repli
        expect(r.cause).toBe('partiel');
        expect(r.source).toBe('repli');
        expect(r.estimated).toBe(true);
    });
});

describe('`force` — sans lui le bouton « Réessayer » serait un no-op', () => {
    it('sans force, une 2e lecture rend le CACHE sans rappeler le réseau', async () => {
        const f = vi.fn(async () => reponse(obs('1.3845', '1.4512')));
        vi.stubGlobal('fetch', f);
        await fetchFxRates({ force: true });
        await fetchFxRates();
        expect(f).toHaveBeenCalledTimes(1);
    });

    it('avec force, le réseau est RAPPELÉ même quand le cache est frais', async () => {
        const f = vi.fn(async () => reponse(obs('1.3845', '1.4512')));
        vi.stubGlobal('fetch', f);
        await fetchFxRates({ force: true });
        await fetchFxRates({ force: true });
        expect(f).toHaveBeenCalledTimes(2);
    });
});

describe('repli sur le cache — la provenance survit, la CAUSE est celle du jour', () => {
    it('un taux d\'hier reste un taux de la BdC, mais la cause dit l\'échec d\'aujourd\'hui', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => reponse(obs('1.3845', '1.4512'))));
        await fetchFxRates({ force: true });                 // remplit le cache persistant
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('coupure'); }));
        const r = await fetchFxRates({ force: true });

        expect(r.USD).toBe(1.3845);      // on préfère un vrai taux périmé à un chiffre inventé
        expect(r.source).toBe('api');    // sa PROVENANCE n'a pas changé
        expect(r.cause).toBe('reseau');  // mais le diagnostic ne dit pas « tout va bien »
    });
});
