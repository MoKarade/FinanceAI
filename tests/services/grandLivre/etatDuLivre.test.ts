// tests/services/grandLivre/etatDuLivre.test.ts
//
// [PTF-L1B-LIVRE-PUR] Positions et encaisse du grand livre à une date. Toutes les données sont
// SYNTHÉTIQUES (ISIN au préfixe non attribué `ZZ`).
import { describe, it, expect } from 'vitest';
import type { BrokerLedgerEvent } from '../../../types';
import { etatDuLivreAu } from '../../../services/grandLivre/etatDuLivre';

const source = { kind: 'releve-courtier', date: '2026-01-31' } as const;
const A = 'ZZ0000000001';
const B = 'ZZ0000000002';
const usd = (value: number) => ({ value, currency: 'USD' as const });
const cad = (value: number) => ({ value, currency: 'CAD' as const });

describe('[PTF-L1B] tri-état', () => {
    it('livre jamais importé → null ; livre importé et vide → état vide', () => {
        expect(etatDuLivreAu(undefined, '2026-01-31')).toBeNull();
        expect(etatDuLivreAu([], '2026-01-31')).toEqual({ date: '2026-01-31', positions: {}, especes: {}, anomalies: [] });
    });
});

describe('[PTF-L1B] positions et encaisse', () => {
    const livre: BrokerLedgerEvent[] = [
        { id: 'a1', date: '2026-01-08', accountId: 'courtier-usd', kind: 'transfert-entrant', source, isin: A, quantity: 6 },
        { id: 'a2', date: '2026-01-10', accountId: 'courtier-usd', kind: 'depot-especes', source, amount: usd(1000) },
        { id: 'a3', date: '2026-02-02', accountId: 'courtier-usd', kind: 'achat', source, isin: B, quantity: 3, price: usd(100), amount: usd(309.95) },
        { id: 'a4', date: '2026-03-02', accountId: 'courtier-usd', kind: 'dividende', source, isin: B, amount: usd(1.5) },
        { id: 'a5', date: '2026-03-02', accountId: 'courtier-usd', kind: 'retenue-etrangere', source, isin: B, amount: usd(0.23) },
        { id: 'a6', date: '2026-04-01', accountId: 'courtier-usd', kind: 'vente', source, isin: B, quantity: 1, price: usd(110), amount: usd(100.05) },
        { id: 'a7', date: '2026-04-15', accountId: 'courtier-usd', kind: 'frais', source, amount: usd(2) },
    ];

    it('les dates sont INCLUSES et l\'avenir ignoré', () => {
        const e = etatDuLivreAu(livre, '2026-02-02')!;
        expect(e.positions['courtier-usd']).toEqual({ [A]: 6, [B]: 3 });
        expect(e.especes['courtier-usd']).toEqual({ USD: 690.05 });
        expect(etatDuLivreAu(livre, '2026-01-07')!.positions).toEqual({});
    });

    it('fin de période : ventes, revenus, retenue et frais, au cent près', () => {
        const e = etatDuLivreAu(livre, '2026-12-31')!;
        expect(e.positions['courtier-usd']).toEqual({ [A]: 6, [B]: 2 });
        // 1000 − 309,95 + 1,50 − 0,23 + 100,05 − 2
        expect(e.especes['courtier-usd']).toEqual({ USD: 789.37 });
        expect(e.anomalies).toEqual([]);
    });

    it('espèces en cents ENTIERS, arrondis à la conversion : 3 × 0,29 $ font 0,87 $ exactement', () => {
        const trois = Array.from({ length: 3 }, (_, i): BrokerLedgerEvent => ({
            id: `d${i}`, date: '2026-01-10', accountId: 'courtier-cad', kind: 'depot-especes', source, amount: cad(0.29),
        }));
        // Mesuré : en dollars flottants la somme vaut 0,8699999999999999, et en « cents » NON arrondis
        // (0,29 × 100 = 28,999999999999996) aussi. Seule la conversion ARRONDIE au cent rend 0,87 —
        // c'est elle que ce cas garde, 0,1 × 100 étant exact il ne discriminait rien.
        expect(etatDuLivreAu(trois, '2026-01-31')!.especes['courtier-cad']).toEqual({ CAD: 0.87 });
    });

    it('l\'ordre du tableau reçu n\'importe pas', () => {
        const inverse = [...livre].reverse();
        expect(etatDuLivreAu(inverse, '2026-12-31')).toEqual(etatDuLivreAu(livre, '2026-12-31'));
    });
});

