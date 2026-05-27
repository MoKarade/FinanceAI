// tests/services/pdfScenarios.test.ts
// T3 — Tests unitaires de buildScenariosRows (builder pur, aucune dépendance jsPDF).

import { describe, it, expect } from 'vitest';
import { buildScenariosRows } from '../../services/pdfReport';
import type { ProjectionResult } from '../../services/projection/types';

const makeResult = (overrides: Partial<ProjectionResult> = {}): ProjectionResult => ({
    chartData: [],
    strategyName: 'AUTO_MARGINAL',
    stratType: 'BASE',
    finalNetWorth: 1_000_000,
    estateNetWorth: 800_000,
    fvi: 85,
    successRate: 92,
    gainVsAuto: 0,
    pros: ['Optimise les cotisations CELI/REER', 'Réduit les impôts sur le revenu'],
    cons: ['Moins flexible en cas de changement de revenu'],
    ...overrides,
});

describe('buildScenariosRows', () => {
    it('mappe un résultat unique correctement', () => {
        const rows = buildScenariosRows([makeResult()], 0);
        expect(rows).toHaveLength(1);
        const r = rows[0];
        expect(r.strategyName).toBe('AUTO_MARGINAL');
        expect(r.stratType).toBe('BASE');
        expect(r.finalNetWorth).toBe(1_000_000);
        expect(r.estateNetWorth).toBe(800_000);
        expect(r.fvi).toBe(85);
        expect(r.successRate).toBe(92);
        expect(r.gainVsAuto).toBe(0);
        expect(r.isBest).toBe(true);
        expect(r.pros).toHaveLength(2);
        expect(r.cons).toHaveLength(1);
    });

    it('marque isBest=false quand bestIdx ne correspond pas', () => {
        const rows = buildScenariosRows([makeResult()], 1);
        expect(rows[0].isBest).toBe(false);
    });

    it('marque isBest=false quand bestIdx est absent', () => {
        const rows = buildScenariosRows([makeResult()]);
        expect(rows[0].isBest).toBe(false);
    });

    it('filtre les entrées sans strategyName ni stratType', () => {
        const blank: ProjectionResult = { chartData: [], strategyName: '', stratType: '' };
        const rows = buildScenariosRows([blank, makeResult()]);
        expect(rows).toHaveLength(1);
        expect(rows[0].strategyName).toBe('AUTO_MARGINAL');
    });

    it('remplace undefined/null par des valeurs par défaut sûres', () => {
        const r = makeResult({
            finalNetWorth: undefined,
            estateNetWorth: undefined,
            fvi: null,
            successRate: null,
            gainVsAuto: undefined as unknown as number,
            pros: undefined,
            cons: undefined,
        });
        const rows = buildScenariosRows([r]);
        expect(rows[0].finalNetWorth).toBe(0);
        expect(rows[0].estateNetWorth).toBe(0);
        expect(rows[0].fvi).toBeNull();
        expect(rows[0].successRate).toBeNull();
        expect(rows[0].gainVsAuto).toBeNull();
        expect(rows[0].pros).toEqual([]);
        expect(rows[0].cons).toEqual([]);
    });

    it('tronque pros/cons à 2 entrées chacun', () => {
        const r = makeResult({
            pros: ['P1', 'P2', 'P3', 'P4'],
            cons: ['C1', 'C2', 'C3'],
        });
        const rows = buildScenariosRows([r]);
        expect(rows[0].pros).toHaveLength(2);
        expect(rows[0].cons).toHaveLength(2);
    });

    it('identifie correctement le meilleur parmi plusieurs scénarios', () => {
        const results = [
            makeResult({ strategyName: 'A', stratType: 'BASE' }),
            makeResult({ strategyName: 'B', stratType: 'PRIO_REER' }),
            makeResult({ strategyName: 'C', stratType: 'PRIO_CELI' }),
        ];
        const rows = buildScenariosRows(results, 1);
        expect(rows[0].isBest).toBe(false);
        expect(rows[1].isBest).toBe(true);
        expect(rows[2].isBest).toBe(false);
    });

    it('renvoie tableau vide pour allResults vide', () => {
        expect(buildScenariosRows([])).toEqual([]);
    });
});
