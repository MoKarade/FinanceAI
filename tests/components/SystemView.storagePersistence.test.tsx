// tests/components/SystemView.storagePersistence.test.tsx
//
// [STORAGE-PERSIST-REQUEST] Le diagnostic système AFFICHE l'état réel de la persistance du stockage
// (relu auprès du navigateur au montage), et le dit honnêtement quand elle est refusée.
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SystemView } from '../../components/SystemView';
import { buildDefaultAppState } from '../../mcp/state/appStateDefaults';
import type { AppState } from '../../types';

vi.mock('../../services/errorLogger', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../services/errorLogger')>();
    return { ...actual, logError: vi.fn() };
});

const ORIGINAL = Object.getOwnPropertyDescriptor(globalThis.navigator, 'storage');
const fauxStorage = (persisted: boolean | 'absent') => {
    Object.defineProperty(globalThis.navigator, 'storage', {
        value: persisted === 'absent' ? undefined : { persist: async () => persisted, persisted: async () => persisted },
        configurable: true,
    });
};
afterEach(() => {
    cleanup();
    if (ORIGINAL) Object.defineProperty(globalThis.navigator, 'storage', ORIGINAL);
    else delete (globalThis.navigator as unknown as Record<string, unknown>).storage;
});

describe('[STORAGE-PERSIST-REQUEST] SystemView — ligne STORAGE du diagnostic', () => {
    it('persistance ACCORDÉE → ligne « ACCORDÉE » (relue via persisted())', async () => {
        fauxStorage(true);
        render(<SystemView state={buildDefaultAppState() as AppState} />);
        expect(await screen.findByText(/STORAGE: persistance du stockage ACCORDÉE/)).toBeTruthy();
    });

    it('persistance REFUSÉE → ligne « REFUSÉE » qui nomme le risque (évictable), jamais silencieuse', async () => {
        fauxStorage(false);
        render(<SystemView state={buildDefaultAppState() as AppState} />);
        const ligne = await screen.findByText(/STORAGE: persistance du stockage REFUSÉE/);
        expect(ligne.textContent).toMatch(/évictable/);
    });

    it('API absente → ligne « non supporté », pas un faux « accordée »', async () => {
        fauxStorage('absent');
        render(<SystemView state={buildDefaultAppState() as AppState} />);
        expect(await screen.findByText(/STORAGE: navigator\.storage\.persist non supporté/)).toBeTruthy();
    });
});
