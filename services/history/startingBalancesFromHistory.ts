// services/history/startingBalancesFromHistory.ts
//
// Dérive les SOLDES DE PLACEMENT DE DÉPART du futur à partir de la
// reconstruction du passé (reconstructPortfolioHistory). Le dernier point de la
// reconstruction = valeur actuelle des comptes → c'est exactement ce sur quoi le
// futur doit démarrer pour qu'il n'y ait PAS de falaise entre le passé reconstruit
// et le futur projeté (les deux partagent la même source de placements).
//
// Contexte du bug corrigé (2026-05-28) : FutureProjection.tsx peuplait ces soldes
// via fetchPortfolioHistory() — un stub mort renvoyant [] — donc le futur démarrait
// avec ZÉRO placement pendant que le passé affichait le vrai portefeuille
// (centaines de k$). Tout le portefeuille « disparaissait » au mois 0.
//
// Cette fonction est PURE et partagée entre le composant et les tests : aucun écart
// possible entre « ce qui est testé » et « ce que le composant exécute » (la garde
// précédente testait une RÉPLIQUE de la logique, d'où le bug passé inaperçu).

import type { PortfolioHistoryPoint } from './reconstructPortfolioHistory';

interface StartingBalances {
    CELI: number;
    CELIAPP: number;
    REER: number;
    NON_ENREG: number;
    CRYPTO: number;
    REEE: number;
    TOTAL: number;
    /** CAGR de la reconstruction (1er vs dernier point), %, borné [-10, 30]. 0 si historique trop court. */
    historicalRate: number;
    // Compatible avec LiveCSVBalances (services/projection.ts) qui porte la même
    // signature d'index → assignable directement aux SimulationParams.
    [key: string]: number;
}

const EMPTY: StartingBalances = { CELI: 0, CELIAPP: 0, REER: 0, NON_ENREG: 0, CRYPTO: 0, REEE: 0, TOTAL: 0, historicalRate: 0 };

function investTotal(p: PortfolioHistoryPoint): number {
    return (Number(p.CELI) || 0) + (Number(p.CELIAPP) || 0) + (Number(p.REER) || 0)
        + (Number(p.REEE) || 0) + (Number(p.NonReg) || 0) + (Number(p.Crypto) || 0);
}

export function deriveStartingBalancesFromHistory(points: readonly PortfolioHistoryPoint[]): StartingBalances {
    if (!points || points.length === 0) return { ...EMPTY };

    const last = points[points.length - 1];
    const CELI = Number(last.CELI) || 0;
    const CELIAPP = Number(last.CELIAPP) || 0;
    const REER = Number(last.REER) || 0;
    const REEE = Number(last.REEE) || 0;
    const NON_ENREG = Number(last.NonReg) || 0;
    const CRYPTO = Number(last.Crypto) || 0;
    const TOTAL = CELI + CELIAPP + REER + REEE + NON_ENREG + CRYPTO;

    // [BIAIS-CAGR] Ce CAGR compare 1er↔dernier point SANS retirer les apports → il SURESTIME le
    // rendement pur (un portefeuille alimenté chaque mois « croît » même à rendement nul). Bornes
    // [-10, 30] + garde > 30 j ci-dessous ; l'UI qui l'applique (bouton « Auto ») porte la mise en
    // garde. Retrait des apports = exigerait les transactions datées par bucket (non disponible ici).
    let historicalRate = 0;
    if (points.length > 1) {
        const first = points[0];
        const firstTot = investTotal(first);
        const days = (new Date(last.date).getTime() - new Date(first.date).getTime()) / 86_400_000;
        if (days > 30 && firstTot > 0 && TOTAL > 0) {
            const years = days / 365.25;
            const cagr = (Math.pow(TOTAL / firstTot, 1 / years) - 1) * 100;
            historicalRate = Math.min(Math.max(cagr, -10), 30);
        }
    }

    return { CELI, CELIAPP, REER, NON_ENREG, CRYPTO, REEE, TOTAL, historicalRate };
}
