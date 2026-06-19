/**
 * Lot 2 — portfolioOps.handleNonRegSale : vente d'un compte non-enregistré avec
 * calcul ACB + gain/perte en capital. Auparavant DUPLIQUÉ 3× (projection,
 * cashflowAllocation, realEstateMonth) — un fix d'invariant ACB dans une copie
 * ne se propageait pas. Maintenant 1 fonction pure générique, qu'on verrouille.
 */
import { describe, it, expect } from 'vitest';
import { handleNonRegSale, applyCapitalDisposition, type NonRegSaleState, type CapitalDispositionState } from '../../services/projection/portfolioOps';

const makeState = (o: Partial<NonRegSaleState> = {}): NonRegSaleState => ({
    nonReg: 10000, nonRegACB: 6000, capitalLossBank: 0, accCapitalGainsYear: 0, ...o,
});

// ──────────────────────────────────────────────────────────────────────────
// [FISC-RE-CAPITAL-LOSS] applyCapitalDisposition — SOURCE UNIQUE de la règle
// gain/perte en capital, partagée par NonReg, crypto ET la vente d'immeuble
// locatif (`monthlyEvents`). Avant, la vente immo IGNORAIT les pertes (Math.max(0,…)).
// ──────────────────────────────────────────────────────────────────────────
const makeDisp = (o: Partial<CapitalDispositionState> = {}): CapitalDispositionState => ({
    capitalLossBank: 0, accCapitalGainsYear: 0, ...o,
});

