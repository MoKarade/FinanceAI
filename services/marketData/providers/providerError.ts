// SF-2 — journalisation des erreurs de providers de cours (Finnhub, CoinGecko).
//
// Les méthodes des providers retournent null/[] en cas d'erreur (dégradation
// propre : le portefeuille reste affichable). MAIS avant ce helper, l'erreur
// passait en `console.warn` → invisible en prod (pas de console ouverte, pas de
// backend) → un cours périmé/absent à cause d'une clé invalide ou d'un souci
// réseau était SILENCIEUX. On journalise désormais via le logger borné, en
// distinguant les cas :
//   - NOT_FOUND (symbole/crypto inconnu) = LÉGITIME → on NE log PAS (pas de bruit) ;
//   - AUTH (clé invalide) = action requise par l'utilisateur → severity 'error' ;
//   - reste (NETWORK, RATE_LIMIT, UNKNOWN) = transitoire → severity 'warning'.
// Le contrat de retour (null/[]) des méthodes appelantes est inchangé.

import { logError } from '../../errorLogger';
import { MarketDataError } from '../types';

export function logProviderError(provider: string, method: string, symbol: string, e: unknown): void {
    if (e instanceof MarketDataError && e.code === 'NOT_FOUND') return;
    const severity = e instanceof MarketDataError && e.code === 'AUTH' ? 'error' : 'warning';
    logError({
        source: 'network',
        severity,
        message: `${provider}.${method}(${symbol}) a échoué — cours non rafraîchi`,
        error: e instanceof Error ? e : new Error(String(e)),
    });
}
