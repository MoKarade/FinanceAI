import { describe, it, expect } from 'vitest';
import { phraseProfilAbime } from '../../services/profilMessages';

describe('phraseProfilAbime', () => {
    it('dit en mots simples que le profil est abîmé, avec son nom', () => {
        expect(phraseProfilAbime('Retraite')).toBe('Le profil « Retraite » est abîmé, impossible de le charger');
    });

    it('ne montre aucun jargon de lecture JSON', () => {
        expect(phraseProfilAbime('A')).not.toMatch(/json|token|position|unexpected/i);
    });
});
