// services/fx/selecteurs.ts
//
// [FX-TAUX-JAMAIS-ARRIVES] Sélecteurs Zustand partagés par le démarrage et par la carte de
// diagnostic. Extraits ici pour une raison précise : un sélecteur qui reconstruit un OBJET à chaque
// appel casse l'égalité de référence et fait re-rendre son consommateur à chaque écriture du store.
// Les deux surfaces qui lisent l'état FX ont besoin des MÊMES champs — les écrire deux fois, c'est
// se donner deux occasions de diverger (`UN-COMMENTAIRE-QUI-RECLAME-DE-LA-VIGILANCE-EST-UNE-SOURCE-
// UNIQUE-MANQUANTE`).

import type { EtatFxCompare } from './provenance';

/** Forme MINIMALE lue par la décision d'écriture. Le tableau de dépendances reste PLAT. */
export interface EtatFxLu extends EtatFxCompare {
    fxRates: { USD: number; EUR: number; CAD: number; lastFetched?: number };
    fxRatesEstimated?: boolean;
    fxRatesSource?: string;
    fxLastAttemptAt?: number;
    fxLastAttemptCause?: string;
}

/**
 * ⚠️ Reconstruit un objet — donc à consommer via `useShallow`, ou depuis un effet qui ne se
 * ré-exécute pas (le cas du démarrage : deps vides, la closure du montage suffit). Le dire ici
 * évite que le prochain appelant l'apprenne par un rendu en boucle.
 */
export const etatFxPourComparaison = (s: EtatFxLu): EtatFxLu => ({
    fxRates: s.fxRates,
    fxRatesEstimated: s.fxRatesEstimated,
    fxRatesSource: s.fxRatesSource,
    fxLastAttemptAt: s.fxLastAttemptAt,
    fxLastAttemptCause: s.fxLastAttemptCause,
});
