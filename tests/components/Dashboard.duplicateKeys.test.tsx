import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { Dashboard } from '../../components/Dashboard';
import type { Asset, RegisteredAccountType, RetirementGoal, BudgetConfig, User } from '../../types';
import type { MarketDataPoint } from '../../services/finance';

// Régression — warning React « Encountered two children with the same key,
// CELI / REER » au chargement du Dashboard (onglet Accueil), reproduit sous le
// persona « Diane & Robert » (services/testPersonas/preRetraiteRiche.ts).
//
// Cause racine : un compte cash peut porter le MÊME nom qu'une catégorie
// d'investissement hardcodée. Le persona a `initialBalances: { CELI: 0, REER: 0,
// LIQUIDITE: 45000, ... }`, donc `cashAccountsList` contient déjà 'CELI'/'REER',
// puis Dashboard.tsx fait `.concat(['Immobilier','CELI','REER',...])` → les clés
// 'CELI' et 'REER' apparaissent DEUX fois dans `accountKeys`. Ces doublons
// alimentent à la fois les chips de bascule (`.map(key => <button key={key}>`) et
// les séries recharts → warning de clé dupliquée + rendu non garanti.

// marketData synthétique AU CONTRAT PRODUCTEUR (panel 2026-07-22) : les piles CELI/REER du
// Dashboard lisent les buckets TOTAL_* ÉMIS (buildMarketData réel + generateTestMarketData les
// portent tous deux) — plus de recomposition locale depuis les colonnes par-symbole.
const marketData: MarketDataPoint[] = [
    { date: '2024-01-01', 'VFV.TO': 1000, 'VEQT.TO': 2000, TOTAL_CELI: 1000, TOTAL_REER: 2000, TOTAL: 3000 },
    { date: '2024-06-01', 'VFV.TO': 1100, 'VEQT.TO': 2200, TOTAL_CELI: 1100, TOTAL_REER: 2200, TOTAL: 3300 },
];

vi.mock('../../hooks/usePortfolioHistory', () => ({
    usePortfolioHistory: () => ({
        history: marketData, isLoading: false, error: null,
        excludedSymbols: [], partialHistorySymbols: [],
    }),
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'fr' } }),
}));

const asset = (symbol: string, accountType: RegisteredAccountType): Asset => ({
    symbol,
    quantity: 10,
    currency: 'CAD',
    currentPrice: 100,
    name: symbol,
    performance: 0,
    dateBought: '2020-01-01',
    accountType,
});

const defaultGoal: RetirementGoal = {
    targetAge: 60,
    targetMonthlyIncome: 5000,
    governmentPension: 1200,
};

const defaultConfig: BudgetConfig = {
    users: [
        { name: 'Diane', monthlyGross: 6500, rrspContribution: 0, fhsaContribution: 0, birthYear: 1968, canadaArrivalYear: 1990 } as unknown as User,
        { name: 'Robert', monthlyGross: 5500, rrspContribution: 0, fhsaContribution: 0, birthYear: 1966, canadaArrivalYear: 1990 } as unknown as User,
    ],
    splitMode: '50/50',
};

const props = {
    transactions: [],
    // Comptes cash CELI/REER, comme le persona « Diane & Robert ».
    initialBalances: { CELI: 0, REER: 0, LIQUIDITE: 45000 },
    assets: [asset('VFV.TO', 'CELI'), asset('VEQT.TO', 'REER')],
    budgetItems: [],
    realEstateGoals: [],
    travelGoals: [],
    lifeEvents: [],
    retirementGoal: defaultGoal,
    config: defaultConfig,
};

/** Boutons-chips de bascule d'un compte (title="Masquer X"/"Afficher X"). */
const accountChips = (container: HTMLElement, name: string) =>
    Array.from(container.querySelectorAll('button')).filter(b => {
        const tt = b.getAttribute('title') || '';
        return tt === `Masquer ${name}` || tt === `Afficher ${name}`;
    });

describe('Dashboard — clés uniques des comptes (régression warning CELI/REER)', () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        localStorage.clear();
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        errorSpy.mockRestore();
    });

    it('n\'émet aucun warning React « same key » quand des comptes cash CELI/REER coexistent avec les catégories d\'investissement', () => {
        render(<Dashboard {...props} />);

        const sameKeyWarning = errorSpy.mock.calls.find((call: unknown[]) =>
            call.some((arg: unknown) => typeof arg === 'string' && /same key/i.test(arg)),
        );

        expect(
            sameKeyWarning,
            `console.error a émis un warning de clé dupliquée : ${JSON.stringify(sameKeyWarning)}`,
        ).toBeUndefined();
    });

    it('ne duplique pas les chips de bascule CELI / REER (clés uniques)', () => {
        const { container } = render(<Dashboard {...props} />);

        // Sanity : les chips se rendent bien (marketData non-vide → accountKeys peuplé).
        expect(accountChips(container, 'LIQUIDITE')).toHaveLength(1);
        // Le cœur du bug : un seul chip par compte malgré la collision de noms.
        expect(accountChips(container, 'CELI')).toHaveLength(1);
        expect(accountChips(container, 'REER')).toHaveLength(1);
    });
});
