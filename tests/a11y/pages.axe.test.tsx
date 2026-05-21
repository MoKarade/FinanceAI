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
//   - Dashboard avec empty state (rend EmptyDataPrompt)
//   - TaxBracketViz (display)
//   - PageHeader / EmptyState / Modal (déjà via primitives, redondant)

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import type { AppState, BudgetConfig } from '../../types';

// Mocks globaux : i18n et services réseau
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (k: string) => k,
        i18n: { language: 'fr', changeLanguage: () => Promise.resolve() },
    }),
}));
vi.mock('../../services/eraContext', () => ({
    fetchTransactions: vi.fn().mockResolvedValue([]),
    fetchEraContextTransactions: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../services/marketData', () => ({
    configureMarketDataProvider: vi.fn(),
    getQuote: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../services/finance', () => ({
    fetchAssetHistory: vi.fn().mockResolvedValue([]),
    fetchFxRates: vi.fn().mockResolvedValue({ USD: 1.35, EUR: 1.45, CAD: 1 }),
    fetchPortfolioHistory: vi.fn().mockResolvedValue([]),
}));

// Helper : axe ne tolère pas serious/critical
async function expectNoSeriousViolations(container: HTMLElement) {
    const results = await axe(container);
    const serious = (results.violations || []).filter(
        (v: any) => v.impact === 'serious' || v.impact === 'critical'
    );
    if (serious.length > 0) {
        // eslint-disable-next-line no-console
        console.error('Violations a11y sérieuses :', JSON.stringify(serious.map((v: any) => ({
            id: v.id,
            description: v.description,
            nodes: v.nodes.map((n: any) => n.html).slice(0, 3),
        })), null, 2));
    }
    expect(serious).toHaveLength(0);
}

// État minimal pour les pages qui consomment AppState
const emptyConfig: BudgetConfig = {
    users: [
        { name: '', grossSalary: 0, netSalary: 0, color: '#10b981' },
        { name: '', grossSalary: 0, netSalary: 0, color: '#3b82f6' },
    ] as any,
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
    apiKeys: { eraContext: '', anthropic: '', finnhub: '' },
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

    it('Dashboard (empty state) — aucune violation serious/critical', async () => {
        const { Dashboard } = await import('../../components/Dashboard');
        const { container } = render(
            <Dashboard
                transactions={[]}
                assets={[]}
                initialBalances={{}}
                budgetItems={[]}
                realEstateGoals={[]}
                childGoals={[]}
                travelGoals={[]}
                lifeEvents={[]}
                retirementGoal={emptyState.retirementGoal}
                debts={[]}
                config={emptyConfig}
                calculatedMonthlySavings={0}
                isPrivacyMode={false}
            />
        );
        await expectNoSeriousViolations(container);
    });
});
