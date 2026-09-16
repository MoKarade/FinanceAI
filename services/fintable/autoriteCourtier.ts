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
    /** ⚠️ OPTIONNELS : `derivePortfolioStartingBalances` (chemin état-pur / MCP) ne les produit pas,
     *  `deriveStartingBalancesFromHistory` (chemin React) si. Les exiger ici aurait forcé l'un des
     *  deux chemins à fabriquer une valeur — donc à inventer un total ou un rendement. */
    TOTAL?: number;
    historicalRate?: number;
    [key: string]: number | undefined;
}

/** Sous-ensemble de `BrokerReconciliation` réellement lu ici — structurel, pour rester testable. */
export interface ReconciliationLue {
    regimes: ReadonlyArray<{
        regime: ReconcilableRegime;
        brokerTotalCad: number;
        holdingsValueCad: number;
        accountLabels: readonly string[];
    }>;
    /** Régimes dont un compte a été ÉCARTÉ alors qu'un autre a survécu — total AMPUTÉ. */
    incompleteRegimes?: readonly ReconcilableRegime[];
    /** Un compte écarté sans régime exploitable : on ignore quel panier il ampute. */
    hasUnplaceableAccount?: boolean;
}

/** Pourquoi un panier n'a PAS été repris au courtier. Sert à l'écrire à l'écran, jamais à deviner. */
export type RaisonRefus =
    /** Un compte du régime a été écarté (taux inconnu, solde illisible) : le total est amputé. */
    | 'total-partiel'
    /** Un compte écarté n'est rattachable à aucun panier : aucun total n'est fiable. */
    | 'compte-non-placable'
    /** Le panier JUMEAU de la même famille fiscale porte une valeur (CELIAPP avec CELI, REEE avec REER). */
    | 'famille-mixte'
    /** Le total du courtier n'est pas un nombre exploitable. */
    | 'total-illisible';

/** Nom du panier côté `SoldesDepart` pour chaque régime réconciliable. Aucune graphie parallèle. */
const CLE_PAR_REGIME: Readonly<Record<ReconcilableRegime, 'CELI' | 'REER' | 'NON_ENREG'>> = {
    CELI: 'CELI',
    REER: 'REER',
    'NON-ENREG': 'NON_ENREG',
};

export interface ResultatAutorite<T extends SoldesDepart = SoldesDepart> {
    soldes: T;
    /** Somme algébrique de ce que l'autorité a ajouté (positif) ou retiré (négatif) au total. */
    ecartTotal: number;
    /** Paniers effectivement repris au courtier. Vide ⇒ rien n'a changé, à l'octet près. */
    regimesAppliques: ReconcilableRegime[];
    /** Paniers REFUSÉS, avec leur raison. Un refus silencieux serait indiscernable d'un succès. */
    regimesRefuses: Array<{ regime: ReconcilableRegime; raison: RaisonRefus }>;
}

/**
 * Panier JUMEAU au sein de la même famille fiscale, côté soldes reconstruits.
 *
 * ⚠️⚠️ C'EST LE DÉFAUT LE PLUS DISCRET DU LOT, et il vient d'une asymétrie entre deux modules :
 * la base de comparaison (`holdingsCadByRegime` → `BUCKET_OF`) REPLIE CELIAPP sur CELI et REEE sur
 * REER (« même famille fiscale », décision écrite), pendant que `deriveStartingBalancesFromHistory`
 * les garde SÉPARÉS (`TYPE_TO_KEY`). Écrire le total courtier « CELI » — qui a été comparé à
 * CELI + CELIAPP — dans le seul panier `CELI` pendant que `CELIAPP` conserve sa valeur compte donc
 * le CELIAPP DEUX FOIS. Mesuré : CELI 41 000 + CELIAPP 25 500 déclarés `CELI` chez le courtier
 * rendaient un total de départ de 91 500 $ pour 66 500 $ réels.
 *
 * On REFUSE le panier plutôt que d'écraser le jumeau : mettre `CELIAPP` à zéro rangerait de
 * l'argent CELIAPP dans le CELI, ce qui n'est pas un arrondi mais un changement de RÉGIME FISCAL —
 * une décision produit, pas un correctif de bug. Routé, et dit à l'écran.
 */
