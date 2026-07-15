// services/celiNudge.ts
//
// [CELI-ASSET-NUDGE] — l'app suit les VIREMENTS CELI sortants (transactions) mais pas le compte
// destinataire : un utilisateur qui cotise à son CELI chez un courtier externe (Wealthsimple, Disnat…)
// voit « CELI : 0 $ » alors qu'il y a de vrais avoirs → patrimoine SOUS-estimé (cas Marc : ~24 k$
// cotisés, 0 affiché). Audit CONFIRMED (finding #6, 2026-07-14).
//
// ⚠️ NO-FAKE-DATA : on ne DÉRIVE JAMAIS le solde CELI de la somme des virements (= un COÛT cumulé,
// pas une VALEUR de marché). On DÉTECTE seulement l'incohérence « des virements CELI mais aucun avoir
// CELI saisi » et on invite l'utilisateur à saisir ses vrais avoirs. Le montant viré n'est affiché
// que comme CONTEXTE (« tu as viré ~X $ »), jamais comme un solde.

import type { Transaction, Asset } from '../types';

/** Un virement compte comme « vers le CELI » si son libellé mentionne CELI/TFSA. */
const CELI_PAYEE = /\bCELI\b|\bTFSA\b/i;

/** Seuil sous lequel on n'ennuie pas l'utilisateur (bruit : petits virements ponctuels). */
export const CELI_NUDGE_MIN_TRANSFERRED = 1000;

export interface CeliNudgeStatus {
    /** Afficher le nudge ? (des virements CELI significatifs ET aucun avoir CELI enregistré). */
    shouldShow: boolean;
    /** Total (positif) viré vers le CELI d'après les transactions — CONTEXTE, jamais un solde. */
    transferredTotal: number;
    /** Un actif de compte CELI existe-t-il déjà ? */
    hasCeliAssets: boolean;
}

/**
 * Détecte l'incohérence « virements CELI sortants mais aucun placement CELI ». Pur, testable.
 * Ne lit que des faits (transactions/actifs), ne fabrique aucune valeur.
 */
export function computeCeliNudgeStatus(
    transactions: readonly Transaction[],
    assets: readonly Asset[],
): CeliNudgeStatus {
    const hasCeliAssets = assets.some((a) => a.accountType === 'CELI');

    let transferredTotal = 0;
    for (const t of transactions) {
        if (t.isDuplicate) continue;
        // Garde NaN/Infinity AVANT le test de signe : `NaN >= 0` est false → une transaction
        // corrompue passerait le filtre et empoisonnerait le total (NaN), masquant SILENCIEUSEMENT
        // le nudge (NaN >= seuil = false). Cohérent avec les agrégateurs sœurs de Transaction.amount.
        if (!Number.isFinite(t.amount)) continue;
        if (t.amount >= 0) continue; // sortant seulement (cotisation = débit du compte courant)
        if (!CELI_PAYEE.test(t.payee)) continue;
        transferredTotal += Math.abs(t.amount);
    }

    return {
        hasCeliAssets,
        transferredTotal,
        shouldShow: !hasCeliAssets && transferredTotal >= CELI_NUDGE_MIN_TRANSFERRED,
    };
}
