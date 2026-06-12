// [D6-SR-2] — PrivateBlock masque aux LECTEURS D'ÉCRAN un BLOC de plusieurs montants en mode privé,
// SANS wrapper les enfants (≠ PrivateAmount) → le layout flex/grid du conteneur est préservé.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { PrivateBlock } from '../../../components/ui/PrivateBlock';
import { useFinanceStore } from '../../../store/useFinanceStore';

const TwoValues = () => (
    <>
        <span>+100$</span>
        <span>+5$</span>
    </>
);

describe('[D6-SR-2] PrivateBlock', () => {
    beforeEach(() => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: false }); });
    });

    it('mode privé INACTIF : les valeurs sont rendues, aucun aria-hidden, aucun sr-only', () => {
        const { container } = render(<PrivateBlock><TwoValues /></PrivateBlock>);
        expect(screen.getByText('+100$')).toBeTruthy();
        expect(screen.getByText('+5$')).toBeTruthy();
        expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
        expect(container.querySelector('.sr-only')).toBeNull();
    });

    it('mode privé ACTIF : conteneur aria-hidden + « Montant masqué » annoncé UNE fois', () => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        const { container } = render(<PrivateBlock><TwoValues /></PrivateBlock>);
        // Les valeurs restent dans le DOM (blur visuel) mais sous un conteneur aria-hidden.
        const block = container.querySelector('[aria-hidden="true"]');
        expect(block).not.toBeNull();
        expect(block?.textContent).toContain('+100$');
        expect(block?.textContent).toContain('+5$');
        // …et même en mode privé, les enfants restent DIRECTS (aucun wrapper inséré → flex intact).
        expect(block?.children).toHaveLength(2);
        // Un SEUL remplacement SR, et il est HORS du conteneur aria-hidden (donc annoncé).
        const srOnly = container.querySelector('.sr-only');
        expect(srOnly?.textContent).toBe('Montant masqué');
        expect(srOnly?.closest('[aria-hidden="true"]')).toBeNull();
    });

    it('préserve le flex : les enfants restent des enfants DIRECTS du conteneur (pas de wrapper)', () => {
        const { container } = render(
            <PrivateBlock className="flex gap-2"><TwoValues /></PrivateBlock>,
        );
        const block = container.firstElementChild!;
        expect(block.className).toContain('privacy-blur');
        expect(block.className).toContain('flex');
        // Les 2 <span> de valeur sont enfants directs (sinon le flex justify/gap casserait).
        expect(block.children).toHaveLength(2);
        expect(block.children[0].textContent).toBe('+100$');
        expect(block.children[1].textContent).toBe('+5$');
    });

    it('réagit au toggle du store (bascule live)', () => {
        const { container } = render(<PrivateBlock><TwoValues /></PrivateBlock>);
        expect(container.querySelector('.sr-only')).toBeNull();
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        expect(container.querySelector('.sr-only')?.textContent).toBe('Montant masqué');
    });
});
