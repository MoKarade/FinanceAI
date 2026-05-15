// services/projection/taxApril.ts
// Cycle 23 split (depuis taxCycle.ts): régularisation fiscale du mois d'avril.
// Cycle 8 (origine): bien borné — s'exécute uniquement en avril (currentMonthIndex === 3).
// Mutations: liquid, nonReg, nonRegACB, taxPreviousYear (reset), log.

export interface AprilSettlementResult {
    /** Total payé (positif) ou remboursé (négatif). 0 si rien à régler. */
    fluxImpots: number;
    taxPaidRevenu: number;
    taxPaidGains: number;
    taxPaidDivers: number;
    taxPaidREER: number;
    /** Nouveau bucket taxPreviousYear après reset (toujours 0/0/0/0). */
    newTaxPreviousYear: { revenu: number; gains: number; divers: number; reer: number };
}

export interface AprilSettlementMutator {
    subtractLiquid: (amount: number) => void;     // liquid -= fluxImpots
    addNonReg: (amount: number) => void;          // nonReg += refund
    addNonRegACB: (amount: number) => void;       // nonRegACB += refund
    logFlow: (msg: string) => void;
}

/**
 * Règlement fiscal du mois d'avril.
 * Si nous sommes en avril (currentMonthIndex === 3) et qu'il y a un solde de
 * l'année passée, on règle. Sinon retourne 0.
 *
 * Cas spécial: si le total est négatif (remboursement), la partie venant du
 * salaire (taxPaidRevenu) est réinjectée dans nonReg comme placement.
 */
export function processAprilSettlement(
    currentMonthIndex: number,
    m: number,
    taxPreviousYear: { revenu: number; gains: number; divers: number; reer: number },
    state: AprilSettlementMutator,
): AprilSettlementResult {
    if (currentMonthIndex !== 3 || m === 0) {
        return {
            fluxImpots: 0,
            taxPaidRevenu: 0,
            taxPaidGains: 0,
            taxPaidDivers: 0,
            taxPaidREER: 0,
            newTaxPreviousYear: taxPreviousYear,
        };
    }

    const taxPaidRevenu = taxPreviousYear.revenu;
    const taxPaidGains = taxPreviousYear.gains;
    const taxPaidDivers = taxPreviousYear.divers;
    const taxPaidREER = taxPreviousYear.reer;
    const fluxImpots = taxPaidRevenu + taxPaidGains + taxPaidDivers + taxPaidREER;

    if (fluxImpots !== 0) {
        state.subtractLiquid(fluxImpots);
        if (fluxImpots < 0) {
            state.logFlow(`💸 Remboursement d'impôt: +${Math.round(Math.abs(fluxImpots)).toLocaleString('fr-CA')}$`);
            // Le remboursement de salaire (excédent retenu) est réinvesti
            if (taxPaidRevenu < 0) {
                state.addNonReg(Math.abs(taxPaidRevenu));
                state.addNonRegACB(Math.abs(taxPaidRevenu));
            }
        } else {
            state.logFlow(`🏛️ Fisc: Régularisation de ${Math.round(fluxImpots).toLocaleString()}$ payée.`);
        }
    }

    return {
        fluxImpots,
        taxPaidRevenu,
        taxPaidGains,
        taxPaidDivers,
        taxPaidREER,
        newTaxPreviousYear: { revenu: 0, gains: 0, divers: 0, reer: 0 },
    };
}
