// tests/services/valorisation/valoriser.test.ts
//
// [PTF-L1D-VALORISATION] Le moteur de valorisation du grand livre.
//
// ⚠️ L'identité « variation = cours + change + mouvements » est vraie PAR ALGÈBRE dès que le moteur
// calcule lui-même ses trois effets (les mouvements y sont le reste) : l'asserter ne prouverait RIEN.
// Ce qui prouve, c'est un ORACLE qui ne passe pas par le moteur — ici chaque attendu est écrit à la
// main à partir des CONSTANTES du scénario (quantités, cours, taux), jamais à partir de ce que le
// moteur publie. Et les scénarios sont choisis là où un moteur faux se trahit : un fractionnement,
// un transfert en transit, un achat en cours de fenêtre, un dépôt en devise.
// Toutes les données sont SYNTHÉTIQUES (ISIN au préfixe non attribué `ZZ`).
import { describe, it, expect } from 'vitest';
import type { BrokerLedgerEvent } from '../../../types';
import { magasinVide, type MagasinMarche, type PointCloture, type PointTaux } from '../../../services/marche/magasinMarche';
import { valoriserAu, variationEntre } from '../../../services/valorisation/valoriser';

const source = { kind: 'releve-courtier', date: '2026-07-31' } as const;
const A = 'ZZ0000000001'; // coté en USD
const B = 'ZZ0000000002'; // coté en CAD
const AGE = 5;

function magasin(cloturesA: PointCloture[], cloturesB: PointCloture[], usd: PointTaux[]): MagasinMarche {
    return {
        ...magasinVide('2026-07-31T21:00:00.000Z'),
        clotures: {
            [A]: { devise: 'USD', points: cloturesA },
            [B]: { devise: 'CAD', points: cloturesB },
        },
        taux: { USD: usd },
    };
}
const e = (x: Omit<BrokerLedgerEvent, 'source'> & Record<string, unknown>) => ({ source, ...x }) as BrokerLedgerEvent;
const ok = (r: ReturnType<typeof variationEntre>) => {
    if (r.statut !== 'ok') throw new Error(`attendu : variation complète, reçu ${r.statut}`);
    return r.variation;
};
const PRECIS = 9; // `toBeCloseTo(x, 9)` : écart < 5e-10 $, aucune tolérance de confort

