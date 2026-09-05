// tests/utils/budgetSync.test.ts
// [BUDGET-TX-CATEGORIES] — le Budget = seulement et exactement les catégories des transactions
// (verbatim Marc 2026-07-15). Sync idempotente + historique mensuel par catégorie.

import { describe, it, expect } from 'vitest';
import { syncBudgetWithTransactionCategories, buildMonthlyLedger, computeMonthlyActualAverages, computeIncomeBreakdown, computeAvgByItem, fullHistoryMonths, lastMonths } from '../../utils/budgetSync';
import type { BudgetCategory, Transaction } from '../../types';

const REF = new Date(2026, 6, 15); // 15 juillet 2026 (mois 6 = juillet)

let seq = 1;
const tx = (over: Partial<Transaction>): Transaction => ({
    id: seq++, date: '2026-07-02', payee: 'X', amount: -50, category: 'Épicerie',
    status: 'processed', isTransfer: false, isDuplicate: false,
    ...over,
} as Transaction);

const item = (name: string, target = 100): BudgetCategory => ({
    id: `cat_${name}`, name, target, frequency: 'Monthly', type: 'Commun', nature: 'Besoin',
});

describe('syncBudgetWithTransactionCategories', () => {
    it('AJOUTE les catégories observées manquantes (cible = MOYENNE sur fenêtre 6 mois, zéros inclus) et RETIRE les postes sans transaction', () => {
        const transactions = [
            tx({ category: 'Épicerie', amount: -100, date: '2026-05-10' }),
            tx({ category: 'Épicerie', amount: -300, date: '2026-06-10' }),
            tx({ category: 'Épicerie', amount: -200, date: '2026-07-02' }),
            tx({ category: 'Restaurants', amount: -80, date: '2026-07-03' }),
        ];
        const existing = [item('Restaurants', 250), item('Loisirs', 400)]; // Loisirs : aucune tx
        const r = syncBudgetWithTransactionCategories(transactions, existing, REF);
        expect(r.changed).toBe(true);
        expect(r.added).toEqual(['Épicerie']);
        expect(r.removed).toEqual(['Loisirs']);
        const names = r.items.map(i => i.name).sort();
        expect(names).toEqual(['Restaurants', 'Épicerie'].sort());
        // Poste conservé INTACT (cible utilisateur préservée — autoTarget absent = manuel)
        expect(r.items.find(i => i.name === 'Restaurants')!.target).toBe(250);
        // Cible auto = MOYENNE DE TOUT LE PASSÉ (mois PLEINS : mai + juin = 2 mois ;
        // juillet EN COURS exclu) : (100+300)/2 = 200. Marqué autoTarget.
        const epicerie = r.items.find(i => i.name === 'Épicerie')!;
        expect(epicerie.target).toBe(200);
        expect(epicerie.nature).toBe('Besoin');
        expect(epicerie.autoTarget).toBe(true);
    });

    it('cible run-rate : un poste PONCTUEL (Voyages 2400 $ un seul mois sur 6 pleins) ne devient PAS 2400 $/mois (finding F1)', () => {
        const transactions = [
            tx({ category: 'Voyages', amount: -2400, date: '2026-01-15' }),
            tx({ category: 'Épicerie', amount: -50, date: '2026-01-02' }), // ancre le début d'historique
        ];
        const r = syncBudgetWithTransactionCategories(transactions, [], REF);
        // Historique plein = janv→juin 2026 (6 mois) → 2400/6 = 400
        expect(r.items.find(i => i.name === 'Voyages')!.target).toBe(400);
    });

    it('un poste AUTO renommé (fuzzy) voit sa cible recalculée SOUS LE NOUVEAU NOM dès cette passe (finding panel)', () => {
        const transactions = [
            tx({ category: 'Restaurants', amount: -80, date: '2026-05-03' }),
            tx({ category: 'Restaurants', amount: -120, date: '2026-06-03' }),
        ];
        const existing = [{ ...item('Restaurant', 999), autoTarget: true }];
        const r = syncBudgetWithTransactionCategories(transactions, existing, REF);
        const it0 = r.items.find(i => i.name === 'Restaurants')!;
        expect(it0.target).toBe(100); // (80+120)/2 mois pleins — pas 999 (une passe de retard)
        expect(it0.autoTarget).toBe(true);
    });

    it('une cible AUTO se recalcule à la sync (moyenne de tout le passé) ; une cible MANUELLE jamais', () => {
        const transactions = [
            tx({ category: 'Épicerie', amount: -100, date: '2026-05-10' }),
            tx({ category: 'Épicerie', amount: -300, date: '2026-06-10' }),
        ];
        const auto = { ...item('Épicerie', 999), autoTarget: true };
        const manual = { ...item('Restaurants', 555) };
        const withRestoTx = [...transactions, tx({ category: 'Restaurants', amount: -80, date: '2026-06-03' })];
        const r = syncBudgetWithTransactionCategories(withRestoTx, [auto, manual], REF);
        expect(r.changed).toBe(true);
        expect(r.items.find(i => i.name === 'Épicerie')!.target).toBe(200);   // (100+300)/2 — recalculée
        expect(r.items.find(i => i.name === 'Restaurants')!.target).toBe(555); // manuelle intacte
    });

    it('RENOMME (réglages préservés) un poste flou-rapprochable au lieu de le supprimer/recréer (finding F2)', () => {
        const transactions = [tx({ category: 'Restaurants', amount: -80, date: '2026-07-03' })];
        const existing = [{ ...item('Restaurant', 350), nature: 'Envie' as const, type: 'Perso 1' as const }];
        const r = syncBudgetWithTransactionCategories(transactions, existing, REF);
        expect(r.changed).toBe(true);
        expect(r.renamed).toEqual(['Restaurant → Restaurants']);
        expect(r.removed).toEqual([]);
        expect(r.added).toEqual([]);
        const it0 = r.items.find(i => i.name === 'Restaurants')!;
        expect(it0.target).toBe(350);      // cible UTILISATEUR préservée (pas la moyenne suggérée)
        expect(it0.nature).toBe('Envie');
        expect(it0.type).toBe('Perso 1');
    });

    it('Impôts n\'est JAMAIS un poste de budget (revenu net déjà après impôt — finding F3)', () => {
        const transactions = [tx({ category: 'Impôts', amount: -475.96, date: '2026-04-30' })];
        const r = syncBudgetWithTransactionCategories(transactions, [], REF);
        expect(r.changed).toBe(false);
        expect(r.items).toEqual([]);
    });

    it('IDEMPOTENTE : un 2e passage sur le résultat → zéro dérive (même référence)', () => {
        const transactions = [tx({ category: 'Épicerie' }), tx({ category: 'Transport' })];
        const first = syncBudgetWithTransactionCategories(transactions, [], REF);
        expect(first.changed).toBe(true);
        const second = syncBudgetWithTransactionCategories(transactions, first.items, REF);
        expect(second.changed).toBe(false);
        expect(second.items).toBe(first.items);
    });

    it('IGNORE revenus, transferts, doublons, statuts « à classer » — jamais des postes de budget', () => {
        const transactions = [
            tx({ category: 'Salaire', amount: 3000 }),               // revenu (positif)
            tx({ category: 'Salaire', amount: -10 }),                // même classé dépense : revenu exclu
            tx({ category: 'Transfert', amount: -500 }),
            tx({ category: 'Épicerie', amount: -50, isTransfer: true }),
            tx({ category: 'Épicerie', amount: -50, isDuplicate: true }),
            tx({ category: 'Uncategorized', amount: -50 }),
            tx({ category: 'Non catégorisé', amount: -50 }),
        ];
        const r = syncBudgetWithTransactionCategories(transactions, [], REF);
        expect(r.changed).toBe(false);
        expect(r.items).toEqual([]);
    });

    it('NO-OP sur transactions vides (ne vide JAMAIS le budget sur un état pas hydraté)', () => {
        const existing = [item('Épicerie')];
        const r = syncBudgetWithTransactionCategories([], existing, REF);
        expect(r.changed).toBe(false);
        expect(r.items).toBe(existing);
    });
});

