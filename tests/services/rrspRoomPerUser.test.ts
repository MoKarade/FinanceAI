// tests/services/rrspRoomPerUser.test.ts
//
// [FISC-RRSP-ROOM-PER-USER] — décision Marc A1 (2026-08-20, ADR 0014) : « par personne ».
// Règle ARC : les droits REER se calculent PAR PERSONNE — room_i = min(plafond,
// revenu_gagné_i × 18 %) − FE_i, clampé à 0 par personne, puis sommé. L'ancien calcul
// MÉNAGE (min(cap × N, Σ × 18 %) − ΣFE) accordait le plafond de deux personnes au revenu
// d'une seule. Toutes les valeurs pinnées ici sont MESURÉES (jamais déduites de tête).
import { describe, it, expect } from 'vitest';
import { processJanuaryReset, type JanuaryContext, type JanuaryHelpers } from '../../services/projection/taxJanuary';
import { computeActiveIncome, type ActiveIncomeCtx } from '../../services/projection/activeIncome';
import { RRSP_ANNUAL_LIMITS, calculateFiscalReport } from '../../utils/tax';
import type { FiscalReport } from '../../utils/tax';
import type { ProjectionConfig, User } from '../../types';

const helpers: JanuaryHelpers = {
    RRIF_RATES: { 72: 0.054 },
    calculateFiscalReport: () => ({ marginalRate: 0.30, netIncome: 50000 } as unknown as FiscalReport),
};
const ctx = (o: Partial<JanuaryContext>): JanuaryContext => ({
    m: 12, startYear: 2026, simInflation: 2, age: 40, isRetired: false,
    activeUsersCount: 2, oasClawbackNextPeriod: 0, hasPurchasedPrimary: true,
    celiappOpeningYear: 2026, fhsaEligibleUsersCount: 0,
    users: [{ birthYear: 1986 }, { birthYear: 1988 }],
    celiapp: 0, reer: 0, liquid: 0, nonReg: 0, crypto: 0, celi: 0,
    accGrossIncomeYearByUser: [0, 0], accRetraitsReerYearOld: 0,
    incomeRetirementMonthly: 0, fhsaRoomCurrent: 0, fhsaLifetimeContrib: 0,
    celiRoomCurrent: 0, rrspRoomCurrent: 0, taxCurrentYearGains: 0, prevPortfolioNW: 0,
    loopYear: 2026, reerByUser: [0, 0], ...o,
});
const room = (o: Partial<JanuaryContext>): number => processJanuaryReset(0, ctx(o), helpers)!.rrspRoomDelta;

describe('[FISC-RRSP-ROOM-PER-USER] le room REER est par personne (règle ARC)', () => {
    it('mono-gagnant 250 k$ : le plafond est celui d\'UNE personne, pas de deux', () => {
        const r = room({ accGrossIncomeYearByUser: [250_000, 0] });
        // MESURÉ : min(plafond, 45 000) = le plafond d'UNE personne pour l'année des NOUVEAUX
        // droits — janvier calcule les droits de nextLoopYear (2027 ici, plafond 34 480 $).
        // L'ancien modèle rendait 45 000 (cap × 2 sur le revenu ménage) = +10 520 $/an de
        // droits fantômes (le chiffre du ticket, reproduit au dollar).
        expect(r).toBeCloseTo(RRSP_ANNUAL_LIMITS[2027], 2);
        expect(r).toBeCloseTo(34_480, 2);
        expect(r).not.toBeCloseTo(45_000, 0); // ancre négative : l'ancien calcul ménage
    });

    it('couple équilibré 125/125 : IDENTIQUE à l\'ancien modèle (non-régression)', () => {
        // Les deux sous le plafond → par-personne et ménage coïncident : 2 × 22 500 = 45 000.
        expect(room({ accGrossIncomeYearByUser: [125_000, 125_000] })).toBeCloseTo(45_000, 2);
    });

    it('le FE d\'un conjoint sans revenu ne réduit PLUS le room de l\'autre', () => {
        const r = room({
            accGrossIncomeYearByUser: [100_000, 0],
            users: [{ birthYear: 1986 }, { birthYear: 1988, facteurEquivalence: 8_000 }],
        });
        // MESURÉ : gagnant 100 k$ × 18 % = 18 000 ; conjoint max(0, 0 − 8 000) = 0. L'ancien
        // modèle soustrayait le FE de l'AGRÉGAT : 18 000 − 8 000 = 10 000 (faux, règle ARC).
        expect(r).toBeCloseTo(18_000, 2);
        expect(r).not.toBeCloseTo(10_000, 0); // ancre négative : l'ancien calcul ménage
    });

    it('clamp PAR PERSONNE : un FE supérieur aux droits d\'un conjoint ne devient pas négatif', () => {
        // Conjoint 20 k$ × 18 % = 3 600 < FE 9 000 → SON room est 0 (jamais −5 400 qui
        // mangerait le room de l'autre). Gagnant seul : 180 k$ × 18 % = 32 400.
        const r = room({
            accGrossIncomeYearByUser: [180_000, 20_000],
            users: [{ birthYear: 1986 }, { birthYear: 1988, facteurEquivalence: 9_000 }],
        });
        expect(r).toBeCloseTo(32_400, 2);
    });
});

