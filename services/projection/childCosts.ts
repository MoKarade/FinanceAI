// services/projection/childCosts.ts
//
// Source UNIQUE de la table des coûts enfants. Avant : duplication entre
// composants/ChildPlanning.tsx (constantes locales DAYCARE_INFO/SCHOOL_INFO/
// ACTIVITIES_INFO/UNI_INFO/CAR_INFO) et services/projection/childrenReee.ts
// (qui ignorait totalement ces choix UI et utilisait seulement les champs
// scalaires monthlyDiapers/Food/Clothing/Daycare).
//
// Conséquence du bug : l'utilisateur changeait "École privée" ou "Université
// à l'étranger" dans ChildPlanning → l'onglet montrait des coûts énormes,
// mais Future projetait toujours les coûts basiques. Divergence silencieuse.
//
// Ce module centralise :
//   - Les unions de types (DaycareType, SchoolType, etc.)
//   - Les tables d'info (label/icon/coût annuel ou mensuel)
//   - Une fonction `getAnnualChildCost(child, ageYears, opts)` qui réplique
//     fidèlement la logique de ChildPlanning.tsx (tranches d'âge 0/1-4/5-11/
//     12-17/18/18+uni.years/25+) et renvoie un montant annuel détaillé.
//
// LIMITATIONS connues (audit B2) :
//   - `getAnnualChildCost` NE prend PAS en compte les éléments suivants
//     que le moteur de projection applique (`childrenReee.ts` + `projection.ts`) :
//     • RQAP (rente d'assurance parentale) en année 0
//     • Clawback allocations gouvernementales si ménage > 150k$/an
//     • Économies commuting 350$/mois pendant le congé parental
//     • Crédit fédéral 30% sur frais garderie > 400$/mois
//   - C'est INTENTIONNEL : `getAnnualChildCost` est une fonction PURE qui ne
//     dépend pas du contexte ménage (revenu, dépenses, fiscalité). Elle sert
//     à projeter le COÛT BRUT par âge pour l'affichage de timeline.
//   - Pour des chiffres NET (après crédits/clawbacks/etc.), consommer
//     directement `lastProjection.chartData` (champs `childGross`, `childCost`,
//     `childBenefits` calculés par le moteur). Voir ChildPlanning.tsx
//     respProjection qui fait ce branchement.

import type { ChildGoal } from '../../types';

export type DaycareType = 'cpe' | 'garde_privee' | 'parent_foyer';
export type SchoolType = 'publique' | 'privee' | 'internationale';
export type ActivitiesLevel = 'aucune' | 'legeres' | 'intensives';
export type UniversityType = 'aucune' | 'cegep' | 'dep' | 'uni_local' | 'uni_appart' | 'uni_etranger';
export type CarGift = 'non' | 'usagee' | 'neuve';

export const DAYCARE_INFO: Record<DaycareType, { label: string; monthly: number; icon: string; desc: string }> = {
    cpe: { label: 'CPE Subventionné', monthly: 215, icon: '🏗️', desc: '~$11.25/jour (2025, indexé)' },
    garde_privee: { label: 'Garderie Privée', monthly: 1400, icon: '🏠', desc: '~$70/jour, service de garde privé non subventionné' },
    parent_foyer: { label: 'Parent au Foyer', monthly: 0, icon: '🤱', desc: 'Pas de frais de garde, mais perte de salaire (~1 700$/mois net)' },
};

export const SCHOOL_INFO: Record<SchoolType, { label: string; yearlyExtra: number; icon: string }> = {
    publique: { label: 'École Publique', yearlyExtra: 500, icon: '📚' },
    privee: { label: 'École Privée', yearlyExtra: 6000, icon: '🎓' },
    internationale: { label: 'Internationale', yearlyExtra: 10000, icon: '🌍' },
};

export const ACTIVITIES_INFO: Record<ActivitiesLevel, { label: string; yearlyExtra: number; icon: string }> = {
    aucune: { label: 'Aucune activité', yearlyExtra: 0, icon: '🏠' },
    legeres: { label: 'Légères (1 sport/art)', yearlyExtra: 1500, icon: '⚽' },
    intensives: { label: 'Intensives (2-3 disciplines)', yearlyExtra: 4500, icon: '🏆' },
};

export const UNI_INFO: Record<UniversityType, { label: string; yearlyCost: number; icon: string; years: number }> = {
    aucune: { label: "Pas d'études post-sec.", yearlyCost: 0, icon: '🔧', years: 0 },
    dep: { label: 'DEP (Formation prof.)', yearlyCost: 2000, icon: '🛠️', years: 2 },
    cegep: { label: 'Cégep seulement', yearlyCost: 1000, icon: '📘', years: 2 },
    uni_local: { label: 'Université chez parents', yearlyCost: 5000, icon: '🎓', years: 4 },
    uni_appart: { label: 'Université + Appart', yearlyCost: 20000, icon: '🏙️', years: 4 },
    uni_etranger: { label: 'Univ. Hors Québec/Canada', yearlyCost: 35000, icon: '✈️', years: 4 },
};

export const CAR_INFO: Record<CarGift, { label: string; cost: number; icon: string }> = {
    non: { label: 'Pas de voiture', cost: 0, icon: '🚶' },
    usagee: { label: 'Voiture usagée (~10 000$)', cost: 10000, icon: '🚗' },
    neuve: { label: 'Voiture neuve (~25 000$)', cost: 25000, icon: '🚙' },
};