describe('buildMonthlyLedger (réel revenus + dépenses par mois)', () => {
    it('dépenses ET revenus par mois, totaux, solde ; mois courant marqué et EXCLU des moyennes', () => {
        const transactions = [
            tx({ category: 'Épicerie', amount: -100, date: '2026-07-02' }),
            tx({ category: 'Épicerie', amount: -200, date: '2026-06-05' }),
            tx({ category: 'Restaurants', amount: -30, date: '2026-06-11' }),
            tx({ category: 'Salaire', amount: 1674.62, date: '2026-06-04' }),
            tx({ category: 'Salaire', amount: 837.31, date: '2026-07-03' }),
            tx({ category: 'Uncategorized', amount: 50, date: '2026-06-20' }), // revenu à classer
            tx({ category: 'Salaire', amount: 999, date: '2026-06-15', isTransfer: true }), // exclu
            tx({ category: 'Épicerie', amount: -999, date: '2025-06-05' }), // hors fenêtre 12 mois
        ];
        const l = buildMonthlyLedger(transactions, ['Épicerie', 'Restaurants'], 12, REF);
        expect(l.months).toHaveLength(12);
        expect(l.months[11]).toBe('2026-07');
        expect(l.currentMonthIndex).toBe(11);
        // Dépenses
        const epicerie = l.expenseRows.find(r => r.category === 'Épicerie')!;
        expect(epicerie.byMonth[11]).toBe(100); // juillet (en cours)
        expect(epicerie.byMonth[10]).toBe(200); // juin
        // Moyenne = RUN-RATE sur les mois pleins de la fenêtre couverts par l'historique
        // (historique depuis 2025-06 → les 11 mois pleins de la fenêtre sont couverts) ;
        // juillet (partiel) EXCLU. Sémantique alignée sur la cible auto (finding panel).
        expect(epicerie.monthlyAverage).toBeCloseTo(200 / 11, 4);
        // Revenus
        const salaire = l.incomeRows.find(r => r.category === 'Salaire')!;
        expect(salaire.byMonth[10]).toBe(1674.62);
        expect(salaire.byMonth[11]).toBe(837.31);
        // [BUDGET-LEDGER-POSITIFS-EXCLUS-NOMMES] INVERSÉ le 2026-09-05 (décision Marc 2b) : le positif
        // « à classer » (+50) était une ligne de REVENU « Autres revenus » et entrait dans le total —
        // le grand livre disait 1 724,62 $ pendant que le KPI Revenus disait 1 674,62 $. Il est
        // désormais EXCLU du revenu et NOMMÉ sous « Non classées ». Un test de limite s'inverse.
        expect(l.incomeRows.find(r => r.category === 'Autres revenus')).toBeUndefined();
        expect(l.entreesHorsRevenuRows.find(r => r.category === 'Non classées')!.byMonth[10]).toBe(50);
        expect(l.entreesHorsRevenuByMonth[10]).toBe(50);
        // Totaux + solde (juin) : revenus 1674.62 (le +50 est hors revenu), dépenses 230
        expect(l.totalIncomeByMonth[10]).toBeCloseTo(1674.62, 2);
        expect(l.totalExpenseByMonth[10]).toBe(230);
        expect(l.netByMonth[10]).toBeCloseTo(1444.62, 2);
    });

    // [BUDGET-MATCH-UNIFY] Le ledger rapproche par la MÊME règle que le réel (fuzzy) — avant,
    // match EXACT seul : « Restaurant » (tx) ne comptait PAS dans le poste « Restaurants »
    // (réel 600 $ · moy 0 $, l'historique filait dans « Autres » — finding financial-integrity PR #500).
    it('rapproche en fuzzy comme le réel : « Restaurant » compte dans le poste « Restaurants »', () => {
        const transactions = [
            tx({ category: 'Restaurant', amount: -300, date: '2026-05-10' }),
            tx({ category: 'Restaurant', amount: -300, date: '2026-06-10' }),
            tx({ category: 'Impôts', amount: -100, date: '2026-06-15' }), // aucun poste → Autres
        ];
        const l = buildMonthlyLedger(transactions, ['Restaurants'], 12, REF);
        const resto = l.expenseRows.find(r => r.category === 'Restaurants')!;
        expect(resto.byMonth[10]).toBe(300); // juin
        expect(resto.monthlyAverage).toBeCloseTo(300, 4); // 600 $ / 2 mois pleins (mai-juin)
        // La dépense rapprochée ne fuit PLUS dans « Autres » ; la vraie orpheline y reste.
        const autres = l.expenseRows.find(r => r.category === 'Autres / non classées')!;
        expect(autres.byMonth[10]).toBe(100);
        // L'invariant de visibilité tient toujours : Σ(lignes) == Total dépenses.
        const sum = l.expenseRows.reduce((s, r) => s + r.byMonth[10], 0);
        expect(sum).toBeCloseTo(l.totalExpenseByMonth[10], 2);
    });

    it('une dépense HORS postes tombe dans « Autres / non classées » — Σ(lignes) == Total (finding panel)', () => {
        const transactions = [
            tx({ category: 'Épicerie', amount: -100, date: '2026-06-05' }),
            tx({ category: 'Impôts', amount: -475.96, date: '2026-06-30' }),       // jamais un poste
            tx({ category: 'Uncategorized', amount: -20, date: '2026-06-12' }),
        ];
        const l = buildMonthlyLedger(transactions, ['Épicerie'], 12, REF);
        const autres = l.expenseRows.find(r => r.category === 'Autres / non classées')!;
        expect(autres.byMonth[10]).toBeCloseTo(495.96, 2);
        const sumRows = l.expenseRows.reduce((s, r) => s + r.byMonth[10], 0);
        expect(sumRows).toBeCloseTo(l.totalExpenseByMonth[10], 2); // aucun écart silencieux
    });

    // [BUDGET-LEDGER-POSITIFS-EXCLUS-NOMMES] Le cas MESURÉ du ticket (salaire 6 000 + retour Amazon 200 +
    // dépôt non classé 500) : le grand livre disait 6 700 $ pendant que le KPI disait 6 000 $ (11,7 %).
    it('[BUDGET-LEDGER-POSITIFS-EXCLUS-NOMMES] les positifs hors revenu sont EXCLUS du total et NOMMÉS, rien n\'est perdu', () => {
        const transactions = [
            tx({ category: 'Salaire', amount: 6000, date: '2026-06-04' }),
            tx({ category: 'Magasinage', amount: 200, date: '2026-06-10' }),      // retour marchand
            tx({ category: 'Uncategorized', amount: 500, date: '2026-06-12' }),   // dépôt non classé
            tx({ category: 'Remboursement', amount: 100, date: '2026-06-15' }),   // crédit reçu (lot 172)
            tx({ category: 'Revenus divers', amount: 45, date: '2026-06-20' }),   // vrai revenu
            tx({ category: 'Épicerie', amount: -300, date: '2026-06-18' }),
        ];
        const l = buildMonthlyLedger(transactions, ['Épicerie'], 12, REF);
        expect(l.totalIncomeByMonth[10]).toBe(6045);
        expect(l.incomeRows.map(r => r.category).sort()).toEqual(['Revenus divers', 'Salaire']);
        expect(l.entreesHorsRevenuByMonth[10]).toBe(800);
        expect(l.entreesHorsRevenuRows.map(r => [r.category, r.byMonth[10]])).toEqual([
            ['Non classées', 500], ['Magasinage', 200], ['Remboursement', 100],
        ]);
        expect(l.netByMonth[10]).toBe(6045 - 300);
        // Invariant « jamais perdu en silence » : Σ positifs = revenu + hors revenu.
        const positifs = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
        expect(l.totalIncomeByMonth[10] + l.entreesHorsRevenuByMonth[10]).toBe(positifs);
        // Même revenu que le KPI (source unique INCOME_CATEGORIES) : fin des deux soldes côte à côte.
        expect(l.totalIncomeByMonth[10]).toBe(computeIncomeBreakdown(transactions).total);
    });

    it('lastMonths rend N clés YYYY-MM, ancien → récent', () => {
        expect(lastMonths(3, REF)).toEqual(['2026-05', '2026-06', '2026-07']);
    });

    // [BUDGET-3-VUES] coveredFullMonths exposé — distingue « moyenne = 0 » d'« aucun historique ».
    it('coveredFullMonths = mois pleins de la fenêtre couverts par l\'historique', () => {
        const transactions = [
            tx({ category: 'Épicerie', amount: -200, date: '2026-05-05' }),
            tx({ category: 'Épicerie', amount: -100, date: '2026-07-02' }), // mois courant, partiel
        ];
        const l = buildMonthlyLedger(transactions, ['Épicerie'], 12, REF);
        expect(l.coveredFullMonths).toBe(2); // mai + juin (depuis le 1er mois d'historique), juillet exclu
        const epicerie = l.expenseRows.find(r => r.category === 'Épicerie')!;
        expect(epicerie.monthlyAverage).toBeCloseTo(200 / 2, 4);
    });

    it('coveredFullMonths = 0 quand tout l\'historique tient dans le mois courant (moyenne indisponible)', () => {
        const transactions = [
            tx({ category: 'Épicerie', amount: -100, date: '2026-07-02' }),
        ];
        const l = buildMonthlyLedger(transactions, ['Épicerie'], 12, REF);
        expect(l.coveredFullMonths).toBe(0);
        // La moyenne vaut 0 par CONVENTION dans ce cas — le consommateur DOIT la traiter
        // comme indisponible (« — »), jamais comme un vrai zéro.
        expect(l.expenseRows.find(r => r.category === 'Épicerie')!.monthlyAverage).toBe(0);
    });
});