describe('[PTF-L1D] valorisation à une date', () => {
    it('livre jamais importé → null ; importé et vide → total 0 exactement', () => {
        const m = magasin([], [], []);
        expect(valoriserAu(undefined, m, '2026-07-10', AGE)).toBeNull();
        expect(valoriserAu([], m, '2026-07-10', AGE)).toEqual({ date: '2026-07-10', titres: [], especes: [], totalCad: 0, manquants: [] });
    });

    it('titres × cours × taux + encaisse × taux, non arrondi (oracle écrit à la main)', () => {
        const m = magasin([['2026-07-10', 40.37, 'eodhd']], [['2026-07-10', 12.11, 'eodhd']], [['2026-07-10', 1.3871]]);
        const livre = [
            e({ id: '1', date: '2026-07-01', accountId: 'courtier-usd', kind: 'transfert-entrant', isin: A, quantity: 7 }),
            e({ id: '2', date: '2026-07-01', accountId: 'courtier-cad', kind: 'transfert-entrant', isin: B, quantity: 13 }),
            e({ id: '3', date: '2026-07-02', accountId: 'courtier-usd', kind: 'depot-especes', amount: { value: 100.01, currency: 'USD' } }),
        ];
        const v = valoriserAu(livre, m, '2026-07-10', AGE)!;
        expect(v.manquants).toEqual([]);
        expect(v.totalCad).toBeCloseTo(7 * 40.37 * 1.3871 + 13 * 12.11 + 100.01 * 1.3871, PRECIS);
        // Aucun arrondi au cent (garantie 2) : la ligne USD n'est pas un nombre de cents entier.
        const ligneA = v.titres.find((l) => l.isin === A)!;
        expect(Math.round(ligneA.valeurCad * 100) / 100).not.toBe(ligneA.valeurCad);
    });

    it('le cours d\'un jour sans séance est REPORTÉ et le dit ; au-delà de l\'âge maximal → total null', () => {
        const m = magasin([['2026-07-10', 40, 'eodhd']], [], [['2026-07-10', 1.4]]);
        const livre = [e({ id: '1', date: '2026-07-01', accountId: 'courtier-usd', kind: 'transfert-entrant', isin: A, quantity: 2 })];
        const samedi = valoriserAu(livre, m, '2026-07-11', AGE)!;
        expect(samedi.titres[0]).toMatchObject({ statutCours: 'reportee', statutTaux: 'reportee' });
        expect(samedi.totalCad).toBeCloseTo(2 * 40 * 1.4, PRECIS);
        const tard = valoriserAu(livre, m, '2026-07-20', AGE)!;
        expect(tard.totalCad).toBeNull();
        expect(tard.manquants).toEqual(expect.arrayContaining([
            { type: 'cours', compte: 'courtier-usd', isin: A, statut: 'perimee' },
            { type: 'taux', devise: 'USD', statut: 'perimee' },
        ]));
    });

    it('UN TOTAL AMPUTÉ EST UN FAUX : un seul titre sans cours → total null, l\'autre ligne reste visible', () => {
        const m = magasin([['2026-07-10', 40, 'eodhd']], [], [['2026-07-10', 1.4]]);
        const livre = [
            e({ id: '1', date: '2026-07-01', accountId: 'courtier-usd', kind: 'transfert-entrant', isin: A, quantity: 2 }),
            e({ id: '2', date: '2026-07-01', accountId: 'courtier-cad', kind: 'transfert-entrant', isin: B, quantity: 5 }),
        ];
        const v = valoriserAu(livre, m, '2026-07-10', AGE)!;
        expect(v.totalCad).toBeNull();
        expect(v.manquants).toEqual([{ type: 'cours', compte: 'courtier-cad', isin: B, statut: 'absente' }]);
        expect(v.titres.map((l) => l.isin)).toEqual([A]);
    });

    it('un événement écarté par le livre (quantité négative) → total null, jamais la somme du reste', () => {
        const m = magasin([['2026-07-10', 40, 'eodhd']], [], [['2026-07-10', 1.4]]);
        const livre = [
            e({ id: '1', date: '2026-07-01', accountId: 'courtier-usd', kind: 'transfert-entrant', isin: A, quantity: 2 }),
            e({ id: '2', date: '2026-07-02', accountId: 'courtier-usd', kind: 'transfert-entrant', isin: A, quantity: -1 }),
        ];
        const v = valoriserAu(livre, m, '2026-07-10', AGE)!;
        expect(v.totalCad).toBeNull();
        expect(v.manquants).toEqual([{ type: 'livre', anomalie: { type: 'valeur-non-positive', id: '2', champ: 'quantity' } }]);
    });
});

describe('[PTF-L1D] ZÉRO ARTEFACT : un mouvement ne se lit jamais comme une performance', () => {
    // Cours et taux IDENTIQUES à chaque jour de la fenêtre : toute variation est un mouvement.
    const plat = magasin(
        [['2026-07-09', 50, 'eodhd'], ['2026-07-10', 50, 'eodhd'], ['2026-07-13', 50, 'eodhd'], ['2026-07-14', 50, 'eodhd']],
        [['2026-07-09', 20, 'eodhd'], ['2026-07-10', 20, 'eodhd'], ['2026-07-13', 20, 'eodhd'], ['2026-07-14', 20, 'eodhd']],
        [['2026-07-09', 1.4], ['2026-07-10', 1.4], ['2026-07-13', 1.4], ['2026-07-14', 1.4]],
    );

    it('jour sans aucun mouvement → variation 0 EXACTEMENT (pas « à peu près »)', () => {
        const livre = [
            e({ id: '1', date: '2026-07-01', accountId: 'courtier-usd', kind: 'transfert-entrant', isin: A, quantity: 3 }),
            e({ id: '2', date: '2026-07-01', accountId: 'courtier-usd', kind: 'depot-especes', amount: { value: 12.34, currency: 'USD' } }),
        ];
        const v = ok(variationEntre(livre, plat, '2026-07-09', '2026-07-10', AGE));
        expect([v.effetCours, v.effetChange, v.mouvements]).toEqual([0, 0, 0]);
    });

    it('TRANSIT : titres sortis d\'un compte le 10, entrés dans un autre le 13 → effets nuls, tout est mouvement', () => {
        const livre = [
            e({ id: '1', date: '2026-07-01', accountId: 'courtier-usd', kind: 'transfert-entrant', isin: A, quantity: 4 }),
            e({ id: '2', date: '2026-07-10', accountId: 'courtier-usd', kind: 'transfert-sortant', isin: A, quantity: 4 }),
            e({ id: '3', date: '2026-07-13', accountId: 'hors-courtier', kind: 'transfert-entrant', isin: A, quantity: 4 }),
        ];
        const pendant = ok(variationEntre(livre, plat, '2026-07-09', '2026-07-10', AGE));
        expect([pendant.effetCours, pendant.effetChange]).toEqual([0, 0]);
        expect(pendant.mouvements).toBeCloseTo(-(4 * 50 * 1.4), PRECIS);
        const arrivee = ok(variationEntre(livre, plat, '2026-07-10', '2026-07-13', AGE));
        expect([arrivee.effetCours, arrivee.effetChange]).toEqual([0, 0]);
        expect(arrivee.mouvements).toBeCloseTo(4 * 50 * 1.4, PRECIS);
    });

    it('ACHAT au milieu de la fenêtre : effets nuls, mouvement = titres valorisés − espèces réglées (la commission)', () => {
        const livre = [
            e({ id: '1', date: '2026-07-01', accountId: 'courtier-cad', kind: 'depot-especes', amount: { value: 1000, currency: 'CAD' } }),
            e({ id: '2', date: '2026-07-10', accountId: 'courtier-cad', kind: 'achat', isin: B, quantity: 10,
                price: { value: 20, currency: 'CAD' }, amount: { value: 209.95, currency: 'CAD' } }),
        ];
        const v = ok(variationEntre(livre, plat, '2026-07-09', '2026-07-13', AGE));
        expect([v.effetCours, v.effetChange]).toEqual([0, 0]);
        expect(v.mouvements).toBeCloseTo(10 * 20 - 209.95, PRECIS);
    });
});

