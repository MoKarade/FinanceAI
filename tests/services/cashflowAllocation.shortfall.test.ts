import { describe, it, expect } from 'vitest';
import { processCashflowAllocation, type CashflowState, type CashflowCtx } from '../../services/projection/cashflowAllocation';
import type { FiscalReport } from '../../utils/tax';
import {
    OAS_CLAWBACK_THRESHOLD_2026,
    RRSP_WITHHOLDING_QC,
} from '../../utils/tax';

// Tests de CARACTÉRISATION + INVARIANTS sur la branche SHORTFALL de
// processCashflowAllocation (monthlyCashflow < 0 → cascade de retraits).
//
// Le test frère cashflowAllocation.overrides.test.ts ne couvre QUE l'excess
// (leviers contributionOrder / debtFirst). Ici on cible la cascade de ponction :
//   1. liquidités jusqu'au seuil critique,
//   2. REER au palier 0 % (PBMA) — toutes stratégies,
//   3. REER au palier 14 % (AUTO_MARGINAL uniquement),
//   4. cascade selon l'ordre de buckets de la stratégie,
//   5. réarrangement banque de pertes en capital,
//   6. cap OAS pour un retraité.
//
// MAJ 2026-06 (CF-2) : la conservation du décaissement a été corrigée — les produits de vente
// d'actifs financent la dépense et ne s'accumulent plus dans le liquide (rétabli au seuil critique).

const makeState = (over: Partial<CashflowState> = {}): CashflowState => ({
    liquid: 0, celi: 0, reer: 0, celiapp: 0, nonReg: 0, nonRegACB: 0,
    capitalLossBank: 0, crypto: 0, cryptoACB: 0, celiRoom: 0, rrspRoom: 0, fhsaRoom: 0,
    taxCurrentYearReer: 0, accRetraitsReerYear: 0, accCapitalGainsYear: 0,
    accRrspYear: 0, accFhsaYear: 0, fhsaLifetimeContrib: 0, celiWithdrawalsThisYear: 0,
    retraitReerMois: 0, retraitCeliMois: 0, withdrawalREER: 0, withdrawalCELI: 0,
    withdrawalNonReg: 0, withdrawalCrypto: 0, contribCELI: 0, contribREER: 0,
    contribNonReg: 0, contribCELIAPP: 0, shortfallMonths: 0, flowEventLogs: [],
    ...over,
});

// Revenu de base 60k > PBMA (17 183) ET > palier 14 % (54 345) → les retraits REER
// prioritaires (étapes 2 et 3) sont neutralisés. Ça isole la cascade par buckets.
const makeCtx = (over: Partial<CashflowCtx> = {}): CashflowCtx => ({
    monthlyCashflow: -3000, targetEF: 0, criticalThreshold: 0, isRetired: false,
    strategy: 'PRIO_CELI', m: 0, loopYear: 2026, enableMonteCarlo: false,
    activeUsersCount: 1, grossMarcBaseAnnual: 60000, grossAnnaBaseAnnual: 0,
    simSalaryGrowth: 0, incomeRetirement: 0, accRentesYear: 0,
    hasFuturePurchase: false, hasPurchasedPrimary: false,
    ...over,
});

const fiscalStub = () => ({ marginalRate: 20 } as unknown as FiscalReport);
// grossStub identité : 1$ net = 1$ brut. drawReer recalcule la VRAIE retenue via
// rrspWithholding ; avec cap_room large, ce stub borne actualGross au shortfall, ce
// qui rend les maths du palier 0 % exactes et testables.
const grossIdentity = (net: number) => ({ gross: net });
// grossStub historique du test frère : net / 0.7 (≈ gross-up 30 %).
const grossWithholding07 = (net: number) => ({ gross: net / 0.7 });

const rrspW = (gross: number): number => {
    const w = RRSP_WITHHOLDING_QC;
    if (gross <= w.bracket1.upTo) return gross * w.bracket1.combined;
    if (gross <= w.bracket2.upTo) return gross * w.bracket2.combined;
    return gross * w.bracket3.combined;
};

