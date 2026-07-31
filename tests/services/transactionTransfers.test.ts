// tests/services/transactionTransfers.test.ts
//
// [TX-TRANSFERS] Appariement des virements internes — cœur générique + application aux transactions.
// Demande Marc 2026-07-31 : « ça détecte mal mes transferts entre comptes » (compte courant PCA,
// épargne TS1, Mastercard, placements — les deux côtés toujours importés, décalés de quelques jours).
//
// Discriminants (chacun ÉCHOUE sur le comportement d'avant) :
//   - « deux comptes de MÊME rôle » : l'ancien détecteur Fintable exigeait cash → dette, donc un
//     virement courant → épargne n'était JAMAIS apparié. C'est le cas d'usage n°1 de Marc.
//   - « compte inconnu » : rien ne doit être marqué automatiquement sans preuve de deux poches.
//   - « Interac » : règle métier explicite de Marc, même quand la paire s'apparie parfaitement.

import { describe, it, expect } from 'vitest';
import {
    detectInternalTransfers,
    isInteracPayee,
} from '../../services/transactions/detectTransfers';
import { applyTransferDetection } from '../../services/transactions/applyTransferDetection';
import type { Transaction } from '../../types';

const tx = (over: Partial<Transaction> & Pick<Transaction, 'id' | 'date' | 'amount'>): Transaction => ({
    payee: 'Virement',
    category: 'Autre',
    status: 'processed',
    ...over,
});

