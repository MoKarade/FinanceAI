// [SEC-PRIVACY-BLUR-INPUTS, audit 2026-06-23] PrivateNumberInput : champ ÉDITABLE qui, en mode discret
// hors-focus, sort la VALEUR du DOM (••• comme PrivateAmount) et la révèle au clic/focus pour l'édition.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { PrivateNumberInput } from '../../../components/ui/PrivateNumberInput';
import { useFinanceStore } from '../../../store/useFinanceStore';

describe('[SEC-PRIVACY-BLUR-INPUTS] PrivateNumberInput', () => {
    beforeEach(() => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: false }); });
    });

    it('mode discret INACTIF : rend un <input> éditable avec la valeur', () => {
        render(<PrivateNumberInput type="number" value={1234} onChange={() => {}} />);
        const input = screen.getByDisplayValue('1234');
        expect(input.tagName).toBe('INPUT');
    });

    it('mode discret ACTIF + hors-focus : la VALEUR sort du DOM (bouton •••, aucun input)', () => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        const { container } = render(<PrivateNumberInput type="number" value={1234} onChange={() => {}} />);
        expect(container.querySelector('input')).toBeNull();
        expect(screen.queryByDisplayValue('1234')).toBeNull();
        expect(container.textContent).not.toContain('1234'); // zéro fuite copier-coller/inspecteur/SR
        const btn = container.querySelector('button');
        expect(btn?.textContent).toBe('•••');
        expect(btn?.getAttribute('aria-label')).toContain('Montant masqué');
    });

    it('mode discret ACTIF : le clic révèle un <input> éditable (focus-to-edit)', () => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        const { container } = render(<PrivateNumberInput type="number" value={1234} onChange={() => {}} />);
        const btn = container.querySelector('button')!;
        act(() => { fireEvent.click(btn); });
        const input = screen.getByDisplayValue('1234');
        expect(input.tagName).toBe('INPUT');
    });

    it('le bouton masqué stoppe la propagation du clic (ne toggle pas la ligne parente)', () => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        let parentClicked = false;
        const { container } = render(
            <div onClick={() => { parentClicked = true; }}>
                <PrivateNumberInput type="number" value={1} onChange={() => {}} />
            </div>,
        );
        act(() => { fireEvent.click(container.querySelector('button')!); });
        expect(parentClicked).toBe(false);
    });

    it('mode discret ACTIF : le blur re-masque (la valeur ressort du DOM)', () => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        const { container } = render(<PrivateNumberInput type="number" value={1234} onChange={() => {}} />);
        act(() => { fireEvent.click(container.querySelector('button')!); });
        expect(screen.getByDisplayValue('1234').tagName).toBe('INPUT');
        act(() => { fireEvent.blur(container.querySelector('input')!); });
        expect(container.querySelector('input')).toBeNull();
        expect(container.querySelector('button')?.textContent).toBe('•••');
    });

    it('mode discret ACTIF : le focus clavier (Tab) sur le bouton révèle l\'input', () => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        const { container } = render(<PrivateNumberInput type="number" value={1234} onChange={() => {}} />);
        act(() => { fireEvent.focus(container.querySelector('button')!); });
        expect(screen.getByDisplayValue('1234').tagName).toBe('INPUT');
    });

    it('activer le mode discret PENDANT l\'édition re-masque (la valeur ressort du DOM)', () => {
        const { container } = render(<PrivateNumberInput type="number" value={1234} onChange={() => {}} />);
        expect(screen.getByDisplayValue('1234')).toBeTruthy(); // édité hors mode discret
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        expect(container.querySelector('input')).toBeNull();
        expect(screen.queryByDisplayValue('1234')).toBeNull();
        expect(container.querySelector('button')?.textContent).toBe('•••');
    });

    it('propage le `id` au bouton masqué ET à l\'input (association <label htmlFor> préservée)', () => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        const { container } = render(<PrivateNumberInput id="champ-x" type="number" value={1} onChange={() => {}} />);
        expect(container.querySelector('button')?.getAttribute('id')).toBe('champ-x');
        act(() => { fireEvent.click(container.querySelector('button')!); });
        expect(container.querySelector('input')?.getAttribute('id')).toBe('champ-x');
    });
});
