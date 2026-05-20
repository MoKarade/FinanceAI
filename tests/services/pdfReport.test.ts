/**
 * P1.5 — tests des builders purs de pdfReport.
 *
 * On ne teste pas le rendu jsPDF lui-même (lazy-loaded, DOM-dependant) ;
 * uniquement les fonctions de transformation AppState → ReportData payload.
 */
import { describe, it, expect } from 'vitest';
import {
    buildHoldingsRows,
    buildDebtsRows,
    buildGoalsRows,
    buildFiscalSummary,
} from '../../services/pdfReport';
import type { AppState, Asset, Debt, FinancialGoal, User } from '../../types';

const makeAsset = (over: Partial<Asset> = {}): Asset => ({
    symbol: 'VFV',
    quantity: 10,
    currency: 'CAD',
    currentPrice: 100,
    name: 'Vanguard S&P 500',
    performance: 0.08,
    dateBought: '2024-01-01',
    accountType: 'CELI',
    ...over,
});

const makeDebt = (over: Partial<Debt> = {}): Debt => ({
    id: 'd1',
    name: 'Carte Visa',
    balance: 5000,
    interestRate: 19.99,
    minimumPayment: 200,
    category: 'CreditCard',
    ...over,
});

const makeGoal = (over: Partial<FinancialGoal> = {}): FinancialGoal => ({
    id: 'g1',
    name: 'Coussin 6 mois',
    type: 'LIQUIDITY',
    targetAmount: 30000,
    deadline: '2027-12-31',
    manualCurrentAmount: 15000,
    ...over,
});

const makeUser = (over: Partial<User> = {}): User => ({
    name: 'Alice',
    grossSalary: 6000, // mensuel
    netSalary: 4200,
    color: '#10b981',
    ...over,
});

describe('buildHoldingsRows', () => {
    it('convertit assets en lignes avec valeur CAD', () => {
        const state = {
            assets: [
                makeAsset({ symbol: 'VFV', quantity: 10, currentPrice: 100, currency: 'CAD' }),
                makeAsset({ symbol: 'AAPL', quantity: 5, currentPrice: 200, currency: 'USD' }),
            ],
            fxRates: { USD: 1.35, EUR: 1.45, CAD: 1, lastFetched: 0 },
        } as Pick<AppState, 'assets' | 'fxRates'>;

        const rows = buildHoldingsRows(state);
        expect(rows).toHaveLength(2);
        // AAPL = 5 * 200 * 1.35 = 1350 → plus grand → en tête
        expect(rows[0].symbol).toBe('AAPL');
        expect(rows[0].valueCAD).toBeCloseTo(1350, 2);
        expect(rows[1].symbol).toBe('VFV');
        expect(rows[1].valueCAD).toBeCloseTo(1000, 2);
    });

    it('utilise fx=1 si devise inconnue dans fxRates', () => {
        const state = {
            assets: [makeAsset({ symbol: 'X', quantity: 1, currentPrice: 50, currency: 'EUR' })],
            fxRates: { USD: 1.35, EUR: 0, CAD: 1, lastFetched: 0 } as AppState['fxRates'],
        } as Pick<AppState, 'assets' | 'fxRates'>;
        const rows = buildHoldingsRows(state);
        expect(rows[0].valueCAD).toBe(50); // fallback 1
    });

    it('retourne [] sur assets vides', () => {
        const state = {
            assets: [],
            fxRates: { USD: 1.35, EUR: 1.45, CAD: 1, lastFetched: 0 },
        } as Pick<AppState, 'assets' | 'fxRates'>;
        expect(buildHoldingsRows(state)).toEqual([]);
    });
});

describe('buildDebtsRows', () => {
    it('convertit debts en lignes et estime mois restants', () => {
        const state = { debts: [makeDebt({ balance: 5000, minimumPayment: 200, interestRate: 19.99 })] };
        const rows = buildDebtsRows(state);
        expect(rows).toHaveLength(1);
        expect(rows[0].name).toBe('Carte Visa');
        expect(rows[0].balance).toBe(5000);
        // Avec 5k @ 20% / 200$/mois → autour de 31-32 mois
        expect(rows[0].monthsToZero).toBeGreaterThan(25);
        expect(rows[0].monthsToZero).toBeLessThan(40);
    });

    it('mois restants undefined si paiement insuffisant pour couvrir l intérêt', () => {
        // 10k @ 30% → intérêt mensuel ≈ 250$. Si paiement < 250 → impossible.
        const state = { debts: [makeDebt({ balance: 10000, interestRate: 30, minimumPayment: 100 })] };
        const rows = buildDebtsRows(state);
        expect(rows[0].monthsToZero).toBeUndefined();
    });

    it('mois restants linéaire si taux = 0', () => {
        const state = { debts: [makeDebt({ balance: 5000, interestRate: 0, minimumPayment: 500 })] };
        const rows = buildDebtsRows(state);
        expect(rows[0].monthsToZero).toBe(10);
    });

    it('trie par solde décroissant', () => {
        const state = {
            debts: [
                makeDebt({ id: 'a', name: 'A', balance: 1000 }),
                makeDebt({ id: 'b', name: 'B', balance: 9000 }),
                makeDebt({ id: 'c', name: 'C', balance: 5000 }),
            ],
        };
        const rows = buildDebtsRows(state);
        expect(rows.map(r => r.name)).toEqual(['B', 'C', 'A']);
    });

    it('retourne [] sur debts vides', () => {
        expect(buildDebtsRows({ debts: [] })).toEqual([]);
    });
});

