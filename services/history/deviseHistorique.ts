// services/history/deviseHistorique.ts
//
// [HISTORIQUE-YAHOO-DEVISE-NON-LUE] Les clôtures d'un historique entrent dans `Asset.priceHistory`,
// qui est lu comme un prix dans la devise NATIVE de l'actif (`Asset.currency`). Rien ne vérifiait
// que le fournisseur parlait la même devise : le cours spot avait sa garde (`priceRefresh`,
// « currency-mismatch »), l'historique non. Une ligne de Londres, que Yahoo cote en PENCE (`GBp`),
// entrait donc dans la courbe à ×100, sans rien dire.
//
// Source UNIQUE de la règle : deux lecteurs consomment l'historique (l'hydratation qui écrit
// `priceHistory`, et `usePastPortfolioHistory` qui garde les séries des actifs non hydratés) — deux
// copies d'un même critère divergent en silence.
//
// ⚠️ « Inconnue » n'est pas « incompatible » : Finnhub (chandelles) ne déclare aucune devise, et
// une entrée de cache écrite avant ce lot non plus. Refuser l'absence couperait toutes ces courbes
// sans qu'aucune ne soit fausse ; c'est le comportement d'avant, gardé à l'identique.

import type { HistoryPoint } from '../marketData/types';

/** Devises qu'un actif peut porter (`Asset.currency`). Hors de cette liste, aucun prix n'est lisible. */
const DEVISES_ACTIF: ReadonlySet<string> = new Set(['USD', 'CAD', 'EUR']);

/**
 * Unités MINEURES que Yahoo publie à la place de la devise (casse significative : `GBp` ≠ `GBP`).
 * Elles ne servent qu'à nommer le piège dans le message : une devise hors `DEVISES_ACTIF` est
 * refusée de toute façon.
 */
const UNITES_MINEURES: Readonly<Record<string, string>> = {
    GBp: 'pence britanniques (cours ×100)',
    GBX: 'pence britanniques (cours ×100)',
    ZAc: 'cents sud-africains (cours ×100)',
    ILA: 'agorot israéliens (cours ×100)',
};

export type VerdictDeviseHistorique =
    | { readonly etat: 'compatible' }
    /** Le fournisseur ne dit pas en quelle devise sont ses clôtures (Finnhub, cache antérieur). */
    | { readonly etat: 'inconnue' }
    | { readonly etat: 'incompatible'; readonly devise: string; readonly attendue: string; readonly precision?: string };

/**
 * Les clôtures de `points` peuvent-elles entrer dans l'historique d'un actif en `deviseActif` ?
 * - aucun point ne déclare de devise → `inconnue` (accepté, comportement d'avant) ;
 * - devise déclarée hors USD/CAD/EUR (pence compris) → `incompatible`, quelle que soit la devise
 *   de l'actif : l'app ne sait valoriser aucun prix dans cette unité ;
 * - actif en devise X, clôtures en devise Y ≠ X → `incompatible` ;
 * - points qui déclarent des devises DIFFÉRENTES entre eux → `incompatible` (une seule réponse
 *   n'en produit jamais ; si ça arrive, on ne sait pas lesquels croire) ;
 * - actif sans devise (legacy) et clôtures en devise gérée → `compatible` : c'est le cas que
 *   `priceRefresh` « guérit » en posant la devise du cours ; refuser ici couperait la courbe du
 *   même actif que le cours spot accepte.
 */
export function verdictDeviseHistorique(
    points: readonly HistoryPoint[],
    deviseActif: string | undefined,
): VerdictDeviseHistorique {
    const declarees = new Set<string>();
    for (const p of points) {
        const d = typeof p.currency === 'string' ? p.currency.trim() : '';
        if (d) declarees.add(d);
    }
    if (declarees.size === 0) return { etat: 'inconnue' };
    const attendue = deviseActif || 'non précisée';
    if (declarees.size > 1) {
        return { etat: 'incompatible', devise: [...declarees].sort().join(' + '), attendue, precision: 'plusieurs devises dans la même série' };
    }
    const devise = [...declarees][0];
    if (!DEVISES_ACTIF.has(devise)) {
        return { etat: 'incompatible', devise, attendue, precision: UNITES_MINEURES[devise] ?? 'devise non gérée par l\'app (USD/CAD/EUR seulement)' };
    }
    if (deviseActif && devise !== deviseActif) return { etat: 'incompatible', devise, attendue };
    return { etat: 'compatible' };
}

/** Phrase du journal pour un refus — une seule rédaction pour les deux lecteurs. */
export function messageDeviseIncompatible(
    symbole: string,
    v: Extract<VerdictDeviseHistorique, { etat: 'incompatible' }>,
): string {
    const precision = v.precision ? ` — ${v.precision}` : '';
    return `Historique ${symbole} ignoré : le fournisseur cote ce symbole en ${v.devise}${precision}, l'actif est en ${v.attendue}. Corrige la devise de l'actif ou fixe un symbole de cotation dans sa devise.`;
}
