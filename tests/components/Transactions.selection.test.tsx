/**
 * @vitest-environment jsdom
 *
 * UI6 (a11y) — La sélection de ligne du tableau Transactions se faisait via
 * onClick sur le <tr> (+ shift-clic), et la checkbox de ligne était `readOnly`
 * (sans onChange) → impossible à piloter au clavier.
 *
 * Ces tests verrouillent que la checkbox de ligne :
 *   - reflète l'état de sélection (checked),
 *   - PILOTE la sélection (un click la coche/décoche),
 *   - est opérable AU CLAVIER (Espace sur la checkbox focalisée déclenche un
 *     click natif → toggle), sans dépendre du onClick du <tr>,
 *   - préserve la sélection par plage au shift-clic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, within } from '@testing-library/react';
import { Transactions } from '../../components/Transactions';
import type { Transaction } from '../../types';

// services/claude : on ne déclenche jamais l'IA dans ces tests, mais l'import
// doit être mocké (pas d'appel réseau au montage).
vi.mock('../../services/claude', () => ({
    categorizeBatch: vi.fn(),
}));

// Toast : évite tout effet de bord DOM globaux.
vi.mock('../../components/ui/Toast', () => ({
    showToast: vi.fn(),
}));

function makeTx(id: number, payee: string): Transaction {
    return {
        id,
        date: `2026-01-${String(id).padStart(2, '0')}`,
        payee,
        amount: -100 * id,
        category: 'Autre',
        status: 'processed',
    };
}

const TXS: Transaction[] = [
    makeTx(1, 'Alpha'),
    makeTx(2, 'Bravo'),
    makeTx(3, 'Charlie'),
];

function renderTransactions() {
    return render(
        <Transactions
            transactions={TXS}
            setTransactions={vi.fn()}
            apiKey=""
            budgetItems={[]}
        />,
    );
}

/** Récupère la checkbox de ligne DANS le tableau desktop (pas la carte mobile). */
function rowCheckbox(container: HTMLElement, payee: string): HTMLInputElement {
    const table = container.querySelector('table');
    expect(table, 'le tableau desktop doit être rendu').toBeTruthy();
    return within(table as HTMLElement).getByLabelText(`Selectionner ${payee}`) as HTMLInputElement;
}

describe('Transactions — sélection accessible (UI6)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('la checkbox de ligne reflète l\'état non sélectionné au départ', () => {
        const { container } = renderTransactions();
        expect(rowCheckbox(container, 'Alpha').checked).toBe(false);
    });

    it('un click sur la checkbox PILOTE la sélection (coche puis décoche)', () => {
        const { container } = renderTransactions();
        const cb = rowCheckbox(container, 'Bravo');

        fireEvent.click(cb);
        expect(rowCheckbox(container, 'Bravo').checked).toBe(true);

        fireEvent.click(cb);
        expect(rowCheckbox(container, 'Bravo').checked).toBe(false);
    });

    it('la checkbox n\'est PAS readOnly et porte un onChange (pilotable clavier)', () => {
        const { container } = renderTransactions();
        const cb = rowCheckbox(container, 'Alpha');
        // readOnly retiré : la checkbox est un véritable contrôle interactif.
        expect(cb.readOnly).toBe(false);
        expect(cb.getAttribute('aria-label')).toBe('Selectionner Alpha');
    });

    it('opérable au clavier : Espace sur la checkbox focalisée la coche', () => {
        const { container } = renderTransactions();
        const cb = rowCheckbox(container, 'Charlie');
        cb.focus();
        expect(cb).toHaveFocus();
        // Dans un navigateur, Espace sur une checkbox focalisée émet un événement
        // `click` natif. jsdom ne synthétise pas ce click depuis keyDown ; on émet
        // donc le click (équivalent du toggle natif clavier) et on vérifie le
        // résultat — ce qui valide que onChange/onClick pilotent bien la sélection
        // (alors qu'avec l'ancienne checkbox `readOnly` rien ne se produisait).
        fireEvent.keyDown(cb, { key: ' ', code: 'Space' });
        fireEvent.click(cb);
        expect(rowCheckbox(container, 'Charlie').checked).toBe(true);
    });

    it('le shift-clic sélectionne une plage (régression non cassée)', () => {
        const { container } = renderTransactions();
        // Sélection ancre sur Alpha…
        fireEvent.click(rowCheckbox(container, 'Alpha'));
        expect(rowCheckbox(container, 'Alpha').checked).toBe(true);
        // …puis shift-clic sur Charlie → Alpha, Bravo, Charlie sélectionnés.
        fireEvent.click(rowCheckbox(container, 'Charlie'), { shiftKey: true });
        expect(rowCheckbox(container, 'Alpha').checked).toBe(true);
        expect(rowCheckbox(container, 'Bravo').checked).toBe(true);
        expect(rowCheckbox(container, 'Charlie').checked).toBe(true);
    });

    it('un click sur la ligne <tr> sélectionne toujours (régression non cassée)', () => {
        const { container } = renderTransactions();
        const cb = rowCheckbox(container, 'Bravo');
        const row = cb.closest('tr');
        expect(row).toBeTruthy();
        fireEvent.click(row as HTMLElement);
        expect(rowCheckbox(container, 'Bravo').checked).toBe(true);
    });
});
