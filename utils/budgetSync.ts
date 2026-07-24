// utils/budgetSync.ts
//
// [BUDGET-TX-CATEGORIES] + [BUDGET-PAST-AVG] + [BUDGET-MONTHLY-LEDGER] — fonctions PURES :
//   - syncBudgetWithTransactionCategories : postes ALIGNÉS sur les catégories de dépense
//     observées (verbatim Marc : « seulement et exactement les mêmes catégories que dans
//     transactions ») — ajouts (cible AUTO = moyenne de TOUT le passé, mois pleins), renommages
//     flous (réglages préservés), retraits, refresh des cibles autoTarget. Idempotente.
//   - historicalMonthlyAverage / computeMonthlyActualAverages / fullHistoryMonths : run-rates
//     mensuels sur tout l'historique (mois courant partiel EXCLU).
//   - buildMonthlyLedger : grand livre mensuel (réel REVENUS + DÉPENSES + solde par mois).

import type { BudgetCategory, Transaction } from '../types';
import { matchTransactionToCategory, matchCategoryToName } from './budget';

/** Catégories de dépense JAMAIS transformées en poste de budget (statuts/mouvements). */
const NON_BUDGET_CATEGORIES = new Set([
    // Statuts « à classer » — même liste que STATUS_CATEGORIES plus bas (dupliquée à plat pour
    // rester lisible ; le test de parité des jeux garde les deux alignées).
    'Uncategorized', 'Inconnu', 'Unknown', '', 'Non catégorisé',
    'Transfert', 'Investissement', 'Remboursement',
    'Salaire', 'Revenus divers', // revenus : jamais des postes de dépense
    // Impôts : un règlement d'impôt N'EST PAS de la consommation — le revenu projeté est déjà
    // NET (le compter en poste gonflerait baseMonthlyExpenses → double-comptage vs revenu net ;
    // finding financial-integrity F3 2026-07-15). Reste visible dans Transactions.
    'Impôts',
]);

/**
 * Catégories de REVENU réel (transactions positives) — la SOURCE DE VÉRITÉ du revenu affiché au Budget,
 * à la place du salaire saisi à l'onboarding (`config.users[].netSalary`) qui ne correspond pas à ce que
 * l'utilisateur reçoit vraiment (demande Marc 2026-07-16 : « le revenu doit correspondre à ma paie réelle
 * / mes fiches de paie, pas au chiffre d'onboarding », séparé en Salaire vs Revenus divers). On NE compte
 * PAS les autres positifs (remboursements, retours d'investissement…) comme du revenu de budget.
 */
export const INCOME_CATEGORIES = { salary: 'Salaire', other: 'Revenus divers' } as const;
const isIncome = (t: Transaction): boolean =>
    t.amount > 0 && !t.isTransfer && !t.isDuplicate &&
    (t.category === INCOME_CATEGORIES.salary || t.category === INCOME_CATEGORIES.other);

/** Ventilation du revenu réel (positif) d'un ensemble de transactions : salaire vs divers vs total. */
export function computeIncomeBreakdown(transactions: Transaction[]): { salary: number; other: number; total: number } {
    let salary = 0;
    let other = 0;
    for (const t of transactions) {
        if (!isIncome(t)) continue;
        if (t.category === INCOME_CATEGORIES.salary) salary += t.amount;
        else other += t.amount;
    }
    return { salary, other, total: salary + other };
}

/** Nature par défaut d'une catégorie créée automatiquement (heuristique QC). */
const NEED_CATEGORIES = new Set([
    'Logement', 'Épicerie', 'Transport', 'Santé', 'Assurances', 'Frais bancaires', 'Impôts',
]);

const isSpend = (t: Transaction): boolean =>
    t.amount < 0 && !t.isTransfer && !t.isDuplicate && !NON_BUDGET_CATEGORIES.has(t.category ?? '');

/** Clé mois « YYYY-MM » des N derniers mois, du plus ancien au plus récent (mois courant inclus). */
export const lastMonths = (n: number, ref: Date = new Date()): string[] => {
    const out: string[] = [];
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
        out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return out;
};