describe('detectInternalTransfers — cœur générique', () => {
    it('apparie deux comptes DIFFÉRENTS de même nature (courant → épargne) — cas raté par l\'ancienne règle de rôles', () => {
        const r = detectInternalTransfers([
            { id: 1, date: '2026-07-10', amount: -500, account: 'PCA', payee: 'Virement ACCESD' },
            { id: 2, date: '2026-07-10', amount: 500, account: 'TS1', payee: 'Virement ACCESD' },
        ]);
        expect(r.pairs).toHaveLength(1);
        expect(r.pairs[0].confidence).toBe('confirmed');
        expect([...r.confirmedIds].sort()).toEqual([1, 2]);
        expect(r.suggestedIds.size).toBe(0);
    });

    it('apparie un paiement de carte (courant → Mastercard) avec un décalage de 2 jours', () => {
        const r = detectInternalTransfers([
            { id: 1, date: '2026-07-10', amount: -1200, account: 'PCA', payee: 'PAIEMENT CAISSE' },
            { id: 2, date: '2026-07-12', amount: 1200, account: 'Mastercard', payee: 'PAIEMENT RECU' },
        ]);
        expect(r.pairs).toHaveLength(1);
        expect(r.pairs[0].confidence).toBe('confirmed');
    });

    it('n\'apparie PAS deux mouvements opposés sur le MÊME compte (achat puis remboursement)', () => {
        const r = detectInternalTransfers([
            { id: 1, date: '2026-07-10', amount: -80, account: 'Mastercard', payee: 'Simons' },
            { id: 2, date: '2026-07-11', amount: 80, account: 'Mastercard', payee: 'Simons retour' },
        ]);
        expect(r.pairs).toHaveLength(0);
        expect(r.confirmedIds.size).toBe(0);
    });

    it('SUGGÈRE seulement (jamais confirmé) quand un compte est inconnu — « Unknown » est une absence, pas un nom', () => {
        const r = detectInternalTransfers([
            { id: 1, date: '2026-07-10', amount: -300, account: 'Unknown', payee: 'Virement' },
            { id: 2, date: '2026-07-10', amount: 300, account: 'TS1', payee: 'Virement' },
        ]);
        expect(r.pairs).toHaveLength(1);
        expect(r.pairs[0].confidence).toBe('suggested');
        expect(r.confirmedIds.size).toBe(0);
        expect([...r.suggestedIds].sort()).toEqual([1, 2]);
        expect(r.stats.withoutAccount).toBe(1);
    });

    it('SUGGÈRE seulement quand AUCUN des deux comptes n\'est renseigné (historique CSV sans colonne compte)', () => {
        const r = detectInternalTransfers([
            { id: 1, date: '2026-07-10', amount: -300, payee: 'Virement' },
            { id: 2, date: '2026-07-10', amount: 300, payee: 'Virement' },
        ]);
        expect(r.pairs[0].confidence).toBe('suggested');
        expect(r.confirmedIds.size).toBe(0);
        expect(r.stats.withoutAccount).toBe(2);
    });

    it('n\'apparie JAMAIS un Interac, même parfaitement symétrique (règle Marc : reste un remboursement)', () => {
        const r = detectInternalTransfers([
            { id: 1, date: '2026-07-10', amount: -250, account: 'PCA', payee: 'VIREMENT INTERAC A JULIE' },
            { id: 2, date: '2026-07-10', amount: 250, account: 'TS1', payee: 'VIREMENT INTERAC DE MARC' },
        ]);
        expect(r.pairs).toHaveLength(0);
        expect(r.stats.interacExcluded).toBe(2);
    });

    it('reconnaît les graphies d\'Interac (accents, e-Transfer)', () => {
        expect(isInteracPayee('Virement Intérac à Julie')).toBe(true);
        expect(isInteracPayee('e-Transfer received')).toBe(true);
        expect(isInteracPayee('eTransfer')).toBe(true);
        expect(isInteracPayee('IGA St-Roch')).toBe(false);
        expect(isInteracPayee(undefined)).toBe(false);
    });

    it('respecte la tolérance de dates (au-delà, aucune paire)', () => {
        const r = detectInternalTransfers(
            [
                { id: 1, date: '2026-07-01', amount: -500, account: 'PCA' },
                { id: 2, date: '2026-07-10', amount: 500, account: 'TS1' },
            ],
            { toleranceDays: 3 },
        );
        expect(r.pairs).toHaveLength(0);
    });

    it('apparie UN POUR UN et retient la contrepartie la plus proche en date', () => {
        const r = detectInternalTransfers([
            { id: 1, date: '2026-07-01', amount: -100, account: 'PCA' },
            { id: 2, date: '2026-07-20', amount: -100, account: 'PCA' },
            { id: 3, date: '2026-07-02', amount: 100, account: 'TS1' },
            { id: 4, date: '2026-07-21', amount: 100, account: 'TS1' },
        ]);
        expect(r.pairs).toHaveLength(2);
        // Chaque sortie prend SA contrepartie proche : 1↔3 et 2↔4, jamais en croix.
        expect(r.pairs.find((p) => p.outId === 1)?.inId).toBe(3);
        expect(r.pairs.find((p) => p.outId === 2)?.inId).toBe(4);
    });

    it('ne réutilise jamais deux fois la même contrepartie', () => {
        const r = detectInternalTransfers([
            { id: 1, date: '2026-07-10', amount: -100, account: 'PCA' },
            { id: 2, date: '2026-07-10', amount: -100, account: 'PCA' },
            { id: 3, date: '2026-07-10', amount: 100, account: 'TS1' },
        ]);
        expect(r.pairs).toHaveLength(1);
    });

    it('est déterministe (deux exécutions, même appariement) quel que soit l\'ordre d\'entrée', () => {
        const rows = [
            { id: 3, date: '2026-07-02', amount: 100, account: 'TS1' },
            { id: 1, date: '2026-07-01', amount: -100, account: 'PCA' },
            { id: 4, date: '2026-07-21', amount: 100, account: 'TS1' },
            { id: 2, date: '2026-07-20', amount: -100, account: 'PCA' },
        ];
        const a = detectInternalTransfers(rows);
        const b = detectInternalTransfers([...rows].reverse());
        expect(a.pairs).toEqual(b.pairs);
    });

    it('ignore les montants non finis et les zéros (aucune contamination)', () => {
        const r = detectInternalTransfers([
            { id: 1, date: '2026-07-10', amount: Number.NaN, account: 'PCA' },
            { id: 2, date: '2026-07-10', amount: 0, account: 'TS1' },
            { id: 3, date: '2026-07-10', amount: Number.POSITIVE_INFINITY, account: 'TS1' },
        ]);
        expect(r.pairs).toHaveLength(0);
    });

    it('applique la garde `canPair` de l\'appelant (contrainte de rôles Fintable)', () => {
        const rows = [
            { id: 1, date: '2026-07-10', amount: -500, account: 'PCA' },
            { id: 2, date: '2026-07-10', amount: 500, account: 'TS1' },
        ];
        expect(detectInternalTransfers(rows).pairs).toHaveLength(1);
        expect(detectInternalTransfers(rows, { canPair: () => false }).pairs).toHaveLength(0);
    });
});

