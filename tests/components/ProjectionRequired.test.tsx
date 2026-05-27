/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectionRequired } from '../../components/ui/ProjectionRequired';
import { useFinanceStore } from '../../store/useFinanceStore';
import { Tab } from '../../types';

const navSpy = vi.fn();

beforeEach(() => {
    navSpy.mockClear();
    useFinanceStore.setState({ navigateWithFocus: navSpy as never });
});

describe('ProjectionRequired', () => {
    it('variante block : affiche le message + bouton vers Future', () => {
        render(<ProjectionRequired feature="le capital à la retraite" />);
        expect(screen.getByText(/Projection nécessaire/i)).toBeTruthy();
        expect(screen.getByText(/le capital à la retraite/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Future/i }));
        expect(navSpy).toHaveBeenCalledWith(Tab.FUTURE);
    });

    it('variante inline : lien « ouvrir Future » navigue', () => {
        render(<ProjectionRequired variant="inline" />);
        expect(screen.getByText(/Projection requise/i)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Future/i }));
        expect(navSpy).toHaveBeenCalledWith(Tab.FUTURE);
    });

    it('feature par défaut « cette donnée » si non fournie', () => {
        render(<ProjectionRequired />);
        expect(screen.getByText(/cette donnée/)).toBeTruthy();
    });
});