// [BUDGET-3-VUES] computeAvgByItem — la conversion « convention 0 → null » testée sur un VRAI
// ledger (finding panel : le garde vivait inline dans Budget.tsx, exercé par aucun test).
describe('computeAvgByItem (moyenne par poste prête pour l\'UI)', () => {
    it('rend la moyenne quand l\'historique couvre des mois pleins, un vrai 0 pour un poste sans dépense', () => {
        const transactions = [
            tx({ category: 'Épicerie', amount: -200, date: '2026-05-05' }),
            tx({ category: 'Épicerie', amount: -100, date: '2026-06-05' }),
        ];
        const l = buildMonthlyLedger(transactions, ['Épicerie', 'Loyer'], 12, REF);
        const map = computeAvgByItem(l);
        expect(map['Épicerie']).toBeCloseTo(150, 4);
        // Poste fourni SANS transaction : ligne pré-seedée à 0 → VRAI zéro (pas « — »).
        expect(map['Loyer']).toBe(0);
    });

    it('rend null pour TOUS les postes quand aucun mois plein (tout-ou-rien, jamais un faux 0)', () => {
        const transactions = [tx({ category: 'Épicerie', amount: -100, date: '2026-07-02' })];
        const l = buildMonthlyLedger(transactions, ['Épicerie', 'Loyer'], 12, REF);
        const map = computeAvgByItem(l);
        expect(map['Épicerie']).toBeNull();
        expect(map['Loyer']).toBeNull();
    });

    it('rabat une moyenne NON FINIE sur null ET la signale (jamais un « — » muet sur corruption)', () => {
        // NB : un `amount: NaN` ne TRAVERSE pas le gate `t.amount < 0` (NaN < 0 === false → tx
        // ignorée, moyenne 0) — le vecteur non-fini qui passe le gate est -Infinity.
        const transactions = [
            tx({ category: 'Épicerie', amount: Number.NEGATIVE_INFINITY, date: '2026-06-05' }),
            tx({ category: 'Restaurants', amount: -50, date: '2026-06-05' }),
        ];
        const l = buildMonthlyLedger(transactions, ['Épicerie', 'Restaurants'], 12, REF);
        // Pré-condition : la corruption produit bien une moyenne BRUTE non finie (sinon test vacant).
        expect(Number.isFinite(l.expenseRows.find(r => r.category === 'Épicerie')!.monthlyAverage)).toBe(false);
        const flagged: string[] = [];
        const map = computeAvgByItem(l, c => flagged.push(c));
        expect(map['Épicerie']).toBeNull();
        expect(flagged).toEqual(['Épicerie']);
        expect(map['Restaurants']).toBeCloseTo(50, 4); // le poste sain n'est pas affecté
    });
});

