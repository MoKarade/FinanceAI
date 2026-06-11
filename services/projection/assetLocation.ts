// services/projection/assetLocation.ts
// Asset Location Optimizer — recommande où placer chaque classe d'actif
// (CELI vs REER vs NonReg) pour maximiser le rendement après impôts.
//
// Règle d'or canadienne (Canadian Couch Potato + PWL Capital):
//   - Obligations / GIC      → REER  (intérêts 100% imposables au marginal)
//   - Actions US (VOO/SPY)   → REER  (treaty exempte la retenue 15%)
//   - Actions CAD (XIC/VCN)  → CELI ou NonReg (dividende éligible favorable)
//   - Actions internationales→ NonReg (FTC récupère 15%, gain capital 50% taxé)
//   - Croissance pure (small) → CELI (gain non-imposable)
//   - REIT / dividendes high → REER (sinon taxé comme intérêt)
//
// L'optimizer estime le gain net annuel d'une mauvaise vs bonne allocation
// pour un patrimoine donné, sur la base du taux marginal de l'utilisateur.

import { getMarginalRate, US_DIVIDEND_WITHHOLDING_RATE } from '../../utils/tax';

export type AssetClass =
    | 'bonds'              // obligations, GIC, fonds monétaire
    | 'us-equity'          // VOO, SPY, QQQ, IVV
    | 'ca-equity'          // XIC, VCN, XIU
    | 'international'      // VXUS, XEF, VEE
    | 'growth-small'       // small-cap, croissance
    | 'reit'               // REIT canadien
    | 'cash';              // épargne haut-intérêt

export type AccountType = 'CELI' | 'REER' | 'NonReg';

export interface AssetLocationInput {
    annualGrossIncome: number;
    year?: number;
    holdings: Array<{
        assetClass: AssetClass;
        amount: number;
        currentAccount: AccountType;
    }>;
}

export interface AssetLocationRecommendation {
    holdingIndex: number;
    assetClass: AssetClass;
    amount: number;
    currentAccount: AccountType;
    recommendedAccount: AccountType;
    annualLossIfUnchanged: number; // $ d'écart annuel par rapport à l'allocation optimale
    rationale: string;
}

export interface AssetLocationResult {
    totalAnnualLoss: number;
    recommendations: AssetLocationRecommendation[];
    summary: string;
}

// Yields/returns estimés par classe (historiques long terme — hypothèses de modèle).
// FA-8 (2026-06-11) — la retenue étrangère 15 % est SOURCÉE : Convention fiscale
// Canada–États-Unis (1980), art. X(2)b) (15 % sur dividendes de portefeuille) ; REER/FERR
// exemptés (art. XXI — régimes de pension), CELI NON exempté ; en NonReg, récupérable via le
// crédit pour impôt étranger (FTC). Constante US_DIVIDEND_WITHHOLDING_RATE (utils/tax.ts),
// réf FISCAL_REFERENCE §3. Pour `international`, les retenues varient par pays : le taux US
// sert d'approximation standard (même constante, hypothèse de modèle).
const ASSET_PROFILE: Record<AssetClass, { yield: number; growth: number; foreignWithholding: number }> = {
    'bonds':         { yield: 4.0, growth: 0.0, foreignWithholding: 0 },
    'us-equity':     { yield: 1.5, growth: 6.0, foreignWithholding: US_DIVIDEND_WITHHOLDING_RATE },
    'ca-equity':     { yield: 2.5, growth: 5.0, foreignWithholding: 0 },
    'international': { yield: 2.5, growth: 6.0, foreignWithholding: US_DIVIDEND_WITHHOLDING_RATE }, // récupérable via FTC en NonReg
    'growth-small':  { yield: 0.5, growth: 8.0, foreignWithholding: 0 },
    'reit':          { yield: 5.0, growth: 2.0, foreignWithholding: 0 },
    'cash':          { yield: 3.5, growth: 0.0, foreignWithholding: 0 },
};

/**
 * Allocation idéale par classe d'actif (consensus canadien).
 */
function idealAccount(assetClass: AssetClass): AccountType {
    switch (assetClass) {
        case 'bonds':         return 'REER';     // intérêt 100% imposable, REER différé
        case 'cash':          return 'REER';     // idem (mais souvent garde en NonReg liquide)
        case 'us-equity':     return 'REER';     // treaty exempte le 15% US withholding
        case 'ca-equity':     return 'CELI';     // gain non-imposable, dividende éligible favorable hors CELI
        case 'international': return 'NonReg';   // FTC récupère le foreign withholding
        case 'growth-small':  return 'CELI';     // gain en capital exempté de gains
        case 'reit':          return 'REER';     // distributions ROC/intérêt taxées comme revenu
    }
}

/**
 * Estime la perte annuelle (en $) d'avoir mal placé un actif.
 * Approximation simplifiée: différence entre rendement net dans le mauvais
 * compte vs rendement net dans le bon compte.
 */
