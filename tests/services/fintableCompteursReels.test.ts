// tests/services/fintableCompteursReels.test.ts
//
// [FINTABLE-TXADDED-MENT] Les compteurs de la sync décrivent-ils ce qui a été ÉCRIT ?
//
// ⚠️ LE DÉFAUT D'ORIGINE, mesuré par l'audit de la PR #649. `applyPayloadsIsolated` comptait
// `doc.transactions.length` — la taille du PAYLOAD — alors qu'`applyBankStatement` écarte les
// doublons, les montants aberrants et les lignes malformées. Le toast « N transaction(s)
// ajoutée(s) » mentait donc le PLUS fort exactement là où le recouvrement est maximal, c'est-à-dire
// dans le cas nominal d'une sync quotidienne : 3 annoncées, 0 écrites.
//
// ⚠️ Et l'en-tête de `mcp/runFintableSync.ts` AFFIRMAIT déjà la propriété que le code n'avait pas
// (« ses compteurs décrivent ce qui a réellement été appliqué ») : une doc qui décrit l'intention se
// lit comme une garantie.
//
// Les deux compteurs VOISINS avaient la même faute, trouvés en relisant la boucle plutôt que la
// seule ligne du ticket : `cashUpdated` était posé même quand `applyCashBalance` ne touche à rien
// (écart < 0,005 $), et `debtsUpdated` listait une dette « déjà à jour ». Ces deux drapeaux sont
// AFFICHÉS dans SystemView (« Liquidités : mises à jour / inchangées »).
import { describe, it, expect } from 'vitest';
import { applyPayloadsIsolated } from '../../services/fintable/syncCore';
import type { AppState } from '../../types';

const etatBase = (): AppState => ({
    initialBalances: { LIQUIDITE: 1000 },
    transactions: [
        { id: 1, date: '2026-07-15', payee: 'Épicerie Metro', amount: -50, category: 'Épicerie', status: 'processed' },
    ],
    debts: [
        { id: 'd1', name: 'Visa', balance: 2000, interestRate: 19.9, minimumPayment: 60, category: 'Credit Card' },
    ],
} as unknown as AppState);

describe('[FINTABLE-TXADDED-MENT] les compteurs comptent les ÉCRITURES', () => {
    it('un lot 100 % en doublon rapporte 0, pas 3', () => {
        // Le cas EXACT du ticket : la sync re-propose les mêmes lignes que la veille.
        const tx = { date: '2026-07-15', payee: 'Épicerie Metro', amount: -50 };
        const res = applyPayloadsIsolated(etatBase(), [
            { kind: 'bank_statement', transactions: [tx, tx, tx] },
        ]);
        expect(res.transactionsAdded).toBe(0);
        expect((res.nextState.transactions ?? []).length, 'aucune écriture attendue').toBe(1);
    });

    it('un lot mixte ne compte que la ligne réellement écrite', () => {
        const res = applyPayloadsIsolated(etatBase(), [
            {
                kind: 'bank_statement',
                transactions: [
                    { date: '2026-07-15', payee: 'Épicerie Metro', amount: -50 },   // doublon
                    { date: '2026-07-16', payee: 'Erreur de saisie', amount: -1e9 }, // montant aberrant, écarté
                    { date: '2026-07-17', payee: 'Café', amount: -4.25 },            // la seule vraie
                ],
            },
        ]);
        expect(res.transactionsAdded).toBe(1);
        // Anti-vacuité : le scénario doit VRAIMENT écrire quelque chose, sinon « 1 ≠ 3 » serait
        // obtenu par un chemin qui n'écrit jamais rien.
        expect((res.nextState.transactions ?? []).length).toBe(2);
    });

    it('un solde de liquidités déjà à jour ne se déclare pas « mis à jour »', () => {
        // `applyCashBalance` retourne l'état INCHANGÉ sous 0,005 $ d'écart. Le solde courant vaut
        // 1000 − 50 = 950 $ (solde de départ + transactions).
        const res = applyPayloadsIsolated(etatBase(), [{ kind: 'cash_balance', targetCad: 950 }]);
        expect(res.cashUpdated).toBe(false);
        expect(res.warnings, 'un no-op légitime n’est PAS un avertissement').toEqual([]);
    });

    it('… mais un solde qui bouge se déclare bien mis à jour (sens inverse)', () => {
        const res = applyPayloadsIsolated(etatBase(), [{ kind: 'cash_balance', targetCad: 1500 }]);
        expect(res.cashUpdated).toBe(true);
    });

    it('[FINTABLE-ANCRE-LIQUIDITE-GONFLEE] le déplacement de l’ancre est MESURÉ et publié', () => {
        // Le cas du ticket : un doublon qui échappe au classement (`callerClassified` : l'appelant
        // affirme avoir déjà tranché, donc la dédup par clé ne droppe plus) fait compter la dépense
        // DEUX fois. Le total présent est ensuite recalé par le payload `cash_balance` — mais en
        // déplaçant l'ancre, ce qui décale TOUT l'historique passé du même montant.
        const res = applyPayloadsIsolated(
            { initialBalances: { LIQUIDITE: 1000 }, transactions: [], debts: [] } as unknown as AppState,
            [
                {
                    kind: 'bank_statement', callerClassified: true,
                    transactions: [
                        { date: '2026-07-01', payee: 'Épicerie', amount: -300 },
                        { date: '2026-07-01', payee: 'Épicerie', amount: -300 },
                    ],
                },
                { kind: 'cash_balance', targetCad: 700 },
            ],
        );
        // Les deux lignes SONT écrites (c'est le sens de `callerClassified`) …
        expect((res.nextState.transactions ?? []).length).toBe(2);
        // … et l'ancre a bougé de +300 $ pour absorber la dépense comptée en double.
        expect((res.nextState.initialBalances as Record<string, number>).LIQUIDITE).toBe(1300);
        // Ce que ce lot ajoute : le mouvement est MESURÉ et publié, au lieu d'être silencieux.
        expect(res.cashAnchorDelta).toBeCloseTo(300, 5);
    });

    it('[FINTABLE-ANCRE-LIQUIDITE-GONFLEE] une passe sans écart ne déplace RIEN (sens inverse)', () => {
        // Sans cette assertion, un `cashAnchorDelta` qui rendrait n'importe quoi passerait le test
        // ci-dessus dès qu'il est non nul — et l'écran afficherait une alarme permanente.
        const res = applyPayloadsIsolated(etatBase(), [{ kind: 'cash_balance', targetCad: 950 }]);
        expect(res.cashAnchorDelta).toBe(0);
    });

    it('une dette aux mêmes valeurs ne figure pas dans `debtsUpdated`', () => {
        const res = applyPayloadsIsolated(etatBase(), [
            { kind: 'debt', name: 'Visa', balance: 2000, interestRate: 19.9, minimumPayment: 60 },
        ]);
        expect(res.debtsUpdated).toEqual([]);
    });

    it('… et une dette dont le solde change y figure (sens inverse)', () => {
        const res = applyPayloadsIsolated(etatBase(), [
            { kind: 'debt', name: 'Visa', balance: 1800, interestRate: 19.9, minimumPayment: 60 },
        ]);
        expect(res.debtsUpdated).toEqual(['Visa']);
    });
});
