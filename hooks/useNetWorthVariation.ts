// hooks/useNetWorthVariation.ts
//
// [REFONTE-NAV-L2a] Variation du patrimoine net sur une fenêtre glissante (30 j par défaut),
// pour la tuile « Variation 30 j » du bandeau KPI du Futur.
//
// ⚠️ AUCUNE dérivation nouvelle du patrimoine : c'est l'extraction MINIMALE de la série `Total`
// de l'ex-Accueil (`Dashboard.tsx`, unifiedHistory), mêmes sources et mêmes conventions —
//  - cash : soldes initiaux + transactions (hors doublons/virements/compte « Unknown »),
//    TOUS les comptes connus amorcés à 0 (fix #544 : un compte découvert via une transaction
//    laissait un NaN qui figeait la variation à 0,00 % en permanence) ;
//  - placements : buckets TOTAL_* ÉMIS par le producteur (buildMarketData /
//    generateTestMarketData), jamais recomposés depuis les colonnes par-symbole
//    (leçon PORTFOLIO-HISTORY, panel 2026-07-22) ;
//  - immobilier : équité PAR ANNÉE (reconstructRealEstateEquityByYear), année courante =
//    équité présente (fix #552 : peindre l'équité présente sur tout le passé faussait les %) ;
//  - dettes : total présent constant (même convention que l'ex-Accueil).
// Le sélecteur de fenêtre complet (1M/3M/YTD/1Y…) reste au Lot 2b (sous-onglet historique) —
// la fonction pure est déjà paramétrée en jours pour qu'il la réutilise telle quelle.
//
// No-fake-data : couverture insuffisante (< 2 points dans la fenêtre) ou borne non finie →
// `null`, JAMAIS un 0 crédible. Divergence assumée vs l'ex-Accueil : quand le point de départ
// est ≤ 0, l'Accueil affichait « 0 % » (trompeur) — ici `pct: null` (le $ reste affiché, le %
// devient « — »).

import { useMemo } from 'react';
import type { MarketDataPoint } from '../services/finance';
import type { Transaction, Debt, RealEstateGoal } from '../types';
import { usePortfolioHistory } from './usePortfolioHistory';
import { useFinanceStore } from '../store/useFinanceStore';
import { computeTotalDebt } from '../services/portfolio';
import { presentEquityOfGoal, monthsSince } from '../services/projection/pastPurchaseInit';
import { reconstructRealEstateEquityByYear } from '../services/history/reconstructRealEstateEquity';

export interface NetWorthVariation {
    /** Variation en $ CAD entre le premier et le dernier point de la fenêtre. */
    diff: number;
    /** Variation en % (déjà ×100, prêt pour `formatPercent`) ; `null` si le point de départ est ≤ 0. */
    pct: number | null;
}

/**
 * Fonction PURE — série `Total` de l'ex-Accueil réduite à ses deux bornes dans la fenêtre.
 * Retourne `null` si la couverture est insuffisante (< 2 points) ou une borne non finie.
 */
export function computeNetWorthVariation(
    rows: ReadonlyArray<MarketDataPoint>,
    transactions: ReadonlyArray<Transaction>,
    initialBalances: Record<string, number>,
    debts: ReadonlyArray<Debt>,
    realEstateGoals: ReadonlyArray<RealEstateGoal>,
    windowDays: number = 30,
    now: Date = new Date(),
): NetWorthVariation | null {
    if (rows.length === 0) return null;

    // 1. Cash — mêmes règles que l'ex-Accueil : tri chronologique, doublons/virements exclus,
    //    comptes découverts via transaction amorcés à 0 (fix #544).
    const sortedTxs = [...transactions].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const accounts = new Set<string>(Object.keys(initialBalances));
    sortedTxs.forEach(t => {
        if (t.accountName && t.accountName !== 'Unknown') accounts.add(t.accountName);
    });
    const rc: Record<string, number> = { ...initialBalances };
    accounts.forEach(acc => { if (rc[acc] === undefined) rc[acc] = 0; });

    // 2. Termes constants — dettes présentes, équité immo par année (fix #552).
    //    `presentEquityOfGoal` porte sa PROPRE garde non-fini (bien exclu + log throttlé).
    const currentDebts = computeTotalDebt([...debts]);
    const currentRealEstateEquity = realEstateGoals.reduce(
        (sum, g) => sum + presentEquityOfGoal(g, monthsSince(g.purchaseDate, now)), 0);
    const equityByYear = reconstructRealEstateEquityByYear(realEstateGoals, now.getFullYear());
    const nowYear = now.getFullYear();

    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() - windowDays);

    // 3. Balayage : le cash s'ACCUMULE sur toutes les lignes (même hors fenêtre — sinon les
    //    soldes en début de fenêtre seraient faux), seuls les totaux DANS la fenêtre comptent.
    let txIdx = 0;
    const totals: number[] = [];
    for (const row of rows) {
        const rowDate = new Date(row.date);
        while (txIdx < sortedTxs.length && new Date(sortedTxs[txIdx].date) <= rowDate) {
            const t = sortedTxs[txIdx];
            if (!t.isDuplicate && !t.isTransfer && t.accountName && t.accountName !== 'Unknown') {
                rc[t.accountName] = (rc[t.accountName] || 0) + t.amount;
            }
            txIdx++;
        }
        if (rowDate < windowStart || rowDate > now) continue;

        let total = 0;
        accounts.forEach(acc => { total += rc[acc]; });
        total += (Number(row['TOTAL_CELI']) || 0)
            + (Number(row['TOTAL_REER']) || 0)
            + (Number(row['TOTAL_NON-ENREG']) || 0)
            + (Number(row['TOTAL_CRYPTO']) || 0);
        const rowYear = rowDate.getFullYear();
        total += rowYear >= nowYear ? currentRealEstateEquity : (equityByYear.get(rowYear) ?? 0);
        total -= currentDebts;
        totals.push(total);
    }

    if (totals.length < 2) return null;
    const start = totals[0];
    const end = totals[totals.length - 1];
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    const diff = end - start;
    return { diff, pct: start > 0 ? (diff / start) * 100 : null };
}

/** Fenêtre FIXE de 30 jours (tuile du bandeau KPI). Sources : store + usePortfolioHistory —
 *  les MÊMES que l'ex-Accueil (l'AppState de App.tsx est une vue du store, pas une copie). */
export function useNetWorthVariation(): NetWorthVariation | null {
    const { history } = usePortfolioHistory();
    const transactions = useFinanceStore(s => s.transactions);
    const initialBalances = useFinanceStore(s => s.initialBalances);
    const debts = useFinanceStore(s => s.debts);
    const realEstateGoals = useFinanceStore(s => s.realEstateGoals);

    return useMemo(
        () => computeNetWorthVariation(
            history, transactions, initialBalances as Record<string, number>, debts, realEstateGoals),
        [history, transactions, initialBalances, debts, realEstateGoals],
    );
}
