// A11Y-SLIDERS — ProjectionControls : chaque slider de taux/% porte un nom accessible (aria-label).
// Les <label> ne sont pas associés (slider sibling hors <label>) → sans aria-label, un lecteur
// d'écran n'annonce que « curseur ». runMC=true ouvre la 2ᵉ CollapsibleSection (defaultOpen={runMC})
// pour que les sliders US / inflation-par-poste / soins LD soient rendus (rendu conditionnel).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProjectionControls } from '../../components/projection/ProjectionControls';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { ProjectionConfig, BudgetConfig, RealEstateGoal, User } from '../../types';

const proj = {
    years: 30, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
    usePortfolioRate: false, returnRates: { celi: 7, reer: 6.5, nonReg: 6.5, crypto: 10, cash: 3 },
    emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
    theoreticalIncome: 8000, theoreticalExpenses: 4000,
    usePerCategoryInflation: true, ltcEnabled: true,
    usEquityShareCeli: 0, usEquityDividendYield: 1.5,
} as unknown as ProjectionConfig;

const config: BudgetConfig = {
    users: [
        { name: 'Marc', grossSalary: 7000, netSalary: 5000, color: '#10b981', age: 35, birthYear: 1991 } as unknown as User,
        { name: 'Anna', grossSalary: 5500, netSalary: 4000, color: '#3b82f6', age: 33, birthYear: 1993 } as unknown as User,
    ],
    splitMode: '50/50',
};

const liveCSV = { CELI: 0, REER: 0, NON_ENREG: 0, CRYPTO: 0, REEE: 0, TOTAL: 0, historicalRate: 0 };

function renderControls() {
    return render(
        <ProjectionControls
            projection={proj}
            updateProj={vi.fn()}
            updateReturnRate={vi.fn()}
            runMC={true}
            setRunMC={vi.fn()}
            isComputing={false}
            fireNumber={0}
            liveCSVBalances={liveCSV}
            applyHistoricalRate={vi.fn()}
            realEstateGoals={[{ maxValue: 1000000 } as unknown as RealEstateGoal]}
            setRealEstateGoals={vi.fn()}
            config={config}
        />,
    );
}

describe('ProjectionControls — noms accessibles des sliders (A11Y-SLIDERS)', () => {
    beforeEach(() => {
        useFinanceStore.setState({ isPrivacyMode: false });
    });

    it('chaque slider (taux/% /coût ET monétaire) est trouvable par son nom accessible', () => {
        renderControls();
        for (const name of [
            // monétaires (nommés au lot #279 — on garde la régression sous test ici aussi)
            'Revenus (Net)', 'Dépenses',
            // taux / % / coût (ce lot)
            'Horizon (Années)', 'Inflation', 'Hausse Salaire (An)',
            'CELI (Tax Free)', 'Non-Enregistré / REER', 'Coussin de Sécurité',
            'Part actions US dans CELI (%)', 'Rendement dividende US (%)',
            'Coût mensuel soins ($/mois)',
        ]) {
            expect(screen.getByRole('slider', { name })).toBeInTheDocument();
        }
    });

    it('les sliders de la boucle inflation/poste portent un nom (ex. « Logement (30%) »)', () => {
        renderControls();
        expect(screen.getByRole('slider', { name: 'Logement (30%)' })).toBeInTheDocument();
        expect(screen.getByRole('slider', { name: 'Santé (5%)' })).toBeInTheDocument();
    });

    it('le slider monétaire « Valeur Max Maison » garde son nom (parité D6-SR-2)', () => {
        renderControls();
        expect(screen.getByRole('slider', { name: 'Valeur Max Maison' })).toBeInTheDocument();
    });
});
