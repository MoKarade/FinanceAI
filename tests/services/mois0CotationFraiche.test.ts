// tests/services/mois0CotationFraiche.test.ts
//
// [FUTUR-MOIS0-CLOTURE-SANS-AGE] Le DERNIER point de la reconstruction — celui qui sert de mois 0
// au moteur et de raccord à la courbe Futur — préférait une clôture PÉRIMÉE à une cotation fraîche.
//
// Mesuré sur l'état réel de Marc le 2026-09-17 : mois 0 à 231 849 $ contre 245 687 $ de titres au
// prix courant, soit −13 838 $ (−5,6 %) au départ de TOUTE la projection.
//
// ⚠️ LE CONTRÔLE LE PLUS IMPORTANT DE CE FICHIER EST CELUI QUI VÉRIFIE QUE LE PASSÉ NE BOUGE PAS.
// Le remède « évident » (borner la péremption à toutes les dates) aurait réécrit la courbe du passé
// au prix du JOUR. Pour une date passée, le dernier close connu est la meilleure estimation.

import { describe, it, expect } from 'vitest';
import {
    reconstructPortfolioHistory,
    reconstructPortfolioHistoryDaily,
    STALE_PRICE_DAYS,
    type MinimalAsset,
} from '../../services/history/reconstructPortfolioHistory';

const FX = { USD: 1.35, EUR: 1.45 };
/** Horloge FIXE : « périmé » ne doit pas dépendre du jour où la CI tourne. */
const AUJOURDHUI = new Date('2026-09-17T12:00:00Z');
const MS_JOUR = 86_400_000;

const jour = (joursAvant: number): string =>
    new Date(AUJOURDHUI.getTime() - joursAvant * MS_JOUR).toISOString().slice(0, 10);

/** Un titre CAD à 1 unité : la valeur du panier vaut EXACTEMENT le prix retenu. */
const titre = (over: Partial<MinimalAsset> = {}): MinimalAsset => ({
    symbol: 'XEQT.TO',
    quantity: 1,
    currency: 'CAD',
    currentPrice: 200,
    accountType: 'NON-ENREG',
    dateBought: jour(400),
    purchases: [{ date: jour(400), quantity: 1, price: 100 }],
    // Historique qui S'ARRÊTE il y a 30 jours : périmé au sens de `STALE_PRICE_DAYS`.
    priceHistory: [
        { date: jour(400), price: 100 },
        { date: jour(30), price: 150 },
    ],
    ...over,
});

const dernier = (a: MinimalAsset) => {
    const r = reconstructPortfolioHistory([a], FX, { today: AUJOURDHUI });
    return { point: r.points[r.points.length - 1], coverage: r.coverage, points: r.points };
};

