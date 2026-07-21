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
    useFinanceStore.setState({ isPrivacyMode: false, isTestMode: false } as never);
    runAgentLoopMock.mockReset();
    executeWriteToolMock.mockReset();
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

    it('[Finding panel] Effacer est DÉSACTIVÉ pendant un envoi + le garde du hook ignore un clear programmatique', async () => {
        // Discriminant (sonde panel) : vider mi-stream perdait la réponse en cours (payée) sans trace.
        let resolveLoop: (v: unknown) => void = () => undefined;
        runAgentLoopMock.mockReturnValueOnce(new Promise((res) => { resolveLoop = res; }));
        render(<AiAssistant apiKey="sk-test" />);
        openPanel();
        fireEvent.change(screen.getByLabelText(/Question au conseiller IA/i), { target: { value: 'longue question' } });
        fireEvent.click(screen.getByRole('button', { name: /Envoyer le message/i }));
        await waitFor(() => expect(runAgentLoopMock).toHaveBeenCalledTimes(1));

        const clearBtn = screen.getByRole('button', { name: /Effacer la conversation/i });
        expect(clearBtn).toBeDisabled();
        fireEvent.click(clearBtn); // même cliqué (AT/programmatique), le garde du hook no-op
        expect(useFinanceStore.getState().aiConversation.length).toBeGreaterThan(0);

        resolveLoop({ text: 'Réponse finale.', toolsUsed: [], turns: 1, stopReason: 'end', messages: [] });
        await waitFor(() => expect(document.body.textContent).toContain('Réponse finale.'));
        // La réponse payée atterrit dans SA bulle (id stable) — rien n'est perdu.
        expect(useFinanceStore.getState().aiConversation.at(-1)!.text).toBe('Réponse finale.');
    });

    it('[Finding panel] deux envois dans le même tick → UNE seule boucle (garde de réentrance par ref)', async () => {
        // Discriminant (sonde panel) : la closure isLoading (state React) laissait passer deux
        // sendMessage du même tick → bulle vide définitive + réponse réattribuée au mauvais message.
        let resolveLoop: (v: unknown) => void = () => undefined;
        runAgentLoopMock.mockReturnValue(new Promise((res) => { resolveLoop = res; }));
        render(<AiAssistant apiKey="sk-test" />);
        openPanel();
        // Deux clics sur une suggestion dans le même burst (aucun await entre les deux).
        const suggestion = screen.getByRole('button', { name: /Quand retraite/i });
        fireEvent.click(suggestion);
        fireEvent.click(suggestion);
        await waitFor(() => expect(runAgentLoopMock).toHaveBeenCalled());
        expect(runAgentLoopMock).toHaveBeenCalledTimes(1);
        resolveLoop({ text: 'ok', toolsUsed: [], turns: 1, stopReason: 'end', messages: [] });
    });

    // ── [AITOOLS-D] Modal de confirmation d'écriture ─────────────────────────────────────────

    /** Câble un envoi qui déclenche UNE écriture via le vrai chemin useAiChat → executeWriteTool. */
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
        render(<AiAssistant apiKey="sk-test" />);
        openPanel();
        fireEvent.change(screen.getByLabelText(/Question au conseiller IA/i), { target: { value: 'Ajoute ma dette auto' } });
        fireEvent.click(screen.getByRole('button', { name: /Envoyer le message/i }));
        await waitFor(() => expect(screen.getByText(/Confirmer la modification/i)).toBeInTheDocument());
    }

    it('[AITOOLS-D] écriture proposée → MODAL avec le diff ; « Appliquer » → décision apply, la boucle conclut', async () => {
        const decisions = scriptWriteFlow();
        await sendTriggeringWrite();
        // Le diff est montré (champ + résumé) — la promesse de writeExecutor est EN ATTENTE du clic.
        expect(screen.getByText(/Dette : Prêt auto Civic/)).toBeInTheDocument();
        expect(screen.getByText(/Ajout de la dette/)).toBeInTheDocument();
        expect(decisions).toEqual([]); // rien tranché tant que pas de clic

        fireEvent.click(screen.getByRole('button', { name: /^Appliquer$/ }));
        await waitFor(() => expect(document.body.textContent).toContain('Dette traitée.'));
        expect(decisions).toEqual(['apply']);
        expect(screen.queryByText(/Confirmer la modification/i)).toBeNull(); // modal fermé
    });

    it('[AITOOLS-D] « Annuler » dans le modal → décision cancel (zéro écriture), la conversation continue', async () => {
        const decisions = scriptWriteFlow();
        await sendTriggeringWrite();
        fireEvent.click(screen.getByRole('button', { name: /^Annuler$/ }));
        await waitFor(() => expect(document.body.textContent).toContain('Dette traitée.'));
        expect(decisions).toEqual(['cancel']);
        expect(screen.queryByText(/Confirmer la modification/i)).toBeNull();
    });

    it('[AITOOLS-D] fermer le modal par ✕ (ou backdrop/Échap) = REFUS, jamais une promesse orpheline', async () => {
        const decisions = scriptWriteFlow();
        await sendTriggeringWrite();
        fireEvent.click(screen.getByRole('button', { name: /^Fermer$/ }));
        await waitFor(() => expect(document.body.textContent).toContain('Dette traitée.'));
        expect(decisions).toEqual(['cancel']);
    });

    it('[AITOOLS-D panel sécurité CRITIQUE] activer le MODE DISCRET pendant une confirmation → modal masqué + écriture auto-refusée (Loi 25)', async () => {
        // Discriminant (finding mesuré) : le modal affiche des montants et était rendu HORS du gating
        // mode discret → la valeur restait à l'écran. Activer le mode discret doit sortir la valeur du
        // DOM et refuser l'écriture en attente (cohérent avec « fermer = refus »).
        const decisions = scriptWriteFlow();
        await sendTriggeringWrite();
        expect(screen.getByText(/Dette : Prêt auto Civic/)).toBeInTheDocument();

        useFinanceStore.setState({ isPrivacyMode: true } as never);
        await waitFor(() => expect(screen.queryByText(/Confirmer la modification/i)).toBeNull());
        expect(document.body.textContent).not.toContain('Prêt auto Civic'); // valeur HORS du DOM
        await waitFor(() => expect(decisions).toEqual(['cancel'])); // écriture refusée, pas orpheline
    });

    it('[AITOOLS-D panel CRITIQUE] DÉMONTAGE pendant une confirmation (changement d\'onglet) → la promesse est RÉSOLUE en cancel, pas orpheline', async () => {
        // Discriminant (finding mesuré) : AiAssistant n'est monté que sur l'onglet Assistant ; changer
        // d'onglet le démonte pendant qu'un modal est ouvert. Sans le cleanup au démontage, la promesse
        // de requestConfirmation ne se résolvait JAMAIS → boucle agentique suspendue à vie.
        const decisions = scriptWriteFlow();
        const { unmount } = render(<AiAssistant apiKey="sk-test" />);
        openPanel();
        fireEvent.change(screen.getByLabelText(/Question au conseiller IA/i), { target: { value: 'Ajoute ma dette auto' } });
        fireEvent.click(screen.getByRole('button', { name: /Envoyer le message/i }));
        await waitFor(() => expect(screen.getByText(/Confirmer la modification/i)).toBeInTheDocument());
        expect(decisions).toEqual([]); // en attente du clic

        unmount(); // simule le changement d'onglet (TabRouter démonte AiAssistant)
        // Le cleanup du hook a résolu la confirmation en attente → executeWriteTool poursuit et résout.
        await waitFor(() => expect(decisions).toEqual(['cancel']));
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
