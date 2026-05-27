// tests/services/w5Effects.test.ts
// Couverture des effets W5 : assurances, véhicules, rénovations, dons charitables,
// immeubles locatifs, entreprises privées, et dépenses liées à l'âge.

import { describe, it, expect, vi } from 'vitest';
import { applyW5Effects, applyAgeBasedExpenses } from '../../services/projection/w5Effects';
import type { W5Context, W5Mutator, W5Containers } from '../../services/projection/w5Effects';

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeCtx = (overrides: Partial<W5Context> = {}): W5Context => ({
    m: 12,
    currentMonthIndex: 0,
    currentLoopDate: new Date('2027-01-01'),
    startYear: 2026,
    startMonth: 0,
    expenseMultiplier: 1.0,
    ...overrides,
});

const makeMutator = () => {
    const s = { expense: 0, income: 0, liquid: 0, taxRevenu: 0, taxGains: 0 };
    const mutator: W5Mutator = {
        addExpense: (n) => { s.expense += n; },
        addIncome: (n) => { s.income += n; },
        subtractLiquid: (n) => { s.liquid -= n; },
        addTaxRevenu: (n) => { s.taxRevenu += n; },
        addTaxGains: (n) => { s.taxGains += n; },
        logFlow: vi.fn(),
        logLife: vi.fn(),
    };
    return { mutator, s };
};

const emptyContainers = (): W5Containers => ({
    insurancePolicies: [],
    vehicleReplacements: [],
    majorRenovations: [],
    charitableGoals: [],
    rentalProperties: [],
    privateBusinesses: [],
});

// ── Assurances ────────────────────────────────────────────────────────────────

describe('applyW5Effects — assurances', () => {
    it('débite la prime mensuelle active', () => {
        // Arrange
        const { mutator, s } = makeMutator();
        const containers: W5Containers = {
            ...emptyContainers(),
            insurancePolicies: [{ id: 'p1', kind: 'life-term' as const, monthlyPremium: 200 }],
        };

        // Act
        applyW5Effects(makeCtx(), containers, mutator);

        // Assert
        expect(s.expense).toBe(200);
    });

    it('n\'applique pas la prime si la police est expirée', () => {
        // Arrange — expiry dans le passé
        const { mutator, s } = makeMutator();
        const containers: W5Containers = {
            ...emptyContainers(),
            insurancePolicies: [{
                id: 'p2', kind: 'life-term' as const, monthlyPremium: 150,
                expiryDate: '2020-01-01',
            }],
        };

        // Act
        applyW5Effects(makeCtx({ currentLoopDate: new Date('2027-06-01') }), containers, mutator);

        // Assert
        expect(s.expense).toBe(0);
    });

    it('continue d\'appliquer la prime si la police n\'est pas encore expirée', () => {
        // Arrange — expiry dans le futur
        const { mutator, s } = makeMutator();
        const containers: W5Containers = {
            ...emptyContainers(),
            insurancePolicies: [{
                id: 'p3', kind: 'disability-lt' as const, monthlyPremium: 300,
                expiryDate: '2040-01-01',
            }],
        };

        // Act
        applyW5Effects(makeCtx({ currentLoopDate: new Date('2027-01-01') }), containers, mutator);

        // Assert
        expect(s.expense).toBe(300);
    });
});

// ── Véhicules cycliques ───────────────────────────────────────────────────────

describe('applyW5Effects — véhicules', () => {
    it('débite le coût véhicule quand le cycle est atteint (120 mois)', () => {
        // Arrange — exactement au mois 120 (10 ans)
        const { mutator, s } = makeMutator();
        const containers: W5Containers = {
            ...emptyContainers(),
            vehicleReplacements: [{ id: 'v1', costEstimate: 40000, cyclYears: 10 }],
        };

        // Act
        applyW5Effects(makeCtx({ m: 120 }), containers, mutator);

        // Assert
        expect(s.liquid).toBe(-40000);
    });

    it('ne débite pas si le cycle n\'est pas atteint', () => {
        // Arrange — mois 60, cycle 10 ans (120 mois)
        const { mutator, s } = makeMutator();
        const containers: W5Containers = {
            ...emptyContainers(),
            vehicleReplacements: [{ id: 'v1', costEstimate: 35000, cyclYears: 10 }],
        };

        // Act
        applyW5Effects(makeCtx({ m: 60 }), containers, mutator);

        // Assert
        expect(s.liquid).toBe(0);
    });
});

