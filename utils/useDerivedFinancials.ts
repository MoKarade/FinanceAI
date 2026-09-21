import { useMemo } from 'react';
import type { AppState, Transaction } from '../types';
import { assetValueCad, computePresentTermes } from '../services/portfolio';
import { placementsFaisantAutorite } from '../services/fintable/placementsAutorite';
import { useTodayIsoLocal } from '../hooks/useSimulationParams';
import { isSavingsNature } from './budget';

interface DerivedFinancials {
    globalNetWorth: number;
    /**
     * [KPI-AVOIRS-DETTES] Les deux TERMES du patrimoine net présent, HORS immobilier — Marc :
     * « je veux voir ma somme totale d'argent et ma somme totale de dettes ».
     * ⚠️ `globalNetWorth === avoirsHorsImmo − dettesHorsImmo` par CONSTRUCTION (même appel), et
     * l'immobilier s'ajoute aux DEUX côtés chez le consommateur (`presentTermesOfGoal`) — jamais
     * l'équité d'un côté et l'hypothèque de l'autre, qui la retrancherait deux fois.
     */
    avoirsHorsImmo: number;
    dettesHorsImmo: number;
    baseGrossAnnual: number;
    calculatedMonthlySavings: number;
    assetBreakdown: { reer: number; celi: number; reee: number; nonReg: number };
    currentLiquidity: number;
}

/**
 * Phase 3B — extrait les memos dérivés de App.tsx pour réduire la god-component.
 *
 * Aucune logique métier modifiée. Les formules sont importées telles quelles
 * depuis App.tsx (state au 28/05/2026).
 */
export function useDerivedFinancials(state: AppState): DerivedFinancials {
    // [DETTE-SOLDE-INSTANTANE-FIGE] Le jour LOCAL, source unique partagée avec le graphe Futur —
    // le solde d'une dette datée se déduit au JOUR, pas au mois.
    const todayIso = useTodayIsoLocal();
    const baseGrossAnnual = useMemo(
        () => state.config.users.reduce((sum, u) => sum + ((u.grossSalary || 0) * 12), 0),
        [state.config.users],
    );

    // [NW-UI-DEBT] Source unique du NW présent : soustrait les dettes (avant : cash+investments
    // SANS dettes → Dashboard gonflé vs moteur/IA). `computePresentNetWorth` = pendant de `computeRawNetWorth`.
    // [FINTABLE-AUTORITE-PARTOUT étape 3] L'autorité du courtier, lue UNE fois pour l'écran. Quand
    // il n'y a pas de synchro Fintable, `ecart` vaut 0 et rien ne bouge — identité stricte.
    // ⚠️ Dépendances ÉNUMÉRÉES, pas `[state]` : ce hook est appelé au niveau App, et dépendre de
    // l'objet d'état entier referait la réconciliation à CHAQUE écriture du store, où qu'elle
    // porte (une frappe dans le budget, un toast). Même défaut que le sélecteur mesuré au lot
    // précédent, à un étage près.
    const autoritePlacements = useMemo(
        () => placementsFaisantAutorite(state),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `state` n'est lu que par ces cinq champs.
        [state.assets, state.fxRates, state.fxRatesSource, state.fxRatesEstimated, state.fintableBrokerBalances],
    );
    // [KPI-AVOIRS-DETTES] UN SEUL appel pour les trois chiffres : `computePresentNetWorth` dérive
    // lui-même de `computePresentTermes`, donc l'identité affichée est vraie par construction.
    // Un second `useMemo` qui rappellerait `computePresentNetWorth` à côté rouvrirait exactement
    // la divergence que ce lot ferme.
    const termes = useMemo(
        () => computePresentTermes(state.initialBalances, state.transactions, state.assets, state.fxRates, state.debts, autoritePlacements.ecart, todayIso),
        [state.initialBalances, state.transactions, state.assets, state.fxRates, state.debts, autoritePlacements.ecart, todayIso],
    );
    const globalNetWorth = termes.avoirs - termes.dettes;

    const calculatedMonthlySavings = useMemo(() => {
        const income = state.config.users.reduce((acc, u) => acc + (u.netSalary || u.salary || 0), 0);
        const budgetExp = state.budgetItems.reduce((acc, item) => {
            if (isSavingsNature(item.nature)) return acc; // [HEALTH-SAVINGS-CONSISTENCY] NFD, pas `=== 'Epargne'` (alimente le moteur)
            let amount = item.target;
            if (item.frequency === 'Yearly') amount /= 12;
            if (item.frequency === 'Quarterly') amount /= 3;
            if (item.frequency === 'Weekly') amount *= 4.33;
            return acc + amount;
        }, 0);
        return Math.max(0, income - budgetExp);
    }, [state.config, state.budgetItems]);

    const assetBreakdown = useMemo(() => {
        let reer = 0;
        let celi = 0;
        const reee = 0;
        let nonReg = 0;
        state.assets.forEach(a => {
            // [DETTE-PDF-FX-BYPASS] source unique : FX (prix stocké en devise NATIVE) + garde NaN/Infinity
            // + devise absente signalée, TOUT dans assetValueCad — jamais `quantity × currentPrice × (fx||1)`
            // à la main (le repli 1:1 muet sous-affiche le patrimoine, incident ASSET-FX-DISPLAY).
            const val = assetValueCad(a, state.fxRates);
            if (a.accountType === 'REER') reer += val;
            else if (a.accountType === 'CELI') celi += val;
            else nonReg += val;
        });
        return { reer, celi, reee, nonReg };
    }, [state.assets, state.fxRates]);

    const currentLiquidity = useMemo(() => {
        let cash = 0;
        (Object.values(state.initialBalances) as number[]).forEach(v => cash += v);
        state.transactions.forEach((t: Transaction) => {
            if (!t.isDuplicate && !t.isTransfer) cash += t.amount;
        });
        return cash;
    }, [state.initialBalances, state.transactions]);

    return { globalNetWorth, avoirsHorsImmo: termes.avoirs, dettesHorsImmo: termes.dettes, baseGrossAnnual, calculatedMonthlySavings, assetBreakdown, currentLiquidity };
}
