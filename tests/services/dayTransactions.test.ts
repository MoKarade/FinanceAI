// tests/services/dayTransactions.test.ts
// [PASSE-REEL-TXN-DU-JOUR] Demande de Marc : voir TOUTES les transactions d'une journée au clic.
//
// L'enjeu de ce helper n'est pas de filtrer par date — c'est de tenir DEUX promesses à la fois :
//   · la liste doit correspondre au RELEVÉ BANCAIRE (donc montrer doublons et virements) ;
//   · le total doit correspondre au MOUVEMENT DE LA COURBE (donc ne pas les compter).
// Les masquer trahit la première, les compter trahit la seconde. D'où `counted` / `excluded`.
import { describe, it, expect } from 'vitest';
import { transactionsOnDay } from '../../services/history/dayTransactions';
import type { Transaction } from '../../types';

const t = (p: Partial<Transaction>): Transaction => ({
    id: 1, date: '2026-03-04', payee: 'IGA', amount: -42.5, category: 'Épicerie', status: 'processed', ...p,
} as Transaction);

describe('[PASSE-REEL-TXN-DU-JOUR] transactionsOnDay', () => {
    it('ne retient que la journée demandée', () => {
        const r = transactionsOnDay([
            t({ id: 1, date: '2026-03-03', amount: -10 }),
            t({ id: 2, date: '2026-03-04', amount: -20 }),
            t({ id: 3, date: '2026-03-05', amount: -30 }),
        ], '2026-03-04');
        expect(r.counted.map((x) => x.id)).toEqual([2]);
        expect(r.netCounted).toBe(-20);
    });

    it('accepte une date HORODATÉE et compare sur le jour seul', () => {
        const r = transactionsOnDay([t({ date: '2026-03-04T14:32:00Z', amount: -15 })], '2026-03-04');
        expect(r.counted).toHaveLength(1);
    });

    // Le cœur du helper.
    it('doublons et virements sont MONTRÉS mais PAS comptés, chacun avec sa raison', () => {
        const r = transactionsOnDay([
            t({ id: 1, amount: -100, payee: 'Loyer' }),
            t({ id: 2, amount: -100, payee: 'Loyer', isDuplicate: true }),
            t({ id: 3, amount: 500, payee: 'Vers épargne', isTransfer: true }),
        ], '2026-03-04');

        expect(r.counted.map((x) => x.id), 'seule la vraie dépense compte').toEqual([1]);
        expect(r.netCounted, 'le total doit expliquer le mouvement de la COURBE').toBe(-100);
        expect(r.excluded.map((e) => [e.txn.id, e.reason])).toEqual([[2, 'doublon'], [3, 'virement interne']]);
        // La liste complète reste montrable : rien n'a disparu.
        expect(r.counted.length + r.excluded.length, 'aucune ligne du relevé ne doit être perdue').toBe(3);
    });

    it('`isDuplicate` PRIME sur `isTransfer` (la raison affichée doit être la bonne)', () => {
        const r = transactionsOnDay([t({ id: 9, isDuplicate: true, isTransfer: true })], '2026-03-04');
        expect(r.excluded[0].reason).toBe('doublon');
    });

    // no-fake-data : un montant non fini ne doit apparaître NI dans la liste NI dans le total —
    // sinon `netCounted` devient NaN et l'écran affiche un total silencieusement faux.
    it('une transaction au montant non fini est écartée, et ne contamine pas le total', () => {
        const r = transactionsOnDay([
            t({ id: 1, amount: -50 }),
            t({ id: 2, amount: NaN }),
            t({ id: 3, amount: Infinity }),
        ], '2026-03-04');
        expect(r.counted.map((x) => x.id)).toEqual([1]);
        expect(Number.isFinite(r.netCounted), 'le total ne doit jamais devenir NaN').toBe(true);
        expect(r.netCounted).toBe(-50);
        expect(r.excluded, 'ce n’est pas une exclusion MÉTIER : rien à expliquer à l’utilisateur').toHaveLength(0);
    });

    it('une date absente ou tronquée est écartée sans faire échouer le reste', () => {
        const r = transactionsOnDay([
            t({ id: 1, date: '' }),
            t({ id: 2, date: '2026-03' }),
            t({ id: 3, amount: -7 }),
        ], '2026-03-04');
        expect(r.counted.map((x) => x.id)).toEqual([3]);
    });

    it('l’ordre de la liste source est préservé', () => {
        const r = transactionsOnDay([
            t({ id: 3, payee: 'C' }), t({ id: 1, payee: 'A' }), t({ id: 2, payee: 'B' }),
        ], '2026-03-04');
        expect(r.counted.map((x) => x.payee), 'un tri implicite ferait diverger l’écran de sa source')
            .toEqual(['C', 'A', 'B']);
    });

    it('entrées vides : résultat vide, jamais une exception', () => {
        for (const cas of [
            () => transactionsOnDay(null, '2026-03-04'),
            () => transactionsOnDay(undefined, '2026-03-04'),
            () => transactionsOnDay([t({})], null),
            () => transactionsOnDay([t({})], ''),
            () => transactionsOnDay([t({})], '2026-03'),
            () => transactionsOnDay([], '2026-03-04'),
        ]) {
            const r = cas();
            expect(r.counted).toEqual([]);
            expect(r.excluded).toEqual([]);
            expect(r.netCounted).toBe(0);
        }
    });

    // ⚠️ La base d'exclusion doit rester IDENTIQUE à celle du registre journalier
    // (`dailyPastLedger.ts`), sinon la liste et la courbe racontent deux histoires. Garde de SOURCE :
    // si quelqu'un change l'une, ce test le force à regarder l'autre.
    it('la base d’exclusion est la MÊME que celle du registre journalier', async () => {
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const registre = readFileSync(resolve(__dirname, '../../services/history/dailyPastLedger.ts'), 'utf8');
        expect(registre, 'le registre exclut doublons et virements — ce helper doit faire pareil')
            .toContain('if (t.isDuplicate || t.isTransfer) continue;');
        const helper = readFileSync(resolve(__dirname, '../../services/history/dayTransactions.ts'), 'utf8');
        expect(helper).toContain('if (t.isDuplicate)');
        expect(helper).toContain('if (t.isTransfer)');
    });
});
