/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    logError,
    getErrors,
    filterErrors,
    clearErrors,
    getErrorStats,
} from '../../services/errorLogger';

beforeEach(() => {
    localStorage.clear();
});

describe('errorLogger', () => {
    it('logs an error and retrieves it', () => {
        logError({ source: 'ai', message: 'Test error' });
        const errors = getErrors();
        expect(errors).toHaveLength(1);
        expect(errors[0].source).toBe('ai');
        expect(errors[0].message).toBe('Test error');
        expect(errors[0].severity).toBe('error'); // default
    });

    it('default severity is "error"', () => {
        logError({ source: 'ui', message: 'X' });
        expect(getErrors()[0].severity).toBe('error');
    });

    it('extracts message and stack from Error instance', () => {
        const err = new Error('Boom');
        logError({ source: 'projection', message: '', error: err });
        const logged = getErrors()[0];
        expect(logged.message).toBe('Boom');
        expect(logged.stack).toBeDefined();
    });

    it('caps at MAX_ENTRIES (100)', () => {
        for (let i = 0; i < 150; i++) {
            logError({ source: 'ui', message: `Error ${i}` });
        }
        expect(getErrors()).toHaveLength(100);
        // Les plus récentes sont en tête
        expect(getErrors()[0].message).toBe('Error 149');
    });

    it('filterErrors by source', () => {
        logError({ source: 'ai', message: 'A' });
        logError({ source: 'network', message: 'B' });
        logError({ source: 'ai', message: 'C' });
        expect(filterErrors({ source: 'ai' })).toHaveLength(2);
        expect(filterErrors({ source: 'network' })).toHaveLength(1);
    });

    it('filterErrors by severity', () => {
        logError({ source: 'ai', message: 'A', severity: 'warning' });
        logError({ source: 'ai', message: 'B', severity: 'critical' });
        expect(filterErrors({ severity: 'critical' })).toHaveLength(1);
    });

    it('getErrorStats reports counts', () => {
        logError({ source: 'ai', message: 'A', severity: 'error' });
        logError({ source: 'network', message: 'B', severity: 'warning' });
        logError({ source: 'ai', message: 'C', severity: 'error' });
        const stats = getErrorStats();
        expect(stats.total).toBe(3);
        expect(stats.bySource.ai).toBe(2);
        expect(stats.bySource.network).toBe(1);
        expect(stats.bySeverity.error).toBe(2);
        expect(stats.bySeverity.warning).toBe(1);
    });

    it('clearErrors wipes the log', () => {
        logError({ source: 'ai', message: 'X' });
        expect(getErrors()).toHaveLength(1);
        clearErrors();
        expect(getErrors()).toHaveLength(0);
    });

    it('stores context object', () => {
        logError({ source: 'ai', message: 'X', context: { tab: 'budget', payload: 42 } });
        const logged = getErrors()[0];
        expect(logged.context).toEqual({ tab: 'budget', payload: 42 });
    });

    it('survives localStorage corruption (invalid JSON)', () => {
        localStorage.setItem('financeai:errorLog:v1', 'not-json');
        // Ne crash pas — retourne tableau vide
        expect(getErrors()).toEqual([]);
        // Et accepte un nouveau log
        logError({ source: 'ui', message: 'After corruption' });
        expect(getErrors()).toHaveLength(1);
    });
});
