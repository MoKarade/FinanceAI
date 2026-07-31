// services/projection/pastPurchaseInit.ts
//
// [DASH-IMMO-EQUITY-WRITERS → racine ENG-PAST-PURCHASE] (décision Marc 2026-07-31 : « brancher »)
// Un bien dont `purchaseDate` est dans le PASSÉ appartient DÉJÀ à l'utilisateur. Avant ce module,
// le moteur le traitait comme un achat À FAIRE au mois 0 : mise de fonds re-débitée du cash
// d'aujourd'hui si possible, sinon « Achat reporté » à l'infini (mesuré : Immobilier = 0 sur tout
// l'horizon pour un propriétaire dont le cash actuel < mise de fonds — le Futur perdait la maison).
//
// Ce module reconstitue l'état du bien AU MOIS 0, en répliquant les conventions EXACTES du chemin
// d'achat du moteur (realEstateMonth.ts) compressées sur les mois écoulés :
//  - principal d'origine = (price − downPayment) + prime SCHL si LTV > 80 % (même helper) ;
//  - PMT = même formule d'annuité (taux d'origine, amortissement d'origine) ;
//  - solde restant = forme fermée de l'amortissement au taux d'origine constant ;
//  - valeur = price × (1 + propertyGrowthRate)^(années écoulées), plafonnée à maxValue.
// Approximation ASSUMÉE : pas de « choc de renouvellement » rétroactif (la loterie de taux du
// moteur modélise un FUTUR incertain ; le passé de l'utilisateur est un fait, le taux d'origine
// constant est l'estimation la plus neutre). Les renouvellements FUTURS s'appliquent normalement.
//
// Consommé par : (1) l'init de `propertiesState` du moteur (projection.ts) — le bien démarre
// ACHETÉ, zéro débit de cash au mois 0 ; (2) le KPI patrimoine de l'Accueil (Dashboard) — même
// convention que chartData[0].Immobilier par construction (source unique).

import type { RealEstateGoal } from '../../types';
import { calculateSchlPremium } from '../realEstate';

export interface PastPurchaseState {
    isBought: true;
    /** Valeur actuelle estimée (price apprécié depuis l'achat, plafonné à maxValue). */
    currentValue: number;
    /** Solde hypothécaire restant (0 si remboursé). */
    mortgage: number;
    /** Paiement mensuel courant (0 si remboursé). */
    calculatedPmt: number;
    isPaidOff: boolean;
}

const fin = (v: unknown, d = 0): number => (Number.isFinite(Number(v)) ? Number(v) : d);

/**
 * État d'un bien acheté il y a `monthsSincePurchase` mois (> 0), aux conventions du moteur.
 * Pur, sans effet de bord — testable sans harnais.
 */
export function initPastPurchase(goal: RealEstateGoal, monthsSincePurchase: number): PastPurchaseState {
    const price = Math.max(0, fin(goal.price));
    const down = Math.max(0, fin(goal.downPayment));
    let principal = Math.max(0, price - down);
    if (principal > 0) {
        const schl = calculateSchlPremium({ price, downPayment: down });
        if (schl.required) principal += schl.premium;
    }

    const r = Math.max(0, fin(goal.mortgageRate)) / 100 / 12;
    const amortYears = fin(goal.amortization, 25) > 0 ? fin(goal.amortization, 25) : 25;
    const n = amortYears * 12;
    const pmt = principal <= 0
        ? 0
        : r > 0
            ? principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1)
            : principal / n;

    const k = Math.max(0, Math.min(fin(monthsSincePurchase), n));
    let balance: number;
    if (principal <= 0) balance = 0;
    else if (r > 0) balance = principal * Math.pow(1 + r, k) - pmt * ((Math.pow(1 + r, k) - 1) / r);
    else balance = principal - pmt * k;
    balance = Math.max(0, balance);

    const growthAnnual = fin(goal.propertyGrowthRate, 3) / 100;
    let currentValue = price * Math.pow(1 + growthAnnual, fin(monthsSincePurchase) / 12);
    const maxValue = fin(goal.maxValue);
    if (maxValue > 0 && currentValue > maxValue) currentValue = maxValue;

    const isPaidOff = balance <= 0;
    return {
        isBought: true,
        currentValue,
        mortgage: balance,
        calculatedPmt: isPaidOff ? 0 : pmt,
        isPaidOff,
    };
}

/**
 * Équité PRÉSENTE d'un bien pour les surfaces UI (KPI Accueil).
 * Priorité aux champs EXPLICITES `currentValue`/`mortgageBalance` s'ils sont renseignés (> 0)
 * — sinon reconstruction aux conventions du moteur. Bien non encore acheté (date future) → 0.
 */
export function presentEquityOfGoal(goal: RealEstateGoal, monthsSincePurchase: number): number {
    if (!goal.isActive) return 0;
    const explicitValue = fin(goal.currentValue);
    if (explicitValue > 0) {
        return explicitValue - Math.max(0, fin(goal.mortgageBalance));
    }
    if (monthsSincePurchase <= 0) return 0;
    const s = initPastPurchase(goal, monthsSincePurchase);
    return s.currentValue - s.mortgage;
}

/** Mois écoulés depuis `purchaseDate` (YYYY-MM…) — négatif si la date est future/invalide → 0. */
export function monthsSince(purchaseDate: string | undefined | null, now: Date = new Date()): number {
    if (!purchaseDate || typeof purchaseDate !== 'string' || purchaseDate.length < 7) return 0;
    const y = parseInt(purchaseDate.slice(0, 4), 10);
    const m = parseInt(purchaseDate.slice(5, 7), 10) - 1;
    if (Number.isNaN(y) || Number.isNaN(m)) return 0;
    return (now.getFullYear() - y) * 12 + (now.getMonth() - m);
}
