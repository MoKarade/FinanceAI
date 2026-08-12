// P2.1 — axe a11y smoke tests sur pages complètes (composants top-level).
//
// Pattern : monter chaque page avec props minimales/empty state, lancer axe,
// vérifier 0 violation serious/critical. On accepte les violations
// "moderate" et "minor" — celles-ci sont best-practice et non bloquantes WCAG.
//
// Limitations :
//   * Charts (Recharts) émettent des warnings jsdom (HTMLCanvasElement
//     non implémenté) — pas de violation a11y, juste du bruit console.
//   * Pages avec heavy lazy-loading (FutureProjection, Investments) ou
//     services réseau bloquants ne sont pas testées ici — leur shell
//     est OK via les primitives axe (Card, Button, KPIStat).
//
// Couverture P2.1 :
//   - Onboarding (entrée, props-driven)
//   - SystemView (admin, props-driven)
//   - FutureHistorySection avec empty state (ex-Accueil, [REFONTE-NAV-L2b])
//   - TaxBracketViz (display)
//   - PageHeader / EmptyState / Modal (déjà via primitives, redondant)

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import type * as AxeCore from 'axe-core';
import type { AppState, BudgetConfig } from '../../types';

// Mocks globaux : i18n et services réseau
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (k: string) => k,
        i18n: { language: 'fr', changeLanguage: () => Promise.resolve() },
    }),
}));
vi.mock('../../services/marketData', () => ({
    configureMarketDataProvider: vi.fn(),
    getQuote: vi.fn().mockResolvedValue(null),
}));
// [panel 2026-07-22] fetchAssetHistory/fetchPortfolioHistory retirés du mock : ces stubs n'existent
// plus dans services/finance (PORTFOLIO-HISTORY). Seul fetchFxRates (Banque du Canada) reste réel.
vi.mock('../../services/finance', () => ({
    fetchFxRates: vi.fn().mockResolvedValue({ USD: 1.35, EUR: 1.45, CAD: 1 }),
}));

// Helper : axe ne tolère pas serious/critical
async function expectNoSeriousViolations(container: HTMLElement) {
    const results = await axe(container);
    const serious = (results.violations || []).filter(
        (v: AxeCore.Result) => v.impact === 'serious' || v.impact === 'critical'
    );
    if (serious.length > 0) {
        console.error('Violations a11y sérieuses :', JSON.stringify(serious.map((v: AxeCore.Result) => ({
            id: v.id,
            description: v.description,
            nodes: v.nodes.map((n: AxeCore.NodeResult) => n.html).slice(0, 3),
        })), null, 2));
    }
    expect(serious).toHaveLength(0);
}

// État minimal pour les pages qui consomment AppState
const emptyConfig: BudgetConfig = {
    users: [
        { name: '', grossSalary: 0, netSalary: 0, color: '#10b981' },
        { name: '', grossSalary: 0, netSalary: 0, color: '#3b82f6' },
    ],
    splitMode: '50/50',
};

const emptyState: AppState = {
    transactions: [],
    assets: [],
    investmentTransactions: [],
    investmentAccounts: [],
    budgetItems: [],
    config: emptyConfig,
    projection: { years: 30, returnRate: 0.06, inflationRate: 0.02, savingsMode: 'manual', manualContribution: 0, usePortfolioRate: false },
    realEstateGoals: [],
    childGoals: [],
    savingsGoals: [],
    debts: [],
    travelGoals: [],
    lifeEvents: [],
    retirementGoal: { targetAge: 65, targetMonthlyIncome: 4000, governmentPension: 1200 },
    financialGoals: [],
    initialBalances: {},
    apiKeys: { anthropic: '', finnhub: '' },
    fxRates: { USD: 1.35, EUR: 1.45, CAD: 1 },
    lastUpdate: Date.now(),
    categorizationRules: [],
    aiConversation: [],
};

describe('a11y pages (vitest-axe)', () => {
    it('Onboarding — aucune violation serious/critical', async () => {
        const { Onboarding } = await import('../../components/Onboarding');
        const { container } = render(<Onboarding onComplete={() => {}} />);
        await expectNoSeriousViolations(container);
    });

    it('SystemView — aucune violation serious/critical', async () => {
        const { SystemView } = await import('../../components/SystemView');
        const { container } = render(<SystemView state={emptyState} />);
        await expectNoSeriousViolations(container);
    });

    it('TaxBracketViz — aucune violation serious/critical', async () => {
        const { TaxBracketViz } = await import('../../components/TaxBracketViz');
        const { container } = render(
            <TaxBracketViz annualGrossIncome={75000} label="Test" />
        );
        await expectNoSeriousViolations(container);
    });

    // [REFONTE-NAV-L2b] Dashboard supprimé — remplacé par le sous-onglet « Historique » du Futur.
    // Même pattern : store vide → empty state honnête (« Aucun placement à tracer »).
    it('FutureHistorySection (empty state) — aucune violation serious/critical', async () => {
        const { useFinanceStore } = await import('../../store/useFinanceStore');
        useFinanceStore.setState({
            transactions: [], assets: [], initialBalances: {}, debts: [],
            realEstateGoals: [], isPrivacyMode: false, isTestMode: false,
        } as never);
        const { default: FutureHistorySection } = await import('../../components/future/FutureHistorySection');
        const { container } = render(<FutureHistorySection />);
        await expectNoSeriousViolations(container);
    });
});
