// [AITOOLS-E] Chat in-app : provider (1 instance) + panneau global (AiChatLauncher) + onglet
// (AiAssistant), rendus partagés (AiChatView). La boucle (runAgentLoop) et les modules lourds
// (writeExecutor/appStateProvider) sont mockés ; le reste est réel (store, hook, context, rendu).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AiChatProvider } from '../../components/aiChat/AiChatContext';
import { AiChatLauncher } from '../../components/aiChat/AiChatLauncher';
import { AiAssistant } from '../../components/AiAssistant';
import { useFinanceStore } from '../../store/useFinanceStore';

const runAgentLoopMock = vi.fn();
vi.mock('../../services/aiTools/agentLoop', () => ({
    runAgentLoop: (...args: unknown[]) => runAgentLoopMock(...args),
}));
vi.mock('../../services/aiTools/appStateProvider', () => ({
    appStateProvider: vi.fn(async () => ({})),
}));
// [AITOOLS-D] L'exécuteur d'écriture est mocké : on teste le CÂBLAGE UI (executeWriteTool reçoit
// requestConfirmation → pendingWrite → modal → clic → décision), pas applyDocument (testé à part).
const executeWriteToolMock = vi.fn();
vi.mock('../../services/aiTools/writeExecutor', () => ({
    executeWriteTool: (...args: unknown[]) => executeWriteToolMock(...args),
}));

beforeEach(() => {
    // jsdom n'implémente pas scrollIntoView (utilisé par l'auto-scroll du fil de messages).
    Element.prototype.scrollIntoView = vi.fn();
    useFinanceStore.getState().resetState();
    // resetState ne remet PAS isPrivacyMode/isTestMode (hors initialState) → reset explicite pour
    // isoler les tests qui les activent (sinon fuite d'état inter-tests : le chat resterait masqué).
    // La clé Anthropic vient désormais du STORE (le provider la lit) — posée ici par défaut.
    useFinanceStore.setState({ isPrivacyMode: false, isTestMode: false, apiKeys: { anthropic: 'sk-test', finnhub: '' } } as never);
    runAgentLoopMock.mockReset();
    executeWriteToolMock.mockReset();
    runAgentLoopMock.mockResolvedValue({
        text: 'Ton patrimoine est **solide**.',
        toolsUsed: ['get_financial_overview'],
        turns: 2, stopReason: 'end', messages: [],
    });
});

/** Monte le panneau latéral global (FAB + drawer) dans le provider. */
function renderPanel() {
    return render(<AiChatProvider><AiChatLauncher /></AiChatProvider>);
}
function openPanel() {
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir le conseiller IA/i }));
}

