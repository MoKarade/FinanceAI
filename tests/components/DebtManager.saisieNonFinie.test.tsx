// tests/components/DebtManager.saisieNonFinie.test.tsx
//
// [DEBT-BALANCE-NAN-SILENCIEUX] (audit 2026-09-07) Un champ numérique VIDÉ (`parseFloat('')` = NaN)
// s'enregistrait à l'édition — le seul refus était l'origine incohérente, qui rend `null` sur un
// non-fini — et à l'ajout, seul le solde était refusé (`balance > 0`), pas le taux ni le minimum.
// Mesuré avant le correctif : un taux `NaN` affichait « Liberté dans 0,1 ans » (1,3 ans pour la
// même dette à 20 %), parce que `NaN > 0` est faux et la simulation s'arrêtait au premier mois.
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DebtManager } from '../../components/DebtManager';
import { refusChampNonFini } from '../../components/debt/DebtKindFields';
import type { Debt } from '../../types';

vi.mock('recharts', async () => {
    const R = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => R.createElement('div', null, children);
    return { ResponsiveContainer: P, AreaChart: P, Area: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null };
});

const dette = (over: Partial<Debt> = {}): Debt =>
    ({ id: 'd1', name: 'Carte', balance: 5_000, interestRate: 20, minimumPayment: 200, category: 'CreditCard', ...over } as unknown as Debt);

afterEach(cleanup);

describe('[DEBT-BALANCE-NAN-SILENCIEUX] le module pur', () => {
    it('refuse chaque champ non fini en le NOMMANT, accepte les finis et les absents', () => {
        expect(refusChampNonFini({ balance: NaN })).toMatch(/le solde/);
        expect(refusChampNonFini({ interestRate: NaN })).toMatch(/le taux/);
        expect(refusChampNonFini({ minimumPayment: Infinity })).toMatch(/le paiement minimum/);
        expect(refusChampNonFini({ balance: 0, interestRate: 0, minimumPayment: 0 })).toBeNull();
        expect(refusChampNonFini({})).toBeNull();
    });
});

describe('[DEBT-BALANCE-NAN-SILENCIEUX] à l’ÉDITION, un solde vidé ne s’enregistre pas', () => {
    it('vider le solde puis Enregistrer : refus annoncé, setDebts jamais appelé', () => {
        const setDebts = vi.fn();
        render(<DebtManager debts={[dette()]} setDebts={setDebts} />);
        fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
        const solde = screen.getByLabelText('Solde de la dette (dollars)') as HTMLInputElement;
        fireEvent.change(solde, { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        expect(setDebts).not.toHaveBeenCalled();
        expect(screen.getAllByRole('status').some(el => /le solde doit être un nombre/.test(el.textContent ?? ''))).toBe(true);
    });

    it('contrôle — un solde corrigé à 4 000 s’enregistre (le refus ne bloque pas une saisie saine)', () => {
        const setDebts = vi.fn();
        render(<DebtManager debts={[dette()]} setDebts={setDebts} />);
        fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
        fireEvent.change(screen.getByLabelText('Solde de la dette (dollars)'), { target: { value: '4000' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        expect(setDebts).toHaveBeenCalledTimes(1);
        expect((setDebts.mock.calls[0][0] as Debt[])[0].balance).toBe(4_000);
    });
});

describe('[DEBT-BALANCE-NAN-SILENCIEUX] le refus est un ÉTAT qui se remet à zéro au changement de formulaire (revue du lot 213)', () => {
    it('un refus à l’ajout ne s’affiche PAS sur une dette saine ouverte ensuite en édition', () => {
        render(<DebtManager debts={[dette()]} setDebts={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: '+ Ajouter' }));
        fireEvent.change(screen.getByLabelText('Nom de la dette'), { target: { value: 'Auto' } });
        // Saisir PUIS vider : un champ déjà vide ne déclenche aucun changement (0 reste 0, pas NaN).
        fireEvent.change(screen.getAllByLabelText('Solde de la dette (dollars)')[0], { target: { value: '5000' } });
        fireEvent.change(screen.getAllByLabelText('Solde de la dette (dollars)')[0], { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        expect(screen.getAllByRole('status').some(el => /le solde doit être un nombre/.test(el.textContent ?? ''))).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
        expect(screen.getAllByRole('status').some(el => /doit être un nombre/.test(el.textContent ?? ''))).toBe(false);
    });
});

describe('[DEBT-BALANCE-NAN-SILENCIEUX] à l’AJOUT, un taux vidé est refusé (le solde l’était déjà)', () => {
    it('nom + solde valides, taux vidé → refus nommé, rien d’ajouté', () => {
        const setDebts = vi.fn();
        render(<DebtManager debts={[]} setDebts={setDebts} />);
        fireEvent.click(screen.getByRole('button', { name: '+ Ajouter' }));
        fireEvent.change(screen.getByLabelText('Nom de la dette'), { target: { value: 'Auto' } });
        fireEvent.change(screen.getByLabelText('Solde de la dette (dollars)'), { target: { value: '12000' } });
        fireEvent.change(screen.getByLabelText("Taux d'intérêt (pourcentage)"), { target: { value: '7' } });
        fireEvent.change(screen.getByLabelText("Taux d'intérêt (pourcentage)"), { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        expect(setDebts).not.toHaveBeenCalled();
        expect(screen.getAllByRole('status').some(el => /le taux doit être un nombre/.test(el.textContent ?? ''))).toBe(true);
    });
});

describe('[DEBT-BALANCE-NAN-SILENCIEUX] la simulation dit « — » quand une dette persistée n’est pas simulable', () => {
    it('taux NaN → « — », pas « 0,1 ans »', () => {
        render(<DebtManager debts={[dette({ interestRate: NaN })]} setDebts={vi.fn()} />);
        const bloc = screen.getByText('Liberté dans').parentElement!;
        expect(bloc.textContent).toContain('—');
        expect(bloc.textContent).not.toMatch(/\d ans/);
    });

    it('sans aucune dette : « — », pas « 0.0 ans » (rien à simuler n’est pas une durée)', () => {
        render(<DebtManager debts={[]} setDebts={vi.fn()} />);
        const bloc = screen.getByText('Liberté dans').parentElement!;
        expect(bloc.textContent).toContain('—');
        expect(bloc.textContent).not.toMatch(/\d ans/);
    });

    it('contrôle — dette saine : une durée en années est affichée', () => {
        render(<DebtManager debts={[dette()]} setDebts={vi.fn()} />);
        expect(screen.getByText('Liberté dans').parentElement!.textContent).toMatch(/\d\.\d ans/);
    });
});
