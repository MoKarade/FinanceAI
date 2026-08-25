// tests/components/SyncStatusBannerFlash.test.tsx
//
// [BUDGET-DRIVE-BANNER-FLASH] Le côté RENDU du correctif : la bannière « tes changements ne sont PAS
// sauvegardés » ne doit pas s'afficher tant que la reprise silencieuse au boot n'a pas tranché.
//
// ⚠️ Les deux tests vont par PAIRE et ne se lisent pas séparément. « la bannière ne s'affiche pas »
// est trivialement vrai d'une bannière cassée : c'est le second test — mêmes props, `resumeSettled`
// seul retourné — qui prouve que ce composant SAIT afficher l'alerte dans cet état-là. Sans lui, le
// correctif « ne plus jamais alerter » passerait le premier test haut la main.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { SyncStatus } from '../../services/sync/syncOrchestrator';

let mockStatus: SyncStatus;
vi.mock('../../services/sync/syncOrchestrator', () => ({
    getSyncStatus: () => mockStatus,
    subscribeSyncStatus: (cb: (s: SyncStatus) => void) => { cb(mockStatus); return () => {}; },
    connectAndSync: vi.fn(async () => {}),
    pushNow: vi.fn(async () => 'pushed'),
}));

// L'appareil porte de vraies données : c'est la condition qui rend l'alerte PERTINENTE.
vi.mock('../../utils/onboarding', () => ({ hasMeaningfulData: () => true }));

import { SyncStatusBanner } from '../../components/sync/SyncStatusBanner';

const statut = (over: Partial<SyncStatus> = {}): SyncStatus => ({
    configured: true, connected: false, email: null, lastSyncedAt: 0, busy: false,
    conflict: false, error: null, errorPhase: null, needsPassphrase: false,
    passphraseActive: false, conflictSummary: null, resumeSettled: true, ...over,
});

const ALERTE = /tes changements ne sont PAS sauvegardés/i;

beforeEach(() => { vi.clearAllMocks(); });

describe('[BUDGET-DRIVE-BANNER-FLASH] la bannière attend le verdict', () => {
    it('reprise EN COURS : aucune alerte (c\'est le flash que Marc voyait)', () => {
        mockStatus = statut({ resumeSettled: false });
        render(<SyncStatusBanner />);
        expect(screen.queryByText(ALERTE), 'la bannière affirme une déconnexion non encore vérifiée')
            .toBeNull();
    });

    it('verdict RENDU et toujours pas connecté : l\'alerte s\'affiche, avec son bouton', () => {
        // La moitié anti-vacuité du test ci-dessus : mêmes props à `resumeSettled` près.
        mockStatus = statut({ resumeSettled: true });
        render(<SyncStatusBanner />);
        expect(screen.getByText(ALERTE)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /reconnecter/i })).toBeInTheDocument();
    });

    it('l\'alerte « échec de sauvegarde » n\'est PAS retardée : elle suppose déjà une connexion', () => {
        // Elle exige `connected: true`, donc le verdict est forcément rendu. Le correctif ne doit pas
        // l'avoir attrapée au passage — une alerte de push perdue serait une perte de données muette.
        mockStatus = statut({ connected: true, errorPhase: 'push', error: 'boum', resumeSettled: false });
        render(<SyncStatusBanner />);
        expect(screen.getByText(/Échec de la dernière sauvegarde/i)).toBeInTheDocument();
    });
});