describe('[PTF-L1D] fractionnement : le cours BRUT tombe, la valeur ne bouge pas', () => {
    // Cours brut : 100 le 09, 10 le 10 (10 pour 1 ce jour-là), puis 11 le 13. Taux plat.
    const m = magasin(
        [['2026-07-09', 100, 'eodhd'], ['2026-07-10', 10, 'eodhd'], ['2026-07-13', 11, 'eodhd']],
        [], [['2026-07-09', 1.4], ['2026-07-10', 1.4], ['2026-07-13', 1.4]],
    );
    const livre = [
        e({ id: '1', date: '2026-07-01', accountId: 'courtier-usd', kind: 'transfert-entrant', isin: A, quantity: 5 }),
        e({ id: '2', date: '2026-07-10', accountId: 'courtier-usd', kind: 'fractionnement', isin: A, splitFrom: 1, splitTo: 10 }),
    ];

    it('le jour du fractionnement : cours, change ET mouvements à 0 exactement', () => {
        const v = ok(variationEntre(livre, m, '2026-07-09', '2026-07-10', AGE));
        expect([v.effetCours, v.effetChange, v.mouvements]).toEqual([0, 0, 0]);
    });

    it('à travers le fractionnement : l\'effet de cours se mesure dans l\'unité d\'APRÈS (50 titres × +1 $)', () => {
        const v = ok(variationEntre(livre, m, '2026-07-09', '2026-07-13', AGE));
        // Oracle : 5 titres à 100 = 50 titres à 10 ; ils valent 11 à la fin → +1 $ × 50 × 1,4.
        expect(v.effetCours).toBeCloseTo(50 * (11 - 10) * 1.4, PRECIS);
        expect(v.effetChange).toBe(0);
        expect(v.mouvements).toBeCloseTo(0, PRECIS);
    });
});

