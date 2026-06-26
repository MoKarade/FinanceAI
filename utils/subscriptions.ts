import type { RecurringItem } from '../types';

// [PH4-F] Abonnements épinglés (persistés) vs détectés (à la volée, IA/heuristique).
// Identité d'un abonnement = le MARCHAND normalisé : un même marchand = un seul abo
// (deux détections du même service ne se dédoublent pas, et épingler est idempotent).

/** Clé d'identité = marchand normalisé (trim + minuscule). */
export function subscriptionKey(s: Pick<RecurringItem, 'payee'>): string {
    return (s.payee ?? '').trim().toLowerCase();
}

/** L'abo est-il déjà épinglé (présent dans la liste persistée, par marchand) ? */
export function isPinned(pinned: readonly RecurringItem[], sub: Pick<RecurringItem, 'payee'>): boolean {
    const key = subscriptionKey(sub);
    return pinned.some((p) => subscriptionKey(p) === key);
}

/**
 * Liste à AFFICHER = abos ÉPINGLÉS (persistés) + abos DÉTECTÉS non déjà épinglés (dédup par marchand).
 * Les épinglés gagnent (montant/jour confirmés par l'utilisateur priment sur une re-détection). Pur.
 */
export function mergeSubscriptions(
    pinned: readonly RecurringItem[],
    detected: readonly RecurringItem[],
): RecurringItem[] {
    const seen = new Set(pinned.map(subscriptionKey));
    const extra = detected.filter((d) => !seen.has(subscriptionKey(d)));
    return [...pinned, ...extra];
}

/** Épingle un abo (idempotent : aucun doublon par marchand). Renvoie une nouvelle liste. */
export function addSubscription(pinned: readonly RecurringItem[], sub: RecurringItem): RecurringItem[] {
    if (isPinned(pinned, sub)) return [...pinned];
    return [...pinned, sub];
}

/** Désépingle l'abo dont le marchand correspond à `key` (clé normalisée). Renvoie une nouvelle liste. */
export function removeSubscription(pinned: readonly RecurringItem[], key: string): RecurringItem[] {
    return pinned.filter((p) => subscriptionKey(p) !== key);
}

// [PLANNING-ANNUAL-SUB-12X] `yearlyCost` est la source de vérité du coût annualisé d'un abo
// (mensuel → averageAmount×12 ; annuel → averageAmount×1). Sommer `averageAmount` brut et ×12
// compte un abo ANNUEL douze fois dans les totaux mensuels. On dérive donc toujours depuis
// `yearlyCost`. Gardes `Number.isFinite` : un abo d'une source douteuse (IA) ne contamine pas le total.

/** Coût MENSUEL équivalent d'un abo (annuel → /12). NaN/Infinity → 0. */
export function monthlyEquivalent(sub: Pick<RecurringItem, 'yearlyCost'>): number {
    const y = Number(sub.yearlyCost);
    return Number.isFinite(y) ? y / 12 : 0;
}

/** Total ANNUEL des abos = Σ yearlyCost (chaque abo déjà annualisé correctement). */
export function totalYearlyCost(subs: readonly RecurringItem[]): number {
    return subs.reduce((acc, s) => {
        const y = Number(s.yearlyCost);
        return acc + (Number.isFinite(y) ? y : 0);
    }, 0);
}

/** Total MENSUEL équivalent = Σ monthlyEquivalent = totalYearlyCost/12 (pas de ×12 d'un annuel). */
export function totalMonthlyCost(subs: readonly RecurringItem[]): number {
    return totalYearlyCost(subs) / 12;
}
