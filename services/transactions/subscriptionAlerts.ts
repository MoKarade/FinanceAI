// services/transactions/subscriptionAlerts.ts
//
// [TX-SUBSCRIPTIONS] Abonnements FANTÔMES : hausse de prix silencieuse, service qui a cessé d'être
// débité, coût annuel réel. Pur, zéro réseau — dérivé des profils de `merchantProfile.ts`.
//
// Demande Marc 2026-07-31 (réponse 24 du cadrage). Les deux signaux visés :
//   - un abonnement dont le prix a monté sans que tu l'aies vu passer ;
//   - un abonnement que tu paies peut-être encore… ou qui s'est arrêté sans que tu le saches.
//
// ⚠️ Ce module ne SUPPRIME et ne MODIFIE rien : il signale. Un « arrêté » peut être un simple retard
// de prélèvement, et un « prix en hausse » peut être une taxe ponctuelle — ce sont des invitations à
// regarder, pas des verdicts.

import type { MerchantProfile } from './merchantProfile';

/** Hausse relative à partir de laquelle on signale (au-delà du bruit d'arrondi/taxe). */
const PRICE_RISE_THRESHOLD = 0.15;
/** Un abonnement est « peut-être arrêté » après 2 cadences sans débit (1 seule = simple retard). */
const MISSED_CYCLES_BEFORE_STALE = 2;
const DAY_MS = 86_400_000;

export type SubscriptionAlertKind = 'price_rise' | 'stopped';

export interface SubscriptionAlert {
    kind: SubscriptionAlertKind;
    /** Clé du marchand (identité du profil). */
    merchantKey: string;
    /** Libellé lisible. */
    label: string;
    /** Montant typique historique (hors dernière occurrence pour `price_rise`). */
    baselineAmount: number;
    /** Dernier montant observé. */
    latestAmount: number;
    /** Hausse relative (0.22 = +22 %) — `price_rise` seulement. */
    risePct?: number;
    /** Jours écoulés depuis le dernier débit — `stopped` seulement. */
    daysSinceLast?: number;
    /** Coût ANNUEL au tarif courant (dernier montant × cadence). */
    yearlyCostAtLatest: number;
}

/** Occurrences par an d'une cadence, pour annualiser un coût. */
function periodsPerYear(profile: MerchantProfile): number {
    switch (profile.cadence) {
        case 'weekly': return 52;
        case 'monthly': return 12;
        case 'quarterly': return 4;
        case 'yearly': return 1;
        default: return 0;
    }
}

function dayNumber(isoDate: string): number | null {
    const t = Date.parse(`${isoDate}T00:00:00Z`);
    return Number.isFinite(t) ? Math.round(t / DAY_MS) : null;
}

export interface SubscriptionAlertInput {
    profile: MerchantProfile;
    /** Montants absolus des occurrences, du plus ancien au plus récent. */
    amounts: number[];
}

/**
 * Détecte les alertes d'un abonnement RECONNU (profil `isRecurring`). Un marchand non récurrent est
 * ignoré : sans cadence établie, « prix en hausse » et « arrêté » n'ont pas de sens.
 *
 * @param today date de référence ISO `YYYY-MM-DD` (injectée : le module reste pur et testable).
 */
export function detectSubscriptionAlerts(
    inputs: readonly SubscriptionAlertInput[],
    today: string,
): SubscriptionAlert[] {
    const todayDay = dayNumber(today);
    const alerts: SubscriptionAlert[] = [];

    for (const { profile, amounts } of inputs) {
        if (!profile.isRecurring) continue;
        const finite = amounts.filter((a) => Number.isFinite(a) && a > 0);
        if (finite.length < 2) continue;

        const latestAmount = finite[finite.length - 1];
        const perYear = periodsPerYear(profile);
        const yearlyCostAtLatest = Math.round(latestAmount * perYear);

        // — Hausse de prix : le dernier montant contre la MÉDIANE DES PRÉCÉDENTS (pas contre la
        //   médiane globale, qui inclut le nouveau prix et amortit la hausse qu'on cherche).
        const previous = finite.slice(0, -1);
        const sorted = [...previous].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const baseline = sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];
        if (baseline > 0) {
            const risePct = (latestAmount - baseline) / baseline;
            if (risePct > PRICE_RISE_THRESHOLD) {
                alerts.push({
                    kind: 'price_rise',
                    merchantKey: profile.key,
                    label: profile.label,
                    baselineAmount: baseline,
                    latestAmount,
                    risePct,
                    yearlyCostAtLatest,
                });
            }
        }

        // — Arrêté : plus de débit depuis 2 cadences. Un seul cycle manqué est un retard banal
        //   (prélèvement décalé, week-end) — crier au loup dessus ferait cesser de lire les alertes.
        const lastDay = dayNumber(profile.lastDate);
        const interval = profile.medianIntervalDays;
        if (todayDay !== null && lastDay !== null && interval !== null && interval > 0) {
            const daysSinceLast = todayDay - lastDay;
            if (daysSinceLast > interval * MISSED_CYCLES_BEFORE_STALE) {
                alerts.push({
                    kind: 'stopped',
                    merchantKey: profile.key,
                    label: profile.label,
                    baselineAmount: profile.typicalAmount,
                    latestAmount,
                    daysSinceLast,
                    yearlyCostAtLatest,
                });
            }
        }
    }

    // Ordre : le plus coûteux d'abord — c'est ce qui mérite le premier regard.
    alerts.sort((a, b) => b.yearlyCostAtLatest - a.yearlyCostAtLatest);
    return alerts;
}

/**
 * Coût annuel TOTAL des abonnements reconnus, au tarif le plus récent de chacun.
 * ⚠️ Un abonnement signalé « arrêté » est EXCLU : le compter continuerait d'annoncer une dépense qui
 * n'a peut-être plus lieu (no-fake-data). Les alertes disent lesquels.
 */
export function totalYearlyAtLatest(
    inputs: readonly SubscriptionAlertInput[],
    alerts: readonly SubscriptionAlert[],
): number {
    const stopped = new Set(alerts.filter((a) => a.kind === 'stopped').map((a) => a.merchantKey));
    let total = 0;
    for (const { profile, amounts } of inputs) {
        if (!profile.isRecurring || stopped.has(profile.key)) continue;
        const finite = amounts.filter((a) => Number.isFinite(a) && a > 0);
        if (finite.length === 0) continue;
        total += finite[finite.length - 1] * periodsPerYear(profile);
    }
    return Math.round(total);
}