describe('moyennes de TOUT le passé (mois pleins)', () => {
    it('fullHistoryMonths : du 1er mois de transaction au dernier mois RÉVOLU (courant exclu)', () => {
        const transactions = [
            tx({ category: 'Épicerie', amount: -10, date: '2026-03-15' }),
            tx({ category: 'Épicerie', amount: -10, date: '2026-07-02' }), // mois courant
        ];
        expect(fullHistoryMonths(transactions, REF)).toEqual(['2026-03', '2026-04', '2026-05', '2026-06']);
        expect(fullHistoryMonths([tx({ date: '2026-07-02' })], REF)).toEqual([]); // tout est courant
    });

    it('computeMonthlyActualAverages : dépenses ET revenus moyens (transferts/doublons exclus)', () => {
        const transactions = [
            tx({ category: 'Salaire', amount: 2000, date: '2026-05-04' }),
            tx({ category: 'Salaire', amount: 2000, date: '2026-06-04' }),
            tx({ category: 'Épicerie', amount: -400, date: '2026-05-10' }),
            tx({ category: 'Épicerie', amount: -600, date: '2026-06-10' }),
            tx({ category: 'Transfert', amount: -5000, date: '2026-06-15', isTransfer: true }), // exclu
            tx({ category: 'Salaire', amount: 837, date: '2026-07-03' }), // mois courant : exclu
        ];
        const a = computeMonthlyActualAverages(transactions, REF);
        expect(a.fullMonths).toBe(2);
        expect(a.incomeAvg).toBe(2000);
        expect(a.expenseAvg).toBe(500);
    });

    it('[BUDGET-INCOME-REAL] computeMonthlyActualAverages ventile salaire vs divers, exclut les positifs non-revenu', () => {
        const transactions = [
            tx({ category: 'Salaire', amount: 1600, date: '2026-05-04' }),
            tx({ category: 'Salaire', amount: 1600, date: '2026-06-04' }),
            tx({ category: 'Revenus divers', amount: 745, date: '2026-05-25' }),
            tx({ category: 'Remboursement', amount: 500, date: '2026-06-10' }), // positif MAIS pas un revenu → exclu
            tx({ category: 'Épicerie', amount: -400, date: '2026-05-10' }),
        ];
        const a = computeMonthlyActualAverages(transactions, REF);
        expect(a.fullMonths).toBe(2);
        expect(a.salaryAvg).toBe(1600);                 // 3200 / 2
        expect(a.otherAvg).toBe(Math.round(745 / 2));   // 373 (Revenus divers, mai seulement)
        expect(a.incomeAvg).toBe(a.salaryAvg + a.otherAvg);
    });
});

