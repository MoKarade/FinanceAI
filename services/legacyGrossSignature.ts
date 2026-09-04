// [MIGRATE-GROSS-PROPOSER] Détection de la signature du brut FABRIQUÉ par l'ancien défaut, et
// calcul du brut de remplacement à PROPOSER. Décision de Marc (2026-09-03) : proposer en
// DEMANDANT — aucune écriture automatique, jamais. Écraser une saisie est irréversible côté app,
// et une coïncidence est possible : la détection ne peut qu'ouvrir la question, l'utilisateur
// tranche.
//
// HISTOIRE DE LA SIGNATURE. Jusqu'au lot [MIGRATE-GROSS-135] (2026-08-20), `migrateUserConfig`
// (store) écrivait `grossSalary: Math.round(net * 1.35)` — en MENSUEL — dès que le brut manquait,
// et le PERSISTAIT. Le correctif a remplacé le facteur plat par l'inversion fiscale exacte, mais
// `u.grossSalary || (…)` court-circuite : les configs déjà écrites gardent leur brut fabriqué
// ([MIGRATE-GROSS-DEJA-PERSISTE]). C'est ce reliquat que ce module détecte.
//
// ⚠️ LIMITES de la détection, assumées :
// - C'est une borne INFÉRIEURE : si l'utilisateur a modifié son net APRÈS la fabrication, la
//   signature ne matche plus et le brut fabriqué devient indétectable. Rien à faire de fiable là.
// - Une COÏNCIDENCE est possible (un vrai brut qui vaut exactement 1,35× le net) : d'où le bouton
//   « C'est bien mon brut », qui pose `grossSalaryConfirmed` et éteint l'avis pour toujours — un
//   avertissement permanent est un avertissement mort.
//
// ⚠️ `1.35` ci-dessous n'est PAS une valeur fiscale : c'est la signature FORENSIQUE de l'ancien
// défaut (le ratchet fiscal l'a chassée des modules d'impôt, et c'est très bien). La reproduire
// ici est le seul moyen de reconnaître ce que l'ancien code a écrit.

import { ageOptsForSalaryInversion, calculateGrossFromNet } from '../utils/tax';

/** Le facteur de l'ancien repli — figé à jamais : il décrit un code MORT, il n'évolue pas. */
export const LEGACY_GROSS_FACTOR = 1.35;

export interface LegacySignatureUser {
    netSalary?: number;
    salary?: number;
    grossSalary?: number;
    grossSalaryConfirmed?: boolean;
    age?: number;
    birthYear?: number;
    salarySource?: { kind: 'payslip' | 'mcp' | 'manual' };
}

/**
 * Le brut de cet utilisateur porte-t-il la signature EXACTE de l'ancienne fabrication ?
 * Égalité stricte au dollar mensuel : c'est ce que `Math.round(net * 1.35)` a écrit, ni plus ni
 * moins — un seuil « à peu près 1,35× » multiplierait les faux positifs sans rien détecter de plus.
 */
export function hasLegacyGross135Signature(u: LegacySignatureUser | undefined): boolean {
    if (!u) return false;
    if (u.grossSalaryConfirmed) return false;
    // Un salaire estampillé fiche de paie / MCP vient d'un document réel : son brut est une vraie
    // donnée, même s'il coïncide avec la signature. L'ancien fabricant (migration du store)
    // n'estampillait rien.
    const kind = u.salarySource?.kind;
    if (kind === 'payslip' || kind === 'mcp') return false;
    // Même dérivation du net que l'ancien fabricant (`u.netSalary || u.salary || 0`).
    const net = u.netSalary || u.salary || 0;
    const gross = u.grossSalary || 0;
    if (net <= 0 || gross <= 0) return false;
    return gross === Math.round(net * LEGACY_GROSS_FACTOR);
}

/**
 * Le brut MENSUEL à proposer en remplacement : la même inversion fiscale exacte que le moteur et
 * que la migration actuelle du store (dichotomie < 1 $, crédits d'âge par utilisateur, mêmes
 * conventions d'unités — le store est MENSUEL, l'inversion travaille en ANNUEL).
 */
export function proposedGrossMonthlyFromNet(
    u: LegacySignatureUser | undefined,
    year: number,
    activeUsersCount: number,
): number {
    const net = u?.netSalary || u?.salary || 0;
    if (net <= 0) return 0;
    return Math.round(calculateGrossFromNet(net * 12, year, ageOptsForSalaryInversion(u, year, activeUsersCount)) / 12);
}
