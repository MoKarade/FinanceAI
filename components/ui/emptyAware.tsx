// components/ui/emptyAware.tsx
//
// [A11Y-DASH-SRONLY] Convention GLOBALE d'accessibilité pour l'état « pas de donnée ». `formatCAD`,
// `formatPercent`, `formatCompactCAD`, `formatSigned` rendent le tiret cadratin « — » (U+2014) pour
// toute valeur non finie (NaN/Infinity/undefined) — no-fake-data. Mais un lecteur d'écran lit alors
// « tiret cadratin » (ou rien), sans dire qu'il s'agit d'une absence de donnée.
//
// `emptyAware` remplace ce tiret muet par un tiret `aria-hidden` + un texte `sr-only` « Pas de donnée » ;
// toute autre valeur passe INTACTE (zéro surcoût, aucun changement visuel). Appliqué au CENTRE (le slot
// de valeur des composants partagés KPIStat/PrivateAmount, donc aussi DualKPIStat qui rend via
// PrivateAmount) → convention unique, pas de correction site-par-site (finding a11y-auditor #498).
//
// Miroir de `PrivateAmount` (masquage vie privée « ••• » + sr-only « Montant masqué ») : même patron
// aria-hidden + sr-only, appliqué aux mêmes points d'insertion.
import React from 'react';

/** Le tiret cadratin (U+2014) que les helpers `format*` rendent pour une valeur non finie. */
const EMPTY_DASH = '—';
/** Alternative lecteur d'écran de l'état « pas de donnée ». */
export const NO_DATA_LABEL = 'Pas de donnée';

/**
 * Rend une valeur en la rendant ACCESSIBLE quand elle est l'état vide « — » : tiret `aria-hidden`
 * + `sr-only` « Pas de donnée ». Sinon retourne la valeur telle quelle. Ne traite QUE la chaîne
 * exactement égale au tiret (après trim) — un montant réel ou un nœud composé passe intact.
 */
export function emptyAware(value: React.ReactNode): React.ReactNode {
    if (typeof value === 'string' && value.trim() === EMPTY_DASH) {
        return (
            <>
                <span aria-hidden="true">{EMPTY_DASH}</span>
                <span className="sr-only">{NO_DATA_LABEL}</span>
            </>
        );
    }
    return value;
}
