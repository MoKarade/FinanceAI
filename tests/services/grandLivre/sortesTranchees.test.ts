// tests/services/grandLivre/sortesTranchees.test.ts
//
// [PTF-L1A-SORTES-A-TRANCHER] + [PTF-L1B-CONVERSION-VIREMENT] Les quatre sortes tranchées par Marc le
// 2026-09-24 : annulation (on garde la trace), échange (regroupement qui change d'ISIN), coût TOTAL
// gardé tel qu'imprimé, conversion de devises et virement interne en UN SEUL événement.
// Toutes les données sont SYNTHÉTIQUES (ISIN au préfixe non attribué `ZZ`).
import { describe, it, expect } from 'vitest';
import type { BrokerLedgerEvent } from '../../../types';
import { etatDuLivreAu } from '../../../services/grandLivre/etatDuLivre';
import { magasinVide, type MagasinMarche, type PointCloture } from '../../../services/marche/magasinMarche';
import { variationEntre } from '../../../services/valorisation/valoriser';

const source = { kind: 'releve-courtier', date: '2026-07-31' } as const;
const A = 'ZZ0000000001';
const B = 'ZZ0000000002';
const usd = (value: number) => ({ value, currency: 'USD' as const });
const cad = (value: number) => ({ value, currency: 'CAD' as const });
const e = (x: Record<string, unknown>) => ({ source, ...x }) as BrokerLedgerEvent;

describe('annulation : la ligne annulée reste, et cesse d\'avoir un effet à la date de l\'annulation', () => {
    const livre = [
        e({ id: 'd', date: '2026-01-05', accountId: 'courtier-usd', kind: 'depot-especes', amount: usd(1000) }),
        e({ id: 'a', date: '2026-01-10', accountId: 'courtier-usd', kind: 'achat', isin: A, quantity: 5, price: usd(100), amount: usd(509.95) }),
        e({ id: 'x', date: '2026-01-15', accountId: 'courtier-usd', kind: 'annulation', cancelsId: 'a' }),
    ];

    it('avant l\'annulation, l\'achat compte (c\'est ce que disait le relevé de l\'époque)', () => {
        const avant = etatDuLivreAu(livre, '2026-01-14')!;
        expect(avant.positions['courtier-usd']).toEqual({ [A]: 5 });
        expect(avant.especes['courtier-usd']).toEqual({ USD: 490.05 });
    });

    it('à partir de l\'annulation, titres ET espèces reviennent, sans aucune anomalie', () => {
        const apres = etatDuLivreAu(livre, '2026-01-15')!;
        expect(apres.positions).toEqual({});
        expect(apres.especes['courtier-usd']).toEqual({ USD: 1000 });
        expect(apres.anomalies).toEqual([]);
    });

    it('une CORRECTION = annulation + ligne juste : le résultat est celui de la ligne juste', () => {
        const corrige = [...livre, e({ id: 'a2', date: '2026-01-10', accountId: 'courtier-usd', kind: 'achat', isin: A, quantity: 4, price: usd(100), amount: usd(409.95) })];
        const etat = etatDuLivreAu(corrige, '2026-01-31')!;
        expect(etat.positions['courtier-usd']).toEqual({ [A]: 4 });
        expect(etat.especes['courtier-usd']).toEqual({ USD: 590.05 });
    });

    it('annuler une VENTE rend les titres et reprend les espèces (retirer, jamais défaire à la main)', () => {
        const vente = [
            e({ id: 't', date: '2026-01-02', accountId: 'courtier-usd', kind: 'transfert-entrant', isin: A, quantity: 3 }),
            e({ id: 'v', date: '2026-01-03', accountId: 'courtier-usd', kind: 'vente', isin: A, quantity: 3, price: usd(10), amount: usd(29.95) }),
            e({ id: 'xv', date: '2026-01-04', accountId: 'courtier-usd', kind: 'annulation', cancelsId: 'v' }),
        ];
        const etat = etatDuLivreAu(vente, '2026-01-31')!;
        expect(etat.positions['courtier-usd']).toEqual({ [A]: 3 });
        expect(etat.especes).toEqual({});
    });

    it('annulations refusées, chacune nommée par sa raison, et la ligne visée garde son effet', () => {
        const refus = etatDuLivreAu([
            ...livre.slice(0, 2),
            e({ id: 'x1', date: '2026-01-15', accountId: 'courtier-usd', kind: 'annulation', cancelsId: 'inconnu' }),
            e({ id: 'x2', date: '2026-01-09', accountId: 'courtier-usd', kind: 'annulation', cancelsId: 'a' }),
            e({ id: 'x3', date: '2026-01-15', accountId: 'courtier-cad', kind: 'annulation', cancelsId: 'a' }),
            e({ id: 'x4', date: '2026-01-16', accountId: 'courtier-usd', kind: 'annulation', cancelsId: 'x3' }),
        ], '2026-01-31')!;
        expect(refus.positions['courtier-usd']).toEqual({ [A]: 5 });
        expect(refus.anomalies).toEqual([
            { type: 'annulation-invalide', id: 'x2', raison: 'cible-posterieure' },
            { type: 'annulation-invalide', id: 'x1', raison: 'cible-absente' },
            { type: 'annulation-invalide', id: 'x3', raison: 'compte-different' },
            { type: 'annulation-invalide', id: 'x4', raison: 'cible-annulation' },
        ]);
    });

    it('deux annulations de la même ligne : la seconde est refusée (la ligne ne s\'annule qu\'une fois)', () => {
        const etat = etatDuLivreAu([...livre, e({ id: 'x5', date: '2026-01-20', accountId: 'courtier-usd', kind: 'annulation', cancelsId: 'a' })], '2026-01-31')!;
        expect(etat.positions).toEqual({});
        expect(etat.anomalies).toEqual([{ type: 'annulation-invalide', id: 'x5', raison: 'deja-annulee' }]);
    });

    it('une cible AMBIGUË (identifiant en double) n\'est pas devinée', () => {
        const etat = etatDuLivreAu([
            ...livre.slice(0, 2),
            e({ id: 'a', date: '2026-01-11', accountId: 'courtier-usd', kind: 'depot-especes', amount: usd(1) }),
            livre[2],
        ], '2026-01-31')!;
        expect(etat.anomalies).toEqual(expect.arrayContaining([
            { type: 'annulation-invalide', id: 'x', raison: 'cible-ambigue' },
            { type: 'identifiant-en-double', id: 'a' },
        ]));
        expect(etat.positions['courtier-usd']).toEqual({ [A]: 5 });
    });
});

