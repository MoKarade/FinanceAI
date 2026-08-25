/**
 * [ENG-LIFEEVENT-VENTE-SUBSTRING] Vendre un bien est une INTENTION, pas un mot dans un champ libre.
 *
 * Le champ typé `eventKind` existait déjà et le moteur le consulte EN PREMIER — trois tests le
 * verrouillent dans `tests/services/monthlyEvents.test.ts`. Mais **rien ne l'écrivait** : mesuré,
 * `'VENTE_IMMO'` n'avait AUCUN producteur dans tout le dépôt, et le formulaire portait la même
 * heuristique de sous-chaîne que le moteur. Le contrat était testé, l'appelant n'existait pas
 * (`TEST-AU-CONTRAT-NE-VOIT-PAS-L-APPELANT`).
 *
 * Ces tests visent donc ce que le formulaire ÉCRIT — la seule chose qui manquait.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { LifeEvents } from '../../components/LifeEvents';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { LifeEvent } from '../../types';

vi.mock('recharts', async () => {
    const React = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: P, PieChart: P, Pie: () => null, Cell: () => null,
        Legend: () => null, Tooltip: () => null,
    };
});

/** Deux biens ACTIFS : la case doit apparaître, et le sélecteur de bien avec (seuil ≥ 2). */
const BIENS = [
    { id: 're1', name: 'Condo', isActive: true },
    { id: 're2', name: 'Chalet', isActive: true },
];

function monter() {
    const ecrits: LifeEvent[][] = [];
    render(
        <LifeEvents
            events={[]}
            setEvents={(e) => { ecrits.push(e); }}
            travelGoals={[]}
            setTravelGoals={() => {}}
            netWorth={500_000}
            returnRate={6}
        />,
    );
    return ecrits;
}

/** Ouvre le formulaire, puis bascule sur l'onglet « Aléas & Projets » (il s'ouvre sur Voyage). */
function ouvrirFormulaireEvenement() {
    fireEvent.click(screen.getAllByRole('button', { name: /Ajouter un Événement/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /Aléas & Projets/i }));
}

describe('[ENG-LIFEEVENT-VENTE-SUBSTRING] le formulaire écrit une INTENTION, pas un mot', () => {
    beforeEach(() => {
        act(() => { useFinanceStore.setState({ realEstateGoals: BIENS as never }); });
    });
    afterEach(() => cleanup());

    it('un nom qui contient « vente », case DÉCOCHÉE → eventKind NONE (aucun bien vendu)', () => {
        const ecrits = monter();
        ouvrirFormulaireEvenement();
        const bascule = screen.getByLabelText(/vente d'un bien immobilier/i);
        expect((bascule as HTMLInputElement).checked).toBe(false);

        fireEvent.change(screen.getByLabelText(/^Nom$/i), { target: { value: "Vente d'auto" } });
        fireEvent.change(screen.getByLabelText(/^Date$/i), { target: { value: '2030-05-01' } });
        fireEvent.click(screen.getByRole('button', { name: /^Ajouter$/i }));

        expect(ecrits.length).toBe(1);
        // C'est LE défaut que ce lot ferme : avant, ce nom revendait la MAISON.
        expect(ecrits[0][0].eventKind).toBe('NONE');
        expect(ecrits[0][0].name).toBe("Vente d'auto");
    });

    it('case COCHÉE avec un nom neutre → eventKind VENTE_IMMO (le nom ne décide plus)', () => {
        const ecrits = monter();
        ouvrirFormulaireEvenement();
        fireEvent.change(screen.getByLabelText(/^Nom$/i), { target: { value: 'Je me départis du condo' } });
        fireEvent.change(screen.getByLabelText(/^Date$/i), { target: { value: '2030-05-01' } });
        fireEvent.click(screen.getByLabelText(/vente d'un bien immobilier/i));
        fireEvent.click(screen.getByRole('button', { name: /^Ajouter$/i }));

        expect(ecrits.length).toBe(1);
        expect(ecrits[0][0].eventKind).toBe('VENTE_IMMO');
    });

    it('le sélecteur de bien suit la CASE, plus le nom', () => {
        monter();
        ouvrirFormulaireEvenement();
        // Anti-vacuité : avec un nom qui contient « vente », l'ANCIEN déclencheur est réuni —
        // si le sélecteur apparaissait quand même, c'est qu'il écoute encore le nom.
        fireEvent.change(screen.getByLabelText(/^Nom$/i), { target: { value: 'Vente maison' } });
        expect(screen.queryByLabelText(/Bien à vendre/i)).toBeNull();

        fireEvent.click(screen.getByLabelText(/vente d'un bien immobilier/i));
        expect(screen.getByLabelText(/Bien à vendre/i)).toBeInTheDocument();
    });

    it('la RÉSERVE est dite : nom « vente » + case décochée → avertissement visible', () => {
        monter();
        ouvrirFormulaireEvenement();
        // Sens INVERSE d'abord : sans le mot, aucune alarme (une alarme permanente s'ignore).
        fireEvent.change(screen.getByLabelText(/^Nom$/i), { target: { value: 'Rénovation cuisine' } });
        expect(screen.queryByText(/aucun bien ne sera vendu/i)).toBeNull();

        fireEvent.change(screen.getByLabelText(/^Nom$/i), { target: { value: 'Vente du chalet' } });
        expect(screen.getByText(/aucun bien ne sera vendu/i)).toBeInTheDocument();

        // Et l'avertissement DISPARAÎT dès que l'intention est déclarée.
        fireEvent.click(screen.getByLabelText(/vente d'un bien immobilier/i));
        expect(screen.queryByText(/aucun bien ne sera vendu/i)).toBeNull();
    });
});
