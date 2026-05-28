/**
 * Lot 2 — portfolioOps.handleNonRegSale : vente d'un compte non-enregistré avec
 * calcul ACB + gain/perte en capital. Auparavant DUPLIQUÉ 3× (projection,
 * cashflowAllocation, realEstateMonth) — un fix d'invariant ACB dans une copie
 * ne se propageait pas. Maintenant 1 fonction pure générique, qu'on verrouille.
 */
import { describe, it, expect } from 'vitest';
import { handleNonRegSale, type NonRegSaleState } from '../../services/projection/portfolioOps';

const makeState = (o: Partial<NonRegSaleState> = {}): NonRegSaleState => ({
    nonReg: 10000, nonRegACB: 6000, capitalLossBank: 0, accCapitalGainsYear: 0, ...o,
});

describe('handleNonRegSale — gain en capital', () => {
    it('vente partielle : gain imposable proportionnel à l\'ACB', () => {
        const s = makeState({ nonReg: 10000, nonRegACB: 6000 });
        const sold = handleNonRegSale(s, 5000);
        // proportion ACB = 0.6 → costBasis 3000 → gain 2000
        expect(sold).toBe(5000);
        expect(s.nonReg).toBe(5000);
        expect(s.nonRegACB).toBe(3000);
        expect(s.accCapitalGainsYear).toBe(2000);
    });

    it('ACB nul → tout le produit est un gain', () => {
        const s = makeState({ nonReg: 8000, nonRegACB: 0 });
        handleNonRegSale(s, 4000);
        expect(s.accCapitalGainsYear).toBe(4000);
    });

    it('banque de pertes : compense le gain avant imposition', () => {
        const s = makeState({ nonReg: 10000, nonRegACB: 6000, capitalLossBank: 1000 });
        handleNonRegSale(s, 5000); // gain brut 2000
        expect(s.accCapitalGainsYear).toBe(1000); // 2000 − 1000 de pertes
        expect(s.capitalLossBank).toBe(0); // banque consommée
    });
});

describe('handleNonRegSale — bornes & solde', () => {
    it('vente > solde : plafonnée au solde disponible', () => {
        const s = makeState({ nonReg: 10000, nonRegACB: 6000 });
        const sold = handleNonRegSale(s, 25000);
        expect(sold).toBe(10000);
        expect(s.nonReg).toBe(0);
    });

    it('solde nul → rien vendu, state inchangé', () => {
        const s = makeState({ nonReg: 0, nonRegACB: 0 });
        expect(handleNonRegSale(s, 5000)).toBe(0);
        expect(s.accCapitalGainsYear).toBe(0);
    });

    it('générique : fonctionne sur un state élargi (subtyping) sans toucher les extras', () => {
        const s = { nonReg: 10000, nonRegACB: 6000, capitalLossBank: 0, accCapitalGainsYear: 0, extra: 'x' };
        handleNonRegSale(s, 5000);
        expect(s.extra).toBe('x');
        expect(s.nonReg).toBe(5000);
    });

    it('ACB ≥ solde : aucune perte enregistrée (cap proportion=1 → rawGain≥0)', () => {
        // Comportement ACTUEL pinné : la branche perte en capital est inatteignable
        // ici (proportion plafonnée à 1). Limitation connue → candidat Lot 4
        // (modéliser les pertes en capital NonReg dans les scénarios baissiers).
        const s = makeState({ nonReg: 10000, nonRegACB: 14000, capitalLossBank: 0 });
        handleNonRegSale(s, 5000);
        expect(s.capitalLossBank).toBe(0); // pas de perte banquée
        expect(s.accCapitalGainsYear).toBe(0); // ni gain
    });
});
