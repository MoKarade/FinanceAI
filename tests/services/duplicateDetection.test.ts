// [TX-DUPLICATES] Détection de doublons : ce qu'elle doit attraper, et surtout ce qu'elle ne doit PAS.

import { describe, it, expect } from 'vitest';
import {
    findDuplicateGroups,
    markTransactionsAsDuplicate,
    summarizeDuplicates,
    unmarkTransactionsAsDuplicate,
} from '../../services/transactions/duplicateDetection';
import type { Transaction } from '../../types';

function tx(over: Partial<Transaction> & { id: number }): Transaction {
    return {
        date: '2026-07-15', payee: 'IGA', amount: -42.5, category: 'Épicerie',
        status: 'processed', ...over,
    } as Transaction;
}

describe('le cas qui motive la feature : deux sources, libellés différents', () => {
    it('regroupe malgré des libellés qui ne se ressemblent pas', () => {
        // C'est le trou exact de la dédup existante : `txnKey` inclut le payee, donc
        // « IGA #123 » (relevé PDF) et « Iga Marche » (Fintable) sont deux clés différentes.
        const groups = findDuplicateGroups([
            tx({ id: 1, payee: 'IGA #123 MONTREAL' }),
            tx({ id: 2, payee: 'Iga Marche' }),
        ]);

        expect(groups).toHaveLength(1);
        expect(groups[0].members.map((m) => m.id)).toEqual([1, 2]);
        expect(groups[0].payeesDiffer).toBe(true);
    });

    it('suggère de GARDER le plus ancien id (l\'historique déjà catégorisé)', () => {
        // Les imports manuels ont les ids les plus bas ; une source récente arrive après. On garde
        // donc le travail de catégorisation existant.
        const groups = findDuplicateGroups([tx({ id: 7 }), tx({ id: 42 }), tx({ id: 99 })]);
        expect(groups[0].suggestedKeepId).toBe(7);
        expect(groups[0].suggestedMarkIds).toEqual([42, 99]);
    });
});

describe('ce que la détection ne doit PAS faire', () => {
    it('ne regroupe pas des montants différents, même d\'un cent', () => {
        expect(findDuplicateGroups([tx({ id: 1, amount: -42.5 }), tx({ id: 2, amount: -42.51 })])).toEqual([]);
    });

    it('ne regroupe pas des signes opposés (un virement sortant et son entrant)', () => {
        // Sortie de A (-500) et entrée en B (+500) sont deux vraies lignes, pas un doublon.
        expect(findDuplicateGroups([tx({ id: 1, amount: -500 }), tx({ id: 2, amount: 500 })])).toEqual([]);
    });

    it('ne regroupe pas des dates différentes quand la tolérance est nulle (défaut)', () => {
        expect(findDuplicateGroups([
            tx({ id: 1, date: '2026-07-15' }),
            tx({ id: 2, date: '2026-07-16' }),
        ])).toEqual([]);
    });

    it('ignore les transactions DÉJÀ marquées en doublon', () => {
        // Rien à re-proposer : elles sont déjà exclues de tous les calculs.
        expect(findDuplicateGroups([tx({ id: 1 }), tx({ id: 2, isDuplicate: true })])).toEqual([]);
    });

    it('ignore les montants non finis et les dates illisibles plutôt que de deviner', () => {
        expect(findDuplicateGroups([
            tx({ id: 1, amount: Number.NaN }), tx({ id: 2, amount: Number.NaN }),
        ])).toEqual([]);
        expect(findDuplicateGroups([
            tx({ id: 1, date: 'pas-une-date' }), tx({ id: 2, date: 'pas-une-date' }),
        ])).toEqual([]);
    });

    it('ne rend JAMAIS un groupe d\'un seul élément', () => {
        expect(findDuplicateGroups([tx({ id: 1 })])).toEqual([]);
    });

    it('ne marque rien de lui-même — il ne fait que PROPOSER', () => {
        // Garde-fou explicite : deux cafés identiques le même jour sont un vrai faux positif, et
        // marquer à tort retirerait de l'argent réel des calculs.
        const input = [tx({ id: 1 }), tx({ id: 2 })];
        findDuplicateGroups(input);
        expect(input.every((t) => !t.isDuplicate)).toBe(true);
    });
});