describe('cashflowAllocation shortfall — ponction des liquidités', () => {
    it('puise dans les liquidités sans toucher aux placements quand le coussin suffit', () => {
        const state = makeState({ liquid: 5000, celi: 10000, reer: 10000 });
        processCashflowAllocation(state, makeCtx({ monthlyCashflow: -3000 }), [], fiscalStub, grossIdentity);
        expect(state.liquid).toBe(2000);
        expect(state.celi).toBe(10000);
        expect(state.reer).toBe(10000);
        expect(state.shortfallMonths).toBe(0);
    });

    it('respecte le seuil critique : ne consomme que la portion de cash au-dessus du seuil', () => {
        const state = makeState({ liquid: 5000, celi: 10000 });
        processCashflowAllocation(state, makeCtx({ monthlyCashflow: -3000, criticalThreshold: 4000 }), [], fiscalStub, grossIdentity);
        // Seuls 1000$ (5000 - 4000) sont pris dans le cash ; les 2000$ restants viennent du CELI.
        // CF-2 (2026-06) : le produit de la vente CELI FINANCE la dépense → il ne reste pas dans le
        // liquide, qui est rétabli au seuil critique (4000). Avant, liquide gonflait à tort à 6000.
        expect(state.withdrawalCELI).toBe(2000);
        expect(state.celi).toBe(8000);
        expect(state.liquid).toBe(4000);
        expect(state.shortfallMonths).toBe(1);
    });

    it('incrémente shortfallMonths uniquement quand le cash ne couvre pas tout', () => {
        const stateOk = makeState({ liquid: 10000 });
        processCashflowAllocation(stateOk, makeCtx({ monthlyCashflow: -3000 }), [], fiscalStub, grossIdentity);
        expect(stateOk.shortfallMonths).toBe(0);

        const stateShort = makeState({ liquid: 1000, celi: 10000 });
        processCashflowAllocation(stateShort, makeCtx({ monthlyCashflow: -3000 }), [], fiscalStub, grossIdentity);
        expect(stateShort.shortfallMonths).toBe(1);
    });
});

