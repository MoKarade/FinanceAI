// services/verifierSymboleCotation.ts
//
// [QUOTE-SYMBOLE-SANS-CONTROLE] Un symbole de cotation COLLÉ par l'utilisateur (diagnostic « Cours
// non synchronisés ») était appliqué sans rien vérifier, et l'application est DESTRUCTIVE : elle
// purge l'historique du titre avant de le recharger. Un symbole coté dans une autre devise que
// l'actif effaçait donc la courbe, puis chacun de ses cours était rejeté par la garde de devise de
// `priceRefresh` — prix figé, courbe vide, et aucune alerte ne disait que la cause était le geste.
//
// On vérifie AVANT de purger, avec la même règle que `priceRefresh` (une seule règle, deux
// moments) :
//   - aucun cours obtenu → refus (on ne peut rien vérifier, et purger sur une hypothèse coûte la
//     courbe) ; une PANNE se dit comme telle, jamais « symbole introuvable » ;
//   - devise du cours ≠ devise de l'actif, ou devise que l'app ne gère pas → refus, les DEUX
//     devises nommées ;
//   - ordre de grandeur : le symbole SAISI reste la donnée de l'utilisateur (même décision que
//     l'hydratation, qui n'applique la garde de plausibilité qu'aux suffixes DEVINÉS), et le prix
//     stocké peut être justement celui qui est faux — un refus bloquerait la correction. On
//     applique donc, mais on le DIT. Aucun montant dans le message (toast lisible en mode discret).

import type { Asset } from '../types';
import type { ResultatQuote } from './marketData';
import { asSupportedCurrency } from './priceRefresh';
import { variantClosePlausible } from './history/plausibiliteCours';

export type VerdictSymboleCotation =
    | { readonly verdict: 'applicable'; readonly avertissement?: string }
    | { readonly verdict: 'refuse'; readonly message: string };

export function verifierSymboleCotation(
    actif: Pick<Asset, 'symbol' | 'currency' | 'currentPrice'>,
    symbole: string,
    quote: ResultatQuote,
): VerdictSymboleCotation {
    if (quote.forme === 'echec') {
        return { verdict: 'refuse', message: `Impossible de vérifier ${symbole} : le fournisseur de cours ne répond pas (${quote.echec.cause}). Rien n'a été modifié — réessaie dans un instant.` };
    }
    if (quote.forme === 'absent') {
        return { verdict: 'refuse', message: `${symbole} ne renvoie aucun cours : symbole non appliqué, l'historique actuel de ${actif.symbol} est conservé.` };
    }
    const devise = (quote.quote.currency || '').trim();
    if (devise && !asSupportedCurrency(devise)) {
        return { verdict: 'refuse', message: `${symbole} est coté en ${devise}, une devise que l'app ne gère pas (USD/CAD/EUR) : symbole non appliqué. Cherche la cotation de ce titre dans la devise de l'actif.` };
    }
    if (devise && actif.currency && devise !== actif.currency) {
        return { verdict: 'refuse', message: `${symbole} est coté en ${devise}, ${actif.symbol} est en ${actif.currency} : ses cours seraient tous rejetés. Symbole non appliqué — cherche la cotation en ${actif.currency}, ou corrige la devise de l'actif.` };
    }
    const avertissements: string[] = [];
    if (!devise) avertissements.push(`le fournisseur n'indique pas la devise de ${symbole}`);
    // Sans prix connu il n'y a pas d'ordre de grandeur à comparer (`variantClosePlausible` refuse
    // alors par prudence — ici ce refus deviendrait un avertissement FAUX).
    const prixConnu = Number(actif.currentPrice);
    if (Number.isFinite(prixConnu) && prixConnu > 0 && !variantClosePlausible(quote.quote.price, prixConnu)) {
        avertissements.push(`son cours est très éloigné du prix connu de ${actif.symbol} (plus du double ou moins de la moitié) — vérifie que c'est le bon titre`);
    }
    return avertissements.length > 0
        ? { verdict: 'applicable', avertissement: `${symbole} appliqué, mais ${avertissements.join(' ; ')}.` }
        : { verdict: 'applicable' };
}
