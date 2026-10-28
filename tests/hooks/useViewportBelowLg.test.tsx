// tests/hooks/useViewportBelowLg.test.tsx
//
// [FUTUR-NAV-TIROIRS] Calque de tests/hooks/useViewportBelowSm.test.tsx — même patron
// (useSyncExternalStore + matchMedia RÉACTIF), seuil différent (1023px au lieu de 639px).
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import { useViewportBelowLg, _resetViewportBelowLgMqlForTests } from '../../hooks/useViewportBelowLg';

function Probe() {
    const below = useViewportBelowLg();
    return <div data-testid="v">{String(below)}</div>;
}

afterEach(() => { vi.unstubAllGlobals(); _resetViewportBelowLgMqlForTests(); });

describe('useViewportBelowLg', () => {
    it('sans matchMedia (jsdom nu) ⇒ false, sans crasher — repli honnête desktop large', () => {
        render(<Probe />);
        expect(screen.getByTestId('v').textContent).toBe('false');
    });

    it('suit matchMedia RÉACTIVEMENT (rotation/redimensionnement)', () => {
        let matches = true;
        const listeners = new Set<() => void>();
        vi.stubGlobal('matchMedia', (q: string) => ({
            media: q,
            get matches() { return matches; },
            addEventListener: (_: string, cb: () => void) => listeners.add(cb),
            removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
        }));
        render(<Probe />);
        expect(screen.getByTestId('v').textContent).toBe('true');
        act(() => { matches = false; listeners.forEach((cb) => cb()); });
        expect(screen.getByTestId('v').textContent).toBe('false');
    });

    it('interroge la requête (max-width: 1023px), PAS le seuil de useViewportBelowSm (639px)', () => {
        const queries: string[] = [];
        vi.stubGlobal('matchMedia', (q: string) => {
            queries.push(q);
            return {
                media: q,
                matches: false,
                addEventListener: () => {},
                removeEventListener: () => {},
            };
        });
        render(<Probe />);
        expect(queries).toContain('(max-width: 1023px)');
        expect(queries).not.toContain('(max-width: 639px)');
    });
});
