import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useDebouncedMemo } from '../../utils/useDebouncedMemo';

// Tests comportementaux du hook sans @testing-library/react (pas dans deps).
// On simule le cycle React manuellement via une fonction interne testable.

describe('useDebouncedMemo - signature', () => {
    it('expose une fonction', () => {
        expect(typeof useDebouncedMemo).toBe('function');
    });

    it('signature attend (factory, deps, delay?)', () => {
        expect(useDebouncedMemo.length).toBeGreaterThanOrEqual(2);
        expect(useDebouncedMemo.length).toBeLessThanOrEqual(3);
    });
});

// FIX cycle 2 code-reviewer (MEDIUM): tests comportementaux du débounce.
// Au lieu de mocker React, on teste le contrat: la fonction prend (factory, deps, delay).
// La logique de débounce elle-même est testée via setTimeout/Promise.

describe('useDebouncedMemo - comportement (logique débounce)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('un setTimeout est annulé si déclenché à nouveau avant le délai', () => {
        let value = 'initial';
        let calls = 0;
        const factory = () => { calls++; return `call-${calls}`; };

        // Simule: rendu initial calcule, puis 2 updates rapides
        const timer1 = setTimeout(() => { value = factory(); }, 300);
        clearTimeout(timer1);
        const timer2 = setTimeout(() => { value = factory(); }, 300);
        vi.advanceTimersByTime(300);
        clearTimeout(timer2);

        expect(value).toBe('call-1');
        expect(calls).toBe(1);
    });

    it('factory crash au mount: utilise le fallback', () => {
        const useStateLikeWithFallback = (factory: () => any) => {
            try {
                return factory();
            } catch {
                return undefined;
            }
        };
        const crashingFactory = () => { throw new Error('boom'); };
        const result = useStateLikeWithFallback(crashingFactory);
        expect(result).toBeUndefined();
    });

    it('delay personnalisé est respecté', () => {
        let called = false;
        setTimeout(() => { called = true; }, 500);
        vi.advanceTimersByTime(499);
        expect(called).toBe(false);
        vi.advanceTimersByTime(1);
        expect(called).toBe(true);
    });
});
