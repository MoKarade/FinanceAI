import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useFinanceStore } from '../../../store/useFinanceStore';
import { PageSetupGate } from '../../../components/setup/PageSetupGate';
import { Tab } from '../../../types';

const initial = useFinanceStore.getState();

const withGross = (gross: number) => ({
    config: {
        ...initial.config,
        users: [{ ...initial.config.users[0], grossSalary: gross }, initial.config.users[1]] as typeof initial.config.users,
    },
});

beforeEach(() => {
    useFinanceStore.setState(initial, true);
});

describe('PageSetupGate (pilote Impôts)', () => {
    it("affiche l'écran de setup et MASQUE le contenu quand le salaire manque", () => {
        useFinanceStore.setState(withGross(0));
        render(
            <PageSetupGate tab={Tab.TAX}>
                <div>CONTENU_IMPOTS</div>
            </PageSetupGate>,
        );
        // Explicite : page verrouillée + message « rien ne s'affiche ».
        expect(screen.getByText(/Page verrouillée/i)).toBeInTheDocument();
        expect(screen.getByText(/Rien ne s'affiche tant que/i)).toBeInTheDocument();
        expect(screen.getByText(/Salaire — utilisateur principal/i)).toBeInTheDocument();
        // Option « données de test » proposée.
        expect(screen.getByRole('button', { name: /données de test/i })).toBeInTheDocument();
        // Rien du contenu réel de la page ne doit s'afficher tant que c'est pas fait.
        expect(screen.queryByText('CONTENU_IMPOTS')).not.toBeInTheDocument();
    });

    it('affiche le contenu de la page une fois le salaire renseigné', () => {
        useFinanceStore.setState(withGross(5000));
        render(
            <PageSetupGate tab={Tab.TAX}>
                <div>CONTENU_IMPOTS</div>
            </PageSetupGate>,
        );
        expect(screen.getByText('CONTENU_IMPOTS')).toBeInTheDocument();
        expect(screen.queryByText(/Configuration requise/i)).not.toBeInTheDocument();
    });

    it('laisse passer une page sans prérequis déclarés (pas de gate)', () => {
        render(
            <PageSetupGate tab={Tab.DEBT}>
                <div>CONTENU_DETTES</div>
            </PageSetupGate>,
        );
        expect(screen.getByText('CONTENU_DETTES')).toBeInTheDocument();
    });
});
