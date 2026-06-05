// tests/services/finance.test.ts
// Couverture de services/finance.ts :
// fetchPortfolioHistory (stub vide), fetchAssetHistory (stub vide),
// fetchFxRates (cache mémoire, fallback localStorage, fallback par défaut).

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Réinitialiser le module entre les tests pour éviter la pollution du cache
// en mémoire (cachedFxRates est un module-level state).
beforeEach(() => {
    vi.resetModules();
});

describe('fetchPortfolioHistory', () => {
    it('retourne toujours un tableau vide (Google Sheet supprimé)', async () => {
        // Arrange
        const { fetchPortfolioHistory } = await import('../../services/finance');

        // Act
        const result = await fetchPortfolioHistory();

        // Assert — stub permanent depuis suppression du Google Sheet
        expect(result).toEqual([]);
    });
});

describe('fetchAssetHistory', () => {
    it('retourne un objet avec history vide et fromCache true quand pas de données', async () => {
        // Arrange
        const { fetchAssetHistory } = await import('../../services/finance');

        // Act
        const result = await fetchAssetHistory('AAPL', 'USD', 150, 10);

        // Assert — fetchPortfolioHistory retourne [], donc colKey introuvable
        expect(result.history).toEqual([]);
        expect(result.fromCache).toBe(true);
    });
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
    });
});
