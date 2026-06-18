// tests/components/investments/AddStockForm.test.tsx
//
// « Rentrer toutes les données à la main, pareil pour les actions » : on prouve qu'on peut ajouter
// une action/un placement EN ENTIER à la main, sans clé Finnhub ni réseau (mode « À la main »).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddStockForm } from '../../../components/investments/AddStockForm';
import { getQuote, searchSymbols, getActiveProviderName } from '../../../services/marketData';

// Aucune dépendance réseau ne doit être requise pour le mode manuel.
vi.mock('../../../services/marketData', () => ({
    getQuote: vi.fn(async () => null),
    getHistory: vi.fn(async () => []),
    getActiveProviderName: vi.fn(() => 'none'), // PH4-INV-1 : pas de clé → mode dégradé, pas d'autocomplétion
    searchSymbols: vi.fn(async () => []),
}));

// Défauts restaurés avant chaque test (les tests manuels exigent provider 'none').
beforeEach(() => {
    vi.mocked(getActiveProviderName).mockReturnValue('none');
    vi.mocked(getQuote).mockResolvedValue(null);
    vi.mocked(searchSymbols).mockResolvedValue([]);
});

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

describe('AddStockForm — [FINNHUB-MISMATCH] suggestion non cotable → fallback saisie manuelle', () => {
    it('sélectionner un symbole sans cours Finnhub bascule en mode manuel pré-rempli + notice (pas d erreur sèche)', async () => {
        // Provider configuré (autocomplétion active), mais /quote ne price pas ce symbole (TSX hors free tier).
        vi.mocked(getActiveProviderName).mockReturnValue('Finnhub');
        vi.mocked(searchSymbols).mockResolvedValue([
            { symbol: 'SHOP.TO', description: 'Shopify Inc (TSX)', displaySymbol: 'SHOP.TO' },
        ]);
        vi.mocked(getQuote).mockResolvedValue(null); // mismatch : proposé mais non cotable

        render(<AddStockForm isOpen onClose={() => {}} onAdd={vi.fn()} />);
        fireEvent.change(screen.getByPlaceholderText(/Tape un nom/i), { target: { value: 'shop' } });

        // débounce 300 ms → la suggestion apparaît, on la sélectionne.
        const suggestion = await screen.findByText(/Shopify Inc \(TSX\)/i);
        fireEvent.click(suggestion);

        // Fallback propre : un message INFORMATIF (pas l'erreur rouge « introuvable ») + le champ prix manuel.
        expect(await screen.findByText(/n.a pas de cours via Finnhub/i)).toBeInTheDocument();
        expect(screen.getByText(/Prix actuel par action \(manuel\)/i)).toBeInTheDocument();
        // Le symbole est conservé (pas perdu) → l'utilisateur finit à la main.
        expect(screen.getByDisplayValue('SHOP.TO')).toBeInTheDocument();
    });

    it('une PANNE réseau (getQuote throw) garde l erreur VISIBLE — pas de bascule manuelle silencieuse', async () => {
        // Distinction money-UX : une exception réseau (timeout/401) ≠ un symbole non cotable. On ne doit
        // PAS masquer une panne derrière « entre le prix à la main ».
        vi.mocked(getActiveProviderName).mockReturnValue('Finnhub');
        vi.mocked(searchSymbols).mockResolvedValue([
            { symbol: 'AAPL', description: 'Apple Inc', displaySymbol: 'AAPL' },
        ]);
        vi.mocked(getQuote).mockRejectedValue(new Error('network down'));

        render(<AddStockForm isOpen onClose={() => {}} onAdd={vi.fn()} />);
        fireEvent.change(screen.getByPlaceholderText(/Tape un nom/i), { target: { value: 'appl' } });
        fireEvent.click(await screen.findByText(/Apple Inc/i));

        // L'erreur réseau RESTE affichée ; pas de notice « entre à la main » ni de bascule en mode manuel.
        expect(await screen.findByText(/Erreur lors de la validation/i)).toBeInTheDocument();
        expect(screen.queryByText(/n.a pas de cours via Finnhub/i)).toBeNull();
        expect(screen.queryByText(/Prix actuel par action \(manuel\)/i)).toBeNull();
    });

    it('[RECH-ACTION-UX] Escape ferme le dropdown SANS fermer la modale (ni perdre la saisie)', async () => {
        vi.mocked(getActiveProviderName).mockReturnValue('Finnhub');
        vi.mocked(searchSymbols).mockResolvedValue([
            { symbol: 'AAPL', description: 'Apple Inc', displaySymbol: 'AAPL' },
        ]);
        const onClose = vi.fn();
        render(<AddStockForm isOpen onClose={onClose} onAdd={vi.fn()} />);
        const input = screen.getByPlaceholderText(/Tape un nom/i);
        fireEvent.change(input, { target: { value: 'appl' } });
        await screen.findByText(/Apple Inc/i); // dropdown ouvert

        fireEvent.keyDown(input, { key: 'Escape' });

        // Le dropdown se ferme, mais la MODALE reste ouverte (onClose NON appelé) et la saisie est conservée.
        expect(screen.queryByText(/Apple Inc/i)).toBeNull();
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByDisplayValue('APPL')).toBeInTheDocument();
    });
});
