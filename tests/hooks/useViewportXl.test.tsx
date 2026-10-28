// tests/hooks/useViewportXl.test.tsx
//
// [S5-REFONTE-REGLAGES] Calque de tests/hooks/useViewportBelowLg.test.tsx — même patron
// (useSyncExternalStore + matchMedia RÉACTIF), seuil `xl` (≥ 1280px).
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import { useViewportXl, _resetViewportXlMqlForTests } from '../../hooks/useViewportXl';

function Probe() {
    return <div data-testid="v">{String(useViewportXl())}</div>;
}

afterEach(() => { vi.unstubAllGlobals(); _resetViewportXlMqlForTests(); });

describe('useViewportXl', () => {
    it('sans matchMedia (jsdom nu) ⇒ false, sans crasher — repli colonne unique', () => {
        render(<Probe />);
        expect(screen.getByTestId('v').textContent).toBe('false');
    });

    it('suit matchMedia RÉACTIVEMENT et interroge (min-width: 1280px)', () => {
        let matches = true;
        const queries: string[] = [];
        const listeners = new Set<() => void>();
        vi.stubGlobal('matchMedia', (q: string) => {
            queries.push(q);
            return {
                media: q,
                get matches() { return matches; },
                addEventListener: (_: string, cb: () => void) => listeners.add(cb),
                removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
            };
        });
        render(<Probe />);
        expect(queries).toContain('(min-width: 1280px)');
        expect(screen.getByTestId('v').textContent).toBe('true');
        act(() => { matches = false; listeners.forEach((cb) => cb()); });
        expect(screen.getByTestId('v').textContent).toBe('false');
    });
});