describe('cashflowAllocation shortfall — ordre de la cascade par stratégie', () => {
    // Revenu 60k neutralise PBMA + palier 14 %, donc seule la cascade standard agit.
    it('PRIO_CELI ponctionne le CELI avant le REER', () => {
        const state = makeState({ liquid: 0, celi: 10000, reer: 10000 });
        processCashflowAllocation(state, makeCtx({ strategy: 'PRIO_CELI', monthlyCashflow: -3000 }), [], fiscalStub, grossIdentity);
        expect(state.withdrawalCELI).toBe(3000);
        expect(state.withdrawalREER).toBe(0);
        expect(state.celi).toBe(7000);
    });

    it('PRIO_REER ponctionne le REER avant le CELI', () => {
        const state = makeState({ liquid: 0, celi: 10000, reer: 50000 });
        processCashflowAllocation(state, makeCtx({ strategy: 'PRIO_REER', monthlyCashflow: -3000 }), [], fiscalStub, grossIdentity);
        // Avec grossIdentity, le REER tire 3000 brut mais la retenue (19 %) ramène le net
        // à 2430 < 3000 → le CELI complète le résidu (570). Le REER reste ponctionné EN
        // PREMIER (withdrawalREER > withdrawalCELI), conforme à PRIO_REER.
        expect(state.withdrawalREER).toBeGreaterThan(0);
        expect(state.withdrawalREER).toBeGreaterThan(state.withdrawalCELI);
        expect(state.withdrawalCELI).toBeCloseTo(rrspW(3000), 6); // 570, le résidu post-impôt
    });

    it('défaut (AUTO_MARGINAL hors paliers) ponctionne CELI puis NonReg avant le REER', () => {
        // buckets = ['CELI', 'REER', 'NONREG', 'CRYPTO'] mais CELI couvre tout.
        const state = makeState({ liquid: 0, celi: 10000, reer: 50000, nonReg: 5000, nonRegACB: 5000 });
        processCashflowAllocation(state, makeCtx({ strategy: 'AUTO_MARGINAL', monthlyCashflow: -3000 }), [], fiscalStub, grossIdentity);
        expect(state.withdrawalCELI).toBe(3000);
        expect(state.withdrawalREER).toBe(0);
        expect(state.withdrawalNonReg).toBe(0);
    });

    it('crypto est le dernier recours (PRIO_CELI : CELI → NonReg → REER → CRYPTO)', () => {
        // Tout est vide sauf crypto → on doit finir par vendre la crypto.
        const state = makeState({ liquid: 0, celi: 0, reer: 0, nonReg: 0, crypto: 10000 });
        processCashflowAllocation(state, makeCtx({ strategy: 'PRIO_CELI', monthlyCashflow: -3000 }), [], fiscalStub, grossIdentity);
        expect(state.withdrawalCrypto).toBe(3000);
        expect(state.crypto).toBe(7000);
        // Vente crypto = gain en capital accumulé pour avril.
        expect(state.accCapitalGainsYear).toBe(3000);
    });

    it('enchaîne plusieurs buckets quand le premier est insuffisant', () => {
        // PRIO_CELI : CELI (1000) épuisé → NonReg (2000) complète le shortfall de 3000.
        const state = makeState({ liquid: 0, celi: 1000, nonReg: 5000, nonRegACB: 5000 });
        processCashflowAllocation(state, makeCtx({ strategy: 'PRIO_CELI', monthlyCashflow: -3000 }), [], fiscalStub, grossIdentity);
        expect(state.withdrawalCELI).toBe(1000);
        expect(state.withdrawalNonReg).toBe(2000);
        expect(state.celi).toBe(0);
        expect(state.nonReg).toBe(3000);
    });
});

describe('cashflowAllocation shortfall — REER palier 0 % (PBMA)', () => {
    // Retraité sans autre revenu → runningGross = 0 → place dispo au palier 0 %.
    const retiredCtx = (over: Partial<CashflowCtx> = {}) => makeCtx({
        isRetired: true, incomeRetirement: 0, accRentesYear: 0,
        grossMarcBaseAnnual: 0, grossAnnaBaseAnnual: 0,
        ...over,
    });

    it('puise dans le REER au palier 0 % avant le CELI, même en PRIO_CELI', () => {
        // Petit shortfall (3000) bien sous le PBMA (17 183). Avec grossIdentity et un
        // gros REER, actualGross = shortfall = 3000 (≤ 5000 → retenue bracket1 19 %).
        const state = makeState({ liquid: 0, reer: 100000, celi: 100000 });
        processCashflowAllocation(state, retiredCtx({ strategy: 'PRIO_CELI', monthlyCashflow: -3000 }), [], fiscalStub, grossIdentity);

        const gross = 3000;
        const withholding = rrspW(gross); // 3000 * 0.19 = 570
        const net = gross - withholding;  // 2430
        expect(state.withdrawalREER).toBeCloseTo(gross, 6);
        expect(state.taxCurrentYearReer).toBeCloseTo(withholding, 6);
        // Le net obtenu (2430) < shortfall (3000) → le CELI complète le reste (570).
        expect(state.withdrawalCELI).toBeCloseTo(shortfallRemainder(net), 6);
    });

    it('le retrait PBMA est borné par le solde du REER', () => {
        const state = makeState({ liquid: 0, reer: 1000, celi: 100000 });
        processCashflowAllocation(state, retiredCtx({ strategy: 'PRIO_CELI', monthlyCashflow: -3000 }), [], fiscalStub, grossIdentity);
        // REER vidé (1000 brut), le CELI couvre le reste du shortfall.
        expect(state.withdrawalREER).toBeCloseTo(1000, 6);
        expect(state.reer).toBeCloseTo(0, 6);
        expect(state.withdrawalCELI).toBeGreaterThan(0);
    });

    it('PBMA inactif si le revenu courant dépasse déjà le seuil PBMA', () => {
        // incomeRetirement * 12 = 24k > PBMA 17 183 → pbmaRoom = 0, pas de retrait REER prioritaire.
        const state = makeState({ liquid: 0, reer: 100000, celi: 100000 });
        processCashflowAllocation(state, retiredCtx({ strategy: 'PRIO_CELI', incomeRetirement: 2000, monthlyCashflow: -3000 }), [], fiscalStub, grossIdentity);
        // PRIO_CELI sans PBNA → on tape le CELI en premier.
        expect(state.withdrawalCELI).toBeCloseTo(3000, 6);
        expect(state.withdrawalREER).toBe(0);
    });

    it('multiplie le seuil PBMA par activeUsersCount (couple)', () => {
        // 1 personne : revenu 30k > PBMA 17 183 → pas de retrait PBMA.
        const solo = makeState({ liquid: 0, reer: 100000, celi: 100000 });
        processCashflowAllocation(solo, retiredCtx({ strategy: 'PRIO_CELI', incomeRetirement: 2500, activeUsersCount: 1, monthlyCashflow: -3000 }), [], fiscalStub, grossIdentity);
        expect(solo.withdrawalREER).toBe(0);

        // 2 personnes : PBMA = 2 × 17 183 = 34 366 > revenu 30k → retrait PBMA actif.
        const couple = makeState({ liquid: 0, reer: 100000, celi: 100000 });
        processCashflowAllocation(couple, retiredCtx({ strategy: 'PRIO_CELI', incomeRetirement: 2500, activeUsersCount: 2, monthlyCashflow: -3000 }), [], fiscalStub, grossIdentity);
        expect(couple.withdrawalREER).toBeGreaterThan(0);
    });
});

