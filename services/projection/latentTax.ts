// services/projection/latentTax.ts
// Cycle 17: calcul de l'impôt latent (V40) — dette fiscale hypothétique si
// tous les actifs imposables étaient liquidés aujourd'hui.
// Valeur d'affichage uniquement (impotLatent dans data.push).
// Pattern: Pure Function + injection calculateFiscalReport.

import { CAPITAL_GAINS_INCLUSION_STANDARD, type FiscalReport } from '../../utils/tax';
import { eligiblePensionRealFor } from './pensionCredit';

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
    /**
     * [FISC-LATENT-PENSION-CREDIT] Rente de retraite PRIVÉE (DB/RPA) **mensuelle et NOMINALE** de
     * chaque déclarant, dans le même ordre que `ages` — `retirementBreakdown.perUser[i].privee`,
     * la grandeur exacte que `taxDecember` reçoit déjà. C'est l'assiette du crédit pour revenu de
     * retraite (ARC 31400 / RQ 361), calculée par la source unique `./pensionCredit.ts`.
     *
     * ABSENT ⇒ aucun crédit de pension, c'est-à-dire le comportement d'avant, bit-identique.
     *
     * ⚠️ **Ne PAS y mettre les rentes publiques** (RRQ/PSV) : non admissibles, et le sur-crédit
     * qui en résulte a déjà été corrigé une fois dans ce moteur (~250-680 $/an/personne).
     */
    dbPensionPerUserMonthly?: ReadonlyArray<number | undefined>;
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
        dbPensionPerUserMonthly,
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
     * ⚠️ [FISC-LATENT-PENSION-CREDIT] `eligiblePensionIncome` porte désormais la moitié DB de
     * l'assiette, et SEULEMENT elle — via la source unique `eligiblePensionRealFor`, extraite de la
     * closure de `taxDecember` par ce lot. L'effet sur l'impôt latent **change de signe avec le
     * revenu**, ce qu'aucun montant unique ne résume (mesuré, retraité seul, REER 400 k$ /
     * non-enr. 200 k$ dont 120 k$ d'ACB) :
     *   · revenu de base 12 k$ ou 24 k$ → **−250,50 $ de dette latente** : l'impôt de base est déjà
     *     nul, le crédit fédéral (non testé au revenu) y est PERDU et ne sert qu'à la liquidation ;
     *   · revenu de base 40 k$ ou 70 k$ → **+280 $** (assiette ≥ 2 000 $), **+428 $** (≥ 3 058 $) :
     *     le montant québécois de la ligne 361, lui, est testé au revenu — il survit sur la base et
     *     est écrasé par la liquidation, donc la bande incrémentale le facture.
     *
     * ⚠️ La moitié FERR (retraits ≥ 72 ans) est **volontairement absente**, et la raison est
     * STRUCTURELLE, pas un oubli : la seule grandeur disponible est `accRetraitsReerYear`, un
     * accumulateur ANNÉE-À-DATE remis à zéro chaque janvier. L'impôt latent se calcule à CHAQUE
     * mois : le nourrir d'un cumul à date rendrait une valeur d'écran dépendante du MOIS CALENDRIER
     * de lancement de la simulation — le défaut exact que `[ESTATE-NPV-07]` a mesuré à 210 997 $
     * d'amplitude sur son voisin. Elle est routée avec sa mesure plutôt que devinée.
     * ⚠️ Le plafond du crédit est atteint dès **3 058 $/an** d'assiette (ligne 361 QC ; 2 000 $ au
     * fédéral) : une rente DB de 255 $/mois suffit à le saturer, donc la moitié absente ne change
     * rien pour un ménage qui touche une vraie rente d'employeur.
     */
    const dbAnnuelReel = (i: number): number => {
        const v = dbPensionPerUserMonthly?.[i];
        return Number.isFinite(v) ? ((v as number) * 12) / inflationFactor : 0;
    };
    const impotSurNDeclarations = (revenuParDeclarant: number): number => {
        let total = 0;
        for (let i = 0; i < activeUsersCount; i++) {
            const ageOpts = ages
                ? {
                    age: ages[i],
                    hasSpouse: activeUsersCount > 1,
                    // 3e argument à ZÉRO = la moitié FERR, absente pour la raison ci-dessus.
                    eligiblePensionIncome: eligiblePensionRealFor(ages[i], dbAnnuelReel(i), 0),
                }
                : undefined;
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
