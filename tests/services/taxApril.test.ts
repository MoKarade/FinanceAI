// tests/services/taxApril.test.ts
// Couverture de processAprilSettlement : règlement en avril, hors-avril,
// remboursement, et réinvestissement du surplus.

import { describe, it, expect, vi } from 'vitest';
import { processAprilSettlement } from '../../services/projection/taxApril';
import type { AprilSettlementMutator } from '../../services/projection/taxApril';

const makeMutator = () => {
    const s = { liquid: 0, nonReg: 0, nonRegACB: 0 };
    const mutator: AprilSettlementMutator = {
        subtractLiquid: (n) => { s.liquid -= n; },
        addNonReg: (n) => { s.nonReg += n; },
        addNonRegACB: (n) => { s.nonRegACB += n; },
        logFlow: vi.fn(),
    };
    return { mutator, s };
};

describe('processAprilSettlement', () => {
    it('ne fait rien si ce n\'est pas avril (currentMonthIndex ≠ 3)', () => {
        // Arrange
        const { mutator, s } = makeMutator();
        const taxPrev = { revenu: 5000, gains: 1000, divers: 200, reer: 0 };

        // Act — mois de juin (currentMonthIndex = 5)
        const result = processAprilSettlement(5, 12, taxPrev, mutator);

        // Assert
        expect(result.fluxImpots).toBe(0);
        expect(s.liquid).toBe(0);
    });

    it('ne fait rien au mois 0 même si c\'est avril', () => {
        // Arrange
        const { mutator, s } = makeMutator();
        const taxPrev = { revenu: 5000, gains: 1000, divers: 200, reer: 0 };

        // Act
        const result = processAprilSettlement(3, 0, taxPrev, mutator);

        // Assert — mois m=0 est exclu par guard
        expect(result.fluxImpots).toBe(0);
        expect(s.liquid).toBe(0);
    });

    it('règle les impôts en avril quand fluxImpots > 0', () => {
        // Arrange — dette fiscale de 8200$
        const { mutator, s } = makeMutator();
        const taxPrev = { revenu: 5000, gains: 2000, divers: 1000, reer: 200 };

        // Act — avril, mois 4
        const result = processAprilSettlement(3, 4, taxPrev, mutator);

        // Assert — liquid réduit de 8200, taxPreviousYear remis à zéro
        expect(result.fluxImpots).toBe(8200);
        expect(s.liquid).toBe(-8200);
        expect(result.newTaxPreviousYear).toEqual({ revenu: 0, gains: 0, divers: 0, reer: 0 });
        expect(mutator.logFlow).toHaveBeenCalledOnce();
    });

    it('émet un remboursement et réinvestit le surplus dans nonReg quand flux < 0', () => {
        // Arrange — remboursement de retenue à la source
        const { mutator, s } = makeMutator();
        const taxPrev = { revenu: -3000, gains: 0, divers: 0, reer: 0 };

        // Act — avril, mois 16
        const result = processAprilSettlement(3, 16, taxPrev, mutator);

        // Assert — liquid augmente (subtractLiquid d'un négatif = addition)
        expect(result.fluxImpots).toBe(-3000);
        expect(s.liquid).toBe(3000); // subtractLiquid(-3000) = liquid += 3000
        // Le remboursement de revenu est réinvesti dans nonReg
        expect(s.nonReg).toBe(3000);
        expect(s.nonRegACB).toBe(3000);
    });

    it('ne réinvestit pas dans nonReg si le remboursement vient de gains/divers', () => {
        // Arrange — remboursement de gains uniquement (taxPaidRevenu ≥ 0)
        const { mutator, s } = makeMutator();
        const taxPrev = { revenu: 100, gains: -500, divers: 0, reer: 0 };

        // Act
        const result = processAprilSettlement(3, 16, taxPrev, mutator);

        // Assert — flux = -400 (remboursement net) mais taxPaidRevenu positif → pas de nonReg
        expect(result.fluxImpots).toBe(-400);
        expect(s.nonReg).toBe(0);
    });
});
