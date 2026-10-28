// [HORIZON-ESPERANCE-DE-VIE] La projection de l'app va jusqu'à l'espérance de vie de la personne 1,
// par les DEUX portes qui partent de l'état (écran et serveur MCP).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { avecHorizonEsperanceDeVie, esperanceDeVieEffective, horizonAnnees, HORIZON_MIN_ANNEES } from '../../services/projection/horizon';
import { DEFAULT_LIFE_EXPECTANCY } from '../../services/projection/modelAssumptions';
import { deriveSimulationInputsFromState } from '../../services/projection/buildSimulationParams';
import type { AppState, ProjectionConfig } from '../../types';

describe('horizonAnnees', () => {
    it("va de l'âge de la personne 1 à son espérance de vie", () => {
        expect(horizonAnnees(35, 92)).toBe(57); // persona « Couple à l'aise » : Alex 35 ans
        expect(horizonAnnees(71, 90)).toBe(19);
    });

    it("garde un plancher lisible pour qui a déjà atteint son espérance de vie", () => {
        expect(horizonAnnees(92, 92)).toBe(HORIZON_MIN_ANNEES);
        expect(horizonAnnees(95, 90)).toBe(HORIZON_MIN_ANNEES);
    });

    it('reprend les replis du moteur quand une donnée manque', () => {
        expect(horizonAnnees(undefined, 92)).toBe(92 - 30); // âge de repli du moteur : 30 ans
        expect(horizonAnnees(35, undefined)).toBe(DEFAULT_LIFE_EXPECTANCY - 35);
        expect(horizonAnnees(Number.NaN, Number.NaN)).toBe(DEFAULT_LIFE_EXPECTANCY - 30);
        expect(esperanceDeVieEffective(null)).toBe(DEFAULT_LIFE_EXPECTANCY);
        expect(esperanceDeVieEffective({ lifeExpectancy: 92 })).toBe(92);
    });
});

describe('avecHorizonEsperanceDeVie', () => {
    const projection = { years: 40 } as ProjectionConfig;
    const config = { users: [{ age: 35 }, { age: 33 }] } as unknown as AppState['config'];

    it("remplace l'horizon du curseur, quel qu'il soit", () => {
        expect(avecHorizonEsperanceDeVie(projection, config, { lifeExpectancy: 92 }).years).toBe(57);
        expect(avecHorizonEsperanceDeVie({ ...projection, years: 5 }, config, { lifeExpectancy: 92 }).years).toBe(57);
    });

    it('rend le même objet quand rien ne change (mémos React stables)', () => {
        const p = { years: 57 } as ProjectionConfig;
        expect(avecHorizonEsperanceDeVie(p, config, { lifeExpectancy: 92 })).toBe(p);
    });

    it("s'applique à la porte « état → moteur » du serveur MCP", () => {
        const state = {
            projection: { years: 40 },
            config,
            retirementGoal: { lifeExpectancy: 92 },
        } as unknown as AppState;
        expect(deriveSimulationInputsFromState(state, { startYear: 2026, startMonth: 8 }).projection.years).toBe(57);
    });

    it("s'applique aussi à la porte de l'écran (useSimulationParams)", () => {
        const src = readFileSync('hooks/useSimulationParams.ts', 'utf8');
        expect(src).toContain('projection: avecHorizonEsperanceDeVie(projection, config, retirementGoal)');
    });

    it("le curseur « Horizon (Années) » n'existe plus", () => {
        for (const f of ['components/projection/ProjectionControls.tsx', 'components/projection/ProjectionControlsMobile.tsx']) {
            expect(readFileSync(f, 'utf8')).not.toContain("updateProj('years'");
        }
    });
});
