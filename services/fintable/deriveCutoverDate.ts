// services/fintable/deriveCutoverDate.ts
//
// [FINTABLE-3] Date de bascule DÉRIVÉE, pas maintenue à la main.
//
// Un paramètre manuel (`--after` du dry-run) est acceptable pour un aperçu ponctuel, mais un cron
// quotidien ne doit dépendre d'AUCUNE valeur que Marc devrait mettre à jour lui-même — une date
// figée qui prend du retard recrée exactement le risque de recouvrement/doublon qu'elle est censée
// prévenir. La bascule est donc calculée à CHAQUE passe : la date de la transaction la plus
// RÉCENTE déjà connue dans FinanceAI, tous comptes confondus (imports manuels et sync Fintable
// mêlés — chaque jour, la borne avance toute seule).
//
// `null` = état vierge (aucune transaction) → le mapper avertit alors qu'aucun recouvrement n'est
// possible à vérifier, comme documenté dans mapSnapshot.ts.
//
// ⚠️ [FINTABLE-BASCULE-GLOBALE-JETTE-LE-COMPTE-LENT] Ce module porte désormais DEUX dérivations, et
// l'en-tête ci-dessus ne décrit que la PREMIÈRE :
//   - `deriveCutoverDate`           — la borne GLOBALE, « tous comptes confondus ». Elle reste le
//     REPLI d'un compte dont aucune transaction n'est connue sous son libellé, et la seule que
//     voient les transactions sans `accountName`.
//   - `deriveCutoverDatesByAccount` — la borne PAR COMPTE, qui est celle qui s'applique dès qu'elle
//     existe. Voir son propre en-tête pour la mesure (12/12 chèque, 0/9 carte sans elle).
// Les deux coexistent PAR CONCEPTION : remplacer la globale par la carte par compte ouvrirait la
// fenêtre d'un compte inconnu à tout son historique, sans dédoublonnage.

import type { Transaction } from '../../types';

export function deriveCutoverDate(transactions: readonly Transaction[]): string | null {
    let max: string | null = null;
    for (const t of transactions) {
        if (!t || typeof t.date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(t.date)) continue;
        const day = t.date.slice(0, 10);
        if (max === null || day > max) max = day;
    }
    return max;
}

/**
 * [FINTABLE-BASCULE-GLOBALE-JETTE-LE-COMPTE-LENT] Bascule PAR COMPTE — le max des dates connues
 * POUR CE COMPTE, indexé par `Transaction.accountName` (le seul identifiant de compte persisté).
 *
 * ⚠️ POURQUOI la bascule globale ne suffit pas, MESURÉ (12 passes quotidiennes, chèque sans décalage
 * de postage + carte à 3 jours) : **12/12 transactions de chèque reçues, 0/9 de carte**. Le compte
 * chèque poste le jour même et pousse la borne commune chaque jour ; la carte poste en retard et
 * arrive donc TOUJOURS derrière une borne que le chèque vient d'avancer — `tx.date <= bascule` la
 * jette, chaque jour, indéfiniment. Contrôle négatif (décalage de la carte ramené à 0 jour) :
 * **12/12 reçues, 0 écartée** — le décalage de postage EST la variable.
 *
 * ⚠️ Une borne d'avancement AGRÉGÉE suppose que les sources avancent ENSEMBLE. Sa granularité doit
 * être celle de la SOURCE : c'est la leçon
 * `UNE-BASCULE-GLOBALE-SUR-DES-SOURCES-QUI-NE-POSTENT-PAS-A-LA-MEME-VITESSE-JETTE-LA-PLUS-LENTE`.
 *
 * ⚠️ Une transaction SANS `accountName` n'entre dans AUCUNE borne de compte : elle continue de
 * compter dans `deriveCutoverDate` (globale), qui reste le repli. Le mapper Fintable n'écrit
 * `accountName` que depuis le 2026-09-05 — tout ce qui précède, et tout import CSV sans colonne de
 * compte, est donc invisible ici. C'est voulu : une borne fondée sur « je ne sais pas de quel compte
 * ça vient » serait une borne inventée.
 */
