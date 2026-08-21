// tests/services/finance.test.ts
// Couverture de services/finance.ts : fetchFxRates (cache mémoire, fallback localStorage, fallback
// par défaut). [PORTFOLIO-HISTORY 2026-07-22] Les stubs fetchPortfolioHistory/fetchAssetHistory ont
// été RETIRÉS (remplacés par services/history/hydrateAssetHistories + buildMarketData) — leurs tests
// de stub avec.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Réinitialiser le module entre les tests pour éviter la pollution du cache
// en mémoire (cachedFxRates est un module-level state).
beforeEach(() => {
    vi.resetModules();
});

describe('fetchFxRates', () => {
    it('retourne les taux par défaut en cas d\'échec réseau', async () => {
        // Arrange — mock fetch pour simuler une erreur réseau
        const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
        vi.stubGlobal('fetch', fetchMock);

        const { fetchFxRates } = await import('../../services/finance');

        // Act
        const rates = await fetchFxRates();

        // Assert — fallback par défaut
        expect(rates.USD).toBe(1.40);
        expect(rates.EUR).toBe(1.47);
        expect(rates.CAD).toBe(1.00);
        expect(rates.estimated).toBe(true); // [FX-FALLBACK-SILENCIEUX]
    });

    it('retourne les taux par défaut si la réponse HTTP est non-ok', async () => {
        // Arrange — mock fetch retourne 500
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
        });
        vi.stubGlobal('fetch', fetchMock);

        const { fetchFxRates } = await import('../../services/finance');

        // Act
        const rates = await fetchFxRates();

        // Assert — fallback
        expect(rates.USD).toBe(1.40);
        expect(rates.EUR).toBe(1.47);
        expect(rates.estimated).toBe(true); // [FX-FALLBACK-SILENCIEUX]
    });

    it('retourne les taux par défaut si la réponse est malformée (pas d\'observations)', async () => {
        // Arrange — mock fetch retourne du JSON invalide (sans observations)
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ observations: [] }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { fetchFxRates } = await import('../../services/finance');

        // Act
        const rates = await fetchFxRates();

        // Assert — pas d'observation → fallback
        expect(rates.USD).toBe(1.40);
        expect(rates.EUR).toBe(1.47);
        expect(rates.estimated).toBe(true); // [FX-FALLBACK-SILENCIEUX]
    });

    it('logue (au lieu de masquer) un taux PRÉSENT mais corrompu, et applique le repli', async () => {
        // Avant : parseFloat(v) || 1.40 confondait « absent » et « corrompu » (0/NaN/texte).
        // logError persiste dans localStorage → on le relit via getErrors (pas de mock à fuir).
        localStorage.clear();
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ observations: [{ FXUSDCAD: { v: '0' }, FXEURCAD: { v: 'abc' } }] }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { fetchFxRates } = await import('../../services/finance');
        const { getErrors } = await import('../../services/errorLogger');
        const rates = await fetchFxRates();

        // repli appliqué ET les deux taux corrompus loggués (pas masqués silencieusement)
        expect(rates.USD).toBe(1.40);
        expect(rates.EUR).toBe(1.47);
        expect(getErrors().filter((e) => /corrompu/i.test(e.message)).length).toBe(2);
        expect(rates.estimated).toBe(true); // [FX-FALLBACK-SILENCIEUX]
        localStorage.clear();
    });

    it('retourne les taux parsés depuis la réponse Banque du Canada', async () => {
        // Arrange — mock fetch retourne des données valides BDC
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                observations: [{
                    FXUSDCAD: { v: '1.3800' },
                    FXEURCAD: { v: '1.5000' },
                }],
            }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { fetchFxRates } = await import('../../services/finance');

        // Act
        const rates = await fetchFxRates();

        // Assert
        expect(rates.USD).toBeCloseTo(1.38, 4);
        expect(rates.EUR).toBeCloseTo(1.50, 4);
        expect(rates.CAD).toBe(1.00);
        expect(rates.lastFetched).toBeGreaterThan(0);
        // [FX-FALLBACK-SILENCIEUX] les DEUX séries sont réelles → pas estimé.
        expect(rates.estimated).toBe(false);
    });

    // [FX-FALLBACK-SILENCIEUX] revue #686 (financial-integrity, MOYEN mesuré) : un succès GLOBAL
    // du fetch (obs présent, lastFetched > 0) peut cacher un repli PAR SÉRIE — AVANT ce correctif,
    // `lastFetched > 0` seul faisait conclure « taux réel » alors qu'UNE des deux devises était
    // inventée. C'est exactement le scénario chiffré par le ticket (~3 000 $ CAD d'erreur sur
    // 100 k$ US à 3 pts d'écart), et il restait invisible.
    it('une SEULE série absente/corrompue → estimated: true MALGRÉ lastFetched > 0 (le bug du ticket)', async () => {
        // [Test précédent leake son cache persistant] `localStorage.clear()` : sinon le check de
        // cache (< 24h) court-circuite AVANT le fetch mocké et rend le résultat du test d'avant.
        localStorage.clear();
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ observations: [{ FXUSDCAD: { v: '1.3800' } /* EUR absent */ }] }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { fetchFxRates } = await import('../../services/finance');
        const rates = await fetchFxRates();

        expect(rates.USD).toBeCloseTo(1.38, 4); // la série RÉELLE reste réelle
        expect(rates.EUR).toBe(1.47);           // la série absente retombe sur le défaut
        expect(rates.lastFetched).toBeGreaterThan(0); // le fetch GLOBAL a bien réussi
        expect(rates.estimated).toBe(true);     // mais le repli PAR SÉRIE doit remonter
        localStorage.clear();
    });
});
