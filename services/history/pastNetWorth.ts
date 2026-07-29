// services/history/pastNetWorth.ts
// [FUTUR-REAL-HISTORY] Patrimoine net d'un point du PASSÉ reconstruit (courbe Futur, monthIndex < 0).
//
// Pourquoi ce helper : le préfixe passé (`FutureProjection.tsx`) doit calculer un patrimoine net qui se
// RACCORDE EXACTEMENT à ce qui est affiché aujourd'hui — même formule, mêmes dettes soustraites, sinon la
// courbe SAUTE à « aujourd'hui » (bug MONEY-PHANTOM d'un endetté : le passé, sans dettes, était gonflé de
// tout le solde des dettes vs le futur qui les soustrait dès le mois 0).
//
// Décision Marc 2026-07-24 (Option A) : le passé soustrait les dettes AU NIVEAU ACTUEL (`DettesNonImmo` du
// moteur, l'unique source de vérité de la dette) — approximation ASSUMÉE et SIGNALÉE (on n'a pas l'historique
// d'amortissement des dettes génériques ; seul le solde courant existe). Le raccord au présent devient EXACT ;
// le milieu du passé suppose la dette constante (documenté dans le bandeau du graphe). ⚠️ [FUTUR-PAST-DEBT-
// FREEZE 2026-07-29] Le raccord « EXACT » suppose que l'APPELANT passe une valeur FRAÎCHE (`liveResults`,
// jamais le blob figé de PROJECTION-PERSIST) — ce helper reste agnostique, la responsabilité vit dans
// `FutureProjection.tsx` (commentaire dédié à l'emplacement où `currentDebtNonImmo` est dérivé).
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
        liquidDebt: 0,
        smithManoeuvreDebt: 0,
        activeDebtsTotal: debtNonImmo,
    }));
}
