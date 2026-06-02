import { describe, it, expect } from 'vitest';
import { SCENARIO_DEFINITIONS } from '../../services/projection/scenarios';

// Tests d'INTÉGRITÉ du catalogue de scénarios (« Avenirs de Vie »). Ils n'exécutent
// pas le moteur : ils garantissent qu'aucun scénario malformé ne casse l'UI (labels,
// pros/cons des cartes) ni l'optimiseur — qui ne classe QUE les scénarios kind='strategy'
// (les façons de gérer en monde réaliste BASE), jamais les stress-tests de monde.

describe('scenarios — intégrité du catalogue SCENARIO_DEFINITIONS', () => {
    it('chaque scénario a tous les champs requis, non vides', () => {
        expect(SCENARIO_DEFINITIONS.length).toBeGreaterThan(0);
        for (const s of SCENARIO_DEFINITIONS) {
            expect(s.stratType.length).toBeGreaterThan(0);
            expect(s.strategy.length).toBeGreaterThan(0);
            expect(s.strategyName.trim().length).toBeGreaterThan(0);
            expect(s.stratDescription.trim().length).toBeGreaterThan(0);
            expect(s.icon.length).toBeGreaterThan(0);
            expect(typeof s.delayPensions).toBe('boolean');
        }
    });

    it('chaque scénario a au moins un pro ET un con (cartes UI)', () => {
        for (const s of SCENARIO_DEFINITIONS) {
            expect(Array.isArray(s.pros)).toBe(true);
            expect(Array.isArray(s.cons)).toBe(true);
            expect(s.pros.length).toBeGreaterThan(0);
            expect(s.cons.length).toBeGreaterThan(0);
            expect(s.pros.every((p) => p.trim().length > 0)).toBe(true);
            expect(s.cons.every((c) => c.trim().length > 0)).toBe(true);
        }
    });

    it('les noms de stratégie (labels UI) sont uniques', () => {
        const names = SCENARIO_DEFINITIONS.map((s) => s.strategyName);
        expect(new Set(names).size).toBe(names.length);
    });

    it('contient exactement un cas de base canonique (BASE + AUTO_MARGINAL), classé strategy', () => {
        const base = SCENARIO_DEFINITIONS.filter((s) => s.stratType === 'BASE' && s.strategy === 'AUTO_MARGINAL');
        expect(base.length).toBe(1);
        expect(base[0].kind).toBe('strategy');
    });

    it("les scénarios comparés par l'optimiseur (kind='strategy') sont tous en monde BASE", () => {
        const strategies = SCENARIO_DEFINITIONS.filter((s) => s.kind === 'strategy');
        expect(strategies.length).toBeGreaterThanOrEqual(2);
        expect(strategies.every((s) => s.stratType === 'BASE')).toBe(true);
    });

    it("les stress-tests (kind ≠ 'strategy') existent et ne sont jamais classés strategy", () => {
        // Les mondes catastrophe (inflation, hiver économique…) ne doivent pas polluer le
        // classement « meilleure façon de gérer » de l'optimiseur.
        const stress = SCENARIO_DEFINITIONS.filter((s) => s.kind !== 'strategy');
        expect(stress.length).toBeGreaterThan(0);
        expect(stress.some((s) => s.stratType === 'HYPER_INFLATION')).toBe(true);
        expect(stress.every((s) => s.kind !== 'strategy')).toBe(true);
    });
});