describe('échange : toute la position change d\'ISIN, au ratio imprimé', () => {
    const detenu = e({ id: 't', date: '2026-01-02', accountId: 'courtier-usd', kind: 'transfert-entrant', isin: A, quantity: 10 });
    const echange = e({ id: 'ech', date: '2026-02-01', accountId: 'courtier-usd', kind: 'echange', isin: A, toIsin: B, splitFrom: 2, splitTo: 3 });

    it('10 A deviennent 15 B à la date, pas avant ; A disparaît', () => {
        expect(etatDuLivreAu([detenu, echange], '2026-01-31')!.positions['courtier-usd']).toEqual({ [A]: 10 });
        expect(etatDuLivreAu([detenu, echange], '2026-02-01')!.positions['courtier-usd']).toEqual({ [B]: 15 });
    });

    it('s\'ajoute à une position B déjà détenue', () => {
        const dejaB = e({ id: 'b', date: '2026-01-03', accountId: 'courtier-usd', kind: 'acquisition', isin: B, quantity: 1 });
        expect(etatDuLivreAu([detenu, dejaB, echange], '2026-12-31')!.positions['courtier-usd']).toEqual({ [B]: 16 });
    });

    it('les espèces pour une fraction s\'écrivent comme la VENTE de cette fraction', () => {
        const fraction = e({ id: 'f', date: '2026-02-01', accountId: 'courtier-usd', kind: 'vente', isin: B, quantity: 0.5, price: usd(8), amount: usd(4) });
        const etat = etatDuLivreAu([detenu, { ...echange, splitTo: 31, splitFrom: 20 } as BrokerLedgerEvent, fraction], '2026-12-31')!;
        expect(etat.positions['courtier-usd']).toEqual({ [B]: 15 });
        expect(etat.especes['courtier-usd']).toEqual({ USD: 4 });
    });

    it('sans position, ou mal formé → refusé et nommé', () => {
        const orphelin = etatDuLivreAu([echange], '2026-12-31')!;
        expect(orphelin.anomalies).toEqual([{ type: 'echange-sans-position', id: 'ech', isin: A, compte: 'courtier-usd' }]);
        const memeIsin = etatDuLivreAu([detenu, { ...echange, toIsin: A } as BrokerLedgerEvent], '2026-12-31')!;
        expect(memeIsin.anomalies).toEqual([{ type: 'echange-invalide', id: 'ech' }]);
        expect(memeIsin.positions['courtier-usd']).toEqual({ [A]: 10 });
        const ratioNul = etatDuLivreAu([detenu, { ...echange, splitTo: 0 } as BrokerLedgerEvent], '2026-12-31')!;
        expect(ratioNul.anomalies).toEqual([{ type: 'echange-invalide', id: 'ech' }]);
    });
});

