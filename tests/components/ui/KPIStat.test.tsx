import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KPIStat } from '../../../components/ui/KPIStat';

describe('KPIStat', () => {
    it('renders label and value', () => {
        render(<KPIStat label="Patrimoine" value="320 000 $" />);
        expect(screen.getByText('Patrimoine')).toBeInTheDocument();
        expect(screen.getByText('320 000 $')).toBeInTheDocument();
    });

    it('renders trend with success color when positive number', () => {
        const { container } = render(<KPIStat label="L" value="V" trend={500} />);
        const trendEl = container.querySelector('.text-success-400');
        expect(trendEl).not.toBeNull();
        expect(trendEl?.textContent).toContain('500');
    });

    it('renders trend with danger color when string starts with -', () => {
        const { container } = render(<KPIStat label="L" value="V" trend="-200$" />);
        const trendEl = container.querySelector('.text-danger-400');
        expect(trendEl).not.toBeNull();
    });

    it('is clickable when onClick provided', async () => {
        const onClick = vi.fn();
        const user = userEvent.setup();
        render(<KPIStat label="Patrimoine" value="V" onClick={onClick} />);
        await user.click(screen.getByRole('button'));
        expect(onClick).toHaveBeenCalledOnce();
    });

    it('applies privacy-blur class when privacy=true', () => {
        const { container } = render(<KPIStat label="L" value="123$" privacy />);
        expect(container.querySelector('.privacy-blur')).not.toBeNull();
    });

    it('[D6-SR] privacy + mode privé : la value est aria-hidden + sr-only « Montant masqué »', async () => {
        const { useFinanceStore } = await import('../../../store/useFinanceStore');
        const { act } = await import('@testing-library/react');
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        try {
            const { container } = render(<KPIStat label="L" value="123$" privacy />);
            expect(screen.getByText('123$').closest('[aria-hidden="true"]')).not.toBeNull();
            expect(container.querySelector('.sr-only')?.textContent).toBe('Montant masqué');
        } finally {
            act(() => { useFinanceStore.setState({ isPrivacyMode: false }); });
        }
    });

    it('[Revue #247] value INTERACTIVE (CTA) → NE PAS passer privacy : le bouton reste accessible', () => {
        // Garde le contrat du fix Dashboard `privacy={hasValue}` : un consommateur qui met un CTA en
        // value DOIT gater privacy, sinon PrivateAmount rendrait le bouton aria-hidden (WCAG 4.1.2).
        render(<KPIStat label="L" value={<button type="button">Calculer</button>} privacy={false} />);
        const btn = screen.getByRole('button', { name: 'Calculer' });
        expect(btn.closest('[aria-hidden="true"]')).toBeNull();
    });
});
