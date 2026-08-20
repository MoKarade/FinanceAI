// services/projection/w5Effects.ts
// Cycle 7 split: extraction des 6 conteneurs W5.x ajoutés au moteur en cycle 4.
// Chaque effet mute un état partagé via le mutateur W5Mutator (passé par réf).
//
// Pourquoi ce module : tous ces effets sont autonomes par rapport au reste du
// monolithe runScenario — ils lisent du contexte (mois, date, multiplicateur)
// et écrivent dans 4 cibles bien définies (monthlyIncome, monthlyExpenses,
// liquid, taxCurrentYear). Pas de dépendance sur growth/income/shortfall/etc.

import type { InsurancePolicy, VehicleReplacement, MajorRenovation, CharitableGoal, RentalProperty, PrivateBusiness } from '../../types';
import { computeDonationCredit } from '../../utils/donationCredit';

export interface W5Context {
    m: number;
    currentMonthIndex: number;
    currentLoopDate: Date;
    startYear: number;
    startMonth: number;
    expenseMultiplier: number;
}

export interface W5Mutator {
    addExpense: (amount: number) => void;          // monthlyExpenses +=
    addIncome: (amount: number) => void;           // monthlyIncome +=
    subtractLiquid: (amount: number) => void;      // liquid -=
    addTaxRevenu: (amount: number) => void;        // taxCurrentYear.revenu +=
    addTaxGains: (amount: number) => void;         // taxCurrentYear.gains +=
    addTaxDivers: (amount: number) => void;        // taxCurrentYear.divers += (impôt « autres » : SURVIT à
                                                   // l'override 12-mois de `.revenu` en décembre, cf taxDecember)
    addDonationCredit: (amount: number) => void;   // taxCurrentYear.donCredit += (crédit-don POSITIF ; plafonné à
                                                   // l'impôt dû puis appliqué à `divers` en décembre — non remboursable)
    logFlow: (msg: string) => void;
    logLife: (msg: string) => void;
}

export interface W5Containers {
    insurancePolicies: InsurancePolicy[];
    vehicleReplacements: VehicleReplacement[];
    majorRenovations: MajorRenovation[];
    charitableGoals: CharitableGoal[];
    rentalProperties: RentalProperty[];
    privateBusinesses: PrivateBusiness[];
}

/**
 * Applique les 6 effets W5.x sur l'état du mois courant.
 * Doit être appelé une fois par itération mensuelle.
 */
/**
 * [W5-PROXY-NON-SOURCE] Taux d'impôt FORFAITAIRES des flux W5 — **hypothèses de MODÈLE**, pas des
 * règles ARC/RQ. Ancrés et chiffrés dans `docs/FISCAL_REFERENCE.md` §6 « Proxys d'impôt W5 ».
 *
 * Le ticket demandait « nommer ou retirer » ; décision Marc `[W5-TAX-PROXY]` : GARDER le forfait et
 * le documenter. Ils sont donc NOMMÉS et EXPORTÉS — l'UI qui les annonce à l'utilisateur et la garde
 * qui vérifie la doc les IMPORTENT, au lieu de recopier deux chiffres qui dériveraient en silence.
 */
export const RENTAL_NOI_TAX_PROXY = 0.45;
export const CCPC_DIVIDEND_TAX_PROXY = 0.36;