describe('buildGoalsRows', () => {
    it('calcule progressPct à partir de manualCurrentAmount/targetAmount', () => {
        const state = { financialGoals: [makeGoal({ targetAmount: 1000, manualCurrentAmount: 250 })] };
        const rows = buildGoalsRows(state);
        expect(rows).toHaveLength(1);
        expect(rows[0].progressPct).toBe(25);
    });

    it('clamp progressPct à [0, 100]', () => {
        const state = {
            financialGoals: [
                makeGoal({ id: 'a', targetAmount: 1000, manualCurrentAmount: 2000 }),
                makeGoal({ id: 'b', targetAmount: 1000, manualCurrentAmount: -50 }),
            ],
        };
        const rows = buildGoalsRows(state);
        expect(rows[0].progressPct).toBe(100);
        expect(rows[1].progressPct).toBe(0);
    });

    it('filtre les goals archivés', () => {
        const state = {
            financialGoals: [
                makeGoal({ id: 'active', status: 'active' }),
                makeGoal({ id: 'arch', status: 'archived' }),
                makeGoal({ id: 'sug', status: 'suggestion' }),
            ],
        };
        const rows = buildGoalsRows(state);
        expect(rows).toHaveLength(2);
        expect(rows.find(r => r.status === 'archived')).toBeUndefined();
    });

    it('gère manualCurrentAmount absent (défaut 0)', () => {
        const state = {
            financialGoals: [makeGoal({ targetAmount: 1000, manualCurrentAmount: undefined })],
        };
        const rows = buildGoalsRows(state);
        expect(rows[0].currentAmount).toBe(0);
        expect(rows[0].progressPct).toBe(0);
    });

    it('gère targetAmount = 0 sans NaN', () => {
        const state = {
            financialGoals: [makeGoal({ targetAmount: 0, manualCurrentAmount: 100 })],
        };
        const rows = buildGoalsRows(state);
        expect(rows[0].progressPct).toBe(100); // 100/1 clampé à 100
        expect(Number.isFinite(rows[0].progressPct)).toBe(true);
    });
});

describe('buildFiscalSummary', () => {
    it('calcule per-user avec calculateFiscalReport', () => {
        const state = {
            config: {
                users: [
                    makeUser({ name: 'Alice', grossSalary: 6000 }), // 72k$/an
                    makeUser({ name: 'Bob', grossSalary: 0 }),       // ignoré (gross=0)
                ] as [User, User],
                splitMode: '50/50',
            },
        } as Pick<AppState, 'config'>;
        const fr = buildFiscalSummary(state, 2026);
        expect(fr.year).toBe(2026);
        expect(fr.perUser).toHaveLength(1);
        expect(fr.perUser[0].name).toBe('Alice');
        expect(fr.perUser[0].grossAnnual).toBe(72000);
        expect(fr.perUser[0].federalTax).toBeGreaterThan(0);
        expect(fr.perUser[0].quebecTax).toBeGreaterThan(0);
        expect(fr.totalGross).toBe(72000);
        expect(fr.totalNet).toBeGreaterThan(0);
        expect(fr.totalNet).toBeLessThan(fr.totalGross);
        expect(fr.totalTax).toBeGreaterThan(0);
    });

    it('renvoie totals = 0 si aucun user avec salaire > 0', () => {
        const state = {
            config: {
                users: [makeUser({ grossSalary: 0 }), makeUser({ grossSalary: 0 })] as [User, User],
                splitMode: '50/50',
            },
        } as Pick<AppState, 'config'>;
        const fr = buildFiscalSummary(state);
        expect(fr.perUser).toHaveLength(0);
        expect(fr.totalGross).toBe(0);
        expect(fr.totalNet).toBe(0);
        expect(fr.totalTax).toBe(0);
    });

    it('utilise l année passée en paramètre', () => {
        const state = {
            config: {
                users: [makeUser({ grossSalary: 5000 }), makeUser({ grossSalary: 0 })] as [User, User],
                splitMode: '50/50',
            },
        } as Pick<AppState, 'config'>;
        const fr2030 = buildFiscalSummary(state, 2030);
        expect(fr2030.year).toBe(2030);
    });
});
