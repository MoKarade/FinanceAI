// La carte « Connecter à Claude » : le bouton dans l'app (télécharger le .mcpb + étapes).
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClaudeConnectorCard } from '../../../components/settings/ClaudeConnectorCard';

describe('ClaudeConnectorCard', () => {
    it('affiche le titre, le lien Claude Desktop et le bouton de téléchargement du .mcpb', () => {
        render(<ClaudeConnectorCard />);
        expect(screen.getByText(/Connecter à Claude/i)).toBeInTheDocument();

        const desktop = screen.getByRole('link', { name: /Claude Desktop/i });
        expect(desktop.getAttribute('href')).toContain('claude.ai/download');

        const dl = screen.getByText(/Télécharger le connecteur/i).closest('a');
        expect(dl?.getAttribute('href')).toContain('.mcpb');
        expect(dl?.hasAttribute('download')).toBe(true);
    });
});
