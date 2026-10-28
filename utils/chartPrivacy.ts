// utils/chartPrivacy.ts
// [AUDIT-SAFETY] MODE DISCRET DANS LES GRAPHIQUES — audit 2026-08-12, revue #608.
//
// Le contrat du dépôt (ADR-5 / `PrivateAmount`) est « masquer = NE PAS RENDRE ». Il était respecté
// partout SAUF dans les graphiques Recharts : les montants n'y passent pas par `PrivateAmount` mais
// par des `tickFormatter` / `formatter` construits à la main, invisibles au grep `formatCAD(` ET aux
// tests qui mockent `YAxis`/`Tooltip` en `() => null`. Résultat mesuré : l'axe Y de la courbe
// d'extinction de dette annonçait « 41k » à côté d'une infobulle correctement masquée.
//
// Deux libellés distincts, volontairement :
//  - AXE  → `***` : une graduation d'axe est un gabarit de 2-4 caractères ; « Montant masqué » y
//    déborde et casse la mise en page (largeur d'axe figée par `width={...}`).
//  - INFOBULLE → le libellé de `PrivateAmount` (`MASKED_AMOUNT_LABEL` de `privacyAria`), lisible et
//    annoncé identiquement au lecteur d'écran — les infobulles l'obtiennent via `isPrivacyMode`
//    directement ; l'enveloppe `maskedTooltipValue` de ce module n'a jamais eu de consommateur et a
//    été retirée au lot 205.
//
// Garde de non-régression : `tests/components/chartPrivacyScan.test.ts` (scan de source — le seul
// outil capable de voir une prop de graphique que le mock Recharts avale).

/** Substitut d'une graduation d'axe $ en mode discret (gabarit court, cf. en-tête). */
const MASKED_TICK_LABEL = '***';

/**
 * Enveloppe un formateur de graduation d'axe MONÉTAIRE : en mode discret, l'axe ne dit RIEN
 * du montant. À utiliser sur tout `<YAxis tickFormatter={...} />` dont les valeurs sont des $.
 */
export const maskedTick = <T,>(isPrivacyMode: boolean, format: (value: T) => string) =>
    (value: T): string => (isPrivacyMode ? MASKED_TICK_LABEL : format(value));

// [KNIP-UNUSED-EXPORTS-73] (lot 205) `maskedTooltipValue` supprimé : zéro consommateur depuis sa naissance —
// les infobulles passent par `maskedTick` ou par `isPrivacyMode` directement (les deux scans de vie
// privée le vérifient).
