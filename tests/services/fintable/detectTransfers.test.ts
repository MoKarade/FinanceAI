// [FINTABLE-TRANSFERS] Paiement de carte reconnu comme virement interne, pas comme dépense.

import { describe, it, expect } from 'vitest';
import { detectInternalTransfers } from '../../../services/fintable/detectTransfers';
import { mapFintableSnapshot } from '../../../services/fintable/mapSnapshot';
import type { FintableAccountRole } from '../../../services/fintable/mapSnapshot';
import type { FintableSnapshot, FintableTransaction } from '../../../services/fintable/types';

const ROLES: Record<string, FintableAccountRole> = {
    cash1: { kind: 'cash' },
    cash2: { kind: 'cash' },
    card: { kind: 'debt', debtName: 'Mastercard' },
    inv: { kind: 'investment' },
};

function tx(over: Partial<FintableTransaction> & { id: string }): FintableTransaction {
    return {
        accountId: 'cash1', date: '2026-07-15', amount: -500, currency: 'CAD',
        description: 'PAIEMENT MASTERCARD', merchant: null, categoryName: null, updatedAt: null,
        ...over,
    };
}

describe('appariement d\'un paiement de carte', () => {
    it('apparie une sortie du compte chèque avec l\'entrée sur la carte', () => {
        const r = detectInternalTransfers([
            tx({ id: 'out', accountId: 'cash1', amount: -500, date: '2026-07-15' }),
            tx({ id: 'in', accountId: 'card', amount: 500, date: '2026-07-16' }),
        ], ROLES);

        expect(r.pairs).toEqual([{ outId: 'out', inId: 'in', amount: 500 }]);
        expect([...r.transferIds].sort()).toEqual(['in', 'out']);
    });

    it('exige des montants EXACTEMENT opposés', () => {
        const r = detectInternalTransfers([
            tx({ id: 'out', accountId: 'cash1', amount: -500 }),
            tx({ id: 'in', accountId: 'card', amount: 499.99 }),
        ], ROLES);
        expect(r.pairs).toEqual([]);
    });

    it('exige des RÔLES différents — deux mouvements opposés sur le même compte ne sont pas un virement', () => {
        // Un achat puis son remboursement sur la même carte : deux vraies lignes, pas un transfert.
        const r = detectInternalTransfers([
            tx({ id: 'a', accountId: 'card', amount: -500 }),
            tx({ id: 'b', accountId: 'card', amount: 500 }),
        ], ROLES);
        expect(r.pairs).toEqual([]);
    });

    it('exige le bon SENS (sortie du cash, entrée sur la dette)', () => {
        // Une entrée sur le compte chèque et une sortie de la carte = un achat remboursé, pas un paiement.
        const r = detectInternalTransfers([
            tx({ id: 'a', accountId: 'cash1', amount: 500 }),
            tx({ id: 'b', accountId: 'card', amount: -500 }),
        ], ROLES);
        expect(r.pairs).toEqual([]);
    });

    it('respecte la tolérance de dates', () => {
        const far = [
            tx({ id: 'out', accountId: 'cash1', amount: -500, date: '2026-07-01' }),
            tx({ id: 'in', accountId: 'card', amount: 500, date: '2026-07-20' }),
        ];
        expect(detectInternalTransfers(far, ROLES).pairs).toEqual([]);
        expect(detectInternalTransfers(far, ROLES, 30).pairs).toHaveLength(1);
    });

    it('ignore les comptes sans rôle et les comptes de placement', () => {
        const r = detectInternalTransfers([
            tx({ id: 'out', accountId: 'inconnu', amount: -500 }),
            tx({ id: 'in', accountId: 'inv', amount: 500 }),
        ], ROLES);
        expect(r.pairs).toEqual([]);
    });
});

