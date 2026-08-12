// tests/hooks/useViewportBelowSm.test.tsx
//
// [FUTUR-MOBILE-LAYOUT] Le breakpoint « téléphone » (< 640px) est RÉACTIF via matchMedia —
// pas un innerWidth lu au montage qui mentirait après rotation d'écran.
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import { useViewportBelowSm, _resetViewportMqlForTests } from '../../hooks/useViewportBelowSm';

function Probe() {
    const below = useViewportBelowSm();
    return <div data-testid="v">{String(below)}</div>;
}

afterEach(() => { vi.unstubAllGlobals(); _resetViewportMqlForTests(); });

describe('useViewportBelowSm', () => {
    it('sans matchMedia (jsdom nu) ⇒ false, sans crasher — comportement desktop des tests existants', () => {
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
});
