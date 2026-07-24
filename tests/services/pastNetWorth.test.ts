import { describe, it, expect } from 'vitest';
import { pastNetWorthAt, type PastInvestBuckets } from '../../services/history/pastNetWorth';

// [FUTUR-REAL-HISTORY, Option A 2026-07-24] Le patrimoine net d'un point PASSÉ soustrait la dette hors
// hypothèque AU NIVEAU ACTUEL (`chartData[0].DettesNonImmo`) → raccord EXACT au futur (qui soustrait la même
// dette dès le mois 0). Route par `computeRawNetWorth` (source unique) : zéro copie locale de la formule.

const INV: PastInvestBuckets = { CELI: 10_000, CELIAPP: 2_000, REER: 8_000, REEE: 1_000, NonReg: 5_000, Crypto: 3_000 };
const investSum = 10_000 + 2_000 + 8_000 + 1_000 + 5_000 + 3_000; // 29 000

describe('[FUTUR-REAL-HISTORY] pastNetWorthAt', () => {
    it('somme placements + cash + immo − dette (Option A)', () => {
        // 29 000 (placements) + 12 000 (cash) + 40 000 (immo) − 15 000 (dette) = 66 000.
        expect(pastNetWorthAt(INV, 12_000, 40_000, 15_000)).toBe(66_000);
    });

    it('[discriminant] la dette RÉDUIT le patrimoine net exactement de son montant', () => {
        // Le bug d'avant (passé SANS dettes) = ce cas avec dette 0. La soustraction doit faire baisser le NW
        // de EXACTEMENT la dette → sinon le raccord au futur (qui la soustrait) saute.
        const sansDette = pastNetWorthAt(INV, 12_000, 40_000, 0);
        const avecDette = pastNetWorthAt(INV, 12_000, 40_000, 15_000);
        expect(sansDette).toBe(investSum + 12_000 + 40_000); // 81 000, l'ancien comportement gonflé
        expect(sansDette - avecDette).toBe(15_000); // la dette, et rien d'autre
    });

    it('un endetté fauché peut avoir un patrimoine net NÉGATIF (honnête, pas clampé)', () => {
        // Placements/cash faibles, grosse dette → NW < 0 (économiquement correct, no-fake).
        expect(pastNetWorthAt({ CELI: 0, CELIAPP: 0, REER: 0, REEE: 0, NonReg: 500, Crypto: 0 }, 200, 0, 12_000))
            .toBe(-11_300);
    });

    it('immo DÉJÀ net d\'hypothèque (ajouté tel quel, jamais re-soustrait)', () => {
        // Équité immo = 25 000 (déjà nette du prêt) → +25 000, pas de double soustraction.
        expect(pastNetWorthAt({ CELI: 0, CELIAPP: 0, REER: 0, REEE: 0, NonReg: 0, Crypto: 0 }, 0, 25_000, 0))
            .toBe(25_000);
    });

    it('garde NaN héritée de computeRawNetWorth : un terme non fini ne rend PAS tout NaN', () => {
        // computeRawNetWorth rabat un terme non fini sur 0 (garde HARDEN-NETWORTH-NAN) → résultat fini.
        const r = pastNetWorthAt({ ...INV, Crypto: NaN }, 12_000, 40_000, 15_000);
        expect(Number.isFinite(r)).toBe(true);
        // Crypto (3 000) rabattu sur 0 → 66 000 − 3 000 = 63 000.
        expect(r).toBe(63_000);
    });

    it('arrondi au dollar (cohérent avec les points du moteur)', () => {
        expect(pastNetWorthAt({ CELI: 100.4, CELIAPP: 0, REER: 0, REEE: 0, NonReg: 0, Crypto: 0 }, 0.3, 0, 0))
            .toBe(101); // 100.4 + 0.3 = 100.7 → 101
    });
});