export function applyW5Effects(
    ctx: W5Context,
    containers: W5Containers,
    state: W5Mutator,
): void {
    const { m, currentMonthIndex, currentLoopDate, startYear, startMonth, expenseMultiplier } = ctx;

    // W5.4 — Primes d'assurance mensuelles (vie/invalidité/maladies graves/
    // soins LD/auto/habitation/responsabilité). Cesse à l'expiry pour les
    // polices temporaires.
    let insurancePremiumsMonthly = 0;
    for (const policy of containers.insurancePolicies) {
        if (policy.expiryDate) {
            const expiry = new Date(policy.expiryDate);
            if (currentLoopDate >= expiry) continue;
        }
        insurancePremiumsMonthly += (policy.monthlyPremium || 0);
    }
    if (insurancePremiumsMonthly > 0) {
        state.addExpense(insurancePremiumsMonthly * expenseMultiplier);
    }

    // W5.x — Véhicules cycliques.
    for (const v of containers.vehicleReplacements) {
        const cyclMonths = (v.cyclYears || 8) * 12;
        if (cyclMonths > 0 && m > 0 && m % cyclMonths === 0) {
            const cost = (v.costEstimate || 0) * expenseMultiplier;
            state.subtractLiquid(cost);
            state.logFlow(`🚗 Remplacement véhicule: -${Math.round(cost).toLocaleString('fr-CA')}$`);
        }
    }

    // W5.x — Rénovations majeures planifiées (date unique).
    for (const reno of containers.majorRenovations) {
        if (!reno.date) continue;
        const renoDate = new Date(reno.date);
        const renoMonthIdx = (renoDate.getFullYear() - startYear) * 12 + (renoDate.getMonth() - startMonth);
        if (renoMonthIdx === m) {
            const cost = (reno.cost || 0) * expenseMultiplier;
            state.subtractLiquid(cost);
            state.logLife(`🔨 Rénovation majeure: -${Math.round(cost).toLocaleString('fr-CA')}$ (${reno.description || 'maison'})`);
        }
    }

    // W5.x — Dons charitables annuels.
    for (const charity of containers.charitableGoals) {
        const yearNow = startYear + Math.floor(m / 12);
        if (charity.startYear && yearNow < charity.startYear) continue;
        if (charity.endYear && yearNow > charity.endYear) continue;
        const annual = charity.annualAmount || 0;
        if (annual <= 0) continue;
        state.addExpense((annual / 12) * expenseMultiplier);
        // Crédit fiscal en janvier (annualisé). [FA-6] Crédit NON REMBOURSABLE par paliers (féd+QC,
        // FISCAL_REFERENCE §10) accumulé dans `donCredit` → décembre le PLAFONNE à l'impôt dû puis
        // l'applique à `divers` (qui SURVIT à l'override 12-mois de `.revenu`). Avant FA-6, le crédit
        // allait dans `.revenu`, jeté pour un salarié actif (le don n'avait alors AUCUN bénéfice fiscal).
        // Don de titres en nature : inclusion gain 0 % NON modélisée (pas de base de coût sur
        // CharitableGoal) → l'ancien `addTaxGains(-0,15·don)` (non sourcé) est retiré.
        if (currentMonthIndex === 0) {
            state.addDonationCredit(computeDonationCredit(annual));
        }
    }

    // W5.6 — Immeubles locatifs: NOI lissé.
    let rentalPropertyNoiMonthly = 0;
    for (const rp of containers.rentalProperties) {
        const annualRent = (rp.monthlyRent || 0) * 12 * (1 - (rp.vacancyPct || 0) / 100);
        const annualExpenses = (rp.monthlyExpenses || 0) * 12;
        const noi = annualRent - annualExpenses;
        rentalPropertyNoiMonthly += noi / 12;
    }
    // [NAN-INPUT-HARDENING] `!== 0` laisse passer NaN (`NaN !== 0` = true) → garde l'agrégat (un `noi` NaN
    // corromprait revenu + impôt locatif). (La branche business ci-dessous est déjà sûre : `NaN > 0` = false.)
    if (Number.isFinite(rentalPropertyNoiMonthly) && rentalPropertyNoiMonthly !== 0) {
        state.addIncome(rentalPropertyNoiMonthly);
        // [FA-6] via `addTaxDivers` → l'impôt locatif SURVIT à l'écrasement de `.revenu` en décembre :
        // avant, le revenu locatif d'un bailleur ACTIF n'était PAS imposé (clobberé).
        // ⚠️ Le 0,45 est un PROXY de taux marginal, pas une règle fiscale — hypothèse de MODÈLE
        // désormais ANCRÉE : `docs/FISCAL_REFERENCE.md` §6 « Proxys d'impôt W5 » (décision Marc
        // `[W5-TAX-PROXY]` : garder le forfait, le documenter). Son sens d'erreur est MESURÉ et il
        // CHANGE DE SIGNE selon le revenu (~125-140 k$ selon le NOI — le seuil, le tableau et les
        // bandes du barème vivent dans la doc : ne RIEN recopier ici, un chiffre en commentaire
        // dérive comme un autre. Preuve : le « 145 k$ » qui vivait sur cette ligne, réfuté en revue,
        // a SURVÉCU à sa première correction parce qu'un `git checkout` de mesure l'a restauré).
        // ⚠️ PAS de `/ 12` ici — `rentalPropertyNoiMonthly` est DÉJÀ mensuel (construit `noi / 12`
        // quatre lignes plus haut), et `addTaxDivers` alimente un accumulateur ANNUEL à raison d'un
        // versement par mois. L'ancien `(mensuel × taux) / 12` cumulait donc sur l'année à
        // `mensuel × taux` = 1/12 de l'impôt : MESURÉ bout en bout, 1 125 $/an collectés sur
        // 30 000 $ de NOI au lieu de 13 500 $ — un taux EFFECTIF de 3,75 % pendant que la décision
        // Marc, la doc et l'écran annonçaient 45 %. Le défaut d'unité classique : traiter une
        // grandeur mensuelle comme annuelle parce que la ligne d'à côté divisait par 12.
        state.addTaxDivers(rentalPropertyNoiMonthly * RENTAL_NOI_TAX_PROXY);
    }

    // W5.7 — Entreprise privée (CCPC) : dividendes mensuels.
    let businessDividendMonthly = 0;
    for (const biz of containers.privateBusinesses) {
        if (biz.annualDividend && biz.annualDividend > 0) {
            businessDividendMonthly += (biz.annualDividend * (biz.ownershipPct || 100) / 100) / 12;
        }
    }
    if (businessDividendMonthly > 0) {
        state.addIncome(businessDividendMonthly);
        // [FA-6] via `addTaxDivers` → l'impôt sur dividende CCPC SURVIT à l'écrasement décembre (avant :
        // non imposé en année active).
        // ⚠️ Le 0,36 est un PROXY, ancré dans `docs/FISCAL_REFERENCE.md` §6 « Proxys d'impôt W5 ».
        // ⚠️ Le dépôt sait déjà faire le calcul EXACT : `utils/tax.ts` `calculateDividendTax` applique
        // la majoration (38 % déterminé / 15 % ordinaire) et les deux crédits d'impôt pour dividende,
        // dans le bon ordre vis-à-vis de l'abattement québécois. Ce forfait l'ignore, et MESURÉ il ne
        // vaut que pour un dividende ORDINAIRE à ~100 k$ de revenu : il sur-impose un dividende
        // DÉTERMINÉ de jusqu'à 7 606 $/an sur 30 k$. Remplacement suivi par `[W5-DIVIDENDE-PROXY-VS-MOTEUR]`
        // — hors périmètre ici, la décision Marc était de GARDER le forfait et de le documenter.
        // ⚠️ Même défaut d'unité que le locatif ci-dessus : `businessDividendMonthly` est déjà
        // mensuel, le `/ 12` ramenait le taux effectif à 3 % au lieu de 36 %.
        state.addTaxDivers(businessDividendMonthly * CCPC_DIVIDEND_TAX_PROXY);
    }
}

