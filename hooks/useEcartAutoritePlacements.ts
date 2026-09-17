// hooks/useEcartAutoritePlacements.ts
//
// [FINTABLE-AUTORITE-PARTOUT étape 3] La correction du COURTIER sur les placements, pour les écrans
// qui lisent le store par sélecteurs plutôt que l'`AppState` entier.
//
// ⚠️ Un HOOK plutôt que cinq `useFinanceStore` recopiés dans chaque composant : la liste des champs
// que l'autorité consulte est un détail de `placementsFaisantAutorite`, et la recopier chez chaque
// appelant, c'est garantir qu'un champ ajouté demain sera oublié quelque part
// (`UN-COMMENTAIRE-QUI-RECLAME-DE-LA-VIGILANCE-EST-UNE-SOURCE-UNIQUE-MANQUANTE`).
//
// ⚠️ Sélecteurs ATOMIQUES puis `useMemo` : un sélecteur qui reconstruirait l'objet d'état à chaque
// appel n'est jamais égal à lui-même et re-rendrait le composant à CHAQUE écriture du store, où
// qu'elle porte. C'est le défaut mesuré au lot précédent sur `reconcileBrokerBalances`.

import { useMemo } from 'react';
import { useFinanceStore } from '../store/useFinanceStore';
import { placementsFaisantAutorite, type PlacementsAutorite } from '../services/fintable/placementsAutorite';

export function useAutoritePlacements(): PlacementsAutorite {
    const assets = useFinanceStore((s) => s.assets);
    const fxRates = useFinanceStore((s) => s.fxRates);
    const fxRatesSource = useFinanceStore((s) => s.fxRatesSource);
    const fxRatesEstimated = useFinanceStore((s) => s.fxRatesEstimated);
    const fintableBrokerBalances = useFinanceStore((s) => s.fintableBrokerBalances);
    return useMemo(
        () => placementsFaisantAutorite({ assets, fxRates, fxRatesSource, fxRatesEstimated, fintableBrokerBalances }),
        [assets, fxRates, fxRatesSource, fxRatesEstimated, fintableBrokerBalances],
    );
}
