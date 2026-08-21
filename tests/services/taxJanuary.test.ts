/**
 * Lot 2 — taxJanuary.processJanuaryReset : réinitialisation annuelle de janvier
 * (plafonds CELI/FHSA/REER, FERR 72+, fermeture CELIAPP, Guyton-Klinger).
 * Sans test direct. `RRIF_RATES` et `calculateFiscalReport` sont injectés → on
 * les STUB pour des montants exacts indépendants des tables fiscales réelles.
 */
import { describe, it, expect } from 'vitest';
import {
    processJanuaryReset,
    type JanuaryContext,
    type JanuaryHelpers,
} from '../../services/projection/taxJanuary';
import { CELI_ANNUAL_LIMITS, type FiscalReport } from '../../utils/tax';

const helpers: JanuaryHelpers = {
    RRIF_RATES: { 72: 0.054, 80: 0.0682 },
    // marginalRate est un DÉCIMAL dans le vrai moteur (0.30 = 30%), cf. getMarginalRate.
    calculateFiscalReport: () => ({ marginalRate: 0.30, netIncome: 50000 } as unknown as FiscalReport),
};

const baseCtx = (o: Partial<JanuaryContext> = {}): JanuaryContext => {
    const reer = o.reer ?? 100000;
    return {
        m: 12, startYear: 2026, simInflation: 2, age: 40, isRetired: false,
        activeUsersCount: 1, oasClawbackNextPeriod: 0, hasPurchasedPrimary: false,
        celiappOpeningYear: 2026, fhsaEligibleUsersCount: 1,
        users: [{ birthYear: 1986 }],
        celiapp: 0, reer, liquid: 50000, nonReg: 0, crypto: 0, celi: 0,
        accRetraitsReerYearOld: 0, incomeRetirementMonthly: 0,
        fhsaRoomCurrent: 0, fhsaLifetimeContrib: 0, celiRoomCurrent: 0, rrspRoomCurrent: 0,
        taxCurrentYearGains: 0, prevPortfolioNW: 0, loopYear: 2027,
        ...o,
        // [ITEM-2C] registre per-conjoint : 1 conjoint par défaut = pool entier (FERR per-user == ancien calcul).
        reerByUser: o.reerByUser ?? [reer],
        // [FISC-RRSP-ROOM-PER-USER] solo par défaut : tout le revenu gagné à l'index 0.
        accGrossIncomeYearByUser: o.accGrossIncomeYearByUser ?? [80000, 0],
    };
};

describe('processJanuaryReset — gate « uniquement en janvier, m>0 »', () => {
    it('mois ≠ janvier → null', () => {
        expect(processJanuaryReset(5, baseCtx(), helpers)).toBeNull();
    });
    it('janvier mais m === 0 (tout premier mois) → null', () => {
        expect(processJanuaryReset(0, baseCtx({ m: 0 }), helpers)).toBeNull();
    });
    it('janvier avec m > 0 → résultat non-null', () => {
        expect(processJanuaryReset(0, baseCtx(), helpers)).not.toBeNull();
    });
});

describe('processJanuaryReset — plafonds CELI / REER', () => {
    it('adulte éligible : droit CELI annuel positif', () => {
        const r = processJanuaryReset(0, baseCtx(), helpers)!;
        expect(r.celiRoomDelta).toBeGreaterThan(0);
    });
    it('mineur : aucun droit CELI', () => {
        const r = processJanuaryReset(0, baseCtx({ users: [{ birthYear: 2020 }] }), helpers)!;
        expect(r.celiRoomDelta).toBe(0);
    });
    it('REER : droit positif avant 71 ans, remis à zéro après', () => {
        const young = processJanuaryReset(0, baseCtx({ age: 40 }), helpers)!;
        expect(young.rrspRoomReset).toBe(false);
        expect(young.rrspRoomDelta).toBeGreaterThan(0);
        const old = processJanuaryReset(0, baseCtx({ age: 75 }), helpers)!;
        expect(old.rrspRoomReset).toBe(true);
        expect(old.rrspRoomDelta).toBe(0);
    });
});

