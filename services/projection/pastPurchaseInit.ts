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
//  - valeur = price × (1 + propertyGrowthRate)^(années écoulées), plafonnée à maxValue —
//    même convention `(rate || 3)` que le moteur (un 0 saisi devient 3 %/an, ticket
//    [ENG-PROPGROWTH-ZERO-INEXPRIMABLE] pour rendre 0 exprimable des DEUX côtés) ;
//  - champs EXPLICITES `currentValue`/`mortgageBalance` : s'ils sont renseignés, ils PRIMENT sur
//    la reconstruction (le solde réel saisi par l'utilisateur est un FAIT — panel #552 : les
//    ignorer côté moteur créait un écart Accueil↔Futur de 291 676 $ mesuré).
// Approximations ASSUMÉES : pas de « choc de renouvellement » rétroactif (le taux d'origine
// constant est l'estimation la plus neutre du passé) ; granularité MOIS (le jour du mois est
// ignoré — un achat le 31 et un « aujourd'hui » le 1er comptent un mois plein, ≤ 1 mois
// d'amortissement d'écart, cohérent des deux côtés moteur/KPI).
//
// Consommé par : (1) l'init de `propertiesState` du moteur (projection.ts) — le bien démarre
// ACHETÉ, zéro débit de cash au mois 0 ; (2) le KPI patrimoine de l'Accueil et la surface PDF
// (presentEquityOfGoal) — même convention que chartData[0].Immobilier pour un bien passé, au
// mois de traitement près (~1 mois de croissance + 1 versement, écart mesuré 1 695 $, documenté).

import type { RealEstateGoal } from '../../types';
import { calculateSchlPremium, SCHL_AMORT_MAX_INSURED_STANDARD } from '../realEstate';
import { logErrorThrottled } from '../errorLogger';

export interface PastPurchaseState {
    isBought: true;
    /** Valeur actuelle estimée (explicite si fournie, sinon price apprécié plafonné maxValue). */
    currentValue: number;
    /** Solde hypothécaire restant (explicite si fourni, sinon amorti ; 0 si remboursé). */
    mortgage: number;
    /** Paiement mensuel courant (0 si remboursé). */
    calculatedPmt: number;
    isPaidOff: boolean;
}

