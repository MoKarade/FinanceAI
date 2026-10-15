import { describe, it, expect } from 'vitest';
import { SAUVEGARDE_INVALIDE } from '../../services/backupMessages';

describe('backupMessages', () => {
    it('dit en mots simples que le fichier n\'est pas une sauvegarde valide', () => {
        expect(SAUVEGARDE_INVALIDE).toBe("Ce fichier n'est pas une sauvegarde FinanceAI valide");
    });

    it('ne montre ni chemin technique ni jargon de validation', () => {
        expect(SAUVEGARDE_INVALIDE).not.toMatch(/[.:()]|schema|zod|undefined/i);
    });
});
