// [A11Y-DELETE-SPAN-NO-KEYBOARD] Le « Supprimer » d'un onglet de propriété, atteignable au clavier.
//
// ⚠️ Le défaut : `<span role="button">` sans `tabIndex` ni `onKeyDown`, IMBRIQUÉ dans le `<button>`
// d'onglet. Deux problèmes d'un coup — inatteignable au clavier (WCAG 2.1.1), et un contrôle
// interactif descendant d'un bouton, ce que la spec interdit.
//
// ⚠️ Et le correctif ÉVIDENT était faux : ajouter `tabIndex` + `onKeyDown` au span aurait laissé
// l'imbrication en place, et Entrée/Espace auraient déclenché les DEUX actions (sélectionner
// l'onglet ET supprimer le bien). C'est pour ça que le test ci-dessous vérifie la STRUCTURE et pas
// seulement l'atteignabilité : les deux assertions tombent pour des raisons différentes.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RealEstate } from '../../components/RealEstate';
import type { RealEstateGoal } from '../../types';

vi.mock('recharts', async () => {
    const React = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: P, BarChart: P, ComposedChart: P, PieChart: P, LineChart: P, AreaChart: P,
        Bar: () => null, Area: () => null, Line: () => null, Pie: () => null, Cell: () => null,
        Legend: () => null, ReferenceLine: () => null,
        XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
    };
});

const bien = (id: string, name: string): RealEstateGoal => ({
    id, name,
    isActive: true,
    purchaseDate: '2019-06-01',
    price: 400_000,
    downPayment: 80_000,
    mortgageRate: 4,
    amortization: 25,
    totalClosingCosts: 0,
    monthlyPayment: 0,
    unrecoverableMonthly: 0,
    isPrimaryResidence: true,
});

/** Deux biens : c'est la condition d'affichage du contrôle (`allGoals.length > 1`). */
const monter = () => render(
    <RealEstate availableCash={50_000} goals={[bien('a', 'Maison A'), bien('b', 'Chalet B')]} setGoals={vi.fn()} />,
);

describe('[A11Y-DELETE-SPAN-NO-KEYBOARD] onglets de propriété', () => {
    it('le contrôle de suppression est un BOUTON, donc focusable au clavier', () => {
        monter();
        const supprimer = screen.getByRole('button', { name: 'Supprimer Maison A' });
        expect(supprimer.tagName).toBe('BUTTON');

        // Anti-vacuité du `getByRole` : sur le code d'avant, `role="button"` sur un `<span>` le
        // rendait aussi trouvable par ce sélecteur. C'est `tagName` qui discrimine — un span n'entre
        // pas dans l'ordre de tabulation sans `tabIndex`, un bouton natif si.
        supprimer.focus();
        expect(document.activeElement).toBe(supprimer);
    });

    it('il n\'est PAS un descendant du bouton d\'onglet — deux commandes, deux boutons', () => {
        monter();
        const supprimer = screen.getByRole('button', { name: 'Supprimer Maison A' });
        // ⚠️ Le nom de l'onglet et celui du bouton de suppression se CHEVAUCHENT (« Maison A » est
        // contenu dans « Supprimer Maison A ») : un `/Maison A/` en trouve deux. On exclut donc
        // explicitement le second, sinon le test échoue sur son propre sélecteur.
        const onglet = screen.getAllByRole('button', { name: /Maison A/ })
            .find((b) => !/Supprimer/.test(b.getAttribute('aria-label') ?? ''))!;
        expect(onglet).toBeDefined();

        // Discriminant structurel : sur le code d'avant, `onglet.contains(supprimer)` était VRAI.
        expect(onglet).not.toBe(supprimer);
        expect(onglet.contains(supprimer)).toBe(false);
        expect(supprimer.closest('button')).toBe(supprimer);
    });

    // ⚠️ NON DISCRIMINANT sur ce commit, et le dire évite de le compter comme une preuve de plus :
    // `fireEvent.click` déclenche aussi le `onClick` d'un `<span>`, donc ce test passait DÉJÀ avant
    // le correctif (vérifié). Ce qui discrimine l'atteignabilité clavier, c'est le `focus()` du
    // premier test — un span sans `tabIndex` ne prend pas le focus. Celui-ci reste comme
    // non-régression fonctionnelle : le contrôle sorti du bouton doit toujours faire son travail.
    it('l\'activer ouvre la confirmation — non-régression du geste', () => {
        monter();
        const supprimer = screen.getByRole('button', { name: 'Supprimer Chalet B' });
        supprimer.focus();
        // `click` est ce que produisent Entrée et Espace sur un `<button>` natif — c'est justement
        // ce qu'un `<span>` sans `onKeyDown` ne faisait pas.
        fireEvent.click(supprimer);

        expect(screen.getByText('Supprimer ce scénario immobilier définitivement ?')).toBeTruthy();
    });
});
