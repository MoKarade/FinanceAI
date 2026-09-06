// services/projection/rentalMonth.ts
//
// [ENG-W5-RENTAL-OFFBALANCE] Un immeuble locatif (`RentalProperty`, W5.6) n'existait PAS au bilan.
// Seul son NOI (loyer − charges) affluait au revenu ; sa VALEUR, son HYPOTHÈQUE et le SERVICE de
// cette hypothèque étaient invisibles.
//
// MESURÉ sur le persona de référence : **300 k$ d'équité et 500 k$ de prêt introuvables** au
// patrimoine, et ≈2,9 k$/mois de service de dette jamais payé — soit ≈700 k$ de coût omis sur
// l'horizon. L'invariant de conservation restait VERT : tout était absent du `chartData`, donc rien
// à réconcilier. Un actif qu'on n'écrit nulle part ne casse aucun bilan — il ment simplement.
//
// ⚠️ POURQUOI LES TROIS VONT ENSEMBLE, et pas l'un sans l'autre. Mettre la valeur au bilan SANS
// servir la dette ferait un patrimoine +300 k$ dont l'hypothèque ne descendrait JAMAIS ; servir la
// dette sans mettre la valeur ferait payer un bien qui n'existe pas. Chaque moitié est pire que le
// statu quo — on livre le tout ou rien.
//
// ⚠️ CE QUE CE MODULE NE MODÉLISE PAS (et qui reste au BACKLOG) : la vente de l'immeuble, la
// récupération de DPA (`ccaTaken`) à la vente, et l'impôt latent sur le gain. Le revenu locatif reste
// imposé au proxy 0,45 de `w5Effects` (non sourcé — `[W5-PROXY-NON-SOURCE]`). On ne prétend pas le
// contraire : ces manques sont nommés ici plutôt que d'être découverts plus tard comme des défauts.

import type { RentalProperty } from '../../types';

/**
 * Amortissement par DÉFAUT quand `RentalProperty.amortizationYears` est absent.
 *
 * ⚠️ C'est une HYPOTHÈSE, pas une valeur sourcée : 25 ans est l'amortissement standard d'un prêt
 * hypothécaire résidentiel canadien, et c'est déjà le défaut du chemin « but immobilier ». On la
 * pose ICI, nommée et documentée, plutôt que de la disperser en littéral — et l'UI devrait à terme
 * demander le champ (il existe déjà dans le type). Un immeuble dont l'amortissement est saisi
 * l'emporte toujours sur ce défaut.
 */
export const DEFAULT_RENTAL_AMORTIZATION_YEARS = 25;

/**
 * Croissance annuelle par DÉFAUT (%) quand `RentalProperty.propertyGrowthRate` est absent.
 *
 * ⚠️ HYPOTHÈSE de modèle, pas une valeur sourcée — même défaut (3 %) que le chemin des buts
 * immobiliers (`goal.propertyGrowthRate ?? 3`). [ENG-PROPGROWTH-PAR-IMMEUBLE] (décision Marc
 * 2026-09-04) : le taux vit PAR immeuble ; le réglage config (`projection.propertyGrowthRate`)
 * est RETIRÉ du chemin locatif — aucune UI ne l'a jamais écrit. Un 0 EXPLICITE saisi reste 0.
 */
export const DEFAULT_RENTAL_GROWTH_PCT = 3;

/** État MUTABLE d'un immeuble locatif au fil des mois (valeur et solde évoluent). */
interface RentalState {
    id: string;
    /** Valeur marchande courante, croissant au taux immobilier. */
    currentValue: number;
    /** Solde hypothécaire restant. */
    mortgage: number;
    /** Mensualité calculée à l'initialisation (fixe, comme pour un but immobilier). */
    monthlyPayment: number;
    /** Taux annuel (%) — conservé DANS l'état : sans lui, le calcul d'intérêt devrait re-croiser
     *  l'immeuble d'origine à chaque mois, et un décalage d'index donnerait le taux d'un AUTRE bien. */
    ratePct: number;
    /** [ENG-PROPGROWTH-PAR-IMMEUBLE] Croissance annuelle (%) de CET immeuble — écrite au semis
     *  (défaut explicite, jamais l'absence : absent voudrait dire « je ne sais pas » et relancerait
     *  un repli), même raison d'être dans l'état que `ratePct`. */
    growthRatePct: number;
    isPaidOff: boolean;
}

const num = (v: unknown, fallback = 0): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
};

/**
 * Mensualité d'un prêt à annuités constantes. Taux 0 ⇒ amortissement linéaire (la formule générale
 * divise par 0). Solde ≤ 0 ⇒ 0 : un immeuble payé ne se sert pas.
 */
export function rentalMonthlyPayment(balance: number, annualRatePct: number, years: number): number {
    const b = Math.max(0, num(balance));
    if (b <= 0) return 0;
    const n = Math.max(1, Math.round(num(years, DEFAULT_RENTAL_AMORTIZATION_YEARS) * 12));
    const r = num(annualRatePct) / 100 / 12;
    if (r <= 0) return b / n;
    const f = Math.pow(1 + r, n);
    return (b * r * f) / (f - 1);
}

/** Identifiant d'état d'un immeuble (SOURCE UNIQUE du repli `'anon'` — `initRentalStates` et le
 *  consommateur W5 doivent former la même clé, sinon l'intérêt d'un immeuble sans `id` se perd). */
