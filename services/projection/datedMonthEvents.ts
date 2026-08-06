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

/**
 * Les postes récurrents que l'app peut réellement DATER, vs ceux qu'elle ne peut pas.
 * Sert à l'écran pour dire honnêtement ce qui est mesuré — et pour ne pas laisser croire que la
 * totalité des flux futurs d'un mois est placée à la bonne date.
 */
export function datedCoverageForMonth(
    recurring: ReadonlyArray<MinimalRecurring>,
    month: number,
): { datedCount: number; datedAmount: number } {
    const deltas = datedDeltasForMonth(recurring, month);
    return {
        datedCount: deltas.length,
        datedAmount: deltas.reduce((s, d) => s + Math.abs(d.amount), 0),
    };
}
