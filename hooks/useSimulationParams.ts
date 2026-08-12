// hooks/useSimulationParams.ts
// PH2-c (clé de voûte) — assemble les `SimulationParams` + les dérivations passé/présent
// À PARTIR DU STORE UNIQUEMENT (self-contained), pour que le MÊME calcul de params serve
// à la fois le moteur app-level (`ProjectionEngine`) ET l'affichage de `FutureProjection`.
// Garantit la « source unique » : zéro divergence de params entre les deux call-sites.
//
// `calculatedMonthlySavings` est passé en argument car il est dérivé en amont par
// `useDerivedFinancials` (App) — on évite de le recalculer ici.

import { useMemo, useSyncExternalStore } from 'react';
import { useFinanceStore } from '../store/useFinanceStore';
import { useShallow } from 'zustand/shallow';
import { buildSimulationParams } from '../services/projection/buildSimulationParams';
import type { SimulationParams } from '../services/projection';
import type { Transaction } from '../types';
import { usePastPortfolioHistory } from './usePastPortfolioHistory';
import { deriveStartingBalancesFromHistory } from '../services/history/startingBalancesFromHistory';
import { todayIsoLocal } from '../services/projection/dailyRefine';

const EMPTY_ARRAY: never[] = [];

// [FUTUR-HIST-DAILY-REFRESH] « Aujourd'hui » (mois calendaire) = source UNIQUE PARTAGÉE au niveau MODULE
// (finding silent-failure PR #514) : `useSimulationParams` est monté 2× (ProjectionEngine + FutureProjection).
// Un `useState`/`setInterval` PAR instance ferait diverger transitoirement leurs « aujourd'hui » (2 horloges
// horaires décalées) → `chartData` (moteur) et `pastPrefix` (affichage) sur un `startMonth` décalé d'un mois à
// cheval sur minuit du 1er (incohérence visuelle silencieuse). Un SEUL timer + `getSnapshot` frais garantit que
// les DEUX call-sites lisent le MÊME mois (règle « Future = source unique »), comme la dédup de `usePastPortfolioHistory`.
const monthEpochOf = (): number => { const d = new Date(); return d.getFullYear() * 12 + d.getMonth(); };
const _monthListeners = new Set<() => void>();
let _monthTimer: ReturnType<typeof setInterval> | null = null;
const _notifyMonth = (): void => { _monthListeners.forEach((l) => l()); };
const _onMonthVisibility = (): void => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') _notifyMonth(); };
const _subscribeMonthEpoch = (cb: () => void): (() => void) => {
    _monthListeners.add(cb);
    if (_monthTimer === null && typeof window !== 'undefined') {
        _monthTimer = setInterval(_notifyMonth, 60 * 60 * 1000); // horaire (onglet idle mais visible à cheval sur minuit)
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', _onMonthVisibility);
    }
    return () => {
        _monthListeners.delete(cb);
        if (_monthListeners.size === 0 && _monthTimer !== null) {
            clearInterval(_monthTimer);
            _monthTimer = null;
            if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', _onMonthVisibility);
        }
    };
};
// `getSnapshot` recalcule le mois courant à CHAQUE lecture (primitif → stable par valeur : bail-out React si inchangé).
// Le timer/visibility ne fait que NOTIFIER (re-lecture) ; au vrai passage de mois, la valeur change → re-render.
const _getMonthEpoch = (): number => monthEpochOf();
const _getTodayIso = (): string => todayIsoLocal();

/**
 * [FUTUR-DAILY-ROLLOVER] Aujourd'hui (JOUR calendaire LOCAL, `YYYY-MM-DD`) RÉACTIF — demande Marc
 * 2026-08-12 : « ça doit se mettre à jour à chaque jour pour le passé ». La courbe au jour borne
 * son passé RÉEL sur cette valeur : figée au montage, une app laissée ouverte gardait la frontière
 * réel/projeté au jour de l'ouverture, et les jours écoulés restaient affichés comme « projetés ».
 * Même horloge PARTAGÉE que le mois (un seul timer, mêmes notifications : tick horaire + retour
 * d'onglet — string stable par valeur → bail-out React tant que le jour n'a pas changé).
 * Latence assumée : au plus ~1 h après minuit onglet resté visible, immédiat au retour d'onglet —
 * même arbitrage que le mois, documenté ci-dessus.
 */
export function useTodayIsoLocal(): string {
    return useSyncExternalStore(_subscribeMonthEpoch, _getTodayIso, _getTodayIso);
}

export interface SimulationParamsBundle {
    /** Entrée du moteur : `calculateFutureProjection(params, …)`. */
    params: SimulationParams;
    /** Reconstruction du portefeuille passé (sert aussi au préfixe « passé réel » du graphe). */
    pastHistory: ReturnType<typeof usePastPortfolioHistory>;
    /** Soldes de placement de DÉPART (continuité passé↔futur au mois 0). */
    liveCSVBalances: ReturnType<typeof deriveStartingBalancesFromHistory>;
    /** Cash de départ reconstitué (soldes initiaux + flux de transactions). */
    calculatedStartingCash: number;
    startYear: number;
    startMonth: number;
    todayMonthIndex: number;
}

/**
 * Source unique des `SimulationParams`. Lit toutes les tranches du store via un seul
 * sélecteur `useShallow` (références stables → recalcul seulement quand une tranche change),
 * réplique à l'identique les dérivations qui vivaient dans `FutureProjection` (extraction LITTÉRALE ;
 * `buildSimulationParams` est verrouillé par tests/services/buildSimulationParams.parity.test.ts et
 * le moteur de bout en bout par tests/components/ProjectionEngine.test.tsx — pas de test DIRECT du
 * hook, cf BACKLOG).
 */
