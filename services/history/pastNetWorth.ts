// services/history/pastNetWorth.ts
// [FUTUR-REAL-HISTORY] Patrimoine net d'un point du PASSÉ reconstruit (courbe Futur, monthIndex < 0).
//
// Pourquoi ce helper : le préfixe passé (`FutureProjection.tsx`) doit calculer un patrimoine net qui se
// RACCORDE EXACTEMENT à ce qui est affiché aujourd'hui — même formule, mêmes dettes soustraites, sinon la
// courbe SAUTE à « aujourd'hui » (bug MONEY-PHANTOM d'un endetté : le passé, sans dettes, était gonflé de
// tout le solde des dettes vs le futur qui les soustrait dès le mois 0).
//
// Décision Marc 2026-07-24 (Option A) : le passé soustrait les dettes à leur solde ACTUEL — approximation
// ASSUMÉE et SIGNALÉE (on n'a pas l'historique d'amortissement des dettes génériques ; seul le solde
// courant existe). Depuis `[PASSE-REEL-DETTE-1]` (2026-08-21), chaque dette n'entre dans ce total qu'À
// PARTIR de son `startDate` propre : l'appelant (`buildPastPrefix`/`dailyPastLedger`) retranche du total
// « aujourd'hui » (`debtNonImmo` passé ici) le solde des dettes pas-encore-commencées à CE mois passé
// (`sumNotYetStartedDebtsAtMonth`/`...AtAbsoluteMonth`, delta plutôt que resommation — cf commentaire
// dédié dans `debtSchedule.ts`) — le raccord au présent reste EXACT quand aucune dette n'est exclue
// (cas identique à avant ce lot), et le milieu du passé suppose chaque dette DÉJÀ COMMENCÉE constante
// (documenté dans le bandeau du graphe). ⚠️ [FUTUR-PAST-DEBT-FREEZE 2026-07-29] Le raccord « EXACT »
// suppose que l'APPELANT passe des valeurs FRAÎCHES (`liveResults`/store, jamais le blob figé de
// PROJECTION-PERSIST) — ce helper reste agnostique, la responsabilité vit dans `FutureProjection.tsx`.
//
// Route par `computeRawNetWorth` (SOURCE UNIQUE, `services/projection/netWorth.ts`) — JAMAIS une copie locale
// de la formule : `DettesNonImmo` entier va dans `activeDebtsTotal`, les autres termes de dette à 0 (l'immo
// `realEstateEquity` est DÉJÀ net d'hypothèque, comme dans le moteur). Un terme oublié = test rouge (le
// garde d'exhaustivité de `NetWorthParts`), + garde NaN gratuite.

import { computeRawNetWorth } from '../projection/netWorth';

/** Buckets de placement d'un point d'historique reconstruit (devise CAD, déjà FX-convertis). */
export interface PastInvestBuckets {
    CELI: number;
    CELIAPP: number;
    REER: number;
    REEE: number;
    NonReg: number;
    Crypto: number;
}

/**
 * Patrimoine net d'un mois passé = Σ(placements) + cash + équité immo − `debtNonImmo`.
 * @param inv          soldes de placement reconstruits à ce mois (CAD).
 * @param cash         cash reconstruit à ce mois (CAD).
 * @param immo         équité immobilière à ce mois (DÉJÀ nette d'hypothèque).
 * @param debtNonImmo  dettes hors hypothèque AU NIVEAU ACTUEL (`DettesNonImmo` du moteur, valeur FRAÎCHE
 *                     fournie par l'appelant — cf en-tête de fichier) — Option A.
 * @returns patrimoine net ARRONDI au dollar (cohérent avec le `Math.round` des points du moteur).
 */
export function pastNetWorthAt(
    inv: PastInvestBuckets,
    cash: number,
    immo: number,
    debtNonImmo: number,
    /** [ENG-W5-BUSINESS-OFFBALANCE] Valeur des entreprises privées détenues (0 par défaut).
     *  ⚠️ Le PASSÉ n'a AUCUN historique de valorisation d'une entreprise privée — il n'y a ni cours,
     *  ni relevé, ni transaction à reconstruire. L'appelant passe donc la valeur COURANTE, affichée
     *  PLATE sur tout le passé, ou `0` s'il n'en a pas. Même convention que l'immobilier, dont le
     *  passé est reconstruit par paliers faute de série. Inventer une courbe de valorisation serait
     *  de la donnée fabriquée ; laisser un TROU ferait sauter le patrimoine au raccord d'aujourd'hui. */
    privateBusinessValue = 0,
): number {
    return Math.round(computeRawNetWorth({
        liquid: cash,
        celi: inv.CELI,
        celiapp: inv.CELIAPP,
        reer: inv.REER,
        nonReg: inv.NonReg,
        crypto: inv.Crypto,
        reee: inv.REEE,
        realEstateEquity: immo,
        privateBusinessValue,
        liquidDebt: 0,
        smithManoeuvreDebt: 0,
        activeDebtsTotal: debtNonImmo,
    }));
}
