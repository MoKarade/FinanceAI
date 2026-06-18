// [PRIV-DISCRET-DOM] — PrivateAmount MASQUE la valeur (•••) en mode discret : la vraie valeur n'est PLUS
// dans le DOM (copier-coller / inspecteur / lecteur d'écran : zéro fuite). Choix Marc 2026-06-17.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { PrivateAmount } from '../../../components/ui/PrivateAmount';
import { useFinanceStore } from '../../../store/useFinanceStore';

describe('[PRIV-DISCRET-DOM] PrivateAmount', () => {
    beforeEach(() => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: false }); });
    });

    it('mode discret INACTIF : la valeur est rendue telle quelle (accessible)', () => {
        render(<PrivateAmount>123 456$</PrivateAmount>);
        const el = screen.getByText('123 456$');
        expect(el).toBeTruthy();
        expect(el.closest('[aria-hidden="true"]')).toBeNull();
    });

    it('mode discret ACTIF : la VRAIE valeur sort du DOM (masquée par •••)', () => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        const { container } = render(<PrivateAmount>123 456$</PrivateAmount>);
        // La valeur réelle ne doit PLUS être dans le DOM (fin de la fuite copier-coller/inspecteur/SR).
        expect(screen.queryByText('123 456$')).toBeNull();
        expect(container.textContent).not.toContain('123 456$');
        // Le masque ••• est affiché (aria-hidden, hors arbre SR)…
        const mask = container.querySelector('[aria-hidden="true"]');
        expect(mask?.textContent).toBe('•••');
        // …et un texte de remplacement est annoncé aux SR.
        expect(container.querySelector('.sr-only')?.textContent).toBe('Montant masqué');
    });

    it('réagit au toggle du store (bascule live)', () => {
        const { container } = render(<PrivateAmount>42$</PrivateAmount>);
        expect(screen.getByText('42$')).toBeTruthy();
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        expect(screen.queryByText('42$')).toBeNull();
        expect(container.querySelector('.sr-only')?.textContent).toBe('Montant masqué');
    });

    it('conserve l\'infobulle native `title`', () => {
        const { container } = render(<PrivateAmount title="Écart vs référence">7$</PrivateAmount>);
        expect(container.firstElementChild?.getAttribute('title')).toBe('Écart vs référence');
    });
});
