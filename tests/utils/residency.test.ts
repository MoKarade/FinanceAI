import { describe, it, expect } from 'vitest';
import { getResidencyStartYear, calculateCeliRoom } from '../../utils/tax';

/**
 * Résidence fiscale canadienne → droit de cotisation CELI.
 *
 * Règle ARC : le droit CELI s'accumule à partir du plus tard de {2009, l'année
 * des 18 ans, l'année où l'on devient résident canadien}. Un immigrant arrivé
 * adulte ne récupère donc PAS le droit des années avant son arrivée.
 */
describe('getResidencyStartYear', () => {
    it('non-immigrant : retourne l\'année de naissance (résident depuis toujours)', () => {
        expect(getResidencyStartYear(1985, false, 2018)).toBe(1985);
        expect(getResidencyStartYear(1985, undefined, 2018)).toBe(1985);
        // canadaArrivalYear est ignoré tant que isImmigrant n'est pas vrai.
        expect(getResidencyStartYear(1990, false, 2005)).toBe(1990);
    });

    it('immigrant avec année d\'arrivée : retourne l\'année d\'arrivée', () => {
        expect(getResidencyStartYear(1985, true, 2018)).toBe(2018);
        expect(getResidencyStartYear(1970, true, 2003)).toBe(2003);
    });

    it('immigrant sans année renseignée : retombe sur la naissance (filet sûr)', () => {
        expect(getResidencyStartYear(1985, true, undefined)).toBe(1985);
        expect(getResidencyStartYear(1985, true, 0)).toBe(1985);
    });
});

describe('calculateCeliRoom — non-immigrant vs immigrant', () => {
    // Né en 1985 (a eu 18 ans en 2003, donc droit CELI depuis 2009).
    const BIRTH_YEAR = 1985;
    const CURRENT_YEAR = 2026;

    it('non-immigrant : droit CELI cumulé complet 2009→2026 = 109 000 $', () => {
        const room = calculateCeliRoom(BIRTH_YEAR, getResidencyStartYear(BIRTH_YEAR, false, 2018), CURRENT_YEAR);
        expect(room).toBe(109000);
    });

    it('immigrant arrivé en 2018 : droit CELI seulement depuis 2018 = 57 000 $', () => {
        // 2018:5500 + 2019-22:6000×4 + 2023:6500 + 2024-26:7000×3 = 57 000 $.
        const room = calculateCeliRoom(BIRTH_YEAR, getResidencyStartYear(BIRTH_YEAR, true, 2018), CURRENT_YEAR);
        expect(room).toBe(57000);
    });

    it('un immigrant récent a strictement moins de droit qu\'un non-immigrant du même âge', () => {
        const nonImmigrant = calculateCeliRoom(BIRTH_YEAR, getResidencyStartYear(BIRTH_YEAR, false, 2022), CURRENT_YEAR);
        const immigrant = calculateCeliRoom(BIRTH_YEAR, getResidencyStartYear(BIRTH_YEAR, true, 2022), CURRENT_YEAR);
        expect(immigrant).toBeLessThan(nonImmigrant);
    });

    it('jeune né en 2006 : le droit démarre à ses 18 ans (2024), pas en 2009', () => {
        // Non-immigrant né en 2006 → 18 ans en 2024 → 2024:7000 + 2025:7000 + 2026:7000 = 21 000 $.
        const room = calculateCeliRoom(2006, getResidencyStartYear(2006, false, undefined), CURRENT_YEAR);
        expect(room).toBe(21000);
    });
});