/**
 * Mois PLEINS d'historique : du premier mois où une transaction existe jusqu'au dernier mois
 * RÉVOLU (le mois en cours, partiel, est EXCLU — il tirerait la moyenne vers le bas).
 * Vide si tout l'historique tient dans le mois courant.
 */
export const fullHistoryMonths = (transactions: Transaction[], ref: Date = new Date()): string[] => {
    const current = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;
    let first: string | null = null;
    for (const t of transactions) {
        const m = t.date?.slice(0, 7);
        if (m && m < current && (!first || m < first)) first = m;
    }
    if (!first) return [];
    const [fy, fm] = first.split('-').map(Number);
    const out: string[] = [];
    const d = new Date(fy, fm - 1, 1);
    while (true) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (key >= current) break;
        out.push(key);
        d.setMonth(d.getMonth() + 1);
    }
    return out;
};

/**
 * Cible mensuelle AUTO = MOYENNE sur TOUT le passé (mois pleins, zéros inclus — demande Marc :
 * « pour le mois en cours le budget devrait être la moyenne de tout le passé »). Un run-rate
 * honnête. ⚠️ PAS la médiane des mois ACTIFS (finding financial-integrity F1 2026-07-15) :
 * un poste ponctuel (Voyages 2 400 $ un seul mois) donnerait 2 400 $/mois « Monthly » =
 * 28 800 $/an projetés — la moyenne-fenêtre annualise correctement. `budgetItems` alimente la
 * PROJECTION (baseMonthlyExpenses), le taux d'épargne et le coussin.
 * Repli : aucun mois plein (historique = mois courant seul) → total du mois courant.
 */
export const historicalMonthlyAverage = (transactions: Transaction[], category: string, ref: Date = new Date()): number => {
    const months = fullHistoryMonths(transactions, ref);
    const inWindow = new Set(months);
    const currentOnly = months.length === 0;
    const current = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;
    let total = 0;
    for (const t of transactions) {
        if (!isSpend(t) || t.category !== category) continue;
        const m = t.date?.slice(0, 7) ?? '';
        // Repli « mois courant seul » : STRICTEMENT le mois courant — jamais une transaction
        // datée dans le futur (import erroné/planifié — finding panel).
        if (currentOnly ? m === current : inWindow.has(m)) total += Math.abs(t.amount);
    }
    return Math.round(total / Math.max(1, months.length));
};

/**
 * Moyennes mensuelles GLOBALES sur tout le passé (mois pleins) : dépenses + revenu VENTILÉ (salaire /
 * divers). `incomeAvg = salaryAvg + otherAvg`. Le revenu est restreint aux catégories de revenu réel
 * (`isIncome`) — plus l'ancien « tout positif » qui comptait remboursements/retours comme du revenu.
 */
export function computeMonthlyActualAverages(
    transactions: Transaction[],
    ref: Date = new Date(),
): { expenseAvg: number; incomeAvg: number; salaryAvg: number; otherAvg: number; fullMonths: number } {
    const months = fullHistoryMonths(transactions, ref);
    if (months.length === 0) return { expenseAvg: 0, incomeAvg: 0, salaryAvg: 0, otherAvg: 0, fullMonths: 0 };
    const inWindow = new Set(months);
    let expense = 0;
    let salary = 0;
    let other = 0;
    for (const t of transactions) {
        if (t.isTransfer || t.isDuplicate) continue;
        const m = t.date?.slice(0, 7) ?? '';
        if (!inWindow.has(m)) continue;
        if (t.amount < 0) { expense += Math.abs(t.amount); continue; }
        if (t.category === INCOME_CATEGORIES.salary) salary += t.amount;
        else if (t.category === INCOME_CATEGORIES.other) other += t.amount;
    }
    const salaryAvg = Math.round(salary / months.length);
    const otherAvg = Math.round(other / months.length);
    return {
        expenseAvg: Math.round(expense / months.length),
        incomeAvg: salaryAvg + otherAvg,
        salaryAvg,
        otherAvg,
        fullMonths: months.length,
    };
}

