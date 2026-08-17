/**
 * [ENG-DIVORCE-CHILDREN-REEE] Garde 50/50 : ce qui suit la GARDE, et ce qui suit `keep`.
 *
 * Décisions de Marc (2026-08-17, `docs/decisions.md`), en DEUX temps :
 *   • garde partagée 50/50 ⇒ coûts d'enfants et allocations familiales × 0,5 après divorce ;
 *   • cotisations REEE ⇒ suivent le partage PATRIMONIAL (`keep`), pas la garde.
 *
 * ⚠️ POURQUOI CE FICHIER EXISTE, et pas seulement un test de scénario. `liquidDelta` transportait
 * les DEUX familles mélangées : coûts d'enfants ET flux REEE. Appliquer une part au flux entier
 * aurait divisé par deux les cotisations REEE — un faux, et un faux SILENCIEUX puisque rien ne
 * l'aurait signalé. C'est le motif « un flux alimente PLUSIEURS registres », celui du meltdown REER.
 * D'où la ventilation à la source, et l'invariant de PARTITION ci-dessous.
 */
import { describe, it, expect } from 'vitest';
import { processOneChild, type ChildProcessCtx } from '../../services/projection/childrenReee';
import type { ChildGoal } from '../../types';

const enfant = (o: Partial<ChildGoal> = {}): ChildGoal =>
    ({
        id: 'e1', name: 'Enfant', isActive: true, birthDate: '2026-01-01',
        initialCost: 3_000, monthlyDiapers: 100, daycareType: 'cpe',
        activitiesLevel: 'legeres', universityType: 'uni_local', carGift: 'non',
        reeeMonthly: 200,
        ...o,
    }) as unknown as ChildGoal;

const ctx = (o: Partial<ChildProcessCtx> = {}): ChildProcessCtx =>
    ({
        m: 0, loopYear: 2026, simSalaryGrowth: 0.02, simInflation: 0.02, expenseMultiplier: 1,
        isRetired: false, grossMarcBaseAnnual: 90_000, grossAnnaBaseAnnual: 0, incomeAnna: 0,
        liquid: 100_000, reee: 0, householdGross: 90_000,
        trackerScee: 0, trackerIqee: 0, trackerReeeContribLifetime: 0, enableMonteCarlo: false,
        ...o,
    }) as ChildProcessCtx;

const fiscalStub = (() => ({ totalTax: 0, netIncome: 0 })) as never;

describe('[ENG-DIVORCE-CHILDREN-REEE] la PARTITION de `liquidDelta`', () => {
    // ⚠️ L'invariant qui rend le correctif possible. S'il tombe, appliquer une part de garde
    // devient faux — soit on oublie un flux, soit on en compte un deux fois.
    it.each([
        ['naissance (frais initiaux)', true, 0],
        ['mois ordinaire', false, 6],
        ['18e anniversaire (voiture)', false, 18 * 12],
    ])('%s : coûts + REEE === liquidDelta', (_nom, isFirstMonth, ageMois) => {
        const r = processOneChild(
            enfant({ carGift: 'usagee' }), 0, isFirstMonth as boolean, ageMois as number,
            ctx(), fiscalStub,
        );
        expect(r.liquidDeltaCosts + r.liquidDeltaReee).toBeCloseTo(r.liquidDelta, 6);
    });

    it('les frais de NAISSANCE sont dans la famille COÛTS, pas dans le REEE', () => {
        const r = processOneChild(enfant(), 0, true, 0, ctx(), fiscalStub);
        expect(r.liquidDeltaCosts).toBeLessThan(0);
        // Discriminant : si les frais tombaient dans la mauvaise famille, ils suivraient `keep`
        // au lieu de la garde — et le correctif serait faux sans que rien ne rougisse.
        expect(r.liquidDeltaCosts).toBeLessThanOrEqual(-3_000);
    });

    it('une COTISATION REEE est dans la famille REEE, pas dans les coûts', () => {
        const r = processOneChild(enfant({ initialCost: 0 }), 0, false, 6, ctx(), fiscalStub);
        expect(r.reeeContribAdd, 'le scénario doit VRAIMENT cotiser, sinon le test est vacueux').toBeGreaterThan(0);
        expect(r.liquidDeltaReee).toBeLessThan(0);
        expect(r.liquidDeltaCosts, 'une cotisation REEE n’est pas un coût d’enfant').toBe(0);
    });
});