describe('processJanuaryReset — FERR (retrait minimum à 72+)', () => {
    it('avant 72 ans : aucun FERR', () => {
        const r = processJanuaryReset(0, baseCtx({ age: 65 }), helpers)!;
        expect(r.ferrMandatoryGross).toBe(0);
        expect(r.ferrLogMsg).toBeUndefined();
    });
    it('à 71 ans : AUCUN retrait minimum forcé (régression — règle ARC, choix Marc 2026-06)', () => {
        // Verrou anti-régression : un FERR ouvert à l'échéance des 71 ans n'a aucun retrait minimum
        // l'année d'ouverture. Le gate DOIT rester >= 72 (un commit l'avait passé à 71 → corrigé).
        const r = processJanuaryReset(0, baseCtx({ age: 71, reer: 100000 }), helpers)!;
        expect(r.ferrMandatoryGross).toBe(0);
        expect(r.ferrTaxOnRrif).toBe(0);
        expect(r.ferrLogMsg).toBeUndefined();
    });
    it('à 72 ans : brut = REER × taux RRIF, impôt = brut × taux marginal stubé', () => {
        const r = processJanuaryReset(0, baseCtx({ age: 72, reer: 100000 }), helpers)!;
        expect(r.ferrMandatoryGross).toBeCloseTo(100000 * 0.054, 5); // 5400
        expect(r.ferrTaxOnRrif).toBeCloseTo(5400 * 0.3, 5); // 5400 × marginalRate(0.30 décimal), SANS /100
        expect(r.ferrLogMsg).toBeDefined();
    });
    it('[ITEM-2C] couple à écart d\'âge : seul le conjoint 72+ convertit SA part (l\'autre = 0)', () => {
        // user0 = ctx.age 72 (convertit) ; conjoint = 68 (67 + 1 an écoulé) < 72 (ne convertit pas).
        const r = processJanuaryReset(0, baseCtx({
            age: 72, reer: 100000, activeUsersCount: 2,
            users: [{ birthYear: 1955 }, { age: 67 }], reerByUser: [60000, 40000],
        }), helpers)!;
        expect(r.ferrGrossByUser).toHaveLength(2);
        expect(r.ferrGrossByUser[0]).toBeCloseTo(60000 * 0.054, 5); // 3240 (user0 = 72)
        expect(r.ferrGrossByUser[1]).toBe(0);                       // conjoint 68 < 72
        expect(r.ferrMandatoryGross).toBeCloseTo(3240, 5);
        // Cohérence registre/pool : Σ(parts) == total ménage.
        expect(r.ferrGrossByUser.reduce((s, v) => s + v, 0)).toBeCloseTo(r.ferrMandatoryGross, 9);
    });
    it('[ITEM-2C] deux conjoints 72+ : Σ des parts == REER × taux (additif = ancien calcul ménage)', () => {
        const r = processJanuaryReset(0, baseCtx({
            age: 72, reer: 100000, activeUsersCount: 2,
            users: [{ birthYear: 1955 }, { age: 71 }], reerByUser: [60000, 40000], // conjoint 71 + 1 = 72
        }), helpers)!;
        expect(r.ferrGrossByUser[0]).toBeCloseTo(60000 * 0.054, 5);
        expect(r.ferrGrossByUser[1]).toBeCloseTo(40000 * 0.054, 5);
        expect(r.ferrMandatoryGross).toBeCloseTo(100000 * 0.054, 5); // == ancien calcul ménage (défaut additif)
    });
});