export function useSimulationParams(calculatedMonthlySavings: number): SimulationParamsBundle {
    const {
        projection, config, realEstateGoals, debts, childGoals, travelGoals, lifeEvents,
        retirementGoal, financialGoals, budgetItems, initialBalances, transactions,
        insurancePolicies, vehicleReplacements, majorRenovations, charitableGoals,
        rentalProperties, privateBusinesses, savingsGoals,
    } = useFinanceStore(useShallow((st) => ({
        projection: st.projection,
        config: st.config,
        realEstateGoals: st.realEstateGoals ?? EMPTY_ARRAY,
        debts: st.debts ?? EMPTY_ARRAY,
        childGoals: st.childGoals ?? EMPTY_ARRAY,
        travelGoals: st.travelGoals ?? EMPTY_ARRAY,
        lifeEvents: st.lifeEvents ?? EMPTY_ARRAY,
        retirementGoal: st.retirementGoal,
        financialGoals: st.financialGoals ?? EMPTY_ARRAY,
        budgetItems: st.budgetItems ?? EMPTY_ARRAY,
        initialBalances: st.initialBalances,
        transactions: st.transactions ?? EMPTY_ARRAY,
        insurancePolicies: st.insurancePolicies ?? EMPTY_ARRAY,
        vehicleReplacements: st.vehicleReplacements ?? EMPTY_ARRAY,
        majorRenovations: st.majorRenovations ?? EMPTY_ARRAY,
        charitableGoals: st.charitableGoals ?? EMPTY_ARRAY,
        rentalProperties: st.rentalProperties ?? EMPTY_ARRAY,
        privateBusinesses: st.privateBusinesses ?? EMPTY_ARRAY,
        savingsGoals: st.savingsGoals ?? EMPTY_ARRAY,
    })));

    // PH2-c-1 (résolu) : ce hook est monté 2× quand Futur est ouvert (ProjectionEngine + FutureProjection),
    // mais le fetch Finnhub de usePastPortfolioHistory est désormais DÉDUPLIQUÉ AU NIVEAU MODULE
    // (cache partagé + useSyncExternalStore) → un seul fetch, jonction passé↔futur cohérente.
    // A1/A3 — soldes de DÉPART dérivés de la même reconstruction que la courbe passée
    // (continuité passé↔futur au mois 0 : le futur démarre sur le portefeuille réel).
    const pastHistory = usePastPortfolioHistory();
    const liveCSVBalances = useMemo(
        () => deriveStartingBalancesFromHistory(pastHistory.points),
        [pastHistory.points],
    );

    const calculatedStartingCash = useMemo(() => {
        let cash = 0;
        (Object.values(initialBalances ?? {}) as number[]).forEach((v) => { cash += Number(v) || 0; });
        (transactions as Transaction[]).forEach((t) => {
            if (!t.isDuplicate && !t.isTransfer) cash += Number(t.amount) || 0;
        });
        return cash;
    }, [initialBalances, transactions]);

    // La projection démarre AUJOURD'HUI (mois courant), pas au 1er janvier en dur :
    // passé reconstruit et futur projeté se rejoignent au point « aujourd'hui ».
    // [FUTUR-HIST-DAILY-REFRESH] « Aujourd'hui » (mois) AVANCE quand le mois calendaire change, même onglet ouvert
    // (avant : figé au MONTAGE via `useMemo([])`). Source PARTAGÉE module-level (une seule horloge pour les 2 montages
    // du hook → pas de divergence inter-instances, cf bloc ci-dessus). Granularité MOIS (passé/moteur mensuels).
    const monthEpoch = useSyncExternalStore(_subscribeMonthEpoch, _getMonthEpoch, _getMonthEpoch);
    const { startYear, startMonth } = useMemo(
        () => ({ startYear: Math.floor(monthEpoch / 12), startMonth: monthEpoch % 12 }),
        [monthEpoch],
    );

    const todayMonthIndex = useMemo(() => {
        const now = new Date();
        return Math.max(0, (now.getFullYear() - startYear) * 12 + (now.getMonth() - startMonth));
    }, [startYear, startMonth]);

    // Lot 0 — assemblage AppState → SimulationParams = fonction PURE (réutilisable hors React).
    const params = useMemo<SimulationParams>(() => buildSimulationParams({
        projection,
        config,
        liveCSVBalances,
        calculatedStartingCash,
        realEstateGoals,
        debts,
        childGoals,
        travelGoals,
        lifeEvents,
        retirementGoal,
        financialGoals,
        budgetItems,
        calculatedMonthlySavings,
        startYear,
        startMonth,
        insurancePolicies,
        vehicleReplacements,
        majorRenovations,
        charitableGoals,
        rentalProperties,
        privateBusinesses,
        savingsGoals,
    }), [projection, calculatedStartingCash, liveCSVBalances, realEstateGoals, debts, childGoals, travelGoals, lifeEvents, retirementGoal, config, budgetItems, calculatedMonthlySavings, insurancePolicies, vehicleReplacements, majorRenovations, charitableGoals, rentalProperties, privateBusinesses, savingsGoals, financialGoals, startYear, startMonth]);

    return { params, pastHistory, liveCSVBalances, calculatedStartingCash, startYear, startMonth, todayMonthIndex };
}