describe('cashflowAllocation shortfall — palier 14 % (AUTO_MARGINAL)', () => {
    it('AUTO_MARGINAL puise dans le REER jusqu\'au palier 14 % avant le CELI', () => {
        // Non-retraité, revenu 0 → runningGross part de 0, place dispo jusqu'à 54 345.
        // Gros shortfall pour franchir le palier PBMA (17 183) et atteindre le 14 %.
        const state = makeState({ liquid: 0, reer: 100000, celi: 100000 });
        processCashflowAllocation(
            state,
            makeCtx({ strategy: 'AUTO_MARGINAL', grossMarcBaseAnnual: 0, monthlyCashflow: -30000 }),
            [], fiscalStub, grossWithholding07,
        );
        // REER ponctionné aux deux paliers (0 % puis 14 %) avant de toucher au CELI.
        expect(state.withdrawalREER).toBeGreaterThan(0);
        expect(state.reer).toBeLessThan(100000);
    });

    it('PRIO_CELI ne déclenche PAS le remplissage palier 14 % (réservé à AUTO_MARGINAL)', () => {
        // Même setup mais PRIO_CELI : revenu 0 → seul le palier 0 % (PBMA) tire du REER,
        // ensuite le CELI prend le relais. Le REER ne doit pas être ponctionné au-delà du PBMA.
        const auto = makeState({ liquid: 0, reer: 100000, celi: 100000 });
        processCashflowAllocation(
            auto,
            makeCtx({ strategy: 'AUTO_MARGINAL', grossMarcBaseAnnual: 0, monthlyCashflow: -30000 }),
            [], fiscalStub, grossWithholding07,
        );
        const prioCeli = makeState({ liquid: 0, reer: 100000, celi: 100000 });
        processCashflowAllocation(
            prioCeli,
            makeCtx({ strategy: 'PRIO_CELI', grossMarcBaseAnnual: 0, monthlyCashflow: -30000 }),
            [], fiscalStub, grossWithholding07,
        );
        // AUTO_MARGINAL tire davantage du REER (deux paliers) que PRIO_CELI (palier 0 % seul).
        expect(auto.withdrawalREER).toBeGreaterThan(prioCeli.withdrawalREER);
    });
});

