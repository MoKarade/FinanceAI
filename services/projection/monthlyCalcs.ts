// services/projection/monthlyCalcs.ts
// Cycle 29 split: calcul mensuel Pure Function extrait de la boucle principale.
//
//  1. computeEffectiveExpenseInflation — inflation réelle des dépenses (CPI par
//     poste ou inflation uniforme) avec bonus santé 75+ ans.
//     V31 (Guyton-Klinger) + D2.9 (inflation différenciée).
//
//  (computeMonthlyWithholding — provision salariale T1213 — RETIRÉ 2026-06-26 : vestigial,
//   sa sortie était écrasée par l'override de décembre avant tout règlement. Cf. FISC-SRCDED-NOOP.)

// ──────────────────────────────────────────────────────────────────────────────
// 1. Inflation des dépenses
// ──────────────────────────────────────────────────────────────────────────────

interface ExpenseInflationConfig {
    usePerCategoryInflation?: boolean;
    inflationHousing?: number;
    inflationFood?: number;
    inflationTransport?: number;
    inflationHealth?: number;
    inflationLeisure?: number;
    inflationOther?: number;
}

/**
 * Retourne l'inflation effective des dépenses pour le mois courant.
 * Caller: `if (!guytonKlinger_freezeInflation) expenseMultiplier *= Math.pow(1 + result/100, 1/12)`
 */
export function computeEffectiveExpenseInflation(
    age: number,
    isRetired: boolean,
    currentInflation: number,
    config: Readonly<ExpenseInflationConfig>,
): number {
    // Bonus santé progressif à partir de 75 ans (max 2.5%)
    const healthInflationBonus = (isRetired && age >= 75) ? Math.min(2.5, (age - 75) * 0.25) : 0;

    if (config.usePerCategoryInflation) {
        // Pondérations CPI 2023: Logement 30%, Alim 17%, Transport 15%, Santé 5%, Loisirs 6%, Autres 27%.
        const wHousing = 0.30, wFood = 0.17, wTransport = 0.15, wHealth = 0.05, wLeisure = 0.06, wOther = 0.27;
        const iHousing  = config.inflationHousing   ?? 4.0;
        const iFood     = config.inflationFood       ?? 3.5;
        const iTransp   = config.inflationTransport  ?? 2.5;
        const iHealthB  = (config.inflationHealth    ?? 4.5) + healthInflationBonus;
        const iLeisure  = config.inflationLeisure    ?? 1.5;
        const iOther    = config.inflationOther      ?? 2.0;
        return wHousing * iHousing + wFood * iFood + wTransport * iTransp + wHealth * iHealthB + wLeisure * iLeisure + wOther * iOther;
    }

    return currentInflation + healthInflationBonus;
}
