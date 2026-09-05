// tests/services/interacRecuRemboursement.test.ts
//
// [TX-INTERAC-REMBOURSEMENT] Garde de CHAÎNE (décision Marc 2026-09-05, réponse 1a) : un Interac REÇU
// entre par le VRAI pipeline d'import (`parseBankCsv` → règles de catégorisation) et ressort du
// revenu affiché au Budget (`computeIncomeBreakdown`, `computeMonthlyActualAverages`) — il vient en
// CRÉDIT du poste « Remboursement » (`isCreditBack`), jamais en revenu.
//
// Pourquoi une chaîne et pas six tests unitaires de plus : `spendRules.test.ts` prouvait depuis le
// 2026-07-31 que « Remboursement » est un crédit — sur des transactions FABRIQUÉES avec cette
// catégorie. Or aucune règle ne l'écrivait : la prod ne produisait jamais la combinaison testée
// (`UN-TROU-ENTRE-DEUX-MOITIES-TESTEES-N-APPARTIENT-A-PERSONNE`). Ici, la catégorie vient de la
// règle, pas de la fixture. Discriminant : remettre la règle sur « Revenus divers » rougit les
// trois premiers cas (mesuré).
import { describe, it, expect } from 'vitest';
import { parseBankCsv } from '../../services/import/parseBankCsv';
import { computeIncomeBreakdown, computeMonthlyActualAverages } from '../../utils/budgetSync';
import { isCreditBack, isSpend, spendAmountOf } from '../../utils/spendRules';

const csv = [
    'date,description,amount',
    '2026-05-01,Paie / ROBOVIC INC.,5000',
    '2026-05-03,Virement Interac de / ANNA LUCIE MAL/,300',
    '2026-05-04,IGA St-Roch,-200',
    '2026-05-05,Virement Interac à / ANNA LUCIE MAL/,-150',
].join('\n');

const importer = () => {
    const { transactions } = parseBankCsv(csv);
    expect(transactions, 'la fixture doit produire 4 lignes').toHaveLength(4);
    return transactions;
};

describe('[TX-INTERAC-REMBOURSEMENT] un Interac REÇU importé est un crédit, pas un revenu (chaîne réelle)', () => {
    it('la règle d’import le classe « Remboursement », non transfert, crédit sur le poste', () => {
        const recu = importer().find(t => t.amount === 300)!;
        expect(recu.category).toBe('Remboursement');
        expect(recu.isTransfer).toBe(false);
        expect(isCreditBack(recu)).toBe(true);
        expect(isSpend(recu)).toBe(true);
        expect(spendAmountOf(recu)).toBe(-300); // vient EN DÉDUCTION du poste
    });

    it('le revenu réel du Budget ne contient que la paie : 5 000 $, pas 5 300 $', () => {
        // Avant la règle, l'Interac reçu tombait en « Revenus divers » → +300 $ de faux revenu, soit
        // 5,7 % du revenu de ce mois (mesuré sur cette fixture ; 900 $/mois sur le corpus réel).
        expect(computeIncomeBreakdown(importer())).toEqual({ salary: 5000, other: 0, total: 5000 });
    });

    it('les moyennes mensuelles : revenu 5 000 $, dépenses 350 $ — le crédit ne réduit QUE son poste', () => {
        const avg = computeMonthlyActualAverages(importer(), new Date('2026-06-15T12:00:00Z'));
        expect(avg.fullMonths).toBe(1);
        expect(avg.incomeAvg).toBe(5000);
        expect(avg.otherAvg).toBe(0);
        // 200 (épicerie) + 150 (Interac ENVOYÉ → « Autre », une vraie dépense). Le crédit de 300 $ ne
        // touche que le poste « Remboursement », plancher 0 : il n'efface pas l'épicerie
        // (règle [TX-INTERAC-BUDGET] de `computeMonthlyActualAverages`).
        expect(avg.expenseAvg).toBe(350);
    });

    it('contrôle : un Interac ENVOYÉ reste une dépense (« Autre »), pas un crédit', () => {
        const envoye = importer().find(t => t.amount === -150)!;
        expect(envoye.category).toBe('Autre');
        expect(isSpend(envoye)).toBe(true);
        expect(isCreditBack(envoye)).toBe(false);
        expect(spendAmountOf(envoye)).toBe(150);
    });
});
