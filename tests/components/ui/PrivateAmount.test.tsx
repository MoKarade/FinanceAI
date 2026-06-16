// [D6-SR] — la primitive PrivateAmount masque les montants aux LECTEURS D'ÉCRAN en mode privé
// (le blur CSS seul laissait le texte lisible par SR — fuite).
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { PrivateAmount } from '../../../components/ui/PrivateAmount';
import { useFinanceStore } from '../../../store/useFinanceStore';

describe('[D6-SR] PrivateAmount', () => {
    beforeEach(() => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: false }); });
    });

    it('mode privé INACTIF : la valeur est rendue telle quelle (accessible)', () => {
        render(<PrivateAmount>123 456$</PrivateAmount>);
        const el = screen.getByText('123 456$');
        expect(el).toBeTruthy();
        // Pas de masquage : aucun aria-hidden sur la valeur.
        expect(el.closest('[aria-hidden="true"]')).toBeNull();
    });

    it('mode privé ACTIF : valeur aria-hidden + « Montant masqué » annoncé aux SR', () => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        const { container } = render(<PrivateAmount>123 456$</PrivateAmount>);
        // La valeur est toujours dans le DOM (pour le blur visuel + dé-floutage hover)…
        const value = screen.getByText('123 456$');
        // …mais cachée aux SR.
        expect(value.closest('[aria-hidden="true"]')).not.toBeNull();
        // Et un texte de remplacement est exposé aux SR.
        expect(container.querySelector('.sr-only')?.textContent).toBe('Montant masqué');
    });

    it('porte la classe privacy-blur (le visuel CSS existant reste piloté par Layout)', () => {
        const { container } = render(<PrivateAmount className="font-mono">99$</PrivateAmount>);
        const root = container.firstElementChild!;
        expect(root.className).toContain('privacy-blur');
        expect(root.className).toContain('font-mono');
    });

    it('réagit au toggle du store (bascule live)', () => {
        const { container } = render(<PrivateAmount>42$</PrivateAmount>);
        expect(container.querySelector('.sr-only')).toBeNull();
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        expect(container.querySelector('.sr-only')?.textContent).toBe('Montant masqué');
    });

    it('conserve l\'infobulle native `title` (migration depuis un <span title="…"> brut)', () => {
        const { container } = render(<PrivateAmount title="Écart vs référence">7$</PrivateAmount>);
        expect(container.firstElementChild?.getAttribute('title')).toBe('Écart vs référence');
    });
});