const fin = (v: unknown, d = 0): number => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Champ RENSEIGNÉ mais non fini (NaN d'un champ UI vidé, Infinity) — jamais avalé sans trace. */
const isCorrupt = (v: unknown): boolean => v != null && !Number.isFinite(Number(v));

/**
 * État d'un bien acheté il y a `monthsSincePurchase` mois (> 0), aux conventions du moteur.
 * Pur hors journalisation d'anomalie (logErrorThrottled sur donnée corrompue) — testable sans harnais.
 */
export function initPastPurchase(goal: RealEstateGoal, monthsSincePurchase: number): PastPurchaseState {
    if ([goal.price, goal.downPayment, goal.mortgageRate, goal.amortization,
        goal.currentValue, goal.mortgageBalance].some(isCorrupt)) {
        // [Panel #552, silent-failure] neutraliser SANS log = un bien qui devient « payé, valeur
        // nulle » en silence sur une donnée corrompue. Throttlé par bien (rejoué chaque run/MC).
        logErrorThrottled(`pastInit-nonfini:${goal.id}`, {
            source: 'projection', severity: 'warning',
            message: 'RealEstateGoal (achat passé) : champ non fini neutralisé',
            context: { id: goal.id, name: goal.name },
        });
    }
    const price = Math.max(0, fin(goal.price));
    const down = Math.max(0, fin(goal.downPayment));
    let principal = Math.max(0, price - down);
    if (principal > 0) {
        const schl = calculateSchlPremium({ price, downPayment: down });
        if (schl.required) principal += schl.premium;
    }

    const r = Math.max(0, fin(goal.mortgageRate)) / 100 / 12;
    // Défaut = la SOURCE des 25 ans (SCHL), pas un littéral re-codé (panel #552, F-10).
    const amortYears = fin(goal.amortization, SCHL_AMORT_MAX_INSURED_STANDARD) > 0
        ? fin(goal.amortization, SCHL_AMORT_MAX_INSURED_STANDARD)
        : SCHL_AMORT_MAX_INSURED_STANDARD;
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
    // Le solde EXPLICITE saisi (y compris 0 = maison payée) prime sur la reconstruction : c'est
    // un fait utilisateur, plus fiable qu'un calendrier théorique (remboursements accélérés).
    if (goal.mortgageBalance != null && Number.isFinite(Number(goal.mortgageBalance))) {
        balance = Math.max(0, Number(goal.mortgageBalance));
    }

    // Convention MOTEUR (realEstateMonth.ts:347) : `(rate || 3)` — un 0 saisi devient 3 %/an.
    const growthAnnual = (fin(goal.propertyGrowthRate) || 3) / 100;
    let currentValue = price * Math.pow(1 + growthAnnual, fin(monthsSincePurchase) / 12);
    const maxValue = fin(goal.maxValue);
    if (maxValue > 0 && currentValue > maxValue) currentValue = maxValue;
    // La valeur EXPLICITE saisie prime (même raison que le solde).
    const explicitValue = fin(goal.currentValue);
    if (explicitValue > 0) currentValue = explicitValue;

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
 * Équité PRÉSENTE d'un bien pour les surfaces UI (KPI Accueil, PDF).
 * `isOwned === false` (A6 : objectif planifié non réalisé) → 0, TOUJOURS. Bien passé →
 * délégation à `initPastPurchase` (MÊME convention que le moteur, champs explicites inclus).
 * Bien sans date / à date future : seuls des champs EXPLICITES `currentValue`
 * (/`mortgageBalance`) comptent — un fait utilisateur prime sur une date incohérente ; sinon 0
 * (pas encore détenu). Donnée corrompue (non finie) → 0 TRACÉ, jamais un défaut crédible —
 * la garde vit ICI pour couvrir TOUS les consommateurs (panel #552 : 1 site gardé sur 3).
 */
export function presentEquityOfGoal(goal: RealEstateGoal, monthsSincePurchase: number): number {
    if (!goal.isActive) return 0;
    if ([goal.currentValue, goal.mortgageBalance, goal.price, goal.downPayment,
        goal.mortgageRate, goal.amortization].some(isCorrupt)) {
        logErrorThrottled(`presentEquity-nonfini:${goal.id}`, {
            source: 'projection', severity: 'warning',
            message: 'RealEstateGoal : champ non fini — bien EXCLU du patrimoine affiché',
            context: { id: goal.id, name: goal.name },
        });
        return 0;
    }
    // [ENG-PAST-OWNED-VS-PLANNED] (A6) même gate que le moteur (un flux alimente PLUSIEURS
    // registres — moteur ET affichage) : isOwned === false = objectif planifié NON réalisé →
    // ZÉRO, sans repli sur les champs explicites. « Non détenu » + « valeur actuelle » sont
    // contradictoires ; honorer currentValue ici affichait 200 000 $ (KPI/PDF) pendant que le
    // moteur, gate en aval, publiait 0 — l'écart Accueil↔Futur du panel #552 réintroduit
    // (revue #684, mesuré). Le repli explicite reste réservé aux dates futures/absentes.
    if (goal.isOwned === false) return 0;
    if (monthsSincePurchase > 0) {
        const s = initPastPurchase(goal, monthsSincePurchase);
        return s.currentValue - s.mortgage;
    }
    const explicitValue = fin(goal.currentValue);
    if (explicitValue > 0) {
        return explicitValue - Math.max(0, fin(goal.mortgageBalance));
    }
    return 0;
}

/** Mois écoulés depuis `purchaseDate` (YYYY-MM…) — négatif si la date est future, 0 si absente/invalide. */
export function monthsSince(purchaseDate: string | undefined | null, now: Date = new Date()): number {
    if (!purchaseDate || typeof purchaseDate !== 'string' || purchaseDate.length < 7) return 0;
    const y = parseInt(purchaseDate.slice(0, 4), 10);
    const m = parseInt(purchaseDate.slice(5, 7), 10) - 1;
    if (Number.isNaN(y) || Number.isNaN(m)) {
        // [Panel #552, silent-failure] une date corrompue rendait le bien indiscernable d'un achat
        // futur (il DISPARAISSAIT du patrimoine sans trace) — même classe que le bug que V2' corrige.
        logErrorThrottled(`monthsSince-invalide:${purchaseDate}`, {
            source: 'projection', severity: 'warning',
            message: 'purchaseDate illisible — bien traité comme non détenu',
            context: { purchaseDate: purchaseDate.slice(0, 10) },
        });
        return 0;
    }
    return (now.getFullYear() - y) * 12 + (now.getMonth() - m);
}
