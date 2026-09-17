// services/fintable/placementsAutorite.ts
//
// [FINTABLE-AUTORITE-PARTOUT étape 3] Ce que valent les placements quand le COURTIER fait autorité,
// du côté de l'ÉCRAN (Accueil, Investissements, valeur nette, vue d'ensemble MCP et hub).
//
// Demande de Marc, 2026-09-17 : « je veux que toutes les valeurs soient cohérentes de partout entre
// elles, et que ce soit la valeur Fintable, car la plus fiable ». Mesuré ce jour-là, QUATRE
// producteurs répondaient à « combien valent mes placements ? » et un seul consultait Fintable
// (le mois 0 du moteur).
//
// ⚠️⚠️ CE QUI SE PARTAGE EST LA DÉCISION, JAMAIS LA BASE. C'est le point de conception du lot, et le
// premier jet l'avait raté. `appliquerAutoriteCourtier` (moteur) fait DEUX choses : elle DÉCIDE
// quels paniers sont repris au courtier, et elle CALCULE un écart sur la base qu'on lui donne — la
// reconstruction DATÉE (`holdingsAt`). L'écran, lui, somme les quantités COURANTES. Ajouter l'écart
// du moteur au total de l'écran n'est une identité que si les deux bases coïncident : dès qu'un
// `quantity` diverge de la somme de ses achats, l'écart importe la divergence dans le chiffre de
// l'Accueil, en silence et sans rien de non fini.
//
// On applique donc la MÊME liste de paniers (`decideRegimesRepris`) à NOTRE base. Un panier repris
// vaut alors exactement le total du courtier des DEUX côtés — l'écran et le moteur ne peuvent plus
// diverger dessus — et un panier refusé garde de chaque côté la base que son écran affiche déjà.
// Variante de `AVANT-D-UNIFIER-N-COPIES-SEPARER-CE-QUI-EST-PARTAGE-DE-CE-QUI-NE-L-EST-PAS` : la
// vitesse se partage, l'ancre non.
//
// ⚠️ La base de l'écran n'est PAS à reconstruire ici : `reconcileBrokerBalances` reçoit déjà
// `holdingsCadByRegime(assets, fx)` — quantité courante × prix courant via `assetValueCad`, exactement
// ce que `computeInvestmentsValue` somme —, et republie ce total par panier dans `holdingsValueCad`.
// Le recalculer serait une SECONDE somme sur la même base, donc deux vérités à la première évolution.

import type { AppState } from '../../types';
import { computeInvestmentsValue } from '../portfolio';
import { reconcileBrokerBalances, tauxCourantsDepuisEtat } from './brokerBalances';
import { holdingsCadByRegime, jumeauxPorteursDepuisActifs } from './holdingsByRegime';
import { decideRegimesRepris, type RaisonRefus } from './autoriteCourtier';
import type { ReconcilableRegime } from './brokerBalances';

/** Ce dont ce module a besoin dans l'état — structurel, pour rester appelable depuis le MCP. */
export type EtatPourAutoritePlacements = Pick<AppState,
    'assets' | 'fxRates' | 'fxRatesSource' | 'fxRatesEstimated' | 'fintableBrokerBalances'>;

export interface PlacementsAutorite {
    /** Somme des titres saisis, base de l'écran — ce qui était affiché avant ce lot. */
    base: number;
    /** Correction à appliquer : `Σ (total courtier − titres du panier)` sur les paniers REPRIS. */
    ecart: number;
    /** `base + ecart` : la valeur qui fait autorité. */
    valeur: number;
    regimesAppliques: ReconcilableRegime[];
    regimesRefuses: Array<{ regime: ReconcilableRegime; raison: RaisonRefus }>;
}

/**
 * La valeur de placement faisant autorité, et de quoi l'EXPLIQUER.
 *
 * ⚠️ IDENTITÉ STRICTE quand il n'y a rien à appliquer (pas de synchro Fintable, aucun panier repris) :
 * `ecart` vaut 0 et `valeur === base`. Pour qui n'utilise pas la synchro, ce lot ne déplace pas un
 * dollar — et c'est prouvé par perturbation, pas déduit.
 */
export function placementsFaisantAutorite(
    etat: EtatPourAutoritePlacements | undefined,
): PlacementsAutorite {
    const assets = etat?.assets ?? [];
    const fx = etat?.fxRates ?? {};
    // ⚠️ `0` : c'est ici qu'on CALCULE l'écart, donc la base est la somme nue des titres. Y passer
    // autre chose serait circulaire.
    const base = computeInvestmentsValue(assets, fx, 0);

    const reconciliation = reconcileBrokerBalances(
        etat?.fintableBrokerBalances,
        holdingsCadByRegime(assets, fx),
        tauxCourantsDepuisEtat(etat),
    );
    const { appliques, refuses } = decideRegimesRepris(
        reconciliation,
        jumeauxPorteursDepuisActifs(assets, fx),
    );

    const parRegime = new Map(reconciliation.regimes.map((r) => [r.regime, r]));
    let ecart = 0;
    for (const regime of appliques) {
        const r = parRegime.get(regime);
        if (r === undefined) continue;
        const total = Number(r.brokerTotalCad);
        if (!Number.isFinite(total)) continue;
        // ⚠️ Même traitement d'une base non finie que `appliquerAutoriteCourtier` (`base = 0`), et
        // c'est DÉLIBÉRÉ : refuser ici un panier que le moteur applique recréerait exactement la
        // divergence que ce module existe pour supprimer. La décision est partagée, donc ses
        // conséquences aussi.
        const titres = Number(r.holdingsValueCad);
        ecart += total - (Number.isFinite(titres) ? titres : 0);
    }

    return { base, ecart, valeur: base + ecart, regimesAppliques: appliques, regimesRefuses: refuses };
}
