// mcp/vehiculeBail.ts
//
// [VEHICULE-BAIL] Ce que FinanceAI sait du bail du véhicule, pour CarAI — et RIEN d'autre.
//
// POURQUOI CE MODULE EXISTE. CarAI connaît les TERMES du bail (dates, kilométrage alloué,
// tarifs) mais aucun DOLLAR : ni mensualité, ni montant financé, ni solde. Ces chiffres
// vivent ici, dans la dette que Marc a enregistrée. Le `/hub/summary` ne les publie pas
// (valeur nette, cashflow, liquidités, placements) et ne DOIT pas les publier : une carte
// de hub a six métriques, et le bail d'une voiture n'y a pas sa place.
//
// ⚠️ PÉRIMÈTRE VOLONTAIREMENT MINUSCULE. Ce module ne rend QUE la dette du véhicule. Pas
// le patrimoine, pas les autres dettes, pas les transactions. Un endpoint qui rendrait
// « l'état » serait un second `/mcp` sans son OAuth — c'est exactement ce qu'on ne veut pas.
//
// ⚠️ FONCTION PURE : l'état et l'instant sont des PARAMÈTRES. Aucun accès réseau, aucun
// `Date.now()` caché — c'est ce qui rend la sélection testable sans serveur ni blob.

import type { AppState, Debt } from '../types';

/** Ce que l'endpoint publie. Tout champ que l'état ne porte pas est `null` ET nommé dans
 *  `champsAbsents` : un consommateur ne doit jamais avoir à deviner si un `null` veut dire
 *  « zéro » ou « je ne sais pas ». */
export interface BailVehicule {
    /** Nom de la dette tel qu'il est enregistré dans FinanceAI. */
    nom: string;
    devise: 'CAD';
    /** Solde ACTUELLEMENT dû. */
    solde: number;
    /** Versement mensuel. `null` si absent ou non strictement positif. */
    mensualite: number | null;
    /** Taux annuel en pourcent (0 pour un bail sans intérêt). */
    tauxAnnuelPourcent: number;
    /** Montant financé à l'ORIGINE, si renseigné. ⚠️ Ce n'est PAS le total qui sera versé
     *  dès que le taux est non nul — le total versé est `mensualite × durée`. Il sert de
     *  CONTRÔLE de cohérence, jamais de numérateur. */
    montantOrigine: number | null;
    /** AAAA-MM-JJ, début du bail, si renseigné. */
    debut: string | null;
    /** AAAA-MM-JJ, fin du terme, si renseignée. */
    finTerme: string | null;
    /** Noms des champs que l'état ne porte pas — le consommateur s'abstient au lieu d'inventer. */
    champsAbsents: string[];
    /** Quand le blob d'état a été rafraîchi (ISO), ou `null` si la source ne date rien. */
    dataAsOf: string | null;
}

export type ResultatBail =
    | { statut: 'trouve'; bail: BailVehicule }
    | { statut: 'introuvable'; raison: string }
    | { statut: 'ambigu'; candidates: string[] };

/** Normalise un nom pour la comparaison : casse et espaces de bord seulement. On ne
 *  normalise PAS les accents — deux dettes qui ne diffèrent que par un accent sont deux
 *  dettes différentes, et les confondre publierait la mauvaise. */
function memeNom(a: string, b: string): boolean {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Les dettes candidates à être « le véhicule », par ordre de PRÉCISION décroissante.
 *
 * ⚠️ Le repli par `category` n'est pas un raffinement : c'est le chemin RÉEL. `kind`
 * (`'auto-lease'`) est le discriminant le plus juste, mais **aucun producteur ne l'écrit**
 * — l'outil MCP `apply_debt` ne l'expose pas, et une dette saisie dans l'app peut très
 * bien ne porter que sa `category`. Sélectionner sur le seul `kind` ne trouverait donc
 * rien chez un utilisateur réel.
 */
function candidates(debts: readonly Debt[]): Debt[] {
    const parKind = debts.filter((d) => d.kind === 'auto-lease');
    if (parKind.length > 0) return parKind;
    const parKindAuto = debts.filter((d) => d.kind === 'auto');
    if (parKindAuto.length > 0) return parKindAuto;
    return debts.filter((d) => d.category === 'Car');
}

/**
 * Choisit la dette du véhicule et la met en forme.
 *
 * @param nomVoulu nom exact configuré par l'utilisateur (variable d'environnement). Quand il
 *   est fourni, il PRIME : c'est le seul moyen de trancher quand deux véhicules coexistent.
 */
export function bailVehicule(
    state: AppState,
    options: { nomVoulu?: string | null; dataAsOf?: number | null } = {},
): ResultatBail {
    const debts = state.debts ?? [];
    const nomVoulu = options.nomVoulu?.trim();

    if (nomVoulu) {
        const exact = debts.filter((d) => memeNom(d.name, nomVoulu));
        if (exact.length === 0) {
            return { statut: 'introuvable', raison: `Aucune dette nommée « ${nomVoulu} ».` };
        }
        // Deux dettes du MÊME nom ne devraient pas exister (`apply_debt` écrase par nom), mais
        // l'app permet la saisie libre : on refuse plutôt que d'en choisir une au hasard.
        if (exact.length > 1) return { statut: 'ambigu', candidates: exact.map((d) => d.name) };
        return { statut: 'trouve', bail: publier(exact[0]!, options.dataAsOf ?? null) };
    }

    const trouvees = candidates(debts);
    if (trouvees.length === 0) {
        return {
            statut: 'introuvable',
            raison: "Aucune dette de véhicule (kind « auto-lease »/« auto », ou catégorie « Car »).",
        };
    }
    if (trouvees.length > 1) return { statut: 'ambigu', candidates: trouvees.map((d) => d.name) };
    return { statut: 'trouve', bail: publier(trouvees[0]!, options.dataAsOf ?? null) };
}

/** Un nombre utilisable, ou `null`. `NaN`/`Infinity` sont traités comme ABSENTS : un montant
 *  non fini qui traverse vaut un chiffre faux chez le consommateur, et « je ne sais pas » est
 *  toujours préférable. */
function fini(v: number | undefined | null): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function publier(d: Debt, dataAsOfMs: number | null): BailVehicule {
    const champsAbsents: string[] = [];

    const mensualite = fini(d.minimumPayment);
    // Un versement de 0 n'est pas un versement : il rendrait le total du bail nul, donc une
    // barre « 0 payé sur 0 » qui a l'air d'une mesure. Absent, on le dit.
    const mensualiteUtile = mensualite !== null && mensualite > 0 ? mensualite : null;
    if (mensualiteUtile === null) champsAbsents.push('mensualite');

    const montantOrigine = fini(d.originalBalance);
    if (montantOrigine === null) champsAbsents.push('montantOrigine');

    const debut = typeof d.startDate === 'string' && d.startDate.length > 0 ? d.startDate : null;
    if (debut === null) champsAbsents.push('debut');

    const finTerme = typeof d.termEndDate === 'string' && d.termEndDate.length > 0 ? d.termEndDate : null;
    if (finTerme === null) champsAbsents.push('finTerme');

    return {
        nom: d.name,
        devise: 'CAD',
        solde: fini(d.balance) ?? 0,
        mensualite: mensualiteUtile,
        tauxAnnuelPourcent: fini(d.interestRate) ?? 0,
        montantOrigine,
        debut,
        finTerme,
        champsAbsents,
        dataAsOf: dataAsOfMs === null ? null : new Date(dataAsOfMs).toISOString(),
    };
}
