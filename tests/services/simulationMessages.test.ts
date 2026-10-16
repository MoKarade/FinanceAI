import { describe, it, expect } from 'vitest';
import { SIMULATION_ECHEC } from '../../services/simulationMessages';

describe('simulationMessages', () => {
    it('dit en mots simples que la simulation n\'a pas pu finir', () => {
        expect(SIMULATION_ECHEC).toBe("La simulation n'a pas pu finir, réessaie");
    });

    it('ne montre aucun jargon technique', () => {
        expect(SIMULATION_ECHEC).not.toMatch(/worker|error|undefined|null|\bat\b/i);
    });
});
