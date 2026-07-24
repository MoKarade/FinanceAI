// tests/services/claude.categorize.test.ts
// [AI-CATEGORIZE-MISSING-ID] + [MCP-CATEGORY-ALLOWLIST] — categorizeBatch bout-en-bout avec SDK
// Anthropic MOCKÉ (finding code-reviewer PR #503 : l'enforcement — hors-liste, id manquant, id
// inconnu, couplage isTransfer — n'était exercé par AUCUN test ; les tests existants mockent tout
// ou ne couvrent que les courts-circuits sans clé).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Transaction } from '../../types';

// Réponse contrôlée par test (état hoisté partagé avec la factory du mock).
const mocks = vi.hoisted(() => ({
    nextResponseText: '[]',
    logError: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
    default: class {
        messages = {
            create: vi.fn(async () => ({
                content: [{ type: 'text', text: mocks.nextResponseText }],
            })),
        };
    },
}));

vi.mock('../../services/errorLogger', () => ({
    logError: mocks.logError,
}));

import { categorizeBatch } from '../../services/claude';

const tx = (id: number, payee: string): Transaction =>
    ({ id, date: '2026-06-05', payee, amount: -50, category: 'Uncategorized', status: 'processed' } as Transaction);

const ALLOWED = ['Épicerie', 'Transport', 'Transfert', 'Autre'];

describe('categorizeBatch — enforcement bout-en-bout (SDK mocké)', () => {
    beforeEach(() => {
        mocks.logError.mockClear();
    });

    it('hors-liste remappée (règle payee, confiance 100, compté) ; canonique verbatim ; id manquant + id inconnu tracés', async () => {
        const input = [
            tx(1, 'UBERTRIP 8XZK4'),      // modèle → « Sport » (hors liste) → règle payee → Transport
            tx(2, 'IGA DES SOURCES'),     // modèle → « Épicerie » (canonique) → verbatim
            tx(3, 'ZZZZZ OUBLIÉE'),       // ABSENTE de la réponse → inchangée + comptée
        ];
        mocks.nextResponseText = JSON.stringify([
            { id: 1, category: 'Sport', isTransfer: false, confidence: 80 },
            { id: 2, category: 'Épicerie', isTransfer: false, confidence: 92 },
            { id: 99, category: 'Autre', isTransfer: false, confidence: 50 }, // id HALLUCINÉ
        ]);

        const out = await categorizeBatch(input, 'fake-key', [], ALLOWED);
        const byId = new Map(out.map(t => [t.id, t]));

        // Hors-liste : remap par règle déterministe (UBERTRIP → Transport), confiance 100 (règle).
        expect(byId.get(1)?.category).toBe('Transport');
        expect(byId.get(1)?.confidence).toBe(100);
        // Canonique : verbatim, confiance du modèle conservée.
        expect(byId.get(2)?.category).toBe('Épicerie');
        expect(byId.get(2)?.confidence).toBe(92);
        // Id manquant : transaction inchangée (re-proposée au prochain « Classer »).
        expect(byId.get(3)?.category).toBe('Uncategorized');
        expect(byId.get(3)?.isAiProcessed).toBeUndefined();

        // Traces agrégées : hors-liste (1), id manquant (1), id inconnu (1) — messages distincts.
        const messages = mocks.logError.mock.calls.map(c => c[0]?.message ?? '');
        expect(messages.some(m => m.includes('1 catégorie(s) hors liste'))).toBe(true);
        expect(messages.some(m => m.includes('1 transaction(s) absente(s)'))).toBe(true);
        expect(messages.some(m => m.includes('1 entrée(s) de la réponse du modèle à id inconnu'))).toBe(true);
    });

    it('couplage isTransfer : « Transfert » canonique force isTransfer=true (invariant couplé du codebase)', async () => {
        const input = [tx(4, 'MAGASIN QUELCONQUE')];
        mocks.nextResponseText = JSON.stringify([
            { id: 4, category: 'Transfert', isTransfer: false, confidence: 70 },
        ]);
        const out = await categorizeBatch(input, 'fake-key', [], ALLOWED);
        expect(out[0].category).toBe('Transfert');
        expect(out[0].isTransfer).toBe(true); // jamais « Transfert » avec isTransfer:false (Σ affiché)
    });

    it('batch propre : aucune trace émise (les compteurs à 0 ne loggent pas)', async () => {
        const input = [tx(5, 'IGA DES SOURCES')];
        mocks.nextResponseText = JSON.stringify([
            { id: 5, category: 'Épicerie', isTransfer: false, confidence: 95 },
        ]);
        const out = await categorizeBatch(input, 'fake-key', [], ALLOWED);
        expect(out[0].category).toBe('Épicerie');
        const batchWarnings = mocks.logError.mock.calls
            .map(c => c[0]?.message ?? '')
            .filter(m => m.startsWith('categorizeBatch'));
        expect(batchWarnings).toEqual([]);
    });
});