export interface BudgetSyncResult {
    items: BudgetCategory[];
    added: string[];
    removed: string[];
    /** Postes RENOMMÉS vers le nom canonique (réglages préservés) : « ancien → nouveau ». */
    renamed: string[];
    /** Nombre de cibles AUTO rafraîchies (moyenne de tout le passé) parmi les postes conservés. */
    refreshedCount: number;
    /** true si `items` diffère des postes fournis (sinon rendre la MÊME référence en amont). */
    changed: boolean;
}

/**
 * Aligne les postes de budget sur les catégories de dépense OBSERVÉES dans les transactions.
 * - Ajoute un poste (cible = médiane mensuelle suggérée, modifiable après) par catégorie absente.
 * - Retire tout poste dont AUCUNE transaction (tout l'historique) ne porte la catégorie.
 * - Préserve intégralement les postes conservés (cibles/nature/type édités par l'utilisateur).
 * Transactions vides → no-op (jamais vider le budget sur un état pas encore hydraté).
 */
export function syncBudgetWithTransactionCategories(
    transactions: Transaction[],
    budgetItems: BudgetCategory[],
    ref: Date = new Date(),
): BudgetSyncResult {
    if (!transactions || transactions.length === 0) {
        return { items: budgetItems, added: [], removed: [], renamed: [], refreshedCount: 0, changed: false };
    }
    const observed = new Set<string>();
    for (const t of transactions) {
        if (isSpend(t)) observed.add(t.category);
    }

    // Cibles AUTO-gérées : recalculées à CHAQUE sync complète (moyenne de tout le passé —
    // demande Marc). Une cible éditée à la main (autoTarget false/absent sur un poste
    // pré-existant non créé par la sync) n'est JAMAIS touchée.
    let refreshedCount = 0;
    const kept = budgetItems
        .filter(item => observed.has(item.name))
        .map(item => {
            if (item.autoTarget !== true) return item;
            const target = historicalMonthlyAverage(transactions, item.name, ref);
            if (target === item.target) return item;
            refreshedCount++;
            return { ...item, target };
        });
    // Candidats au retrait : nom sans correspondance EXACTE. Avant de retirer, on tente un
    // RAPPROCHEMENT FLOU vers une catégorie observée manquante (règle unique
    // matchTransactionToCategory : « Loyer »↔« Logement » non, mais « Restaurant »↔« Restaurants »
    // oui) : le poste est alors RENOMMÉ vers le nom canonique en PRÉSERVANT la cible/nature/type
    // édités par l'utilisateur (finding financial-integrity F2 2026-07-15 : supprimer+recréer
    // écrasait des réglages curatés par une suggestion — et budgetItems pilote la projection).
    const removalCandidates = budgetItems.filter(item => !observed.has(item.name));
    const existingNames = new Set(kept.map(i => i.name));
    const missing = [...observed]
        .filter(cat => !existingNames.has(cat))
        .sort((a, b) => a.localeCompare(b, 'fr'));

    const added: string[] = [];
    const renamed: BudgetCategory[] = [];
    const renamedLabels: string[] = [];
    const consumedIds = new Set<BudgetCategory['id']>();
    const newItems: BudgetCategory[] = [];
    let seq = 0;
    for (const cat of missing) {
        const carrier = matchTransactionToCategory(
            cat,
            removalCandidates.filter(i => !consumedIds.has(i.id)),
        );
        if (carrier) {
            consumedIds.add(carrier.id);
            // Réglages préservés, nom canonique ; une cible AUTO est recalculée SOUS LE NOUVEAU
            // nom dès cette passe (finding panel : sinon elle garde une passe de retard).
            const renamedItem = carrier.autoTarget === true
                ? { ...carrier, name: cat, target: historicalMonthlyAverage(transactions, cat, ref) }
                : { ...carrier, name: cat };
            renamed.push(renamedItem);
            renamedLabels.push(`${carrier.name} → ${cat}`);
            continue;
        }
        added.push(cat);
        newItems.push({
            id: `cat_${Date.now()}_${seq++}`,
            name: cat,
            target: historicalMonthlyAverage(transactions, cat, ref),
            frequency: 'Monthly',
            type: 'Commun',
            nature: NEED_CATEGORIES.has(cat) ? 'Besoin' : 'Envie',
            autoTarget: true,
        });
    }
    const removed = removalCandidates.filter(i => !consumedIds.has(i.id)).map(i => i.name);

    const changed = added.length > 0 || removed.length > 0 || renamed.length > 0 || refreshedCount > 0;
    return {
        items: changed ? [...kept, ...renamed, ...newItems] : budgetItems,
        added,
        removed,
        renamed: renamedLabels,
        refreshedCount,
        changed,
    };
}

