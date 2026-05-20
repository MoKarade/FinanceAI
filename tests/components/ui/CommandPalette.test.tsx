import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandPalette, useCommandPalette, makeNavigationActions, type CommandAction } from '../../../components/ui/CommandPalette';
import React from 'react';
import { Tab } from '../../../types';

const TestHarness: React.FC<{ actions: CommandAction[] }> = ({ actions }) => {
    const cmd = useCommandPalette();
    return (
        <>
            <button onClick={cmd.open}>open</button>
            <CommandPalette open={cmd.isOpen} onClose={cmd.close} actions={actions} />
        </>
    );
};

describe('CommandPalette', () => {
    it('s\'ouvre via le hook et focus l\'input', () => {
        const fn = vi.fn();
        render(<TestHarness actions={[{
            id: 'a', label: 'Action A', group: 'Test', onSelect: fn,
        }]} />);
        fireEvent.click(screen.getByText('open'));
        expect(screen.getByRole('dialog', { name: 'Palette de commandes' })).toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: 'Rechercher une commande' })).toBeInTheDocument();
    });

    it('filtre les actions par query', () => {
        render(<TestHarness actions={[
            { id: '1', label: 'Aller à Dashboard', group: 'Nav', keywords: ['home'], onSelect: vi.fn() },
            { id: '2', label: 'Aller à Budget', group: 'Nav', keywords: ['expense'], onSelect: vi.fn() },
        ]} />);
        fireEvent.click(screen.getByText('open'));
        const input = screen.getByRole('textbox', { name: 'Rechercher une commande' });
        fireEvent.change(input, { target: { value: 'budget' } });
        expect(screen.queryByText('Aller à Dashboard')).not.toBeInTheDocument();
        expect(screen.getByText('Aller à Budget')).toBeInTheDocument();
    });

    it('Enter exécute l\'action active et ferme le modal', () => {
        const fn = vi.fn();
        render(<TestHarness actions={[
            { id: '1', label: 'Action 1', group: 'G', onSelect: fn },
        ]} />);
        fireEvent.click(screen.getByText('open'));
        const input = screen.getByRole('textbox', { name: 'Rechercher une commande' });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(fn).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('affiche message "Aucun résultat" si filtre vide', () => {
        render(<TestHarness actions={[
            { id: '1', label: 'Foo', group: 'G', onSelect: vi.fn() },
        ]} />);
        fireEvent.click(screen.getByText('open'));
        fireEvent.change(screen.getByRole('textbox', { name: 'Rechercher une commande' }), {
            target: { value: 'zzzz_no_match' },
        });
        expect(screen.getByText('Aucun résultat.')).toBeInTheDocument();
    });

    it('Esc ferme le modal', () => {
        render(<TestHarness actions={[
            { id: '1', label: 'A', group: 'G', onSelect: vi.fn() },
        ]} />);
        fireEvent.click(screen.getByText('open'));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        // Esc handler is global on window, simulate it
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});

describe('makeNavigationActions', () => {
    it('génère 17 actions de navigation pour tous les Tabs', () => {
        const set = vi.fn();
        const actions = makeNavigationActions(set);
        expect(actions.length).toBe(Object.keys(Tab).length);
        actions.forEach(a => expect(a.group).toBe('Navigation'));
    });

    it('chaque action appelle setActiveTab avec le bon Tab', () => {
        const set = vi.fn();
        const actions = makeNavigationActions(set);
        const dashAction = actions.find(a => a.id === `nav:${Tab.DASHBOARD}`);
        dashAction?.onSelect();
        expect(set).toHaveBeenCalledWith(Tab.DASHBOARD);
    });
});