describe('Chat in-app — provider + panneau global (AITOOLS-E)', () => {
    it('le panneau rend sans crash et partage le context', () => {
        const { container } = renderPanel();
        expect(container).toBeTruthy();
    });

    it('l\'onglet (AiAssistant) rend la conversation partagée en pleine page', () => {
        useFinanceStore.setState({ aiConversation: [{ role: 'model', text: 'Salut', timestamp: '' }] } as never);
        render(<AiChatProvider><AiAssistant /></AiChatProvider>);
        expect(screen.getByLabelText(/Question au conseiller IA/i)).toBeInTheDocument();
        expect(document.body.textContent).toContain('Salut');
    });

    it('envoi → runAgentLoop appelé, réponse finale rendue', async () => {
        renderPanel();
        openPanel();
        fireEvent.change(screen.getByLabelText(/Question au conseiller IA/i), { target: { value: 'Où j\'en suis ?' } });
        fireEvent.click(screen.getByRole('button', { name: /Envoyer le message/i }));

        await waitFor(() => expect(runAgentLoopMock).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(document.body.textContent).toContain('Ton patrimoine est'));
        // La conversation persistée reste LÉGÈRE : rôle+texte(+labels), jamais de payload JSON.
        const conv = useFinanceStore.getState().aiConversation;
        expect(conv.at(-1)!.role).toBe('model');
        expect(conv.at(-1)!.text).toContain('solide');
        // L'HISTORIQUE envoyé inclut le tour utilisateur courant (slice APRÈS append).
        const history = runAgentLoopMock.mock.calls[0][0] as Array<{ role: string; content: string }>;
        expect(history.at(-1)!.role).toBe('user');
        expect(history.at(-1)!.content).toContain('en suis');
    });

    it('clé API absente (store vide) → message honnête, runAgentLoop JAMAIS appelé', async () => {
        useFinanceStore.setState({ apiKeys: { anthropic: '', finnhub: '' } } as never);
        renderPanel();
        openPanel();
        fireEvent.change(screen.getByLabelText(/Question au conseiller IA/i), { target: { value: 'test' } });
        fireEvent.click(screen.getByRole('button', { name: /Envoyer le message/i }));
        await waitFor(() => expect(document.body.textContent).toContain('Clé API Anthropic manquante'));
        expect(runAgentLoopMock).not.toHaveBeenCalled();
    });

    it('mode TEST actif → bannière « Mode démo » visible', () => {
        useFinanceStore.setState({ isTestMode: true } as never);
        renderPanel();
        openPanel();
        expect(screen.getByText(/Mode démo actif/i)).toBeInTheDocument();
    });

    it('activité en cours pendant panneau FERMÉ → pastille sur le FAB', async () => {
        let resolveLoop: (v: unknown) => void = () => undefined;
        runAgentLoopMock.mockReturnValueOnce(new Promise((res) => { resolveLoop = res; }));
        renderPanel();
        openPanel();
        fireEvent.change(screen.getByLabelText(/Question au conseiller IA/i), { target: { value: 'longue question' } });
        fireEvent.click(screen.getByRole('button', { name: /Envoyer le message/i }));
        await waitFor(() => expect(runAgentLoopMock).toHaveBeenCalledTimes(1));
        // Ferme le panneau pendant que ça charge → le FAB doit signaler l'activité.
        fireEvent.click(screen.getByRole('button', { name: /Fermer le conseiller IA/i }));
        // La pastille est aria-hidden ; on vérifie sa présence via la classe d'animation sur le FAB.
        expect(document.querySelector('.bg-green-400.animate-pulse')).toBeTruthy();
        resolveLoop({ text: 'fini', toolsUsed: [], turns: 1, stopReason: 'end', messages: [] });
    });

    it('[Finding panel] Effacer DÉSACTIVÉ pendant un envoi + garde du hook contre un clear programmatique', async () => {
        let resolveLoop: (v: unknown) => void = () => undefined;
        runAgentLoopMock.mockReturnValueOnce(new Promise((res) => { resolveLoop = res; }));
        renderPanel();
        openPanel();
        fireEvent.change(screen.getByLabelText(/Question au conseiller IA/i), { target: { value: 'longue question' } });
        fireEvent.click(screen.getByRole('button', { name: /Envoyer le message/i }));
        await waitFor(() => expect(runAgentLoopMock).toHaveBeenCalledTimes(1));

        const clearBtn = screen.getByRole('button', { name: /Effacer la conversation/i });
        expect(clearBtn).toBeDisabled();
        fireEvent.click(clearBtn);
        expect(useFinanceStore.getState().aiConversation.length).toBeGreaterThan(0);

        resolveLoop({ text: 'Réponse finale.', toolsUsed: [], turns: 1, stopReason: 'end', messages: [] });
        await waitFor(() => expect(document.body.textContent).toContain('Réponse finale.'));
        expect(useFinanceStore.getState().aiConversation.at(-1)!.text).toBe('Réponse finale.');
    });

    it('[Finding panel] deux envois dans le même tick → UNE seule boucle (réentrance par ref)', async () => {
        let resolveLoop: (v: unknown) => void = () => undefined;
        runAgentLoopMock.mockReturnValue(new Promise((res) => { resolveLoop = res; }));
        renderPanel();
        openPanel();
        const suggestion = screen.getByRole('button', { name: /Quand retraite/i });
        fireEvent.click(suggestion);
        fireEvent.click(suggestion);
        await waitFor(() => expect(runAgentLoopMock).toHaveBeenCalled());
        expect(runAgentLoopMock).toHaveBeenCalledTimes(1);
        resolveLoop({ text: 'ok', toolsUsed: [], turns: 1, stopReason: 'end', messages: [] });
    });

    it('[ADR-5] mode DISCRET → conversation et champ de saisie HORS du DOM', () => {
        useFinanceStore.setState({
            isPrivacyMode: true,
            aiConversation: [{ role: 'model', text: 'Ton REER vaut 123456$', timestamp: '2026-01-01T00:00:00Z' }],
        } as never);
        renderPanel();
        openPanel();
        expect(screen.getByText(/Mode discret actif/i)).toBeInTheDocument();
        expect(document.body.textContent).not.toContain('123456');
        expect(screen.queryByLabelText(/Question au conseiller IA/i)).toBeNull();
    });

    // ── [AITOOLS-D] Confirmation d'écriture (rendue par le provider, une seule fois) ─────────────

    function scriptWriteFlow() {
        const decisions: string[] = [];
        executeWriteToolMock.mockImplementation(async (_spec, _args, requestConfirmation) => {
            const decision = await (requestConfirmation as (p: unknown) => Promise<string>)({
                toolName: 'apply_debt',
                summary: 'Ajout de la dette « Prêt auto Civic ».',
                changes: [{ field: 'Dette : Prêt auto Civic', before: null, after: 12000 }],
            });
            decisions.push(decision);
            return { content: [{ type: 'text', text: JSON.stringify({ applied: decision === 'apply' }) }] };
        });
        runAgentLoopMock.mockImplementation(async (_history: unknown, opts: {
            onWriteToolUse?: (spec: unknown, args: Record<string, unknown>) => Promise<unknown>;
        }) => {
            await opts.onWriteToolUse!({ name: 'apply_debt' }, { name: 'Prêt auto Civic', balance: 12000 });
            return { text: 'Dette traitée.', toolsUsed: ['apply_debt'], turns: 2, stopReason: 'end', messages: [] };
        });
        return decisions;
    }
    async function sendTriggeringWrite() {
        renderPanel();
        openPanel();
        fireEvent.change(screen.getByLabelText(/Question au conseiller IA/i), { target: { value: 'Ajoute ma dette auto' } });
        fireEvent.click(screen.getByRole('button', { name: /Envoyer le message/i }));
        await waitFor(() => expect(screen.getByText(/Confirmer la modification/i)).toBeInTheDocument());
    }

    it('[AITOOLS-D] écriture proposée → MODAL (rendu par le provider) ; « Appliquer » → décision apply', async () => {
        const decisions = scriptWriteFlow();
        await sendTriggeringWrite();
        expect(screen.getByText(/Dette : Prêt auto Civic/)).toBeInTheDocument();
        expect(decisions).toEqual([]);
        fireEvent.click(screen.getByRole('button', { name: /^Appliquer$/ }));
        await waitFor(() => expect(document.body.textContent).toContain('Dette traitée.'));
        expect(decisions).toEqual(['apply']);
        expect(screen.queryByText(/Confirmer la modification/i)).toBeNull();
    });

    it('[AITOOLS-D] « Annuler » dans le modal → décision cancel (zéro écriture)', async () => {
        const decisions = scriptWriteFlow();
        await sendTriggeringWrite();
        fireEvent.click(screen.getByRole('button', { name: /^Annuler$/ }));
        await waitFor(() => expect(document.body.textContent).toContain('Dette traitée.'));
        expect(decisions).toEqual(['cancel']);
    });

    it('[AITOOLS-D panel sécurité] activer le MODE DISCRET pendant une confirmation → modal masqué + auto-refus (Loi 25)', async () => {
        const decisions = scriptWriteFlow();
        await sendTriggeringWrite();
        expect(screen.getByText(/Dette : Prêt auto Civic/)).toBeInTheDocument();
        useFinanceStore.setState({ isPrivacyMode: true } as never);
        await waitFor(() => expect(screen.queryByText(/Confirmer la modification/i)).toBeNull());
        expect(document.body.textContent).not.toContain('Prêt auto Civic');
        await waitFor(() => expect(decisions).toEqual(['cancel']));
    });

    it('[AITOOLS-E] le provider est monté au niveau App → changer de surface NE démonte PAS la confirmation', async () => {
        // Discriminant du finding Lot D résolu à la racine : le provider (donc useAiChat) vit au-dessus
        // des onglets ; démonter le PANNEAU (fermer) ne détruit plus l'instance → la promesse survit.
        const decisions = scriptWriteFlow();
        await sendTriggeringWrite();
        // Ferme le panneau : le modal (rendu par le provider, pas par le panneau) reste visible.
        fireEvent.click(screen.getByRole('button', { name: /Fermer le conseiller IA/i }));
        expect(screen.getByText(/Confirmer la modification/i)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /^Appliquer$/ }));
        await waitFor(() => expect(decisions).toEqual(['apply']));
    });
});