describe('[FISC-RE-CAPITAL-LOSS] applyCapitalDisposition', () => {
    it('perte (rawGain < 0) → portée en banque, aucun gain imposable', () => {
        const s = makeDisp();
        const r = applyCapitalDisposition(s, -60000);
        expect(r).toEqual({ bankedLoss: 60000, taxableGain: 0 });
        expect(s.capitalLossBank).toBe(60000);
        expect(s.accCapitalGainsYear).toBe(0);
    });

    it('gain (rawGain ≥ 0) sans banque → entièrement imposable', () => {
        const s = makeDisp();
        const r = applyCapitalDisposition(s, 175000);
        expect(r).toEqual({ bankedLoss: 0, taxableGain: 175000 });
        expect(s.accCapitalGainsYear).toBe(175000);
        expect(s.capitalLossBank).toBe(0);
    });

    it('gain partiellement absorbé par la banque de pertes', () => {
        const s = makeDisp({ capitalLossBank: 100000 });
        const r = applyCapitalDisposition(s, 80000); // entièrement absorbé
        expect(r).toEqual({ bankedLoss: 0, taxableGain: 0 });
        expect(s.accCapitalGainsYear).toBe(0);
        expect(s.capitalLossBank).toBe(20000); // 100000 − 80000
    });

    it('gain supérieur à la banque → reliquat imposable, banque vidée', () => {
        const s = makeDisp({ capitalLossBank: 30000 });
        const r = applyCapitalDisposition(s, 80000);
        expect(r).toEqual({ bankedLoss: 0, taxableGain: 50000 }); // 80000 − 30000
        expect(s.accCapitalGainsYear).toBe(50000);
        expect(s.capitalLossBank).toBe(0);
    });

    it('rawGain = 0 (produit = coût) → ni perte ni gain', () => {
        const s = makeDisp({ capitalLossBank: 5000 });
        const r = applyCapitalDisposition(s, 0);
        expect(r).toEqual({ bankedLoss: 0, taxableGain: 0 });
        expect(s.capitalLossBank).toBe(5000); // banque intacte
        expect(s.accCapitalGainsYear).toBe(0);
    });
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

// ──────────────────────────────────────────────────────────────────────────
// [PV-7] handleCryptoSale — MÊME logique que NonReg (gain proportionnel +
// banque de pertes). Avant, les 3 sites de vente crypto ignoraient la banque
// et JETAIENT les pertes (accCapitalGainsYear += Math.max(0, gain)).
// ──────────────────────────────────────────────────────────────────────────
import { handleCryptoSale, type CryptoSaleState } from '../../services/projection/portfolioOps';

const makeCrypto = (o: Partial<CryptoSaleState> = {}): CryptoSaleState => ({
    crypto: 10000, cryptoACB: 4000, capitalLossBank: 0, accCapitalGainsYear: 0, ...o,
});

describe('[PV-7] handleCryptoSale — gain en capital + banque de pertes', () => {
    it('vente partielle : gain proportionnel à l\'ACB', () => {
        const s = makeCrypto({ crypto: 10000, cryptoACB: 4000 });
        const sold = handleCryptoSale(s, 5000);
        // proportion = 0.4 → costBasis 2000 → gain 3000
        expect(sold).toBe(5000);
        expect(s.crypto).toBe(5000);
        expect(s.cryptoACB).toBe(2000);
        expect(s.accCapitalGainsYear).toBe(3000);
    });

    it('la banque de pertes COMPENSE le gain (n\'est plus ignorée)', () => {
        // Avant PV-7 : gain 3000 imposé en entier (banque ignorée). Maintenant : compensé.
        const s = makeCrypto({ crypto: 10000, cryptoACB: 4000, capitalLossBank: 2000 });
        handleCryptoSale(s, 5000); // gain brut 3000
        expect(s.accCapitalGainsYear).toBe(1000); // 3000 − 2000 compensés
        expect(s.capitalLossBank).toBe(0);
    });

    it('ACB ≥ valeur : aucune perte réalisée (cap proportion=1 → rawGain≥0)', () => {
        // Comportement pinné, identique à NonReg : le cap min(1, ACB/valeur) rend rawGain ≥ 0,
        // donc la branche « perte → banque » est inatteignable à la VENTE (la perte latente est
        // différée via l'ACB résiduel). La banque ne s'alimente que par le TLH explicite.
        const s = makeCrypto({ crypto: 10000, cryptoACB: 16000, capitalLossBank: 0 });
        handleCryptoSale(s, 5000);
        expect(s.accCapitalGainsYear).toBe(0);
        expect(s.capitalLossBank).toBe(0);
    });

    it('ÉQUIVALENCE stricte avec handleNonRegSale (même état → mêmes mutations)', () => {
        // handleCryptoSale doit être le miroir byte-pour-byte de handleNonRegSale (gain
        // proportionnel + consommation de banque). Prouvé sur un état numérique commun avec
        // banque partielle : gain brut 3000, banque 1500 → 1500 imposable, banque vidée.
        const cs = makeCrypto({ crypto: 10000, cryptoACB: 4000, capitalLossBank: 1500 });
        const ns = { nonReg: 10000, nonRegACB: 4000, capitalLossBank: 1500, accCapitalGainsYear: 0 };
        const soldC = handleCryptoSale(cs, 5000);
        const soldN = handleNonRegSale(ns, 5000);
        expect(soldC).toBe(soldN);
        expect(cs.accCapitalGainsYear).toBe(ns.accCapitalGainsYear);
        expect(cs.capitalLossBank).toBe(ns.capitalLossBank);
        expect(cs.cryptoACB).toBe(ns.nonRegACB);
    });

    it('solde insuffisant : vend ce qui reste, sans planter', () => {
        const s = makeCrypto({ crypto: 3000, cryptoACB: 1000 });
        const sold = handleCryptoSale(s, 9999);
        expect(sold).toBe(3000);
        expect(s.crypto).toBe(0);
        expect(s.accCapitalGainsYear).toBe(2000); // gain = 3000 − 1000
    });

    it('crypto = 0 : no-op', () => {
        const s = makeCrypto({ crypto: 0, cryptoACB: 0 });
        expect(handleCryptoSale(s, 5000)).toBe(0);
        expect(s.accCapitalGainsYear).toBe(0);
    });
});
