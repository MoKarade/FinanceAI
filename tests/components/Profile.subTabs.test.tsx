/**
 * [PROFIL-SOUS-ONGLETS] L'onglet Profil passe de CINQ groupes empilés à QUATRE sous-onglets.
 *
 * Découpage choisi par Marc (`docs/adr/0012-quatre-decisions-de-marc-2026-08-17.md` 2026-08-17) : Identité · Revenus · Profils
 * enregistrés — plus un 4e (« Retraite & enfants ») que j'ai ajouté parce que ses trois bacs ne
 * couvraient pas ces deux groupes, et que les rétrograder sous « Revenus » aurait été faux.
 *
 * ⚠️ CE QUE CES TESTS PROTÈGENT VRAIMENT. Le risque d'un découpage n'est pas l'esthétique : c'est
 * qu'un groupe DISPARAISSE. Avant, tout était empilé — donc tout était visible, et rien ne pouvait
 * se perdre en silence. Maintenant, un groupe oublié dans le `switch` des onglets devient
 * INATTEIGNABLE sans qu'aucun typecheck ne bronche (`UX-UNREACHABLE-FEATURE`, la classe qui m'a
 * déjà coûté une livraison cette semaine). D'où la garde d'EXHAUSTIVITÉ ci-dessous : chaque
 * sous-composant d'origine doit apparaître dans exactement UN onglet, et l'union des onglets doit
 * couvrir les CINQ groupes d'avant.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { Profile } from '../../components/Profile';

// Chaque enfant est remplacé par un MARQUEUR distinct : le test porte sur le ROUTAGE (quel groupe
// est atteignable depuis quel onglet), pas sur le rendu interne de chaque carte — celui-ci a ses
// propres tests. `UserConfigFields` est décliné par `section` pour distinguer ses quatre usages.
vi.mock('../../components/settings/sections/UsersCard', () => ({
    UsersCard: () => React.createElement('div', null, 'MARQUEUR-identite'),
}));
vi.mock('../../components/profile/SavedProfilesCard', () => ({
    SavedProfilesCard: () => React.createElement('div', null, 'MARQUEUR-profils-enregistres'),
}));
vi.mock('../../components/settings/UserConfigFields', () => ({
    UserConfigFields: ({ section }: { section: string }) => React.createElement('div', null, `MARQUEUR-champs-${section}`),
    RepartitionField: () => React.createElement('div', null, 'MARQUEUR-repartition'),
}));
vi.mock('../../components/retirement/RetirementSettingsCard', () => ({
    RetirementSettingsCard: () => React.createElement('div', null, 'MARQUEUR-retraite-params'),
}));
vi.mock('../../components/retirement/RetirementIncomeCard', () => ({
    RetirementIncomeCard: () => React.createElement('div', null, 'MARQUEUR-retraite-revenu'),
}));

/** Les CINQ groupes de l'écran d'avant, exprimés en marqueurs. Cette liste est la SPÉCIFICATION :
 *  si un jour un groupe est retiré de l'écran, c'est ce tableau qu'il faut modifier — un geste
 *  explicite, contrairement à une disparition silencieuse. */
const TOUS_LES_GROUPES = [
    'MARQUEUR-identite',
    'MARQUEUR-champs-salary',
    'MARQUEUR-champs-fiscal',
    'MARQUEUR-repartition',
    'MARQUEUR-champs-detailed',
    'MARQUEUR-retraite-params',
    'MARQUEUR-retraite-revenu',
    'MARQUEUR-champs-children',
    'MARQUEUR-profils-enregistres',
] as const;

const ONGLETS = ['Identité', 'Revenus', 'Retraite & enfants', 'Profils enregistrés'] as const;

const marqueursVisibles = (): string[] =>
    TOUS_LES_GROUPES.filter((m) => screen.queryByText(m) !== null);

beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
});

describe('[PROFIL-SOUS-ONGLETS] la coquille', () => {
    it('rend les quatre sous-onglets, Identité sélectionné par défaut', () => {
        render(<Profile />);
        expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([...ONGLETS]);
        expect(screen.getByRole('tab', { name: 'Identité' }).getAttribute('aria-selected')).toBe('true');
    });

    it('garde UN SEUL h1 (l’en-tête de page), quel que soit l’onglet', async () => {
        const { container } = render(<Profile />);
        expect(container.querySelectorAll('h1').length).toBe(1);
        await userEvent.click(screen.getByRole('tab', { name: 'Revenus' }));
        expect(container.querySelectorAll('h1').length).toBe(1);
    });
});

describe('[PROFIL-SOUS-ONGLETS] exhaustivité : aucun groupe ne se perd', () => {
    // ⚠️ LE test de ce lot. Il échouerait si un groupe était oublié dans le découpage — le seul
    // défaut qu'un refactor de navigation peut livrer sans que rien ne rougisse ailleurs.
    it('l’union des quatre onglets couvre EXACTEMENT les cinq groupes d’avant', async () => {
        render(<Profile />);
        const vus = new Set<string>();
        for (const onglet of ONGLETS) {
            await userEvent.click(screen.getByRole('tab', { name: onglet }));
            marqueursVisibles().forEach((m) => vus.add(m));
        }
        // Ensembles comparés, PAS des cardinalités : deux erreurs qui se compensent (un groupe
        // perdu + un groupe dupliqué) garderaient un simple compte au vert.
        expect([...vus].sort()).toEqual([...TOUS_LES_GROUPES].sort());
    });

    it('chaque groupe vit dans UN SEUL onglet (pas de doublon d’affichage)', async () => {
        render(<Profile />);
        const compte = new Map<string, number>();
        for (const onglet of ONGLETS) {
            await userEvent.click(screen.getByRole('tab', { name: onglet }));
            for (const m of marqueursVisibles()) compte.set(m, (compte.get(m) ?? 0) + 1);
        }
        const dupliques = [...compte.entries()].filter(([, n]) => n > 1).map(([m]) => m);
        expect(dupliques, 'un groupe rendu dans deux onglets = deux sources pour la même donnée').toEqual([]);
    });
});

describe('[PROFIL-SOUS-ONGLETS] routage onglet → contenu', () => {
    it.each([
        ['Identité', ['MARQUEUR-identite']],
        ['Revenus', ['MARQUEUR-champs-salary', 'MARQUEUR-champs-fiscal', 'MARQUEUR-repartition', 'MARQUEUR-champs-detailed']],
        ['Retraite & enfants', ['MARQUEUR-retraite-params', 'MARQUEUR-retraite-revenu', 'MARQUEUR-champs-children']],
        ['Profils enregistrés', ['MARQUEUR-profils-enregistres']],
    ])('l’onglet « %s » rend exactement son contenu', async (onglet, attendus) => {
        render(<Profile />);
        await userEvent.click(screen.getByRole('tab', { name: onglet as string }));
        expect(marqueursVisibles().sort()).toEqual([...(attendus as string[])].sort());
    });

    // ⚠️ DISCRIMINANT de l'extraction. Les profils enregistrés vivaient DANS `UsersCard` (même
    // Card que l'identité). Si quelqu'un annule l'extraction en les y réintroduisant, ce test
    // tombe — alors qu'un simple « les 4 onglets existent » resterait vert.
    it('les profils enregistrés ne sont PAS dans l’onglet Identité', () => {
        render(<Profile />);
        expect(screen.queryByText('MARQUEUR-profils-enregistres')).toBeNull();
        expect(screen.getByText('MARQUEUR-identite')).toBeTruthy();
    });
});