describe('revue : ce qui dépendait de l\'ordre du tableau, ou passait en silence', () => {
    it('fractionnement puis échange du même titre le même jour : même résultat dans les deux ordres', () => {
        const detenu = e({ id: 't', date: '2026-01-02', accountId: 'courtier-usd', kind: 'transfert-entrant', isin: A, quantity: 10 });
        const frac = e({ id: 'f', date: '2026-02-01', accountId: 'courtier-usd', kind: 'fractionnement', isin: A, splitFrom: 1, splitTo: 2 });
        const ech = e({ id: 'ech', date: '2026-02-01', accountId: 'courtier-usd', kind: 'echange', isin: A, toIsin: B, splitFrom: 1, splitTo: 1 });
        for (const livre of [[detenu, frac, ech], [detenu, ech, frac]]) {
            const etat = etatDuLivreAu(livre, '2026-12-31')!;
            expect(etat.positions['courtier-usd']).toEqual({ [B]: 20 });
            expect(etat.anomalies).toEqual([]);
        }
    });

    it('deux annulations au MÊME identifiant sont refusées toutes les deux (sinon deux lignes réelles tombaient)', () => {
        const livre = [
            e({ id: 'a1', date: '2026-01-10', accountId: 'courtier-usd', kind: 'transfert-entrant', isin: A, quantity: 5 }),
            e({ id: 'a2', date: '2026-01-10', accountId: 'courtier-usd', kind: 'transfert-entrant', isin: B, quantity: 7 }),
            e({ id: 'x', date: '2026-01-15', accountId: 'courtier-usd', kind: 'annulation', cancelsId: 'a1' }),
            e({ id: 'x', date: '2026-01-15', accountId: 'courtier-usd', kind: 'annulation', cancelsId: 'a2' }),
        ];
        const etat = etatDuLivreAu(livre, '2026-12-31')!;
        expect(etat.positions['courtier-usd']).toEqual({ [A]: 5, [B]: 7 });
        expect(etat.anomalies).toEqual([
            { type: 'annulation-invalide', id: 'x', raison: 'identifiant-en-double' },
            { type: 'annulation-invalide', id: 'x', raison: 'identifiant-en-double' },
        ]);
    });

    it('deux annulations d\'une même ligne, le même jour : c\'est la même qui est rapportée, quel que soit l\'ordre', () => {
        const achat = e({ id: 'a', date: '2026-01-10', accountId: 'courtier-usd', kind: 'transfert-entrant', isin: A, quantity: 5 });
        const x1 = e({ id: 'x1', date: '2026-01-15', accountId: 'courtier-usd', kind: 'annulation', cancelsId: 'a' });
        const x2 = e({ id: 'x2', date: '2026-01-15', accountId: 'courtier-usd', kind: 'annulation', cancelsId: 'a' });
        const attendu = [{ type: 'annulation-invalide', id: 'x2', raison: 'deja-annulee' }];
        expect(etatDuLivreAu([achat, x1, x2], '2026-12-31')!.anomalies).toEqual(attendu);
        expect(etatDuLivreAu([achat, x2, x1], '2026-12-31')!.anomalies).toEqual(attendu);
    });
});

describe('coût d\'une ligne de titres : unitaire OU total, jamais les deux', () => {
    const t = (x: Record<string, unknown>) => e({ id: 'c', date: '2026-01-02', accountId: 'courtier-usd', kind: 'transfert-entrant', isin: A, quantity: 37, ...x });

    it('le coût TOTAL imprimé est accepté tel quel', () => {
        const etat = etatDuLivreAu([t({ cost: usd(1234.56) })], '2026-12-31')!;
        expect(etat.positions['courtier-usd']).toEqual({ [A]: 37 });
        expect(etat.anomalies).toEqual([]);
    });

    it('les deux à la fois → ambigu, rien n\'est écrit', () => {
        const etat = etatDuLivreAu([t({ cost: usd(1234.56), price: usd(33.37) })], '2026-12-31')!;
        expect(etat.positions).toEqual({});
        expect(etat.anomalies).toEqual([{ type: 'cout-ambigu', id: 'c' }]);
    });

    it('un coût non fini ou nul → refusé (un coût nul rendrait toute la vente imposable)', () => {
        expect(etatDuLivreAu([t({ cost: usd(Number.NaN) })], '2026-12-31')!.anomalies).toEqual([{ type: 'valeur-non-finie', id: 'c', champ: 'cost' }]);
        expect(etatDuLivreAu([t({ cost: usd(0) })], '2026-12-31')!.anomalies).toEqual([{ type: 'valeur-non-positive', id: 'c', champ: 'cost' }]);
        expect(etatDuLivreAu([t({ price: usd(-1) })], '2026-12-31')!.anomalies).toEqual([{ type: 'valeur-non-positive', id: 'c', champ: 'price' }]);
    });
});