function annualLoss(
    assetClass: AssetClass,
    amount: number,
    current: AccountType,
    ideal: AccountType,
    marginalRate: number,
): number {
    if (current === ideal) return 0;
    const profile = ASSET_PROFILE[assetClass];
    const yieldDollars = amount * (profile.yield / 100);

    // Perte de yield = différence d'impôt sur le rendement annuel
    const taxRate = (account: AccountType): number => {
        if (account === 'CELI') return 0;
        if (account === 'REER') return 0; // pas d'impôt pendant l'accumulation
        // NonReg: dépend du type de revenu
        if (assetClass === 'ca-equity') return marginalRate * 0.60; // dividende éligible (taux réduit)
        if (assetClass === 'us-equity' || assetClass === 'international') {
            return marginalRate; // dividende étranger = revenu ordinaire
        }
        if (assetClass === 'bonds' || assetClass === 'cash' || assetClass === 'reit') {
            return marginalRate; // intérêt 100% taxé
        }
        return marginalRate * 0.5; // gain en capital
    };

    const taxCurrent = yieldDollars * taxRate(current);
    const taxIdeal = yieldDollars * taxRate(ideal);

    // FIX code-reviewer (HIGH): self-assign retiré, logique clarifiée.
    // Drag US withholding 15% s'applique au CELI uniquement (convention Canada–É.-U. art. XXI :
    // REER exempté, CELI non — cf US_DIVIDEND_WITHHOLDING_RATE). NonReg: récupéré via FTC, négligé.
    let withholdingDrag = 0;
    if (assetClass === 'us-equity' && current === 'CELI') {
        withholdingDrag = yieldDollars * US_DIVIDEND_WITHHOLDING_RATE;
    }

    return Math.max(0, (taxCurrent - taxIdeal) + withholdingDrag);
}

export function optimizeAssetLocation(input: AssetLocationInput): AssetLocationResult {
    const marginalRate = getMarginalRate(input.annualGrossIncome, input.year ?? 2026);

    const recommendations: AssetLocationRecommendation[] = [];
    let totalLoss = 0;

    input.holdings.forEach((h, idx) => {
        const ideal = idealAccount(h.assetClass);
        if (ideal === h.currentAccount) return;

        // FIX agent (HIGH): edge cases bloquants pour AL.
        //  - amount ≤ 0: ignore
        //  - marginalRate inconnu (revenu 0): pas de recommandation (signal honnête)
        if (h.amount <= 0) return;
        if (marginalRate <= 0) return;

        let loss = annualLoss(h.assetClass, h.amount, h.currentAccount, ideal, marginalRate);

        // FIX agent (HIGH): opportunity cost calibré au taux marginal du user.
        // Bonds/cash dans CELI: ratio = (return_equity - return_bonds) * marginalRate
        // ≈ (6% - 4%) * marginalRate, plafonné au gain réel.
        if (h.currentAccount === 'CELI' && (h.assetClass === 'bonds' || h.assetClass === 'cash')) {
            const opportunityCost = h.amount * 0.02 * marginalRate; // 2pp × taux marginal
            loss = Math.max(loss, opportunityCost);
        }

        if (loss < 1) return; // seuil de bruit

        totalLoss += loss;

        const rationales: Record<AssetClass, string> = {
            'bonds':         'Les intérêts sont 100% imposables au taux marginal hors REER',
            'us-equity':     'La convention fiscale CA-US exempte le REER du withholding 15%, pas le CELI',
            'ca-equity':     'Gain non-imposable dans CELI; dividende éligible favorable hors CELI',
            'international': 'Le crédit pour impôt étranger (FTC) récupère le withholding 15% en NonReg, pas dans CELI/REER',
            'growth-small':  'Croissance forte non-imposable dans CELI',
            'reit':          'Distributions REIT taxées comme intérêt — préférer REER pour différer',
            'cash':          'Intérêt 100% imposable hors REER',
        };

        recommendations.push({
            holdingIndex: idx,
            assetClass: h.assetClass,
            amount: h.amount,
            currentAccount: h.currentAccount,
            recommendedAccount: ideal,
            annualLossIfUnchanged: Math.round(loss),
            rationale: rationales[h.assetClass],
        });
    });

    recommendations.sort((a, b) => b.annualLossIfUnchanged - a.annualLossIfUnchanged);

    const summary = totalLoss > 0
        ? `Tu perds environ ${Math.round(totalLoss).toLocaleString('fr-CA')}\$/an d'impôts évitables. Sur 20 ans, c'est ~${Math.round(totalLoss * 20).toLocaleString('fr-CA')}\$ de patrimoine final non capitalisé.`
        : 'Ton allocation par compte est déjà optimale. 🎯';

    return {
        totalAnnualLoss: Math.round(totalLoss),
        recommendations,
        summary,
    };
}
