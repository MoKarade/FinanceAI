// tests/hooks/useFinancialSignals.test.ts
//
// [ASSISTANT-HUB — Test A du plan architect] PARITÉ narrow↔full : le hook sélectionne des tranches
// ÉTROITES du store — si computeFinancialSignals/buildFinancialOverview évolue et lit un champ
// d'AppState HORS de SIGNAL_STATE_KEYS, les cartes seraient silencieusement figées/fausses
// (classe BUDGET-MONTH-NAV, version hook). Ce test casse AVANT la prod dans ce cas.

import { describe, it, expect } from 'vitest';
import { computeFinancialSignals } from '../../mcp/financialSignals';
import { buildDefaultAppState } from '../../mcp/state/appStateDefaults';
import { SIGNAL_STATE_KEYS } from '../../hooks/useFinancialSignals';
import type { AppState } from '../../types';

function fixtureFullState(): AppState {
    const s = buildDefaultAppState();
    // Exercer un maximum de règles : dette toxique (≥8 %), revenus/dépenses (cashflow), actifs
    // CELI (espace), salaire (droits de cotisation), cash (coussin).
    s.config.users[0] = {
        ...s.config.users[0], name: 'Marc', grossSalary: 6000, netSalary: 4200,
        birthYear: 1991, age: 35,
    };
    s.debts = [{ id: 'd_1', name: 'Carte de crédit', balance: 8500, interestRate: 19.99, minimumPayment: 200 } as never];
    s.assets = [
        { symbol: 'CASH', name: 'Compte chèque', quantity: 1, currency: 'CAD', currentPrice: 2000, performance: 0, dateBought: '2024-01-01', accountType: 'AUTRE' } as never,
        { symbol: 'VFV.TO', name: 'VFV', quantity: 10, currency: 'CAD', currentPrice: 120, performance: 0, dateBought: '2024-01-01', accountType: 'CELI' } as never,
    ];
    s.transactions = [
        { id: 1, date: '2026-06-05', payee: 'Employeur', amount: 4200, category: 'Salaire', status: 'processed' } as never,
        { id: 2, date: '2026-06-10', payee: 'Épicerie', amount: -900, category: 'Épicerie', status: 'processed' } as never,
    ];
    return s;
}

describe('useFinancialSignals — parité narrow↔full (garde anti-staleness)', () => {
    it('les tranches SIGNAL_STATE_KEYS suffisent : signaux IDENTIQUES à l\'état complet', () => {
        const full = fixtureFullState();
        const narrow = Object.fromEntries(
            SIGNAL_STATE_KEYS.map((k) => [k, full[k]]),
        ) as unknown as AppState;

        const fromFull = computeFinancialSignals(full, 2026);
        const fromNarrow = computeFinancialSignals(narrow, 2026);

        // La fixture doit EXERCER des signaux (sinon test vacant — leçon FUZZ-ONETIME-FLOWS).
        expect(fromFull.signals.length).toBeGreaterThan(0);
        expect(fromNarrow).toEqual(fromFull);
    });

    it('la fixture exerce bien la dette toxique (discriminant non vacant)', () => {
        const { signals } = computeFinancialSignals(fixtureFullState(), 2026);
        expect(signals.some((s) => s.priority === 'high' && /taux/i.test(s.observation))).toBe(true);
    });
});
