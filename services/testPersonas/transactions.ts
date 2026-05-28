// services/testPersonas/transactions.ts
//
// Générateur de transactions de test PARAMÉTRÉ par le profil financier d'un
// persona. Les transactions dérivent des vrais paramètres (salaires, loyer,
// dépenses, dettes) → cohérentes par construction, pas de hardcode arbitraire.
//
// Déterministe : un PRNG seedé (mulberry32) produit la même variance à chaque
// rechargement (utile pour les tests et les captures). Les dates restent
// relatives à « aujourd'hui » (transactions récentes, utilisées par la
// reconstruction du passé A1).

import type { Transaction } from '../../types';

export interface PersonaTxProfile {
    /** Dépôts de paie versés ~bi-mensuellement (2× le net/quinzaine par mois). */
    incomes: Array<{ payee: string; netBiweekly: number }>;
    /** Logement mensuel (loyer ou hypothèque) — montant positif, généré négatif. */
    housing: { label: string; monthly: number };
    /** Charges récurrentes fixes (Hydro, internet, assurances, télécom…). */
    recurring?: Array<{ payee: string; amount: number; category: string; dayOfMonth: number }>;
    /** Virements d'épargne mensuels (vers CELI/REER/CELIAPP…). */
    transfers?: Array<{ payee: string; amount: number }>;
    /** Paiements de dettes mensuels (carte, prêt auto, marge…). */
    debtPayments?: Array<{ payee: string; amount: number }>;
    /** Épicerie : marchands, nombre par mois, montant moyen. */
    groceries?: { merchants: string[]; perMonth: number; avg: number };
    /** Restaurants : marchands, nombre par mois, montant moyen. */
    dining?: { merchants: string[]; perMonth: number; avg: number };
    /** Transport (essence/STM) : nombre par mois, montant moyen, libellé. */
    transport?: { perMonth: number; avg: number; label?: string };
    /** Nombre de mois d'historique (défaut 3). */
    months?: number;
}

// PRNG seedé déterministe (mulberry32) — variance reproductible d'un build à l'autre.
function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Génère des transactions cohérentes avec le profil du persona.
 * @param profile Paramètres financiers (salaires, logement, dépenses, dettes).
 * @param seed Graine du PRNG (varier par persona pour des montants distincts).
 */
export function buildPersonaTransactions(profile: PersonaTxProfile, seed = 42): Transaction[] {
    const rand = mulberry32(seed);
    const out: Transaction[] = [];
    const now = new Date();
    const months = profile.months ?? 3;
    let idc = 1;

    const mk = (daysAgo: number, payee: string, amount: number, category: string): Transaction => {
        const d = new Date(now);
        d.setDate(d.getDate() - daysAgo);
        return {
            id: `persona-tx-${idc++}`,
            date: d.toISOString().split('T')[0],
            payee,
            amount: Math.round(amount * 100) / 100,
            category,
            isAiProcessed: true,
            confidence: 95,
            status: 'processed',
        } as unknown as Transaction;
    };

    // Flux mensuels réguliers (paie, logement, charges, virements, dettes).
    for (let m = 0; m < months; m++) {
        const base = 30 * m;
        for (const inc of profile.incomes) {
            out.push(mk(base + 1, inc.payee, inc.netBiweekly, 'Salaire'));
            out.push(mk(base + 15, inc.payee, inc.netBiweekly, 'Salaire'));
        }
        out.push(mk(base + 1, profile.housing.label, -Math.abs(profile.housing.monthly), 'Logement'));
        for (const r of profile.recurring ?? []) {
            out.push(mk(base + r.dayOfMonth, r.payee, -Math.abs(r.amount), r.category));
        }
        for (const t of profile.transfers ?? []) {
            out.push(mk(base + 2, t.payee, -Math.abs(t.amount), 'Transfert'));
        }
        for (const dp of profile.debtPayments ?? []) {
            out.push(mk(base + 4, dp.payee, -Math.abs(dp.amount), 'Dette'));
        }
    }

    // Dépenses variables réparties sur la période (montant ± seedé).
    const spread = months * 30;
    const jitter = (avg: number): number => avg * (0.6 + rand() * 0.8);

    if (profile.groceries) {
        const g = profile.groceries;
        for (let i = 0; i < g.perMonth * months; i++) {
            out.push(mk(Math.floor(rand() * spread), `${g.merchants[i % g.merchants.length]} #${1000 + i}`, -jitter(g.avg), 'Épicerie'));
        }
    }
    if (profile.dining) {
        const dn = profile.dining;
        for (let i = 0; i < dn.perMonth * months; i++) {
            out.push(mk(Math.floor(rand() * spread), dn.merchants[i % dn.merchants.length], -jitter(dn.avg), 'Restaurants'));
        }
    }
    if (profile.transport) {
        const tr = profile.transport;
        for (let i = 0; i < tr.perMonth * months; i++) {
            out.push(mk(Math.floor(rand() * spread), tr.label ?? 'Station Esso', -jitter(tr.avg), 'Transport'));
        }
    }

    return out;
}
