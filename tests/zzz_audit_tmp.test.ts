import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
const LOG='/tmp/claude-0/-home-user/f5da6341-023a-54e5-b9d9-cede963d32fd/scratchpad/audit.log';
const log=(...a:unknown[])=>fs.appendFileSync(LOG, a.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' ')+'\n');
import { buildDailyPastLedger } from '../services/history/dailyPastLedger';
import { dayVariation } from '../services/history/dayVariation';

describe('AUDIT mesure bout-en-bout', () => {
  it('jour avec ACHAT de titre : residuel ?', () => {
    const assets = [{
      symbol: 'ABC', quantity: 100, currency: 'CAD', currentPrice: 10,
      accountType: 'CELI' as const,
      purchases: [
        { date: '2026-08-01', quantity: 50, price: 10 },
        { date: '2026-08-10', quantity: 50, price: 10 }, // achat de 500$ le 10
      ],
      priceHistory: [
        { date: '2026-08-01', price: 10 },
        { date: '2026-08-09', price: 10 },
        { date: '2026-08-10', price: 10 },
        { date: '2026-08-11', price: 10 },
      ],
    }];
    const transactions = [
      { date: '2026-07-01', amount: 1000 },
      { date: '2026-08-10', amount: -500, isTransfer: true }, // le debit bancaire de l'achat, marque virement
    ];
    const r = buildDailyPastLedger({
      from: '2026-08-01', to: '2026-08-12', today: '2026-08-12',
      transactions, currentCash: 5000, assets, fx: {},
      equityByYear: new Map(), currentDebtNonImmo: 0,
    });
    const rows = r.rows;
    const idx = rows.findIndex((x) => x.date === '2026-08-10');
    log('rows', rows.map(x => ({ d: x.date, cash: x.Liquidites, celi: x.CELI, nw: x.NetWorth, dep: x.deposits.CELI, g: x.growth.CELI, ntl: x.NetTransferLiquid })));
    const v = dayVariation(rows[idx], rows[idx - 1]);
    log('variation', v);
    expect(v).toBeTruthy();
  });

  it('jour avec ACHAT compte comme transaction normale (non-transfert)', () => {
    const assets = [{
      symbol: 'ABC', quantity: 100, currency: 'CAD', currentPrice: 10,
      accountType: 'CELI' as const,
      purchases: [
        { date: '2026-08-01', quantity: 50, price: 10 },
        { date: '2026-08-10', quantity: 50, price: 10 },
      ],
      priceHistory: [
        { date: '2026-08-01', price: 10 },
        { date: '2026-08-09', price: 10 },
        { date: '2026-08-10', price: 10 },
        { date: '2026-08-11', price: 10 },
      ],
    }];
    const transactions = [
      { date: '2026-07-01', amount: 1000 },
      { date: '2026-08-10', amount: -500 },
    ];
    const r = buildDailyPastLedger({
      from: '2026-08-01', to: '2026-08-12', today: '2026-08-12',
      transactions, currentCash: 5000, assets, fx: {},
      equityByYear: new Map(), currentDebtNonImmo: 0,
    });
    const rows = r.rows;
    const idx = rows.findIndex((x) => x.date === '2026-08-10');
    const v = dayVariation(rows[idx], rows[idx - 1]);
    log('variation NON-transfert', v);
    expect(v).toBeTruthy();
  });
});
