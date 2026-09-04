// [GODFILE-FUTUREDETAILMODAL] Détail d'une transaction (pastilles de faits), extrait tel quel de
// FutureDetailModal.tsx (lot 154).
import type { Transaction } from '../../../types';

/**
 * [PASSE-REEL-TXN-DU-JOUR] Détail d'une transaction, au-delà du montant — demande de Marc
 * (« je veux voir les transactions et leur montant et plus de détail »).
 *
 * ⚠️ UNIQUEMENT des faits présents sur la donnée. Rien n'est déduit, rien n'est comblé : un champ
 * absent ne produit AUCUNE pastille plutôt qu'un « inconnu » qui aurait l'air d'une information.
 * Le statut « traité » n'est pas affiché non plus — c'est le cas NORMAL, et une pastille sur chaque
 * ligne ne dirait rien tout en noyant celles qui, elles, méritent l'œil.
 */
/** En dessous, la catégorie proposée par l'IA mérite un coup d'œil. Échelle 0-100. */
export const SEUIL_CONFIANCE_FAIBLE = 70;

export const detailsTransaction = (
    t: Transaction,
    userName1?: string,
    userName2?: string,
): Array<{ texte: string; ton: 'neutre' | 'attention' }> => {
    const out: Array<{ texte: string; ton: 'neutre' | 'attention' }> = [];

    // Statut : seuls les cas ANORMAUX parlent.
    if (t.status === 'pending') out.push({ texte: 'en attente', ton: 'attention' });
    else if (t.status === 'error') out.push({ texte: 'erreur d’import', ton: 'attention' });
    else if (t.status === 'manual') out.push({ texte: 'saisie manuelle', ton: 'neutre' });

    // Conjoint : seulement s'il y a une ATTRIBUTION EXPLICITE et un nom à afficher.
    // ⚠️ DIVERGENCE ASSUMÉE avec `resolveTransactionOwner` (`utils/budget.ts`), qui sert la
    // ventilation budgétaire : lui RÉSOUT un propriétaire quand `ownerId` est absent, en déduisant
    // du type de poste (`Perso 1`->0, `Perso 2`->1). Ici on ne montre que le fait EXPLICITE — une
    // déduction affichée comme un nom se lirait comme une certitude. Conséquence à connaître : une
    // transaction imputée à un conjoint dans la vue Budget peut n'avoir AUCUNE pastille ici.
    if (t.ownerId === 0 && userName1) out.push({ texte: userName1, ton: 'neutre' });
    if (t.ownerId === 1 && userName2) out.push({ texte: userName2, ton: 'neutre' });

    // Origine de la catégorie : ce qui dit s'il faut lui faire confiance.
    if (t.isVerified) out.push({ texte: 'vérifiée', ton: 'neutre' });
    else if (t.isAiProcessed) {
        // ⚠️ `confidence` est en 0-100, PAS une fraction 0-1. Mesuré chez TOUS ses producteurs
        // (`claude.ts` : 100 ; `applyTransferDetection` : 100 ; personas : 95) et confirmé par le
        // consommateur existant `Transactions.tsx`, qui affiche `${t.confidence}%` SANS multiplier.
        // Mon `* 100` initial affichait « 9 500 % » — et surtout le seuil d'alerte devenait
        // INATTEIGNABLE : une vraie confiance de 42 devenait 4 200, donc « >= 70 », donc jamais en
        // ambre. La pastille aurait perdu sa seule raison d'être sur TOUTE donnée réelle.
        const pct = Number.isFinite(t.confidence) ? Math.round(t.confidence as number) : null;
        out.push({ texte: pct === null ? 'classée par IA' : `classée par IA · ${pct} %`, ton: pct !== null && pct < SEUIL_CONFIANCE_FAIBLE ? 'attention' : 'neutre' });
    }

    // Catégorie d'origine, seulement si elle DIFFÈRE — sinon c'est du bruit.
    if (t.originalCategory && t.originalCategory !== t.category) {
        out.push({ texte: `avant : ${t.originalCategory}`, ton: 'neutre' });
    }
    return out;
};
