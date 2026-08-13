/**
 * [AI-VISION-PAYSLIP-NOGATE] — l'import de talon écrivait `grossSalary`/`netSalary` DIRECTEMENT
 * dans `config.users[N]` via `setAppState` : aucune confirmation, aucun backup, aucune garde > 0,
 * alors que la MÊME opération via le chat exige diff + modale + `createBackupNow`. Une hallucination
 * OCR écrasait donc le profil salarial qui alimente TOUTE l'app (fiscalité + projection).
 *
 * Ce fichier verrouille le contrat désormais commun aux deux surfaces :
 *   1. RIEN n'est écrit avant le clic « Appliquer » (le diff est montré d'abord) ;
 *   2. une sauvegarde est prise AVANT l'écriture — backup échoué = écriture ANNULÉE ;
 *   3. « Annuler » (et toute fermeture) laisse le profil intact ;
 *   4. des montants ≤ 0 / non finis sont REFUSÉS sans même proposer d'écriture ;
 *   5. [A11Y-PRIVACY-TAXCENTER, fuite jumelle] le récapitulatif Brut/Net/Impôt est masqué en
 *      mode discret.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { useFinanceStore } from '../../../store/useFinanceStore';
import { PayslipUploadCard } from '../../../components/settings/PayslipUploadCard';
import { analyzePayslip } from '../../../services/claude';
import { createBackupNow } from '../../../services/backupAuto';

vi.mock('../../../services/claude', () => ({ analyzePayslip: vi.fn() }));
vi.mock('../../../components/ui/Toast', () => ({ showToast: vi.fn() }));
vi.mock('../../../services/backupAuto', () => ({
    createBackupNow: vi.fn(async () => ({ id: 'bk1', timestamp: Date.now() })),
}));

const analyzeMock = vi.mocked(analyzePayslip);
const backupMock = vi.mocked(createBackupNow);

const initialState = useFinanceStore.getState();

const GROSS_PERIOD = 3000;   // bi-hebdo → 78 000 $/an → 6 500 $/mois stockés
const NET_PERIOD = 2100;     // → 54 600 $/an → 4 550 $/mois

beforeEach(() => {
    useFinanceStore.setState(initialState, true);
    vi.clearAllMocks();
    backupMock.mockResolvedValue({ id: 'bk1', timestamp: Date.now() } as never);
    analyzeMock.mockResolvedValue({
        grossPeriod: GROSS_PERIOD, netPeriod: NET_PERIOD, taxPeriod: 700, rrspPeriod: 200,
        frequency: 'Bi-Weekly',
    });
    useFinanceStore.setState({
        apiKeys: { ...initialState.apiKeys, anthropic: 'sk-test' },
        isPrivacyMode: false,
    });
});

const grossOf = (i = 0) => useFinanceStore.getState().config.users[i].grossSalary;
const netOf = (i = 0) => useFinanceStore.getState().config.users[i].netSalary;

/** Dépose un fichier et attend que le modal de confirmation soit monté. */
const dropFile = async (container: HTMLElement) => {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['paie'], 'talon-juin.png', { type: 'image/png' });
    await act(async () => {
        fireEvent.change(input, { target: { files: [file] } });
    });
};

