// tests/components/investments/AddStockForm.test.tsx
//
// « Rentrer toutes les données à la main, pareil pour les actions » : on prouve qu'on peut ajouter
// une action/un placement EN ENTIER à la main, sans clé Finnhub ni réseau (mode « À la main »).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddStockForm } from '../../../components/investments/AddStockForm';
import { getQuoteDetaille, searchSymbolsDetaille, getActiveProviderName } from '../../../services/marketData';

// Aucune dépendance réseau ne doit être requise pour le mode manuel.
vi.mock('../../../services/marketData', () => ({
    // [AI-FINNHUB-CAUSE-COLLAPSE] Le faux module suit le contrat RÉEL de la façade : un résultat
    // DISCRIMINÉ, jamais une exception. L'ancien faux `getQuote` qui REJETAIT décrivait un contrat
    // que la production n'a jamais eu (mesuré : 401/429/réseau rendaient `null`, sans lever) —
    // le test de panne réseau passait donc sur un chemin qui n'existe pas.
    getQuoteDetaille: vi.fn(async () => ({ forme: 'absent' })),
    getHistory: vi.fn(async () => []),
    getActiveProviderName: vi.fn(() => 'none'), // PH4-INV-1 : pas de clé → mode dégradé, pas d'autocomplétion
    searchSymbolsDetaille: vi.fn(async () => ({ forme: 'ok', resultats: [] })),
}));

