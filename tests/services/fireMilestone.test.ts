// tests/services/fireMilestone.test.ts
//
// [FUTUR-FIRE-STRUCT] Jalon FIRE STRUCTUREL : la condition est celle du moteur (NetWorth ≥ FireTarget
// du mois), le libellé n'est plus qu'un texte d'affichage. Garde la constante partagée avec
// l'émetteur (services/projection.ts) pour qu'un renommage du libellé ne laisse pas deux vérités.

import { describe, it, expect } from 'vitest';
import { FIRE_LIFE_EVENT, isFireReached, findFireReachedPoint } from '../../services/projection/fireMilestone';

describe('fireMilestone', () => {
    it('cible atteinte (NetWorth ≥ FireTarget > 0) → true ; en dessous → false', () => {
        expect(isFireReached({ NetWorth: 500_000, FireTarget: 480_000 })).toBe(true);
        expect(isFireReached({ NetWorth: 480_000, FireTarget: 480_000 })).toBe(true); // égalité = atteint
        expect(isFireReached({ NetWorth: 479_999, FireTarget: 480_000 })).toBe(false);
    });

    it('cible absente ou nulle (objectif non configuré) → JAMAIS de jalon, même patrimoine positif', () => {
        expect(isFireReached({ NetWorth: 1_000_000 })).toBe(false);
        expect(isFireReached({ NetWorth: 1_000_000, FireTarget: 0 })).toBe(false);
    });

    it('NetWorth non fini → false (aucun jalon deviné — no-fake-data)', () => {
        expect(isFireReached({ NetWorth: NaN, FireTarget: 480_000 })).toBe(false);
    });

    it('findFireReachedPoint → PREMIER croisement dans l\'ordre du tableau, sinon undefined', () => {
        const pts = [
            { NetWorth: 100_000, FireTarget: 480_000 },
            { NetWorth: 500_000, FireTarget: 480_000 },
            { NetWorth: 900_000, FireTarget: 490_000 },
        ];
        expect(findFireReachedPoint(pts)).toBe(pts[1]);
        expect(findFireReachedPoint([{ NetWorth: 10, FireTarget: 480_000 }])).toBeUndefined();
        expect(findFireReachedPoint([])).toBeUndefined();
    });

    it('le libellé du lifeEvent reste la constante partagée avec le moteur', () => {
        expect(FIRE_LIFE_EVENT).toBe('Objectif FIRE Atteint 🔥');
    });
});
