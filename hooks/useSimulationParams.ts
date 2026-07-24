// hooks/useSimulationParams.ts
// PH2-c (clé de voûte) — assemble les `SimulationParams` + les dérivations passé/présent
// À PARTIR DU STORE UNIQUEMENT (self-contained), pour que le MÊME calcul de params serve
// à la fois le moteur app-level (`ProjectionEngine`) ET l'affichage de `FutureProjection`.
// Garantit la « source unique » : zéro divergence de params entre les deux call-sites.
//
// `calculatedMonthlySavings` est passé en argument car il est dérivé en amont par
// `useDerivedFinancials` (App) — on évite de le recalculer ici.

import { useMemo, useState, useEffect } from 'react';
import { useFinanceStore } from '../store/useFinanceStore';
import { useShallow } from 'zustand/shallow';
import { buildSimulationParams } from '../services/projection/buildSimulationParams';
import type { SimulationParams } from '../services/projection';
import type { Transaction } from '../types';
import { usePastPortfolioHistory } from './usePastPortfolioHistory';
import { deriveStartingBalancesFromHistory } from '../services/history/startingBalancesFromHistory';

const EMPTY_ARRAY: never[] = [];

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
    // [FUTUR-HIST-DAILY-REFRESH] « Aujourd'hui » AVANCE quand le mois calendaire change, même onglet ouvert :
    // avant, `startYear/startMonth` étaient figés au MONTAGE (`useMemo([])`) → un onglet laissé ouvert à cheval
    // sur un changement de mois gardait un « aujourd'hui » périmé jusqu'au prochain remount. `monthEpoch` (an×12+mois)
    // se réévalue à chaque heure + au retour de visibilité → au passage de mois, la projection re-seed et le passé
    // gagne son point manquant. Granularité MOIS (le passé/moteur sont mensuels ; un tick quotidien n'ajouterait rien).
    const [monthEpoch, setMonthEpoch] = useState(() => {
        const d = new Date();
        return d.getFullYear() * 12 + d.getMonth();
    });
    useEffect(() => {
        const check = () => {
            const d = new Date();
            const e = d.getFullYear() * 12 + d.getMonth();
            setMonthEpoch((prev) => (prev === e ? prev : e)); // no-op si même mois → pas de re-render inutile
        };
        const id = setInterval(check, 60 * 60 * 1000); // horaire (onglet idle mais visible à cheval sur minuit)
        const onVis = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') check(); };
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);
        return () => {
            clearInterval(id);
            if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis);
        };
    }, []);
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
