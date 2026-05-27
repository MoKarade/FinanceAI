// services/testTransactions.ts
//
// Génération de transactions de test (60 entrées sur 3 mois).
// Extrait de testFixtures.ts (DT4) — ne jamais charger au boot.

import type { Transaction } from '../types';

export function generateTestTransactions(): Transaction[] {
    const out: Transaction[] = [];
    const now = new Date();
    let idCounter = 1;
    const mk = (daysAgo: number, payee: string, amount: number, category: string): Transaction => {
        const d = new Date(now);
        d.setDate(d.getDate() - daysAgo);
        return {
            id: `test-tx-${idCounter++}`,
            date: d.toISOString().split('T')[0],
            payee,
            amount,
            category,
            isAiProcessed: true,
            confidence: 95,
            status: 'processed',
        } as unknown as Transaction;
    };

    // Salaires bi-mensuels
    for (let i = 0; i < 6; i++) {
        out.push(mk(15 * i + 1, 'EMPLOYEUR INC - Dépôt direct', 2600, 'Salaire'));
        out.push(mk(15 * i + 15, 'EMPLOYEUR INC - Dépôt direct', 2600, 'Salaire'));
        out.push(mk(15 * i + 1, 'STARTUP CO - Dépôt direct', 2200, 'Salaire'));
    }
    // Logement
    for (let i = 0; i < 3; i++) {
        out.push(mk(30 * i + 1, 'Hypothèque BMO - Paiement', -1850, 'Logement'));
        out.push(mk(30 * i + 5, 'Hydro-Québec - Facture', -145, 'Logement'));
        out.push(mk(30 * i + 12, 'Vidéotron - Internet', -89, 'Logement'));
    }
    // Épicerie (~5/mois)
    const epiceries = ['Provigo', 'IGA', 'Costco', 'Métro', 'Maxi'];
    for (let i = 0; i < 15; i++) {
        const days = Math.floor(Math.random() * 90);
        const merchant = epiceries[i % epiceries.length];
        out.push(mk(days, `${merchant} #${1000 + i}`, -(45 + Math.random() * 120), 'Épicerie'));
    }
    // Restaurants
    for (let i = 0; i < 10; i++) {
        out.push(mk(Math.floor(Math.random() * 90), `Restaurant ${['Tim Hortons', 'Subway', "St-Hubert", 'Pizza Salvatoré'][i % 4]}`, -(15 + Math.random() * 50), 'Restaurants'));
    }
    // Transport
    for (let i = 0; i < 6; i++) {
        out.push(mk(15 * i + 7, 'Station Esso', -(55 + Math.random() * 30), 'Transport'));
    }
    // Investissements (transferts)
    for (let i = 0; i < 3; i++) {
        out.push(mk(30 * i + 1, 'Transfert vers CELI - Wealthsimple', -800, 'Transfert'));
        out.push(mk(30 * i + 1, 'Transfert vers REER - Wealthsimple', -600, 'Transfert'));
    }
    // Divers
    out.push(mk(5, 'Pharmaprix #123', -32.50, 'Santé'));
    out.push(mk(18, 'SAQ - Vin', -38, 'Loisirs'));
    out.push(mk(22, 'Amazon.ca - Commande', -67.99, 'Autre'));
    out.push(mk(45, 'Cinema Cineplex', -28, 'Loisirs'));

    return out;
}