describe('applyTransferDetection — application aux transactions de l\'app', () => {
    it('marque automatiquement les DEUX côtés d\'une paire prouvée et préserve la catégorie d\'origine', () => {
        const before = [
            tx({ id: 1, date: '2026-07-10', amount: -500, accountName: 'PCA', category: 'Magasinage' }),
            tx({ id: 2, date: '2026-07-10', amount: 500, accountName: 'TS1', category: 'Revenus divers' }),
        ];
        const { transactions, report } = applyTransferDetection(before);
        expect(report.markedCount).toBe(2);
        expect(transactions.every((t) => t.isTransfer === true)).toBe(true);
        expect(transactions.every((t) => t.category === 'Transfert')).toBe(true);
        expect(transactions[0].originalCategory).toBe('Magasinage');
        expect(transactions[1].originalCategory).toBe('Revenus divers');
    });

    it('n\'écrit RIEN pour une paire seulement suggérée — elle remonte à l\'utilisateur', () => {
        const before = [
            tx({ id: 1, date: '2026-07-10', amount: -300, category: 'Épicerie' }),
            tx({ id: 2, date: '2026-07-10', amount: 300, category: 'Autre' }),
        ];
        const { transactions, report } = applyTransferDetection(before);
        expect(report.markedCount).toBe(0);
        expect(report.suggestions).toHaveLength(1);
        expect(report.suggestions[0].amount).toBe(300);
        expect(transactions).toBe(before); // référence inchangée : aucun re-render inutile
        expect(transactions.some((t) => t.isTransfer)).toBe(false);
    });

    it('respecte le verrou manuel : une paire dont un côté est corrigé à la main n\'est PAS appliquée', () => {
        const before = [
            tx({ id: 1, date: '2026-07-10', amount: -500, accountName: 'PCA', status: 'manual', category: 'Loisirs' }),
            tx({ id: 2, date: '2026-07-10', amount: 500, accountName: 'TS1' }),
        ];
        const { transactions, report } = applyTransferDetection(before);
        expect(report.markedCount).toBe(0);
        expect(report.skippedManualCount).toBe(1);
        // Aucun côté marqué : marquer le seul côté libre déséquilibrerait le budget.
        expect(transactions.some((t) => t.isTransfer)).toBe(false);
        expect(transactions[0].category).toBe('Loisirs');
    });

    it('est idempotent : une 2ᵉ passe ne marque plus rien', () => {
        const before = [
            tx({ id: 1, date: '2026-07-10', amount: -500, accountName: 'PCA' }),
            tx({ id: 2, date: '2026-07-10', amount: 500, accountName: 'TS1' }),
        ];
        const first = applyTransferDetection(before);
        expect(first.report.markedCount).toBe(2);
        const second = applyTransferDetection(first.transactions);
        expect(second.report.markedCount).toBe(0);
        expect(second.report.alreadyMarkedCount).toBe(1);
        expect(second.transactions).toBe(first.transactions);
    });

    it('ignore les doublons marqués (ils ne doivent pas consommer une contrepartie légitime)', () => {
        const before = [
            tx({ id: 1, date: '2026-07-10', amount: -500, accountName: 'PCA', isDuplicate: true }),
            tx({ id: 2, date: '2026-07-10', amount: -500, accountName: 'PCA' }),
            tx({ id: 3, date: '2026-07-10', amount: 500, accountName: 'TS1' }),
        ];
        const { report, transactions } = applyTransferDetection(before);
        expect(report.markedCount).toBe(2);
        expect(transactions.find((t) => t.id === 1)?.isTransfer).toBeFalsy();
        expect(transactions.find((t) => t.id === 2)?.isTransfer).toBe(true);
    });

    it('remonte un diagnostic honnête (comptes manquants, Interac écartés) au lieu de rester muet', () => {
        const before = [
            tx({ id: 1, date: '2026-07-10', amount: -300, payee: 'Virement' }),
            tx({ id: 2, date: '2026-07-10', amount: 300, payee: 'Virement' }),
            tx({ id: 3, date: '2026-07-11', amount: -50, accountName: 'PCA', payee: 'Virement Interac a Julie' }),
        ];
        const { report } = applyTransferDetection(before);
        expect(report.withoutAccountCount).toBe(2);
        expect(report.interacExcludedCount).toBe(1);
    });
});