describe('[PTF-L1D] change : titres ET encaisse en devise', () => {
    it('dépôt en USD puis hausse du taux : effet de change = (titres × cours + encaisse) × Δtaux, rien en cours', () => {
        const m = magasin(
            [['2026-07-09', 30, 'eodhd'], ['2026-07-10', 30, 'eodhd']],
            [], [['2026-07-09', 1.35], ['2026-07-10', 1.37]],
        );
        const livre = [
            e({ id: '1', date: '2026-07-01', accountId: 'courtier-usd', kind: 'transfert-entrant', isin: A, quantity: 6 }),
            e({ id: '2', date: '2026-07-01', accountId: 'courtier-usd', kind: 'depot-especes', amount: { value: 250, currency: 'USD' } }),
            e({ id: '3', date: '2026-07-10', accountId: 'courtier-usd', kind: 'depot-especes', amount: { value: 40, currency: 'USD' } }),
        ];
        const v = ok(variationEntre(livre, m, '2026-07-09', '2026-07-10', AGE));
        expect(v.effetCours).toBe(0);
        expect(v.effetChange).toBeCloseTo((6 * 30 + 250) * (1.37 - 1.35), PRECIS);
        // Le dépôt du jour est un mouvement, valorisé au taux de FIN.
        expect(v.mouvements).toBeCloseTo(40 * 1.37, PRECIS);
    });

    it('hausse du cours ET du taux : l\'oracle décompose sans passer par le moteur', () => {
        const m = magasin(
            [['2026-07-09', 30, 'eodhd'], ['2026-07-10', 33, 'eodhd']],
            [], [['2026-07-09', 1.35], ['2026-07-10', 1.37]],
        );
        const livre = [e({ id: '1', date: '2026-07-01', accountId: 'courtier-usd', kind: 'transfert-entrant', isin: A, quantity: 6 })];
        const v = ok(variationEntre(livre, m, '2026-07-09', '2026-07-10', AGE));
        expect(v.effetCours).toBeCloseTo(6 * (33 - 30) * 1.35, PRECIS);
        expect(v.effetChange).toBeCloseTo(6 * 33 * (1.37 - 1.35), PRECIS);
        expect(v.mouvements).toBeCloseTo(0, PRECIS);
    });
});

describe('[PTF-L1D] stabilité : ni l\'avenir, ni l\'ordre, ni le fuseau ne changent le passé', () => {
    const m = magasin(
        [['2026-07-09', 50, 'eodhd'], ['2026-07-10', 51, 'eodhd'], ['2026-07-13', 52, 'eodhd']],
        [], [['2026-07-09', 1.4], ['2026-07-10', 1.41], ['2026-07-13', 1.42]],
    );
    const livre = [
        e({ id: '1', date: '2026-07-01', accountId: 'courtier-usd', kind: 'transfert-entrant', isin: A, quantity: 3 }),
        e({ id: '2', date: '2026-07-02', accountId: 'courtier-usd', kind: 'depot-especes', amount: { value: 10, currency: 'USD' } }),
    ];

    it('ajouter un événement APRÈS la date, ou mélanger le livre, ne change pas la valorisation passée', () => {
        const avant = valoriserAu(livre, m, '2026-07-10', AGE);
        const plusTard = [...livre, e({ id: '3', date: '2026-07-13', accountId: 'courtier-usd', kind: 'transfert-sortant', isin: A, quantity: 3 })];
        expect(valoriserAu(plusTard, m, '2026-07-10', AGE)).toEqual(avant);
        expect(valoriserAu([...livre].reverse(), m, '2026-07-10', AGE)).toEqual(avant);
    });

    it('même résultat, au bit près, sous deux fuseaux de signes opposés', () => {
        const tzOrigine = process.env.TZ;
        try {
            process.env.TZ = 'America/Montreal';
            const decalageOuest = new Date(2026, 6, 10).getTimezoneOffset();
            const ouest = JSON.stringify(variationEntre(livre, m, '2026-07-09', '2026-07-13', AGE));
            process.env.TZ = 'Australia/Sydney';
            const decalageEst = new Date(2026, 6, 10).getTimezoneOffset();
            const est = JSON.stringify(variationEntre(livre, m, '2026-07-09', '2026-07-13', AGE));
            // Anti-vacuité : les deux fuseaux ont bien été appliqués (sinon la comparaison ne dit rien).
            expect(Math.sign(decalageOuest)).toBe(1);
            expect(Math.sign(decalageEst)).toBe(-1);
            expect(est).toBe(ouest);
        } finally {
            process.env.TZ = tzOrigine;
        }
    });
});

describe('[PTF-L1D] variation incomplète ou impossible', () => {
    it('une borne incomplète → statut « incomplete », jamais un chiffre', () => {
        const m = magasin([['2026-07-10', 50, 'eodhd']], [], [['2026-07-10', 1.4]]);
        const livre = [e({ id: '1', date: '2026-07-01', accountId: 'courtier-usd', kind: 'transfert-entrant', isin: A, quantity: 3 })];
        const r = variationEntre(livre, m, '2026-07-09', '2026-07-10', AGE);
        expect(r.statut).toBe('incomplete');
        expect(variationEntre(undefined, m, '2026-07-09', '2026-07-10', AGE)).toEqual({ statut: 'jamais-importe' });
        expect(() => variationEntre(livre, m, '2026-07-10', '2026-07-09', AGE)).toThrow();
    });
});
