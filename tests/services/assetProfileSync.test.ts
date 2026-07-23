// tests/services/assetProfileSync.test.ts
//
// [INVEST-ALLOC-GEO-SECTOR] Auto-remplissage Asset.sector/region depuis le profil provider :
// seulement les actifs NON résolus, seulement l'information UTILE, jamais d'écrasement.

import { describe, it, expect, vi } from 'vitest';
import { hydrateAssetProfiles, applyProfilePatches } from '../../services/assetProfileSync';
import type { Asset } from '../../types';
import type { AssetProfile } from '../../services/marketData';

const mk = (over: Partial<Asset>): Asset => ({
    symbol: 'ZZZZ.XX', quantity: 10, currency: 'EUR', currentPrice: 30, name: 'x',
    performance: 0, dateBought: '2026-01-10',
    ...over,
} as Asset);

const profile = (over: Partial<AssetProfile>): AssetProfile => ({
    symbol: 'ZZZZ.XX', name: 'Mystère SA', sector: 'Industrie', region: 'Europe',
    dividendYield: 0, currency: 'EUR',
    ...over,
} as AssetProfile);

describe('hydrateAssetProfiles', () => {
    it('remplit SEULEMENT les actifs non résolus (champ/seed/crypto sautés, zéro appel)', async () => {
        const getProfile = vi.fn(async () => profile({}));
        const res = await hydrateAssetProfiles([
            mk({}),                                                    // unknown → appel
            mk({ symbol: 'AAAA.XX', sector: 'Finance' }),              // champ présent → skip
            mk({ symbol: 'CW8.PA' }),                                  // seed normalisé → skip
            mk({ symbol: 'BTC-CAD' }),                                 // crypto → skip
        ], { getProfile, sleep: async () => {} });
        expect(getProfile).toHaveBeenCalledTimes(1);
        expect(getProfile).toHaveBeenCalledWith('ZZZZ.XX');
        expect(res.get('ZZZZ.XX')).toEqual({ sector: 'Industrie', region: 'Europe' });
    });

    it('utilise le symbole de cotation résolu (historySymbol) pour interroger le provider', async () => {
        const getProfile = vi.fn(async () => profile({}));
        await hydrateAssetProfiles([mk({ historySymbol: 'ZZZZ.PA' })], { getProfile, sleep: async () => {} });
        expect(getProfile).toHaveBeenCalledWith('ZZZZ.PA');
    });

    it('n\'écrit QUE l\'information utile : « Autre »/« Global » (défauts du mapping) ne figent rien', async () => {
        const getProfile = vi.fn(async () => profile({ sector: 'Autre', region: 'Global' }));
        const res = await hydrateAssetProfiles([mk({})], { getProfile, sleep: async () => {} });
        expect(res.size).toBe(0); // rien de persisté → un meilleur remplissage reste possible
    });

    it('provider muet (null) ou en échec (throw) → skip silencieux/tracé, la passe continue', async () => {
        const getProfile = vi.fn()
            .mockResolvedValueOnce(null)
            .mockRejectedValueOnce(new Error('boom'))
            .mockResolvedValueOnce(profile({ symbol: 'CCCC.XX' }));
        const res = await hydrateAssetProfiles([
            mk({}), mk({ symbol: 'BBBB.XX' }), mk({ symbol: 'CCCC.XX' }),
        ], { getProfile, sleep: async () => {} });
        expect(res.size).toBe(1);
        expect(res.has('CCCC.XX')).toBe(true);
    });

    it('hasProvider absent pour le symbole → aucun appel ni pacing payé', async () => {
        const getProfile = vi.fn();
        const sleep = vi.fn(async () => {});
        await hydrateAssetProfiles([mk({})], { getProfile, sleep, hasProvider: () => false });
        expect(getProfile).not.toHaveBeenCalled();
        expect(sleep).not.toHaveBeenCalled();
    });
});

describe('applyProfilePatches', () => {
    it('applique par symbole sans JAMAIS écraser un champ déjà présent (édition utilisateur prime)', () => {
        const patches = new Map([['ZZZZ.XX', { sector: 'Industrie', region: 'Europe' }]]);
        const out = applyProfilePatches([
            mk({}),                                       // reçoit les deux
            mk({ symbol: 'ZZZZ.XX', sector: 'Finance' }), // sector édité pendant la passe → conservé
        ], patches);
        expect(out[0].sector).toBe('Industrie');
        expect(out[0].region).toBe('Europe');
        expect(out[1].sector).toBe('Finance');            // pas écrasé
        expect(out[1].region).toBe('Europe');             // complété
    });
});
