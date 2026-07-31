/**
 * @vitest-environment jsdom
 *
 * [DASH-NETWORTH-CANONICAL] Le KPI « patrimoine global » de l'Accueil = le PRÉSENT par la source
 * unique (`computePresentNetWorth` + équité immo), plus JAMAIS le dernier point de l'historique.
 *
 * Pourquoi (diagnostic financial-integrity 2026-07-30, demande Marc « l'accueil fait aucun sens » /
 * « je veux source unique ») : l'ancien KPI lisait `latestTotals.Total`, dernier point d'un
 * historique (a) FIGÉ au dernier close, (b) au cash borné aux transactions ≤ dernière date ET
 * gated par accountName, (c) incohérent avec toutes les autres surfaces (PDF, IA, Investissements)
 * qui routent par computePresentNetWorth.
 *
 * Harnais : usePortfolioHistory MOCKÉ pour injecter un historique PÉRIMÉ (total figé à 500 $) —
 * c'est le cas discriminant que Dashboard.test.tsx (historique vide → repli) ne peut pas voir.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { Dashboard } from '../../components/Dashboard';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { Asset, BudgetConfig, RetirementGoal, Transaction, User } from '../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'fr' } }),
}));
vi.mock('recharts', async () => {
    const React = await import('react');
    return {
        AreaChart: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
        Area: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null,
        Tooltip: () => null, Legend: () => null, Brush: () => null,
        ResponsiveContainer: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
    };
});
// Historique injecté : totaux de COURBE (~500 $) sans rapport avec le présent (~140 k$) — l'ancien
// KPI affichait la courbe ; le nouveau doit afficher le présent. Deux points récents pour que la
// « Variation (1M) » soit calculable (fenêtre de dates).
// ⚠️ Identité STABLE (constante hoistée) : un mock qui fabrique un NOUVEAU tableau à chaque appel
// relance `useEffect([portfolioHistory])` → setMarketData → re-render → boucle infinie qui PEND le
// test (leçon CHAT-PAGE-CONTEXT « dédupe par valeur, pas par référence » — vécue ici même).
const STALE_HISTORY = vi.hoisted(() => ({
    history: [
        { date: '2026-07-29', 'VFV.TO': 500, TOTAL: 500, 'TOTAL_NON-ENREG': 500 },
        { date: '2026-07-30', 'VFV.TO': 550, TOTAL: 550, 'TOTAL_NON-ENREG': 550 },
    ],
    noHistorySymbols: [] as string[], partialHistorySymbols: [] as string[], staleTailSymbols: [] as string[],
}));
vi.mock('../../hooks/usePortfolioHistory', () => ({
    usePortfolioHistory: () => STALE_HISTORY,
}));

const goal: RetirementGoal = { targetAge: 60, targetMonthlyIncome: 5000, governmentPension: 1200 };
const config: BudgetConfig = {
    users: [{ name: 'Marc' } as unknown as User, { name: 'Anna' } as unknown as User],
    splitMode: '50/50',
};

const tx: Transaction = {
    id: -1, date: '2026-07-20', payee: 'Dépôt', amount: 0, category: 'Autre',
    accountName: 'Desjardins', status: 'processed', isTransfer: false, isDuplicate: false,
};

const asset: Asset = {
    symbol: 'VFV.TO', name: 'VFV', quantity: 100, currentPrice: 1000, buyPrice: 900,
    currency: 'CAD', accountType: 'NON-ENREG',
} as Asset;

beforeEach(() => {
    useFinanceStore.setState({ lastProjection: null, fintableBrokerBalances: undefined });
});

describe('Dashboard — [DASH-NETWORTH-CANONICAL] le KPI patrimoine dit le PRÉSENT', () => {
    it('avec un historique PÉRIMÉ, le KPI = source unique (présent), pas le dernier point du graphe', () => {
        // Présent : cash 1 000 + placements 100 000 − dette 400 + équité immo 40 000 = 140 600.
        // L'ancien code affichait 0 $ (MESURÉ par git-stash : le cash gated accountName du dernier
        // point d'historique rendait NaN, absorbé en 0 par `Number(...) || 0` — un faux zéro crédible).
        const { container } = render(
            <Dashboard
                transactions={[tx]}
                assets={[asset]}
                initialBalances={{ Compte: 1000 }}
                budgetItems={[]}
                realEstateGoals={[{ id: 'reg_1', name: 'Maison', currentValue: 100_000, mortgageBalance: 60_000 } as never]}
                travelGoals={[]}
                lifeEvents={[]}
                retirementGoal={goal}
                config={config}
                debts={[{ id: 'debt_1', name: 'Auto', balance: 400, interestRate: 6, minimumPayment: 50 } as never]}
            />,
        );
        // \s couvre les espaces insécables U+00A0/U+202F de formatCAD (leçon BUDGET-3-VUES).
        const text = (container.textContent ?? '').replace(/\s+/g, ' ');
        expect(text).toMatch(/140 600/); // ÉCHOUE sur l'ancien code (KPI = dernier point ≈ 500)
    });

    it('[finding financial-integrity #544] la Variation n\'est PAS figée à 0,00 % quand un compte vient des transactions', () => {
        // Mécanisme mesuré : un accountName ABSENT d'initialBalances (cas normal Fintable/CSV)
        // laissait rc[acc] undefined avant sa 1re transaction → point.Total = NaN → la Variation
        // lisait Number(NaN)||0 et restait à 0,00 % en permanence. Avec l'amorçage :
        // ligne 1 : Compte 1000 + Desjardins 0 + bucket 500 = 1500 ; ligne 2 : +200 et bucket 550
        // → 1750 → Variation (1750−1500)/1500 = +16,67 %.
        const { container } = render(
            <Dashboard
                transactions={[{
                    id: -2, date: '2026-07-30', payee: 'Dépôt', amount: 200, category: 'Autre',
                    accountName: 'Desjardins', status: 'processed', isTransfer: false, isDuplicate: false,
                }]}
                assets={[]}
                initialBalances={{ Compte: 1000 }}
                budgetItems={[]}
                realEstateGoals={[]}
                travelGoals={[]}
                lifeEvents={[]}
                retirementGoal={goal}
                config={config}
            />,
        );
        const text = (container.textContent ?? '').replace(/\s+/g, ' ');
        expect(text).toMatch(/16,67\s?%/);   // ÉCHOUE sur l'ancien code (0,00 % à la place)
        expect(text).not.toMatch(/0,00 %/);
    });
});
