import { describe, it, expect } from 'vitest';
import { libellePeriode } from '../../../components/budget/pilotage';

// [S5-REFONTE-BUDGET] Libellé du navigateur de période (maquettes : « ‹ sept. 2026 › »).
describe('libellePeriode', () => {
    const maintenant = new Date(2026, 8, 25); // 25 septembre 2026, heure locale

    it('mois : mois abrégé + année, décalé par periodOffset (y compris à travers l\'année)', () => {
        expect(libellePeriode('MONTH', 0, maintenant)).toBe(new Date(2026, 8, 1).toLocaleDateString('fr-CA', { month: 'short', year: 'numeric' }));
        expect(libellePeriode('MONTH', -9, maintenant)).toBe(new Date(2025, 11, 1).toLocaleDateString('fr-CA', { month: 'short', year: 'numeric' }));
    });

    it('trimestre et année', () => {
        expect(libellePeriode('QUARTER', 0, maintenant)).toBe('T3 2026');
        expect(libellePeriode('QUARTER', -3, maintenant)).toBe('T4 2025');
        expect(libellePeriode('YEAR', -1, maintenant)).toBe('2025');
    });
});
