// utils/salary.ts
// Conversion de salaire ANNUEL (ce que l'utilisateur saisit dans certains champs / scans de paie)
// vers MENSUEL, la convention CANONIQUE du store (config.users[].grossSalary/netSalary sont mensuels
// partout : Budget, FutureProjection, Retirement, moteur fiscal qui ré-annualise ×12, personas…).
//
// Bug corrigé 2026-05-29 : 3 chemins de saisie (Onboarding, PayslipUploadCard, TaxCenter) stockaient
// de l'ANNUEL → le moteur ré-annualisait (×12) → revenu ~12× trop haut pour ces utilisateurs.

/** Convertit un salaire annuel en mensuel (arrondi). 0/négatif/NaN → 0. */
export function annualSalaryToMonthly(annual: number): number {
    if (!Number.isFinite(annual) || annual <= 0) return 0;
    return Math.round(annual / 12);
}
