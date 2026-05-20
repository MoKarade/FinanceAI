import { describe, it, expect } from 'vitest';
import { escapeCsvField, toCSV, exportTransactionsCSV, exportHoldingsCSV, exportBudgetCSV } from '../../utils/csvExport';
import type { Transaction, Asset, BudgetCategory } from '../../types';

describe('escapeCsvField', () => {
    it('pass through simple strings', () => {
        expect(escapeCsvField('hello')).toBe('hello');
        expect(escapeCsvField(42)).toBe('42');
    });

    it('handles null/undefined as empty', () => {
        expect(escapeCsvField(null)).toBe('');
        expect(escapeCsvField(undefined)).toBe('');
    });

    it('quotes string with comma', () => {
        expect(escapeCsvField('a, b')).toBe('"a, b"');
    });

    it('quotes string with quote and doubles internal quotes', () => {
        expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    });

    it('quotes string with newline', () => {
        expect(escapeCsvField('a\nb')).toBe('"a\nb"');
    });

    it('quotes string with carriage return', () => {
        expect(escapeCsvField('a\rb')).toBe('"a\rb"');
    });
});

describe('toCSV', () => {
    it('formats simple rows with CRLF line endings', () => {
        const csv = toCSV(
            [{ a: 1, b: 'x' }, { a: 2, b: 'y' }],
            [
                { header: 'A', accessor: (r: { a: number; b: string }) => r.a },
                { header: 'B', accessor: (r: { a: number; b: string }) => r.b },
            ],
        );
        expect(csv).toBe('A,B\r\n1,x\r\n2,y');
    });

    it('handles empty rows array (returns header only)', () => {
        const csv = toCSV([], [{ header: 'A', accessor: () => '' }]);
        expect(csv).toBe('A');
    });

    it('escapes fields with special chars', () => {
        const csv = toCSV(
            [{ note: 'Hello, world\n"quoted"' }],
            [{ header: 'Note', accessor: (r: { note: string }) => r.note }],
        );
        expect(csv).toContain('"Hello, world\n""quoted"""');
    });
});

describe('exportTransactionsCSV', () => {
    it('exports transactions with all required columns', () => {
        const txs: Transaction[] = [
            {
                id: 1, date: '2026-01-15', payee: 'Maxi', amount: -50,
                category: 'Épicerie', accountName: 'Courant', isTransfer: false,
                isDuplicate: false, status: 'processed', originalCategory: 'Épicerie',
            },
        ];
        const csv = exportTransactionsCSV(txs);
        const lines = csv.split('\r\n');
        expect(lines[0]).toBe('Date,Payee,Amount,Category,Account,Is Transfer,Is Duplicate,Status');
        expect(lines[1]).toBe('2026-01-15,Maxi,-50,Épicerie,Courant,false,false,processed');
    });

    it('handles transactions with commas in payee (escaping)', () => {
        const txs: Transaction[] = [
            {
                id: 1, date: '2026-01-15', payee: 'Maxi, Montréal', amount: -50,
                category: 'Épicerie', accountName: 'Courant', isTransfer: false,
                isDuplicate: false, status: 'processed', originalCategory: 'Épicerie',
            },
        ];
        const csv = exportTransactionsCSV(txs);
        expect(csv).toContain('"Maxi, Montréal"');
    });
});

describe('exportHoldingsCSV', () => {
    it('exports holdings with computed value', () => {
        const assets: Asset[] = [
            { symbol: 'AAPL', name: 'Apple', quantity: 10, currency: 'USD', currentPrice: 200, performance: 33, dateBought: '2024-01-01', buyPrice: 150, accountType: 'CELI' },
        ];
        const csv = exportHoldingsCSV(assets);
        const lines = csv.split('\r\n');
        expect(lines[0]).toContain('Symbol');
        expect(lines[0]).toContain('Value');
        expect(lines[1]).toContain('AAPL');
        expect(lines[1]).toContain('2000'); // 10 × 200
    });

    it('exports holdings with empty buyPrice / accountType', () => {
        const assets: Asset[] = [
            { symbol: 'TSLA', name: '', quantity: 5, currency: 'USD', currentPrice: 100, performance: 0, dateBought: '' },
        ];
        const csv = exportHoldingsCSV(assets);
        expect(csv).toContain('TSLA');
    });
});

describe('exportBudgetCSV', () => {
    it('exports budget items', () => {
        const budget: BudgetCategory[] = [
            { id: 'c1', name: 'Loyer', target: 1500, frequency: 'Monthly', type: 'Commun', nature: 'Besoin' },
        ];
        const csv = exportBudgetCSV(budget);
        const lines = csv.split('\r\n');
        expect(lines[0]).toContain('Name');
        expect(lines[0]).toContain('Target');
        expect(lines[1]).toContain('Loyer');
        expect(lines[1]).toContain('1500');
        expect(lines[1]).toContain('Besoin');
    });
});
