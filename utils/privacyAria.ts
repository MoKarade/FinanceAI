// utils/privacyAria.ts
// D6-SR-2 — parité lecteur d'écran ↔ blur visuel pour les contrôles dont la valeur affichée est
// MASQUÉE en mode privé. Le blur est purement CSS (`.privacy-active … { filter: blur }`, Layout) :
// il cache la valeur À L'ŒIL mais PAS au lecteur d'écran, qui continue d'annoncer le `aria-valuenow`
// réel d'un `<input type="range">`. On force donc `aria-valuetext="Montant masqué"` quand le mode privé
// est actif (même libellé que le sr-only de `PrivateAmount`). Helper partagé = un seul libellé, réutilisable.

/** Libellé annoncé au lecteur d'écran à la place d'un montant masqué (mode privé). Partagé avec
 *  `PrivateAmount` (un seul wording, prêt pour i18n). */
export const MASKED_AMOUNT_LABEL = 'Montant masqué';

/** Props aria à étaler sur un slider monétaire masqué en mode privé (empêche la fuite SR). */
export const maskedSliderAria = (isPrivacyMode: boolean): { 'aria-valuetext'?: string } =>
    isPrivacyMode ? { 'aria-valuetext': MASKED_AMOUNT_LABEL } : {};

/**
 * [PRIV-PAYEE-MODE-DISCRET] Libellé annoncé à la place d'un NOM DE MARCHAND masqué (mode privé).
 *
 * ⚠️ Décision Marc 2026-08-17 (« masquer marchands »). L'audit `A11Y-PRIVACY` du 2026-08-12 n'avait
 * couvert que les MONTANTS : un marchand restait en clair en mode discret, alors que « pharmacie X,
 * le 3 » dit déjà beaucoup — santé, convictions, habitudes. C'est de la donnée personnelle au sens
 * de la Loi 25 même sans le montant à côté.
 */
export const MASKED_PAYEE_LABEL = 'Marchand masqué';

/**
 * Marchand pour un ATTRIBUT (`title`, `aria-label`) — là où il n'y a pas de nœud à envelopper.
 * Le texte VISIBLE passe par `<PrivateText>`. Même partage que `maskedAttr` côté montants.
 *
 * ⚠️ Rappel de la classe de piège maison : une valeur sensible fuit aussi par un ATTRIBUT, pas
 * seulement par le texte. Un `aria-label={`Sélectionner ${payee}`}` non masqué annule tout le
 * masquage visuel de la ligne.
 */
export const maskPayee = (payee: string | null | undefined, isPrivacyMode: boolean): string =>
    isPrivacyMode ? MASKED_PAYEE_LABEL : (payee || '');

/**
 * Nom accessible d'un contrôle de ligne de transaction, qui reste DISTINCT en mode privé.
 *
 * ⚠️ Le piège du masquage naïf : remplacer le marchand par « ••• » dans chaque `aria-label` donne à
 * TOUTES les cases à cocher le MÊME nom accessible — le masquage détruirait alors la navigation au
 * lecteur d'écran, ce qui est un autre problème d'accessibilité, pas une victoire de vie privée.
 *
 * ⚠️ ET LA DATE NE SUFFIT PAS — mon premier correctif s'arrêtait là, et son commentaire affirmait
 * que les noms restaient « DISTINCTS ». C'était FAUX dans le cas le plus courant : plusieurs
 * transactions le MÊME JOUR donnaient toutes « Sélectionner la transaction du 2026-08-10 ». Deux
 * agents l'ont mesuré indépendamment (audits vie privée et a11y de la PR #645), et mon test ne le
 * voyait pas — il comparait deux dates DIFFÉRENTES, donc prouvait l'évidence.
 * D'où l'`id` : opaque, jamais affiché ailleurs, il ne révèle rien et il est unique par
 * construction. La leçon générale : un masquage qui retire un DISCRIMINANT doit le remplacer, pas
 * seulement le supprimer — sinon on échange une fuite de vie privée contre un trou WCAG 4.1.2.
 */
export const rowControlLabel = (
    action: string,
    payee: string | null | undefined,
    date: string,
    id: number | string,
    isPrivacyMode: boolean,
): string => (isPrivacyMode
    ? `${action} la transaction du ${date} (#${id})`
    : `${action} ${payee || '(sans libellé)'}`);

/**
 * [PRIV-CATEGORIE-MASQUEE] Libellé annoncé à la place d'une CATÉGORIE masquée (mode privé).
 *
 * ⚠️ Décision Marc 2026-08-18 : « masquer ». L'audit vie privée de la PR #645 avait soulevé que
 * l'argument justifiant de masquer le MARCHAND vaut presque autant pour la catégorie : « Santé »
 * ou « Dons », datée, ré-identifie à peu près aussi bien qu'un nom de commerçant. J'avais
 * recommandé le statu quo ; Marc a tranché l'inverse, et c'est sa donnée.
 *
 * ⚠️ Masquage de TOUTES les catégories, pas d'une liste de « sensibles ». Une liste serait une
 * HEURISTIQUE DE TEXTE sur des libellés que Marc écrit lui-même (classe
 * `TEXT-HEURISTIC-OVER-USER-TEXT`, déjà au dossier) : une catégorie personnalisée « Psy » y
 * échapperait en silence. Le seul masquage qui ne ment pas est celui qui ne trie pas.
 */
export const MASKED_CATEGORY_LABEL = 'Catégorie masquée';

/** Catégorie pour un ATTRIBUT (`title`, `aria-label`). Le texte VISIBLE passe par `<PrivateText>`. */
export const maskCategory = (categorie: string | null | undefined, isPrivacyMode: boolean): string =>
    isPrivacyMode ? MASKED_CATEGORY_LABEL : (categorie || '');
