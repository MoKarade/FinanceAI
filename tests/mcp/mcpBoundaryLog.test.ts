// [MCP-TOOLS-SILENT-CATCH, audit 2026-07-16] — les catch de FRONTIÈRE MCP (withState/runApply)
// convertissent l'erreur en réponse claire pour Claude, mais AVANT ce fix ils n'appelaient JAMAIS
// logError → un bug de calcul/état était introuvable côté serveur (Cloud Run : errorLogger route
// vers console.* → logs de la révision). Ces tests prouvent : trace serveur ET réponse d'erreur.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/errorLogger', async (orig) => ({
    ...(await orig() as object),
    logError: vi.fn(),
}));

import { logError } from '../../services/errorLogger';
import { withState } from '../../mcp/tools/_dataAware';
import { runApply } from '../../mcp/tools/_writeHelper';
import type { StateStore } from '../../mcp/state/stateStore';
import type { AppState } from '../../types';

beforeEach(() => {
    vi.mocked(logError).mockClear();
});

describe('withState — trace serveur sur échec (frontière lecture)', () => {
    it('getState qui LÈVE → logError(error, storage) + réponse d\'erreur à Claude (pas de throw)', async () => {
        // Discriminant : sur l'ancien code, la réponse partait mais logError n'était JAMAIS appelé.
        const res = await withState(async () => { throw new Error('Drive 401'); }, () => {
            throw new Error('jamais atteint');
        });
        expect(res.isError).toBe(true);
        expect(logError).toHaveBeenCalledWith(expect.objectContaining({
            source: 'storage', severity: 'error',
            message: expect.stringMatching(/chargement de l'état ÉCHOUÉ/),
        }));
    });

    it('fn (calcul du tool) qui LÈVE → logError(error) + réponse d\'erreur (pas de throw)', async () => {
        const res = await withState(async () => ({} as AppState), () => {
            throw new TypeError('state.assets is not iterable');
        });
        expect(res.isError).toBe(true);
        expect(logError).toHaveBeenCalledWith(expect.objectContaining({
            severity: 'error',
            message: expect.stringMatching(/calcul d'un tool data-aware ÉCHOUÉ/),
        }));
    });

    it('chemin NOMINAL → aucun logError (pas de bruit)', async () => {
        const res = await withState(async () => ({} as AppState), () => ({
            content: [{ type: 'text' as const, text: '{}' }],
        }));
        expect(res.isError).toBeUndefined();
        expect(logError).not.toHaveBeenCalled();
    });
});

describe('runApply — trace serveur sur échec (frontière écriture)', () => {
    it('getWithVersion qui LÈVE → logError avec le kind du document + réponse d\'erreur', async () => {
        const store = {
            canWrite: true,
            getWithVersion: async () => { throw new Error('OCC token illisible'); },
        } as unknown as StateStore;
        const res = await runApply(store, { kind: 'debt' } as never);
        expect(res.isError).toBe(true);
        expect(logError).toHaveBeenCalledWith(expect.objectContaining({
            source: 'storage', severity: 'error',
            message: expect.stringMatching(/runApply\(debt\) : chargement de l'état avant écriture ÉCHOUÉ/),
        }));
    });
});
