import { describe, it, expect } from 'vitest';
import { shouldShowOnboarding } from '../../utils/onboarding';

describe('shouldShowOnboarding', () => {
    it('vrai 1er lancement (pas de flag, pas de données) → affiche', () => {
        expect(shouldShowOnboarding(null, false)).toBe(true);
    });
    it('onboarding déjà complété (flag posé) → n affiche pas', () => {
        expect(shouldShowOnboarding('true', false)).toBe(false);
    });
    it('données déjà présentes (restauration Drive) → n affiche pas même sans flag', () => {
        // Cas Marc : restore sur nouvel appareil / navigation privée → données mais pas de flag local.
        expect(shouldShowOnboarding(null, true)).toBe(false);
    });
    it('flag + données → n affiche pas', () => {
        expect(shouldShowOnboarding('true', true)).toBe(false);
    });
});
