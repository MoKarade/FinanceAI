// services/projection/debtSchedule.ts
//
// [DETTE-DATES] Une dette a un DÉBUT et une FIN — demande Marc 2026-08-19 (« pour la dette de ma
// voiture la date de début est le 20 juillet mais j'ai jamais pu définir le début ni la fin du
// bail »). Avant ce lot, le moteur servait TOUTE dette du mois 0 jusqu'à extinction, sans jamais
// regarder de calendrier : un prêt qui commence dans six mois grevait déjà le budget d'aujourd'hui,
// et un bail de 48 mois continuait d'être payé pendant trente ans.
//
// ⚠️ DÉCISION MARC (2026-08-19), au moment de choisir ce que la date de fin FAIT :
// « arrêter le paiement ET signaler si le solde n'est pas nul ». Le solde résiduel n'est donc
// **jamais remis à zéro en silence** — il reste au bilan, visible, avec une alerte. C'est la seule
// lecture compatible avec le no-fake-data : effacer une dette parce qu'une date est passée
// fabriquerait du patrimoine.
//
// ⚠️ Cas d'usage de Marc : un **BAIL** auto, pas un prêt. Un bail n'amortit rien — c'est un loyer
// mensuel sur un terme fixe, puis on rend l'auto (ou on la rachète). Le modèle « solde + taux +
// paiement minimum » lui va mal, et c'est précisément pourquoi le signalement compte : à la fin du
// terme, le « solde » d'un bail saisi comme une dette ordinaire ne tombera généralement PAS à zéro,
// et cet écart doit se voir plutôt que d'être absorbé.
//
// Fonctions PURES, sans dépendance au moteur : testables sur des dates, pas sur une projection.

/** Ce que le moteur a besoin de savoir d'une dette pour décider de la servir ce mois-ci. */
export interface DebtDates {
    /** Début du prêt / du bail (YYYY-MM-DD). Absent ⇒ la dette a toujours couru. */
    startDate?: string;
    /** Fin du terme / du bail (YYYY-MM-DD). Absent ⇒ on paie jusqu'à extinction (comportement d'avant). */
    termEndDate?: string;
}

export type DebtPhase =
    /** Pas encore commencée : aucun paiement, aucun intérêt, elle n'est pas encore au bilan. */
    | 'a-venir'
    /** En cours : on la sert normalement. */
    | 'active'
    /** Terme échu : on cesse de payer. Le solde résiduel reste visible (jamais effacé). */
    | 'terminee';

/**
 * Le premier jour du mois `m` de la simulation, en UTC.
 *
 * ⚠️ On compare des MOIS, pas des jours. Marc a saisi « 20 juillet » : une dette qui commence le 20
 * d'un mois est due ce mois-là, pas le suivant — le moteur est mensuel, prétendre au jour près
 * serait une précision que le modèle n'a pas. Idem pour la fin : le dernier paiement tombe dans le
 * mois de la date de fin, celui-ci INCLUS.
 */
export function moisDeSimulation(startYear: number, startMonth: number, m: number): { annee: number; mois: number } {
    const total = startYear * 12 + startMonth + m;
    return { annee: Math.floor(total / 12), mois: total % 12 };
}

/** Convertit une date ISO en index de mois absolu (année × 12 + mois), ou `null` si illisible. */
export function moisAbsolu(dateIso: string | undefined): number | null {
    if (!dateIso) return null;
    const m = /^(\d{4})-(\d{2})/.exec(dateIso);
    if (!m) return null;
    const annee = Number(m[1]);
    const mois = Number(m[2]) - 1;
    if (!Number.isFinite(annee) || !Number.isFinite(mois) || mois < 0 || mois > 11) return null;
    return annee * 12 + mois;
}

/**
 * Dans quelle phase se trouve la dette au mois `m` de la simulation ?
 *
 * ⚠️ Une date ILLISIBLE est traitée comme ABSENTE (dette toujours active), jamais comme une
 * contrainte inventée : une saisie ratée ne doit pas faire disparaître une dette réelle du budget.
 * C'est le sens conservateur — on garde la dette, on ne l'efface pas.
 */
export function phaseDette(
    dette: DebtDates,
    startYear: number,
    startMonth: number,
    m: number,
): DebtPhase {
    const { annee, mois } = moisDeSimulation(startYear, startMonth, m);
    const courant = annee * 12 + mois;

    const debut = moisAbsolu(dette.startDate);
    if (debut !== null && courant < debut) return 'a-venir';

    const fin = moisAbsolu(dette.termEndDate);
    if (fin !== null && courant > fin) return 'terminee';

    return 'active';
}

/**
 * Le mois `m` est-il celui où le terme vient tout juste d'échoir ? Sert à n'émettre l'alerte
 * « solde non nul à la fin du terme » qu'UNE fois, au lieu de la répéter chaque mois pendant
 * vingt ans (une alerte permanente ne se lit plus comme une alerte —
 * cf. `EPURATION-SUPPRIME-LA-RESERVE`).
 */
export function estLePremierMoisApresLeTerme(
    dette: DebtDates,
    startYear: number,
    startMonth: number,
    m: number,
): boolean {
    const fin = moisAbsolu(dette.termEndDate);
    if (fin === null) return false;
    const { annee, mois } = moisDeSimulation(startYear, startMonth, m);
    return annee * 12 + mois === fin + 1;
}
