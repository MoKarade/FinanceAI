// [FINTABLE-3] La date de bascule se DÉRIVE de l'état réel, jamais d'un paramètre figé.

import { describe, it, expect } from 'vitest';
import { deriveCutoverDate } from '../../../services/fintable/deriveCutoverDate';
import type { Transaction } from '../../../types';

function tx(date: string): Transaction {
    return { id: 1, date, payee: 'x', amount: -1, category: 'x', status: 'processed' } as Transaction;
}

describe('deriveCutoverDate', () => {
    it('rend la date la plus RÉCENTE, tous comptes/sources confondus', () => {
        expect(deriveCutoverDate([tx('2026-06-01'), tx('2026-07-08'), tx('2026-06-15')])).toBe('2026-07-08');
    });

    it('état vierge → null (aucune borne, le mapper le signale)', () => {
        expect(deriveCutoverDate([])).toBeNull();
    });

    it('ignore les dates illisibles plutôt que de planter ou deviner', () => {
        expect(deriveCutoverDate([tx('pas-une-date'), tx('2026-07-08')])).toBe('2026-07-08');
        expect(deriveCutoverDate([tx('pas-une-date')])).toBeNull();
    });

    it('avance tout seul au fil des imports/syncs (auto-maintenue)', () => {
        // Simule 2 passes successives : la 2e doit repartir de ce que la 1re a laissé.
        const day1 = deriveCutoverDate([tx('2026-07-08')]);
        expect(day1).toBe('2026-07-08');
        const day2 = deriveCutoverDate([tx('2026-07-08'), tx('2026-07-09')]);
        expect(day2).toBe('2026-07-09');
    });
});
