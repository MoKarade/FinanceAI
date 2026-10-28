// [DETTE-RE-SALE-PURGE] Décision de Marc (2026-07-31) : supprimer un bien SUPPRIME aussi les
// événements de VENTE qui le référencent (LifeEvent.propertyId), et la confirmation l'ANNONCE
// avant le geste. Sans la purge, la vente planifiée devenait un événement orphelin : le moteur la
// refuse déjà proprement (monthlyEvents.ts ne vend JAMAIS un autre bien que celui visé), mais
// l'utilisateur gardait un événement mort et un avertissement « vente ignorée » à chaque
// projection. Les faits défendus : (1) la confirmation NOMME le nombre de ventes liées ;
// (2) confirmer purge exactement les événements du bien supprimé — jamais ceux d'un autre bien ni
// les événements sans propertyId ; (3) sans vente liée, ni mention ni écriture d'événements.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RealEstateProjects } from '../../components/life/RealEstateProjects';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { RealEstateGoal, LifeEvent } from '../../types';

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

const goal = (overrides: Partial<RealEstateGoal>): RealEstateGoal => ({
    id: 'g', isActive: true, purchaseDate: '2099-06-01', price: 400_000, downPayment: 80_000,
    mortgageRate: 4, amortization: 25, totalClosingCosts: 0, monthlyPayment: 0,
    unrecoverableMonthly: 0, isPrimaryResidence: true, ...overrides,
});

// Dates FUTURES : aucun popup « est-ce acheté ? » ne vient s'intercaler devant la modale testée.
const bienA = goal({ id: 'gA', name: 'Duplex À Vendre 2099' });
const bienB = goal({ id: 'gB', name: 'Condo Témoin 2098', purchaseDate: '2098-01-01', isPrimaryResidence: false });

const vente = (id: string, propertyId: string): LifeEvent => ({
    id, type: 'expense', name: `Vente planifiée ${id}`, date: '2101-06-01',
    eventKind: 'VENTE_IMMO', propertyId,
} as unknown as LifeEvent);
const sansPropriete: LifeEvent = { id: 'ev-libre', type: 'expense', name: 'Voyage', date: '2101-01-01', impactAmount: 5000 } as unknown as LifeEvent;

const initial = useFinanceStore.getState();

beforeEach(() => {
    useFinanceStore.setState(initial, true);
    useFinanceStore.setState({
        lifeEvents: [vente('ev-A1', 'gA'), vente('ev-A2', 'gA'), vente('ev-B', 'gB'), sansPropriete],
    } as never);
});

function supprimer(nom: string) {
    fireEvent.click(screen.getByRole('button', { name: `Supprimer ${nom}` }));
}

describe('[DETTE-RE-SALE-PURGE] supprimer un bien purge ses ventes planifiées', () => {
    it('la confirmation ANNONCE le nombre de ventes liées avant le geste', () => {
        render(<RealEstateProjects availableCash={50_000} goals={[bienA, bienB]} setGoals={() => {}} />);
        supprimer('Duplex À Vendre 2099');
        const dialog = screen.getByRole('dialog');
        expect(dialog.textContent).toContain('2 événements de vente planifiés sur ce bien seront supprimés aussi');
    });

    it('confirmer purge EXACTEMENT les ventes du bien — le témoin et l\'événement libre survivent', () => {
        render(<RealEstateProjects availableCash={50_000} goals={[bienA, bienB]} setGoals={() => {}} />);
        supprimer('Duplex À Vendre 2099');
        fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
        const restants = (useFinanceStore.getState().lifeEvents ?? []).map(e => e.id).sort();
        expect(restants).toEqual(['ev-B', 'ev-libre']);
    });

    it('bien SANS vente liée : pas de mention, et les événements ne sont pas réécrits (contrôle négatif)', () => {
        render(<RealEstateProjects availableCash={50_000} goals={[bienA, bienB]} setGoals={() => {}} />);
        // gB a UNE vente liée (ev-B) au setup commun — mauvais témoin pour « sans vente ».
        // On pose d'abord un état SANS vente liée à gB, puis on ouvre la confirmation.
        supprimer('Condo Témoin 2098');
        fireEvent.click(screen.getByRole('button', { name: /Annuler|annuler/ }));
        useFinanceStore.setState({ lifeEvents: [vente('ev-A1', 'gA'), sansPropriete] } as never);
        supprimer('Condo Témoin 2098');
        const dialog2 = screen.getByRole('dialog');
        expect(dialog2.textContent).not.toContain('vente');
        const avant = useFinanceStore.getState().lifeEvents;
        fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
        // Référence d'objet INCHANGÉE : aucune écriture d'événements quand rien n'est à purger.
        expect(useFinanceStore.getState().lifeEvents).toBe(avant);
    });
});