describe('cashflowAllocation shortfall — cap OAS (retraité 65+)', () => {
    it('plafonne le retrait REER au seuil de récupération PSV pour un retraité', () => {
        // Revenu déjà juste sous le seuil OAS → la place REER restante est minime.
        const justBelow = OAS_CLAWBACK_THRESHOLD_2026 - 1200; // 94 123
        const state = makeState({ liquid: 0, reer: 500000, celi: 0, nonReg: 0 });
        processCashflowAllocation(
            state,
            makeCtx({
                isRetired: true, strategy: 'PRIO_REER',
                incomeRetirement: justBelow / 12, accRentesYear: 0,
                grossMarcBaseAnnual: 0, grossAnnaBaseAnnual: 0,
                monthlyCashflow: -30000,
            }),
            [], fiscalStub, grossWithholding07,
        );
        // Le brut total prélevé ne doit pas faire dépasser le seuil OAS de plus que
        // la marge initiale (1200), malgré un REER quasi infini et un gros shortfall.
        expect(state.withdrawalREER).toBeLessThanOrEqual(1200 + 1e-6);
    });

    it('le cap OAS est multiplié par activeUsersCount (couple retraité)', () => {
        const baseIncome = OAS_CLAWBACK_THRESHOLD_2026 - 600;
        // Solo : marge OAS ≈ 600.
        const solo = makeState({ liquid: 0, reer: 500000 });
        processCashflowAllocation(
            solo,
            makeCtx({
                isRetired: true, strategy: 'PRIO_REER', activeUsersCount: 1,
                incomeRetirement: baseIncome / 12, grossMarcBaseAnnual: 0, grossAnnaBaseAnnual: 0,
                monthlyCashflow: -30000,
            }),
            [], fiscalStub, grossWithholding07,
        );
        // Couple : cap = 2 × seuil → marge bien plus large pour le même revenu.
        const couple = makeState({ liquid: 0, reer: 500000 });
        processCashflowAllocation(
            couple,
            makeCtx({
                isRetired: true, strategy: 'PRIO_REER', activeUsersCount: 2,
                incomeRetirement: baseIncome / 12, grossMarcBaseAnnual: 0, grossAnnaBaseAnnual: 0,
                monthlyCashflow: -30000,
            }),
            [], fiscalStub, grossWithholding07,
        );
        expect(couple.withdrawalREER).toBeGreaterThan(solo.withdrawalREER);
    });

    it('aucun cap OAS pour un non-retraité (oasCap = Infinity)', () => {
        // Non-retraité avec revenu > seuil OAS : le REER reste librement ponctionnable.
        const state = makeState({ liquid: 0, reer: 500000 });
        processCashflowAllocation(
            state,
            makeCtx({
                isRetired: false, strategy: 'PRIO_REER',
                grossMarcBaseAnnual: OAS_CLAWBACK_THRESHOLD_2026 + 50000,
                monthlyCashflow: -30000,
            }),
            [], fiscalStub, grossWithholding07,
        );
        expect(state.withdrawalREER).toBeGreaterThan(1000);
    });
});

