// tests/components/DebtManager.a11yFormulaire.test.tsx
//
// [A11Y-DETTE-CIBLES-TACTILES] + [A11Y-DETTE-FOCUS-EDITION] — formulaire de dette.
//
// 1. Cibles tactiles : chaque champ et bouton du formulaire (ajout ET édition) porte `touch-target`
//    (44 px, WCAG 2.5.5). jsdom ne calcule pas la mise en page : on garde la CLASSE, dont la
//    définition (min 44x44) vit dans index.css et est vérifiée ci-dessous.
// 2. Focus : ouvrir l'édition déplace le focus sur le panneau. On teste `document.activeElement`,
//    pas la présence de l'appel `focus()` : sur un <div> sans tabIndex, focus() ne fait rien.
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DebtManager } from '../../components/DebtManager';
import type { Debt } from '../../types';

vi.mock('recharts', async () => {
    const R = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => R.createElement('div', null, children);
    return { ResponsiveContainer: P, AreaChart: P, ComposedChart: P, Area: () => null, Line: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null };
});

afterEach(cleanup);

const BAIL: Debt = {
    id: 'bail', name: 'Bail auto', category: 'Car', kind: 'auto-lease',
    balance: 30_000, interestRate: 0, minimumPayment: 650,
    startDate: '2026-01-01', termEndDate: '2030-01-01', paymentFrequency: 'weekly',
} as unknown as Debt;

/** Champs + boutons du formulaire ouvert (le curseur « paiement supplémentaire » est hors formulaire). */
const controles = (racine: HTMLElement): HTMLElement[] =>
    Array.from(racine.querySelectorAll<HTMLElement>('input:not([type="range"]), select'));

describe('[A11Y-DETTE-CIBLES-TACTILES]', () => {
    it('la classe touch-target garantit 44x44 (contrôle de la définition)', () => {
        const css = fs.readFileSync(path.resolve(__dirname, '../../index.css'), 'utf8');
        expect(css).toMatch(/@utility touch-target\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/);
    });

    it('édition : TOUS les champs et boutons du panneau portent touch-target', () => {
        render(<DebtManager debts={[BAIL]} setDebts={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
        const panneau = screen.getByRole('group', { name: /Modifier la dette Bail auto/ });
        const champs = controles(panneau);
        expect(champs.length).toBeGreaterThanOrEqual(6); // anti-vacuité : le formulaire est bien rempli
        for (const c of champs) expect(c.className, c.getAttribute('aria-label') ?? c.tagName).toContain('touch-target');
        for (const nom of ['Enregistrer', 'Annuler']) {
            expect(screen.getByRole('button', { name: nom }).className).toContain('touch-target');
        }
    });

    it('ajout : TOUS les champs du formulaire portent touch-target', () => {
        render(<DebtManager debts={[]} setDebts={vi.fn()} />);
        const ouvrir = screen.queryAllByRole('button').find(b => /ajouter|nouvelle/i.test(b.textContent ?? b.getAttribute('aria-label') ?? ''));
        expect(ouvrir, 'bouton d’ajout introuvable').toBeTruthy();
        fireEvent.click(ouvrir!);
        const nom = screen.getByLabelText('Nom de la dette');
        const champs = controles(nom.parentElement as HTMLElement);
        expect(champs.length).toBeGreaterThanOrEqual(6);
        for (const c of champs) expect(c.className, c.getAttribute('aria-label') ?? c.tagName).toContain('touch-target');
        expect(screen.getByRole('button', { name: 'Enregistrer' }).className).toContain('touch-target');
    });
});

describe('[A11Y-DETTE-FOCUS-EDITION]', () => {
    it('ouvrir « Modifier » déplace le focus sur le panneau d’édition', () => {
        render(<DebtManager debts={[BAIL]} setDebts={vi.fn()} />);
        const modifier = screen.getByRole('button', { name: 'Modifier' });
        modifier.focus();
        expect(document.activeElement).toBe(modifier);
        fireEvent.click(modifier);
        const panneau = screen.getByRole('group', { name: /Modifier la dette Bail auto/ });
        expect(document.activeElement).toBe(panneau);
        // Le conteneur est focalisable par programme SANS entrer dans l'ordre de tabulation.
        expect(panneau.getAttribute('tabindex')).toBe('-1');
    });

    it('la phrase de statut du solde N’EST PAS une région live (elle ne réagit à aucune saisie)', () => {
        render(<DebtManager debts={[BAIL]} setDebts={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
        const phrase = screen.getByText(/jamais daté/i);
        expect(phrase.closest('[aria-live], [role="status"], [role="alert"]')).toBeNull();
    });
});
