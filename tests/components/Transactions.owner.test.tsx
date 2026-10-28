/**
 * @vitest-environment jsdom
 *
 * [PH4E-OWNER-EDIT] En mode COUPLE, le tableau Transactions expose une colonne « Conjoint » :
 * un sélecteur par ligne (Auto / Conjoint 1 / Conjoint 2) qui OVERRIDE l'attribution automatique
 * (par type de poste budget). « Auto » = `ownerId` undefined. En mode SOLO, la colonne est absente.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, within } from '@testing-library/react';
import { Transactions } from '../../components/Transactions';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { Transaction } from '../../types';

vi.mock('../../services/claude', () => ({ categorizeBatch: vi.fn() }));
vi.mock('../../components/ui/Toast', () => ({ showToast: vi.fn() }));

const initialState = useFinanceStore.getState();

function makeTx(id: number, payee: string, ownerId?: 0 | 1): Transaction {
    return { id, date: `2026-01-${String(id).padStart(2, '0')}`, payee, amount: -100 * id, category: 'Autre', status: 'processed', ownerId };
}
const TXS: Transaction[] = [makeTx(1, 'Alpha'), makeTx(2, 'Bravo', 1)];

function setCouple(coupled: boolean) {
    useFinanceStore.setState({
        config: {
            ...initialState.config,
            users: [
                { ...initialState.config.users[0], name: 'Alice' },
                { ...initialState.config.users[1], name: coupled ? 'Bob' : '' },
            ],
        },
    });
}

function renderTx(setTransactions = vi.fn()) {
    return { setTransactions, ...render(<Transactions transactions={TXS} setTransactions={setTransactions} apiKey="" budgetItems={[]} />) };
}

/** Sélecteur Conjoint d'une ligne DANS le tableau desktop (l'aria-label inclut la date — unicité). */
function ownerSelect(container: HTMLElement, payee: string): HTMLSelectElement {
    const table = container.querySelector('table') as HTMLElement;
    return within(table).getByLabelText(new RegExp(`Conjoint propriétaire de ${payee}`)) as HTMLSelectElement;
}

describe('Transactions — colonne Conjoint (PH4E-OWNER-EDIT)', () => {
    beforeEach(() => {
        useFinanceStore.setState(initialState, true);
        vi.clearAllMocks();
    });

    it('mode SOLO : aucune colonne « Conjoint »', () => {
        setCouple(false);
        const { container } = renderTx();
        const table = container.querySelector('table') as HTMLElement;
        expect(within(table).queryByText('Conjoint')).not.toBeInTheDocument();
        expect(within(table).queryByLabelText('Conjoint propriétaire de Alpha')).not.toBeInTheDocument();
    });

    it('mode COUPLE : la colonne « Conjoint » et un sélecteur par ligne apparaissent (libellés = prénoms)', () => {
        setCouple(true);
        const { container } = renderTx();
        const table = container.querySelector('table') as HTMLElement;
        expect(within(table).getByText('Conjoint')).toBeInTheDocument();
        const sel = ownerSelect(container, 'Alpha');
        expect(sel.value).toBe('auto'); // Alpha sans ownerId → Auto
        expect(within(sel).getByText('Alice')).toBeInTheDocument();
        expect(within(sel).getByText('Bob')).toBeInTheDocument();
        // Bravo a ownerId=1 → le sélecteur reflète le conjoint 1.
        expect(ownerSelect(container, 'Bravo').value).toBe('1');
    });

    it('changer le sélecteur écrit l\'ownerId (override) ; « Auto » remet à undefined', () => {
        setCouple(true);
        const { container, setTransactions } = renderTx();

        // Alpha (auto) → conjoint 0
        fireEvent.change(ownerSelect(container, 'Alpha'), { target: { value: '0' } });
        let updater = setTransactions.mock.calls.at(-1)![0] as (p: Transaction[]) => Transaction[];
        expect(updater(TXS).find(t => t.id === 1)!.ownerId).toBe(0);

        // Bravo (1) → Auto (undefined)
        fireEvent.change(ownerSelect(container, 'Bravo'), { target: { value: 'auto' } });
        updater = setTransactions.mock.calls.at(-1)![0] as (p: Transaction[]) => Transaction[];
        expect(updater(TXS).find(t => t.id === 2)!.ownerId).toBeUndefined();
    });

    it('revenu (amount > 0) ou transfert : PAS de sélecteur (l\'override n\'a aucun effet sur ces lignes)', () => {
        setCouple(true);
        const txs: Transaction[] = [
            { ...makeTx(1, 'Salaire'), amount: 3000 },       // revenu
            { ...makeTx(2, 'Virement'), isTransfer: true },  // transfert
            makeTx(3, 'Epicerie'),                            // dépense (a un sélecteur)
        ];
        const { container } = render(<Transactions transactions={txs} setTransactions={vi.fn()} apiKey="" budgetItems={[]} />);
        const table = container.querySelector('table') as HTMLElement;
        // Colonne présente (header), mais pas de sélecteur sur revenu/transfert.
        expect(within(table).getByText('Conjoint')).toBeInTheDocument();
        expect(within(table).queryByLabelText(/Conjoint propriétaire de Salaire/)).not.toBeInTheDocument();
        expect(within(table).queryByLabelText(/Conjoint propriétaire de Virement/)).not.toBeInTheDocument();
        // La dépense, elle, a bien son sélecteur.
        expect(within(table).getByLabelText(/Conjoint propriétaire de Epicerie/)).toBeInTheDocument();
    });
});
