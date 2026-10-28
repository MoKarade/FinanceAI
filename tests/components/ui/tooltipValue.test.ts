// tests/components/ui/tooltipValue.test.ts
//
// [Findings panel #495] Tooltip de ZoomableTimeChart : (1) un point `null` (trou honnête d'une
// série éparse) rend « — », jamais « +0,00 % »/« 0 $ » fabriqué (`val || 0` réintroduisait dans le
// tooltip le faux zéro que toPerformanceRows venait d'éliminer de la courbe) ; (2) la valeur passe
// par yFormatter (avant : formatCAD EN DUR → « 10 $ » affiché en mode Base 100 au lieu de « +10 % »).

import { describe, it, expect } from 'vitest';
import { tooltipValue } from '../../../components/ui/ZoomableTimeChart';

const pctFormatter = (v: number) => `${v.toFixed(2)}%`;

describe('tooltipValue', () => {
    it('point null/undefined/NaN → « — » (jamais un 0 fabriqué)', () => {
        expect(tooltipValue(null, false, pctFormatter)).toBe('—');
        expect(tooltipValue(undefined, false, pctFormatter)).toBe('—');
        expect(tooltipValue(NaN, false, pctFormatter)).toBe('—');
    });

    it('valeur réelle → passe par yFormatter (Base 100 : « % », pas « $ » en dur) ; le 0 RÉEL reste affiché', () => {
        expect(tooltipValue(10, false, pctFormatter)).toBe('10.00%');
        expect(tooltipValue(0, false, pctFormatter)).toBe('0.00%'); // un vrai 0 n'est pas un trou
    });

    it('mode discret → libellé masqué, jamais la valeur', () => {
        const masked = tooltipValue(1234, true, pctFormatter);
        expect(masked).not.toContain('1234');
        expect(masked).not.toContain('1 234');
    });
});
