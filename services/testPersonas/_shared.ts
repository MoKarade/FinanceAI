// services/testPersonas/_shared.ts
//
// Helpers partagés par les personas du mode test.

import type { AppState } from '../../types';

/**
 * Collections vides communes à tous les personas (modules non utilisés par les
 * fixtures de base). Retourne des tableaux frais à chaque appel (pas de
 * référence mutable partagée entre personas).
 */
export function emptyCollections(): Partial<AppState> {
    return {
        investmentAccounts: [],
        investmentTransactions: [],
        insurancePolicies: [],
        rentalProperties: [],
        privateBusinesses: [],
        vehicleReplacements: [],
        majorRenovations: [],
        charitableGoals: [],
    };
}

/**
 * Génère un historique de prix plausible (7 points bimestriels) par
 * interpolation linéaire entre prix d'achat et prix courant. Repris de
 * testAssets.ts pour donner une courbe au graphe de portefeuille.
 */
export function genHistory(buyPrice: number, currentPrice: number): Array<{ date: string; price: number }> {
    const out: Array<{ date: string; price: number }> = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setMonth(d.getMonth() - i * 2);
        const t = (6 - i) / 6;
        const price = buyPrice + (currentPrice - buyPrice) * t;
        out.push({ date: d.toISOString().split('T')[0], price: Math.round(price * 100) / 100 });
    }
    return out;
}
