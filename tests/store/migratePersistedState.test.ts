import { describe, it, expect } from 'vitest';
import { migratePersistedState } from '../../store/useFinanceStore';

/**
 * v6 → v7 : garde anti-contamination du mode test. Un blob figé pendant le mode test contenait
 * les données du persona dans les champs vivants + les vraies données dans realDataSnapshot.
 * La migration doit restaurer les vraies données et purger les champs de test, sinon l'utilisateur
 * voit des données de démo après un reload / une restauration Drive (bug Marc 2026-05-29).
 */
describe('migratePersistedState — v6→v7 (mode test jamais persisté)', () => {
    it('restaure les vraies données depuis realDataSnapshot si le blob a été figé en mode test', () => {
        const realRetirement = { targetAge: 60, targetMonthlyIncome: 7000, governmentPension: 1500, lifeExpectancy: 95 };
        const contaminated = {
            transactions: [{ id: 'persona-tx' }],
            retirementGoal: { targetAge: 65, targetMonthlyIncome: 4000, governmentPension: 1200, lifeExpectancy: 90 },
            isTestMode: true,
            activeTestPersonaId: 'diane-robert',
            realDataSnapshot: {
                transactions: [{ id: 'marc-real-tx' }],
                retirementGoal: realRetirement,
            },
        };
        const out = migratePersistedState(contaminated, 6) as Record<string, unknown>;
        expect(out.isTestMode).toBeUndefined();
        expect(out.realDataSnapshot).toBeUndefined();
        expect(out.activeTestPersonaId).toBeUndefined();
        // Les vraies données ont écrasé les données persona.
        expect(out.retirementGoal).toEqual(realRetirement);
        expect(out.transactions).toEqual([{ id: 'marc-real-tx' }]);
    });

    it('purge les champs de test même sans snapshot (sécurité)', () => {
        const out = migratePersistedState(
            { isTestMode: true, realDataSnapshot: null, activeTestPersonaId: 'x', transactions: [] },
            6,
        ) as Record<string, unknown>;
        expect(out.isTestMode).toBeUndefined();
        expect(out.realDataSnapshot).toBeUndefined();
        expect(out.activeTestPersonaId).toBeUndefined();
    });

    it('laisse un blob normal (hors mode test) intact', () => {
        const out = migratePersistedState(
            { transactions: [{ id: 't' }], retirementGoal: { targetAge: 65 } },
            6,
        ) as Record<string, unknown>;
        expect(out.transactions).toEqual([{ id: 't' }]);
        expect(out.retirementGoal).toEqual({ targetAge: 65 });
    });

    it('chaîne les paliers antérieurs (v4 → lifeExpectancy 90) puis purge test (v7)', () => {
        const out = migratePersistedState({ retirementGoal: { targetAge: 65 } }, 4) as Record<string, unknown>;
        const rg = out.retirementGoal as { lifeExpectancy?: number };
        expect(rg.lifeExpectancy).toBe(90);
        expect(out.isTestMode).toBeUndefined();
    });
});
