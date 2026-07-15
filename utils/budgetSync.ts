// utils/budgetSync.ts
//
// [BUDGET-TX-CATEGORIES] — le Budget affiche SEULEMENT ET EXACTEMENT les catégories présentes
// dans les Transactions (demande verbatim Marc 2026-07-15 : « dans mon onglet budget je veux
// seulement et exactement les meme catégories que dans transactions… pas en rajouter ou quoi »).
//
// Deux fonctions PURES :
//   - syncBudgetWithTransactionCategories : calcule la liste de postes ALIGNÉE sur les
//     catégories de dépense observées (ajoute les manquantes avec cible SUGGÉRÉE = médiane
//     mensuelle 6 mois, retire celles sans aucune transaction). Idempotente (2e appel = 0 drift).
//   - buildCategoryMonthlyHistory : totaux mensuels par catégorie (N derniers mois) pour la
//     vue « Historique par catégorie ».

import type { BudgetCategory, Transaction } from '../types';
import { matchTransactionToCategory } from './budget';

/** Catégories de dépense JAMAIS transformées en poste de budget (statuts/mouvements). */
const NON_BUDGET_CATEGORIES = new Set([
    'Uncategorized', 'Inconnu', 'Unknown', '', 'Non catégorisé',
    'Transfert', 'Investissement', 'Remboursement',
    'Salaire', 'Revenus divers', // revenus : jamais des postes de dépense
    // Impôts : un règlement d'impôt N'EST PAS de la consommation — le revenu projeté est déjà
    // NET (le compter en poste gonflerait baseMonthlyExpenses → double-comptage vs revenu net ;
    // finding financial-integrity F3 2026-07-15). Reste visible dans Transactions.
    'Impôts',
]);

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
 * Cible mensuelle suggérée = MOYENNE sur la fenêtre COMPLÈTE (6 mois, zéros inclus) — un
 * run-rate honnête. ⚠️ PAS la médiane des mois ACTIFS (finding financial-integrity F1
 * 2026-07-15) : un poste saisonnier/ponctuel (Voyages 2 400 $ un seul mois) donnerait
 * 2 400 $/mois « Monthly » = 28 800 $/an projetés — la moyenne-fenêtre donne 400 $/mois,
 * soit le même total annualisé que la réalité. `budgetItems` alimente la PROJECTION
 * (baseMonthlyExpenses), le taux d'épargne et le coussin : l'estimateur doit être un run-rate.
 */
const suggestedMonthlyTarget = (transactions: Transaction[], category: string, ref: Date): number => {
    const months = lastMonths(6, ref);
    const inWindow = new Set(months);
    let total = 0;
    for (const t of transactions) {
        if (!isSpend(t) || t.category !== category) continue;
        if (inWindow.has(t.date?.slice(0, 7) ?? '')) total += Math.abs(t.amount);
    }
    return Math.round(total / months.length);
};

export interface BudgetSyncResult {
    items: BudgetCategory[];
    added: string[];
    removed: string[];
    /** Postes RENOMMÉS vers le nom canonique (réglages préservés) : « ancien → nouveau ». */
    renamed: string[];
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
        return { items: budgetItems, added: [], removed: [], renamed: [], changed: false };
    }
    const observed = new Set<string>();
    for (const t of transactions) {
        if (isSpend(t)) observed.add(t.category);
    }

    const kept = budgetItems.filter(item => observed.has(item.name));
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
            renamed.push({ ...carrier, name: cat }); // réglages préservés, nom canonique
            renamedLabels.push(`${carrier.name} → ${cat}`);
            continue;
        }
        added.push(cat);
        newItems.push({
            id: `cat_${Date.now()}_${seq++}`,
            name: cat,
            target: suggestedMonthlyTarget(transactions, cat, ref),
            frequency: 'Monthly',
            type: 'Commun',
            nature: NEED_CATEGORIES.has(cat) ? 'Besoin' : 'Envie',
        });
    }
    const removed = removalCandidates.filter(i => !consumedIds.has(i.id)).map(i => i.name);

    const changed = added.length > 0 || removed.length > 0 || renamed.length > 0;
    return {
        items: changed ? [...kept, ...renamed, ...newItems] : budgetItems,
        added,
        removed,
        renamed: renamedLabels,
        changed,
    };
}

export interface CategoryMonthlyHistory {
    months: string[]; // « YYYY-MM », ancien → récent
    /** catégorie → dépenses par mois (même ordre que `months`) + total + moyenne mensuelle. */
    rows: Array<{ category: string; byMonth: number[]; total: number; monthlyAverage: number }>;
}

/** Totaux mensuels par catégorie de dépense sur les N derniers mois (défaut 12). */
export function buildCategoryMonthlyHistory(
    transactions: Transaction[],
    categories: string[],
    monthCount = 12,
    ref: Date = new Date(),
): CategoryMonthlyHistory {
    const months = lastMonths(monthCount, ref);
    const index = new Map(months.map((m, i) => [m, i]));
    const rows = new Map<string, number[]>(categories.map(c => [c, months.map(() => 0)]));
    for (const t of transactions) {
        if (!isSpend(t)) continue;
        const row = rows.get(t.category);
        if (!row) continue;
        const mi = index.get(t.date?.slice(0, 7) ?? '');
        if (mi === undefined) continue;
        row[mi] += Math.abs(t.amount);
    }
    return {
        months,
        rows: [...rows.entries()].map(([category, byMonth]) => {
            const total = byMonth.reduce((s, v) => s + v, 0);
            const activeMonths = byMonth.filter(v => v > 0).length;
            return { category, byMonth, total, monthlyAverage: activeMonths ? total / activeMonths : 0 };
        }).sort((a, b) => b.total - a.total),
    };
}
