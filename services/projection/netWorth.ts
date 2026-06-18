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
 * [HARDEN-NETWORTH-EXHAUSTIVE] Signe de CHAQUE terme du patrimoine net : +1 = actif, −1 = dette.
 * Le type `Record<keyof NetWorthParts, …>` FORCE le compilateur à classer TOUT champ de `NetWorthParts` :
 * ajouter un champ à l'interface sans lui donner un signe ici CASSE le typecheck. Couplé au test croisé
 * (`tests/services/netWorth.test.ts` : « formule littérale == Σ signe×valeur »), un nouveau champ ajouté à
 * l'interface + au sign-map mais OUBLIÉ dans la formule littérale fait ÉCHOUER le test → la classe de bug
 * MONEY-PHANTOM (terme d'actif/dette oublié = patrimoine faux, bug Marc « -193 k$ » 2026-06-16) devient
 * STRUCTURELLEMENT impossible. ⚠️ La formule littérale ci-dessous reste la SOURCE d'exécution (hot-path
 * du moteur mensuel × Monte-Carlo, inchangée et prouvée) — le sign-map n'est qu'un filet compile-time + test.
 */
export const NET_WORTH_SIGN: Record<keyof NetWorthParts, 1 | -1> = {
    liquid: 1, celi: 1, celiapp: 1, reer: 1, nonReg: 1, crypto: 1, reee: 1, realEstateEquity: 1,
    liquidDebt: -1, smithManoeuvreDebt: -1, activeDebtsTotal: -1,
};

/**
 * Patrimoine net = Σ(actifs) − Σ(dettes non nettées). Source unique appelée par le moteur
 * mensuel (rawNetWorth + prevNW) ET la succession (finalRawNetWorth) → jamais de dérive.
 * Tout terme ajouté ici doit l'être dans `NET_WORTH_SIGN` (garde d'exhaustivité, voir ci-dessus).
 */
export function computeRawNetWorth(p: NetWorthParts): number {
    return p.liquid + p.celi + p.celiapp + p.reer + p.nonReg + p.crypto + p.reee + p.realEstateEquity
        - p.liquidDebt - p.smithManoeuvreDebt - p.activeDebtsTotal;
}