describe('[PTF-L1B] fractionnement', () => {
    const base: BrokerLedgerEvent[] = [
        { id: 'f1', date: '2026-01-08', accountId: 'courtier-usd', kind: 'transfert-entrant', source, isin: A, quantity: 6 },
        { id: 'f2', date: '2026-06-12', accountId: 'courtier-usd', kind: 'fractionnement', source, isin: A, splitFrom: 1, splitTo: 10 },
    ];

    it('multiplie la position à la date, pas avant', () => {
        expect(etatDuLivreAu(base, '2026-06-11')!.positions['courtier-usd']).toEqual({ [A]: 6 });
        expect(etatDuLivreAu(base, '2026-06-12')!.positions['courtier-usd']).toEqual({ [A]: 60 });
    });

    it('un achat du MÊME jour, listé AVANT le fractionnement, n\'est pas multiplié (fractionnement d\'abord)', () => {
        const achatMemeJour: BrokerLedgerEvent = {
            id: 'f0', date: '2026-06-12', accountId: 'courtier-usd', kind: 'achat', source, isin: A, quantity: 4, price: usd(20), amount: usd(80),
        };
        // Sans la règle, l'ordre reçu décidait : (6 + 4) × 10 = 100 au lieu de 6 × 10 + 4 = 64.
        expect(etatDuLivreAu([base[0], achatMemeJour, base[1]], '2026-06-30')!.positions['courtier-usd']).toEqual({ [A]: 64 });
    });

    it('ne touche que le compte de l\'événement', () => {
        const autreCompte: BrokerLedgerEvent = { id: 'f3', date: '2026-01-09', accountId: 'hors-courtier', kind: 'acquisition', source, isin: A, quantity: 2 };
        const e = etatDuLivreAu([...base, autreCompte], '2026-12-31')!;
        expect(e.positions['hors-courtier']).toEqual({ [A]: 2 });
        expect(e.positions['courtier-usd']).toEqual({ [A]: 60 });
    });

    it('regroupement (10 → 1) et ratio invalide refusé', () => {
        const regroupement: BrokerLedgerEvent = { ...base[1], id: 'f4', splitFrom: 10, splitTo: 1 } as BrokerLedgerEvent;
        expect(etatDuLivreAu([base[0], regroupement], '2026-12-31')!.positions['courtier-usd']).toEqual({ [A]: 0.6 });
        const invalide = { ...base[1], id: 'f5', splitFrom: 0 } as BrokerLedgerEvent;
        const e = etatDuLivreAu([base[0], invalide], '2026-12-31')!;
        expect(e.positions['courtier-usd']).toEqual({ [A]: 6 });
        expect(e.anomalies).toEqual([{ type: 'fractionnement-invalide', id: 'f5' }]);
    });
});

