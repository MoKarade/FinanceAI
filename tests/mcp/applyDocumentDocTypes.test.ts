// tests/mcp/applyDocumentDocTypes.test.ts
// Lot 2 (suite) — fusion pure des 3 nouveaux types : relevé bancaire (dédup), courtage, feuillet fiscal.

import { describe, it, expect } from 'vitest';
import { applyDocument } from '../../mcp/ingest/applyDocument';
import { buildDefaultAppState } from '../../mcp/state/loadAppState';
import type { AppState } from '../../types';

function state(): AppState {
    const s = buildDefaultAppState();
    const [u0, u1] = s.config.users;
    s.config = { ...s.config, users: [{ ...u0, name: 'Marc' }, { ...u1, name: 'Anna' }] };
    return s;
}

describe('applyDocument — relevé bancaire', () => {
    it('ajoute avec id/status, dédup intra-lot ET vs existant', () => {
        const s = state();
        s.transactions = [{ id: 5, date: '2026-01-01', payee: 'Loyer', amount: -1000, category: 'Logement', status: 'processed' }] as unknown as AppState['transactions'];
        const r = applyDocument(s, {
            kind: 'bank_statement',
            accountName: 'Chèque',
            transactions: [
                { date: '2026-02-01', payee: 'Metro', amount: -50 },
                { date: '2026-02-01', payee: 'Metro', amount: -50 }, // doublon intra-lot
                { date: '2026-01-01', payee: 'Loyer', amount: -1000 }, // doublon vs existant
                { date: '2026-02-02', payee: 'Salaire', amount: 3000 },
            ],
        });
        expect(r.nextState.transactions.length).toBe(3); // 1 existant + 2 nouveaux
        const added = r.nextState.transactions.filter((t) => t.id > 5);
        expect(added.map((t) => t.id)).toEqual([6, 7]); // ids incrémentés
        expect(added.every((t) => t.status === 'processed')).toBe(true);
        expect(added.find((t) => t.payee === 'Metro')?.accountName).toBe('Chèque');
        expect(r.summary).toMatch(/2 transaction/);
    });

    it('tout en doublon → 0 changement (rien écrit)', () => {
        const s = state();
        s.transactions = [{ id: 1, date: '2026-01-01', payee: 'X', amount: -10, category: 'a', status: 'processed' }] as unknown as AppState['transactions'];
        const r = applyDocument(s, { kind: 'bank_statement', transactions: [{ date: '2026-01-01', payee: 'X', amount: -10 }] });
        expect(r.changes.length).toBe(0);
    });
});

describe('applyDocument — relevé de courtage', () => {
    it('ajoute une nouvelle position', () => {
        const r = applyDocument(state(), { kind: 'broker_statement', accountType: 'CELI', holdings: [{ symbol: 'aapl', quantity: 10, currentPrice: 150, name: 'Apple', currency: 'USD' }] });
        const a = r.nextState.assets.find((x) => x.symbol === 'AAPL');
        expect(a?.quantity).toBe(10);
        expect(a?.currentPrice).toBe(150);
        expect(a?.accountType).toBe('CELI');
        expect(a?.purchases?.[0].quantity).toBe(10);
    });

    it('met à jour une position existante (quantité + prix), sans doublon', () => {
        const s = state();
        const existing = { symbol: 'XEQT.TO', name: 'XEQT', quantity: 5, currency: 'CAD', currentPrice: 30, performance: 0, dateBought: '2025-01-01', buyPrice: 28, purchases: [{ date: '2025-01-01', quantity: 5, price: 28 }], accountType: 'CELI' };
        s.assets = [existing] as unknown as AppState['assets'];
        const r = applyDocument(s, { kind: 'broker_statement', accountType: 'CELI', holdings: [{ symbol: 'XEQT.TO', quantity: 12, currentPrice: 33 }] });
        const a = r.nextState.assets.find((x) => x.symbol === 'XEQT.TO');
        expect(a?.quantity).toBe(12);
        expect(a?.currentPrice).toBe(33);
        expect(r.nextState.assets.length).toBe(1);
    });
});

describe('applyDocument — feuillet fiscal', () => {
    it('revenu d\'emploi annuel → brut mensuel + REER, sur l\'utilisateur ciblé', () => {
        const r = applyDocument(state(), { kind: 'tax_slip', userName: 'Anna', slipType: 'T4', employmentIncomeAnnual: 84000, rrspContributedAnnual: 6000 });
        expect(r.nextState.config.users[1].grossSalary).toBe(7000); // 84000/12
        expect(r.nextState.config.users[1].rrspContributed).toBe(6000);
        expect(r.nextState.config.users[0].grossSalary).not.toBe(7000); // l'autre user intact
        expect(r.summary).toMatch(/T4/);
    });
});
