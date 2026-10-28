// tests/components/aiChat/AiChatView.attachments.test.tsx
//
// [AITOOLS-B1] UI des pièces jointes : le fix du finding panel ÉLEVÉ « cliquer une suggestion
// avec un fichier joint jetait le fichier EN SILENCE » (les suggestions ne s'affichent qu'à
// conversation vide — précisément la fenêtre où on joint un fichier avant le 1er message).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AiChatView } from '../../../components/aiChat/AiChatView';
import { useFinanceStore } from '../../../store/useFinanceStore';

const sendMessage = vi.fn(async () => {});
vi.mock('../../../components/aiChat/AiChatContext', () => ({
    useAiChatContext: () => ({
        isLoading: false,
        activeTools: [],
        pendingWrite: null,
        resolvePendingWrite: vi.fn(),
        sendMessage: (...args: unknown[]) => sendMessage(...args as []),
        cancel: vi.fn(),
        clearConversation: vi.fn(),
    }),
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'fr' } }),
}));

beforeEach(() => {
    sendMessage.mockClear();
    // jsdom n'implémente pas scrollIntoView (utilisé par l'auto-scroll du fil de messages).
    Element.prototype.scrollIntoView = vi.fn();
    useFinanceStore.getState().resetState();
    useFinanceStore.setState({ aiConversation: [], isTestMode: false, isPrivacyMode: false } as never);
});

const attachFile = (container: HTMLElement, file: File) => {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
};

describe('AiChatView — pièces jointes (UI)', () => {
    it('cliquer une SUGGESTION avec un fichier joint transmet le fichier (fix panel : il était jeté en silence)', async () => {
        const { container } = render(<AiChatView variant="tab" />);
        const file = new File(['x'], 'releve.pdf', { type: 'application/pdf' });
        attachFile(container, file);
        expect(screen.getByText('releve.pdf')).toBeInTheDocument(); // puce visible

        // Conversation vide → les suggestions sont affichées ; on clique la première.
        fireEvent.click(screen.getByText('Quand retraite ?'));

        await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
        const [, files] = sendMessage.mock.calls[0] as unknown as [string, File[] | undefined];
        expect(files).toBeDefined();
        expect(files![0].name).toBe('releve.pdf'); // le fichier PART avec la suggestion
    });

    it('envoi normal : fichier + texte transmis, puces vidées après envoi', async () => {
        const { container } = render(<AiChatView variant="tab" />);
        attachFile(container, new File(['a,b'], 'tx.csv', { type: 'text/csv' }));
        const input = screen.getByLabelText('Question au conseiller IA');
        fireEvent.change(input, { target: { value: 'Analyse ça' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
        const [text, files] = sendMessage.mock.calls[0] as unknown as [string, File[] | undefined];
        expect(text).toBe('Analyse ça');
        expect(files![0].name).toBe('tx.csv');
        expect(screen.queryByText('tx.csv')).toBeNull(); // puce retirée
    });

    it('fichier invalide à la sélection → refus immédiat, aucune puce', () => {
        const { container } = render(<AiChatView variant="tab" />);
        attachFile(container, new File(['x'], 'app.exe', { type: 'application/octet-stream' }));
        expect(screen.queryByText('app.exe')).toBeNull();
        expect(sendMessage).not.toHaveBeenCalled();
    });

    it('bouton retirer : la puce disparaît, rien n\'est envoyé', () => {
        const { container } = render(<AiChatView variant="tab" />);
        attachFile(container, new File(['x'], 'notes.txt', { type: 'text/plain' }));
        fireEvent.click(screen.getByLabelText('Retirer la pièce jointe notes.txt'));
        expect(screen.queryByText('notes.txt')).toBeNull();
        expect(sendMessage).not.toHaveBeenCalled();
    });
});
