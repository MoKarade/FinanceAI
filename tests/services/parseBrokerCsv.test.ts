import { describe, it, expect } from 'vitest';
import { parseBrokerCsv, holdingsToAssets } from '../../services/import/parseBrokerCsv';

describe('parseBrokerCsv', () => {
    it('parse un export type Wealthsimple/Questrade (symbol, qty, average cost, currency, account)', () => {
        const csv = `Symbol,Quantity,Average Cost,Currency,Account
AAPL,10,150.25,USD,TFSA
XEQT.TO,100,28.50,CAD,RRSP`;
        const r = parseBrokerCsv(csv);
        expect(r.hasHeader).toBe(true);
        expect(r.imported).toBe(2);
        expect(r.holdings[0]).toMatchObject({ symbol: 'AAPL', quantity: 10, avgCost: 150.25, currency: 'USD', accountType: 'CELI' });
        expect(r.holdings[1]).toMatchObject({ symbol: 'XEQT.TO', quantity: 100, avgCost: 28.5, currency: 'CAD', accountType: 'REER' });
    });

    it('déduit le coût par action depuis le coût total (book cost) si pas de prix unitaire', () => {
        const csv = `Ticker,Shares,Book Cost
MSFT,5,2000`;
        const r = parseBrokerCsv(csv);
        expect(r.holdings[0]).toMatchObject({ symbol: 'MSFT', quantity: 5, avgCost: 400 }); // 2000 / 5
    });

    it('gère en-têtes FR, séparateur ;, et décimale virgule québécoise', () => {
        const csv = `Symbole;Quantité;Coût moyen;Devise
BNS;50;65,25;CAD`;
        const r = parseBrokerCsv(csv);
        expect(r.holdings[0]).toMatchObject({ symbol: 'BNS', quantity: 50, avgCost: 65.25, currency: 'CAD' });
    });

    it('mappe les types de compte (TFSA→CELI, RRSP→REER, FHSA→CELIAPP)', () => {
        const csv = `Symbol,Quantity,Average Cost,Account
A,1,10,TFSA
B,1,10,RRSP
C,1,10,FHSA
D,1,10,Non-Registered`;
        const r = parseBrokerCsv(csv);
        expect(r.holdings.map(h => h.accountType)).toEqual(['CELI', 'REER', 'CELIAPP', 'NON-ENREG']);
    });

    it('parse les dates ISO et JJ/MM/AAAA', () => {
        const csv = `Symbol,Quantity,Average Cost,Purchase Date
AAPL,10,150,2020-03-15
TSLA,5,200,15/06/2021`;
        const r = parseBrokerCsv(csv);
        expect(r.holdings[0].date).toBe('2020-03-15');
        expect(r.holdings[1].date).toBe('2021-06-15');
    });

    it('ignore les lignes sans symbole, sans quantité ou sans coût valide', () => {
        const csv = `Symbol,Quantity,Average Cost
,10,150
AAPL,,150
AAPL,10,
GOOG,3,100`;
        const r = parseBrokerCsv(csv);
        expect(r.imported).toBe(1);
        expect(r.holdings[0].symbol).toBe('GOOG');
        expect(r.skipped).toBe(3);
    });

    it('sans en-tête reconnaissable (pas de colonne symbole/quantité), n\'importe rien', () => {
        const csv = `AAPL,10,150
TSLA,5,200`;
        const r = parseBrokerCsv(csv);
        expect(r.hasHeader).toBe(false);
        expect(r.imported).toBe(0);
    });

    it('normalise le symbole (majuscules, espaces retirés, points conservés)', () => {
        const csv = `Symbol,Quantity,Average Cost
 xeqt.to ,1,30`;
        const r = parseBrokerCsv(csv);
        expect(r.holdings[0].symbol).toBe('XEQT.TO');
    });

    it('retourne vide sur entrée vide', () => {
        expect(parseBrokerCsv('').imported).toBe(0);
        expect(parseBrokerCsv('   ').imported).toBe(0);
    });
});

describe('holdingsToAssets', () => {
    it('mappe un holding en Asset (currentPrice = avgCost, perf 0, purchases)', () => {
        const assets = holdingsToAssets([
            { symbol: 'AAPL', quantity: 10, avgCost: 150, currency: 'USD', date: '2020-01-01', accountType: 'CELI' },
        ]);
        expect(assets[0]).toMatchObject({
            symbol: 'AAPL', quantity: 10, currentPrice: 150, buyPrice: 150,
            performance: 0, currency: 'USD', accountType: 'CELI',
        });
        expect(assets[0].purchases).toEqual([{ date: '2020-01-01', quantity: 10, price: 150 }]);
    });

    it('défaut NON-ENREG et date vide si non fournis', () => {
        const assets = holdingsToAssets([{ symbol: 'X', quantity: 1, avgCost: 1, currency: 'USD' }]);
        expect(assets[0].accountType).toBe('NON-ENREG');
        expect(assets[0].dateBought).toBe('');
        expect(assets[0].purchases?.[0].date).toBe('');
    });
});
