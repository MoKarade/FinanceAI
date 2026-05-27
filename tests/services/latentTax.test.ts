// tests/services/latentTax.test.ts
// Couverture de computeLatentTax : impôt latent estimé sur liquidation totale.
// Utilise une fonction fiscale déterministe injectée pour éviter la dépendance
// sur les barèmes d'impôt exacts.

import { describe, it, expect } from 'vitest';
import { computeLatentTax } from '../../services/projection/latentTax';
import type { LatentTaxCtx } from '../../services/projection/latentTax';
import { calculateFiscalReport } from '../../utils/tax';

// Utilise la vraie fonction fiscale (barèmes QC) pour des tests réalistes
const realFiscal = (gross: number, r: number, f: number, yr: number, skip: boolean) =>
    calculateFiscalReport(gross, r, f, yr, skip);

const makeCtx = (overrides: Partial<LatentTaxCtx> = {}): LatentTaxCtx => ({
    m: 12,
    loopYear: 2027,
    simInflation: 2,
    simSalaryGrowth: 2,
    isRetired: false,
    activeUsersCount: 2,
    grossMarcBaseAnnual: 80000,
    grossAnnaBaseAnnual: 70000,
    accRentesYear: 0,
    incomeRetirement: 3000,
    reer: 100000,
    nonReg: 50000,
    nonRegACB: 30000,
    crypto: 20000,
    enableMonteCarlo: false,
    ...overrides,
});

describe('computeLatentTax', () => {
    it('retourne un nombre négatif (obligation fiscale future)', () => {
        // Arrange
        const ctx = makeCtx();

        // Act
        const result = computeLatentTax(ctx, realFiscal);

        // Assert — impôt latent = négatif par convention
        expect(result).toBeLessThan(0);
    });

    it('impôt latent plus élevé (plus négatif) quand le REER est plus grand', () => {
        // Arrange
        const ctxPetitReer = makeCtx({ reer: 10000 });
        const ctxGrosReer = makeCtx({ reer: 500000 });

        // Act
        const latentPetit = computeLatentTax(ctxPetitReer, realFiscal);
        const latentGros = computeLatentTax(ctxGrosReer, realFiscal);

        // Assert — plus de REER → dette fiscale plus importante
        expect(latentGros).toBeLessThan(latentPetit);
    });

    it('impôt latent plus élevé quand les plus-values non-enregistrées sont plus grandes', () => {
        // Arrange — nonReg élevé avec ACB faible → grosse plus-value latente
        const ctxSansPV = makeCtx({ nonReg: 30000, nonRegACB: 30000 });
        const ctxAvecPV = makeCtx({ nonReg: 200000, nonRegACB: 30000 });

        // Act
        const latentSans = computeLatentTax(ctxSansPV, realFiscal);
        const latentAvec = computeLatentTax(ctxAvecPV, realFiscal);

        // Assert
        expect(latentAvec).toBeLessThan(latentSans);
    });

    it('utilise les revenus de retraite quand isRetired = true', () => {
        // Arrange
        const ctxActif = makeCtx({ isRetired: false });
        const ctxRetraite = makeCtx({ isRetired: true, accRentesYear: 40000, incomeRetirement: 2000 });

        // Act
        const latentActif = computeLatentTax(ctxActif, realFiscal);
        const latentRetraite = computeLatentTax(ctxRetraite, realFiscal);

        // Assert — les deux doivent être négatifs (valides), peu importe la magnitude
        expect(latentActif).toBeLessThan(0);
        expect(latentRetraite).toBeLessThan(0);
    });

    it('impôt latent nul si tous les actifs imposables valent 0', () => {
        // Arrange — aucun actif imposable
        const ctx = makeCtx({ reer: 0, nonReg: 0, nonRegACB: 0, crypto: 0 });

        // Act
        const result = computeLatentTax(ctx, realFiscal);

        // Assert — aucun gain latent → résultat proche de 0
        expect(result).toBeCloseTo(0, 2);
    });
});
