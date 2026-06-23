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
    if (rentalPropertyNoiMonthly !== 0) {
        state.addIncome(rentalPropertyNoiMonthly);
        // [FA-6] via `addTaxDivers` → l'impôt locatif SURVIT à l'écrasement de `.revenu` en décembre :
        // avant, le revenu locatif d'un bailleur ACTIF n'était PAS imposé (clobberé). Le 0,45 reste un
        // PROXY de taux marginal (non sourcé — suivi BACKLOG W5-TAX-PROXY).
        state.addTaxDivers((rentalPropertyNoiMonthly * 0.45) / 12);
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
        // non imposé en année active). Le 0,36 reste un PROXY (non sourcé — suivi BACKLOG W5-TAX-PROXY).
        state.addTaxDivers((businessDividendMonthly * 0.36) / 12);
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