describe('[BUDGET-IMPOTS-HORS-COMPARAISON] computeMonthlyActualAverages — deux assiettes, nommées', () => {
    it('expenseAvg reste ENTIER (impôts inclus) ; expenseAvgHorsComparaison les retire ; horsComparaisonAvg les nomme', () => {
        const transactions = [
            tx({ category: 'Salaire', amount: 2000, date: '2026-05-04' }),
            tx({ category: 'Salaire', amount: 2000, date: '2026-06-04' }),
            tx({ category: 'Épicerie', amount: -400, date: '2026-05-10' }),
            tx({ category: 'Épicerie', amount: -600, date: '2026-06-10' }),
            tx({ category: 'Impôts', amount: -1500, date: '2026-05-20' }), // solde d'impôt : hors comparaison
            tx({ category: 'Impôts', amount: -100, date: '2026-06-20' }),
        ];
        const a = computeMonthlyActualAverages(transactions, REF);
        expect(a.fullMonths).toBe(2);
        expect(a.expenseAvg).toBe(1300);                 // (400+600+1500+100)/2 — l'assiette complète (TaxCenter)
        expect(a.expenseAvgHorsComparaison).toBe(500);   // (400+600)/2 — l'assiette du Budget
        expect(a.horsComparaisonAvg).toBe(800);          // (1500+100)/2 — ce que le Budget DIT exclure
        expect(a.expenseAvg).toBe(a.expenseAvgHorsComparaison + a.horsComparaisonAvg); // identité des trois
    });
    it('sans impôts, les deux assiettes coïncident et l’exclu vaut 0', () => {
        const a = computeMonthlyActualAverages([
            tx({ category: 'Salaire', amount: 2000, date: '2026-05-04' }),
            tx({ category: 'Épicerie', amount: -400, date: '2026-05-10' }),
        ], REF);
        expect(a.expenseAvgHorsComparaison).toBe(a.expenseAvg);
        expect(a.horsComparaisonAvg).toBe(0);
    });
});

describe('[BUDGET-INCOME-REAL] computeIncomeBreakdown (salaire vs revenus divers, source de vérité du revenu)', () => {
    it('sépare salaire / divers ; ignore transferts, doublons, dépenses et positifs non-revenu', () => {
        const b = computeIncomeBreakdown([
            tx({ category: 'Salaire', amount: 820 }),
            tx({ category: 'Salaire', amount: 820 }),
            tx({ category: 'Revenus divers', amount: 745 }),
            tx({ category: 'Salaire', amount: 999, isTransfer: true }),   // transfert → ignoré
            tx({ category: 'Salaire', amount: 999, isDuplicate: true }),  // doublon → ignoré
            tx({ category: 'Remboursement', amount: 500 }),               // positif non-revenu → ignoré
            tx({ category: 'Épicerie', amount: -100 }),                   // dépense → ignorée
        ]);
        expect(b.salary).toBe(1640);
        expect(b.other).toBe(745);
        expect(b.total).toBe(2385);
    });
});
