/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useFinanceStore } from '../../store/useFinanceStore';
import { getHasUserDataSnapshot } from '../../utils/useHasUserData';

const initialState = useFinanceStore.getState();

beforeEach(() => {
    useFinanceStore.setState(initialState, true);
});

describe('getHasUserDataSnapshot', () => {
    it('returns hasData=false sur état initial (user vide, pas de transactions)', () => {
        useFinanceStore.setState({
            config: {
                ...initialState.config,
                users: [
                    { ...initialState.config.users[0], name: '', grossSalary: 0, netSalary: 0 },
                    { ...initialState.config.users[1], name: '' },
                ],
            },
            assets: [],
            transactions: [],
            financialGoals: [],
        });
        const status = getHasUserDataSnapshot();
        expect(status.hasData).toBe(false);
        expect(status.hasProfile).toBe(false);
        expect(status.hasAssets).toBe(false);
        expect(status.hasTransactions).toBe(false);
        expect(status.hasGoals).toBe(false);
    });

    it('returns hasData=true si user1.name + grossSalary > 0', () => {
        useFinanceStore.setState({
            config: {
                ...initialState.config,
                users: [
                    { ...initialState.config.users[0], name: 'Alice', grossSalary: 5000, netSalary: 0 },
                    { ...initialState.config.users[1], name: '' },
                ],
            },
            assets: [],
            transactions: [],
            financialGoals: [],
        });
        const status = getHasUserDataSnapshot();
        expect(status.hasData).toBe(true);
        expect(status.hasProfile).toBe(true);
    });

    it('returns hasData=true si user1.name + netSalary > 0 (sans gross)', () => {
        useFinanceStore.setState({
            config: {
                ...initialState.config,
                users: [
                    { ...initialState.config.users[0], name: 'Alice', grossSalary: 0, netSalary: 3500 },
                    { ...initialState.config.users[1], name: '' },
                ],
            },
            assets: [],
            transactions: [],
            financialGoals: [],
        });
        expect(getHasUserDataSnapshot().hasProfile).toBe(true);
    });

    it('returns hasProfile=false si nom sans salaire (insuffisant)', () => {
        useFinanceStore.setState({
            config: {
                ...initialState.config,
                users: [
                    { ...initialState.config.users[0], name: 'Alice', grossSalary: 0, netSalary: 0 },
                    { ...initialState.config.users[1], name: '' },
                ],
            },
            assets: [],
            transactions: [],
            financialGoals: [],
        });
        expect(getHasUserDataSnapshot().hasProfile).toBe(false);
    });

    it('returns hasData=true si au moins 1 asset', () => {
        useFinanceStore.setState({
            config: {
                ...initialState.config,
                users: [
                    { ...initialState.config.users[0], name: '', grossSalary: 0, netSalary: 0 },
                    { ...initialState.config.users[1], name: '' },
                ],
            },
            assets: [{
                symbol: 'AAPL', quantity: 10, currency: 'USD' as const, currentPrice: 200,
                name: 'Apple', performance: 0, dateBought: '2024-01-01',
            }],
            transactions: [],
            financialGoals: [],
        });
        const status = getHasUserDataSnapshot();
        expect(status.hasData).toBe(true);
        expect(status.hasAssets).toBe(true);
        expect(status.hasProfile).toBe(false); // profile vide mais data trouvée
    });

    it('returns hasData=true si au moins 1 transaction', () => {
        useFinanceStore.setState({
            config: {
                ...initialState.config,
                users: [
                    { ...initialState.config.users[0], name: '', grossSalary: 0, netSalary: 0 },
                    { ...initialState.config.users[1], name: '' },
                ],
            },
            assets: [],
            transactions: [{
                id: 1, date: '2026-01-01', payee: 'Maxi', amount: -50,
                category: 'Épicerie', accountName: 'Courant', isTransfer: false,
                isDuplicate: false, status: 'processed', originalCategory: 'Épicerie',
            }],
            financialGoals: [],
        });
        const status = getHasUserDataSnapshot();
        expect(status.hasData).toBe(true);
        expect(status.hasTransactions).toBe(true);
    });
});
