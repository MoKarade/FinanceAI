import { describe, it, expect } from 'vitest';
import { markDuplicates, parseTransactions } from '../../utils/transactionParser';
import type { Transaction } from '../../types';

const tx = (overrides: Partial<Transaction>): Transaction => ({
    id: 1,
    date: '2026-01-01',
    payee: 'Maxi',
    amount: -50,
    category: 'Épicerie',
    originalCategory: 'Épicerie',
    accountName: 'Courant',
    status: 'processed',
    isTransfer: false,
    isDuplicate: false,
    ...overrides,
});

describe('markDuplicates', () => {
    it('single transaction is never a duplicate', () => {
        const result = markDuplicates([tx({ id: 1 })]);
        expect(result[0].isDuplicate).toBe(false);
    });

    it('two identical transactions within 5 days → one marked duplicate', () => {
        const a = tx({ id: 1, date: '2026-01-01', payee: 'Maxi', amount: -50 });
        const b = tx({ id: 2, date: '2026-01-02', payee: 'Maxi', amount: -50 });
        const result = markDuplicates([a, b]);
        const dupes = result.filter(t => t.isDuplicate);
        expect(dupes).toHaveLength(1);
    });

    it('same amount but different payee → not duplicates', () => {
        const a = tx({ id: 1, payee: 'Maxi', amount: -50 });
        const b = tx({ id: 2, payee: 'IGA', amount: -50 });
        const result = markDuplicates([a, b]);
        expect(result.every(t => !t.isDuplicate)).toBe(true);
    });

    it('same payee but amount differs > 0.02 → not duplicates', () => {
        const a = tx({ id: 1, payee: 'Maxi', amount: -50.00 });
        const b = tx({ id: 2, payee: 'Maxi', amount: -50.05 });
        const result = markDuplicates([a, b]);
        expect(result.every(t => !t.isDuplicate)).toBe(true);
    });

    it('transactions more than 5 days apart → not duplicates even if identical', () => {
        const a = tx({ id: 1, date: '2026-01-01', payee: 'Maxi', amount: -50 });
        const b = tx({ id: 2, date: '2026-01-10', payee: 'Maxi', amount: -50 });
        const result = markDuplicates([a, b]);
        expect(result.every(t => !t.isDuplicate)).toBe(true);
    });

    it('prefers API-sourced transaction (high id) over manual import (negative id)', () => {
        const manual = tx({ id: -999, date: '2026-01-01', payee: 'Maxi', amount: -50, category: 'Uncategorized' });
        const api = tx({ id: 500000, date: '2026-01-01', payee: 'Maxi', amount: -50, category: 'Épicerie' });
        const result = markDuplicates([manual, api]);
        const kept = result.find(t => !t.isDuplicate);
        expect(kept?.id).toBe(500000);
    });

    it('reset: calling twice does not accumulate duplicate flags', () => {
        const a = tx({ id: 1, payee: 'Maxi', amount: -50 });
        const b = tx({ id: 2, payee: 'Maxi', amount: -50, date: '2026-01-02' });
        const round1 = markDuplicates([a, b]);
        const round2 = markDuplicates(round1);
        const dupes2 = round2.filter(t => t.isDuplicate);
        expect(dupes2).toHaveLength(1);
    });
});

describe('parseTransactions', () => {
    it('parses tab-separated CSV without header', () => {
        const raw = `01/01/2026\tMaxi\t-50.00\tÉpicerie\tCourant`;
        const result = parseTransactions(raw);
        expect(result).toHaveLength(1);
        expect(result[0].payee).toBe('Maxi');
        expect(result[0].amount).toBe(-50);
        expect(result[0].date).toBe('2026-01-01');
    });

    it('skips header line when first column contains "date"', () => {
        const raw = `Date\tPayee\tAmount\tCategory\tAccount\n01/01/2026\tIGA\t-30\tÉpicerie\tCourant`;
        const result = parseTransactions(raw);
        expect(result).toHaveLength(1);
        expect(result[0].payee).toBe('IGA');
    });

    it('parses semicolon-separated as fallback', () => {
        const raw = `01/02/2026;Metro;-25;Épicerie;Courant`;
        const result = parseTransactions(raw);
        expect(result).toHaveLength(1);
        expect(result[0].amount).toBe(-25);
    });

    it('classifies Interac as Remboursement (not transfer)', () => {
        const raw = `15/01/2026\tInterac Marc\t100\tInterac\tCourant`;
        const result = parseTransactions(raw);
        expect(result[0].category).toBe('Remboursement');
        expect(result[0].isTransfer).toBe(false);
    });

    it('marks virement as transfer', () => {
        const raw = `10/01/2026\tVirement Épargne\t-1000\tVirement\tCourant`;
        const result = parseTransactions(raw);
        expect(result[0].isTransfer).toBe(true);
    });

    it('skips lines with invalid date format', () => {
        const raw = `2026-01-01\tMaxi\t-50\tÉpicerie\tCourant`;
        const result = parseTransactions(raw);
        expect(result).toHaveLength(0);
    });

    it('handles comma as decimal separator', () => {
        const raw = `05/01/2026\tMarché\t-12,50\tÉpicerie\tCourant`;
        const result = parseTransactions(raw);
        expect(result[0].amount).toBe(-12.5);
    });
});
