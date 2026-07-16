// [PROJECTION-PERSIST 2026-07-16] — round-trip IndexedDB RÉEL (fake-indexeddb) du blob de projection.
// Finding code-reviewer : les tests composant (jsdom SANS indexedDB) n'exerçaient JAMAIS le chemin
// IDB — une régression dans saveRecord/loadRecord/REVEALED_KEY (mauvaise clé, mauvais store) passait
// inaperçue alors que c'est le cœur de « la courbe figée survit à un vrai reload ».
//
// fake-indexeddb ne fournit PAS structuredClone-crypto : getOrCreateDeviceKey échoue en jsdom →
// le module retombe proprement EN CLAIR (voulu, dégradation documentée) et journalise UNE fois.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ProjectionResult } from '../../services/projection/types';

vi.mock('../../services/errorLogger', () => ({ logError: vi.fn() }));

import {
    saveRevealedProjection,
    loadRevealedProjection,
    clearRevealedProjection,
    saveLockedProjection,
    loadLockedProjection,
    clearLockedProjection,
} from '../../services/lockedProjectionStore';

const RESULT = (name: string): ProjectionResult =>
    ({ chartData: [], fireNumber: 123_456, allResults: [], strategyName: name } as unknown as ProjectionResult);

describe('lockedProjectionStore — round-trip IndexedDB du record `revealed`', () => {
    beforeEach(async () => {
        await clearRevealedProjection();
        await clearLockedProjection();
    });

    it('save → load rend le MÊME résultat ; clear → empty', async () => {
        expect(await saveRevealedProjection(RESULT('REVEALED-1'))).toBe(true);
        const loaded = await loadRevealedProjection();
        expect(loaded.status).toBe('ok');
        if (loaded.status === 'ok') {
            expect((loaded.result as unknown as { strategyName: string }).strategyName).toBe('REVEALED-1');
            expect(loaded.result.fireNumber).toBe(123_456);
        }
        await clearRevealedProjection();
        expect((await loadRevealedProjection()).status).toBe('empty');
    });

    it('les records `revealed` et `current` (verrou) NE collisionnent PAS (clés distinctes, même store)', async () => {
        await saveRevealedProjection(RESULT('REVEALED-2'));
        await saveLockedProjection(RESULT('LOCKED-2'));

        const revealed = await loadRevealedProjection();
        const locked = await loadLockedProjection();
        expect(revealed.status).toBe('ok');
        expect(locked.status).toBe('ok');
        if (revealed.status === 'ok') expect((revealed.result as unknown as { strategyName: string }).strategyName).toBe('REVEALED-2');
        if (locked.status === 'ok') expect((locked.result as unknown as { strategyName: string }).strategyName).toBe('LOCKED-2');

        // Effacer le VERROU ne touche pas la projection révélée (et vice-versa).
        await clearLockedProjection();
        expect((await loadLockedProjection()).status).toBe('empty');
        expect((await loadRevealedProjection()).status).toBe('ok');
    });

    it('jamais rien de stocké → empty (silence légitime, pas d\'erreur)', async () => {
        expect((await loadRevealedProjection()).status).toBe('empty');
    });
});