describe('cashflowAllocation shortfall — banque de pertes en capital', () => {
    it('vend le NonReg avant le REER quand la banque de pertes est significative (>1000$)', () => {
        // PRIO_REER : buckets = [REER, CELI, NONREG, CRYPTO]. Avec capitalLossBank > 1000
        // et du NonReg, REER et NONREG sont permutés → NonReg ponctionné en premier.
        const state = makeState({
            liquid: 0, reer: 100000, nonReg: 10000, nonRegACB: 10000,
            capitalLossBank: 5000, celi: 0,
        });
        processCashflowAllocation(state, makeCtx({ strategy: 'PRIO_REER', monthlyCashflow: -3000 }), [], fiscalStub, grossIdentity);
        expect(state.withdrawalNonReg).toBe(3000);
        expect(state.withdrawalREER).toBe(0);
    });

    it('ne permute PAS NonReg/REER si la banque de pertes est faible (≤1000$)', () => {
        // capitalLossBank = 1000 (non strictement > 1000) → ordre PRIO_REER intact.
        const state = makeState({
            liquid: 0, reer: 100000, nonReg: 10000, nonRegACB: 10000,
            capitalLossBank: 1000, celi: 0,
        });
        processCashflowAllocation(state, makeCtx({ strategy: 'PRIO_REER', monthlyCashflow: -3000 }), [], fiscalStub, grossIdentity);
        // Pas de permute → ordre PRIO_REER intact : le REER passe AVANT le NonReg. Le REER
        // tire 3000 brut (net 2430), et le NonReg ne sert qu'à éponger le résidu post-impôt
        // (570) — donc withdrawalREER >> withdrawalNonReg, l'inverse de la permute.
        expect(state.withdrawalREER).toBeGreaterThan(state.withdrawalNonReg);
        expect(state.withdrawalNonReg).toBeCloseTo(rrspW(3000), 6); // 570, simple résidu
    });

    it('consomme la banque de pertes pour compenser le gain en capital de la vente NonReg', () => {
        // NonReg 10000 / ACB 4000 → gain brut 6000 sur vente totale. Ici on vend 3000 :
        // proportion ACB = 4000/10000 = 0.4 → costBasis = 1200, rawGain = 1800.
        // capitalLossBank = 5000 → usableLoss = 1800, taxableGain = 0, bank → 3200.
        const state = makeState({
            liquid: 0, reer: 0, nonReg: 10000, nonRegACB: 4000,
            capitalLossBank: 5000, celi: 0,
        });
        processCashflowAllocation(state, makeCtx({ strategy: 'PRIO_REER', monthlyCashflow: -3000 }), [], fiscalStub, grossIdentity);
        expect(state.withdrawalNonReg).toBe(3000);
        expect(state.accCapitalGainsYear).toBeCloseTo(0, 6);
        expect(state.capitalLossBank).toBeCloseTo(3200, 6);
    });
});

