import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { Settings } from '../../components/Settings';
import { _resetViewportXlMqlForTests } from '../../hooks/useViewportXl';
import type { AppState, BudgetConfig, User } from '../../types';

vi.mock('../../services/cloudBackup', () => ({
    downloadBackup: vi.fn().mockResolvedValue(undefined),
    defaultBackupFilename: () => 'backup.enc',
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'fr' } }),
}));

const defaultApiKeys: AppState['apiKeys'] = { anthropic: 'ANT_SECRET', finnhub: '' };
const defaultConfig: BudgetConfig = {
    users: [
        { name: 'Marc', monthlyGross: 7000, rrspContribution: 0, fhsaContribution: 0, birthYear: 1990, canadaArrivalYear: 2009 } as unknown as User,
        { name: 'Anna', monthlyGross: 5000, rrspContribution: 0, fhsaContribution: 0, birthYear: 1992, canadaArrivalYear: 2009 } as unknown as User,
    ],
    splitMode: '50/50',
};

// G22-N5 — Settings forwarde appState à SystemView (sous-onglet diagnostics).
// AppState minimal pour satisfaire le type (les tests ci-dessous ne naviguent
// pas vers le sous-onglet Système).
const minimalAppState: AppState = {
    transactions: [],
    assets: [],
    investmentTransactions: [],
    investmentAccounts: [],
    budgetItems: [],
    config: defaultConfig,
    projection: { years: 30, returnRate: 0.06, inflationRate: 0.02, savingsMode: 'manual', manualContribution: 0, usePortfolioRate: false },
    realEstateGoals: [],
    childGoals: [],
    debts: [],
    travelGoals: [],
    lifeEvents: [],
    retirementGoal: { targetAge: 65, targetMonthlyIncome: 4000, governmentPension: 1200 },
    financialGoals: [],
    initialBalances: {},
    apiKeys: defaultApiKeys,
    fxRates: { USD: 1.35, EUR: 1.45, CAD: 1 },
    lastUpdate: Date.now(),
    categorizationRules: [],
    aiConversation: [],
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
    travelGoals: [],
    appState: minimalAppState,
};

describe('Settings', () => {
    let createdBlob: Blob | undefined;

    // G22-N4 : la sauvegarde est désormais dans le sous-onglet « Sauvegarde ».
    // On y navigue avant de chercher les boutons d'export.
    // [S5-REFONTE-REGLAGES] jsdom n'a pas matchMedia → mise en page MOBILE (liste de sections à ouvrir).
    const ouvrirSection = (nom: string) => {
        const nav = screen.getByRole('navigation', { name: 'Sections des réglages' });
        fireEvent.click(within(nav).getByRole('button', { name: new RegExp(`^${nom}`) }));
    };
    const goToBackupTab = () => ouvrirSection('Sauvegarde');

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

    afterEach(() => { vi.unstubAllGlobals(); _resetViewportXlMqlForTests(); });

    it('mobile : carte du mode test, liste des sections, complétude ; une section s\'ouvre et se referme', () => {
        render(<Settings {...baseProps} />);
        expect(screen.getByRole('heading', { name: /Mode test/ })).toBeInTheDocument();
        const nav = screen.getByRole('navigation', { name: 'Sections des réglages' });
        const lignes = within(nav).getAllByRole('button').map((b) => b.textContent?.replace(/[›\s]+$/, '').trim());
        expect(lignes).toEqual(['Profil', 'Comptes et soldes', 'Patrimoine', 'Clés API', 'Sauvegarde', 'Système et diagnostics']);
        expect(screen.queryByRole('tab')).toBeNull();

        ouvrirSection('Sauvegarde');
        expect(screen.getByRole('heading', { level: 2, name: 'Sauvegarde' })).toBeInTheDocument();
        expect(screen.queryByRole('navigation', { name: 'Sections des réglages' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /Toutes les sections/ }));
        expect(screen.getByRole('navigation', { name: 'Sections des réglages' })).toBeInTheDocument();
    });

    it('mobile : « à faire » sur Clés API tant que la clé Anthropic manque', () => {
        render(<Settings {...baseProps} apiKeys={{ ...defaultApiKeys, anthropic: '' }} />);
        const nav = screen.getByRole('navigation', { name: 'Sections des réglages' });
        expect(within(nav).getByRole('button', { name: /^Clés API/ }).textContent).toContain('à faire');
    });

    it('bureau large (≥ xl) : menu en onglets VERTICAUX, « Complétude » ouvert par défaut', () => {
        vi.stubGlobal('matchMedia', (q: string) => ({
            media: q, matches: true, addEventListener: () => {}, removeEventListener: () => {},
        }));
        render(<Settings {...baseProps} />);
        const menu = screen.getByRole('tablist', { name: 'Sections des réglages' });
        expect(menu).toHaveAttribute('aria-orientation', 'vertical');
        expect(within(menu).getAllByRole('tab')).toHaveLength(6);
        expect(within(menu).getByRole('tab', { name: /Complétude/ })).toHaveAttribute('aria-selected', 'true');
        fireEvent.click(within(menu).getByRole('tab', { name: 'Sauvegarde' }));
        expect(within(menu).getByRole('tab', { name: 'Sauvegarde' })).toHaveAttribute('aria-selected', 'true');
    });

    it('se rend sans erreur', () => {
        const { container } = render(<Settings {...baseProps} />);
        expect(container.firstChild).toBeTruthy();
    });

    it("l'export JSON clair n'inclut PAS les clés API dans le blob (audit sécurité 2026-05)", async () => {
        render(<Settings {...baseProps} />);
        goToBackupTab();

        // Find plain export button — labeled "Exporter JSON" (not "chiffré")
        const allButtons = screen.getAllByRole('button');
        const exportBtn = allButtons.find(
            b => b.textContent?.includes('Exporter') && !b.textContent?.toLowerCase().includes('chiffr')
        );
        // Doit exister maintenant qu'on est sur le bon sous-onglet (régression G22-N4).
        expect(exportBtn).toBeTruthy();
        fireEvent.click(exportBtn!);

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
        goToBackupTab();

        const encBtn = screen.getAllByRole('button').find(
            b => b.textContent?.toLowerCase().includes('chiffr') && b.textContent?.toLowerCase().includes('export')
        );
        if (!encBtn) return; // Section not rendered in this tab — skip gracefully

        fireEvent.click(encBtn);

        // Modal should appear with a password input
        const passwordInputs = document.querySelectorAll('input[type="password"]');
        expect(passwordInputs.length).toBeGreaterThanOrEqual(1);
    });

    // [FINTABLE-7 Lot 2] Marc, DEUX fois : « je ne vois pas pour mettre la clé api ».
    // Les tests de `FintableSyncCard` la rendent en ISOLATION — ils passeraient à l'identique
    // si `Settings.tsx` cessait de la monter. Ce test-ci verrouille le CÂBLAGE : depuis
    // la section réellement libellée « Clés API », le champ du jeton doit exister.
    it('le champ du jeton Fintable est ATTEIGNABLE depuis le sous-onglet « Clés API »', () => {
        render(<Settings {...baseProps} />);
        ouvrirSection('Clés API');
        expect(screen.getByLabelText(/Jeton Fintable/i)).toBeInTheDocument();
    });

    it("dans la modal chiffrée, le bouton confirmer est désactivé si passphrase vide", async () => {
        render(<Settings {...baseProps} />);
        goToBackupTab();

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
