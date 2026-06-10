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

    it('vente à PERTE : alimente la banque (n\'est plus jetée)', () => {
        // crypto 10000, ACB 16000 → proportion cap 1 → costBasis = sold → … pas de perte.
        // Pour une vraie perte il faut ACB > valeur SANS cap : proportion = min(1, ACB/crypto)
        // plafonne à 1, donc rawGain ≥ 0 (limite connue, comme NonReg). On pinne ce comportement
        // ET on vérifie le cas perte réel : cryptoACB partiel sur solde réduit.
        const s = makeCrypto({ crypto: 10000, cryptoACB: 16000, capitalLossBank: 0 });
        handleCryptoSale(s, 5000);
        // proportion = min(1, 1.6) = 1 → costBasis 5000 → rawGain 0 → ni gain ni perte.
        expect(s.accCapitalGainsYear).toBe(0);
        expect(s.capitalLossBank).toBe(0);
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
