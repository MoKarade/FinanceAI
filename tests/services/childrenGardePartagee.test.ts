/**
 * [ENG-DIVORCE-CHILDREN-REEE] Garde 50/50 : ce qui suit la GARDE, et ce qui suit `keep`.
 *
 * Décisions de Marc (2026-08-17, `docs/adr/0012-quatre-decisions-de-marc-2026-08-17.md`), en DEUX temps :
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

/**
 * [ENG-DIVORCE-REEE-COTISATIONS] Les COTISATIONS suivent le partage PATRIMONIAL (`keep`).
 *
 * ⚠️ Ce bloc existe parce que la première livraison de ce lot AFFIRMAIT ce comportement dans un
 * commentaire sans l'implémenter : `liquidDeltaReee` ne recevait aucun facteur, donc le déclarant
 * continuait de cotiser la part ENTIÈRE sur un régime réduit de moitié. Finding de revue.
 *
 * ⚠️ Et c'est un flux qui alimente CINQ registres — liquidités, tracker à vie, subventions
 * SCEE/IQEE, solde du REEE, `contribREEE`. Ne réduire que la sortie de liquidités CRÉERAIT de
 * l'argent : le solde créditerait une cotisation que les liquidités n'auraient pas payée. Les
 * tests ci-dessous vérifient donc la COHÉRENCE entre registres, pas seulement le montant.
 */
describe('[ENG-DIVORCE-REEE-COTISATIONS] la part patrimoniale sur les cotisations', () => {
    const cotise = (share?: number) =>
        processOneChild(
            enfant({ initialCost: 0 }), 0, false, 6,
            ctx(share === undefined ? {} : { reeeContribShare: share }), fiscalStub,
        );

    it('part 0,5 ⇒ cotisation DEUX FOIS moindre qu’à part entière', () => {
        const entier = cotise();
        const moitie = cotise(0.5);
        expect(entier.reeeContribAdd, 'scénario vacueux si personne ne cotise').toBeGreaterThan(0);
        // ⚠️ Comparaison sur `liquidDeltaReee`, PAS sur `reeeContribAdd` : ce dernier est ARRONDI
        // (`Math.round`), donc une cotisation impaire se partage en 208 vs 208,5 et un test exact
        // rougirait pour une raison qui n'a rien à voir avec le partage.
        expect(moitie.liquidDeltaReee).toBeCloseTo(entier.liquidDeltaReee / 2, 6);
        expect(moitie.reeeContribAdd).toBeCloseTo(entier.reeeContribAdd / 2, -1);
    });

    // ⚠️ L'assertion qui empêche le mauvais correctif (réduire la seule sortie de liquidités).
    it('la sortie de liquidités et le SOLDE bougent ensemble (aucun argent créé)', () => {
        const r = cotise(0.5);
        const sortie = -r.liquidDeltaReee;         // ce que les liquidités paient
        const entree = r.reeeNewBalance;           // cotisation + subventions, solde initial nul
        expect(sortie).toBeGreaterThan(0);
        // Le solde reçoit la cotisation ET les subventions : il dépasse la sortie, mais il ne peut
        // pas dépasser la cotisation + 60 % de subvention (SCEE 20 % + IQEE 10 % ⇒ marge large).
        expect(entree).toBeGreaterThanOrEqual(sortie);
        expect(entree).toBeLessThanOrEqual(sortie * 1.6);
    });

    it('le tracker à vie n’enregistre que ce qui a VRAIMENT été cotisé', () => {
        const entier = cotise();
        const moitie = cotise(0.5);
        // Sans ça, le plafond ARC de 50 000 $/enfant se consommerait au rythme d'avant divorce.
        expect(moitie.newTrackerReeeContribLifetime).toBeCloseTo(entier.newTrackerReeeContribLifetime / 2, 0);
    });

    it('les SUBVENTIONS suivent la cotisation (elles en sont un pourcentage)', () => {
        const entier = cotise();
        const moitie = cotise(0.5);
        expect(entier.newTrackerScee).toBeGreaterThan(0);
        expect(moitie.newTrackerScee).toBeCloseTo(entier.newTrackerScee / 2, 1);
    });

    // ⚠️ Anti-sur-correctif ET rétrocompat : hors divorce, rien ne doit changer. Un `undefined`
    // (tout appelant d'avant) doit valoir « part entière », pas 0 — sinon la projection de
    // quelqu'un qui n'a jamais divorcé cesserait silencieusement de cotiser au REEE.
    it.each([
        ['champ absent', undefined],
        ['part explicite 1', 1],
    ])('%s ⇒ résultat identique à la version sans partage', (_nom, share) => {
        const ref = cotise();
        const r = cotise(share as number | undefined);
        expect(r.reeeContribAdd).toBe(ref.reeeContribAdd);
        expect(r.liquidDeltaReee).toBe(ref.liquidDeltaReee);
        expect(r.reeeNewBalance).toBe(ref.reeeNewBalance);
    });

    // La partition doit tenir AUSSI sous partage — sinon le correctif casse l'invariant du bloc
    // précédent au lieu de s'y ajouter.
    it('la partition coûts + REEE === liquidDelta tient encore sous partage', () => {
        const r = processOneChild(
            enfant({ carGift: 'usagee' }), 0, true, 0,
            ctx({ reeeContribShare: 0.5 }), fiscalStub,
        );
        expect(r.liquidDeltaCosts + r.liquidDeltaReee).toBeCloseTo(r.liquidDelta, 6);
    });
});
