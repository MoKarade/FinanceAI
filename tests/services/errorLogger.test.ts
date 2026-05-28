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

    // ── Sécurité (SH5/S-C) : la redaction PII/secrets du `context` n'était PAS
    // testée. Ces tests verrouillent qu'aucune donnée sensible n'est persistée
    // (donc jamais exportée via SystemView). ────────────────────────────────
    describe('redaction PII/secrets du context', () => {
        it('masque les clés sensibles de 1er niveau', () => {
            logError({
                source: 'ai',
                message: 'X',
                context: { amount: 50000, salary: 90000, apiKey: 'sk-ant-secret', balance: 12000 },
            });
            const ctx = getErrors()[0].context!;
            expect(ctx.amount).toBe('[redacted]');
            expect(ctx.salary).toBe('[redacted]');
            expect(ctx.apiKey).toBe('[redacted]');
            expect(ctx.balance).toBe('[redacted]');
        });

        it('masque diverses formes (password, email, sin, token, netWorth, grossSalary)', () => {
            logError({
                source: 'ui',
                message: 'X',
                context: { password: 'p', email: 'a@b.c', sin: '123', token: 't', netWorth: 1, grossSalary: 2 },
            });
            const ctx = getErrors()[0].context!;
            for (const k of ['password', 'email', 'sin', 'token', 'netWorth', 'grossSalary']) {
                expect(ctx[k], `${k} doit être masqué`).toBe('[redacted]');
            }
        });

        it('masque récursivement (objet imbriqué)', () => {
            logError({
                source: 'ai',
                message: 'X',
                context: { user: { name: 'Marc', salary: 90000 }, tab: 'budget' },
            });
            const ctx = getErrors()[0].context as { user: Record<string, unknown>; tab: string };
            expect(ctx.tab).toBe('budget'); // non sensible conservé
            expect(ctx.user.name).toBe('Marc'); // non sensible conservé
            expect(ctx.user.salary).toBe('[redacted]'); // sensible imbriqué masqué
        });

        it('conserve les clés non sensibles', () => {
            logError({ source: 'ui', message: 'X', context: { tab: 'budget', count: 3, ok: true } });
            expect(getErrors()[0].context).toEqual({ tab: 'budget', count: 3, ok: true });
        });

        it('tronque les tableaux à 10 éléments', () => {
            logError({ source: 'ui', message: 'X', context: { items: Array.from({ length: 25 }, (_, i) => i) } });
            const ctx = getErrors()[0].context as { items: number[] };
            expect(ctx.items).toHaveLength(10);
        });

        it('tronque la profondeur excessive ([truncated])', () => {
            // 6 niveaux d'imbrication > MAX_DEPTH(4)
            logError({ source: 'ui', message: 'X', context: { a: { b: { c: { d: { e: { f: 1 } } } } } } });
            const ctx = getErrors()[0].context as Record<string, unknown>;
            // À profondeur ≥ 4, la valeur devient '[truncated]'.
            const a = ctx.a as Record<string, unknown>;
            const b = a.b as Record<string, unknown>;
            const c = b.c as Record<string, unknown>;
            expect(c.d).toBe('[truncated]');
        });
    });
});
