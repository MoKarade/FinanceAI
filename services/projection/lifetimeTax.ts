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
// net saisi — mesuré ~732 k$ sur 10 ans d'un couple à 120 k$/pers, ~4× le « total » publié).
// Ce biais est constant entre stratégies UNIQUEMENT quand T1213 est OFF ; sous T1213
// (optimizeSourceDeductions), la retenue absorbe les déductions REER qui DÉPENDENT de la
// stratégie — écart mesuré 107 530 $ entre PRIO_REER et PRIO_CELI (relecture #681). La refonte
// du compteur est un ticket séparé ; d'ici là, « total » signifie « total MODÉLISÉ ».

export interface LifetimeTaxParts {
    totalTaxesPaid?: number;
    unsettledTaxAtHorizon?: number;
    totalEstateTax?: number;
}

/** Impôt total MODÉLISÉ d'un scénario : réglé du vivant + dette à l'horizon + successoral
 *  (HORS retenue salariale, cf. note ci-dessus). Un terme non fini compte pour 0 — garde
 *  REDONDANTE par construction : les trois producteurs assainissent déjà en amont
 *  (projection.ts:2269/2271, estateCalculation fin()) ; défense en profondeur, ne pas retirer
 *  un garde amont en croyant celui-ci suffisant. */
export const lifetimeTaxTotal = (s: LifetimeTaxParts | null | undefined): number => {
    const n = (v: number | undefined): number => (Number.isFinite(v) ? (v as number) : 0);
    return n(s?.totalTaxesPaid) + n(s?.unsettledTaxAtHorizon) + n(s?.totalEstateTax);
};
