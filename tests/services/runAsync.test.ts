import { describe, it, expect } from 'vitest';
import { reconstructWorkerError, shardContiguous, runProjectionAsync } from '../../services/projection/runAsync';
import type { SimulationParams } from '../../services/projection';

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

/**
 * PH2-b (clé de voûte) — dédup des requêtes IDENTIQUES en vol. Quitter Futur pendant un calcul
 * puis revenir (remount → re-requête mêmes params) doit RE-RACCROCHER à la promesse en vol, pas
 * en lancer une seconde. En env Node (pas de Worker), computeProjectionAsync passe par le fallback
 * (`await import` → pending) : la promesse est en vol au moment du 2e appel synchrone.
 * Le CONTENU des params n'importe pas ici (la dédup agit AVANT le calcul) ; on tolère le rejet.
 */
describe('runProjectionAsync — dédup des requêtes en vol (PH2-b)', () => {
    const dummy = {} as unknown as SimulationParams;
    const settle = (p: Promise<unknown>) => p.catch(() => { /* contenu params factice → rejet OK */ });

    it('2 appels concurrents, MÊME clé → exactement la MÊME promesse (re-raccroché)', async () => {
        const p1 = runProjectionAsync(dummy, false, 0, undefined, 'SAME');
        const p2 = runProjectionAsync(dummy, false, 0, undefined, 'SAME');
        // CANARI : si ce `toBe` casse, vérifier que runProjectionAsync est resté NON-async. Un
        // `async function` ré-enveloppe `return existing` dans une NOUVELLE promesse → identité
        // perdue → re-raccrochage cassé (cf « NON-async VOLONTAIREMENT » dans runAsync.ts).
        expect(p2).toBe(p1); // identité de référence : aucun second calcul lancé
        await Promise.all([settle(p1), settle(p2)]);
    });

    it('clés DIFFÉRENTES → promesses distinctes (calculs indépendants)', async () => {
        const a = runProjectionAsync(dummy, false, 0, undefined, 'A');
        const b = runProjectionAsync(dummy, false, 0, undefined, 'B');
        expect(b).not.toBe(a);
        await Promise.all([settle(a), settle(b)]);
    });

    it('MÊME dedupKey mais runMC différent → promesses distinctes (la clé encode le mode)', async () => {
        // Verrou MINEUR-2 (revue PH2-b) : la dédup ne doit JAMAIS raccrocher deux calculs de modes
        // différents sous une même dedupKey — sinon un appelant recevrait la projection de l'autre mode.
        const det = runProjectionAsync(dummy, false, 0, undefined, 'MODE');
        const mc = runProjectionAsync(dummy, true, 0, undefined, 'MODE');
        expect(mc).not.toBe(det);
        await Promise.all([settle(det), settle(mc)]);
    });

    it('après résolution, la clé est VIDÉE → un nouvel appel recalcule (pas de cache périmé)', async () => {
        const first = runProjectionAsync(dummy, false, 0, undefined, 'CLEAR');
        await settle(first);
        const second = runProjectionAsync(dummy, false, 0, undefined, 'CLEAR');
        expect(second).not.toBe(first);
        await settle(second);
    });

    it('SANS dedupKey (appels hors-UI : MCP, tests) → jamais de partage', async () => {
        const a = runProjectionAsync(dummy, false, 0);
        const b = runProjectionAsync(dummy, false, 0);
        expect(b).not.toBe(a);
        await Promise.all([settle(a), settle(b)]);
    });
});
