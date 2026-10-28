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

// ── [SUBS-TAB] Marchands ÉCARTÉS (« ce n'est pas un abonnement ») ────────────────────────────
//
// Choix Marc 2026-08-05 : « ne plus jamais le proposer ». Sans ça, un faux positif revenait à
// CHAQUE actualisation, indéfiniment — épingler confirmait, mais rien ne permettait de refuser.
//
// ⚠️ On persiste des CLÉS (marchands normalisés), pas des objets : le refus porte sur le marchand,
// pas sur une occurrence datée dont les montants bougent. Un `RecurringItem` complet stocké ici
// serait périmé dès le prochain débit.
//
// ⚠️ « Ne plus jamais » reste RÉVERSIBLE (`restoreSubscription`) : un refus définitif ET invisible
// serait un piège — un mauvais clic effacerait un vrai abonnement sans recours, et Marc chercherait
// pourquoi Netflix a disparu de sa liste. Le compte des écartés doit rester visible à l'écran.

/** Le marchand a-t-il été écarté explicitement ? */
export function isDismissed(dismissedKeys: readonly string[], sub: Pick<RecurringItem, 'payee'>): boolean {
    return dismissedKeys.includes(subscriptionKey(sub));
}

/** Écarte un marchand (idempotent). Renvoie une nouvelle liste de clés. */
export function dismissSubscription(dismissedKeys: readonly string[], sub: Pick<RecurringItem, 'payee'>): string[] {
    const key = subscriptionKey(sub);
    return dismissedKeys.includes(key) ? [...dismissedKeys] : [...dismissedKeys, key];
}

/** Ré-autorise un marchand écarté (le rend de nouveau détectable). */
export function restoreSubscription(dismissedKeys: readonly string[], key: string): string[] {
    return dismissedKeys.filter((k) => k !== key);
}

/**
 * Liste à AFFICHER = abos ÉPINGLÉS (persistés) + abos DÉTECTÉS non déjà épinglés (dédup par marchand),
 * moins les marchands ÉCARTÉS. Les épinglés gagnent (montant/jour confirmés par l'utilisateur priment
 * sur une re-détection). Pur.
 *
 * ⚠️ Le filtre des écartés s'applique AUSSI aux épinglés : écarter puis ré-actualiser ne doit pas
 * ressusciter l'abo par la porte de derrière. Le handler d'UI désépingle en même temps, mais le
 * module ne s'y FIE pas — un état incohérent venant du Drive ou d'un backup se corrige ici.
 *
 * ⚠️ `dismissedKeys` est OPTIONNEL et vaut `[]` par défaut : champ additif, aucun bump de schéma,
 * et tout appelant existant garde un comportement bit-identique.
 */
export function mergeSubscriptions(
    pinned: readonly RecurringItem[],
    detected: readonly RecurringItem[],
    dismissedKeys: readonly string[] = [],
): RecurringItem[] {
    const dismissed = new Set(dismissedKeys);
    const keptPinned = pinned.filter((p) => !dismissed.has(subscriptionKey(p)));
    const seen = new Set(keptPinned.map(subscriptionKey));
    const extra = detected.filter((d) => {
        const k = subscriptionKey(d);
        return !seen.has(k) && !dismissed.has(k);
    });
    return [...keptPinned, ...extra];
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

/**
 * [HEALTH-RATIOS-NAN-ABSORBE-EN-AMONT] Total annuel des abos AVEC l'inventaire de ce qui a été
 * ÉCARTÉ. Deux portes plutôt qu'une (leçon `TRACER-AU-LIEU-DE-JETER-DESARME-LA-GARDE-AVAL`) :
 *   - le TOTAL, pour LIRE — un écran qui affiche « X $/mois » a raison d'écarter un coût
 *     illisible et de montrer la somme des autres ;
 *   - `discarded`, pour ÉCRIRE — un CALCUL qui produit un score doit pouvoir REFUSER, parce
 *     qu'un terme jeté fait un total plus PETIT, donc un score meilleur, sans rien qui crie.
 * Mesuré sur `computeSubscriptionLoadScore` : un `yearlyCost: Infinity` (ou `NaN`) faisait passer
 * le coût mensuel de 95 $ à 20 $ et le score de 87,3 à **97,3**, `available: true`, aucune trace.
 */
export function totalYearlyCostAudit(subs: readonly RecurringItem[]): { total: number; discarded: number } {
    let total = 0;
    let discarded = 0;
    for (const s of subs) {
        const y = Number(s.yearlyCost);
        if (Number.isFinite(y)) total += y;
        else discarded++;
    }
    return { total, discarded };
}

/** Total ANNUEL des abos = Σ yearlyCost (chaque abo déjà annualisé correctement). Porte de LECTURE :
 *  écarte silencieusement un coût non fini. Pour un CALCUL, passer par `totalYearlyCostAudit`. */
export function totalYearlyCost(subs: readonly RecurringItem[]): number {
    return totalYearlyCostAudit(subs).total;
}

/** Total MENSUEL équivalent = Σ monthlyEquivalent = totalYearlyCost/12 (pas de ×12 d'un annuel). */
export function totalMonthlyCost(subs: readonly RecurringItem[]): number {
    return totalYearlyCost(subs) / 12;
}