// Défauts restaurés avant chaque test (les tests manuels exigent provider 'none').
beforeEach(() => {
    vi.mocked(getActiveProviderName).mockReturnValue('none');
    vi.mocked(getQuoteDetaille).mockResolvedValue({ forme: 'absent' });
    vi.mocked(searchSymbolsDetaille).mockResolvedValue({ forme: 'ok', resultats: [] });
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
        vi.mocked(searchSymbolsDetaille).mockResolvedValue({ forme: 'ok', resultats: [
            { symbol: 'SHOP.TO', description: 'Shopify Inc (TSX)', displaySymbol: 'SHOP.TO' },
        ] });
        vi.mocked(getQuoteDetaille).mockResolvedValue({ forme: 'absent' }); // mismatch : proposé mais non cotable

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

    it('une PANNE réseau garde l erreur VISIBLE — pas de bascule manuelle silencieuse', async () => {
        // Distinction money-UX : une panne réseau ≠ un symbole non cotable. On ne doit PAS masquer
        // une panne derrière « entre le prix à la main ».
        vi.mocked(getActiveProviderName).mockReturnValue('Finnhub');
        vi.mocked(searchSymbolsDetaille).mockResolvedValue({ forme: 'ok', resultats: [
            { symbol: 'AAPL', description: 'Apple Inc', displaySymbol: 'AAPL' },
        ] });
        vi.mocked(getQuoteDetaille).mockResolvedValue({ forme: 'echec', echec: { cause: 'NETWORK', provider: 'finnhub' } });

        render(<AddStockForm isOpen onClose={() => {}} onAdd={vi.fn()} />);
        fireEvent.change(screen.getByPlaceholderText(/Tape un nom/i), { target: { value: 'appl' } });
        fireEvent.click(await screen.findByText(/Apple Inc/i));

        // L'erreur réseau RESTE affichée ; pas de notice « entre à la main » ni de bascule en mode manuel.
        expect(await screen.findByText(/Impossible de joindre le service de cours/i)).toBeInTheDocument();
        expect(screen.queryByText(/n.a pas de cours via Finnhub/i)).toBeNull();
        expect(screen.queryByText(/Prix actuel par action \(manuel\)/i)).toBeNull();
    });

    // [AI-FINNHUB-CAUSE-COLLAPSE] Le message doit NOMMER la cause : une panne réseau ne renvoie pas
    // à la clé API, et une clé refusée ne dit pas « ticker introuvable ». Sans cette paire, les deux
    // situations restaient indiscernables à l'écran (c'était le défaut).
    it('la cause de l échec choisit le message : réseau ≠ clé refusée ≠ absence', async () => {
        vi.mocked(getActiveProviderName).mockReturnValue('Finnhub');
        const lire = async (): Promise<string> => {
            const { unmount } = render(<AddStockForm isOpen onClose={() => {}} onAdd={vi.fn()} />);
            fireEvent.change(screen.getByPlaceholderText(/Tape un nom/i), { target: { value: 'aapl' } });
            fireEvent.click(screen.getByRole('button', { name: /Valider/i }));
            const texte = (await screen.findByRole('alert')).textContent ?? '';
            unmount();
            return texte;
        };

        vi.mocked(getQuoteDetaille).mockResolvedValue({ forme: 'echec', echec: { cause: 'NETWORK', provider: 'finnhub' } });
        const reseau = await lire();
        vi.mocked(getQuoteDetaille).mockResolvedValue({ forme: 'echec', echec: { cause: 'AUTH', provider: 'finnhub' } });
        const auth = await lire();
        vi.mocked(getQuoteDetaille).mockResolvedValue({ forme: 'absent' });
        const absent = await lire();

        // Trois situations, trois phrases : c'est l'inverse exact du défaut corrigé.
        expect(new Set([reseau, auth, absent]).size).toBe(3);
        // Et chacune envoie au bon endroit.
        expect(reseau).not.toMatch(/Clés API|introuvable/i);
        expect(auth).toMatch(/Réglages/i);
        expect(absent).toMatch(/introuvable/i);
    });

    // [MARKETDATA-SEARCH-CAUSE-COLLAPSE] Une autocomplétion qui ne descend pas ne dit RIEN par
    // elle-même : sans message, une clé refusée et un titre inexistant se ressemblent trait pour
    // trait. La garde tient les DEUX sens — sans le second, afficher un message en permanence
    // (donc du bruit à chaque frappe sans résultat) la satisferait.
    it('un ÉCHEC de recherche nomme sa cause sous le champ', async () => {
        vi.mocked(getActiveProviderName).mockReturnValue('Finnhub');
        vi.mocked(searchSymbolsDetaille).mockResolvedValue({ forme: 'echec', echec: { cause: 'AUTH', provider: 'finnhub' } });

        render(<AddStockForm isOpen onClose={() => {}} onAdd={vi.fn()} />);
        fireEvent.change(screen.getByPlaceholderText(/Tape un nom/i), { target: { value: 'aapl' } });

        expect(await screen.findByText(/Réglages/i)).toBeInTheDocument();
    });

    it('CONTRE-ÉPREUVE : « aucun résultat » n’affiche aucune cause', async () => {
        vi.mocked(getActiveProviderName).mockReturnValue('Finnhub');
        vi.mocked(searchSymbolsDetaille).mockResolvedValue({ forme: 'ok', resultats: [] });

        render(<AddStockForm isOpen onClose={() => {}} onAdd={vi.fn()} />);
        fireEvent.change(screen.getByPlaceholderText(/Tape un nom/i), { target: { value: 'zzzz' } });

        // La région live existe DÉJÀ (montée en permanence — sinon la première annonce est perdue)…
        const region = screen.getByRole('status');
        expect(region).toBeInTheDocument();
        // …et elle est VIDE : rien n'a échoué, il n'y a rien à dire.
        await new Promise((r) => setTimeout(r, 350)); // au-delà du débounce de 300 ms
        expect(region.textContent).toBe('');
    });

    it('[RECH-ACTION-UX] Escape ferme le dropdown SANS fermer la modale (ni perdre la saisie)', async () => {
        vi.mocked(getActiveProviderName).mockReturnValue('Finnhub');
        vi.mocked(searchSymbolsDetaille).mockResolvedValue({ forme: 'ok', resultats: [
            { symbol: 'AAPL', description: 'Apple Inc', displaySymbol: 'AAPL' },
        ] });
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

describe('[ADDSTOCK-CAD-NATIF] le récapitulatif reste en devise NATIVE, jamais formatCAD', () => {
    it('devise USD (défaut) : quantité × prix affichés en USD, aucun symbole "$ CA"', () => {
        render(<AddStockForm isOpen onClose={() => {}} onAdd={vi.fn()} />);
        fireEvent.change(screen.getByPlaceholderText(/AAPL, TSLA/i), { target: { value: 'gic-rbc' } });
        fireEvent.click(screen.getByRole('button', { name: /À la main/i }));
        fireEvent.change(screen.getByPlaceholderText(/152\.30/), { target: { value: '100' } });
        fireEvent.change(screen.getByPlaceholderText('10'), { target: { value: '5' } });
        fireEvent.change(screen.getByPlaceholderText('150.00'), { target: { value: '90' } });

        const recap = screen.getByText('Récapitulatif').parentElement as HTMLElement;
        // quantity × buyPrice EST en devise native (USD ici) — formatCAD y afficherait "$ CA",
        // qui n'apparaît nulle part. Le code de devise, lui, apparaît deux fois (prix + total).
        // [FISC-INTEGRITY revue #686] `not.toMatch(/\$\s*CA/)` était VACUEUX : formatCAD ne rend
        // jamais "$ CA" sous cette version d'ICU (juste "$") — l'assertion ne pouvait pas rougir.
        // `not.toContain('$')` discrimine vraiment : l'ancien formatCAD rendait un symbole $.
        expect(recap.textContent).not.toContain('$');
        expect((recap.textContent!.match(/USD/g) ?? []).length).toBe(2);
        expect(recap.textContent).toContain('450,00'); // 5 × 90,00 = 450,00 (formatNumber, pas formatCAD)
    });

    it('devise EUR : le total porte EUR, pas un symbole CAD', () => {
        render(<AddStockForm isOpen onClose={() => {}} onAdd={vi.fn()} />);
        fireEvent.change(screen.getByPlaceholderText(/AAPL, TSLA/i), { target: { value: 'lvmh' } });
        fireEvent.click(screen.getByRole('button', { name: /À la main/i }));
        fireEvent.change(screen.getByPlaceholderText(/152\.30/), { target: { value: '800' } });
        fireEvent.change(screen.getByLabelText('Devise'), { target: { value: 'EUR' } });
        fireEvent.change(screen.getByPlaceholderText('10'), { target: { value: '2' } });
        fireEvent.change(screen.getByPlaceholderText('150.00'), { target: { value: '700' } });

        const recap = screen.getByText('Récapitulatif').parentElement as HTMLElement;
        // [FISC-INTEGRITY revue #686] `not.toMatch(/\$\s*CA/)` était VACUEUX : formatCAD ne rend
        // jamais "$ CA" sous cette version d'ICU (juste "$") — l'assertion ne pouvait pas rougir.
        // `not.toContain('$')` discrimine vraiment : l'ancien formatCAD rendait un symbole $.
        expect(recap.textContent).not.toContain('$');
        // espace INSÉCABLE (Intl fr-CA), pas une espace normale — normaliser avant de comparer.
        expect(recap.textContent!.replace(/\s/g, ' ')).toContain('1 400,00'); // 2 × 700,00 EUR
        expect((recap.textContent!.match(/EUR/g) ?? []).length).toBe(2);
    });

    // [code-reviewer revue #686, MOYEN] Le chemin « validation Finnhub réussie » (bannière
    // « Prix actuel : … ») n'avait AUCUN test — un `formatCAD(currentPrice)` oublié y a survécu
    // 90 lignes sous le premier correctif, sans qu'aucune suite ne rougisse.
    it('bannière « Prix actuel » (Finnhub validé) : devise NATIVE, pas CAD', async () => {
        vi.mocked(getActiveProviderName).mockReturnValue('Finnhub');
        vi.mocked(getQuoteDetaille).mockResolvedValue({ forme: 'ok', quote: { symbol: 'AAPL', price: 231.4 } } as never);

        render(<AddStockForm isOpen onClose={() => {}} onAdd={vi.fn()} />);
        fireEvent.change(screen.getByPlaceholderText(/Tape un nom/i), { target: { value: 'aapl' } });
        fireEvent.click(screen.getByRole('button', { name: /Valider/i }));

        const banner = await screen.findByText(/Prix actuel/i);
        // devise par défaut du formulaire = USD (state initial) — jamais un symbole $ CAD.
        expect(banner.textContent).toContain('USD');
        expect(banner.textContent).not.toContain('$');
        expect(banner.textContent).toContain('231,40');
    });
});
