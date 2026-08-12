// hooks/useNetWorthVariation.ts
//
// [REFONTE-NAV-L2a] Variation « liquide + placements » sur une fenêtre glissante (30 j par
// défaut), pour la tuile « Variation 30 j » du bandeau KPI du Futur.
//
// ⚠️ PÉRIMÈTRE PAR CONSTRUCTION (itération panel #601) : la série NE contient QUE le cash et
// les buckets TOTAL_* — les termes immo/dettes de l'ex-Accueil sont EXCLUS, pas « constants » :
//  - l'équité immo était à granularité ANNUELLE (reconstructRealEstateEquityByYear) : promue
//    dans une fenêtre GLISSANTE de 30 j, elle fabriquait un « événement » à CHAQUE passage du
//    31 décembre (mesuré : +14 396 $ de variation fictive au jour de l'An) ;
//  - les dettes étaient un total PRÉSENT constant : un remboursement de capital (cash ↓,
//    dette ↓, patrimoine stable) s'affichait comme une perte sèche.
// Un terme dont la granularité ne colle pas à la fenêtre n'a pas sa place dans la série ; la
// tuile porte l'étiquette de périmètre « liquide + placements » (leçon DASH-NETWORTH-CANONICAL :
// l'assiette du % diffère de la tuile Patrimoine, elle doit le dire).
//
// Conventions conservées de la série `Total` de l'ex-Accueil (Dashboard.tsx, unifiedHistory) :
//  - cash : soldes initiaux + transactions (hors doublons/virements), TOUS les comptes connus
//    amorcés à 0 (fix #544 : un compte découvert via une transaction laissait un NaN qui
//    figeait la variation à 0,00 % en permanence) ;
//  - [MED #601] les transactions SANS compte (accountName absent ou 'Unknown') sont INCLUSES
//    sous le bucket synthétique UNKNOWN_ACCOUNT_BUCKET — l'ex-exclusion faisait diverger la
//    tuile de sa voisine qui les compte (mesuré : 1 000 $ d'écart) ;
//  - placements : buckets TOTAL_* ÉMIS par le producteur (buildMarketData /
//    generateTestMarketData), jamais recomposés depuis les colonnes par-symbole
//    (leçon PORTFOLIO-HISTORY, panel 2026-07-22).
// Le sélecteur de fenêtre complet (1M/3M/YTD/1Y…) reste au Lot 2b (sous-onglet historique) —
// la fonction pure est déjà paramétrée en jours pour qu'il la réutilise telle quelle.
//
// No-fake-data : couverture insuffisante (< 2 points dans la fenêtre) → `null` SILENCIEUX
// (état normal d'un portefeuille jeune) ; borne non finie (donnée CORROMPUE : solde initial ou
// montant non fini) → `null` + logErrorThrottled (un retour muet masquerait le vrai bug).
// `spanDays` expose l'étendue RÉELLE des données utilisées : si elle est plus courte que la
// fenêtre demandée, la tuile dit « sur N j de données » au lieu de laisser croire à 30 j.

import { useMemo } from 'react';
import type { MarketDataPoint } from '../services/finance';
import type { Transaction } from '../types';
import { usePortfolioHistory } from './usePortfolioHistory';
import { useFinanceStore } from '../store/useFinanceStore';
import { logErrorThrottled } from '../services/errorLogger';

/** Bucket synthétique des transactions sans compte identifiable (accountName absent ou
 *  'Unknown') — source unique, consommée par le calcul et les tests. */
export const UNKNOWN_ACCOUNT_BUCKET = '(compte inconnu)';

export interface NetWorthVariation {
    /** Variation en $ CAD entre le premier et le dernier point de la fenêtre. */
    diff: number;
    /** Variation en % (déjà ×100, prêt pour `formatPercent`) ; `null` si le point de départ est ≤ 0. */
    pct: number | null;
    /** Étendue RÉELLE des données (jours entre le premier et le dernier point UTILISÉS) —
     *  peut être < fenêtre demandée (portefeuille jeune, historique périmé) : l'UI doit alors
     *  l'afficher au lieu de laisser croire à la fenêtre pleine. */
    spanDays: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Compte de rattachement d'une transaction : le compte nommé, sinon le bucket synthétique. */
const bucketOf = (t: Transaction): string =>
    t.accountName && t.accountName !== 'Unknown' ? t.accountName : UNKNOWN_ACCOUNT_BUCKET;

/**
 * Fonction PURE — Δ(cash + buckets TOTAL_*) entre les deux bornes de la fenêtre.
 * Retourne `null` si la couverture est insuffisante (< 2 points, silencieux) ou une borne
 * non finie (donnée corrompue, logguée).
 */
export function computeNetWorthVariation(
    rows: ReadonlyArray<MarketDataPoint>,
    transactions: ReadonlyArray<Transaction>,
    initialBalances: Record<string, number>,
    windowDays: number = 30,
    now: Date = new Date(),
): NetWorthVariation | null {
    if (rows.length === 0) return null;

    // 1. Cash — mêmes règles que l'ex-Accueil : tri chronologique, doublons/virements exclus,
    //    comptes découverts via transaction amorcés à 0 (fix #544), bucket synthétique pour
    //    les transactions sans compte (MED #601 : les exclure faisait diverger la tuile de
    //    sa voisine qui les compte).
    const sortedTxs = [...transactions].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const accounts = new Set<string>(Object.keys(initialBalances));
    sortedTxs.forEach(t => accounts.add(bucketOf(t)));
    const rc: Record<string, number> = { ...initialBalances };
    accounts.forEach(acc => { if (rc[acc] === undefined) rc[acc] = 0; });

    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() - windowDays);