describe('[FUTUR-MOIS0-CLOTURE-SANS-AGE] clôture périmée vs cotation fraîche', () => {
    it('clôture périmée + cotation FRAÎCHE → le dernier point prend la cotation', () => {
        const { point, coverage } = dernier(titre({ priceUpdatedAt: AUJOURDHUI.getTime() - MS_JOUR }));
        // 200 (cotation du jour), pas 150 (close d'il y a 30 jours).
        expect(Number(point.NonReg)).toBeCloseTo(200, 2);
        // ⚠️ Et ce n'est PAS compté comme un « vrai prix » : sans ça `coverage` restait ≈ 1,0 et
        // l'avertissement « partiellement estimé » ne tirait JAMAIS.
        expect(coverage).toBeLessThan(0.99);
    });

    it('CONTRÔLE NÉGATIF : cotation elle-même PÉRIMÉE → on garde la clôture', () => {
        // Sans ce cas, on remplacerait un chiffre vieux par un autre chiffre vieux, et le test
        // ci-dessus passerait tout autant. La fraîcheur est VÉRIFIÉE, jamais supposée.
        const vieille = AUJOURDHUI.getTime() - (STALE_PRICE_DAYS + 5) * MS_JOUR;
        const { point, coverage } = dernier(titre({ priceUpdatedAt: vieille }));
        expect(Number(point.NonReg)).toBeCloseTo(150, 2);
        expect(coverage).toBeCloseTo(1, 3);
    });

    it('CONTRÔLE NÉGATIF : sans `priceUpdatedAt` du tout → on garde la clôture', () => {
        // Le champ est optionnel : un appelant qui ne le transmet pas ne doit PAS déclencher la
        // substitution — il n'a rien dit de la fraîcheur, ce n'est pas « c'est frais ».
        expect(Number(dernier(titre({ priceUpdatedAt: undefined })).point.NonReg)).toBeCloseTo(150, 2);
    });

    it('CONTRÔLE NÉGATIF : clôture RÉCENTE → rien ne change, la cotation ne gagne pas', () => {
        const recent = titre({
            priceUpdatedAt: AUJOURDHUI.getTime(),
            priceHistory: [{ date: jour(400), price: 100 }, { date: jour(1), price: 150 }],
        });
        expect(Number(dernier(recent).point.NonReg)).toBeCloseTo(150, 2);
    });

    it("LE PASSÉ N'EST PAS RÉÉCRIT : les points antérieurs gardent leur clôture", () => {
        // C'est LA garantie qui distingue ce correctif du remède « évident » (borner partout), qui
        // aurait appliqué le prix d'AUJOURD'HUI à des dates passées.
        const { points } = dernier(titre({ priceUpdatedAt: AUJOURDHUI.getTime() }));
        expect(points.length).toBeGreaterThan(2);
        // Le mois précédent tombe après le close d'il y a 30 j : il garde 150, pas 200.
        expect(Number(points[points.length - 2].NonReg)).toBeCloseTo(150, 2);
        // Et un point ANCIEN garde le premier close, jamais la cotation du jour.
        expect(Number(points[0].NonReg)).toBeCloseTo(100, 2);
    });
});