describe('conversion et virement interne : les deux comptes bougent ensemble, ou pas du tout', () => {
    const conv = (x: Record<string, unknown> = {}) => e({
        id: 'cv', date: '2026-03-01', accountId: 'courtier-usd', kind: 'conversion', toAccountId: 'courtier-cad',
        amount: usd(100), toAmount: cad(137.25), rate: 1.3725, ...x,
    });

    it('conversion : 100 USD sortent du compte USD, 137,25 CAD entrent au compte CAD', () => {
        const etat = etatDuLivreAu([conv()], '2026-03-01')!;
        expect(etat.especes).toEqual({ 'courtier-usd': { USD: -100 }, 'courtier-cad': { CAD: 137.25 } });
        expect(etat.anomalies).toEqual([]);
    });

    it('conversion refusée → AUCUN des deux comptes ne bouge', () => {
        const cas: [Record<string, unknown>, unknown][] = [
            [{ toAmount: usd(137.25) }, { type: 'devise-hors-compte', id: 'cv', compte: 'courtier-cad', devise: 'USD' }],
            [{ toAccountId: 'hors-courtier', toAmount: usd(100) }, { type: 'transfert-interne-invalide', id: 'cv', raison: 'meme-devise' }],
            [{ toAccountId: 'courtier-usd' }, { type: 'transfert-interne-invalide', id: 'cv', raison: 'meme-compte' }],
            [{ toAmount: cad(Number.NaN) }, { type: 'valeur-non-finie', id: 'cv', champ: 'toAmount' }],
            [{ rate: Number.POSITIVE_INFINITY }, { type: 'valeur-non-finie', id: 'cv', champ: 'rate' }],
            [{ rate: 0 }, { type: 'valeur-non-positive', id: 'cv', champ: 'rate' }],
        ];
        for (const [perturbation, anomalie] of cas) {
            const etat = etatDuLivreAu([conv(perturbation)], '2026-03-01')!;
            expect(etat.especes, JSON.stringify(perturbation)).toEqual({});
            expect(etat.anomalies).toEqual([anomalie]);
        }
    });

    it('virement interne : même montant, même devise, des deux côtés', () => {
        const v = e({ id: 'vi', date: '2026-03-02', accountId: 'courtier-cad', kind: 'virement-interne', toAccountId: 'hors-courtier', amount: cad(50) });
        expect(etatDuLivreAu([v], '2026-03-02')!.especes).toEqual({ 'courtier-cad': { CAD: -50 }, 'hors-courtier': { CAD: 50 } });
    });

    it('virement vers un compte qui ne règle pas cette devise → refusé, rien ne bouge', () => {
        const v = e({ id: 'vi', date: '2026-03-02', accountId: 'courtier-cad', kind: 'virement-interne', toAccountId: 'courtier-usd', amount: cad(50) });
        const etat = etatDuLivreAu([v], '2026-03-02')!;
        expect(etat.especes).toEqual({});
        expect(etat.anomalies).toEqual([{ type: 'devise-hors-compte', id: 'vi', compte: 'courtier-usd', devise: 'CAD' }]);
    });
});

