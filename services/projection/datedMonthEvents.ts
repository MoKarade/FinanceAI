// services/projection/datedMonthEvents.ts
//
// [FUTUR-DAILY] Les mouvements du futur dont l'app connaît la DATE, mois par mois.
//
// C'est la moitié « information réelle » du raffinement quotidien : `dailyRefine` sait poser des
// marches à un jour donné, encore faut-il savoir QUELS mouvements ont une date. Ce module répond à
// cette question, et à elle seule — il reste PUR (aucun accès au store).
//
// ⚠️ CE QUE L'APP SAIT DATER AUJOURD'HUI, ET CE QU'ELLE NE SAIT PAS. Mesuré le 2026-08-06 :
//   ✅ `RecurringItem.dayOfMonth` — abonnements et charges récurrentes détectés. C'est TOUT.
//   ❌ La PAIE n'a aucun champ de date (`User` porte `grossSalary`/`netSalary`, tous deux MENSUELS).
//   ❌ Les DETTES n'ont pas de jour de prélèvement (`Debt` n'a que `termEndDate`, le renouvellement).
//   ❌ L'hypothèque non plus : le moteur la traite au pas mensuel.
// Conséquence à ne PAS enjoliver : dans une projection future zoomée, seules les charges récurrentes
// produisent de vraies marches. Le salaire et l'hypothèque seront lissés dans le résidu tant que
// leur jour n'existe pas dans le modèle. Ajouter ces champs est une décision de Marc (donnée qu'il
// est seul à connaître), pas quelque chose que je peux déduire — ticketé au BACKLOG.

import type { DatedDelta } from './dailyRefine';
import { isAnnualSubscription } from '../../utils/subscriptions';

/** Forme minimale d'un poste récurrent — évite de coupler ce module au type complet. */
export interface MinimalRecurring {
    payee: string;
    averageAmount: number;
    dayOfMonth: number;
    lastDate: string;
    yearlyCost: number;
}

/**
 * Mouvements DATÉS d'un mois calendaire donné, à partir des postes récurrents.
 *
 * @param month Mois 0-based (comme `Date`), pour décider si un poste ANNUEL tombe ce mois-ci.
 *
 * ⚠️ SIGNE : `averageAmount` est un COÛT positif (convention de `utils/subscriptions.ts`, où
 * `yearlyCost = averageAmount × 12`). Dans une série de SOLDE, une dépense doit descendre → on
 * renvoie l'opposé. Se tromper de signe ferait monter le solde à chaque prélèvement, ce qui est le
 * genre d'erreur qu'un graphe rend invisible parce qu'il « a l'air » plausible.
 *
 * ⚠️ ANNUEL ≠ MENSUEL : un abonnement annuel ne doit apparaître que dans SON mois, sinon un poste à
 * 200 $/an serait compté douze fois. Le mois d'échéance est dérivé de `lastDate` — même source que
 * `subscriptionDueLabel`, pour que l'affichage et le calcul ne divergent jamais. Une `lastDate`
 * illisible ⇒ le poste est traité comme MENSUEL (sur-affichage) : ne jamais MASQUER une facture est
 * la direction de risque sûre, exactement la convention déjà retenue par `isAnnualSubscription`.
 */
export function datedDeltasForMonth(
    recurring: ReadonlyArray<MinimalRecurring>,
    month: number,
): DatedDelta[] {
    const out: DatedDelta[] = [];
    for (const r of recurring) {
        const amount = Number(r.averageAmount);
        if (!Number.isFinite(amount) || amount === 0) continue;
        if (!Number.isFinite(Number(r.dayOfMonth))) continue;

        if (isAnnualSubscription(r)) {
            const d = new Date(r.lastDate);
            const dueMonth = Number.isNaN(d.getTime()) ? null : d.getMonth();
            // `null` (date illisible) ⇒ on ne saute PAS : cf. l'avertissement ci-dessus.
            if (dueMonth !== null && dueMonth !== month) continue;
        }

        out.push({ day: Number(r.dayOfMonth), amount: -amount, label: r.payee || 'Récurrent' });
    }
    return out;
}

// ── Cadence HEBDOMADAIRE (paie et dettes) ────────────────────────────────────────────────────
//
// Réponse de Marc 2026-08-06 à la question A13 : « chaque semaine jeudi, pareil pour dette ».
// C'est l'information qui manquait — sans elle, la paie et les dettes n'avaient AUCUN jour dans le
// modèle et restaient lissées sur le mois.

/** Jeudi (0 = dimanche), réponse de Marc. Paramétrable : c'est un argument, pas un `if` en dur. */
export const DEFAULT_PAY_DAY_OF_WEEK = 4;

/** Semaines par an, pour convertir un montant MENSUEL du store en montant par versement. */
const WEEKS_PER_YEAR = 52;
const MONTHS_PER_YEAR = 12;

/** Jours du mois (1-based) tombant sur `dayOfWeek`. Un mois en compte 4 ou 5. */
export function weeklyOccurrencesInMonth(year: number, month: number, dayOfWeek: number): number[] {
    const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const out: number[] = [];
    for (let d = 1; d <= days; d++) {
        if (new Date(Date.UTC(year, month, d)).getUTCDay() === dayOfWeek) out.push(d);
    }
    return out;
}

/**
 * Versements HEBDOMADAIRES d'un montant connu au MOIS, posés à leur vrai jour.
 *
 * @param monthlyAmount Montant mensuel tel que le store le porte (`netSalary`, `minimumPayment`).
 * @param sign `+1` pour une entrée (paie), `-1` pour une sortie (dette).
 *
 * ⚠️ **Les mois à 5 jeudis reçoivent bien 5 versements — c'est la RÉALITÉ, pas un bug.** Un salaire
 * hebdomadaire donne des « mois à 5 paies », et c'est précisément ce que Marc veut voir en zoomant.
 * La somme du mois dépasse alors le montant mensuel du store ; le raffinement l'absorbe dans son
 * résidu et la fin de mois retombe EXACTEMENT sur la valeur du moteur (invariant de `dailyRefine`).
 * ⚠️ Limite ASSUMÉE, à ne pas laisser croire résolue : le moteur, lui, reste mensuel — il ignore les
 * mois à 5 paies. Le RYTHME affiché est juste, le TOTAL du mois reste celui du moteur.
 */
export function weeklyDeltasForMonth(
    year: number,
    month: number,
    monthlyAmount: number,
    label: string,
    sign: 1 | -1,
    dayOfWeek: number = DEFAULT_PAY_DAY_OF_WEEK,
): DatedDelta[] {
    const m = Number(monthlyAmount);
    if (!Number.isFinite(m) || m === 0) return [];
    const perOccurrence = (m * MONTHS_PER_YEAR) / WEEKS_PER_YEAR;
    return weeklyOccurrencesInMonth(year, month, dayOfWeek).map((day) => ({
        day,
        amount: sign * Math.abs(perOccurrence),
        label,
    }));
}

// ⚠️ [FUTUR-DAILY-INFOBULLE-ONLY 2026-08-11] `dailyDeltasFor` et `datedCoverageForMonth` ont été
// RETIRÉS d'ici : leur dernier consommateur (le tableau jour-par-jour sous la courbe) a été supprimé
// à la demande de Marc — le détail du jour vit dans l'infobulle, uniquement. La composition des
// mouvements datés vit désormais dans `dailyLedger.datedContextFor` (qui les SÉPARE par nature,
// paie / récurrentes / dettes / impôt, parce qu'ils n'affectent pas les mêmes champs).
