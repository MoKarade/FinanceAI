// services/projection/taxCycle.ts
// Cycle 8 split: April tax settlement (régularisation des impôts de l'année passée).
// Bien borné — s'exécute uniquement en avril (currentMonthIndex === 3).
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

/**
 * V21 — OAS Clawback. Calculé en décembre quand retraité 65+.
 * Retourne le clawback annuel à étaler sur l'an suivant (0 si pas applicable).
 *
 * Le seuil OAS est indexé via expenseMultiplier (proxy inflation cumulée).
 */
export function computeOasClawback(
    currentMonthIndex: number,
    m: number,
    isRetired: boolean,
    age: number,
    expenseMultiplier: number,
    incomeRetirementMonthly: number,
    accRetraitsReerYear: number,
    accRentesYear: number,
    psvBasePension: number,
    simInflation: number,
): { clawbackAnnual: number; logMsg?: string } {
    if (currentMonthIndex !== 11 || m === 0 || !isRetired || age < 65) {
        return { clawbackAnnual: 0 };
    }
    const OAS_THRESHOLD = 90997 * expenseMultiplier;
    const annualPensionIncome = (incomeRetirementMonthly * 12) + accRetraitsReerYear + accRentesYear;
    const psvAnnualBase = psvBasePension * 12 * Math.pow(1 + simInflation / 100, m / 12);
    if (annualPensionIncome <= OAS_THRESHOLD) return { clawbackAnnual: 0 };

    const excess = annualPensionIncome - OAS_THRESHOLD;
    const clawback = Math.min(psvAnnualBase, excess * 0.15);
    if (clawback > 1) {
        return {
            clawbackAnnual: clawback,
            logMsg: `⚠️ PSV Clawback prévu: -${Math.round(clawback).toLocaleString('fr-CA')}$/an`,
        };
    }
    return { clawbackAnnual: clawback };
}

/**
 * V31 — Tax-Loss Harvesting actif en décembre.
 * Si le rendement Non-Reg de l'année est négatif, on vend 50% pour cristalliser
 * la perte → banque de pertes capitales (capitalLossBank) + ACB ajusté.
 *
 * Retourne {harvestedLoss, acbDelta, log}. Caller applique les mutations.
 */
export function processTaxLossHarvesting(
    currentMonthIndex: number,
    m: number,
    nonReg: number,
    nonRegACB: number,
    currentNonRegRate: number,
): { harvestedLoss: number; acbDelta: number; logMsg?: string } {
    if (currentMonthIndex !== 11 || m === 0) return { harvestedLoss: 0, acbDelta: 0 };
    if (currentNonRegRate >= 0 || nonReg <= 0) return { harvestedLoss: 0, acbDelta: 0 };

    const fakeSell = nonReg * 0.50;
    const dropRate = Math.abs(currentNonRegRate) / 100;
    const harvestedLoss = fakeSell * dropRate;

    const proportion = nonRegACB > 0 && nonReg > 0 ? Math.min(1, nonRegACB / nonReg) : 0;
    const acbDelta = -(fakeSell * proportion) + (fakeSell * (1 - dropRate));

    return {
        harvestedLoss,
        acbDelta,
        logMsg: `🛡️ Perte Cristallisée (TLH): +${Math.round(harvestedLoss).toLocaleString('fr-CA')}$ (Banque) | ACB ajusté à la baisse`,
    };
}

/**
 * V22 — Remplacement véhicule automatique (cyclique, tous les 10 ans).
 * Indépendant du conteneur VehicleReplacement[] (qui est plus granulaire).
 *
 * Retourne {cost, log} si remplacement déclenché ce mois.
 */
export function processAutoVehicleReplacement(
    m: number,
    monthsSinceLast: number,
    vehicleReplacementEnabled: boolean | undefined,
    simInflation: number,
): { cost: number; resetCounter: boolean; logMsg?: string } {
    if (!vehicleReplacementEnabled || m === 0 || monthsSinceLast < 120) {
        return { cost: 0, resetCounter: false };
    }
    const vehicleCost = 35000 * Math.pow(1 + simInflation / 100, m / 12);
    return {
        cost: vehicleCost,
        resetCounter: true,
        logMsg: `🚗 Remplacement véhicule: -${Math.round(vehicleCost).toLocaleString('fr-CA')}$`,
    };
}