/**
 * SOURCE UNIQUE de la clé d'indexation par compte : le libellé, ÉBARBÉ de ses espaces de bord.
 *
 * ⚠️ [revue #974] Pourquoi une fonction et pas un `.trim()` recopié : le premier jet trimmait à
 * l'ÉCRITURE de la carte (ici) et PAS à sa LECTURE (`mapSnapshot`), or rien ne trimme `label` au
 * décodage (`requireString` ne trimme pas). Un libellé qui porte une espace donnait donc deux clés
 * différentes pour le même compte — la borne de ce compte restait introuvable à CHAQUE passe.
 * MESURÉ sur 12 passes (carte à 3 j de décalage) : libellé propre **9/9** une fois la carte connue,
 * libellé `" Carte"` **0/9 même une fois la carte connue** — l'interblocage ne se referme JAMAIS, et
 * l'avertissement aurait prescrit un « Rattraper l'historique » sans effet. Un remède PONCTUEL
 * contre un défaut PERMANENT enseigne à être ignoré.
 *
 * ⚠️ Trim SEULEMENT. Rabattre la casse ou les accents FUSIONNERAIT des comptes réellement distincts
 * (« Compte A » / « compte a ») : ce serait échanger une borne introuvable contre une borne
 * partagée, c'est-à-dire un compte lent qui hérite à nouveau de la borne d'un compte rapide.
 * ⚠️ Ce qui est PERSISTÉ dans `Transaction.accountName` reste le libellé BRUT : c'est ce que
 * l'utilisateur voit, et c'est aussi la clé d'autres consommateurs (`applyTransferDetection`).
 * Seule l'INDEXATION est normalisée.
 */
export function cleCompte(libelle: string | undefined | null): string {
    return typeof libelle === 'string' ? libelle.trim() : '';
}

export function deriveCutoverDatesByAccount(
    transactions: readonly Transaction[] | undefined,
): Map<string, string> {
    const parCompte = new Map<string, string>();
    for (const t of transactions ?? []) {
        if (!t || typeof t.date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(t.date)) continue;
        const compte = cleCompte(t.accountName);
        if (compte === '') continue;
        const day = t.date.slice(0, 10);
        const prec = parCompte.get(compte);
        if (prec === undefined || day > prec) parCompte.set(compte, day);
    }
    return parCompte;
}

/**
 * [revue #974] PLANCHER des bornes par compte : la date la plus récente parmi les transactions
 * qu'on ne peut RATTACHER À AUCUN compte routé.
 *
 * ⚠️⚠️ C'est la garantie que la bascule par compte détruisait sans le dire. La borne d'un compte ne
 * voit QUE les lignes portant exactement son libellé. Or le même compte réel peut avoir des lignes
 * entrées par un AUTRE canal :
 *   - import CSV → `accountName` = une colonne du fichier, ou le littéral `'Importé'`
 *     (`parseBankCsv.ts`) ;
 *   - `apply_bank_statement` du MCP → `accountName` est OPTIONNEL, donc souvent absent ;
 *   - toute sync Fintable antérieure au 2026-09-05 → aucun `accountName`.
 * Ces lignes AVANÇAIENT la bascule globale, donc elles protégeaient. Reculer la borne d'un compte
 * sous leur date rouvre la fenêtre sur des transactions DÉJÀ présentes sous un autre libellé — et
 * la dédup de `applyBankStatement` ne les reconnaît pas : sa clé est `date|montant|payee`, or c'est
 * justement le `payee` qui diffère entre un relevé saisi à la main et ce que Fintable livre.
 * C'est le PIÈGE N°1 de `mapSnapshot.ts` (« pas de recouvrement = pas de dépendance à la dédup »),
 * que le premier jet de ce lot annulait en silence.
 *
 * ⚠️ Cas CONCRET et daté : les 36 lignes du Brésil réécrites à la main le 2026-09-15 l'ont été SANS
 * `accountName` et avec des montants CORRIGÉS — donc une clé de dédup différente des originaux.
 * Sans ce plancher, une borne de carte antérieure au 2026-09-10 les aurait fait revenir aux MAUVAIS
 * montants, c'est-à-dire refabriquer les dépenses fantômes qu'on venait de retirer.
 *
 * ⚠️ Une ligne portant le libellé d'un AUTRE compte routé n'entre PAS dans le plancher : elle
 * appartient à ce compte-là, pas à celui-ci. C'est ce qui garde le bénéfice du lot quand tout
 * l'historique est correctement étiqueté — plancher `null`, bornes par compte pleinement utilisées.
 *
 * ⚠️ Aucune constante choisie : le plancher est DÉRIVÉ de la donnée. Un « global − N jours » aurait
 * été un chiffre inventé, et il n'aurait garanti rien au-delà de N.
 */
export function plancherNonAttribuable(
    transactions: readonly Transaction[] | undefined,
    libellesRoutes: ReadonlySet<string>,
): string | null {
    let max: string | null = null;
    for (const t of transactions ?? []) {
        if (!t || typeof t.date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(t.date)) continue;
        const compte = cleCompte(t.accountName);
        if (compte !== '' && libellesRoutes.has(compte)) continue; // attribuée à un compte routé
        const day = t.date.slice(0, 10);
        if (max === null || day > max) max = day;
    }
    return max;
}
