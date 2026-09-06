// services/projection/taxApril.ts
// Cycle 23 split (depuis taxCycle.ts): régularisation fiscale du mois d'avril.
// Cycle 8 (origine): bien borné — s'exécute uniquement en avril (currentMonthIndex === 3).
// Mutations: liquid, nonReg, nonRegACB, taxPreviousYear (reset), log.

import { formatCAD } from '../../utils/format';

// [FUTUR-DAILY-EVENTS] Échéance de la régularisation annuelle : 30 avril (date limite de
// paiement ARC/Revenu Québec — cf. FISCAL_REFERENCE et la cadence `monthEnd` du ledger
// quotidien, documentée « le 30 avril pour la régularisation annuelle »).
const TAX_DUE_DAY = 30;

interface AprilSettlementResult {
    /** Total payé (positif) ou remboursé (négatif). 0 si rien à régler. */
    fluxImpots: number;
    taxPaidRevenu: number;
    taxPaidGains: number;
    taxPaidDivers: number;
    taxPaidREER: number;
    /** [ENG-APRIL-REFUND-NONREG-UNPUBLISHED] Part du remboursement RÉINVESTIE au non-enregistré
     *  (0 si aucun remboursement de salaire). L'appelant DOIT la publier en `contribNonReg` :
     *  sans ça, le solde du non-enregistré bouge sans qu'aucun flux ne l'explique — mesuré
     *  29 796,22 $ au mois 123, en mode déterministe. */
    reinvestedNonReg: number;
    /** Nouveau bucket taxPreviousYear après reset (toujours 0/0/0/0/0). */
    newTaxPreviousYear: { revenu: number; gains: number; divers: number; reer: number; donCredit: number };
}

export interface AprilSettlementMutator {
    subtractLiquid: (amount: number) => void;     // liquid -= fluxImpots
    addNonReg: (amount: number) => void;          // nonReg += refund
    addNonRegACB: (amount: number) => void;       // nonRegACB += refund
    logFlow: (msg: string, day?: number) => void;
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
    taxPreviousYear: { revenu: number; gains: number; divers: number; reer: number; donCredit: number },
    state: AprilSettlementMutator,
): AprilSettlementResult {
    if (currentMonthIndex !== 3 || m === 0) {
        return {
            fluxImpots: 0,
            taxPaidRevenu: 0,
            taxPaidGains: 0,
            taxPaidDivers: 0,
            taxPaidREER: 0,
            reinvestedNonReg: 0,
            newTaxPreviousYear: taxPreviousYear,
        };
    }

    const taxPaidRevenu = taxPreviousYear.revenu;
    const taxPaidGains = taxPreviousYear.gains;
    const taxPaidDivers = taxPreviousYear.divers;
    const taxPaidREER = taxPreviousYear.reer;
    const fluxImpots = taxPaidRevenu + taxPaidGains + taxPaidDivers + taxPaidREER;
    /** [ENG-APRIL-REFUND-NONREG-UNPUBLISHED] Part du remboursement RÉINVESTIE au non-enregistré
     *  (0 si aucun remboursement de salaire). L'appelant la publie en `contribNonReg`. */
    let reinvestedNonReg = 0;

    if (fluxImpots !== 0) {
        state.subtractLiquid(fluxImpots);
        if (fluxImpots < 0) {
            state.logFlow(`💸 Remboursement d'impôt: +${formatCAD(Math.abs(fluxImpots))}`, TAX_DUE_DAY);
            // Le remboursement de salaire (excédent retenu) est réinvesti dans nonReg.
            // M-8 (2026-06) : subtractLiquid(fluxImpots) ci-dessus a déjà crédité TOUT le
            // remboursement au liquide ; on retire donc la part réinvestie du liquide, sinon
            // elle était comptée DEUX fois (liquide + nonReg = création d'argent).
            if (taxPaidRevenu < 0) {
                const reinvest = Math.abs(taxPaidRevenu);
                state.addNonReg(reinvest);
                state.addNonRegACB(reinvest);
                state.subtractLiquid(reinvest); // réinvesti → sort du liquide
                // [ENG-APRIL-REFUND-NONREG-UNPUBLISHED] Ce réinvestissement est un TRANSFERT vers le
                // non-enregistré : il doit alimenter le flux publié (`NetTransferNonReg`), comme
                // toute autre entrée dans ce compte. Il ne le faisait pas — MESURÉ 29 796,22 $ au
                // mois 123 (un AVRIL), en mode déterministe, trouvé par la garde de forme-flux.
                // ⚠️ On le REND plutôt que de laisser l'appelant le recalculer : reconstituer
                // `fluxImpots < 0 && taxPaidRevenu < 0` là-bas dupliquerait la condition, et les deux
                // copies divergeraient au premier changement de règle
                // (`PARTAGER-LE-MONTANT-PAS-SES-REFLETS`).
                reinvestedNonReg = reinvest;
            }
        } else {
            state.logFlow(`🏛️ Fisc: Régularisation de ${formatCAD(fluxImpots)} payée.`, TAX_DUE_DAY);
        }
    }

    return {
        fluxImpots,
        taxPaidRevenu,
        taxPaidGains,
        taxPaidDivers,
        taxPaidREER,
        reinvestedNonReg,
        newTaxPreviousYear: { revenu: 0, gains: 0, divers: 0, reer: 0, donCredit: 0 },
    };
}
