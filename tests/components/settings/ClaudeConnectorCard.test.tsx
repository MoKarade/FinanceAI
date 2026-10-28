// La carte « Connecter à Claude » : le bouton de téléchargement du .mcpb n'apparaît QUE si le
// fichier est réellement servi (sinon le bouton 404ait / téléchargeait le fallback SPA HTML).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClaudeConnectorCard } from '../../../components/settings/ClaudeConnectorCard';

const mockFetch = (ok: boolean, contentType = 'application/octet-stream') =>
    vi.fn().mockResolvedValue({ ok, headers: { get: () => contentType } } as unknown as Response);

afterEach(() => { vi.restoreAllMocks(); });

describe('ClaudeConnectorCard', () => {
    it('affiche toujours le titre et le lien Claude Desktop', () => {
        vi.stubGlobal('fetch', mockFetch(false));
        render(<ClaudeConnectorCard />);
        expect(screen.getByText(/Connecter à Claude/i)).toBeInTheDocument();
        const desktop = screen.getByRole('link', { name: /Claude Desktop/i });
        expect(desktop.getAttribute('href')).toContain('claude.ai/download');
    });

    it('affiche le bouton de téléchargement quand le .mcpb est servi', async () => {
        vi.stubGlobal('fetch', mockFetch(true));
        render(<ClaudeConnectorCard />);
        const dl = (await screen.findByText(/Télécharger le connecteur/i)).closest('a');
        expect(dl?.getAttribute('href')).toContain('.mcpb');
        expect(dl?.hasAttribute('download')).toBe(true);
    });

    it('n\'affiche PAS de bouton cassé quand le .mcpb est absent (404)', async () => {
        vi.stubGlobal('fetch', mockFetch(false));
        render(<ClaudeConnectorCard />);
        expect(await screen.findByText(/pas encore disponible/i)).toBeInTheDocument();
        expect(screen.queryByText(/Télécharger le connecteur/i)).toBeNull();
    });

    it('traite le fallback SPA (HTML) comme indisponible', async () => {
        vi.stubGlobal('fetch', mockFetch(true, 'text/html; charset=utf-8'));
        render(<ClaudeConnectorCard />);
        expect(await screen.findByText(/pas encore disponible/i)).toBeInTheDocument();
        expect(screen.queryByText(/Télécharger le connecteur/i)).toBeNull();
    });
});