describe('variation : l\'annulation et l\'échange ne fabriquent pas de performance', () => {
    const PRECIS = 9;
    const C = 'ZZ0000000003';
    const m = (series: Record<string, PointCloture[]>): MagasinMarche => ({
        ...magasinVide('2026-07-31T21:00:00.000Z'),
        clotures: Object.fromEntries(Object.entries(series).map(([isin, points]) => [isin, { devise: 'USD' as const, points }])),
        taux: { USD: [['2026-07-10', 1.4], ['2026-07-20', 1.4]] },
    });
    const ok = (r: ReturnType<typeof variationEntre>) => {
        if (r.statut !== 'ok') throw new Error(`attendu : variation complète, reçu ${r.statut}`);
        return r.variation;
    };

    it('ÉCHANGE à ratio juste, cours immobiles : cours, change ET mouvements à 0', () => {
        const livre = [
            e({ id: 't', date: '2026-07-01', accountId: 'courtier-usd', kind: 'transfert-entrant', isin: A, quantity: 10 }),
            e({ id: 'ech', date: '2026-07-15', accountId: 'courtier-usd', kind: 'echange', isin: A, toIsin: C, splitFrom: 1, splitTo: 2 }),
        ];
        const v = ok(variationEntre(livre, m({ [A]: [['2026-07-10', 100, 'eodhd']], [C]: [['2026-07-20', 50, 'eodhd']] }), '2026-07-10', '2026-07-20', 5));
        expect(v.effetCours).toBeCloseTo(0, PRECIS);
        expect(v.effetChange).toBeCloseTo(0, PRECIS);
        expect(v.mouvements).toBeCloseTo(0, PRECIS);
    });

    it('à travers un échange, l\'effet de cours se mesure dans l\'unité d\'ARRIVÉE (20 titres × +1 $ × 1,4)', () => {
        const livre = [
            e({ id: 't', date: '2026-07-01', accountId: 'courtier-usd', kind: 'transfert-entrant', isin: A, quantity: 10 }),
            e({ id: 'ech', date: '2026-07-15', accountId: 'courtier-usd', kind: 'echange', isin: A, toIsin: C, splitFrom: 1, splitTo: 2 }),
        ];
        const v = ok(variationEntre(livre, m({ [A]: [['2026-07-10', 100, 'eodhd']], [C]: [['2026-07-20', 51, 'eodhd']] }), '2026-07-10', '2026-07-20', 5));
        expect(v.effetCours).toBeCloseTo(20 * 1 * 1.4, PRECIS);
        expect(v.mouvements).toBeCloseTo(0, PRECIS);
    });

    it('fractionnement et échange le même jour DANS la fenêtre : suivis dans l\'ordre du livre, 0 artefact', () => {
        // 10 A à 100 ; le même jour, A se fractionne (×2) puis est échangé contre C (1 pour 1) : 20 C à 50.
        const t = e({ id: 't', date: '2026-07-01', accountId: 'courtier-usd', kind: 'transfert-entrant', isin: A, quantity: 10 });
        const frac = e({ id: 'f', date: '2026-07-15', accountId: 'courtier-usd', kind: 'fractionnement', isin: A, splitFrom: 1, splitTo: 2 });
        const ech = e({ id: 'ech', date: '2026-07-15', accountId: 'courtier-usd', kind: 'echange', isin: A, toIsin: C, splitFrom: 1, splitTo: 1 });
        const marche = m({ [A]: [['2026-07-10', 100, 'eodhd']], [C]: [['2026-07-20', 50, 'eodhd']] });
        for (const livre of [[t, frac, ech], [t, ech, frac]]) {
            const v = ok(variationEntre(livre, marche, '2026-07-10', '2026-07-20', 5));
            expect(v.effetCours).toBeCloseTo(0, PRECIS);
            expect(v.mouvements).toBeCloseTo(0, PRECIS);
        }
    });

    it('un fractionnement d\'AVANT la fenêtre, annulé DANS la fenêtre, est défait : 0 artefact', () => {
        // Au début, la position est de 60 (post-fractionnement) au cours de 10. À la fin, le
        // fractionnement n'existe plus : 6 titres au cours de 100. Rien n'a bougé en valeur.
        const livre = [
            e({ id: 't', date: '2026-07-01', accountId: 'courtier-usd', kind: 'transfert-entrant', isin: A, quantity: 6 }),
            e({ id: 'f', date: '2026-07-05', accountId: 'courtier-usd', kind: 'fractionnement', isin: A, splitFrom: 1, splitTo: 10 }),
            e({ id: 'x', date: '2026-07-15', accountId: 'courtier-usd', kind: 'annulation', cancelsId: 'f' }),
        ];
        const v = ok(variationEntre(livre, m({ [A]: [['2026-07-10', 10, 'eodhd'], ['2026-07-20', 100, 'eodhd']] }), '2026-07-10', '2026-07-20', 5));
        expect(v.effetCours).toBeCloseTo(0, PRECIS);
        expect(v.mouvements).toBeCloseTo(0, PRECIS);
    });
});