describe('[AI-VISION-PAYSLIP-NOGATE] écriture du salaire par l\'IA Vision', () => {
    it('montre le diff et n\'écrit RIEN tant que « Appliquer » n\'est pas cliqué', async () => {
        const { container } = render(<PayslipUploadCard />);
        const grossAvant = grossOf();
        await dropFile(container);

        expect(await screen.findByText('Confirmer la modification')).toBeInTheDocument();
        // Le diff nomme le champ touché — l'utilisateur voit CE qui change avant que ça change.
        expect(document.body.textContent).toContain('grossSalary');
        expect(grossOf(), 'le profil ne doit pas bouger avant le clic').toBe(grossAvant);
        expect(backupMock, 'pas de backup tant qu\'il n\'y a pas d\'écriture').not.toHaveBeenCalled();
    });

    it('« Appliquer » : sauvegarde AVANT écriture, puis salaire stocké en MENSUEL', async () => {
        const { container } = render(<PayslipUploadCard />);
        await dropFile(container);
        await screen.findByText('Confirmer la modification');

        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Appliquer' })); });

        expect(backupMock).toHaveBeenCalledTimes(1);
        // Le spec partagé convertit l'ANNUEL en MENSUEL (convention canonique du store).
        await waitFor(() => expect(grossOf()).toBe(Math.round(GROSS_PERIOD * 26 / 12)));
        expect(netOf()).toBe(Math.round(NET_PERIOD * 26 / 12));
        // [INCOME-PROVENANCE] provenance « payslip » (dépôt in-app), PAS « mcp » (connecteur).
        expect(useFinanceStore.getState().config.users[0].salarySource?.kind).toBe('payslip');
        expect(useFinanceStore.getState().config.users[0].salarySource?.label).toBe('talon-juin.png');
    });

    it('« Annuler » : le profil salarial reste INTACT', async () => {
        const { container } = render(<PayslipUploadCard />);
        const grossAvant = grossOf();
        await dropFile(container);
        await screen.findByText('Confirmer la modification');

        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Annuler' })); });

        expect(grossOf()).toBe(grossAvant);
        expect(backupMock).not.toHaveBeenCalled();
    });

    it('backup ÉCHOUÉ → écriture ANNULÉE (le filet est la CONDITION de l\'écriture)', async () => {
        backupMock.mockResolvedValue(null);
        const { container } = render(<PayslipUploadCard />);
        const grossAvant = grossOf();
        await dropFile(container);
        await screen.findByText('Confirmer la modification');

        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Appliquer' })); });

        expect(backupMock).toHaveBeenCalledTimes(1);
        expect(grossOf(), 'pas de sauvegarde = pas d\'écriture').toBe(grossAvant);
    });

    it('montants ≤ 0 ou non finis : REFUSÉS, aucune écriture proposée', async () => {
        for (const bad of [0, -3000, Number.POSITIVE_INFINITY, Number.NaN]) {
            useFinanceStore.setState(initialState, true);
            // Salaire PRÉEXISTANT non nul : sans lui, écrire « 0 » par-dessus un défaut à 0 serait
            // indétectable — le test ne discriminerait pas l'ancien comportement.
            const users = [...initialState.config.users] as typeof initialState.config.users;
            users[0] = { ...users[0], grossSalary: 5555, netSalary: 4444 };
            useFinanceStore.setState({
                apiKeys: { ...initialState.apiKeys, anthropic: 'sk-test' },
                config: { ...initialState.config, users },
            });
            analyzeMock.mockResolvedValue({
                grossPeriod: bad, netPeriod: NET_PERIOD, taxPeriod: 0, rrspPeriod: 0, frequency: 'Monthly',
            });
            const grossAvant = grossOf();
            const { container, unmount } = render(<PayslipUploadCard />);
            await dropFile(container);

            expect(screen.queryByText('Confirmer la modification'), `brut ${bad} ne doit rien proposer`).toBeNull();
            expect(grossOf(), `brut ${bad} ne doit rien écrire`).toBe(grossAvant);
            expect(backupMock).not.toHaveBeenCalled();
            unmount();
        }
    });

    it('[A11Y-PRIVACY] le récapitulatif Brut/Net/Impôt est MASQUÉ en mode discret', async () => {
        const { container } = render(<PayslipUploadCard />);
        await dropFile(container);
        await screen.findByText('Confirmer la modification');
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Appliquer' })); });

        const flat = () => (container.textContent ?? '').replace(/[\s  ]/g, '');
        const annualGross = String(GROSS_PERIOD * 26); // 78 000 $ affichés en « Brut/an »
        await waitFor(() => expect(flat(), 'le test discrimine : lisible hors mode discret').toContain(annualGross));

        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        expect(flat(), 'Brut/an fuyait en mode discret').not.toContain(annualGross);
        expect(screen.getAllByText('Montant masqué').length).toBeGreaterThan(0);
    });
});