describe('processJanuaryReset — FA-4 (audit 2026-06-09) : plafond CELI = source unique CELI_ANNUAL_LIMITS', () => {
    // RÉGRESSION FA-4 : l'ancien recalcul local (7000 × inflation, arrondi 500 $) donnait
    // 7 000 $ en 2027 alors que CELI_ANNUAL_LIMITS (FISCAL_REFERENCE §7) dit 7 500 $
    // (divergence code↔doc). Le moteur doit LIRE la table pour les années connues, puis
    // extrapoler au-delà : dernière valeur connue × (1+simInflation)^Δans, arrondie au 500 $.
    // Rappel mécanique : nextLoopYear = startYear + floor(m/12) ; 1 adulte éligible
    // → celiRoomDelta == plafond individuel de l'année.

    it('2026 (année connue) → 7 000 $ lu de la table', () => {
        expect(CELI_ANNUAL_LIMITS[2026]).toBe(7000); // prémisse explicite (FISCAL_REFERENCE §7)
        const r = processJanuaryReset(0, baseCtx({ startYear: 2025, m: 12 }), helpers)!;
        expect(r.celiRoomDelta).toBe(7000);
    });

    it('RÉGRESSION 2027 → 7 500 $ lu de CELI_ANNUAL_LIMITS, PAS 7000×inflation', () => {
        expect(CELI_ANNUAL_LIMITS[2027]).toBe(7500); // prémisse explicite
        const r = processJanuaryReset(0, baseCtx({ startYear: 2026, m: 12, simInflation: 2 }), helpers)!;
        expect(r.celiRoomDelta).toBe(7500);
        // Contre-preuve du bug d'avant : 7000×1,02 = 7140 → arrondi 500 $ = 7 000 ≠ 7 500.
        expect(Math.round((7000 * 1.02) / 500) * 500).toBe(7000);
    });

    it('années CONNUES : le plafond ne dépend PAS de simInflation (source unique)', () => {
        const at0 = processJanuaryReset(0, baseCtx({ startYear: 2026, m: 12, simInflation: 0 }), helpers)!;
        const at8 = processJanuaryReset(0, baseCtx({ startYear: 2026, m: 12, simInflation: 8 }), helpers)!;
        expect(at0.celiRoomDelta).toBe(7500);
        expect(at8.celiRoomDelta).toBe(7500);
    });

    it('2030 (dernière année connue de la table) → valeur de la table', () => {
        const r = processJanuaryReset(0, baseCtx({ startYear: 2026, m: 48, simInflation: 2 }), helpers)!;
        expect(r.celiRoomDelta).toBe(CELI_ANNUAL_LIMITS[2030]); // 7 500
    });

    it('extrapolation 2031 @ 2 % : 7500×1,02 = 7 650 → arrondi 500 $ = 7 500 (continuité à la frontière)', () => {
        const r = processJanuaryReset(0, baseCtx({ startYear: 2026, m: 60, simInflation: 2 }), helpers)!;
        expect(r.celiRoomDelta).toBe(7500);
    });

    it('extrapolation 2035 @ 2 % : 7500×1,02^5 ≈ 8 280,61 → arrondi 500 $ = 8 500', () => {
        const r = processJanuaryReset(0, baseCtx({ startYear: 2026, m: 108, simInflation: 2 }), helpers)!;
        expect(r.celiRoomDelta).toBe(8500);
    });

    it('extrapolation à inflation NULLE → reste 7 500 $ (aucune dérive)', () => {
        const r = processJanuaryReset(0, baseCtx({ startYear: 2026, m: 108, simInflation: 0 }), helpers)!;
        expect(r.celiRoomDelta).toBe(7500);
    });

    it('extrapolation en DÉFLATION (-2 %) : 7500×0,98^5 ≈ 6 779 → arrondi 500 $ = 7 000', () => {
        const r = processJanuaryReset(0, baseCtx({ startYear: 2026, m: 108, simInflation: -2 }), helpers)!;
        expect(r.celiRoomDelta).toBe(7000);
    });

    it('couple : 2 adultes éligibles → 2 × plafond (2027 → 15 000 $)', () => {
        const r = processJanuaryReset(0, baseCtx({
            startYear: 2026, m: 12, activeUsersCount: 2,
            users: [{ birthYear: 1986 }, { birthYear: 1988 }],
        }), helpers)!;
        expect(r.celiRoomDelta).toBe(15000);
    });
});

