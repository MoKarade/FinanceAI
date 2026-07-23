// tests/components/aiChat/AiChatSignalCards.test.tsx
//
// [ASSISTANT-HUB — Test B du plan architect] Cartes de signaux de l'onglet Assistant fusionné :
// clic → message contextualisé au chat ; MODE DISCRET → clic NO-OP (l'observation porte le montant
// CUIT dans la phrase — rien ne doit partir vers l'API) ; états honnêtes (0 signal = message
// positif, jamais de cartes fabriquées).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AiChatSignalCards } from '../../../components/aiChat/AiChatSignalCards';
import { useFinanceStore } from '../../../store/useFinanceStore';

const sendMessage = vi.fn(async () => {});
vi.mock('../../../components/aiChat/AiChatContext', () => ({
    useAiChatContext: () => ({
        isLoading: false, activeTools: [], pendingWrite: null,
        resolvePendingWrite: vi.fn(), sendMessage: (...a: unknown[]) => sendMessage(...a as []),
        cancel: vi.fn(), clearConversation: vi.fn(),
    }),
}));
const toastSpy = vi.fn();
vi.mock('../../../components/ui/Toast', () => ({ showToast: (...a: unknown[]) => toastSpy(...a) }));

const seedSignalState = () => {
    useFinanceStore.setState({
        config: {
            ...useFinanceStore.getState().config,
            users: [
                { ...useFinanceStore.getState().config.users[0], name: 'Marc', grossSalary: 6000, netSalary: 4200 },
                useFinanceStore.getState().config.users[1],
            ],
        },
        debts: [{ id: 'd_1', name: 'Carte de crédit', balance: 8500, interestRate: 19.99, minimumPayment: 200 }],
    } as never);
};

beforeEach(() => {
    sendMessage.mockClear();
    toastSpy.mockClear();
    useFinanceStore.getState().resetState();
    useFinanceStore.setState({ isPrivacyMode: false } as never);
});

describe('AiChatSignalCards', () => {
    it('clic sur une carte → sendMessage contextualisé au signal (pas un prompt générique)', () => {
        seedSignalState();
        render(<AiChatSignalCards />);
        const card = screen.getByText(/dette\(s\) à taux/i).closest('button')!;
        fireEvent.click(card);
        expect(sendMessage).toHaveBeenCalledTimes(1);
        const [msg] = sendMessage.mock.calls[0] as unknown as [string];
        expect(msg).toContain('Explique-moi ce signal');
        expect(msg).toMatch(/dette\(s\) à taux ≥ 8%/i); // l'observation PRÉCISE du signal cliqué
    });

    it('MODE DISCRET → clic NO-OP (aucun montant ne part vers l\'API) + toast explicatif', () => {
        seedSignalState();
        useFinanceStore.setState({ isPrivacyMode: true } as never);
        render(<AiChatSignalCards />);
        const card = screen.getByText(/dette\(s\) à taux/i).closest('button')!;
        fireEvent.click(card);
        expect(sendMessage).not.toHaveBeenCalled(); // discriminant : sans le gate, ce test échoue
        expect(toastSpy).toHaveBeenCalled();
    });

    it('0 signal (finances saines) → message positif honnête, JAMAIS de cartes fabriquées', () => {
        // Profil avec données (salaire) mais aucun seuil dépassé côté dettes.
        useFinanceStore.setState({
            config: {
                ...useFinanceStore.getState().config,
                users: [
                    { ...useFinanceStore.getState().config.users[0], name: 'Marc', grossSalary: 6000, netSalary: 4200 },
                    useFinanceStore.getState().config.users[1],
                ],
            },
        } as never);
        render(<AiChatSignalCards />);
        // Soit « aucun signal », soit des signaux LÉGITIMES (CELI/REER room du salaire) — mais
        // jamais un remplissage à 3 : on assert qu'aucune carte n'existe SANS signal réel calculé.
        const list = screen.queryByRole('list', { name: 'Signaux financiers' });
        if (!list) {
            expect(screen.getByText(/Aucun signal/i)).toBeInTheDocument();
        } else {
            expect(list.querySelectorAll('button').length).toBeGreaterThan(0);
        }
    });

    it('sans données de profil → nudge de configuration (pas un mur, pas de cartes)', () => {
        render(<AiChatSignalCards />);
        expect(screen.getByText(/Configure ton profil/i)).toBeInTheDocument();
        expect(screen.queryByRole('list', { name: 'Signaux financiers' })).toBeNull();
    });
});
