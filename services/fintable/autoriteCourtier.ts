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
 * Les paniers JUMEAUX qui PORTENT de la valeur, comme un FAIT sur les avoirs — pas comme une
 * lecture d'une base de calcul.
 *
 * ⚠️⚠️ POURQUOI CE N'EST PLUS LU DANS `soldes` (étape 3, 2026-09-17). La décision « reprend-on ce
 * panier au courtier ? » doit être UNE, parce que deux surfaces l'appliquent : le moteur (base =
 * reconstruction datée) et l'écran (base = prix courants). Tant qu'elle se lisait dans `soldes`,
 * chaque surface répondait sur SA base — donc potentiellement deux réponses à une seule question,
 * exactement ce que tout ce chantier existe pour supprimer. La question « le CELIAPP porte-t-il
 * quelque chose ? » est un fait sur les AVOIRS, pas sur une base : elle se calcule une fois et se
 * passe aux deux.
 *
 * ⚠️ Et c'est aussi STRICTEMENT PLUS SÛR que la lecture d'avant. Un CELIAPP dont tous les titres
 * sont écartés de la reconstruction (queue de chandelles périmée) valait `0` dans `soldes` : le
 * refus ne pouvait pas TIRER, et le total courtier « CELI » s'écrivait par-dessus un CELIAPP bien
 * réel. Le fait, lui, reste vrai (`UNE-GARDE-QUI-NE-PEUT-PAS-TIRER-N-EST-PAS-UNE-PROTECTION`).
 */
export interface JumeauxPorteurs {
    CELIAPP: boolean;
    REEE: boolean;
}

/** Aucun jumeau ne porte rien — pour les appelants dont l'état ne connaît ni CELIAPP ni REEE. */
export const AUCUN_JUMEAU: JumeauxPorteurs = { CELIAPP: false, REEE: false };

/**
 * LA décision : quels paniers sont repris au courtier, et pourquoi les autres ne le sont pas.
 *
 * Pure, sans base de calcul — c'est tout l'intérêt. `appliquerAutoriteCourtier` (moteur) et
 * `placementsFaisantAutorite` (écran) l'appellent tous les deux et appliquent ensuite la MÊME
 * liste à LEUR base. Ce qui se partage est la DÉCISION, jamais la BASE
 * (`AVANT-D-UNIFIER-N-COPIES-SEPARER-CE-QUI-EST-PARTAGE-DE-CE-QUI-NE-L-EST-PAS`).
 */
export function decideRegimesRepris(
    reconciliation: ReconciliationLue | undefined,
    jumeaux: JumeauxPorteurs,
): { appliques: ReconcilableRegime[]; refuses: Array<{ regime: ReconcilableRegime; raison: RaisonRefus }> } {
    const regimes = reconciliation?.regimes ?? [];
    const appliques: ReconcilableRegime[] = [];
    const refuses: Array<{ regime: ReconcilableRegime; raison: RaisonRefus }> = [];
    if (regimes.length === 0) return { appliques, refuses };

    const incomplets = new Set(reconciliation?.incompleteRegimes ?? []);
    const nonPlacable = reconciliation?.hasUnplaceableAccount === true;

    for (const r of regimes) {
        if (CLE_PAR_REGIME[r.regime] === undefined) continue;

        // ⚠️⚠️ TROIS REFUS AVANT TOUTE ÉCRITURE, et ils viennent d'une mesure sur la chaîne réelle.
        // Un total courtier AMPUTÉ (un compte du régime écarté, un autre retenu) écrasait la valeur
        // reconstruite COMPLÈTE : un compte CAD retenu + un compte USD sans taux donnait un
        // mois 0 égal au seul compte CAD au lieu de la valeur complète. C'est exactement l'état de Marc tant que ses taux
        // viennent du repli — le cas le plus probable, pas un cas limite.
        if (nonPlacable) { refuses.push({ regime: r.regime, raison: 'compte-non-placable' }); continue; }
        if (incomplets.has(r.regime)) { refuses.push({ regime: r.regime, raison: 'total-partiel' }); continue; }
        const jumeau = JUMEAU_DE_FAMILLE[r.regime];
        if (jumeau !== undefined && jumeaux[jumeau]) {
            refuses.push({ regime: r.regime, raison: 'famille-mixte' });
            continue;
        }
        // Un total non fini n'est PAS rabattu sur 0 : un 0 crédible effacerait tout un panier du
        // patrimoine sans un mot (no-fake-data). Le refus est une DONNÉE rendue à l'appelant, pas
        // un silence — c'est ce qui le distingue d'un `continue` muet. Rare mais PAS mort : une
        // somme de termes finis peut déborder.
        if (!Number.isFinite(Number(r.brokerTotalCad))) {
            refuses.push({ regime: r.regime, raison: 'total-illisible' });
            continue;
        }
        appliques.push(r.regime);
    }
    return { appliques, refuses };
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
export function appliquerAutoriteCourtier<T extends SoldesDepart>(
    soldes: T,
    reconciliation: ReconciliationLue | undefined,
    jumeaux: JumeauxPorteurs,
): ResultatAutorite<T> {
    const { appliques, refuses } = decideRegimesRepris(reconciliation, jumeaux);
    if (appliques.length === 0) return { soldes, ecartTotal: 0, regimesAppliques: [], regimesRefuses: refuses };

    const totauxParRegime = new Map<ReconcilableRegime, number>();
    for (const r of reconciliation?.regimes ?? []) totauxParRegime.set(r.regime, Number(r.brokerTotalCad));

    const sortie: T = { ...soldes };
    let ecartTotal = 0;
    for (const regime of appliques) {
        const cle = CLE_PAR_REGIME[regime];
        const total = totauxParRegime.get(regime);
        // `decideRegimesRepris` a déjà écarté les totaux non finis ; la garde reste pour que le
        // type soit honnête, et parce qu'un appelant futur pourrait passer une autre liste.
        if (total === undefined || !Number.isFinite(total)) continue;
        const avant = Number(sortie[cle] ?? 0);
        const base = Number.isFinite(avant) ? avant : 0;
        sortie[cle] = total;
        ecartTotal += total - base;
    }

    // Le TOTAL n'est recomposé que s'il EXISTE en entrée : l'ajouter là où l'appelant ne le produit
    // pas fabriquerait un champ que personne n'a demandé, et que rien ne tiendrait à jour ensuite.
    if (Object.prototype.hasOwnProperty.call(soldes, 'TOTAL')) {
        sortie.TOTAL = sortie.CELI + sortie.CELIAPP + sortie.REER + sortie.REEE
            + sortie.NON_ENREG + sortie.CRYPTO;
    }

    return { soldes: sortie, ecartTotal, regimesAppliques: appliques, regimesRefuses: refuses };
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
