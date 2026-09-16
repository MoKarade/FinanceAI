// services/fintable/autoriteCourtier.ts
//
// [FINTABLE-AUTORITE-AUJOURDHUI] Le total du COURTIER fait autorité sur la valeur de placement
// d'AUJOURD'HUI — donc sur le point de départ de toute la projection.
//
// CE QUE CE MODULE FINIT. `[FINTABLE-6]` (demande Marc du 2026-07-30 : « je veux que dans
// investissements ça utilise exactement le montant que j'ai dans Fintable ») avait posé la
// réconciliation par panier fiscal… et s'était arrêté à une CARTE D'ÉCART. Recensé le 2026-09-16 :
// `fintableBrokerBalances` n'avait qu'UN SEUL consommateur dans tout le dépôt,
// `BrokerReconciliationCard`. Le total affiché, le patrimoine net et le mois 0 du moteur
// continuaient tous de sommer les titres saisis à la main. La demande était livrée à moitié, et la
// moitié manquante était justement celle qui fait autorité.
//
// ⚠️ LE POINT D'INJECTION EST UNIQUE, ET C'EST POURQUOI C'EST FAISABLE SANS DISPERSION :
// `deriveStartingBalancesFromHistory` alimente `liveCSVBalances` dans `useSimulationParams`, qui
// est à la fois le mois 0 du moteur ET le point sur lequel la courbe Futur démarre. Un seul
// endroit à corriger, donc aucune copie de la règle à maintenir ailleurs.
//
// ⚠️ CE MODULE NE TOUCHE PAS AU PASSÉ, délibérément. Il n'existe AUCUN historique Fintable :
// l'instantané est ÉCRASÉ à chaque passe. Le passé reste donc la reconstruction à partir des titres
// saisis, et la différence apparaît comme une MARCHE au raccord. On la NOMME
// (`mentionAutoriteCourtier`) au lieu de la lisser — lisser afficherait un portefeuille que Marc
// n'a jamais eu (même arbitrage que `raccordNotice.ts`, et même leçon
// `UN-CHIFFRE-JUSTE-PEUT-ETRE-ILLISIBLE`).

import type { ReconcilableRegime } from './brokerBalances';

/** La forme rendue par `deriveStartingBalancesFromHistory` (signature d'index incluse). */
export interface SoldesDepart {
    CELI: number;
    CELIAPP: number;
    REER: number;
    NON_ENREG: number;
    CRYPTO: number;
    REEE: number;
    TOTAL: number;
    historicalRate: number;
    [key: string]: number;
}

/** Sous-ensemble de `BrokerReconciliation` réellement lu ici — structurel, pour rester testable. */
export interface ReconciliationLue {
    regimes: ReadonlyArray<{
        regime: ReconcilableRegime;
        brokerTotalCad: number;
        holdingsValueCad: number;
        accountLabels: readonly string[];
    }>;
}

/** Nom du panier côté `SoldesDepart` pour chaque régime réconciliable. Aucune graphie parallèle. */
const CLE_PAR_REGIME: Readonly<Record<ReconcilableRegime, 'CELI' | 'REER' | 'NON_ENREG'>> = {
    CELI: 'CELI',
    REER: 'REER',
    'NON-ENREG': 'NON_ENREG',
};

export interface ResultatAutorite {
    soldes: SoldesDepart;
    /** Somme algébrique de ce que l'autorité a ajouté (positif) ou retiré (négatif) au total. */
    ecartTotal: number;
    /** Paniers effectivement repris au courtier. Vide ⇒ rien n'a changé, à l'octet près. */
    regimesAppliques: ReconcilableRegime[];
}

/**
 * Remplace, panier par panier, la valeur reconstruite par le total du courtier.
 *
 * ⚠️ IDENTITÉ STRICTE quand il n'y a rien à appliquer. Un état sans Fintable, un régime non déclaré,
 * un total non fini : on rend l'entrée telle quelle. C'est la propriété qui garantit que ce lot ne
 * déplace RIEN pour qui n'utilise pas la synchro — et elle est testée par perturbation, pas déduite.
 *
 * ⚠️ `historicalRate` n'est PAS recalculé, et ce n'est pas un oubli : c'est un RENDEMENT mesuré sur
 * la série des prix des titres saisis. Le total du courtier contient aussi les liquidités du compte
 * et les positions que Fintable ne détaille pas (contrainte produit : il rend le TOTAL, jamais les
 * positions) — le mêler à une mesure de rendement remplacerait un chiffre imparfait par un chiffre
 * faux. `UN-CORRECTIF-PEUT-ETRE-PIRE-QUE-LE-DEFAUT-SUR-UNE-BRANCHE`.
 */
export function appliquerAutoriteCourtier(
    soldes: SoldesDepart,
    reconciliation: ReconciliationLue | undefined,
): ResultatAutorite {
    const regimes = reconciliation?.regimes ?? [];
    if (regimes.length === 0) return { soldes, ecartTotal: 0, regimesAppliques: [] };

    const sortie: SoldesDepart = { ...soldes };
    const regimesAppliques: ReconcilableRegime[] = [];
    let ecartTotal = 0;

    for (const r of regimes) {
        const cle = CLE_PAR_REGIME[r.regime];
        if (cle === undefined) continue;
        const total = Number(r.brokerTotalCad);
        // Un total non fini n'est PAS rabattu sur 0 : un 0 crédible effacerait tout un panier du
        // patrimoine sans un mot (no-fake-data). On laisse la valeur reconstruite et on n'ajoute
        // pas ce régime à la liste des appliqués — donc rien ne prétend qu'il vient du courtier.
        if (!Number.isFinite(total)) continue;
        const avant = Number(sortie[cle]);
        const base = Number.isFinite(avant) ? avant : 0;
        sortie[cle] = total;
        ecartTotal += total - base;
        regimesAppliques.push(r.regime);
    }

    if (regimesAppliques.length === 0) return { soldes, ecartTotal: 0, regimesAppliques: [] };

    sortie.TOTAL = sortie.CELI + sortie.CELIAPP + sortie.REER + sortie.REEE
        + sortie.NON_ENREG + sortie.CRYPTO;

    return { soldes: sortie, ecartTotal, regimesAppliques };
}

/**
 * La phrase qui explique la MARCHE au raccord entre le passé reconstruit et aujourd'hui.
 *
 * ⚠️ AUCUN MONTANT, comme `mentionRaccord` et pour la même raison : un montant interpolé dans une
 * chaîne n'est plus un nœud, donc plus masquable en mode discret
 * (`UN-MONTANT-INTERPOLE-DANS-UNE-CHAINE-N-EST-PLUS-UN-NOEUD`). Le SENS suffit — l'ampleur est déjà
 * lisible sur la courbe, et le détail par compte vit dans la carte de réconciliation.
 *
 * @returns `''` quand il n'y a rien à expliquer (aucun panier repris, ou écart nul au dollar près).
 */
export function mentionAutoriteCourtier(ecartTotal: number, regimesAppliques: readonly string[]): string {
    if (regimesAppliques.length === 0) return '';
    if (!Number.isFinite(ecartTotal) || Math.round(ecartTotal) === 0) return '';
    const sens = ecartTotal > 0 ? 'au-dessus' : 'en dessous';
    return `aujourd'hui part du total de ton courtier, ${sens} de la somme des titres que tu as `
        + 'saisis — le passé, lui, reste reconstruit à partir de ces titres, d\'où la marche au raccord';
}
