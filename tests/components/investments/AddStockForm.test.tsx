// tests/components/investments/AddStockForm.test.tsx
//
// « Rentrer toutes les données à la main, pareil pour les actions » : on prouve qu'on peut ajouter
// une action/un placement EN ENTIER à la main, sans clé Finnhub ni réseau (mode « À la main »).

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddStockForm } from '../../../components/investments/AddStockForm';

// Aucune dépendance réseau ne doit être requise pour le mode manuel.
vi.mock('../../../services/marketData', () => ({
    getQuote: vi.fn(async () => null),
    getHistory: vi.fn(async () => []),
}));

describe('AddStockForm — saisie 100% manuelle (sans Finnhub)', () => {
    it('ajoute une action à la main sans validation API', () => {
        const onAdd = vi.fn();
        render(<AddStockForm isOpen onClose={() => {}} onAdd={onAdd} />);

        fireEvent.change(screen.getByPlaceholderText(/AAPL, TSLA/i), { target: { value: 'gic-rbc' } });
        fireEvent.click(screen.getByRole('button', { name: /À la main/i }));
        fireEvent.change(screen.getByPlaceholderText(/152\.30/), { target: { value: '100' } });
        fireEvent.change(screen.getByPlaceholderText('10'), { target: { value: '5' } });
        fireEvent.change(screen.getByPlaceholderText('150.00'), { target: { value: '90' } });
        fireEvent.click(screen.getByRole('button', { name: /Ajouter au portefeuille/i }));

        expect(onAdd).toHaveBeenCalledTimes(1);
        const asset = onAdd.mock.calls[0][0];
        expect(asset.symbol).toBe('GIC-RBC');
        expect(asset.currentPrice).toBe(100);
        expect(asset.quantity).toBe(5);
        expect(asset.buyPrice).toBe(90);
        expect(asset.purchases).toEqual([{ date: expect.any(String), quantity: 5, price: 90 }]);
    });

    it('Ajouter reste désactivé tant que le prix actuel manuel n est pas saisi', () => {
        render(<AddStockForm isOpen onClose={() => {}} onAdd={vi.fn()} />);
        fireEvent.change(screen.getByPlaceholderText(/AAPL, TSLA/i), { target: { value: 'xyz' } });
        fireEvent.click(screen.getByRole('button', { name: /À la main/i }));
        fireEvent.change(screen.getByPlaceholderText('10'), { target: { value: '5' } });
        fireEvent.change(screen.getByPlaceholderText('150.00'), { target: { value: '90' } });
        expect(screen.getByRole('button', { name: /Ajouter au portefeuille/i })).toBeDisabled();
    });
});