describe('[PTF-L1B] refus, jamais correction', () => {
    it('vendre plus que détenu → refusé, et l\'encaisse n\'est PAS créditée', () => {
        const e = etatDuLivreAu([
            { id: 'r1', date: '2026-01-08', accountId: 'courtier-usd', kind: 'transfert-entrant', source, isin: A, quantity: 1 },
            { id: 'r2', date: '2026-01-09', accountId: 'courtier-usd', kind: 'vente', source, isin: A, quantity: 2, price: usd(10), amount: usd(20) },
        ], '2026-12-31')!;
        expect(e.positions['courtier-usd']).toEqual({ [A]: 1 });
        expect(e.especes).toEqual({});
        expect(e.anomalies).toEqual([{ type: 'quantite-negative', id: 'r2', isin: A, compte: 'courtier-usd' }]);
    });

    it('règlement dans une devise étrangère au compte → refusé (le compte USD ne règle pas en CAD)', () => {
        const e = etatDuLivreAu([
            { id: 'r3', date: '2026-01-09', accountId: 'courtier-usd', kind: 'depot-especes', source, amount: cad(100) },
        ], '2026-12-31')!;
        expect(e.especes).toEqual({});
        expect(e.anomalies).toEqual([{ type: 'devise-hors-compte', id: 'r3', compte: 'courtier-usd', devise: 'CAD' }]);
    });

    it('hors-courtier accepte toute devise (contrôle négatif du cas précédent)', () => {
        const e = etatDuLivreAu([
            { id: 'r4', date: '2026-01-09', accountId: 'hors-courtier', kind: 'depot-especes', source, amount: { value: 50, currency: 'EUR' } },
        ], '2026-12-31')!;
        expect(e.especes['hors-courtier']).toEqual({ EUR: 50 });
        expect(e.anomalies).toEqual([]);
    });

    it('valeur non finie, date invalide, identifiant en double → écartés et nommés', () => {
        const e = etatDuLivreAu([
            { id: 'r5', date: '2026-01-09', accountId: 'courtier-cad', kind: 'acquisition', source, isin: A, quantity: Number.NaN },
            { id: 'r6', date: '09/01/2026', accountId: 'courtier-cad', kind: 'acquisition', source, isin: A, quantity: 1 },
            { id: 'r7', date: '2026-01-09', accountId: 'courtier-cad', kind: 'acquisition', source, isin: A, quantity: 1 },
            { id: 'r7', date: '2026-01-10', accountId: 'courtier-cad', kind: 'acquisition', source, isin: A, quantity: 1 },
        ], '2026-12-31')!;
        expect(e.positions['courtier-cad']).toEqual({ [A]: 1 });
        expect(e.anomalies).toEqual(expect.arrayContaining([
            { type: 'valeur-non-finie', id: 'r5', champ: 'quantity' },
            { type: 'date-invalide', id: 'r6' },
            { type: 'identifiant-en-double', id: 'r7' },
        ]));
        expect(e.anomalies).toHaveLength(3);
    });

    // Revue du lot 1a : le sens est porté par `kind`. Une acquisition à −5 RETIRAIT 5 titres, un
    // dépôt à −100 $ était un retrait déguisé — sans rien de rouge.
    it('quantité ou montant nul ou négatif → refusé et nommé, rien n\'est écrit', () => {
        const e = etatDuLivreAu([
            { id: 'p1', date: '2026-01-05', accountId: 'courtier-cad', kind: 'acquisition', source, isin: A, quantity: 10 },
            { id: 'p2', date: '2026-01-06', accountId: 'courtier-cad', kind: 'acquisition', source, isin: A, quantity: -5 },
            { id: 'p3', date: '2026-01-06', accountId: 'courtier-cad', kind: 'depot-especes', source, amount: cad(-100) },
            { id: 'p4', date: '2026-01-07', accountId: 'courtier-cad', kind: 'transfert-sortant', source, isin: A, quantity: 0 },
            { id: 'p5', date: '2026-01-07', accountId: 'courtier-cad', kind: 'depot-especes', source, amount: cad(40) },
        ], '2026-12-31')!;
        expect(e.positions['courtier-cad']).toEqual({ [A]: 10 });
        expect(e.especes['courtier-cad']).toEqual({ CAD: 40 });
        expect(e.anomalies).toEqual([
            { type: 'valeur-non-positive', id: 'p2', champ: 'quantity' },
            { type: 'valeur-non-positive', id: 'p3', champ: 'amount' },
            { type: 'valeur-non-positive', id: 'p4', champ: 'quantity' },
        ]);
    });

    it('une position ramenée à zéro disparaît (un titre entièrement vendu n\'est pas « 0 titre détenu »)', () => {
        const e = etatDuLivreAu([
            { id: 'z1', date: '2026-01-08', accountId: 'courtier-usd', kind: 'transfert-entrant', source, isin: A, quantity: 3 },
            { id: 'z2', date: '2026-01-09', accountId: 'courtier-usd', kind: 'transfert-sortant', source, isin: A, quantity: 3 },
        ], '2026-12-31')!;
        expect(e.positions).toEqual({});
    });
});
