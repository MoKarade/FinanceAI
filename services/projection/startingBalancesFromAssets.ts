// services/projection/startingBalancesFromAssets.ts
//
// [FINTABLE-AUTORITE-PARTOUT étape 3] Soldes de placement de départ dérivés PUREMENT des avoirs.
//
// ⚠️ POURQUOI CE FICHIER EXISTE SÉPARÉMENT. Cette fonction vivait dans `buildSimulationParams.ts`,
// et c'était sans conséquence tant que ses seuls appelants étaient le moteur et le MCP. L'étape 3
// lui donne un appelant de plus — la vue d'ensemble, qui alimente l'ACCUEIL. Or importer
// `buildSimulationParams.ts` tire avec lui `verifierEntreesMoteur`, les barèmes fiscaux
// (`utils/tax`) et les types du moteur : tout ça serait entré dans le bundle de BOOT pour trois
// lignes de dérivation (règle §2 du `CLAUDE.md` — hoister un import au niveau App tire ses deps).
//
// Le module ne dépend donc que de ce que la dérivation utilise VRAIMENT : la reconstruction du
// passé et son lecteur de dernier point. `buildSimulationParams.ts` la RÉ-EXPORTE, pour qu'aucun
// appelant existant n'ait à changer et qu'il n'existe toujours qu'UNE définition.

import type { Asset } from '../../types';
import type { LiveCSVBalances } from '../projection';
import {
    reconstructPortfolioHistory,
    type MinimalAsset,
} from '../history/reconstructPortfolioHistory';
import { deriveStartingBalancesFromHistory } from '../history/startingBalancesFromHistory';
import { getEffectivePurchases } from '../../utils/assetPurchases';

/**
 * Dérive les soldes de placement de départ (`liveCSVBalances`) PUREMENT depuis
 * les avoirs, en réutilisant EXACTEMENT la même chaîne que le composant via le
 * hook `usePastPortfolioHistory` : `reconstructPortfolioHistory` (passé réel
 * des comptes) → `deriveStartingBalancesFromHistory` (dernier point = solde
 * actuel). En contexte hors-DOM (MCP), aucun enrichissement réseau (Finnhub)
 * n'a lieu : la reconstruction part du `priceHistory` présent dans les avoirs,
 * comme en mode test du composant.
 */
export function derivePortfolioStartingBalances(
    assets: readonly Asset[],
    fxRates: Record<string, number>,
): LiveCSVBalances {
    const minimal: MinimalAsset[] = (assets ?? []).map((a) => ({
        symbol: a.symbol,
        quantity: a.quantity || 0,
        currency: a.currency || 'CAD',
        currentPrice: a.currentPrice || 0,
        accountType: a.accountType,
        dateBought: a.dateBought,
        purchases: getEffectivePurchases(a),
        // [FUTUR-MOIS0-CLOTURE-SANS-AGE] Cf. le mapper jumeau de `usePastPortfolioHistory` : deux
        // chemins vers la même reconstruction, donc DEUX mappers à compléter. N'en faire qu'un
        // laisserait le moteur (et le MCP) sur l'ancien comportement, en silence.
        priceUpdatedAt: a.priceUpdatedAt,
        priceHistory: (a.priceHistory || []).map((p) => ({ date: p.date, price: p.price })),
    }));
    const history = reconstructPortfolioHistory(minimal, fxRates ?? {});
    return deriveStartingBalancesFromHistory(history.points);
}