/**
 * Effets déterministes liés à l'âge: Sandwich generation (boomerang + caregiving)
 * et Snowbird (mois à l'étranger). Aucun tirage stochastique.
 */
export function applyAgeBasedExpenses(
    ctx: { age: number; currentMonthIndex: number; isRetired: boolean; expenseMultiplier: number },
    projection: {
        boomerangSupportMonthly?: number; boomerangStartAge?: number; boomerangDurationMonths?: number;
        caregivingMonthly?: number; caregivingStartAge?: number; caregivingDurationMonths?: number;
        snowbirdEnabled?: boolean; snowbirdMonthsPerYear?: number; snowbirdExtraMonthlyCost?: number;
    },
    state: { addExpense: (n: number) => void },
): void {
    const { age, currentMonthIndex, isRetired, expenseMultiplier } = ctx;

    // W3.5 — Boomerang
    const boomerangAmount = projection.boomerangSupportMonthly || 0;
    const boomerangStart = projection.boomerangStartAge ?? -1;
    const boomerangDuration = projection.boomerangDurationMonths ?? 0;
    if (boomerangAmount > 0 && boomerangStart >= 0 && age >= boomerangStart) {
        const monthsIntoBoomerang = (age - boomerangStart) * 12 + currentMonthIndex;
        if (monthsIntoBoomerang < boomerangDuration) {
            state.addExpense(boomerangAmount * expenseMultiplier);
        }
    }

    // W3.5 — Caregiving (parents âgés)
    const caregivingAmount = projection.caregivingMonthly || 0;
    const caregivingStart = projection.caregivingStartAge ?? -1;
    const caregivingDuration = projection.caregivingDurationMonths ?? 0;
    if (caregivingAmount > 0 && caregivingStart >= 0 && age >= caregivingStart) {
        const monthsIntoCare = (age - caregivingStart) * 12 + currentMonthIndex;
        if (monthsIntoCare < caregivingDuration) {
            state.addExpense(caregivingAmount * expenseMultiplier);
        }
    }

    // W4.7 — Snowbird
    if (projection.snowbirdEnabled && isRetired) {
        const monthsPerYear = projection.snowbirdMonthsPerYear ?? 5;
        const extraMonthlyCost = projection.snowbirdExtraMonthlyCost ?? 1500;
        state.addExpense((extraMonthlyCost * monthsPerYear / 12) * expenseMultiplier);
    }
}
