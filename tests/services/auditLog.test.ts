/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { logAudit, getAuditLog, filterAuditLog, clearAuditLog, getAuditStats } from '../../services/auditLog';

beforeEach(() => {
    localStorage.clear();
});

describe('auditLog', () => {
    it('logs an entry and retrieves it', () => {
        logAudit({ field: 'transactions', operation: 'add', description: 'Test' });
        const log = getAuditLog();
        expect(log).toHaveLength(1);
        expect(log[0].field).toBe('transactions');
        expect(log[0].operation).toBe('add');
        expect(log[0].description).toBe('Test');
    });

    it('caps at MAX_ENTRIES (500)', () => {
        for (let i = 0; i < 600; i++) {
            logAudit({ field: 'test', operation: 'update', description: `Op ${i}` });
        }
        expect(getAuditLog()).toHaveLength(500);
        expect(getAuditLog()[0].description).toBe('Op 599');
    });

    it('filterAuditLog by field', () => {
        logAudit({ field: 'transactions', operation: 'add', description: 'A' });
        logAudit({ field: 'budgetItems', operation: 'update', description: 'B' });
        logAudit({ field: 'transactions', operation: 'remove', description: 'C' });
        expect(filterAuditLog({ field: 'transactions' })).toHaveLength(2);
        expect(filterAuditLog({ field: 'budgetItems' })).toHaveLength(1);
    });

    it('filterAuditLog by operation', () => {
        logAudit({ field: 'transactions', operation: 'add', description: 'X' });
        logAudit({ field: 'transactions', operation: 'remove', description: 'Y' });
        expect(filterAuditLog({ operation: 'add' })).toHaveLength(1);
        expect(filterAuditLog({ operation: 'remove' })).toHaveLength(1);
    });

    it('getAuditStats reports counts', () => {
        logAudit({ field: 'transactions', operation: 'add', description: 'A' });
        logAudit({ field: 'transactions', operation: 'update', description: 'B' });
        logAudit({ field: 'budgetItems', operation: 'add', description: 'C' });
        const stats = getAuditStats();
        expect(stats.total).toBe(3);
        expect(stats.byField.transactions).toBe(2);
        expect(stats.byField.budgetItems).toBe(1);
        expect(stats.byOperation.add).toBe(2);
        expect(stats.byOperation.update).toBe(1);
    });

    it('countBefore/countAfter optionnels stockés', () => {
        logAudit({
            field: 'transactions', operation: 'add', description: 'Import CSV',
            countBefore: 100, countAfter: 147,
        });
        const entry = getAuditLog()[0];
        expect(entry.countBefore).toBe(100);
        expect(entry.countAfter).toBe(147);
    });

    it('clearAuditLog wipes everything', () => {
        logAudit({ field: 'x', operation: 'add', description: 'Y' });
        expect(getAuditLog()).toHaveLength(1);
        clearAuditLog();
        expect(getAuditLog()).toHaveLength(0);
    });

    it('survives localStorage corruption', () => {
        localStorage.setItem('financeai:auditLog:v1', 'not-json');
        expect(getAuditLog()).toEqual([]);
        logAudit({ field: 'recovery', operation: 'add', description: 'OK' });
        expect(getAuditLog()).toHaveLength(1);
    });
});
