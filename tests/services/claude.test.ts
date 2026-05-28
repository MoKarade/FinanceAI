/**
 * @vitest-environment jsdom
 *
 * Lot 2 — claude.ts avait ZÉRO test. On couvre le code testable SANS réseau :
 *  - safeJsonValidate : robustesse du parsing/validation des réponses LLM
 *    (nettoie les ```json, renvoie null au lieu de crasher sur entrée malformée).
 *  - isDefiniteTransfer : pré-filtre transferts (évite des appels LLM inutiles).
 *  - categorizeBatch / detectSubscriptionsAI : court-circuits (sans clé / vide)
 *    → AUCUN appel réseau (vérifié par le retour immédiat).
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
    safeJsonValidate,
    isDefiniteTransfer,
    categorizeBatch,
    detectSubscriptionsAI,
} from '../../services/claude';
import type { Transaction } from '../../types';

const schema = z.array(z.object({ id: z.number(), category: z.string() }));

describe('safeJsonValidate', () => {
    it('JSON valide conforme au schéma → objet parsé', () => {
        const out = safeJsonValidate('[{"id":1,"category":"Alimentation"}]', schema);
        expect(out).toEqual([{ id: 1, category: 'Alimentation' }]);
    });

    it('JSON entouré de ```json … ``` → nettoyé puis parsé', () => {
        const out = safeJsonValidate('```json\n[{"id":2,"category":"Transport"}]\n```', schema);
        expect(out).toEqual([{ id: 2, category: 'Transport' }]);
    });

    it('JSON malformé → null (jamais d\'exception)', () => {
        expect(safeJsonValidate('{pas du json', schema)).toBeNull();
    });

    it('JSON valide mais non conforme au schéma → null', () => {
        expect(safeJsonValidate('[{"id":"pas-un-nombre"}]', schema)).toBeNull();
    });

    it('chaîne vide → null', () => {
        expect(safeJsonValidate('', schema)).toBeNull();
    });
});

describe('isDefiniteTransfer', () => {
    it.each([
        ['Virement Interac', -500],
        ['Transfert bancaire', -1000],
        ['INTERAC e-Transfer', 200],
    ])('%s → transfert évident', (payee, amount) => {
        expect(isDefiniteTransfer(payee, amount)).toBe(true);
    });

    it('« Paiement carte » > 5000$ → transfert (remboursement de carte)', () => {
        expect(isDefiniteTransfer('Paiement carte de crédit', 6000)).toBe(true);
    });

    it('« Paiement carte » < 5000$ → PAS un transfert', () => {
        expect(isDefiniteTransfer('Paiement carte de crédit', 100)).toBe(false);
    });

    it('marchand normal → pas un transfert', () => {
        expect(isDefiniteTransfer('Épicerie Metro', -85)).toBe(false);
    });

    it('payee vide → false', () => {
        expect(isDefiniteTransfer('', -50)).toBe(false);
    });
});

describe('court-circuits sans réseau', () => {
    const tx = { id: 1, date: '2026-01-01', payee: 'Test', amount: -50 } as unknown as Transaction;

    it('categorizeBatch : transactions vides → retour immédiat ([])', async () => {
        await expect(categorizeBatch([], 'fake-key')).resolves.toEqual([]);
    });

    it('categorizeBatch : sans clé API → transactions inchangées', async () => {
        await expect(categorizeBatch([tx], '')).resolves.toEqual([tx]);
    });

    it('detectSubscriptionsAI : vide ou sans clé → []', async () => {
        await expect(detectSubscriptionsAI([], 'fake-key')).resolves.toEqual([]);
        await expect(detectSubscriptionsAI([tx], '')).resolves.toEqual([]);
    });
});