// ── Rénovations majeures ──────────────────────────────────────────────────────

describe('applyW5Effects — rénovations', () => {
    it('débite le coût de rénovation au mois correspondant', () => {
        // Arrange — rénovation en janvier 2027, simulation commence jan 2026
        const { mutator, s } = makeMutator();
        const containers: W5Containers = {
            ...emptyContainers(),
            majorRenovations: [{ id: 'r1', description: 'Cuisine', cost: 25000, date: '2027-01-15' }],
        };

        // Act — mois 12 = jan 2027 (startYear=2026, startMonth=0)
        applyW5Effects(makeCtx({ m: 12 }), containers, mutator);

        // Assert
        expect(s.liquid).toBe(-25000);
    });

    it('n\'applique pas la rénovation si la date ne correspond pas', () => {
        // Arrange — rénovation planifiée pour 2030
        const { mutator, s } = makeMutator();
        const containers: W5Containers = {
            ...emptyContainers(),
            majorRenovations: [{ id: 'r1', description: 'Toit', cost: 15000, date: '2030-06-01' }],
        };

        // Act — mois 12 = jan 2027
        applyW5Effects(makeCtx({ m: 12 }), containers, mutator);

        // Assert
        expect(s.liquid).toBe(0);
    });
});

// ── Dons charitables ──────────────────────────────────────────────────────────

describe('applyW5Effects — dons charitables', () => {
    it('applique le don mensuel (annuel/12) et le crédit fiscal en janvier', () => {
        // Arrange — janvier (currentMonthIndex=0), an 2027 (yearNow=2027)
        const { mutator, s } = makeMutator();
        const containers: W5Containers = {
            ...emptyContainers(),
            charitableGoals: [{ id: 'c1', annualAmount: 12000 }],
        };

        // Act — mois 12, currentMonthIndex=0 (janvier)
        applyW5Effects(makeCtx({ m: 12, currentMonthIndex: 0 }), containers, mutator);

        // Assert — dépense mensuelle = 1000, taxRevenu réduit de 33% × 12000 = -3960
        expect(s.expense).toBeCloseTo(1000, 2);
        expect(s.taxRevenu).toBeCloseTo(-3960, 2);
    });

    it('ne comptabilise pas le crédit fiscal hors janvier', () => {
        // Arrange — juillet (currentMonthIndex=6)
        const { mutator, s } = makeMutator();
        const containers: W5Containers = {
            ...emptyContainers(),
            charitableGoals: [{ id: 'c1', annualAmount: 12000 }],
        };

        // Act
        applyW5Effects(makeCtx({ m: 18, currentMonthIndex: 6 }), containers, mutator);

        // Assert — dépense mensuelle présente mais pas le crédit
        expect(s.expense).toBeCloseTo(1000, 2);
        expect(s.taxRevenu).toBe(0);
    });

    it('n\'applique pas le don si la période est hors bornes', () => {
        // Arrange — don limité à 2028-2030, simulation en 2027
        const { mutator, s } = makeMutator();
        const containers: W5Containers = {
            ...emptyContainers(),
            charitableGoals: [{ id: 'c1', annualAmount: 5000, startYear: 2028, endYear: 2030 }],
        };

        // Act — m=12 → yearNow=2027, avant startYear
        applyW5Effects(makeCtx({ m: 12 }), containers, mutator);

        // Assert
        expect(s.expense).toBe(0);
    });
});

// ── Immeubles locatifs ────────────────────────────────────────────────────────

describe('applyW5Effects — immeubles locatifs', () => {
    it('ajoute le NOI net comme revenu', () => {
        // Arrange — loyer 2500$/mois, dépenses 500$/mois, vacancy 5%
        const { mutator, s } = makeMutator();
        const containers: W5Containers = {
            ...emptyContainers(),
            rentalProperties: [{
                id: 'rp1', name: '123 Rue Test', monthlyRent: 2500,
                monthlyExpenses: 500, vacancyPct: 5,
                purchasePrice: 400000, currentValue: 450000,
                mortgageBalance: 300000, mortgageRate: 5,
            }],
        };

        // Act
        applyW5Effects(makeCtx(), containers, mutator);

        // Assert — NOI annuel = 2500×12×0.95 - 500×12 = 28500-6000 = 22500 → /12 = 1875/mois
        expect(s.income).toBeCloseTo(1875, 0);
        // taxRevenu = 45% de 1875 / 12 × 12 — vérification approximative
        expect(s.taxRevenu).toBeGreaterThan(0);
    });
});

