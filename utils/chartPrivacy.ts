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
//  - INFOBULLE → `MASKED_AMOUNT_LABEL` : même wording que `PrivateAmount`, lisible et annoncé
//    identiquement au lecteur d'écran.
//
// Garde de non-régression : `tests/components/chartPrivacyScan.test.ts` (scan de source — le seul
// outil capable de voir une prop de graphique que le mock Recharts avale).
import { MASKED_AMOUNT_LABEL } from './privacyAria';

/** Substitut d'une graduation d'axe $ en mode discret (gabarit court, cf. en-tête). */
export const MASKED_TICK_LABEL = '***';

/**
 * Enveloppe un formateur de graduation d'axe MONÉTAIRE : en mode discret, l'axe ne dit RIEN
 * du montant. À utiliser sur tout `<YAxis tickFormatter={...} />` dont les valeurs sont des $.
 */
export const maskedTick = <T,>(isPrivacyMode: boolean, format: (value: T) => string) =>
    (value: T): string => (isPrivacyMode ? MASKED_TICK_LABEL : format(value));

/**
 * Enveloppe un formateur d'infobulle MONÉTAIRE (valeur seule). Pour une infobulle qui rend un
 * tuple `[valeur, nom]`, appeler ce helper sur la valeur uniquement — le nom de série n'est pas
 * une donnée privée.
 */
export const maskedTooltipValue = <T,>(isPrivacyMode: boolean, format: (value: T) => string) =>
    (value: T): string => (isPrivacyMode ? MASKED_AMOUNT_LABEL : format(value));
