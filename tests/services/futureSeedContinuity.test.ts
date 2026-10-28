// tests/services/futureSeedContinuity.test.ts
//
// Garde anti-« falaise » passé↔futur (onglet Futur).
//
// Bug corrigé (2026-05-28) : le futur démarrait avec ZÉRO placement parce que
// FutureProjection.tsx peuplait ses soldes de départ via fetchPortfolioHistory()
// — un stub mort renvoyant [] — au lieu de la reconstruction du passé. Tout le
// portefeuille (REER/CELI/NonReg, centaines de k$) « disparaissait » au mois 0.
//
// Ce test exerce EXACTEMENT la fonction que le composant exécute désormais
// (deriveStartingBalancesFromHistory), branchée sur la VRAIE reconstruction
// (reconstructPortfolioHistory) appliquée aux avoirs de chaque persona. Pas de
// réplique de logique → impossible que le test passe pendant que le composant
// est cassé (le piège de l'ancienne garde, qui comparait deux répliques).

import { describe, it, expect } from 'vitest';
import { TEST_PERSONAS } from '../../services/testPersonas';
import { reconstructPortfolioHistory, type MinimalAsset } from '../../services/history/reconstructPortfolioHistory';
import { deriveStartingBalancesFromHistory } from '../../services/history/startingBalancesFromHistory';
import { getEffectivePurchases } from '../../utils/assetPurchases';
import type { Asset } from '../../types';

function toMinimal(a: Asset): MinimalAsset {
    return {
        symbol: a.symbol,
        quantity: a.quantity || 0,
        currency: a.currency || 'CAD',
        currentPrice: a.currentPrice || 0,
        accountType: a.accountType,
        dateBought: a.dateBought,
        purchases: getEffectivePurchases(a),
        priceHistory: (a.priceHistory || []).map((p) => ({ date: p.date, price: p.price })),
    };
}

function seedFor(assets: Asset[]) {
    const { points } = reconstructPortfolioHistory(assets.map(toMinimal), {});
    return { points, seed: deriveStartingBalancesFromHistory(points) };
}

describe('Futur — amorçage des soldes depuis la reconstruction (anti-falaise)', () => {
    it('tableau vide → soldes tous nuls (pas de faux portefeuille)', () => {
        const s = deriveStartingBalancesFromHistory([]);
        expect(s.TOTAL).toBe(0);
        expect(s.REER).toBe(0);
        expect(s.CELI).toBe(0);
    });

    for (const persona of TEST_PERSONAS) {
        it(`${persona.emoji} ${persona.label} — le futur démarre sur le portefeuille (≠ 0 si avoirs)`, () => {
            const state = persona.build();
            const assets = (state.assets ?? []) as Asset[];
            const { points, seed } = seedFor(assets);

            if (assets.length === 0) {
                expect(seed.TOTAL).toBe(0);
                return;
            }

            // RÉGRESSION : le bug donnait TOTAL = 0 alors que des avoirs existent.
            // [R6] Seuil = 0 (pas 1000) : un persona « fauché » peut avoir un MICRO-actif
            // CELI (~182 $). La VALEUR exacte du seed est validée par la continuité ci-dessous
            // (seed == dernier point reconstruit) ; ici on garde seulement « ≠ 0 si avoirs ».
            expect(points.length).toBeGreaterThan(0);
            expect(seed.TOTAL).toBeGreaterThan(0);

            // CONTINUITÉ : le seed du futur DOIT être le dernier point reconstruit
            // (le passé se termine dessus) → jonction sans saut au niveau données.
            const last = points[points.length - 1];
            const lastTotal = (last.CELI || 0) + (last.CELIAPP || 0) + (last.REER || 0)
                + (last.REEE || 0) + (last.NonReg || 0) + (last.Crypto || 0);
            expect(seed.TOTAL).toBeCloseTo(lastTotal, 2);
            expect(seed.REER).toBeCloseTo(last.REER || 0, 2);
            expect(seed.CELI).toBeCloseTo(last.CELI || 0, 2);
            expect(seed.NON_ENREG).toBeCloseTo(last.NonReg || 0, 2);
            expect(seed.CRYPTO).toBeCloseTo(last.Crypto || 0, 2);
        });
    }

    it('Diane & Robert (riches) — REER de départ du futur > 400k (le bug donnait 0)', () => {
        const d = TEST_PERSONAS.find((p) => p.id === 'pre-retraite-riche')!.build();
        const { seed } = seedFor((d.assets ?? []) as Asset[]);
        expect(seed.REER).toBeGreaterThan(400000);
        expect(seed.TOTAL).toBeGreaterThan(600000);
    });

    it('Karim (immigré) — CELI + REER + Crypto de départ tous > 0', () => {
        const k = TEST_PERSONAS.find((p) => p.id === 'karim-immigre')!.build();
        const { seed } = seedFor((k.assets ?? []) as Asset[]);
        expect(seed.CELI).toBeGreaterThan(0);
        expect(seed.REER).toBeGreaterThan(0);
        expect(seed.CRYPTO).toBeGreaterThan(0);
    });
});