export const rentalStateId = (rp: Pick<RentalProperty, 'id'>): string => rp.id || 'anon';

/**
 * [W5-RENTAL-INTERET-DPA] Intérêt hypothécaire du MOIS d'un immeuble, sur le solde de DÉBUT de mois.
 * SOURCE UNIQUE : `processRentalMonth` (qui l'encaisse et amortit) et `applyW5Effects` (qui le
 * DÉDUIT de la base imposable du NOI, T4036) lisent la même formule — un `mortgage × taux / 12`
 * recopié chez l'un aurait divergé de l'autre au premier arrondi. Immeuble payé → 0.
 */
const rentalInterestOfMonth = (s: Pick<RentalState, 'mortgage' | 'ratePct'>): number =>
    s.mortgage > 0 ? s.mortgage * (s.ratePct / 100 / 12) : 0;

/**
 * [W5-RENTAL-INTERET-DPA] Intérêt du mois PAR immeuble (clé = `rentalStateId`), lu AVANT
 * `processRentalMonth` du même mois — l'ordre de la boucle appelle les effets W5 avant le mois
 * locatif, et l'intérêt se calcule sur le solde de début de mois dans les deux cas : la somme de cette
 * table vaut EXACTEMENT `processRentalMonth(...).interest` du même mois (garde de chaîne).
 */
export function rentalInterestParImmeuble(states: readonly RentalState[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const s of states) out[s.id] = (out[s.id] ?? 0) + rentalInterestOfMonth(s);
    return out;
}

/** État initial des immeubles locatifs, calculé UNE fois avant la boucle mensuelle. */
export function initRentalStates(rentals: readonly RentalProperty[] | undefined): RentalState[] {
    return (rentals ?? []).filter(Boolean).map((rp) => {
        const mortgage = Math.max(0, num(rp.mortgageBalance));
        return {
            id: rentalStateId(rp),
            currentValue: Math.max(0, num(rp.currentValue)),
            mortgage,
            monthlyPayment: rentalMonthlyPayment(
                mortgage,
                num(rp.mortgageRate),
                num(rp.amortizationYears, DEFAULT_RENTAL_AMORTIZATION_YEARS),
            ),
            ratePct: num(rp.mortgageRate),
            growthRatePct: num(rp.propertyGrowthRate, DEFAULT_RENTAL_GROWTH_PCT),
            isPaidOff: mortgage <= 0,
        };
    });
}

interface RentalMonthResult {
    /** Équité TOTALE des immeubles locatifs (valeur − hypothèque), déjà NETTE. */
    equity: number;
    /** Solde hypothécaire TOTAL restant. */
    mortgageBalance: number;
    /** Service de dette du mois (à ajouter aux dépenses). */
    debtService: number;
    /** Part INTÉRÊT du service, pour l'affichage et la déductibilité. */
    interest: number;
    /** Part CAPITAL du service. */
    principal: number;
    /** Messages à journaliser (hypothèque d'un immeuble remboursée). */
    logs: string[];
}

/**
 * Un mois de vie des immeubles locatifs : croissance de la valeur, amortissement de l'hypothèque,
 * service de dette. MUTE `states` (comme le chemin des buts immobiliers) et rend les agrégats.
 *
 * ⚠️ `equity` est NETTE d'hypothèque — même convention que `realEstateEquity` du moteur. Ne JAMAIS
 * re-soustraire `mortgageBalance` du patrimoine après avoir ajouté `equity` : c'est le double
 * comptage que la source unique `computeRawNetWorth` interdit.
 */
export function processRentalMonth(
    states: RentalState[],
    names: readonly string[],
): RentalMonthResult {
    let equity = 0;
    let mortgageBalance = 0;
    let debtService = 0;
    let interest = 0;
    let principal = 0;
    const logs: string[] = [];

    for (let i = 0; i < states.length; i++) {
        const s = states[i];
        // [ENG-PROPGROWTH-PAR-IMMEUBLE] La croissance est celle de CET immeuble (semée au state).
        const growth = Math.pow(1 + s.growthRatePct / 100, 1 / 12);
        s.currentValue = Math.max(0, s.currentValue * growth);

        // ⚠️ Le service ne dépasse JAMAIS ce qu'il reste à devoir (solde + intérêt du mois) : sans
        // ce plafond, le dernier versement rembourserait plus que la dette et créerait de l'argent.
        // Même garde que le chemin des buts immobiliers.
        const interestPaid = rentalInterestOfMonth(s);
        const payment = s.mortgage > 0 ? Math.min(s.monthlyPayment, s.mortgage + interestPaid) : 0;
        const principalPaid = Math.max(0, payment - interestPaid);

        if (payment > 0) {
            const before = s.mortgage;
            s.mortgage = Math.max(0, s.mortgage - principalPaid);
            debtService += payment;
            interest += interestPaid;
            principal += principalPaid;
            if (before > 0 && s.mortgage <= 0 && !s.isPaidOff) {
                s.isPaidOff = true;
                s.monthlyPayment = 0;
                logs.push(`🏘️ Hypothèque remboursée : ${names[i] || 'immeuble locatif'} t'appartient pleinement.`);
            }
        }

        equity += s.currentValue - s.mortgage;
        mortgageBalance += s.mortgage;
    }

    return { equity, mortgageBalance, debtService, interest, principal, logs };
}
