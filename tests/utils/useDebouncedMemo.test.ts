import { describe, it, expect, vi } from 'vitest';

// Test minimal du module sans JSX (l'environnement Vitest n'a pas react-dom).
// On vérifie juste que le module s'importe et expose la signature attendue.
import { useDebouncedMemo } from '../../utils/useDebouncedMemo';

describe('useDebouncedMemo', () => {
    it('expose une fonction', () => {
        expect(typeof useDebouncedMemo).toBe('function');
    });

    it('signature attend (factory, deps, delay?)', () => {
        // 3 arguments: factory + deps + delay optionnel
        expect(useDebouncedMemo.length).toBeGreaterThanOrEqual(2);
        expect(useDebouncedMemo.length).toBeLessThanOrEqual(3);
    });
});
