// services/projection/latentTax.ts
// Cycle 17: calcul de l'impôt latent (V40) — dette fiscale hypothétique si
// tous les actifs imposables étaient liquidés aujourd'hui.
// Valeur d'affichage uniquement (impotLatent dans data.push).
// Pattern: Pure Function + injection calculateFiscalReport.

import { CAPITAL_GAINS_INCLUSION_STANDARD, type FiscalReport } from '../../utils/tax';

type FiscalFn = (
    grossIncome: number,
    rrspContrib: number,
    fhsaContrib: number,
    year: number,
    skipBreakdown: boolean,
    // [FISC-BANDES-FRERES-SANS-AGEOPTS] Ce paramètre était typé `undefined` — le module ne POUVAIT
    // donc pas transmettre l'âge, et l'impôt latent ignorait les crédits d'âge (65+) et de revenu
    // de retraite. Mesuré sur un retraité seul (REER 400 k$, non-enr. 200 k$ / ACB 120 k$) :
    // **1 854 $ d'impôt latent manquant** pour le seul crédit d'ÂGE — donc un patrimoine net
    // d'impôt affiché d'autant trop haut. Le crédit réduit la facture de BASE mais pas celle de la
    // liquidation totale (il est récupéré aux revenus élevés) : l'écart entre les deux, qui EST
    // l'impôt latent, s'en trouve rétréci.
    ageOpts?: { age?: number; eligiblePensionIncome?: number; hasSpouse?: boolean },
    employmentIncome?: number,
    realDeflator?: number,
) => FiscalReport;

export interface LatentTaxCtx {
    m: number;
    loopYear: number;
    simInflation: number;
    simSalaryGrowth: number;
    isRetired: boolean;
    activeUsersCount: number;
    grossMarcBaseAnnual: number;
    grossAnnaBaseAnnual: number;
    accRentesYear: number;
    incomeRetirement: number;
    reer: number;
    nonReg: number;
    nonRegACB: number;
    crypto: number;
    cryptoACB: number;
    /** FISC-LATENT-RE — gain latent BRUT des immeubles LOCATIFS non vendus (RP exclue), Σ max(0, valeur−ACB). */
    realEstateLatentGain: number;
    enableMonteCarlo: boolean;
    /**
     * [FISC-BANDES-FRERES-SANS-AGEOPTS] Âge PROJETÉ de chaque déclarant, dans l'ordre des filers —
     * même convention que `taxDecember` (`ages = [ctx.age, ctx.ageSpouse]`), empruntée au voisin
     * plutôt que réinventée. ABSENT ⇒ comportement d'avant, bit-identique (aucun crédit d'âge) :
     * les fixtures qui ne parlent pas d'âge n'ont rien à changer.
     *
     * ⚠️ Passer l'âge RÉEL suffit et se limite tout seul — `calculateAgeAndPensionCredits` applique
     * le seuil de 65 ans lui-même. Mesuré : à 60 ans l'écart est de 0,00 $. Le ticket parlait de
     * « contextes par définition 65+ » ; c'est faux ici (une retraite peut commencer à 55 ans), et
     * c'est justement pour ça qu'on transmet la VÉRITÉ au lieu d'une hypothèse.
     */
    ages?: ReadonlyArray<number | undefined>;
}

/**
 * Retourne l'impôt latent estimé (négatif = obligation fiscale future).
 * Méthode: compare la facture fiscale à taux courant vs liquidation totale.
 */
