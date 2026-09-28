import { describe, it, expect } from 'vitest';
import { reperesRonds } from '../../utils/reperesRonds';

describe('reperesRonds', () => {
    it('dette de 20,6 k$ → 0, 5, 10, 15, 20 k$ (la courbe dépasse le dernier repère)', () => {
        expect(reperesRonds([20572, 0, 2119])).toEqual([0, 5000, 10000, 15000, 20000]);
    });
    it('coût enfant de −5,4 k$ à 21,4 k$ → −5 à 20 k$ par 5 k$', () => {
        expect(reperesRonds([-5400, 21423, 0])).toEqual([-5000, 0, 5000, 10000, 15000, 20000]);
    });
    it('étendue nulle ou valeurs non finies → undefined (recharts décide)', () => {
        expect(reperesRonds([])).toBeUndefined();
        expect(reperesRonds([0, NaN])).toBeUndefined();
    });
});
