// tests/services/aiSchemaBounds.test.ts
// [AI-UNBOUNDED-CONFIDENCE] — `CategorizeItemSchema` / `SubscriptionItemSchema` /
// `CoupleOptimizationStrategySchema` validaient leurs nombres avec `z.number()` NU, alors que
// `PayslipSchema` avait été durci pour exactement ce risque (cf. claude.payslipSchema.test.ts).
// Une valeur hallucinée traversait `safeJsonValidate` intacte et s'affichait verbatim
// (« Confiance : 9999 % »).
//
// Bout-en-bout avec le SDK Anthropic MOCKÉ : ces schémas ne sont PAS exportés, donc un test sur une
// copie locale du schéma ne prouverait rien (il testerait sa propre copie — classe
// « si le test contient une expression qui ressemble au code testé, il teste sa copie »).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Transaction } from '../../types';

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

vi.mock('../../services/errorLogger', () => ({ logError: mocks.logError }));

import { categorizeBatch } from '../../services/claude';

const tx = (id: number, payee: string): Transaction =>
    ({ id, date: '2026-06-05', payee, amount: -50, category: 'Uncategorized', status: 'processed' } as Transaction);

const ALLOWED = ['Épicerie', 'Transport', 'Autre'];

/** La confiance RETENUE pour une transaction, après passage par le schéma réel. */
const confidenceOf = async (raw: string): Promise<number | undefined> => {
    mocks.nextResponseText = raw;
    const out = await categorizeBatch([tx(1, 'IGA DES SOURCES')], 'sk-test', [], ALLOWED);
    return out[0].confidence;
};

describe('[AI-UNBOUNDED-CONFIDENCE] bornes de confiance (CategorizeItemSchema)', () => {
    beforeEach(() => { mocks.logError.mockClear(); });

    it('une confiance normale passe (non-régression)', async () => {
        expect(await confidenceOf('[{"id":1,"category":"Épicerie","isTransfer":false,"confidence":92}]'))
            .toBe(92);
    });

    it('les BORNES exactes 0 et 100 restent valides (ce sont des valeurs réelles)', async () => {
        expect(await confidenceOf('[{"id":1,"category":"Épicerie","isTransfer":false,"confidence":0}]'))
            .toBe(0);
        expect(await confidenceOf('[{"id":1,"category":"Épicerie","isTransfer":false,"confidence":100}]'))
            .toBe(100);
    });

    it('une confiance > 100 est REJETÉE — la transaction reste non catégorisée plutôt que d’afficher « 9999 % »', async () => {
        // Le lot entier est invalidé (safeJsonValidate rend null) : la transaction ressort telle
        // quelle, SANS confiance inventée. C'est le comportement voulu — mieux vaut « pas de
        // réponse » qu'un chiffre faux affiché comme un fait (règle no-fake-data).
        expect(await confidenceOf('[{"id":1,"category":"Épicerie","isTransfer":false,"confidence":9999}]'))
            .toBeUndefined();
    });

    it('une confiance NÉGATIVE est rejetée', async () => {
        expect(await confidenceOf('[{"id":1,"category":"Épicerie","isTransfer":false,"confidence":-5}]'))
            .toBeUndefined();
    });

    it('Infinity est rejeté (JSON.stringify le perdrait — injecté en littéral, comme un modèle l’écrit vraiment)', async () => {
        expect(await confidenceOf('[{"id":1,"category":"Épicerie","isTransfer":false,"confidence":1e999}]'))
            .toBeUndefined();
    });
});
