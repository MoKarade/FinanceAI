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
