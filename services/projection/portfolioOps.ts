// services/projection/portfolioOps.ts
// Cycle 25: factorisation de la logique partagée NonReg sale (gain/perte ACB).
//
// Avant: 3 implémentations identiques de handleNonRegSale dans :
//  - projection.ts (closure sur let)
//  - cashflowAllocation.ts (sur CashflowState)
//  - realEstateMonth.ts (sur RealEstateState)
// Risque: un fix d'invariant ACB dans une copie ne se propage pas aux 2 autres.
//
// Maintenant: 1 fonction pure prenant un mini-state (4 champs).
// Les State Objects qui ont ces 4 champs l'utilisent directement (subtyping TS).

/** Mini-state pour comptabiliser une disposition d'immobilisation (gain OU perte en capital). */
export interface CapitalDispositionState {
    /** Banque de pertes en capital reportées (LIR 111(1)b) — déductibles des gains FUTURS. */
    capitalLossBank: number;
    /** Gains en capital BRUTS accumulés cette année (inclusion 50 % appliquée en aval). */
    accCapitalGainsYear: number;
}

export interface NonRegSaleState extends CapitalDispositionState {
    nonReg: number;
    nonRegACB: number;
}

/**
 * SOURCE UNIQUE de la règle « gain/perte en capital » pour TOUTE disposition d'immobilisation
 * (NonReg, crypto, immeuble locatif). `rawGain` est le gain BRUT SIGNÉ (produit de disposition − ACB) :
 *  - `rawGain < 0` (PERTE) → portée en banque de pertes (`capitalLossBank`), déductible des gains futurs.
 *    Avant [FISC-RE-CAPITAL-LOSS], la vente immo IGNORAIT ce cas (`Math.max(0, …)` → avantage fiscal perdu).
 *  - `rawGain ≥ 0` (GAIN) → nette d'abord la banque de pertes accumulée, le RELIQUAT imposable alimente
 *    `accCapitalGainsYear` (50 % inclus en aval). Un gain ne paie pas d'impôt tant qu'il reste des pertes banquées.
 *
 * Mute le state en place. Retourne le détail (perte banquée / gain imposable net) pour le logging.
 */
export function applyCapitalDisposition<S extends CapitalDispositionState>(
    state: S,
    rawGain: number,
): { bankedLoss: number; taxableGain: number } {
    if (rawGain < 0) {
        const loss = Math.abs(rawGain);
        state.capitalLossBank += loss;
        return { bankedLoss: loss, taxableGain: 0 };
    }
    const usableLoss = Math.min(rawGain, state.capitalLossBank);
    const taxableGain = rawGain - usableLoss;
    state.capitalLossBank -= usableLoss;
    state.accCapitalGainsYear += taxableGain;
    return { bankedLoss: 0, taxableGain };
}

/**
 * Vente de NonReg avec calcul ACB et capital gain/loss.
 *
 * Règles fiscales canadiennes :
 *  - Vente proportionnelle au ratio ACB/balance
 *  - Pertes capitales → bank (peut compenser gains futurs). [PV-11d] NOTE : avec le cap
 *    `min(1, ACB/balance)`, costBasis ≤ sold donc rawGain ≥ 0 TOUJOURS — la branche
 *    `rawGain < 0` est INATTEIGNABLE par construction (l'ACB agrégé modélisé ne dépasse
 *    jamais la valeur marchande). Gardée en défense en profondeur si un appelant futur
 *    injecte un état ACB > balance (import courtier réel avec perte latente).
 *  - Gains capitaux → après application de la bank, accumulés pour avril
 *
 * Mute le state en place. Retourne le montant vendu (peut être < amount si
 * le solde est insuffisant).
 */
export function handleNonRegSale<S extends NonRegSaleState>(state: S, amount: number): number {
    const sold = Math.min(state.nonReg, amount);
    if (sold > 0) {
        const proportion = state.nonRegACB > 0 && state.nonReg > 0
            ? Math.min(1, state.nonRegACB / state.nonReg) : 0;
        const costBasis = sold * proportion;
        state.nonReg -= sold;
        state.nonRegACB = Math.max(0, state.nonRegACB - costBasis);
        applyCapitalDisposition(state, sold - costBasis);
    }
    return sold;
}

export interface CryptoSaleState extends CapitalDispositionState {
    crypto: number;
    /** Coût de base crypto (= valeur de départ par convention) → ne taxer que le gain. */
    cryptoACB: number;
}

/**
 * [PV-7] Vente de crypto avec calcul ACB et capital gain/loss — MÊME logique que
 * `handleNonRegSale` (les cryptoactifs sont des immobilisations imposables comme tout
 * placement non enregistré). Avant, les sites de vente crypto faisaient
 * `accCapitalGainsYear += Math.max(0, gain)` : ils IGNORAIENT la banque de pertes
 * (gains compensables imposés quand même — conservateur) ET JETAIENT les pertes (perte
 * déductible perdue — conservateur aussi, mais incohérent avec NonReg).
 *
 * Mute le state en place. Retourne le montant vendu (≤ amount si solde insuffisant).
 */
export function handleCryptoSale<S extends CryptoSaleState>(state: S, amount: number): number {
    const sold = Math.min(state.crypto, amount);
    if (sold > 0) {
        const proportion = state.cryptoACB > 0 && state.crypto > 0
            ? Math.min(1, state.cryptoACB / state.crypto) : 0;
        const costBasis = sold * proportion;
        state.crypto -= sold;
        state.cryptoACB = Math.max(0, state.cryptoACB - costBasis);
        applyCapitalDisposition(state, sold - costBasis);
    }
    return sold;
}
