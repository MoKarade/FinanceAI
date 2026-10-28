// tests/services/personaCashHistory.test.ts
//
// Garde « passé cash personas » (CI-1000x — continuité passé↔futur).
// Vérifie que les transactions de test sur 24 mois donnent un passé de cash
// PLAUSIBLE (no-fake) : pas de solde négatif, pas de ballonnement. La clé est
// l'équilibrage automatique du flux mensuel (cf buildPersonaTransactions) :
// surplus routé vers l'épargne → flux net ≈ 0 → cash stable autour du solde
// initial sur tout l'historique.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { TEST_PERSONAS } from '../../services/testPersonas';
import { reconstructCashHistory } from '../../services/history/reconstructCashHistory';
import type { AppState, Transaction } from '../../types';

beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-15T12:00:00'));
});
afterAll(() => {
    vi.useRealTimers();
});

const nowKey = '2026-06';

function startingCash(balances: Record<string, number> | undefined, txs: Transaction[]): number {
    const ibSum = Object.values(balances ?? {}).reduce((s, v) => s + (Number(v) || 0), 0);
    const txSum = txs.reduce((s, t) => {
        const tx = t as { amount?: number; isDuplicate?: boolean; isTransfer?: boolean };
        return (!tx.isDuplicate && !tx.isTransfer) ? s + (Number(tx.amount) || 0) : s;
    }, 0);
    return ibSum + txSum;
}

describe('Personas — passé de cash sur 24 mois (plausible, no-fake)', () => {
    // 'couple-confort' est le persona PAR DÉFAUT historique : il réutilise les
    // fixtures legacy (generateTestTransactions, ~3 mois ; désormais SEEDÉ depuis
    // [TEST-PERSONA-NON-DETERMINISTE], lot 30 — le générateur reste distinct des 24 mois),
    // conservées telles quelles pour ne pas casser les baselines E2E. Sa continuité
    // passé↔futur est garantie autrement (démarrage « aujourd'hui » + reconstruction
    // du portefeuille). Sa migration vers le générateur 24 mois est un suivi
    // documenté (BACKLOG). On garde donc cette garde sur les 6 personas générés.
    for (const persona of TEST_PERSONAS.filter((p) => p.id !== 'couple-confort')) {
        const state = persona.build() as Partial<AppState>;
        const txs = (state.transactions ?? []) as Transaction[];
        const balances = (state.initialBalances ?? {}) as unknown as Record<string, number>;

        it(`${persona.emoji} ${persona.label} — ~24 mois de transactions`, () => {
            expect(txs.length).toBeGreaterThan(20); // paie + dépenses sur ~24 mois
            // Au moins ~20 mois distincts couverts.
            const months = new Set(txs.map((t) => String((t as { date?: string }).date ?? '').slice(0, 7)));
            expect(months.size).toBeGreaterThanOrEqual(20);
        });

        it(`${persona.emoji} ${persona.label} — cash passé reconstruit reste plausible`, () => {
            const cash0 = startingCash(balances, txs);
            const res = reconstructCashHistory(
                txs.map((t) => ({ date: String((t as { date?: string }).date ?? ''), amount: Number((t as { amount?: number }).amount) || 0 })),
                cash0,
                nowKey,
            );
            expect(res.points.length).toBeGreaterThan(12); // historique de cash sur > 1 an

            const cashes = res.points.map((p) => p.cash);
            const min = Math.min(...cashes);
            const max = Math.max(...cashes);

            // Pas de solde de cash négatif significatif (compte chèque plausible).
            expect(min).toBeGreaterThan(-2000);

            // Pas de ballonnement : l'amplitude du cash reste bornée (l'équilibrage
            // garde le flux net ≈ 0). Borne large : < 60 000 $ d'amplitude.
            expect(max - min).toBeLessThan(60000);
        });
    }
});
