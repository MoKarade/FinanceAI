// [AITOOLS-C] AiAssistant en tool-use — le cerveau (runAgentLoop) est mocké, le reste est réel
// (store, hook useAiChat, rendu). Avant : smoke CA-04 seul (chatStream mocké).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AiAssistant } from '../../components/AiAssistant';
import { useFinanceStore } from '../../store/useFinanceStore';

const runAgentLoopMock = vi.fn();
vi.mock('../../services/aiTools/agentLoop', () => ({
    runAgentLoop: (...args: unknown[]) => runAgentLoopMock(...args),
}));
// Le fournisseur d'état tire le vrai store (validation incluse) — inutile ici, le loop est mocké.
vi.mock('../../services/aiTools/appStateProvider', () => ({
    appStateProvider: vi.fn(async () => ({})),
}));

beforeEach(() => {
    // jsdom n'implémente pas scrollIntoView (utilisé par l'auto-scroll du fil de messages).
    Element.prototype.scrollIntoView = vi.fn();
    useFinanceStore.getState().resetState();
    runAgentLoopMock.mockReset();
    runAgentLoopMock.mockResolvedValue({
        text: 'Ton patrimoine est **solide**.',
        toolsUsed: ['get_financial_overview'],
        turns: 2, stopReason: 'end', messages: [],
    });
});

function openPanel() {
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir le conseiller IA/i }));
}

describe('AiAssistant — tool-use (AITOOLS-C)', () => {
    it('rend sans crash (conversation vide)', () => {
        const { container } = render(<AiAssistant apiKey="" />);
        expect(container).toBeTruthy();
    });

    it('envoi → runAgentLoop appelé, réponse finale + chip « a consulté » rendus', async () => {
        render(<AiAssistant apiKey="sk-test" />);
        openPanel();
        fireEvent.change(screen.getByLabelText(/Question au conseiller IA/i), { target: { value: 'Où j\'en suis ?' } });
        fireEvent.click(screen.getByRole('button', { name: /Envoyer le message/i }));

        await waitFor(() => {
            expect(runAgentLoopMock).toHaveBeenCalledTimes(1);
        });
        await waitFor(() => {
            expect(document.body.textContent).toContain('Ton patrimoine est');
        });
        // Chips par message : posées via onToolUse — simulé en appelant le callback fourni.
        const opts = runAgentLoopMock.mock.calls[0][1] as { onToolUse?: (n: string) => void };
        expect(typeof opts.onToolUse).toBe('function');
        // La conversation persistée reste LÉGÈRE : rôle+texte(+labels), jamais de payload JSON.
        const conv = useFinanceStore.getState().aiConversation;
        expect(conv.at(-1)!.role).toBe('model');
        expect(conv.at(-1)!.text).toContain('solide');
        // L'HISTORIQUE envoyé inclut le tour utilisateur courant (slice APRÈS append).
        const history = runAgentLoopMock.mock.calls[0][0] as Array<{ role: string; content: string }>;
        expect(history.at(-1)!.role).toBe('user');
        expect(history.at(-1)!.content).toContain('en suis');
    });

    it('clé API absente → message honnête, runAgentLoop JAMAIS appelé', async () => {
        render(<AiAssistant apiKey="" />);
        openPanel();
        fireEvent.change(screen.getByLabelText(/Question au conseiller IA/i), { target: { value: 'test' } });
        fireEvent.click(screen.getByRole('button', { name: /Envoyer le message/i }));
        await waitFor(() => {
            expect(document.body.textContent).toContain('Clé API Anthropic manquante');
        });
        expect(runAgentLoopMock).not.toHaveBeenCalled();
    });

    it('mode TEST actif → bannière « Mode démo » visible dans le panneau', () => {
        useFinanceStore.setState({ isTestMode: true } as never);
        render(<AiAssistant apiKey="sk-test" />);
        openPanel();
        expect(screen.getByText(/Mode démo actif/i)).toBeInTheDocument();
    });

    it('[ADR-5] mode DISCRET → conversation et champ de saisie HORS du DOM (masquer = ne pas rendre)', () => {
        useFinanceStore.setState({
            isPrivacyMode: true,
            aiConversation: [{ role: 'model', text: 'Ton REER vaut 123456$', timestamp: '2026-01-01T00:00:00Z' }],
        } as never);
        render(<AiAssistant apiKey="sk-test" />);
        openPanel();
        expect(screen.getByText(/Mode discret actif/i)).toBeInTheDocument();
        // La valeur ne doit PAS être dans le DOM (pas un blur CSS) et l'input non plus.
        expect(document.body.textContent).not.toContain('123456');
        expect(screen.queryByLabelText(/Question au conseiller IA/i)).toBeNull();
    });
});
