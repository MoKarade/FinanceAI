// tests/services/statementReminder.test.ts
// [UX-STATEMENT-REMINDER] Détecte un relevé de compte non importé (aucune transaction réelle ce mois-ci).
// Pur, `now` injecté. Ne rappelle pas avant le 5, ni en l'absence d'historique, ni sur les transferts seuls.

import { describe, it, expect } from 'vitest';
import { computeStatementReminderStatus, STATEMENT_REMIND_AFTER_DAY } from '../../services/statementReminder';
import type { Transaction } from '../../types';

let _id = 0;
const tx = (date: string, over: Partial<Transaction> = {}): Transaction => ({
    id: ++_id, date, payee: 'Épicerie', amount: -50, category: 'Épicerie', status: 'processed', ...over,
});

describe('[UX-STATEMENT-REMINDER] computeStatementReminderStatus', () => {
    it('en retard (dernière tx le mois dernier, on est le 10) → rappel', () => {
        const s = computeStatementReminderStatus([tx('2026-06-20'), tx('2026-06-28')], new Date(2026, 6, 10));
        expect(s.shouldShow).toBe(true);
        expect(s.lastTxMonth).toBe('2026-06');
        expect(s.currentMonth).toBe('2026-07');
        expect(s.monthsBehind).toBe(1);
    });

    it('à jour (transaction ce mois-ci) → pas de rappel', () => {
        const s = computeStatementReminderStatus([tx('2026-06-20'), tx('2026-07-03')], new Date(2026, 6, 10));
        expect(s.monthsBehind).toBe(0);
        expect(s.shouldShow).toBe(false);
    });

    it('en retard mais AVANT le 5 du mois → pas de rappel (relevé pas toujours dispo)', () => {
        const s = computeStatementReminderStatus([tx('2026-06-20')], new Date(2026, 6, STATEMENT_REMIND_AFTER_DAY - 1));
        expect(s.monthsBehind).toBe(1);
        expect(s.shouldShow).toBe(false);
    });

    it('plusieurs mois de retard → monthsBehind reflète l\'écart', () => {
        const s = computeStatementReminderStatus([tx('2026-04-15')], new Date(2026, 6, 10)); // avril → juillet
        expect(s.monthsBehind).toBe(3);
        expect(s.shouldShow).toBe(true);
    });

    it('aucune transaction réelle (vide ou transferts/doublons seuls) → pas de rappel', () => {
        expect(computeStatementReminderStatus([], new Date(2026, 6, 10)).shouldShow).toBe(false);
        const s = computeStatementReminderStatus(
            [tx('2026-06-20', { isTransfer: true }), tx('2026-06-21', { isDuplicate: true })],
            new Date(2026, 6, 10),
        );
        expect(s.lastTxMonth).toBeNull();
        expect(s.shouldShow).toBe(false);
    });

    it('les transferts/doublons ne masquent pas le vrai dernier mois', () => {
        const s = computeStatementReminderStatus(
            [tx('2026-06-20'), tx('2026-07-05', { isTransfer: true })], // le transfert de juillet ne compte pas
            new Date(2026, 6, 10),
        );
        expect(s.lastTxMonth).toBe('2026-06');
        expect(s.shouldShow).toBe(true);
    });

    it('date invalide ignorée sans crash', () => {
        const s = computeStatementReminderStatus([tx('pas-une-date'), tx('2026-06-20')], new Date(2026, 6, 10));
        expect(s.lastTxMonth).toBe('2026-06');
    });

    it('mois NUMÉRIQUEMENT invalide (13/00) ne corrompt PAS lastTxMonth (piège tri lexicographique)', () => {
        // « 2026-13 » > « 2026-06 » en comparaison de string → sans la regex stricte, il écraserait le
        // vrai dernier mois par une valeur « dans le futur » et fausserait monthsBehind.
        const s = computeStatementReminderStatus(
            [tx('2026-13-01'), tx('2026-00-15'), tx('2026-06-20')],
            new Date(2026, 6, 10),
        );
        expect(s.lastTxMonth).toBe('2026-06');
        expect(s.monthsBehind).toBe(1);
        expect(s.shouldShow).toBe(true);
    });
});
