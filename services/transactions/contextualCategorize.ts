// services/transactions/contextualCategorize.ts
//
// [TX-CATEGORIZE] Décision de catégorie AVEC le contexte du marchand. Pur, zéro réseau.
//
// Deux étages, dans cet ordre :
//   1. règles déterministes sur le libellé (`ruleCategorizeDetailed`) — gratuites, reproductibles ;
//   2. promotion en « Abonnements » UNIQUEMENT chez un marchand ambigu dont le profil de récurrence
//      le prouve (≥ 3 occurrences, cadence reconnue, montant stable).
//
// C'est le correctif du bug rapporté par Marc (« ça met abonnement pour tout et n'importe quoi ») :
// un jeu acheté une fois sur Steam et un abonnement Steam mensuel portent le même libellé — seule
// la régularité les distingue. Avant, `APPLE\.COM`/`GOOGLE \*`/`MICROSOFT` suffisaient à classer en
// « Abonnements », et cette règle passait AVANT Santé/Loisirs/Magasinage.
//
// ⚠️ Ce module ne PROMEUT jamais un marchand sans règle : ne pas savoir ce qu'est un marchand et le
// voir revenir chaque mois ne suffit pas à le nommer (un loyer, une prime d'assurance et un prêt
// auto sont aussi mensuels et stables). Ces cas partent à l'IA, avec le profil en contexte.

import { ruleCategorizeDetailed, type RuleCategory } from '../import/categoryRules';
import { profileForPayee, type MerchantProfile } from './merchantProfile';

type CategorizationSource = 'rule' | 'recurrence';

interface ContextualCategorization {
    category: RuleCategory | null;
    /** `recurrence` = la catégorie vient d'être promue « Abonnements » par le profil du marchand. */
    source: CategorizationSource;
    /** Profil ayant motivé une promotion — pour l'expliquer à l'écran, jamais une décision muette. */
    profile?: MerchantProfile;
}

/**
 * Catégorise un libellé en tenant compte de l'historique du marchand.
 *
 * @param profiles profils construits par `buildMerchantProfiles` sur les DÉPENSES (hors transferts
 *                 et doublons — ils fausseraient la cadence).
 */
export function contextualCategorize(
    payee: string,
    profiles: ReadonlyMap<string, MerchantProfile>,
): ContextualCategorization {
    const ruled = ruleCategorizeDetailed(payee);
    if (!ruled.subscriptionCandidate) return { category: ruled.category, source: 'rule' };

    const profile = profileForPayee(profiles, payee);
    if (profile?.isRecurring) {
        return { category: 'Abonnements', source: 'recurrence', profile };
    }
    return { category: ruled.category, source: 'rule', profile };
}

/**
 * Phrase d'explication d'une catégorisation, destinée à l'écran de tri.
 * Sans montant : elle apparaît à côté de la transaction, dont le montant est déjà gaté par le mode
 * discret — y réinjecter un chiffre créerait une fuite à côté du gate (leçon AITOOLS-D).
 */
export function explainCategorization(result: ContextualCategorization): string {
    if (result.source !== 'recurrence' || !result.profile) return '';
    const p = result.profile;
    const cadence = p.cadence === 'monthly' ? 'tous les mois'
        : p.cadence === 'yearly' ? 'tous les ans'
            : p.cadence === 'quarterly' ? 'tous les trimestres'
                : p.cadence === 'weekly' ? 'toutes les semaines'
                    : 'régulièrement';
    return `Abonnement reconnu : ${p.count} fois, ${cadence}, montant stable.`;
}