    // 2. Balayage : le cash s'ACCUMULE sur toutes les lignes (même hors fenêtre — sinon les
    //    soldes en début de fenêtre seraient faux), seuls les totaux DANS la fenêtre comptent.
    let txIdx = 0;
    const totals: number[] = [];
    let firstUsedMs = 0;
    let lastUsedMs = 0;
    for (const row of rows) {
        const rowDate = new Date(row.date);
        while (txIdx < sortedTxs.length && new Date(sortedTxs[txIdx].date) <= rowDate) {
            const t = sortedTxs[txIdx];
            txIdx++;
            if (t.isDuplicate || t.isTransfer) continue;
            // [MED silent-failure #601] `|| 0` ne gardait que la valeur PRÉCÉDENTE : un
            // t.amount NaN empoisonnait le solde en silence. Montant non fini = donnée
            // corrompue → loggué (une fois) et ignoré, jamais avalé.
            if (!Number.isFinite(t.amount)) {
                logErrorThrottled('useNetWorthVariation:tx-amount-non-finite', {
                    source: 'ui', severity: 'warning',
                    message: 'Variation liquide + placements : transaction au montant non fini ignorée (donnée corrompue)',
                    context: { txId: String(t.id), account: bucketOf(t) },
                });
                continue;
            }
            const acc = bucketOf(t);
            rc[acc] = (rc[acc] || 0) + t.amount;
        }
        if (rowDate < windowStart || rowDate > now) continue;

        let total = 0;
        accounts.forEach(acc => { total += rc[acc]; });
        total += (Number(row['TOTAL_CELI']) || 0)
            + (Number(row['TOTAL_REER']) || 0)
            + (Number(row['TOTAL_NON-ENREG']) || 0)
            + (Number(row['TOTAL_CRYPTO']) || 0);
        if (totals.length === 0) firstUsedMs = rowDate.getTime();
        lastUsedMs = rowDate.getTime();
        totals.push(total);
    }

    // Couverture insuffisante : état NORMAL (portefeuille jeune) → null silencieux.
    if (totals.length < 2) return null;
    const start = totals[0];
    const end = totals[totals.length - 1];
    // Borne non finie : donnée CORROMPUE (solde initial non fini) → null LOGGUÉ, un retour
    // muet masquerait le vrai bug (classe silent-failure, panel #601).
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
        logErrorThrottled('useNetWorthVariation:bound-non-finite', {
            source: 'ui', severity: 'warning',
            message: 'Variation liquide + placements : borne non finie (solde initial corrompu ?) — tuile muette',
            context: { startFinite: Number.isFinite(start), endFinite: Number.isFinite(end) },
        });
        return null;
    }
    const diff = end - start;
    const spanDays = Math.round((lastUsedMs - firstUsedMs) / MS_PER_DAY);
    return { diff, pct: start > 0 ? (diff / start) * 100 : null, spanDays };
}

/** Fenêtre demandée par la tuile du bandeau KPI (fixe — le sélecteur complet est au Lot 2b).
 *  Exportée pour que la tuile compare `spanDays` à la MÊME valeur que le calcul. */
export const VARIATION_WINDOW_DAYS = 30;

/** Fenêtre FIXE de 30 jours (tuile du bandeau KPI). Sources : store + usePortfolioHistory —
 *  les MÊMES que l'ex-Accueil (l'AppState de App.tsx est une vue du store, pas une copie). */
export function useNetWorthVariation(): NetWorthVariation | null {
    const { history } = usePortfolioHistory();
    const transactions = useFinanceStore(s => s.transactions);
    const initialBalances = useFinanceStore(s => s.initialBalances);

    return useMemo(
        () => computeNetWorthVariation(
            history, transactions, initialBalances as Record<string, number>, VARIATION_WINDOW_DAYS),
        [history, transactions, initialBalances],
    );
}
