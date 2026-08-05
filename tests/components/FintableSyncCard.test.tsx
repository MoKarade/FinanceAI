/**
 * @vitest-environment jsdom
 *
 * [FINTABLE-7] Carte de configuration de la sync bancaire.
 *
 * Ce que les tests verrouillent en priorité : (a) AUCUN montant n'est rendu — c'est ce qui dispense
 * la carte d'un gate mode discret, et une régression silencieuse y ferait fuiter des soldes réels ;
 * (b) la sync est INDISPONIBLE en mode démo (sinon des données de persona se mêleraient aux vraies) ;
 * (c) le régime fiscal par défaut est bien NON-ENREG (réponse de Marc, 2026-07-30).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FintableSyncCard } from '../../components/settings/FintableSyncCard';
import { useFinanceStore } from '../../store/useFinanceStore';

const listMock = vi.fn();
const syncMock = vi.fn();

vi.mock('../../services/fintable/browserSync', () => ({
    listFintableAccountsForSetup: (...a: unknown[]) => listMock(...a),
    runFintableBrowserSync: (...a: unknown[]) => syncMock(...a),
}));
vi.mock('../../services/errorLogger', () => ({ logError: vi.fn() }));

// [FINTABLE-TOKEN-PERSIST] Coffre chiffré mocké : ces tests verrouillent que le jeton est bien
// ÉCRIT dans secureKeyStore (incident 2026-08-05 : il ne l'était jamais → perdu à chaque reload).
const saveKeysMock = vi.fn();
vi.mock('../../services/secureKeyStore', () => ({
    saveApiKeys: (...a: unknown[]) => saveKeysMock(...a),
}));

const ACCOUNTS = [
    { id: 'acc_1', label: 'Compte chèque', rawType: 'depository', currency: 'CAD', balance: 1500 },
    { id: 'acc_2', label: 'Disnat L7B1', rawType: 'brokerage', currency: 'CAD', balance: 136863.18 },
];

beforeEach(() => {
    listMock.mockReset();
    syncMock.mockReset();
    saveKeysMock.mockReset();
    saveKeysMock.mockResolvedValue(undefined);
    useFinanceStore.setState({
        apiKeys: { anthropic: '', finnhub: '', fintable: 'ft_test' },
        fintableRoles: undefined,
        fintableSyncReport: undefined,
        isTestMode: false,
    });
});

describe('FintableSyncCard — vie privée', () => {
    it('n\'affiche AUCUN montant, même après avoir listé des comptes qui en portent', async () => {
        listMock.mockResolvedValue({ accounts: ACCOUNTS, error: null });
        const { container } = render(<FintableSyncCard />);

        fireEvent.click(screen.getByRole('button', { name: /Tester la connexion/i }));
        await waitFor(() => expect(screen.getByText('Disnat L7B1')).toBeInTheDocument());

        // Les soldes existent dans la donnée (1500 / 136863.18) mais ne doivent APPARAÎTRE nulle part.
        const text = container.textContent ?? '';
        expect(text).not.toMatch(/136\s?863/);
        expect(text).not.toMatch(/1[\s ]?500/);
        // Et aucun symbole monétaire rendu par la carte.
        expect(text).not.toContain(' $');
    });
});

describe('FintableSyncCard — garde-fous d\'action', () => {
    it('sans jeton : les deux boutons sont désactivés', () => {
        useFinanceStore.setState({ apiKeys: { anthropic: '', finnhub: '', fintable: '' } });
        render(<FintableSyncCard />);
        expect(screen.getByRole('button', { name: /Tester la connexion/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /Synchroniser maintenant/i })).toBeDisabled();
    });

    it('en MODE DÉMO : la synchronisation est bloquée et dite (jamais de mélange démo/réel)', () => {
        useFinanceStore.setState({ isTestMode: true });
        render(<FintableSyncCard />);
        expect(screen.getByRole('button', { name: /Synchroniser maintenant/i })).toBeDisabled();
        expect(screen.getByText(/Mode démo actif/i)).toBeInTheDocument();
        expect(syncMock).not.toHaveBeenCalled();
    });

    it('une erreur de connexion est rendue en alerte, sans liste de comptes fabriquée', async () => {
        listMock.mockResolvedValue({ accounts: [], error: '[AUTH] jeton invalide' });
        render(<FintableSyncCard />);
        fireEvent.click(screen.getByRole('button', { name: /Tester la connexion/i }));
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/AUTH/));
        expect(screen.queryByText(/Rôle de chaque compte/i)).toBeNull();
    });
});

describe('FintableSyncCard — écriture de l\'état après une passe', () => {
    it('écrit TOUT champ modifié par la passe, y compris ceux qu\'aucune liste ne nomme', async () => {
        // [finding silent-failure-hunter, PR #536] Le 1er jet énumérait 5 clés à la main et perdait
        // déjà `lastUpdate`. Ce test utilise un champ VOLONTAIREMENT hors de cette liste historique
        // (`assets`) : il échoue sur l'ancien code, passe avec le delta par référence.
        useFinanceStore.setState({ transactions: [], assets: [], lastUpdate: 1 });
        const before = useFinanceStore.getState() as unknown as Record<string, unknown>;
        syncMock.mockImplementation(async (state: Record<string, unknown>) => ({
            report: { at: 42, error: null, transactionsAdded: 3, accountsSeen: 1, warnings: [] },
            nextState: {
                ...state,
                transactions: [{ id: 9, date: '2026-07-30', payee: 'X', amount: -5, category: 'Autre', status: 'processed' }],
                assets: [{ symbol: 'ZZZ', quantity: 1, currency: 'CAD', currentPrice: 1, name: 'Z', performance: 0, dateBought: '2026-01-01' }],
                lastUpdate: 999,
            },
        }));

        render(<FintableSyncCard />);
        fireEvent.click(screen.getByRole('button', { name: /Synchroniser maintenant/i }));
        // NB : deux régions `role=status` coexistent (zone sr-only d'occupation + notice visible)
        // → cibler le TEXTE, pas le rôle, sinon le matcher est ambigu.
        await waitFor(() => expect(screen.getByText(/3 transaction\(s\) ajoutée/)).toBeInTheDocument());

        const after = useFinanceStore.getState() as unknown as Record<string, unknown>;
        expect((after.transactions as unknown[]).length).toBe(1);
        expect(after.lastUpdate).toBe(999);                       // ← perdu par l'ancienne liste
        expect((after.assets as unknown[])[0]).toMatchObject({ symbol: 'ZZZ' }); // ← idem
        // Et les clés INCHANGÉES ne sont pas réécrites : pas d'écrasement d'une modif concurrente.
        expect(after.budgetItems).toBe(before.budgetItems);
    });

    it('échec de passe → SEUL le rapport est écrit, aucun contenu', async () => {
        useFinanceStore.setState({ transactions: [] });
        syncMock.mockResolvedValue({
            report: { at: 7, error: '[NETWORK] panne', transactionsAdded: 0, accountsSeen: 0, warnings: [] },
            nextState: null,
        });

        render(<FintableSyncCard />);
        fireEvent.click(screen.getByRole('button', { name: /Synchroniser maintenant/i }));
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/NETWORK/));

        expect(useFinanceStore.getState().fintableSyncReport?.error).toContain('NETWORK');
        expect(useFinanceStore.getState().transactions).toEqual([]);
    });
});

describe('FintableSyncCard — assignation des rôles', () => {
    it('choisir « Placement » pré-remplit NON-ENREG (réponse de Marc), sans rien deviner d\'autre', async () => {
        listMock.mockResolvedValue({ accounts: ACCOUNTS, error: null });
        render(<FintableSyncCard />);
        fireEvent.click(screen.getByRole('button', { name: /Tester la connexion/i }));
        await waitFor(() => expect(screen.getByText('Disnat L7B1')).toBeInTheDocument());

        fireEvent.change(screen.getByLabelText(/Rôle de Disnat L7B1/i), { target: { value: 'investment' } });

        expect(useFinanceStore.getState().fintableRoles?.acc_2).toEqual({
            kind: 'investment', taxRegime: 'NON-ENREG',
        });
        // L'autre compte reste NON déclaré — rien n'est rangé d'office.
        expect(useFinanceStore.getState().fintableRoles?.acc_1).toBeUndefined();
    });

    it('choisir « Dette » demande le nom EXACT et le persiste', async () => {
        listMock.mockResolvedValue({ accounts: ACCOUNTS, error: null });
        render(<FintableSyncCard />);
        fireEvent.click(screen.getByRole('button', { name: /Tester la connexion/i }));
        await waitFor(() => expect(screen.getByText('Compte chèque')).toBeInTheDocument());

        fireEvent.change(screen.getByLabelText(/Rôle de Compte chèque/i), { target: { value: 'debt' } });
        const nameInput = await screen.findByLabelText(/Nom EXACT de la dette/i);
        fireEvent.change(nameInput, { target: { value: 'Desjardins Cash Back Mastercard' } });

        expect(useFinanceStore.getState().fintableRoles?.acc_1).toEqual({
            kind: 'debt', debtName: 'Desjardins Cash Back Mastercard',
        });
    });
});

describe('FintableSyncCard — persistance du jeton dans le coffre chiffré ([FINTABLE-TOKEN-PERSIST])', () => {
    // DISCRIMINANT par construction : sur le code d'avant (incident 2026-08-05), saveApiKeys
    // n'était JAMAIS appelé depuis cette carte → ces deux tests échouent (mock jamais invoqué).
    it('au blur de l\'input, le jeton est écrit dans secureKeyStore avec les AUTRES clés', async () => {
        render(<FintableSyncCard />);
        const input = screen.getByLabelText(/Jeton Fintable/i);
        fireEvent.change(input, { target: { value: 'ft_nouveau' } });
        fireEvent.blur(input);
        await waitFor(() => expect(saveKeysMock).toHaveBeenCalled());
        // Le blob écrit contient le jeton FRAIS et n'écrase pas les autres clés.
        const written = saveKeysMock.mock.calls.at(-1)?.[0] as Record<string, string>;
        expect(written.fintable).toBe('ft_nouveau');
        expect(written).toHaveProperty('anthropic');
        expect(written).toHaveProperty('finnhub');
    });

    it('« Tester la connexion » persiste aussi le jeton (ceinture au clic direct)', async () => {
        listMock.mockResolvedValue({ accounts: [], error: null });
        render(<FintableSyncCard />);
        fireEvent.click(screen.getByRole('button', { name: /Tester la connexion/i }));
        await waitFor(() => expect(saveKeysMock).toHaveBeenCalled());
    });

    it('un échec du coffre est AFFICHÉ, jamais silencieux (le jeton reste valide en session)', async () => {
        saveKeysMock.mockRejectedValue(new Error('IndexedDB indisponible'));
        render(<FintableSyncCard />);
        const input = screen.getByLabelText(/Jeton Fintable/i);
        fireEvent.change(input, { target: { value: 'ft_nouveau' } });
        fireEvent.blur(input);
        await waitFor(() => expect(screen.getByText(/Jeton non sauvegardé/i)).toBeInTheDocument());
    });
});