// ── Entreprises privées ───────────────────────────────────────────────────────

describe('applyW5Effects — entreprises privées', () => {
    it('ajoute les dividendes mensuels au revenu', () => {
        // Arrange
        const { mutator, s } = makeMutator();
        const containers: W5Containers = {
            ...emptyContainers(),
            privateBusinesses: [{
                id: 'b1', name: 'Holding SA', annualDividend: 120000,
                ownershipPct: 100, estimatedValue: 1000000,
            }],
        };

        // Act
        applyW5Effects(makeCtx(), containers, mutator);

        // Assert — 120000/12 = 10000/mois
        expect(s.income).toBeCloseTo(10000, 0);
    });

    it('tient compte du % de participation', () => {
        // Arrange — 50% de participation sur 240000$/an
        const { mutator, s } = makeMutator();
        const containers: W5Containers = {
            ...emptyContainers(),
            privateBusinesses: [{
                id: 'b2', name: 'Holding SARL', annualDividend: 240000,
                ownershipPct: 50, estimatedValue: 2000000,
            }],
        };

        // Act
        applyW5Effects(makeCtx(), containers, mutator);

        // Assert — 240000 × 0.5 / 12 = 10000
        expect(s.income).toBeCloseTo(10000, 0);
    });
});

// ── applyAgeBasedExpenses ────────────────────────────────────────────────────

describe('applyAgeBasedExpenses', () => {
    it('applique la dépense boomerang pendant la durée configurée', () => {
        // Arrange — boomerang débute à 55 ans, durée 36 mois, âge actuel 56
        let depense = 0;
        const state = { addExpense: (n: number) => { depense += n; } };
        const ctx = { age: 56, currentMonthIndex: 0, isRetired: false, expenseMultiplier: 1.0 };
        const proj = {
            boomerangSupportMonthly: 800,
            boomerangStartAge: 55,
            boomerangDurationMonths: 36,
        };

        // Act
        applyAgeBasedExpenses(ctx, proj, state);

        // Assert — mois 12 dans la durée → dépense active
        expect(depense).toBe(800);
    });

    it('n\'applique pas le boomerang avant l\'âge de début', () => {
        // Arrange — boomerang à 55 ans, âge actuel 50
        let depense = 0;
        const state = { addExpense: (n: number) => { depense += n; } };
        const ctx = { age: 50, currentMonthIndex: 0, isRetired: false, expenseMultiplier: 1.0 };
        const proj = { boomerangSupportMonthly: 800, boomerangStartAge: 55, boomerangDurationMonths: 36 };

        // Act
        applyAgeBasedExpenses(ctx, proj, state);

        // Assert
        expect(depense).toBe(0);
    });

    it('applique les frais de caregiving pendant la durée configurée', () => {
        // Arrange — aidant à 65 ans, durée 24 mois, âge actuel 66
        let depense = 0;
        const state = { addExpense: (n: number) => { depense += n; } };
        const ctx = { age: 66, currentMonthIndex: 0, isRetired: true, expenseMultiplier: 1.0 };
        const proj = { caregivingMonthly: 1500, caregivingStartAge: 65, caregivingDurationMonths: 24 };

        // Act
        applyAgeBasedExpenses(ctx, proj, state);

        // Assert
        expect(depense).toBe(1500);
    });

    it('applique les frais snowbird mensuels si retraité et activé', () => {
        // Arrange
        let depense = 0;
        const state = { addExpense: (n: number) => { depense += n; } };
        const ctx = { age: 68, currentMonthIndex: 0, isRetired: true, expenseMultiplier: 1.0 };
        const proj = { snowbirdEnabled: true, snowbirdMonthsPerYear: 4, snowbirdExtraMonthlyCost: 1200 };

        // Act
        applyAgeBasedExpenses(ctx, proj, state);

        // Assert — 1200 × 4 / 12 = 400/mois
        expect(depense).toBeCloseTo(400, 2);
    });

    it('n\'applique pas snowbird si non retraité', () => {
        // Arrange
        let depense = 0;
        const state = { addExpense: (n: number) => { depense += n; } };
        const ctx = { age: 55, currentMonthIndex: 0, isRetired: false, expenseMultiplier: 1.0 };
        const proj = { snowbirdEnabled: true, snowbirdMonthsPerYear: 4, snowbirdExtraMonthlyCost: 1200 };

        // Act
        applyAgeBasedExpenses(ctx, proj, state);

        // Assert
        expect(depense).toBe(0);
    });
});
