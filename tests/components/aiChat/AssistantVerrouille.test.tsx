// [S5-REFONTE-ASSISTANT] Écran de l'Assistant sans clé API : aperçu inerte + carte d'activation.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { useFinanceStore } from '../../../store/useFinanceStore';
import { PageSetupGate } from '../../../components/setup/PageSetupGate';
import { AssistantVerrouille } from '../../../components/aiChat/AssistantVerrouille';
import { Tab } from '../../../types';

const initial = useFinanceStore.getState();
beforeEach(() => { useFinanceStore.setState(initial, true); });

const rendre = () => render(
    <PageSetupGate tab={Tab.ASSISTANT} verrouille={<AssistantVerrouille />}>
        <div>CHAT_REEL</div>
    </PageSetupGate>,
);

describe('AssistantVerrouille', () => {
    it('clé absente : titre, état « 0/1 », carte d\'activation, aperçu SANS élément interactif', () => {
        useFinanceStore.setState({ apiKeys: { ...initial.apiKeys, anthropic: '' } });
        rendre();
        expect(screen.getByRole('heading', { level: 1, name: 'Assistant' })).toBeInTheDocument();
        expect(screen.getByText(/Configuration requise · 0\/1/)).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: "Pour activer l'assistant" })).toBeInTheDocument();
        expect(screen.getByText(/Clé API Anthropic \(Claude\)/)).toHaveTextContent('à faire');
        const apercu = screen.getByRole('region', { name: "Aperçu de l'assistant" });
        expect(within(apercu).queryAllByRole('button')).toHaveLength(0);
        expect(within(apercu).queryAllByRole('textbox')).toHaveLength(0);
        expect(within(apercu).getByText('Quand retraite ?')).toBeInTheDocument();
        expect(screen.queryByText('CHAT_REEL')).toBeNull();
    });

    it('« Configurer / ajouter » mène au champ de la clé dans Réglages', () => {
        useFinanceStore.setState({ apiKeys: { ...initial.apiKeys, anthropic: '' } });
        const navigateWithFocus = vi.fn();
        useFinanceStore.setState({ navigateWithFocus });
        rendre();
        fireEvent.click(screen.getByRole('button', { name: 'Configurer / ajouter' }));
        expect(navigateWithFocus).toHaveBeenCalledWith(Tab.SETTINGS, 'apiKeys-anthropic');
    });

    it('clé présente : le vrai chat, plus l\'écran d\'activation', () => {
        useFinanceStore.setState({ apiKeys: { ...initial.apiKeys, anthropic: 'sk-test' } });
        rendre();
        expect(screen.getByText('CHAT_REEL')).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: "Pour activer l'assistant" })).toBeNull();
    });
});
