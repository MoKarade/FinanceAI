// PH4-FUT-B — levier « profil de rendement » : helper pur returnRatesForProfile + presets.
// Unitaire, sans moteur : on vérifie le mapping profil → returnRates et l'identité de
// référence (non-régression : 'balanced'/undefined ne doit JAMAIS cloner/altérer les taux).
import { describe, it, expect } from 'vitest';
import {
    returnRatesForProfile,
    RETURN_RATE_PRESETS,
} from '../../services/projection/strategyConfig';
import type { ProjectionConfig } from '../../types';

type ReturnRates = NonNullable<ProjectionConfig['returnRates']>;

// Taux « édités à la main » distincts du défaut constants.ts ET des deux presets,
// pour prouver que 'balanced' renvoie EXACTEMENT cet objet (même référence) et non un preset.
const baseRates: ReturnRates = { celi: 7, reer: 6.5, nonReg: 6.5, crypto: 10, cash: 3 };

describe('PH4-FUT-B — returnRatesForProfile', () => {
    it("'conservative' → preset conservateur (référence du preset, valeurs exactes)", () => {
        const r = returnRatesForProfile('conservative', baseRates);
        expect(r).toBe(RETURN_RATE_PRESETS.conservative); // même objet preset
        expect(r).toEqual({ celi: 4.5, reer: 4.5, nonReg: 4.5, crypto: 6, cash: 3 });
    });

    it("'aggressive' → preset agressif (référence du preset, valeurs exactes)", () => {
        const r = returnRatesForProfile('aggressive', baseRates);
        expect(r).toBe(RETURN_RATE_PRESETS.aggressive);
        expect(r).toEqual({ celi: 9, reer: 8.5, nonReg: 8.5, crypto: 14, cash: 3 });
    });

    it("'balanced' → baseRates INCHANGÉS (MÊME référence, zéro copie)", () => {
        const r = returnRatesForProfile('balanced', baseRates);
        expect(r).toBe(baseRates); // identité stricte = non-régression + respecte l'édition manuelle
    });

    it('undefined → baseRates INCHANGÉS (même référence)', () => {
        const r = returnRatesForProfile(undefined, baseRates);
        expect(r).toBe(baseRates);
    });

    it("baseRates undefined + 'balanced' → undefined (pas de fabrication de taux)", () => {
        expect(returnRatesForProfile('balanced', undefined)).toBeUndefined();
    });

    it("baseRates undefined + undefined → undefined", () => {
        expect(returnRatesForProfile(undefined, undefined)).toBeUndefined();
    });

    it("baseRates undefined + 'conservative'/'aggressive' → preset (le preset ne dépend pas de baseRates)", () => {
        // Frontière : même sans taux de base, un profil presetté retourne son preset.
        expect(returnRatesForProfile('conservative', undefined)).toBe(RETURN_RATE_PRESETS.conservative);
        expect(returnRatesForProfile('aggressive', undefined)).toBe(RETURN_RATE_PRESETS.aggressive);
    });

    it('presets : agressif domine conservateur compte par compte (sauf cash, neutre à 3)', () => {
        const c = RETURN_RATE_PRESETS.conservative;
        const a = RETURN_RATE_PRESETS.aggressive;
        expect(a.celi).toBeGreaterThan(c.celi);
        expect(a.reer).toBeGreaterThan(c.reer);
        expect(a.nonReg).toBeGreaterThan(c.nonReg);
        expect(a.crypto).toBeGreaterThan(c.crypto);
        expect(a.cash).toBe(c.cash); // cash = liquidités, neutre au profil (3 % dans les deux)
    });

    it('le helper ne mute jamais baseRates (entrée intacte après appel)', () => {
        const input: ReturnRates = { celi: 7, reer: 6.5, nonReg: 6.5, crypto: 10, cash: 3 };
        const snapshot = { ...input };
        returnRatesForProfile('conservative', input);
        returnRatesForProfile('aggressive', input);
        returnRatesForProfile('balanced', input);
        expect(input).toEqual(snapshot);
    });
});
