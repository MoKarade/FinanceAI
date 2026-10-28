// services/marketData/messageEchec.ts
//
// [AI-FINNHUB-CAUSE-COLLAPSE] Message UTILISATEUR d'un échec de la chaîne de cours.
//
// Ce que ce module N'EST PAS : un classificateur. Le ticket en demandait un « équivalent côté
// marketData » — mais la classification existe depuis toujours (`MarketDataError.code`, posé par
// chaque provider). Ce qui manquait, c'était son TRANSPORT jusqu'à l'écran : la façade réduisait les
// quatre causes à `null` (mesuré : 401, 429, panne réseau et symbole inconnu rendaient tous `null`,
// sans jamais lever). Grepper le remède d'un ticket avant de l'écrire.
//
// ⚠️ UN SEUL consommateur aujourd'hui (`AddStockForm`) : ce n'est pas encore un idiome partagé. Les
// deux autres surfaces citées par le ticket ne peuvent PAS l'appeler, et pas par oubli —
// `FutureHistorySection` lit un hook qui ne fait AUCUN réseau (`usePortfolioHistory` dérive du
// store), et la cause d'un échec d'HISTORIQUE est détruite plus bas encore, DANS le provider
// (`FinnhubProvider.getHistory` attrape et rend `null`). Voir `[MARKETDATA-HISTORY-CAUSE-PERDUE]`.

import type { MarketDataErrorCode } from './types';

/**
 * Phrase à afficher pour une cause d'échec. Chaque cause dit ce que l'utilisateur peut FAIRE —
 * un message qui envoie corriger le mauvais champ est une affirmation fausse, pas un détail de
 * forme (`UN-MESSAGE-NE-SE-CORRIGE-PAS-LA-OU-IL-S-AFFICHE`).
 *
 * `NOT_FOUND` n'atteint pas ce module en pratique : la façade le traite comme une ABSENCE confirmée
 * (`forme: 'absent'`), pas comme un échec. Il est couvert quand même — une cause sans message
 * retomberait sur le libellé générique, ce qui reproduirait exactement le défaut corrigé ici.
 */
export function messageEchecMarche(cause: MarketDataErrorCode, provider: string): string {
    switch (cause) {
        case 'AUTH':
            return `Clé ${provider === 'finnhub' ? 'Finnhub' : provider} refusée par le service de cours. Vérifie-la dans Réglages → Clés API.`;
        case 'RATE_LIMIT':
            return 'Limite de requêtes du service de cours atteinte (60 par minute en forfait gratuit). Réessaie dans une minute.';
        case 'NETWORK':
            return 'Impossible de joindre le service de cours (connexion coupée ou délai dépassé). Réessaie, ou entre le prix à la main.';
        case 'PLAN':
            return 'Ton forfait chez le service de cours ne couvre pas cette donnée. La clé est bonne — c\'est l\'accès qui manque ; l\'app tente son repli gratuit.';
        case 'NOT_FOUND':
            return 'Le service de cours ne connaît pas ce symbole.';
        case 'UNKNOWN':
            return 'Le service de cours a renvoyé une erreur inattendue. Réessaie plus tard, ou entre le prix à la main.';
    }
}

/**
 * [MARKETDATA-HISTORY-CAUSE-PERDUE] Cette cause peut-elle se résoudre TOUTE SEULE ?
 *
 * C'est le FAIT partagé par les surfaces, pas leur texte : une clé refusée exige une action
 * humaine (aucun rechargement n'y changera rien), tandis qu'un quota, une coupure réseau ou une
 * panne du fournisseur se règlent d'eux-mêmes. Chaque écran garde sa propre phrase — un message
 * utile ne se formule pas pareil dans un formulaire d'ajout et dans un diagnostic de synchro — mais
 * tous répondent à la MÊME question, une seule fois, ici (`UN-CORRECTIF-LOCAL-REPETE-EST-LE-SIGNE-
 * D-UNE-SOURCE-UNIQUE-MANQUANTE`).
 *
 * `PLAN` (403 : clé valide, forfait insuffisant) y est AUSSI : recharger ne débloquera rien. Mais
 * l'ACTION diffère de `AUTH` — il n'y a pas de clé à corriger —, d'où des phrases distinctes chez
 * les appelants. Le prédicat répond « ça ne se résoudra pas tout seul », pas « fais ceci ».
 *
 * `NOT_FOUND` n'atteint jamais ce prédicat en pratique (la façade en fait une ABSENCE, pas un
 * échec) ; il est classé « permanent » par cohérence — un symbole inconnu ne le devient pas moins
 * au rechargement suivant.
 */
export function causePermanente(cause: MarketDataErrorCode): boolean {
    return cause === 'AUTH' || cause === 'NOT_FOUND' || cause === 'PLAN';
}