describe('[FUTUR-MOIS0-CLOTURE-SANS-AGE] la garde qui TRAVERSE — jusqu\'au mois 0 du moteur', () => {
    // ⚠️ Les cas ci-dessus testent le PRODUCTEUR. Entre lui et le mois 0 il y a un mapper
    // (`derivePortfolioStartingBalances`), et c'est LUI qui pouvait rendre le correctif inerte :
    // `priceUpdatedAt` est un champ NEUF de `MinimalAsset`, et un mapper qui ne le transmet pas
    // laisse la condition de fraîcheur toujours fausse — vert en test, inerte en prod
    // (`CORRECTIF-VERT-EN-TEST-INERTE-EN-PROD`, `UN-TROU-ENTRE-DEUX-MOITIES-TESTEES-N-APPARTIENT-A-PERSONNE`).
    //
    // ⚠️ Et c'est aussi l'EXPLICATION du « aucun golden n'a bougé » de ce lot : mesuré, AUCUN
    // persona ni fixture du dépôt ne porte `priceUpdatedAt`. Zéro golden rouge mesure donc
    // l'absence de COUVERTURE, pas l'absence d'effet.
    it('un titre à clôture périmée mais cotation fraîche démarre la projection au prix du jour', async () => {
        const { derivePortfolioStartingBalances } = await import(
            '../../services/projection/startingBalancesFromAssets');
        const actif = {
            symbol: 'XEQT.TO', name: 'x', quantity: 1, currency: 'CAD', currentPrice: 200,
            performance: 0, accountType: 'NON-ENREG', dateBought: jour(400),
            purchases: [{ date: jour(400), quantity: 1, price: 100 }],
            priceHistory: [{ date: jour(400), price: 100 }, { date: jour(30), price: 150 }],
            priceUpdatedAt: Date.now(),
        } as unknown as Parameters<typeof derivePortfolioStartingBalances>[0][number];

        const soldes = derivePortfolioStartingBalances([actif], FX);
        // 200 = la cotation fraîche. 150 = la clôture d'il y a 30 jours (comportement d'avant).
        expect(soldes.NON_ENREG).toBeCloseTo(200, 2);
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// [PASSE-JOUR-CLOTURE-PERIMEE] Le MÊME défaut chez le SECOND producteur — trouvé par Marc.
//
// Le correctif ci-dessus ne touchait que la boucle MENSUELLE. La courbe que Marc regarde (le
// registre au JOUR) passe par `reconstructPortfolioHistoryDaily`, un producteur distinct, et
// gardait ses clôtures périmées : dernier point à **233 618 $** de titres contre **245 771 $** au
// prix courant, avec le badge « prix J−55 » qui nommait la cause sans que rien ne la corrige.
// Classe `MODULE-ECRIT-HORS-CHECKLIST` : énumérer TOUS les producteurs, jamais celui du ticket.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('[PASSE-JOUR-CLOTURE-PERIMEE] la reconstruction au JOUR applique la même règle', () => {
    const serie = (a: MinimalAsset, jours = 10) =>
        reconstructPortfolioHistoryDaily([a], FX, jour(jours), jour(0));

    it('le DERNIER jour prend la cotation fraîche, et le badge d\'âge retombe à 0', () => {
        // ⚠️ DISCRIMINANT : sur le code d'avant, le dernier jour valait 150 (close d'il y a 30 j)
        // et `priceAgeMaxDays` valait 30 — exactement le « prix J−55 » que Marc voyait.
        const pts = serie(titre({ priceUpdatedAt: AUJOURDHUI.getTime() - MS_JOUR }));
        const dernierPt = pts[pts.length - 1];
        expect(Number(dernierPt.NonReg)).toBeCloseTo(200, 2);
        expect(dernierPt.priceAgeMaxDays).toBe(0);
    });

    it('LE PASSÉ N\'EST PAS RÉÉCRIT : les jours antérieurs gardent leur clôture périmée', () => {
        // Le contrôle qui compte le plus : substituer partout appliquerait le prix du JOUR à des
        // dates passées. Chaque jour sauf le dernier reste à 150, avec son âge qui grandit.
        const pts = serie(titre({ priceUpdatedAt: AUJOURDHUI.getTime() - MS_JOUR }));
        expect(pts.length).toBeGreaterThan(5);
        for (let k = 0; k < pts.length - 1; k++) {
            expect(Number(pts[k].NonReg), pts[k].date).toBeCloseTo(150, 2);
            expect(pts[k].priceAgeMaxDays, pts[k].date).toBeGreaterThan(STALE_PRICE_DAYS);
        }
    });

    it('CONTRÔLE NÉGATIF : clôture RÉCENTE → la cotation ne gagne pas, même au dernier jour', () => {
        const recent = titre({
            priceUpdatedAt: AUJOURDHUI.getTime(),
            priceHistory: [{ date: jour(400), price: 100 }, { date: jour(1), price: 150 }],
        });
        const pts = serie(recent);
        expect(Number(pts[pts.length - 1].NonReg)).toBeCloseTo(150, 2);
    });

    it('CONTRÔLE NÉGATIF : sans `priceUpdatedAt`, on garde la clôture périmée', () => {
        const pts = serie(titre());
        expect(Number(pts[pts.length - 1].NonReg)).toBeCloseTo(150, 2);
        expect(pts[pts.length - 1].priceAgeMaxDays).toBeGreaterThan(STALE_PRICE_DAYS);
    });

    it('une fenêtre qui se termine dans le PASSÉ ne se fait pas réécrire au prix du jour', () => {
        // ⚠️ La garde en VALEUR ABSOLUE. Un écart SIGNÉ (`ref - priceUpdatedAt`) est négatif ici,
        // donc « ≤ seuil » était vrai : la cotation d'aujourd'hui aurait valorisé un dernier point
        // vieux de 60 jours. C'est le cas d'un appelant qui demande une fenêtre historique.
        const a = titre({ priceUpdatedAt: AUJOURDHUI.getTime() });
        const pts = reconstructPortfolioHistoryDaily([a], FX, jour(70), jour(60));
        // 100 = le close de J−400, le seul ANTÉRIEUR à J−60 (celui de J−30 est postérieur). Ce qui
        // compte est que ce ne soit PAS 200 : la cotation du jour n'a rien à faire sur ce point.
        expect(Number(pts[pts.length - 1].NonReg)).toBeCloseTo(100, 2);
        expect(Number(pts[pts.length - 1].NonReg)).not.toBeCloseTo(200, 2);
    });
});