export interface LedgerRow {
    category: string;
    byMonth: number[];
    total: number;
    /** Moyenne sur les mois PLEINS de la fenêtre (le mois courant, partiel, est exclu). */
    monthlyAverage: number;
}

export interface MonthlyLedger {
    months: string[]; // « YYYY-MM », ancien → récent (dernier = mois COURANT, partiel)
    /** Lignes de DÉPENSES (catégories fournies = postes du budget), tri par total décroissant. */
    expenseRows: LedgerRow[];
    /** Lignes de REVENUS (catégories observées sur les transactions positives), tri décroissant. */
    incomeRows: LedgerRow[];
    totalExpenseByMonth: number[];
    totalIncomeByMonth: number[];
    /** Solde du mois = revenus − dépenses (hors transferts/doublons). */
    netByMonth: number[];
    /** Index de la colonne « mois courant » (toujours la dernière). */
    currentMonthIndex: number;
    /**
     * Mois PLEINS de la fenêtre couverts par l'historique (diviseur des `monthlyAverage`).
     * 0 = aucun historique révolu → toute moyenne vaut 0 par CONVENTION, à afficher « — »
     * (indisponible), jamais comme un vrai zéro ([BUDGET-3-VUES]).
     */
    coveredFullMonths: number;
}

/** Statuts « à classer » (partagés : dénominateur commun de NON_BUDGET_CATEGORIES). */
const STATUS_CATEGORIES = ['Uncategorized', 'Inconnu', 'Unknown', '', 'Non catégorisé'] as const;
const INCOME_STATUS_CATEGORIES = new Set<string>(STATUS_CATEGORIES);

/**
 * Grand livre mensuel : RÉEL des dépenses ET des revenus par mois (demande Marc 2026-07-15 :
 * « chaque mois, je devrai avoir le réel de dépenses et revenus pour ce mois ci »).
 * Dépenses = catégories fournies (postes) ; revenus = toute transaction positive non-transfert,
 * groupée par sa catégorie (« Autres revenus » pour les statuts à classer). Les moyennes par
 * ligne EXCLUENT le mois courant (partiel).
 */
