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

    it("résout le chunk lazy PayslipUploadCard (Suspense → vraie carte, pas le fallback à vie)", async () => {
        // [PERF-SDK-BOOT-PRELOAD] La carte d'import de paie est désormais lazy (lazyWithRetry +
        // Suspense local). Preuve FONCTIONNELLE que le chunk se résout (un mauvais export/chemin
        // laisserait le fallback « Chargement… » à vie sans erreur de build) — finding code-reviewer #547.
        useFinanceStore.setState(withGross(0));
        render(
            <PageSetupGate tab={Tab.TAX}>
                <div>CONTENU_IMPOTS</div>
            </PageSetupGate>,
        );
        expect(await screen.findByText(/Upload relevé de salaire/i)).toBeInTheDocument();
        expect(screen.queryByText(/^Chargement…$/)).not.toBeInTheDocument();
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
        // Configuration n'est pas gatée (c'est là qu'on saisit les données).
        render(
            <PageSetupGate tab={Tab.SETTINGS}>
                <div>CONTENU_LIBRE</div>
            </PageSetupGate>,
        );
        expect(screen.getByText('CONTENU_LIBRE')).toBeInTheDocument();
    });
});

describe('PageSetupGate — déroulé (Retraite / Immo opt-out / Futur)', () => {
    it('Retraite : verrouillée tant que le profil retraite manque (même avec salaire)', () => {
        useFinanceStore.setState({
            ...withGross(5000),
            retirementGoal: { ...initial.retirementGoal, targetAge: 0, targetMonthlyIncome: 0 },
        });
        render(
            <PageSetupGate tab={Tab.RETIREMENT}>
                <div>CONTENU_RETRAITE</div>
            </PageSetupGate>,
        );
        expect(screen.getByText(/Page verrouillée/i)).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Profil retraite/i })).toBeInTheDocument();
        expect(screen.queryByText('CONTENU_RETRAITE')).not.toBeInTheDocument();
    });

    it('Immobilier : propose un opt-out, et l\'opt-out débloque la page', () => {
        useFinanceStore.setState({ realEstateGoals: [], setupOptOut: {} });
        const { rerender } = render(
            <PageSetupGate tab={Tab.REAL_ESTATE}>
                <div>CONTENU_IMMO</div>
            </PageSetupGate>,
        );
        // Verrouillée + bouton opt-out présent.
        expect(screen.queryByText('CONTENU_IMMO')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /pas de projet immobilier/i })).toBeInTheDocument();
        // Opt-out persistant → page débloquée.
        useFinanceStore.setState({ setupOptOut: { realEstate: true } });
        rerender(
            <PageSetupGate tab={Tab.REAL_ESTATE}>
                <div>CONTENU_IMMO</div>
            </PageSetupGate>,
        );
        expect(screen.getByText('CONTENU_IMMO')).toBeInTheDocument();
    });

    it('Futur : verrouillé liste ce qui manque (salaire + actifs + profil retraite)', () => {
        useFinanceStore.setState({
            ...withGross(0),
            assets: [],
            retirementGoal: { ...initial.retirementGoal, targetAge: 0, targetMonthlyIncome: 0 },
        });
        render(
            <PageSetupGate tab={Tab.FUTURE}>
                <div>CONTENU_FUTUR</div>
            </PageSetupGate>,
        );
        expect(screen.queryByText('CONTENU_FUTUR')).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Placements \/ actifs/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Profil retraite/i })).toBeInTheDocument();
    });
});