const JUMEAU_DE_FAMILLE: Readonly<Partial<Record<ReconcilableRegime, 'CELIAPP' | 'REEE'>>> = {
    CELI: 'CELIAPP',
    REER: 'REEE',
};

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
export function appliquerAutoriteCourtier<T extends SoldesDepart>(
    soldes: T,
    reconciliation: ReconciliationLue | undefined,
): ResultatAutorite<T> {
    const regimes = reconciliation?.regimes ?? [];
    if (regimes.length === 0) return { soldes, ecartTotal: 0, regimesAppliques: [], regimesRefuses: [] };

    const incomplets = new Set(reconciliation?.incompleteRegimes ?? []);
    const nonPlacable = reconciliation?.hasUnplaceableAccount === true;

    const sortie: T = { ...soldes };
    const regimesAppliques: ReconcilableRegime[] = [];
    const regimesRefuses: Array<{ regime: ReconcilableRegime; raison: RaisonRefus }> = [];
    let ecartTotal = 0;

    for (const r of regimes) {
        const cle = CLE_PAR_REGIME[r.regime];
        if (cle === undefined) continue;

        // ⚠️⚠️ TROIS REFUS AVANT TOUTE ÉCRITURE, et ils viennent d'une mesure sur la chaîne réelle.
        // Un total courtier AMPUTÉ (un compte du régime écarté, un autre retenu) écrasait la valeur
        // reconstruite COMPLÈTE : Disnat CAD 30 000 $ + Disnat USD 72 040 $ sans taux donnait un
        // mois 0 à 30 000 $ au lieu de 231 882 $. C'est exactement l'état de Marc tant que ses taux
        // viennent du repli — le cas le plus probable, pas un cas limite.
        if (nonPlacable) { regimesRefuses.push({ regime: r.regime, raison: 'compte-non-placable' }); continue; }
        if (incomplets.has(r.regime)) { regimesRefuses.push({ regime: r.regime, raison: 'total-partiel' }); continue; }
        const jumeau = JUMEAU_DE_FAMILLE[r.regime];
        if (jumeau !== undefined && Number(sortie[jumeau] ?? 0) !== 0) {
            regimesRefuses.push({ regime: r.regime, raison: 'famille-mixte' });
            continue;
        }

        const total = Number(r.brokerTotalCad);
        // Un total non fini n'est PAS rabattu sur 0 : un 0 crédible effacerait tout un panier du
        // patrimoine sans un mot (no-fake-data). On laisse la valeur reconstruite et on n'ajoute
        // pas ce régime à la liste des appliqués — donc rien ne prétend qu'il vient du courtier.
        if (!Number.isFinite(total)) {
            // ⚠️ Le refus est une DONNÉE rendue à l'appelant, pas un silence : c'est ce qui
            // distingue cette branche d'un `continue` muet (le panel l'avait relevée comme une
            // garde qui ne peut pas se signaler). Elle est rare mais PAS morte — une somme de
            // termes finis peut déborder.
            regimesRefuses.push({ regime: r.regime, raison: 'total-illisible' });
            continue;
        }
        const avant = Number(sortie[cle] ?? 0);
        const base = Number.isFinite(avant) ? avant : 0;
        sortie[cle] = total;
        ecartTotal += total - base;
        regimesAppliques.push(r.regime);
    }

    if (regimesAppliques.length === 0) return { soldes, ecartTotal: 0, regimesAppliques: [], regimesRefuses };

    // Le TOTAL n'est recomposé que s'il EXISTE en entrée : l'ajouter là où l'appelant ne le produit
    // pas fabriquerait un champ que personne n'a demandé, et que rien ne tiendrait à jour ensuite.
    if (Object.prototype.hasOwnProperty.call(soldes, 'TOTAL')) {
        sortie.TOTAL = sortie.CELI + sortie.CELIAPP + sortie.REER + sortie.REEE
            + sortie.NON_ENREG + sortie.CRYPTO;
    }

    return { soldes: sortie, ecartTotal, regimesAppliques, regimesRefuses };
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