describe('processJanuaryReset — CELIAPP & Guyton-Klinger', () => {
    it('fermeture CELIAPP après 15 ans : solde transféré au REER', () => {
        const r = processJanuaryReset(0, baseCtx({ celiappOpeningYear: 2010, celiapp: 8000 }), helpers)!;
        expect(r.celiappTransferToReer).toBe(8000);
        expect(r.logs.some(l => l.includes('CELIAPP'))).toBe(true);
    });
    it('Guyton-Klinger LISSÉ : baisse ≥ 5 % → gel total (facteur 0), extrême identique à l\'ancien', () => {
        // portefeuille courant = 50k + 0 + 100k = 150k ; précédent 200k → −25 % ≥ 5 % → facteur 0.
        const r = processJanuaryReset(0, baseCtx({ isRetired: true, m: 24, prevPortfolioNW: 200000 }), helpers)!;
        expect(r.guytonKlingerIndexationFactor).toBe(0);
        expect(r.newPrevPortfolioNW).toBe(150000);
    });
    it('[ENG-GK-THRESHOLD-KNIFE] le seuil n\'est plus un couteau : bande continue −4 %/−6 %', () => {
        // Baisse de 5 % pile (l'ancien POINT du couteau) → facteur 0,5 : le milieu de la bande.
        const r = processJanuaryReset(0, baseCtx({ isRetired: true, m: 24, prevPortfolioNW: 150000 / 0.95 }), helpers)!;
        expect(r.guytonKlingerIndexationFactor).toBeCloseTo(0.5, 6);
        // Continuité au voisinage de l'ancien seuil (l'ancien code sautait de 1 à 0 ici) :
        const juste = processJanuaryReset(0, baseCtx({ isRetired: true, m: 24, prevPortfolioNW: 150000 / 0.9501 }), helpers)!;
        const presque = processJanuaryReset(0, baseCtx({ isRetired: true, m: 24, prevPortfolioNW: 150000 / 0.9499 }), helpers)!;
        expect(Math.abs(juste.guytonKlingerIndexationFactor - presque.guytonKlingerIndexationFactor)).toBeLessThan(0.02);
    });
    it('portefeuille précédent NÉGATIF ou corrompu → indexation pleine (pas de gel insensé)', () => {
        // [Revue #683 F1] L'ancien binaire pouvait geler sur un prev négatif (division par un
        // négatif) — dénué de sens ; le facteur est désormais 1 dans ces cas, et l'affirmation
        // « identique hors bande » est BORNÉE à prev > 0 fini.
        const neg = processJanuaryReset(0, baseCtx({ isRetired: true, m: 24, prevPortfolioNW: -100000 }), helpers)!;
        expect(neg.guytonKlingerIndexationFactor).toBe(1);
    });
    it('LOIN du seuil : comportement strictement identique à l\'ancien binaire (bande étroite, prev > 0)', () => {
        // Baisse 3 % (< 4 %) → indexation PLEINE, comme l'ancien code sous son seuil.
        const doux = processJanuaryReset(0, baseCtx({ isRetired: true, m: 24, prevPortfolioNW: 150000 / 0.97 }), helpers)!;
        expect(doux.guytonKlingerIndexationFactor).toBe(1);
        // Hausse → pleine aussi.
        const up = processJanuaryReset(0, baseCtx({ isRetired: true, m: 24, prevPortfolioNW: 140000 }), helpers)!;
        expect(up.guytonKlingerIndexationFactor).toBe(1);
    });
    it('réduction PSV mensualisée = clawback annuel / 12', () => {
        const r = processJanuaryReset(0, baseCtx({ oasClawbackNextPeriod: 1200 }), helpers)!;
        expect(r.monthlyOasReduction).toBe(100);
    });
});
