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

/**
 * [PLANNING-ANNUAL-CALENDAR] Un abo est ANNUEL si son coût annualisé ≈ son montant unitaire (ratio ~1),
 * vs mensuel (~12). Convention du détecteur (`Planning`) : `yearlyCost = averageAmount × (annuel ? 1 : 12)`.
 * `RecurringItem` n'a pas de champ `frequency` → on dérive du ratio, seuil STRICT à 2 (marge sur le float
 * autour de 1). Toute cadence plus fréquente (trimestriel ratio 4, mensuel ratio 12, ou un abo IA à cadence
 * non standard) tombe donc en NON-annuel → affiché CHAQUE mois (sur-affichage = jamais masquer une facture,
 * direction de risque sûre). Avg ≤ 0 ou valeurs non finies → NON annuel (défaut mensuel).
 */
export function isAnnualSubscription(sub: Pick<RecurringItem, 'averageAmount' | 'yearlyCost'>): boolean {
    const avg = Number(sub.averageAmount);
    const yr = Number(sub.yearlyCost);
    if (!Number.isFinite(avg) || !Number.isFinite(yr) || avg <= 0) return false;
    return yr <= avg * 2;
}

/**
 * [PLANNING-ANNUAL-CALENDAR] Libellé d'échéance d'un abo (affichage) : mensuel → « Le X du mois » ;
 * annuel → « Le X <mois> · annuel » (mois dérivé de `lastDate`, OMIS proprement si la date est invalide,
 * sans double-espace). Pur + testable (vs IIFE inline dans le JSX).
 */
export function subscriptionDueLabel(
    sub: Pick<RecurringItem, 'dayOfMonth' | 'averageAmount' | 'yearlyCost' | 'lastDate'>,
): string {
    if (!isAnnualSubscription(sub)) return `Le ${sub.dayOfMonth} du mois`;
    const d = new Date(sub.lastDate);
    const month = Number.isNaN(d.getTime()) ? '' : d.toLocaleString('fr-CA', { month: 'long' });
    return ['Le', String(sub.dayOfMonth), month, '· annuel'].filter(Boolean).join(' ');
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