describe('appariement UN POUR UN', () => {
    it('n\'apparie pas deux entrées à une seule sortie', () => {
        // Sinon deux paiements du même montant dans le mois s'apparieraient en croix.
        const r = detectInternalTransfers([
            tx({ id: 'out', accountId: 'cash1', amount: -500, date: '2026-07-15' }),
            tx({ id: 'in1', accountId: 'card', amount: 500, date: '2026-07-15' }),
            tx({ id: 'in2', accountId: 'card', amount: 500, date: '2026-07-16' }),
        ], ROLES);

        expect(r.pairs).toHaveLength(1);
        expect(r.transferIds.size).toBe(2);
        // La plus proche en date gagne.
        expect(r.pairs[0].inId).toBe('in1');
    });

    it('apparie DEUX paiements distincts du même montant à leurs entrées respectives', () => {
        const r = detectInternalTransfers([
            tx({ id: 'out1', accountId: 'cash1', amount: -500, date: '2026-06-15' }),
            tx({ id: 'in1', accountId: 'card', amount: 500, date: '2026-06-16' }),
            tx({ id: 'out2', accountId: 'cash1', amount: -500, date: '2026-07-15' }),
            tx({ id: 'in2', accountId: 'card', amount: 500, date: '2026-07-16' }),
        ], ROLES);

        expect(r.pairs).toHaveLength(2);
        expect(r.pairs.map((p) => [p.outId, p.inId])).toEqual([['out1', 'in1'], ['out2', 'in2']]);
    });

    it('rend un appariement DÉTERMINISTE (deux exécutions, même résultat)', () => {
        const input = [
            tx({ id: 'zzz', accountId: 'cash1', amount: -500, date: '2026-07-15' }),
            tx({ id: 'aaa', accountId: 'cash2', amount: -500, date: '2026-07-15' }),
            tx({ id: 'in', accountId: 'card', amount: 500, date: '2026-07-15' }),
        ];
        const a = detectInternalTransfers(input, ROLES);
        const b = detectInternalTransfers([...input].reverse(), ROLES);
        expect(a.pairs).toEqual(b.pairs);
    });
});

describe('intégration au mapper — le paiement sort des dépenses du Budget', () => {
    function snap(transactions: FintableTransaction[]): FintableSnapshot {
        return {
            readAt: 0, holdings: [], holdingsSkipped: [], transactions,
            accounts: [
                { id: 'cash1', connectionId: 'c', label: 'PCA', rawType: 'depository / checking', currency: 'CAD', balance: 1000, balanceAvailable: null, lastTxDate: null, enabled: true },
                { id: 'card', connectionId: 'c', label: 'Mastercard', rawType: 'credit / credit card', currency: 'CAD', balance: 380, balanceAvailable: null, lastTxDate: null, enabled: true },
            ],
        };
    }

    it('marque isTransfer sur les DEUX côtés du paiement', () => {
        const r = mapFintableSnapshot(snap([
            tx({ id: 'out', accountId: 'cash1', amount: -500, date: '2026-07-15' }),
            tx({ id: 'in', accountId: 'card', amount: 500, date: '2026-07-16' }),
            tx({ id: 'achat', accountId: 'card', amount: -42.5, date: '2026-07-17', merchant: 'IGA' }),
        ]), { roles: ROLES, transactionsAfter: '2026-07-01' });

        const bank = r.payloads.find((p) => p.kind === 'bank_statement');
        const rows = bank && 'transactions' in bank ? bank.transactions : [];
        expect(rows).toHaveLength(3);
        expect(rows.filter((t) => t.isTransfer)).toHaveLength(2);
        // L'achat réel, lui, reste une dépense.
        const achat = rows.find((t) => t.payee === 'IGA');
        expect(achat?.isTransfer).toBeUndefined();
        expect(r.report.transferPairs).toHaveLength(1);
    });

    it('sans compte de dette déclaré, aucun appariement (rien n\'est deviné)', () => {
        const r = mapFintableSnapshot(snap([
            tx({ id: 'out', accountId: 'cash1', amount: -500, date: '2026-07-15' }),
            tx({ id: 'in', accountId: 'card', amount: 500, date: '2026-07-16' }),
        ]), { roles: { cash1: { kind: 'cash' }, card: { kind: 'ignore' } }, transactionsAfter: '2026-07-01' });

        expect(r.report.transferPairs).toEqual([]);
    });
});
