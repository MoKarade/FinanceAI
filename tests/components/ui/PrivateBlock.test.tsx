// [PRIV-DISCRET-DOM] — PrivateBlock MASQUE les valeurs d'un BLOC par un unique « ••• » en mode discret :
// les vraies valeurs sortent du DOM, le conteneur est aria-hidden + un sr-only « Montant masqué » en frère.
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

describe('[PRIV-DISCRET-DOM] PrivateBlock', () => {
    beforeEach(() => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: false }); });
    });

    it('mode discret INACTIF : les valeurs sont rendues, aucun aria-hidden, aucun sr-only', () => {
        const { container } = render(<PrivateBlock><TwoValues /></PrivateBlock>);
        expect(screen.getByText('+100$')).toBeTruthy();
        expect(screen.getByText('+5$')).toBeTruthy();
        expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
        expect(container.querySelector('.sr-only')).toBeNull();
    });

    it('mode discret ACTIF : valeurs HORS DOM (masquées •••), conteneur aria-hidden + sr-only frère', () => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        const { container } = render(<PrivateBlock><TwoValues /></PrivateBlock>);
        // Les vraies valeurs ne sont PLUS dans le DOM.
        expect(container.textContent).not.toContain('+100$');
        expect(container.textContent).not.toContain('+5$');
        // Conteneur masqué (aria-hidden) affichant •••.
        const block = container.querySelector('[aria-hidden="true"]');
        expect(block).not.toBeNull();
        expect(block?.textContent).toBe('•••');
        // Un SEUL remplacement SR, HORS du conteneur aria-hidden (donc annoncé).
        const srOnly = container.querySelector('.sr-only');
        expect(srOnly?.textContent).toBe('Montant masqué');
        expect(srOnly?.closest('[aria-hidden="true"]')).toBeNull();
    });

    it('mode INACTIF : les enfants restent des enfants DIRECTS du conteneur (flex préservé)', () => {
        const { container } = render(
            <PrivateBlock className="flex gap-2"><TwoValues /></PrivateBlock>,
        );
        const block = container.firstElementChild!;
        expect(block.className).toContain('flex');
        expect(block.children).toHaveLength(2);
        expect(block.children[0].textContent).toBe('+100$');
        expect(block.children[1].textContent).toBe('+5$');
    });

    it('réagit au toggle du store (bascule live)', () => {
        const { container } = render(<PrivateBlock><TwoValues /></PrivateBlock>);
        expect(container.querySelector('.sr-only')).toBeNull();
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        expect(container.querySelector('.sr-only')?.textContent).toBe('Montant masqué');
        expect(container.textContent).not.toContain('+100$');
    });
});