describe('[FISC-RRSP-ROOM-PER-USER] ventilation du revenu gagné (activeIncome)', () => {
    const proj = {} as unknown as ProjectionConfig;
    const plainUsers: User[] = [{} as unknown as User, {} as unknown as User];
    const aiCtx = (o: Partial<ActiveIncomeCtx> = {}): ActiveIncomeCtx => ({
        m: 0, currentMonthIndex: 6, simSalaryGrowth: 0, enableMonteCarlo: false,
        rng: () => 0.999, incomeMarcNetMonthly: 5000, incomeAnnaNetMonthly: 4000,
        survivorMode: false, grossMarcBaseAnnual: 100_000, grossAnnaBaseAnnual: 80_000,
        unemployedMonthsRemaining: 0, ltdMonthsRemaining: 0, ltdLogged: false,
        loopYear: 2026, simInflation: 2, calculateFiscalReport,
        ...o,
    });

    // ⚠️ [Revue #679] Cette assertion est STRUCTURELLE (les deux grandeurs sortent des mêmes
    // variables dans activeIncome) : elle n'attrape qu'une réécriture de la formule, PAS un
    // échange d'index. La preuve de la ventilation, ce sont les deux tests NOMINATIFS ci-dessous
    // et l'espion de câblage (rrspRoomWiring.test.ts).
    it('Σ(accGrossAddByUser) == accGrossAdd sur les configurations clés', () => {
        const configs: Array<Partial<ActiveIncomeCtx>> = [
            {},
            { survivorMode: true },
            { unemployedMonthsRemaining: 3 },
            { ltdMonthsRemaining: 2 },
            { simSalaryGrowth: 3, m: 30 },
        ];
        for (const c of configs) {
            const r = computeActiveIncome(aiCtx(c), proj, plainUsers);
            expect(r.accGrossAddByUser[0] + r.accGrossAddByUser[1]).toBeCloseTo(r.accGrossAdd, 6);
        }
    });

    it('la ventilation est NOMINATIVE : chômage de Marc → SON brut à 0, celui d\'Anna intact', () => {
        const r = computeActiveIncome(aiCtx({ unemployedMonthsRemaining: 3 }), proj, plainUsers);
        expect(r.accGrossAddByUser[0]).toBeCloseTo(0, 6);
        expect(r.accGrossAddByUser[1]).toBeCloseTo(80_000 / 12, 6);
    });

    it('survivant : le brut d\'Anna est 0, celui de Marc intact', () => {
        const r = computeActiveIncome(aiCtx({ survivorMode: true }), proj, plainUsers);
        expect(r.accGrossAddByUser[0]).toBeCloseTo(100_000 / 12, 6);
        expect(r.accGrossAddByUser[1]).toBeCloseTo(0, 6);
    });
});
