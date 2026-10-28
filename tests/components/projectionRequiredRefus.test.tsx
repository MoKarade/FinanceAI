// [ENG-INFINITY-NON-GARDE-A-LA-FRONTIERE] L'empty state partagé dit POURQUOI, pas « ouvre Future ».
//
// ⚠️ Pourquoi ce test compte. `ProjectionRequired` est monté sur toutes les surfaces qui dépendent
// de la projection ; c'est donc lui qui décide de ce que Marc lit quand rien ne s'affiche. Sur une
// entrée illisible, son message habituel — « ouvrez Future pour calculer » — envoie cliquer en
// boucle sur un bouton qui ne répare rien. Le motif doit remplacer l'invitation, pas s'ajouter.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { ProjectionRequired } from '../../components/ui/ProjectionRequired';
import { useFinanceStore } from '../../store/useFinanceStore';

describe('[ENG-INFINITY-NON-GARDE-A-LA-FRONTIERE] ProjectionRequired', () => {
    beforeEach(() => { act(() => { useFinanceStore.setState({ projectionRefus: null }); }); });
    afterEach(() => cleanup());

    it('affiche l\'invitation habituelle quand il n\'y a rien à refuser', () => {
        render(<ProjectionRequired feature="Le capital à la retraite" />);
        expect(screen.getByText(/Projection nécessaire/)).toBeTruthy();
        expect(screen.getByRole('button', { name: /Future/ })).toBeTruthy();
    });

    it('remplace l\'invitation par le MOTIF quand une entrée est illisible', () => {
        act(() => { useFinanceStore.setState({ projectionRefus: 'Projection impossible : le salaire net de Alex est illisible. Corrige la valeur pour relancer le calcul.' }); });
        render(<ProjectionRequired feature="Le capital à la retraite" />);
        expect(screen.getByText(/le salaire net de Alex est illisible/)).toBeTruthy();
        // ⚠️ L'assertion qui porte le sens : le bouton « Ouvrir Future » ne doit PLUS être là. Sans
        // elle, ajouter le motif SOUS l'invitation passerait — or c'est précisément le piège.
        expect(screen.queryByRole('button', { name: /Future/ })).toBeNull();
        expect(screen.queryByText(/Projection nécessaire/)).toBeNull();
    });

    it('porte le motif aussi en variante inline', () => {
        act(() => { useFinanceStore.setState({ projectionRefus: 'Projection impossible : le solde de départ est illisible.' }); });
        render(<ProjectionRequired variant="inline" />);
        expect(screen.getByText(/le solde de départ est illisible/)).toBeTruthy();
        expect(screen.queryByRole('button')).toBeNull();
    });
});
