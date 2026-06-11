// tests/services/monthlyEvents.test.ts
// Couverture des helpers purs de services/projection/monthlyEvents.ts :
// applyTravelExpenses, applyLifeEvents, applySavingsGoalDeadlines,
// applyFinancialGoalDeadlines, computeStressTest.

import { describe, it, expect, vi } from 'vitest';
import {
    applyTravelExpenses,
    applyLifeEvents,
    applySavingsGoalDeadlines,
    applyFinancialGoalDeadlines,
    computeStressTest,
} from '../../services/projection/monthlyEvents';
import type { PropertyStateMutable, LifeEventMutator, GoalDeadlineMutator } from '../../services/projection/monthlyEvents';
import type { TravelGoal, LifeEvent, SavingsGoal, FinancialGoal, ProjectionConfig } from '../../types';

// ── applyTravelExpenses ──────────────────────────────────────────────────────

describe('applyTravelExpenses', () => {
    it('débite le coût du voyage quand le mois correspond', () => {
        // Arrange
        const goal: TravelGoal = { id: '1', destination: 'Paris', date: '2026-07', totalCost: 5000 };
        let depense = 0;
        const state = {
            addExpense: (n: number) => { depense += n; },
            logFlow: vi.fn(),
        };

        // Act
        applyTravelExpenses([goal], '2026-07', 1.0, state);

        // Assert
        expect(depense).toBe(5000);
        expect(state.logFlow).toHaveBeenCalledOnce();
    });

    it('n\'applique pas le coût si le mois ne correspond pas', () => {
        // Arrange
        const goal: TravelGoal = { id: '1', destination: 'Tokyo', date: '2026-12', totalCost: 8000 };
        let depense = 0;
        const state = { addExpense: (n: number) => { depense += n; }, logFlow: vi.fn() };

        // Act
        applyTravelExpenses([goal], '2026-07', 1.0, state);

        // Assert
        expect(depense).toBe(0);
        expect(state.logFlow).not.toHaveBeenCalled();
    });

    it('applique le multiplicateur d\'inflation au coût', () => {
        // Arrange — multiplicateur de 1.1 (10% d'inflation cumulée)
        const goal: TravelGoal = { id: '1', destination: 'Hawaii', date: '2028-03', totalCost: 10000 };
        let depense = 0;
        const state = { addExpense: (n: number) => { depense += n; }, logFlow: vi.fn() };

        // Act
        applyTravelExpenses([goal], '2028-03', 1.1, state);

        // Assert
        expect(depense).toBeCloseTo(11000, 2);
    });

    it('ignore les voyages sans date (defensive guard)', () => {
        // Arrange — objet malformé sans date
        const goal = { id: '1', destination: 'Null Island', totalCost: 1000 } as TravelGoal;
        let depense = 0;
        const state = { addExpense: (n: number) => { depense += n; }, logFlow: vi.fn() };

        // Act — ne doit pas crasher
        applyTravelExpenses([goal], '2026-07', 1.0, state);

        // Assert
        expect(depense).toBe(0);
    });
});

// ── applyLifeEvents ──────────────────────────────────────────────────────────

describe('applyLifeEvents', () => {
    // Le state est un objet mutable partagé par le mutateur ET les assertions.
    // On NE fait pas de spread (copie valeur) pour éviter la désynchronisation.
    const makeState = () => {
        const s = { portfolio: 100000, liquid: 50000, expense: 0 };
        const mutator: LifeEventMutator = {
            shockPortfolio: (f: number) => { s.portfolio *= f; },
            addLiquid: (n: number) => { s.liquid += n; },
            addExpense: (n: number) => { s.expense += n; },
            adjustRealEstate: vi.fn(),
            logLife: vi.fn(),
            logFlow: vi.fn(),
        };
        return { mutator, s };
    };

    it('applique un krach boursier et choque le portfolio', () => {
        // Arrange
        const event: LifeEvent = { id: '1', date: '2030-01', type: 'KRACH', name: 'Crise', impactPercent: 40 };
        const { mutator, s } = makeState();

        // Act
        applyLifeEvents([event], '2030-01', 1.0, [], mutator);

        // Assert — portefeuille à -40% → 60 000
        expect(s.portfolio).toBeCloseTo(60000, 0);
    });

    it('applique l\'impact d\'un événement générique comme dépense', () => {
        // Arrange
        const event: LifeEvent = { id: '2', date: '2026-08', type: 'MARIAGE', name: 'Divorce', impactAmount: 20000 };
        const { mutator, s } = makeState();

        // Act
        applyLifeEvents([event], '2026-08', 1.0, [], mutator);

        // Assert
        expect(s.expense).toBe(20000);
    });

    it('vente immobilière transfère le produit net (95%) en liquidités', () => {
        // Arrange — propriété isBought avec hypothèque
        const event: LifeEvent = { id: '3', date: '2035-06', type: 'GROS_ACHAT', name: 'Vente maison' };
        const prop: PropertyStateMutable = { isBought: true, mortgage: 150000, currentValue: 500000 };
        const { mutator, s } = makeState();

        // Act
        applyLifeEvents([event], '2035-06', 1.0, [prop], mutator);

        // Assert — net = (500000 × 0.95) - 150000 = 325000
        expect(s.liquid).toBeCloseTo(50000 + 325000, 0);
        expect(prop.isBought).toBe(false);
    });

    it('ignore les événements dont la date ne correspond pas', () => {
        // Arrange
        const event: LifeEvent = { id: '4', date: '2029-03', type: 'ACCIDENT', name: 'Maladie', impactAmount: 5000 };
        const { mutator, s } = makeState();

        // Act
        applyLifeEvents([event], '2026-07', 1.0, [], mutator);

        // Assert
        expect(s.expense).toBe(0);
    });

    it('ignore les événements sans date (defensive guard)', () => {
        // Arrange — date manquante
        const event = { id: '5', type: 'ACCIDENT', name: 'Bug', impactAmount: 9999 } as unknown as LifeEvent;
        const { mutator, s } = makeState();

        // Act — ne doit pas crasher
        expect(() => applyLifeEvents([event], '2026-07', 1.0, [], mutator)).not.toThrow();
        expect(s.expense).toBe(0);
    });
});

