// services/projection/lifetimeTax.ts
//
// [ENG-RANKTAX-ESTATE] Décision Marc A4 (2026-08-20, ADR 0014) : « TOUT » — l'objectif
// « impôt minimum » score l'impôt TOTAL, successoral inclus. Avant, il ne scorait que
// `totalTaxesPaid` (les règlements d'avril) : « impôt minimum » RÉCOMPENSAIT le report —
// mesuré au panel #554 : PRIO_CELI classé 1er avec ttp −189 849 $ MAIS 1 299 510 $ d'impôt
// successoral ignoré (3,6× l'impôt total de MELTDOWN).
//
// SOURCE UNIQUE de la grandeur : trois registres DISJOINTS du moteur (projection.ts §retour),
// jamais recomposés à la main chez un consommateur — deux copies divergent en silence.
//   · totalTaxesPaid        — impôt réglé du vivant (Σ FluxImpots, identité testée)
//   · unsettledTaxAtHorizon — dette fiscale réconciliée non réglée à l'horizon (signée)
//   · totalEstateTax        — impôt de liquidation successorale
// NB [PROJ-TAXPAID-SOLDE-AVRIL] : totalTaxesPaid omet les retenues salariales (incorporées au
// net saisi) — biais CONSTANT entre stratégies d'un même profil, sans effet sur un CLASSEMENT ;
// la refonte du compteur lui-même est un ticket séparé.

export interface LifetimeTaxParts {
    totalTaxesPaid?: number;
    unsettledTaxAtHorizon?: number;
    totalEstateTax?: number;
}

/** Impôt total d'un scénario : vivant + dette à l'horizon + successoral. Un terme non fini
 *  compte pour 0 (patron du dépôt : jamais un défaut numérique silencieux qui se propage). */
export const lifetimeTaxTotal = (s: LifetimeTaxParts | null | undefined): number => {
    const n = (v: number | undefined): number => (Number.isFinite(v) ? (v as number) : 0);
    return n(s?.totalTaxesPaid) + n(s?.unsettledTaxAtHorizon) + n(s?.totalEstateTax);
};
