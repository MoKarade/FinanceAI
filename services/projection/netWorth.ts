// services/projection/netWorth.ts
// Source UNIQUE de la formule du patrimoine net (money-critical, 2026-06-16).
//
// Pourquoi un helper : la formule était recopiée à 4 endroits (projection.ts ×3 pour
// rawNetWorth/prevNW + estateCalculation.ts pour finalRawNetWorth) et une copie OUBLIAIT
// `activeDebtsTotal` → le « Patrimoine projeté » de la succession divergeait du graphe de
// la valeur du solde des dettes. Un seul point de vérité élimine cette classe de bugs.
//
// Convention : `realEstateEquity` est DÉJÀ net d'hypothèque (currentValue − mortgage) → on
// ne re-soustrait PAS mortgageBalance. On soustrait les dettes NON déjà nettées dans un actif :
//   • liquidDebt          — découvert non couvert porté en dette
//   • smithManoeuvreDebt  — HELOC du levier Smith (l'actif réinvesti est compté dans nonReg)
//   • activeDebtsTotal    — prêts/cartes/auto préexistants

export interface NetWorthParts {
    liquid: number;
    celi: number;
    celiapp: number;
    reer: number;
    nonReg: number;
    crypto: number;
    reee: number;
    realEstateEquity: number;
    liquidDebt: number;
    smithManoeuvreDebt: number;
    activeDebtsTotal: number;
}

/**
 * Patrimoine net = Σ(actifs) − Σ(dettes non nettées). Source unique appelée par le moteur
 * mensuel (rawNetWorth + prevNW) ET la succession (finalRawNetWorth) → jamais de dérive.
 */
export function computeRawNetWorth(p: NetWorthParts): number {
    return p.liquid + p.celi + p.celiapp + p.reer + p.nonReg + p.crypto + p.reee + p.realEstateEquity
        - p.liquidDebt - p.smithManoeuvreDebt - p.activeDebtsTotal;
}
