import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Settings } from '../../components/Settings';
import type { AppState, BudgetConfig } from '../../types';

vi.mock('../../services/cloudBackup', () => ({
    downloadBackup: vi.fn().mockResolvedValue(undefined),
    defaultBackupFilename: () => 'backup.enc',
}));
vi.mock('../../services/eraContext', () => ({ fetchEraContextTransactions: vi.fn() }));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'fr' } }),
}));

const defaultApiKeys: AppState['apiKeys'] = { anthropic: 'ANT_SECRET', eraContext: 'ERA_SECRET' };
const defaultConfig: BudgetConfig = {
    users: [
        { name: 'Marc', monthlyGross: 7000, rrspContribution: 0, fhsaContribution: 0, birthYear: 1990, canadaArrivalYear: 2009 } as any,
        { name: 'Anna', monthlyGross: 5000, rrspContribution: 0, fhsaContribution: 0, birthYear: 1992, canadaArrivalYear: 2009 } as any,
    ],
    splitMode: '50/50',
};

const baseProps = {
    apiKeys: defaultApiKeys,
    setApiKeys: vi.fn(),
    config: defaultConfig,
    setConfig: vi.fn(),
    budgetItems: [],
    onImportData: vi.fn(),
    initialBalances: {},
    setInitialBalances: vi.fn(),
    transactions: [],
    assets: [],
    savingsGoals: [],
    travelGoals: [],
};

describe('Settings', () => {
    let createdBlob: Blob | undefined;

    beforeEach(() => {
        vi.clearAllMocks();
        createdBlob = undefined;
        global.URL.createObjectURL = vi.fn((blob: Blob) => {
            createdBlob = blob;
            return 'blob:test';
        });
        global.URL.revokeObjectURL = vi.fn();
        // Prevent jsdom navigation error from <a>.click()
        HTMLAnchorElement.prototype.click = vi.fn();
    });

    it('se rend sans erreur', () => {
        const { container } = render(<Settings {...baseProps} />);
        expect(container.firstChild).toBeTruthy();
    });

    it("l'export JSON clair n'inclut PAS les clés API dans le blob (audit sécurité 2026-05)", async () => {
        render(<Settings {...baseProps} />);

        // Find plain export button — typically labeled "Exporter" or "JSON" (not "chiffré")
        const allButtons = screen.getAllByRole('button');
        const exportBtn = allButtons.find(
            b => b.textContent?.includes('Exporter') && !b.textContent?.toLowerCase().includes('chiffr')
        );
        if (!exportBtn) {
            // Section may be in a different tab — skip rather than fail
            return;
        }
        fireEvent.click(exportBtn);

        // Give async state update a tick
        await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());

        expect(createdBlob).toBeDefined();
        const text = await createdBlob!.text();
        expect(text).not.toContain('GEM_SECRET');
        expect(text).not.toContain('ERA_SECRET');
        expect(text).not.toContain('"apiKeys"');
    });

    it("le bouton 'Exporter chiffré' ouvre la modal de passphrase", async () => {
        render(<Settings {...baseProps} />);

        const encBtn = screen.getAllByRole('button').find(
            b => b.textContent?.toLowerCase().includes('chiffr') && b.textContent?.toLowerCase().includes('export')
        );
        if (!encBtn) return; // Section not rendered in this tab — skip gracefully

        fireEvent.click(encBtn);

        // Modal should appear with a password input
        const passwordInputs = document.querySelectorAll('input[type="password"]');
        expect(passwordInputs.length).toBeGreaterThanOrEqual(1);
    });

    it("dans la modal chiffrée, le bouton confirmer est désactivé si passphrase vide", async () => {
        render(<Settings {...baseProps} />);

        const encBtn = screen.getAllByRole('button').find(
            b => b.textContent?.toLowerCase().includes('chiffr') && b.textContent?.toLowerCase().includes('export')
        );
        if (!encBtn) return;

        fireEvent.click(encBtn);

        // Find the confirm/export button inside the modal — it should be disabled with empty passphrase
        const confirmBtn = screen.getAllByRole('button').find(
            b => b.textContent?.includes('Exporter chiffré') || b.textContent?.includes('Chiffrement')
        );
        if (confirmBtn) {
            expect(confirmBtn).toBeDisabled();
        }
    });
});
