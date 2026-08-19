import { describe, it, expect } from 'vitest';
import { markDuplicates } from '../../utils/transactionParser';
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

// [DEAD-PARSETX-SILENT-DROP] Les cas de `parseTransactions` ont été supprimés avec la fonction
// (2026-08-19) : elle n'avait plus d'appelant en production et jetait silencieusement les lignes
// mal formées. Le parseur RÉEL est couvert par `tests/services/parseBankCsv.test.ts`, qui
// vérifie en plus le compte honnête `imported`/`skipped`.
//
// ⚠️ Garder les tests d'une fonction morte aurait été pire que la fonction elle-même : une suite
// verte sur du code que personne n'appelle donne l'illusion d'une couverture, et invite au
// copier-coller du piège.