// ── applySavingsGoalDeadlines ─────────────────────────────────────────────────

describe('applySavingsGoalDeadlines', () => {
    const makeState = (liquidBalance: number) => {
        const s = { expense: 0, balance: liquidBalance };
        const mutator: GoalDeadlineMutator = {
            withdrawFromAccount: (_acct: string, amount: number) => {
                const withdrawn = Math.min(s.balance, amount);
                s.balance -= withdrawn;
                return withdrawn;
            },
            addExpense: (n: number) => { s.expense += n; },
            logFlow: vi.fn(),
        };
        return { mutator, s };
    };

    it('retire le manque à combler au mois deadline', () => {
        // Arrange — cible 10000, déjà 3000, deadline ce mois
        const goal: SavingsGoal = {
            id: '1', name: 'Fonds urgence', targetAmount: 10000, currentAmount: 3000, deadline: '2027-06', icon: '💰',
        };
        const { mutator, s } = makeState(20000);

        // Act
        applySavingsGoalDeadlines([goal], '2027-06', 1.0, mutator);

        // Assert — retire 7000 (10000 - 3000)
        expect(s.expense).toBe(7000);
    });

    it('n\'agit pas si le goal est déjà atteint', () => {
        // Arrange — currentAmount >= targetAmount
        const goal: SavingsGoal = {
            id: '1', name: 'Déjà atteint', targetAmount: 5000, currentAmount: 5000, deadline: '2027-06', icon: '✅',
        };
        const { mutator, s } = makeState(20000);

        // Act
        applySavingsGoalDeadlines([goal], '2027-06', 1.0, mutator);

        // Assert
        expect(s.expense).toBe(0);
    });

    it('ne rien faire si le mois ne correspond pas', () => {
        // Arrange
        const goal: SavingsGoal = {
            id: '1', name: 'Vacances', targetAmount: 8000, currentAmount: 0, deadline: '2027-12', icon: '🏖️',
        };
        const { mutator, s } = makeState(20000);

        // Act
        applySavingsGoalDeadlines([goal], '2027-06', 1.0, mutator);

        // Assert
        expect(s.expense).toBe(0);
    });
});

// ── applyFinancialGoalDeadlines ───────────────────────────────────────────────

describe('applyFinancialGoalDeadlines', () => {
    const makeState = () => {
        const s = { expense: 0 };
        const mutator: GoalDeadlineMutator = {
            withdrawFromAccount: (_acct: string, amount: number) => amount,
            addExpense: (n: number) => { s.expense += n; },
            logFlow: vi.fn(),
        };
        return { mutator, s };
    };

    it('retire le besoin du compte cible au mois deadline', () => {
        // Arrange
        const goal: FinancialGoal = {
            id: '1', name: 'Auto électrique', targetAmount: 50000, manualCurrentAmount: 20000,
            deadline: '2028-09', targetAccount: 'NON-ENREG', status: 'active', completed: false,
            type: 'CUSTOM',
        };
        const { mutator, s } = makeState();

        // Act
        applyFinancialGoalDeadlines([goal], '2028-09', 1.0, mutator);

        // Assert — besoin = 50000 - 20000 = 30000
        expect(s.expense).toBe(30000);
    });

    it('ignore les goals archivés', () => {
        // Arrange
        const goal: FinancialGoal = {
            id: '1', name: 'Archivé', targetAmount: 10000, manualCurrentAmount: 0,
            deadline: '2028-09', targetAccount: 'CELI', status: 'archived', completed: false,
            type: 'CUSTOM',
        };
        const { mutator, s } = makeState();

        // Act
        applyFinancialGoalDeadlines([goal], '2028-09', 1.0, mutator);

        // Assert
        expect(s.expense).toBe(0);
    });

    it('ignore les goals déjà complétés', () => {
        // Arrange
        const goal: FinancialGoal = {
            id: '1', name: 'Complété', targetAmount: 10000, manualCurrentAmount: 0,
            deadline: '2028-09', targetAccount: 'CELI', status: 'active', completed: true,
            type: 'CUSTOM',
        };
        const { mutator, s } = makeState();

        // Act
        applyFinancialGoalDeadlines([goal], '2028-09', 1.0, mutator);

        // Assert
        expect(s.expense).toBe(0);
    });
});