describe('cashflowAllocation shortfall — INVARIANTS robustes', () => {
    // Matrice de scénarios variés pour vérifier les invariants universels.
    const scenarios: Array<{ name: string; state: Partial<CashflowState>; ctx: Partial<CashflowCtx> }> = [
        { name: 'cash seul', state: { liquid: 5000 }, ctx: { monthlyCashflow: -3000 } },
        { name: 'cascade CELI', state: { liquid: 0, celi: 8000 }, ctx: { strategy: 'PRIO_CELI', monthlyCashflow: -3000 } },
        { name: 'cascade REER retraité', state: { liquid: 0, reer: 80000 }, ctx: { isRetired: true, incomeRetirement: 0, grossMarcBaseAnnual: 0, monthlyCashflow: -3000 } },
        { name: 'multi-comptes', state: { liquid: 1000, celi: 2000, reer: 50000, nonReg: 3000, nonRegACB: 2000, crypto: 4000 }, ctx: { strategy: 'AUTO_MARGINAL', monthlyCashflow: -8000 } },
        { name: 'tout épuisé sauf crypto', state: { liquid: 0, crypto: 1000 }, ctx: { strategy: 'PRIO_CELI', monthlyCashflow: -3000 } },
        { name: 'banque de pertes', state: { liquid: 0, nonReg: 10000, nonRegACB: 3000, capitalLossBank: 4000, reer: 50000 }, ctx: { strategy: 'PRIO_REER', monthlyCashflow: -5000 } },
        { name: 'couple retraité cap OAS', state: { liquid: 0, reer: 300000 }, ctx: { isRetired: true, activeUsersCount: 2, incomeRetirement: 7000, grossMarcBaseAnnual: 0, monthlyCashflow: -20000 } },
    ];

    for (const sc of scenarios) {
        it(`ne laisse jamais de solde de compte négatif (${sc.name})`, () => {
            const state = makeState(sc.state);
            processCashflowAllocation(state, makeCtx(sc.ctx), [], fiscalStub, grossWithholding07);
            expect(state.celi).toBeGreaterThanOrEqual(-1e-6);
            expect(state.reer).toBeGreaterThanOrEqual(-1e-6);
            expect(state.nonReg).toBeGreaterThanOrEqual(-1e-6);
            expect(state.crypto).toBeGreaterThanOrEqual(-1e-6);
            expect(state.capitalLossBank).toBeGreaterThanOrEqual(-1e-6);
        });

        it(`les retraits cumulés (withdrawal*) sont non-négatifs (${sc.name})`, () => {
            const state = makeState(sc.state);
            processCashflowAllocation(state, makeCtx(sc.ctx), [], fiscalStub, grossWithholding07);
            expect(state.withdrawalCELI).toBeGreaterThanOrEqual(0);
            expect(state.withdrawalREER).toBeGreaterThanOrEqual(0);
            expect(state.withdrawalNonReg).toBeGreaterThanOrEqual(0);
            expect(state.withdrawalCrypto).toBeGreaterThanOrEqual(0);
        });

        it(`les agrégats fiscaux REER restent cohérents (${sc.name})`, () => {
            const state = makeState(sc.state);
            processCashflowAllocation(state, makeCtx(sc.ctx), [], fiscalStub, grossWithholding07);
            // Le brut total retiré du REER (withdrawalREER) doit alimenter les
            // accumulateurs annuels et mensuels de façon cohérente.
            expect(state.accRetraitsReerYear).toBeCloseTo(state.withdrawalREER, 4);
            expect(state.retraitReerMois).toBeCloseTo(state.withdrawalREER, 4);
            // La retenue d'impôt ne peut pas dépasser le brut retiré.
            expect(state.taxCurrentYearReer).toBeLessThanOrEqual(state.withdrawalREER + 1e-6);
        });
    }

    it('aucune cotisation (contrib*) ne se produit en mode shortfall', () => {
        const state = makeState({ liquid: 1000, celi: 5000, reer: 50000, celiRoom: 9999, rrspRoom: 9999 });
        processCashflowAllocation(state, makeCtx({ monthlyCashflow: -8000 }), [], fiscalStub, grossWithholding07);
        expect(state.contribCELI).toBe(0);
        expect(state.contribREER).toBe(0);
        expect(state.contribNonReg).toBe(0);
        expect(state.contribCELIAPP).toBe(0);
    });

    it('chaque retrait produit une entrée de journal (flowEventLogs)', () => {
        const state = makeState({ liquid: 0, celi: 5000 });
        processCashflowAllocation(state, makeCtx({ strategy: 'PRIO_CELI', monthlyCashflow: -3000 }), [], fiscalStub, grossIdentity);
        expect(state.flowEventLogs.length).toBeGreaterThan(0);
        expect(state.flowEventLogs.some(l => l.includes('CELI'))).toBe(true);
    });

    it('shortfall couvert intégralement quand les actifs sont abondants (cash final ≈ seuil)', () => {
        const criticalThreshold = 2000;
        const state = makeState({ liquid: 10000, celi: 100000, reer: 100000 });
        processCashflowAllocation(state, makeCtx({ monthlyCashflow: -3000, criticalThreshold }), [], fiscalStub, grossIdentity);
        // 10000 - 3000 = 7000 > seuil 2000 → tout vient du cash, rien des placements.
        expect(state.liquid).toBe(7000);
        expect(state.withdrawalCELI).toBe(0);
        expect(state.withdrawalREER).toBe(0);
    });
});

// Helper local pour l'assertion CELI complémentaire (lisibilité du test PBMA).
function shortfallRemainder(netDrawn: number): number {
    return 3000 - netDrawn;
}