export function buildMonthlyLedger(
    transactions: Transaction[],
    expenseCategories: string[],
    monthCount = 12,
    ref: Date = new Date(),
): MonthlyLedger {
    const months = lastMonths(monthCount, ref);
    const index = new Map(months.map((m, i) => [m, i]));
    const currentMonthIndex = months.length - 1;

    const expense = new Map<string, number[]>(expenseCategories.map(c => [c, months.map(() => 0)]));
    const income = new Map<string, number[]>();
    // [BUDGET-MATCH-UNIFY] Cache catégorie→poste résolu (le fuzzy est O(postes) ; ~2000 tx).
    const resolved = new Map<string, string>();
    const totalExpenseByMonth = months.map(() => 0);
    const totalIncomeByMonth = months.map(() => 0);

    for (const t of transactions) {
        if (t.isTransfer || t.isDuplicate) continue;
        const mi = index.get(t.date?.slice(0, 7) ?? '');
        if (mi === undefined) continue;
        if (t.amount < 0) {
            totalExpenseByMonth[mi] += Math.abs(t.amount);
            // [BUDGET-MATCH-UNIFY] Attribution tx→poste par la MÊME règle que le réel
            // (`matchCategoryToName` : exact, sinon substring) — avant, le ledger matchait en
            // EXACT seul → un poste « Restaurants » avec des tx « Restaurant » affichait
            // réel 600 $ · moy 0 $ (l'historique filait dans « Autres »). Toute dépense qui ne
            // rapproche AUCUN poste (Uncategorized, Impôts, poste retiré…) tombe dans un bucket
            // VISIBLE — sinon Σ(lignes) < Total dépenses sans explication (finding panel).
            let cat = resolved.get(t.category);
            if (cat === undefined) {
                cat = matchCategoryToName(t.category, expenseCategories) ?? 'Autres / non classées';
                resolved.set(t.category, cat);
            }
            if (!expense.has(cat)) expense.set(cat, months.map(() => 0));
            expense.get(cat)![mi] += Math.abs(t.amount);
        } else if (t.amount > 0) {
            totalIncomeByMonth[mi] += t.amount;
            const cat = INCOME_STATUS_CATEGORIES.has(t.category ?? '') ? 'Autres revenus' : t.category;
            if (!income.has(cat)) income.set(cat, months.map(() => 0));
            income.get(cat)![mi] += t.amount;
        }
    }

    // Diviseur de la moyenne = mois PLEINS de la fenêtre COUVERTS par l'historique (un compte
    // de 3 mois dans une fenêtre 12 mois divise par 2-3, pas par 11). Sémantique RUN-RATE,
    // alignée sur la cible auto (finding panel : la moyenne « mois actifs seulement » affichait
    // 2 400 $ pour un voyage ponctuel pendant que la cible disait 400 $ — 6× d'écart à l'écran).
    const histMonths = new Set(fullHistoryMonths(transactions, ref));
    const coveredFullMonths = months.slice(0, currentMonthIndex).filter(m => histMonths.has(m)).length;
    const toRows = (m: Map<string, number[]>): LedgerRow[] =>
        [...m.entries()].map(([category, byMonth]) => {
            const total = byMonth.reduce((s, v) => s + v, 0);
            const fullTotal = byMonth.slice(0, currentMonthIndex).reduce((s, v) => s + v, 0);
            return { category, byMonth, total, monthlyAverage: coveredFullMonths ? fullTotal / coveredFullMonths : 0 };
        }).sort((a, b) => b.total - a.total);

    return {
        months,
        expenseRows: toRows(expense),
        incomeRows: toRows(income),
        totalExpenseByMonth,
        totalIncomeByMonth,
        netByMonth: months.map((_, i) => totalIncomeByMonth[i] - totalExpenseByMonth[i]),
        currentMonthIndex,
        coveredFullMonths,
    };
}

/**
 * [BUDGET-3-VUES] Moyenne mensuelle PAR POSTE depuis le ledger, prête pour l'UI :
 * - `null` = indisponible (aucun mois plein d'historique) → afficher « — », jamais un faux 0.
 *   TOUT-OU-RIEN : `coveredFullMonths` est GLOBAL au ledger → toutes les lignes sont `null`
 *   ou aucune (pas de somme partielle silencieuse possible en aval).
 * - Une moyenne NON FINIE (transaction corrompue NaN en amont) est rabattue sur `null` ET
 *   signalée via `onNonFinite` — sinon elle s'afficherait « — » indiscernable d'une absence
 *   légitime, sans trace (finding silent-failure-hunter, PR #500).
 */
export function computeAvgByItem(
    ledger: MonthlyLedger,
    onNonFinite?: (category: string) => void,
): Record<string, number | null> {
    const map: Record<string, number | null> = {};
    for (const row of ledger.expenseRows) {
        if (ledger.coveredFullMonths <= 0) {
            map[row.category] = null;
        } else if (!Number.isFinite(row.monthlyAverage)) {
            onNonFinite?.(row.category);
            map[row.category] = null;
        } else {
            map[row.category] = row.monthlyAverage;
        }
    }
    return map;
}
