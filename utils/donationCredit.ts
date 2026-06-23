// utils/donationCredit.ts
//
// [FA-6] Crédit d'impôt NON REMBOURSABLE pour dons de bienfaisance, cumulatif fédéral + Québec,
// par PALIERS. Source unique : docs/FISCAL_REFERENCE.md §10 (ARC P113 / ligne 34900 · Revenu
// Québec ligne 395 · CFFP). Année d'imposition 2025.
//
// Remplace l'ancien taux PLAT 33 % (qui sous-créditait, surtout au-delà de 200 $).
//
// Limites assumées (documentées dans FISCAL_REFERENCE §10, no-fake-data) :
//  - majoration top-bracket (33 % féd / 25,75 % QC sur la portion appariée au revenu en tranche
//    max) NON modélisée → crédit légèrement SOUS-estimé pour un très haut revenu (conservateur) ;
//  - plafond 75 % du revenu net (féd) NON appliqué (dons modélisés petits vs revenu) ;
//  - don de titres cotés en nature (inclusion du gain en capital 0 %) NON modélisé — `CharitableGoal`
//    ne suit aucune base de coût ni valeur marchande des titres.

/** Plafond du 1er palier (taux réduit), en dollars — fédéral ET Québec. */
export const DONATION_FIRST_TIER_CEILING = 200;

/** Taux du crédit par paliers (féd + QC), cf FISCAL_REFERENCE §10. */
export const DONATION_CREDIT_RATES = {
    fed: { first: 0.15, excess: 0.29 },
    qc: { first: 0.20, excess: 0.24 },
} as const;

/**
 * Crédit d'impôt total (fédéral + québécois, en dollars) pour un don annuel, PAR contribuable.
 * Effectif 35 % sur les 1ers 200 $, 53 % au-delà. Entrées non finies (NaN, Infinity), négatives
 * ou `undefined` → 0 (jamais de NaN propagé dans le bucket d'impôt).
 */
export function computeDonationCredit(annualDonation: number): number {
    const don = Number.isFinite(annualDonation) ? Math.max(0, annualDonation) : 0;
    if (don <= 0) return 0;
    const first = Math.min(don, DONATION_FIRST_TIER_CEILING);
    const excess = Math.max(0, don - DONATION_FIRST_TIER_CEILING);
    const fed = DONATION_CREDIT_RATES.fed.first * first + DONATION_CREDIT_RATES.fed.excess * excess;
    const qc = DONATION_CREDIT_RATES.qc.first * first + DONATION_CREDIT_RATES.qc.excess * excess;
    return fed + qc;
}
