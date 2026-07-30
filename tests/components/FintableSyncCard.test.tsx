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

const ACCOUNTS = [
    { id: 'acc_1', label: 'Compte chèque', rawType: 'depository', currency: 'CAD', balance: 1500 },
    { id: 'acc_2', label: 'Disnat L7B1', rawType: 'brokerage', currency: 'CAD', balance: 136863.18 },
];

beforeEach(() => {
    listMock.mockReset();
    syncMock.mockReset();
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
