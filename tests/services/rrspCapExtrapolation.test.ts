// tests/services/rrspCapExtrapolation.test.ts
//
// [FISC-RRSP-EXTRAP-05] Le plafond REER au-delà du barème connu.
//
// Deux choses distinctes vivent dans la même ligne de code, et le ticket n'en nommait qu'une :
//  1. la VITESSE d'extrapolation (`inflation + 0,5 pp`) — une hypothèse de MODÈLE, pas une valeur
//     sourcée ; documentée comme telle dans `docs/FISCAL_REFERENCE.md` §7 ;
//  2. l'ANCRE depuis laquelle on compose — c'était le littéral `2026` alors que la table va
//     jusqu'à 2030. MESURÉ à inflation 2 % : la couture 2030 → 2031 sautait de 36 590 $ à
//     38 252,91 $, soit **+4,54 % en une année** contre les ≈ 2 %/an appliqués de part et d'autre.
//     Ancrée sur la dernière année connue : 37 504,75 $, soit exactement +2,50 % (= 2 + 0,5).
//
// Toutes les valeurs ci-dessous sont MESURÉES, jamais déduites de tête.
import { describe, it, expect } from 'vitest';
import { processJanuaryReset, type JanuaryContext, type JanuaryHelpers } from '../../services/projection/taxJanuary';
import { RRSP_ANNUAL_LIMITS, LAST_KNOWN_RRSP_YEAR } from '../../utils/tax';
import type { FiscalReport } from '../../utils/tax';

const helpers: JanuaryHelpers = {
    RRIF_RATES: { 72: 0.054 },
    calculateFiscalReport: () => ({ marginalRate: 0.30, netIncome: 50_000 } as unknown as FiscalReport),
};

/** Revenu volontairement ÉNORME : il faut que le PLAFOND soit la contrainte qui mord, sinon la
 *  mesure porte sur « 18 % du revenu » et ne dit rien de l'extrapolation (anti-vacuité vérifiée
 *  explicitement dans le premier test). */
const REVENU_QUI_SATURE = 900_000;

const ctx = (o: Partial<JanuaryContext>): JanuaryContext => ({
    m: 12, startYear: 2026, simInflation: 2, age: 40, isRetired: false,
    activeUsersCount: 1, oasClawbackNextPeriod: 0, hasPurchasedPrimary: true,
    celiappOpeningYear: 2026, fhsaEligibleUsersCount: 0,
    users: [{ birthYear: 1986 }, { birthYear: 1988 }],
    celiapp: 0, reer: 0, liquid: 0, nonReg: 0, crypto: 0, celi: 0,
    accGrossIncomeYearByUser: [0, 0], accRetraitsReerYearOld: 0,
    incomeRetirementMonthly: 0, fhsaRoomCurrent: 0, fhsaLifetimeContrib: 0,
    celiRoomCurrent: 0, rrspRoomCurrent: 0, taxCurrentYearGains: 0, prevPortfolioNW: 0,
    loopYear: 2026, reerByUser: [0, 0], ...o,
} as JanuaryContext);

/** Droits ouverts POUR l'année `an` (janvier calcule ceux de l'année qui commence). */
const plafond = (an: number, inflation = 2): number =>
    processJanuaryReset(0, ctx({
        m: (an - 2026) * 12, simInflation: inflation,
        // Tuple à DEUX places (le type l'exige) : le conjoint sans revenu n'ouvre aucun droit,
        // donc la mesure porte bien sur le plafond du premier.
        accGrossIncomeYearByUser: [REVENU_QUI_SATURE, 0],
    }), helpers)!.rrspRoomDelta;

describe('[FISC-RRSP-EXTRAP-05] plafond REER hors barème', () => {
    it('le plafond MORD vraiment (sinon toutes les mesures qui suivent sont vides)', () => {
        // 18 % de 900 k$ = 162 000 $ : très au-dessus de tout plafond de la table ou extrapolé.
        expect(REVENU_QUI_SATURE * 0.18).toBeGreaterThan(100_000);
        expect(plafond(2030)).toBeCloseTo(RRSP_ANNUAL_LIMITS[2030], 2);
        expect(plafond(2030)).toBeLessThan(REVENU_QUI_SATURE * 0.18);
    });

    it('la couture entre la dernière année tabulée et la première extrapolée est CONTINUE', () => {
        const derniere = plafond(LAST_KNOWN_RRSP_YEAR);
        const premiere = plafond(LAST_KNOWN_RRSP_YEAR + 1);
        // Le pas vaut exactement la vitesse du modèle : inflation (2 %) + la prime (0,5 pp).
        expect(premiere / derniere).toBeCloseTo(1.025, 6);
        expect(premiere).toBeCloseTo(37_504.75, 2);
        // Ancre négative : l'ancien ancrage (littéral 2026) donnait 38 252,91 $, soit +4,54 % en
        // une seule année — une marche que rien dans la règle ne justifie.
        expect(premiere).not.toBeCloseTo(38_252.91, 2);
    });

    it('l\'extrapolation suit l\'inflation SIMULÉE, et les années tabulées n\'y touchent pas', () => {
        // Le levier change ce qu'il doit changer…
        expect(plafond(LAST_KNOWN_RRSP_YEAR + 2, 5)).toBeGreaterThan(plafond(LAST_KNOWN_RRSP_YEAR + 2, 2));
        // …et RIEN d'autre : une année du barème reste la valeur publiée, quelle que soit l'inflation.
        expect(plafond(2028, 5)).toBeCloseTo(RRSP_ANNUAL_LIMITS[2028], 2);
        expect(plafond(2028, 2)).toBeCloseTo(RRSP_ANNUAL_LIMITS[2028], 2);
    });

    it('l\'ancre est la dernière année de la table, pas un littéral — étendre la table la déplace', () => {
        // ⚠️ Garde de CÂBLAGE, et elle doit OBSERVER l'ancre, pas la re-décrire : une assertion du
        // genre « LAST_KNOWN_RRSP_YEAR = max(clés) » est vraie par définition et resterait VERTE si
        // le moteur composait depuis un littéral. On exige donc que la première année extrapolée
        // vaille EXACTEMENT la dernière valeur TABULÉE composée une fois — ce qu'un ancrage sur
        // 2026 ne peut pas produire. Si quelqu'un étend le barème à 2031, la mesure suit toute
        // seule ; si quelqu'un re-fige une année en dur, elle rougit.
        expect(RRSP_ANNUAL_LIMITS[LAST_KNOWN_RRSP_YEAR + 1]).toBeUndefined();
        expect(plafond(LAST_KNOWN_RRSP_YEAR + 1))
            .toBeCloseTo(RRSP_ANNUAL_LIMITS[LAST_KNOWN_RRSP_YEAR] * 1.025, 2);
    });
});
