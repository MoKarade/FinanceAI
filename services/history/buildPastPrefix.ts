// services/history/buildPastPrefix.ts
// [FUTUR-REAL-HISTORY / FUTUR-HIST-WIRING-TEST] Assemblage PUR du segment PASSÉ (monthIndex < 0) de la
// courbe Futur, extrait du `useMemo` de `FutureProjection.tsx` pour être UNIT-TESTABLE (le câblage
// money-critical — buckets → helper, dette soustraite, alignement des dates — se prouve sans rendre le
// composant de ~1000 lignes). Verbatim : aucun changement de logique vs l'inline d'origine.
//
// Le patrimoine net de chaque point route par `pastNetWorthAt` → `computeRawNetWorth` (source unique),
// en soustrayant la dette hors hypothèque au NIVEAU ACTUEL (`currentDebtNonImmo`, = `chartData[0]
// .DettesNonImmo` du moteur — Option A, décision Marc 2026-07-24, pas de courbe d'amortissement
// rétroactive, voir `DEBT-AMORTIZATION` au backlog) — MAIS chaque dette n'est soustraite qu'À PARTIR
// de son `startDate` propre (`[PASSE-REEL-DETTE-1]`, 2026-08-21) : une dette qui n'existait pas
// encore à un mois passé n'y figure pas, même si elle existe aujourd'hui.
// ⚠️ Le gating se fait par SOUSTRACTION d'un delta (`sumNotYetStartedDebtsAtMonth`), jamais par
// resommation complète des `debts[].balance` bruts : `currentDebtNonImmo` a déjà encaissé le pas
// d'amortissement du mois 0 du moteur (intérêt + paiement), donc resommer les soldes bruts de
// TOUTES les dettes actives diverge de ce total de quelques dizaines à quelques centaines de
// dollars (mesuré) — cassant le raccord EXACT qu'Option A garantit. En delta, le cas « aucune dette
// datée » reste bit-identique à avant (rien à exclure ⇒ soustraction nulle) ; seule la dette
// EFFECTIVEMENT gatée porte l'approximation (bornée à elle, cf `debtSchedule.ts`).
// ⚠️ [FUTUR-PAST-DEBT-FREEZE 2026-07-29] Ce module reste AGNOSTIQUE de la provenance exacte de
// `currentDebtNonImmo`/`debts` : c'est à l'APPELANT (`FutureProjection.tsx`) de garantir des valeurs
// FRAÎCHES (jamais un blob figé PROJECTION-PERSIST) — voir son commentaire dédié.

import { reconstructCashHistory } from './reconstructCashHistory';
import { reconstructRealEstateEquityByYear } from './reconstructRealEstateEquity';
import { pastNetWorthAt } from './pastNetWorth';
import { sumNotYetStartedDebtsAtMonth, type DebtBalance } from '../projection/debtSchedule';
import type { PortfolioHistoryPoint } from './reconstructPortfolioHistory';
import type { RealEstateGoal } from '../../types';

// ⚠️ `type` alias (PAS `interface`) VOLONTAIRE : un object-literal type a une signature d'index
// implicite → `PastPrefixPoint` reste assignable à `Record<string, unknown>` (le consommateur d'affichage
// `displayData`/ChartDataTable l'exige). Un `interface` casserait ce typecheck (mergeable → pas d'index implicite).
export type PastPrefixPoint = {
    monthIndex: number;
    year: number;
    dateLabel: string;
    Liquidites: number;
    Immobilier: number;
    CELI: number;
    CELIAPP: number;
    REER: number;
    REEE: number;
    NonReg: number;
    Crypto: number;
    NetWorth: number | undefined;
    isPast: boolean;
};

export interface BuildPastPrefixInput {
    pastHistoryPoints: ReadonlyArray<PortfolioHistoryPoint>;
    transactions: ReadonlyArray<{ date: string; amount: number; isDuplicate?: boolean; isTransfer?: boolean }>;
    calculatedStartingCash: number;
    realEstateGoals: ReadonlyArray<RealEstateGoal>;
    startYear: number;
    startMonth: number;
    /** Dette hors hypothèque au niveau actuel (`DettesNonImmo` du moteur, valeur FRAÎCHE — cf en-tête). */
    currentDebtNonImmo: number;
    /** Dettes hors hypothèque (store, tableau FRAIS — cf en-tête) : sert UNIQUEMENT à déterminer quelles
     *  dettes exclure de `currentDebtNonImmo` pour un mois passé où elles n'existaient pas encore. */
    debts: ReadonlyArray<DebtBalance>;
}