// Fallbacks utilisés quand un champ optionnel de ChildGoal est manquant.
// Ces valeurs DOIVENT matcher les `useState` initiaux de ChildPlanning.tsx
// pour que les deux affichages restent cohérents même sur un enfant
// fraîchement créé.
const DEFAULT_DAYCARE: DaycareType = 'cpe';
const DEFAULT_SCHOOL: SchoolType = 'publique';
const DEFAULT_ACTIVITIES: ActivitiesLevel = 'legeres';
const DEFAULT_UNI: UniversityType = 'uni_local';
const DEFAULT_CAR: CarGift = 'non';

interface ChildCostBreakdown {
    /** Dépenses récurrentes (couches, nourriture, vêtements). */
    base: number;
    /** Garderie, frais scolaires, activités. */
    careAndSchool: number;
    /** Achats ponctuels (cadeau auto, initialCost, etc.). */
    oneOff: number;
    /** Coût études post-secondaires si applicable cette année. */
    studies: number;
    /** Allocations gouvernementales (déduction). */
    benefits: number;
    /** Total net = base + careAndSchool + oneOff + studies − benefits. */
    netTotal: number;
}

/**
 * Coût annuel d'un enfant à un âge donné, basé sur ses choix de vie UI.
 *
 * Réplique la logique de ChildPlanning.tsx (composants/ChildPlanning.tsx)
 * pour rester l'unique source de vérité.
 *
 * @param child           Le ChildGoal du store
 * @param ageYears        Âge complet en années (0 = année de naissance)
 * @param expenseMultiplier Inflation cumulée appliquée aux coûts
 * @param parentalLeaveCostYear0 Coût du congé parental (perte revenus) — ajouté seulement à age=0
 */
export function getAnnualChildCost(
    child: ChildGoal,
    ageYears: number,
    expenseMultiplier: number,
    parentalLeaveCostYear0: number,
): ChildCostBreakdown {
    const daycareType = (child.daycareType as DaycareType) || DEFAULT_DAYCARE;
    const schoolType = (child.schoolType as SchoolType) || DEFAULT_SCHOOL;
    const activitiesLevel = (child.activitiesLevel as ActivitiesLevel) || DEFAULT_ACTIVITIES;
    const universityType = (child.universityType as UniversityType) || DEFAULT_UNI;
    const carGift = (child.carGift as CarGift) || DEFAULT_CAR;

    const daycareMonthly = DAYCARE_INFO[daycareType].monthly;
    const schoolYearly = SCHOOL_INFO[schoolType].yearlyExtra;
    const activitiesYearly = ACTIVITIES_INFO[activitiesLevel].yearlyExtra;
    const uni = UNI_INFO[universityType];
    const carCost = CAR_INFO[carGift].cost;
    const parentAtHome = daycareType === 'parent_foyer';
    const govBenefits = child.governmentBenefits ?? 0;

    const diapers = child.monthlyDiapers ?? 0;
    const food = child.monthlyFood ?? 0;
    const clothing = child.monthlyClothing ?? 0;

    let base = 0;
    let careAndSchool = 0;
    let oneOff = 0;
    let studies = 0;
    let benefits = govBenefits * 12;

    if (ageYears === 0) {
        base = (diapers + food + clothing) * 12;
        careAndSchool = parentAtHome ? 0 : daycareMonthly * 12;
        oneOff = (child.initialCost ?? 0) + parentalLeaveCostYear0;
    } else if (ageYears >= 1 && ageYears <= 4) {
        base = (diapers * 0.5 + food + clothing + 50) * 12;
        careAndSchool = parentAtHome ? 0 : daycareMonthly * 12;
    } else if (ageYears >= 5 && ageYears <= 11) {
        base = (food + clothing + 80) * 12;
        careAndSchool = schoolYearly + activitiesYearly;
    } else if (ageYears >= 12 && ageYears <= 17) {
        base = (food * 1.2 + clothing * 1.5 + 150) * 12;
        careAndSchool = schoolYearly + activitiesYearly;
        if (ageYears === 16) oneOff += 500;
        benefits = Math.max(0, govBenefits - 100) * 12;
    } else if (ageYears === 18) {
        // Achat voiture l'année des 18 ans (si configuré)
        oneOff += carCost;
        if (uni.years > 0) studies = uni.yearlyCost;
        benefits = 0;
    } else if (ageYears > 18 && ageYears < 18 + uni.years) {
        studies = uni.yearlyCost;
        benefits = 0;
    } else {
        // 25+ ou aucun parcours universitaire → plus de coût parental
        benefits = 0;
    }

    const inflated = (n: number) => Math.round(n * expenseMultiplier);
    const baseInf = inflated(base);
    const careInf = inflated(careAndSchool);
    const oneOffInf = inflated(oneOff);
    const studiesInf = inflated(studies);
    const benefitsRound = Math.round(benefits);

    return {
        base: baseInf,
        careAndSchool: careInf,
        oneOff: oneOffInf,
        studies: studiesInf,
        benefits: benefitsRound,
        netTotal: Math.max(0, baseInf + careInf + oneOffInf + studiesInf - benefitsRound),
    };
}
