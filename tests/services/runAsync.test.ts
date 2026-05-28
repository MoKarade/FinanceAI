import { describe, it, expect } from 'vitest';
import { reconstructWorkerError, shardContiguous } from '../../services/projection/runAsync';

/**
 * F3 (audit 2026-05-28) — la frontière postMessage du Web Worker ne transporte pas
 * les objets Error. Le worker poste désormais { __error: message, __errorStack: stack }
 * et le main thread reconstruit une Error en réattachant la stack d'origine.
 * Sans ça, `new Error(__error)` repart d'une stack pointant dans runAsync → debug aveugle.
 */
describe('reconstructWorkerError (F3 — préservation de la stack worker)', () => {
    it('réattache la stack du worker à l’Error reconstruite', () => {
        const workerStack = 'Error: boom\n    at calculateFutureProjection (projection.ts:42:7)';
        const err = reconstructWorkerError({ __error: 'boom', __errorStack: workerStack });

        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('boom');
        // La stack d'origine (site du crash dans le worker) est conservée, pas écrasée.
        expect(err.stack).toBe(workerStack);
        expect(err.stack).toContain('calculateFutureProjection');
    });

    it('préfixe le message sans casser la stack (cas pool strategySearch)', () => {
        const err = reconstructWorkerError(
            { __error: 'shard failed', __errorStack: 'Error: shard failed\n    at sim (x:1:1)' },
            'Worker 3: ',
        );
        expect(err.message).toBe('Worker 3: shard failed');
        expect(err.stack).toContain('at sim');
    });

    it('reste robuste si la stack est absente (worker a posté une string brute)', () => {
        const err = reconstructWorkerError({ __error: 'plain message' });
        expect(err.message).toBe('plain message');
        // Pas de stack worker → garde la stack par défaut de l'Error (non vide), pas un crash.
        expect(err.stack).toBeTruthy();
    });

    it('fournit un message par défaut si __error est absent', () => {
        const err = reconstructWorkerError({});
        expect(err.message).toBe('Worker error');
    });
});

/**
 * Garde la propriété d'invariance du sharding utilisé par le pool de workers :
 * tranches contiguës, équilibrées (les premières prennent le reste), ordre préservé.
 */
describe('shardContiguous', () => {
    it('découpe en tranches contiguës équilibrées en préservant l’ordre', () => {
        const items = [1, 2, 3, 4, 5, 6, 7];
        const shards = shardContiguous(items, 3);
        // 7 = 3 + 2 + 2 (les premiers shards prennent le +1 du reste)
        expect(shards).toEqual([[1, 2, 3], [4, 5], [6, 7]]);
        // Réassemblage = liste d'origine (ordre déterministe).
        expect(shards.flat()).toEqual(items);
    });

    it('gère n > length (shards vides en fin)', () => {
        expect(shardContiguous([1, 2], 4)).toEqual([[1], [2], [], []]);
    });
});