export function computeLatentTax(
    ctx: Readonly<LatentTaxCtx>,
    calculateFiscalReport: FiscalFn,
): number {
    const {
        m, loopYear, simInflation, simSalaryGrowth, isRetired, activeUsersCount,
        grossMarcBaseAnnual, grossAnnaBaseAnnual, accRentesYear, incomeRetirement,
        reer, nonReg, nonRegACB, crypto, cryptoACB, realEstateLatentGain, enableMonteCarlo, ages,
    } = ctx;

    const yearsElapsed = Math.floor(m / 12);
    const inflationFactor = Math.pow(1 + simInflation / 100, yearsElapsed);

    const currentGrossBase = !isRetired
        ? (grossMarcBaseAnnual + grossAnnaBaseAnnual) * Math.pow(1 + simSalaryGrowth / 100, yearsElapsed)
        : (accRentesYear + incomeRetirement * 12);

    // [FISC-BRACKET-REALINDEX] revenu déflaté en $ RÉELS → le barème doit suivre (realDeflator),
    // sinon paliers ×1,02^Δ nominaux sur revenu réel = double indexation (latent sous-évalué ~35 % à 30 ans).
    const currentGrossPerUser = (currentGrossBase / activeUsersCount) / inflationFactor;

    /**
     * [FISC-BANDES-FRERES-SANS-AGEOPTS] Une déclaration PAR déclarant, avec SON âge, au lieu d'une
     * seule multipliée par leur nombre. Sans `ages`, les N déclarations sont identiques et la somme
     * vaut exactement l'ancien produit — rétrocompatibilité bit-identique, pas « à peu près ».
     *
     * ⚠️ `hasSpouse` se transmet AVEC l'âge, jamais après : à défaut, `AgeCreditOptions` traite
     * l'absence comme « vit seul » et ajoute le montant québécois correspondant — un couple serait
     * sur-crédité (mesuré : −1 549 $ avec conjoint contre −1 854 $ seul, soit 305 $ d'écart par
     * déclarant). Âge et statut conjugal sont une PAIRE (`CABLER-UNE-ANNEE-C-EST-CABLER-UNE-PAIRE`).
     *
     * ⚠️ `eligiblePensionIncome` n'est PAS transmis : sa bonne assiette (rente DB dès 65 ans +
     * retraits FERR dès 72) vit dans `taxDecember` et n'est pas disponible ici. Y mettre les rentes
     * publiques (RRQ/PSV) serait un SUR-crédit — c'est exactement le défaut que le commentaire de
     * `eligiblePensionFor` raconte avoir corrigé. Mesuré : 280 $ de plus par déclarant. Routé en
     * `[FISC-LATENT-PENSION-CREDIT]` plutôt que deviné.
     */
    const impotSurNDeclarations = (revenuParDeclarant: number): number => {
        let total = 0;
        for (let i = 0; i < activeUsersCount; i++) {
            const ageOpts = ages ? { age: ages[i], hasSpouse: activeUsersCount > 1 } : undefined;
            total += calculateFiscalReport(revenuParDeclarant, 0, 0, loopYear, enableMonteCarlo,
                ageOpts, undefined, inflationFactor).totalTax;
        }
        return total * inflationFactor;
    };

    const baseTaxAmount = impotSurNDeclarations(currentGrossPerUser);

    const latentCapitalGain = Math.max(0, nonReg - nonRegACB);
    const taxableLatentGain = latentCapitalGain * CAPITAL_GAINS_INCLUSION_STANDARD;

    // M-4 : seul le GAIN crypto (valeur − coût de base) est imposable, pas la valeur entière.
    const taxableCryptoLatent = Math.max(0, crypto - cryptoACB) * CAPITAL_GAINS_INCLUSION_STANDARD;
    // FISC-LATENT-RE : gain latent des immeubles LOCATIFS (déjà brut Σmax(0,…) à la source ; garde NaN globale).
    const taxableRealEstateLatent = Math.max(0, realEstateLatentGain) * CAPITAL_GAINS_INCLUSION_STANDARD;
    const totalTaxableLatent = reer + taxableCryptoLatent + taxableLatentGain + taxableRealEstateLatent;
    const totalLatentPerUser = ((currentGrossBase + totalTaxableLatent) / activeUsersCount) / inflationFactor;
    const fullLiquidationTax = impotSurNDeclarations(totalLatentPerUser);

    return -(fullLiquidationTax - baseTaxAmount);
}