// ── [PV-11a] onGoalShortfall — remontée structurée des objectifs partiellement financés ──
describe('onGoalShortfall (PV-11a)', () => {
    it('appelé avec (nom, visé, tiré) quand les fonds sont insuffisants', () => {
        const onGoalShortfall = vi.fn();
        const mutator: GoalDeadlineMutator = {
            withdrawFromAccount: (_a, amount) => Math.min(4000, amount), // seulement 4000 dispo
            addExpense: vi.fn(),
            logFlow: vi.fn(),
            onGoalShortfall,
        };
        const goal: SavingsGoal = { id: '1', name: 'Auto', targetAmount: 10000, currentAmount: 0, deadline: '2027-01', icon: '🚗' };

        applySavingsGoalDeadlines([goal], '2027-01', 1.0, mutator);

        expect(onGoalShortfall).toHaveBeenCalledTimes(1);
        expect(onGoalShortfall).toHaveBeenCalledWith('Auto', 10000, 4000);
    });

    it('PAS appelé quand l\'objectif est entièrement financé ; hook optionnel toléré absent', () => {
        const onGoalShortfall = vi.fn();
        const full: GoalDeadlineMutator = {
            withdrawFromAccount: (_a, amount) => amount,
            addExpense: vi.fn(), logFlow: vi.fn(), onGoalShortfall,
        };
        const goal: SavingsGoal = { id: '1', name: 'OK', targetAmount: 5000, currentAmount: 0, deadline: '2027-02', icon: '✅' };
        applySavingsGoalDeadlines([goal], '2027-02', 1.0, full);
        expect(onGoalShortfall).not.toHaveBeenCalled();

        // Sans le hook (appelants tests/hors-moteur) : aucune erreur.
        const minimal: GoalDeadlineMutator = { withdrawFromAccount: () => 0, addExpense: vi.fn(), logFlow: vi.fn() };
        expect(() => applySavingsGoalDeadlines([goal], '2027-02', 1.0, minimal)).not.toThrow();
    });
});

// ── computeStressTest ────────────────────────────────────────────────────────

describe('computeStressTest', () => {
    const baseProj: ProjectionConfig = {
        years: 30,
        returnRate: 6,
        inflationRate: 2,
        savingsMode: 'manual',
        manualContribution: 1000,
        usePortfolioRate: false,
        returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6,
        salaryGrowth: 2,
        propertyGrowthRate: 3,
        stressTestEnabled: true,
        stressTestYear: 5,       // crash au mois 60
        stressTestDrop: 30,
        stressTestRecoveryMonths: 24,
    };

    it('retourne les facteurs neutres si stress test désactivé', () => {
        // Arrange
        const proj: ProjectionConfig = { ...baseProj, stressTestEnabled: false };

        // Act
        const result = computeStressTest(proj, 60);

        // Assert
        expect(result.crashFactor).toBe(1);
        expect(result.recoveryFactor).toBe(1);
        expect(result.log).toBeNull();
    });

    it('applique un crash de 30% au mois 60 (an 5)', () => {
        // Arrange
        const crashMonth = 60;

        // Act
        const result = computeStressTest(baseProj, crashMonth);

        // Assert — crashFactor = 1 - 0.30 = 0.70
        expect(result.crashFactor).toBeCloseTo(0.70, 5);
        expect(result.recoveryFactor).toBe(1);
        expect(result.log).not.toBeNull();
    });

    it('applique un facteur de reprise partielle pendant la fenêtre de recovery', () => {
        // Arrange — mois 70, dans la fenêtre 60..84
        const recoveryMonth = 70;

        // Act
        const result = computeStressTest(baseProj, recoveryMonth);

        // Assert
        expect(result.crashFactor).toBe(1);
        expect(result.recoveryFactor).toBeGreaterThan(1);
        expect(result.log).toBeNull();
    });

    it('retourne les facteurs neutres après la fenêtre de recovery', () => {
        // Arrange — mois 120, bien après an 5 + 24 mois
        const afterRecovery = 120;

        // Act
        const result = computeStressTest(baseProj, afterRecovery);

        // Assert
        expect(result.crashFactor).toBe(1);
        expect(result.recoveryFactor).toBe(1);
        expect(result.log).toBeNull();
    });

    it('retourne les facteurs neutres avant le crash (mois 0..59)', () => {
        // Arrange
        const beforeCrash = 30;

        // Act
        const result = computeStressTest(baseProj, beforeCrash);

        // Assert
        expect(result.crashFactor).toBe(1);
        expect(result.recoveryFactor).toBe(1);
    });
});
