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

export interface NonRegSaleState {
    nonReg: number;
    nonRegACB: number;
    capitalLossBank: number;
    accCapitalGainsYear: number;
}

/**
 * Vente de NonReg avec calcul ACB et capital gain/loss.
 *
 * Règles fiscales canadiennes :
 *  - Vente proportionnelle au ratio ACB/balance
 *  - Pertes capitales → bank (peut compenser gains futurs)
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
        const rawGain = sold - costBasis;
        if (rawGain < 0) {
            state.capitalLossBank += Math.abs(rawGain);
        } else {
            const usableLoss = Math.min(rawGain, state.capitalLossBank);
            const taxableGain = rawGain - usableLoss;
            state.capitalLossBank -= usableLoss;
            state.accCapitalGainsYear += taxableGain;
        }
    }
    return sold;
}

export interface CryptoSaleState {
    crypto: number;
    /** Coût de base crypto (= valeur de départ par convention) → ne taxer que le gain. */
    cryptoACB: number;
    capitalLossBank: number;
    accCapitalGainsYear: number;
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
        const rawGain = sold - costBasis;
        if (rawGain < 0) {
            state.capitalLossBank += Math.abs(rawGain);
        } else {
            const usableLoss = Math.min(rawGain, state.capitalLossBank);
            const taxableGain = rawGain - usableLoss;
            state.capitalLossBank -= usableLoss;
            state.accCapitalGainsYear += taxableGain;
        }
    }
    return sold;
}
