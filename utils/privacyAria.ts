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
