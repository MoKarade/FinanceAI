// services/projection/netWorth.ts
// Source UNIQUE de la formule du patrimoine net (money-critical, 2026-06-16).
//
// Pourquoi un helper : la formule était recopiée à 4 endroits (projection.ts ×3 pour
// rawNetWorth/prevNW + estateCalculation.ts pour finalRawNetWorth) et une copie OUBLIAIT
// `activeDebtsTotal` → le « Patrimoine projeté » de la succession divergeait du graphe de
// la valeur du solde des dettes. Un seul point de vérité élimine cette classe de bugs.
//
// Convention : `realEstateEquity` est DÉJÀ net d'hypothèque (currentValue − mortgage) → on
// ne re-soustrait PAS mortgageBalance. On soustrait les dettes NON déjà nettées dans un actif :
//   • liquidDebt          — découvert non couvert porté en dette
//   • smithManoeuvreDebt  — HELOC du levier Smith (l'actif réinvesti est compté dans nonReg)
//   • activeDebtsTotal    — prêts/cartes/auto préexistants

import { logError } from '../errorLogger';

export interface NetWorthParts {
    liquid: number;
    celi: number;
    celiapp: number;
    reer: number;
    nonReg: number;
    crypto: number;
    reee: number;
    realEstateEquity: number;
    /** [ENG-W5-BUSINESS-OFFBALANCE] Valeur des ENTREPRISES PRIVÉES détenues (W5.7), au prorata de la
     *  part détenue. Absente du patrimoine jusqu'au 2026-08-19 : seul `annualDividend` circulait,
     *  mesuré **2 M$ d'entreprise absents du NW**.
     *  ⚠️ On compte `estimatedValue × ownershipPct` et **PAS** `retainedEarnings` : une valeur juste
     *  marchande EMBARQUE déjà les bénéfices non répartis (l'encaisse de la société en fait partie).
     *  Les additionner double-compterait. Si un jour `estimatedValue` devait s'entendre HORS encaisse,
     *  ce serait une décision à écrire dans `docs/adr/`, pas un `+` discret ici. */
    privateBusinessValue: number;
    liquidDebt: number;
    smithManoeuvreDebt: number;
    activeDebtsTotal: number;
}

/**
 * [HARDEN-NETWORTH-EXHAUSTIVE] Signe de CHAQUE terme du patrimoine net : +1 = actif, −1 = dette.
 * Le type `Record<keyof NetWorthParts, …>` FORCE le compilateur à classer TOUT champ de `NetWorthParts` :
 * ajouter un champ à l'interface sans lui donner un signe ici CASSE le typecheck. Couplé au test croisé
 * (`tests/services/netWorth.test.ts` : « formule littérale == Σ signe×valeur »), un nouveau champ ajouté à
 * l'interface + au sign-map mais OUBLIÉ dans la formule littérale fait ÉCHOUER le test → la classe de bug
 * MONEY-PHANTOM (terme d'actif/dette oublié = patrimoine faux, bug Marc « -193 k$ » 2026-06-16) devient
 * STRUCTURELLEMENT impossible. ⚠️ La formule littérale ci-dessous reste la SOURCE d'exécution (hot-path
 * du moteur mensuel × Monte-Carlo, inchangée et prouvée) — le sign-map n'est qu'un filet compile-time + test.
 */
export const NET_WORTH_SIGN: Record<keyof NetWorthParts, 1 | -1> = {
    liquid: 1, celi: 1, celiapp: 1, reer: 1, nonReg: 1, crypto: 1, reee: 1, realEstateEquity: 1,
    privateBusinessValue: 1,
    liquidDebt: -1, smithManoeuvreDebt: -1, activeDebtsTotal: -1,
};

/** [HARDEN-NETWORTH-NAN] Signatures de termes non finis déjà journalisées (throttle) — voir
 *  `computeRawNetWorth`. Module-scope car le throttle est intrinsèquement avec état. */
const loggedNonFiniteSignatures = new Set<string>();

/** Test-only : remet à zéro le throttle de journalisation NaN (isolation entre tests). */
export function __resetNonFiniteSignatureLog(): void {
    loggedNonFiniteSignatures.clear();
}

/** Formule littérale (SOURCE d'exécution prouvée, hot-path moteur mensuel × Monte-Carlo). Extraite en
 *  helper module-scope (zéro alloc par appel) pour être l'UNIQUE formule, réutilisée par le garde NaN
 *  ci-dessous sur le chemin lent — sans risque de dérive entre chemin sain et chemin sanitisé. */
function sumNetWorthParts(p: NetWorthParts): number {
    return p.liquid + p.celi + p.celiapp + p.reer + p.nonReg + p.crypto + p.reee + p.realEstateEquity + p.privateBusinessValue
        - p.liquidDebt - p.smithManoeuvreDebt - p.activeDebtsTotal;
}

/**
 * Patrimoine net = Σ(actifs) − Σ(dettes non nettées). Source unique appelée par le moteur
 * mensuel (rawNetWorth + prevNW) ET la succession (finalRawNetWorth) → jamais de dérive.
 * Tout terme ajouté ici doit l'être dans `NET_WORTH_SIGN` (garde d'exhaustivité, voir ci-dessus).
 *
 * [HARDEN-NETWORTH-NAN] Garde de finitude : un seul terme NaN/Infinity (solde corrompu, division par 0
 * en amont) rendait TOUT le patrimoine NaN → graphe vide, SANS trace (échec silencieux). Désormais un
 * total non fini déclenche un chemin LENT (rare) qui rabat chaque terme fautif sur 0, JOURNALISE
 * (`logError` source 'projection', avec les termes en cause) et recalcule. Le chemin SAIN ne paie qu'un
 * `Number.isFinite` (formule inchangée). Miroir runtime de la garde dette `sumActiveDebts` (projection.ts),
 * complétée pour TOUS les termes (actifs inclus) + traçabilité.
 */
export function computeRawNetWorth(p: NetWorthParts): number {
    const raw = sumNetWorthParts(p);
    if (Number.isFinite(raw)) return raw;

    const safe: NetWorthParts = { ...p };
    const offending: Record<string, unknown> = {};
    for (const key of Object.keys(NET_WORTH_SIGN) as (keyof NetWorthParts)[]) {
        if (!Number.isFinite(p[key])) {   // évalue l'ORIGINAL `p` (lisibilité : indépendant de l'ordre de mutation de `safe`)
            offending[key] = p[key];
            safe[key] = 0;
        }
    }
    // Throttle : `computeRawNetWorth` est hot-path (moteur mensuel × Monte-Carlo) → sur un état persistant-NaN,
    // journaliser à CHAQUE appel thrasherait le localStorage de `logError`. On logge UNE fois par SIGNATURE de
    // termes fautifs (signal MAXIMAL — chaque motif de corruption distinct remonte — sans le flood des répétitions).
    const signature = Object.keys(offending).sort().join(',');
    if (!loggedNonFiniteSignatures.has(signature)) {
        loggedNonFiniteSignatures.add(signature);
        logError({
            source: 'projection',
            message: 'computeRawNetWorth : terme(s) du patrimoine non fini(s) rabattu(s) sur 0',
            context: { offending },
        });
    }
    return sumNetWorthParts(safe);
}