describe('tolérance de dates', () => {
    it('regroupe à ±1 jour quand la tolérance le permet (autorisation vs comptabilisation)', () => {
        const groups = findDuplicateGroups([
            tx({ id: 1, date: '2026-07-15' }),
            tx({ id: 2, date: '2026-07-16' }),
        ], { dayToleranceDays: 1 });
        expect(groups).toHaveLength(1);
        expect(groups[0].datesDiffer).toBe(true);
    });

    it('ne regroupe pas au-delà de la tolérance', () => {
        expect(findDuplicateGroups([
            tx({ id: 1, date: '2026-07-15' }),
            tx({ id: 2, date: '2026-07-20' }),
        ], { dayToleranceDays: 1 })).toEqual([]);
    });

    it('sépare deux paires distinctes éloignées dans le temps, même montant', () => {
        // Un abonnement mensuel au même prix ne doit pas fusionner tous les mois en un seul groupe.
        const groups = findDuplicateGroups([
            tx({ id: 1, date: '2026-06-01' }), tx({ id: 2, date: '2026-06-01' }),
            tx({ id: 3, date: '2026-07-01' }), tx({ id: 4, date: '2026-07-01' }),
        ]);
        expect(groups).toHaveLength(2);
        expect(groups.map((g) => g.members.length)).toEqual([2, 2]);
    });
});

describe('ordre et résumé', () => {
    it('classe les gros montants d\'abord (le doublon le plus coûteux en premier)', () => {
        const groups = findDuplicateGroups([
            tx({ id: 1, amount: -5 }), tx({ id: 2, amount: -5 }),
            tx({ id: 3, amount: -900 }), tx({ id: 4, amount: -900 }),
        ]);
        expect(groups.map((g) => g.amount)).toEqual([-900, -5]);
    });

    it('résume le nombre de lignes redondantes et le montant en jeu', () => {
        const groups = findDuplicateGroups([
            tx({ id: 1, amount: -100 }), tx({ id: 2, amount: -100 }), tx({ id: 3, amount: -100 }),
        ]);
        expect(summarizeDuplicates(groups)).toEqual({
            groupCount: 1, redundantCount: 2, redundantAmount: -200,
        });
    });
});

describe('marquage — pur et réversible', () => {
    it('marque les ids demandés sans muter l\'entrée', () => {
        const input = [tx({ id: 1 }), tx({ id: 2 })];
        const out = markTransactionsAsDuplicate(input, [2]);
        expect(out.find((t) => t.id === 2)?.isDuplicate).toBe(true);
        expect(out.find((t) => t.id === 1)?.isDuplicate).toBeFalsy();
        expect(input[1].isDuplicate).toBeFalsy(); // entrée intacte
    });

    it('un id inconnu est sans effet (l\'UI peut envoyer une sélection périmée)', () => {
        const out = markTransactionsAsDuplicate([tx({ id: 1 })], [999]);
        expect(out).toHaveLength(1);
        expect(out[0].isDuplicate).toBeFalsy();
    });

    it('le marquage est RÉVERSIBLE — c\'est ce qui le rend sûr face à la suppression', () => {
        const marked = markTransactionsAsDuplicate([tx({ id: 1 }), tx({ id: 2 })], [2]);
        const restored = unmarkTransactionsAsDuplicate(marked, [2]);
        expect(restored.find((t) => t.id === 2)?.isDuplicate).toBe(false);
        // La donnée n'a jamais été détruite : montant, date et libellé sont intacts.
        expect(restored.find((t) => t.id === 2)?.amount).toBe(-42.5);
    });

    it('ne re-marque pas ce qui l\'est déjà (idempotent)', () => {
        const once = markTransactionsAsDuplicate([tx({ id: 1 })], [1]);
        const twice = markTransactionsAsDuplicate(once, [1]);
        expect(twice[0]).toBe(once[0]); // même référence : aucun changement inutile
    });
});
