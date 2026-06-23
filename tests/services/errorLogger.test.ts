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

        it('[SEC-LOG-DEBT-REGEX] masque les clés financières COMPOSÉES (liquidDebt, mortgageBalance, annualAmount…)', () => {
            logError({
                source: 'ui', message: 'X',
                context: { liquidDebt: 45000, totalDebt: 80000, mortgageBalance: 300000, annualAmount: 12000, currentPrice: 99, retirementIncome: 5000 },
            });
            const ctx = getErrors()[0].context as Record<string, unknown>;
            for (const k of ['liquidDebt', 'totalDebt', 'mortgageBalance', 'annualAmount', 'currentPrice', 'retirementIncome']) {
                expect(ctx[k], `${k} doit être masqué`).toBe('[redacted]');
            }
        });

        it('[SEC-LOG-DEBT-REGEX] ne sur-redacte PAS les clés diagnostiques (anti faux-positif)', () => {
            // `factor`/`status`/`requestId` ne doivent PAS être pris pour des champs financiers
            // (les termes ambigus comme `fact` restent ANCRÉS, pas en substring).
            logError({ source: 'ui', message: 'X', context: { factor: 1.5, status: 'ok', requestId: 'abc', tabIndex: 2 } });
            const ctx = getErrors()[0].context as Record<string, unknown>;
            expect(ctx.factor).toBe(1.5);
            expect(ctx.status).toBe('ok');
            expect(ctx.requestId).toBe('abc');
            expect(ctx.tabIndex).toBe(2);
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

    // ── Sécurité (S2) : `message` et `stack` sont persistés ET exportables via
    // SystemView, mais n'étaient PAS filtrés. On verrouille le scrub léger qui
    // masque montants ($/argent) et secrets (sk-ant-…, tokens longs) AVANT
    // persistance, sans dénaturer les messages de diagnostic. ────────────────
    describe('scrub PII du message/stack (S2)', () => {
        it('masque les montants en dollars dans le message', () => {
            logError({ source: 'ui', message: 'retrait de 12 500,00$ refusé' });
            expect(getErrors()[0].message).toBe('retrait de [montant] refusé');
        });

        it('masque diverses formes monétaires ($ devant, code devise, décimales)', () => {
            logError({ source: 'ui', message: 'Solde $1,234.56 ; coût 99.99 ; total 1 234 567,89 CAD ; payé 5000$' });
            const m = getErrors()[0].message;
            expect(m).not.toMatch(/\d{3}/);          // plus aucun gros nombre en clair
            expect(m).not.toContain('1,234.56');
            expect(m).not.toContain('5000$');
            expect((m.match(/\[montant\]/g) || []).length).toBeGreaterThanOrEqual(4);
        });

        it('masque une clé API Anthropic (sk-ant-…)', () => {
            logError({ source: 'ai', message: 'échec avec clé sk-ant-api03-AbCdEf12345_xyz invalide' });
            const m = getErrors()[0].message;
            expect(m).toContain('[secret]');
            expect(m).not.toContain('sk-ant-');
        });

        it('masque un jeton long et un Bearer token', () => {
            logError({ source: 'network', message: 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 rejeté' });
            const m = getErrors()[0].message;
            expect(m).toContain('[secret]');
            expect(m).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
        });

        it('scrube aussi la stack (extraite d\'une Error)', () => {
            const err = new Error('clé sk-ant-api03-SuperSecretValue123 leak');
            err.stack = 'Error: paiement 9 999,99$\n    at f (sk-ant-api03-SuperSecretValue123:1:1)';
            logError({ source: 'ai', message: '', error: err });
            const e = getErrors()[0];
            expect(e.message).toContain('[secret]');     // message scrubé
            expect(e.stack).toBeDefined();
            expect(e.stack!).not.toContain('sk-ant-');    // secret hors de la stack
            expect(e.stack!).not.toContain('9 999,99');   // montant hors de la stack
        });

        it('NE dénature PAS un message diagnostique sans PII (entiers nus, codes, lignes)', () => {
            // Garde anti-faux-positif : les messages existants (« Error 149 », codes
            // HTTP, numéros de ligne) doivent rester intacts pour le debug.
            for (const msg of ['Error 149', 'HTTP 404 not found', 'crash at line 42 col 7', 'timeout après 30s']) {
                clearErrors();
                logError({ source: 'ui', message: msg });
                expect(getErrors()[0].message, `"${msg}" doit rester intact`).toBe(msg);
            }
        });
    });
});