/**
 * Reconstruit les points du PASSÉ (monthIndex < 0) : placements (carry-forward) + cash + équité immo,
 * NetWorth = Σ − dette courante. La ligne VN ne démarre qu'à la 1re transaction connue (`hasNW`) → avant,
 * `NetWorth = undefined` (no-fake : pas de fausse ligne à 0). Retourne `[]` si aucun passé connu.
 */
export function buildPastPrefix(input: BuildPastPrefixInput): PastPrefixPoint[] {
    const { pastHistoryPoints, transactions, calculatedStartingCash, realEstateGoals, startYear, startMonth, currentDebtNonImmo, debts } = input;

    const miOf = (ym: string): number => {
        const [y, m] = ym.split('-').map(Number);
        // Index relatif au DÉBUT de projection (mois 0 = startYear/startMonth).
        // Le « -startMonth » est indispensable quand la projection démarre ≠ janvier.
        return (y - startYear) * 12 + (m - 1 - startMonth);
    };
    const nowMonthKey = `${startYear}-${String(startMonth + 1).padStart(2, '0')}`;
    const cashRes = reconstructCashHistory(transactions, calculatedStartingCash || 0, nowMonthKey);
    const equityByYear = reconstructRealEstateEquityByYear(realEstateGoals, startYear);

    const invByMi = new Map<number, PortfolioHistoryPoint>();
    for (const p of pastHistoryPoints) {
        const mi = miOf(p.date);
        if (mi < 0) invByMi.set(mi, p);
    }
    const cashByMi = new Map<number, number>();
    for (const c of cashRes.points) {
        const mi = miOf(c.month);
        if (mi < 0) cashByMi.set(mi, c.cash);
    }
    const mis = [...invByMi.keys(), ...cashByMi.keys()];
    if (mis.length === 0) return [];
    const minMi = Math.min(...mis);
    const firstTxnMi = cashRes.firstMonth ? miOf(cashRes.firstMonth) : 1; // 1 = jamais de passé connu

    const out: PastPrefixPoint[] = [];
    let lastInv: PortfolioHistoryPoint | null = null;
    for (let mi = minMi; mi < 0; mi++) {
        const invHere = invByMi.get(mi);
        if (invHere) lastInv = invHere;
        const inv = invHere ?? lastInv;
        const cash = cashByMi.get(mi);
        // Date calendaire réelle du point = startMonth + mi (mi est négatif au passé). Le « + startMonth »
        // est indispensable quand la projection démarre ≠ janvier, sinon les libellés de date sont décalés.
        const absMonth = startMonth + mi;
        const year = startYear + Math.floor(absMonth / 12);
        const month = (((absMonth % 12) + 12) % 12) + 1;
        const immo = equityByYear.get(year) ?? 0;
        const celi = inv?.CELI ?? 0, celiapp = inv?.CELIAPP ?? 0, reer = inv?.REER ?? 0,
            reee = inv?.REEE ?? 0, nonReg = inv?.NonReg ?? 0, crypto = inv?.Crypto ?? 0;
        const hasNW = mi >= firstTxnMi; // VN seulement à partir de la 1re transaction connue
        // [PASSE-REEL-DETTE-1] `mi` partage le même repère absolu (mois 0 = début de projection,
        // négatif au passé) que le `m` de simulation du moteur — cf. `moisDeSimulation`. Une dette
        // DÉJÀ ACTIVE aujourd'hui mais non encore commencée à CE mi est retranchée du total (delta,
        // cf en-tête de `sumNotYetStartedDebtsAtMonth`). `Math.max(0, …)` : le delta utilise le solde
        // BRUT contre un total déjà post-amortissement — borne le résidu, une dette n'étant jamais négative.
        const debtNonImmo = Math.max(0, currentDebtNonImmo - sumNotYetStartedDebtsAtMonth(debts, startYear, startMonth, mi));
        out.push({
            monthIndex: mi,
            year,
            dateLabel: `${year}-${String(month).padStart(2, '0')}`,
            Liquidites: hasNW ? (cash ?? 0) : 0,
            Immobilier: immo,
            CELI: celi, CELIAPP: celiapp, REER: reer, REEE: reee, NonReg: nonReg, Crypto: crypto,
            NetWorth: hasNW
                ? pastNetWorthAt({ CELI: celi, CELIAPP: celiapp, REER: reer, REEE: reee, NonReg: nonReg, Crypto: crypto }, cash ?? 0, immo, debtNonImmo)
                : undefined,
            isPast: true,
        });
    }
    return out;
}
