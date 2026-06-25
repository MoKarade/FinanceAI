import { useMemo } from 'react';
import type { AppState, Transaction } from '../types';
import { computePresentNetWorth } from '../services/portfolio';
import { logErrorThrottled } from '../services/errorLogger';

interface DerivedFinancials {
    globalNetWorth: number;
    baseGrossAnnual: number;
    calculatedMonthlySavings: number;
    assetBreakdown: { reer: number; celi: number; reee: number; nonReg: number };
    currentLiquidity: number;
}

/**
 * Phase 3B — extrait les memos dérivés de App.tsx pour réduire la god-component.
 *
 * Aucune logique métier modifiée. Les formules sont importées telles quelles
 * depuis App.tsx (state au 28/05/2026).
 */
export function useDerivedFinancials(state: AppState): DerivedFinancials {
    const baseGrossAnnual = useMemo(
        () => state.config.users.reduce((sum, u) => sum + ((u.grossSalary || 0) * 12), 0),
        [state.config.users],
    );

    // [NW-UI-DEBT] Source unique du NW présent : soustrait les dettes (avant : cash+investments
    // SANS dettes → Dashboard gonflé vs moteur/IA). `computePresentNetWorth` = pendant de `computeRawNetWorth`.
    const globalNetWorth = useMemo(
        () => computePresentNetWorth(state.initialBalances, state.transactions, state.assets, state.fxRates, state.debts),
        [state.initialBalances, state.transactions, state.assets, state.fxRates, state.debts],
    );

    const calculatedMonthlySavings = useMemo(() => {
        const income = state.config.users.reduce((acc, u) => acc + (u.netSalary || u.salary || 0), 0);
        const budgetExp = state.budgetItems.reduce((acc, item) => {
            if (item.nature === 'Epargne') return acc;
            let amount = item.target;
            if (item.frequency === 'Yearly') amount /= 12;
            if (item.frequency === 'Quarterly') amount /= 3;
            if (item.frequency === 'Weekly') amount *= 4.33;
            return acc + amount;
        }, 0);
        return Math.max(0, income - budgetExp);
    }, [state.config, state.budgetItems]);

    const assetBreakdown = useMemo(() => {
        let reer = 0;
        let celi = 0;
        const reee = 0;
        let nonReg = 0;
        state.assets.forEach(a => {
            // [NAN-INPUT-HARDENING] garde l'AGRÉGAT (quantity/currentPrice peuvent être NaN si saisie vidée
            // / prix échoué) — sinon reer/celi/nonReg deviennent NaN en silence (non capté par les invariants).
            const raw = a.quantity * a.currentPrice * (state.fxRates[a.currency] || 1);
            // [NAN-OBSERVABILITY] surface le rabattement (throttlé par actif : ce useMemo se recalcule).
            if (!Number.isFinite(raw)) {
                logErrorThrottled(`asset-nan:${a.symbol}`, {
                    source: 'ui', severity: 'warning',
                    message: `Actif "${a.name || a.symbol}" : valeur non finie (quantité/prix vidé ou prix échoué) → compté 0 $`,
                    context: { symbol: a.symbol, accountType: a.accountType },
                });
            }
            const val = Number.isFinite(raw) ? raw : 0;
            if (a.accountType === 'REER') reer += val;
            else if (a.accountType === 'CELI') celi += val;
            else nonReg += val;
        });
        return { reer, celi, reee, nonReg };
    }, [state.assets, state.fxRates]);

    const currentLiquidity = useMemo(() => {
        let cash = 0;
        (Object.values(state.initialBalances) as number[]).forEach(v => cash += v);
        state.transactions.forEach((t: Transaction) => {
            if (!t.isDuplicate && !t.isTransfer) cash += t.amount;
        });
        return cash;
    }, [state.initialBalances, state.transactions]);

    return { globalNetWorth, baseGrossAnnual, calculatedMonthlySavings, assetBreakdown, currentLiquidity };
}
