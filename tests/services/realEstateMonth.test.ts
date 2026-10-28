import { describe, it, expect } from 'vitest';
import {
    processRealEstate,
    type RealEstateState,
    type RealEstateCtx,
    type PropertyStateMutable,
} from '../../services/projection/realEstateMonth';
import type { RealEstateGoal } from '../../types';

// Tests d'INVARIANTS sur processRealEstate (bloc immobilier mensuel) — module
// money-critical de 385 l. qui n'avait aucun test unitaire direct (couvert
// seulement en intégration). On cible les comportements vérifiables :
//   1. amortissement (split intérêt / capital),
//   2. remboursement complet de l'hypothèque (clamp + isPaidOff),
//   3. croissance de la valeur + plafond maxValue,
//   4. achat quand les liquidités suffisent (cash débité, PMT calculé),
//   5. achat reporté quand elles manquent,
//   6. arrêt du loyer après l'achat de la résidence principale,
//   7. revenus locatifs (propriété non-primaire),
//   8. cascade de mise de fonds (CELI ; RAP pour résidence principale).
// processRealEstate MUTE state + propertiesState en place. On NE MODIFIE PAS le
// source ; un comportement surprenant est noté en commentaire, pas corrigé.

const makeState = (over: Partial<RealEstateState> = {}): RealEstateState => ({
    retraitReerMois: 0,
    rrspWithholdingMois: 0,
    accRetraitsReerYearAdd: 0, rapMissedRepaymentAdd: 0,
    liquid: 0, celi: 0, celiapp: 0, reer: 0, nonReg: 0, nonRegACB: 0, capitalLossBank: 0,
    monthlyIncome: 0, monthlyExpenses: 0, accRentesYear: 0, accCapitalGainsYear: 0,
    realEstateEquity: 0, mortgageBalance: 0, hasPurchasedPrimary: false,
    hasUsedRap: false, rapBorrowed: 0, rapRepaymentDueTotal: 0, rapRepaymentStartOffset: 0,
    smithManoeuvreDebt: 0, smithInterestDeductibleYear: 0, fhsaClosingYear: null,
    taxCurrentYearReer: 0, impotReerMois: 0,
    withdrawalLiquid: 0, withdrawalCELI: 0, withdrawalNonReg: 0, withdrawalREER: 0, contribLiquid: 0,
    celiWithdrawalsThisYear: 0, retraitCeliMois: 0,
    immoInterest: 0, immoPrincipal: 0, immoHypo: 0, immoCharges: 0,
    totalRentalIncome: 0, rentalEarnedParProprietaire: { user1: 0, user2: 0, joint: 0 },
    lifeEventLogs: [], flowEventLogs: [],
    ...over,
});

const makeCtx = (over: Partial<RealEstateCtx> = {}): RealEstateCtx => ({
    m: 0, loopYear: 2026, isRetired: false, activeUsersCount: 1,
    simInflation: 0, simSalaryGrowth: 0,
    grossMarcBaseAnnual: 80000, grossAnnaBaseAnnual: 0, incomeRetirement: 0,
    useSmithManoeuvre: false, currentRentExpense: 0,
    ...over,
});

const makeGoal = (over: Partial<RealEstateGoal> = {}): RealEstateGoal => ({
    id: 'p1', name: 'Maison', isActive: true, purchaseDate: '2026-01-01',
    price: 500000, downPayment: 100000, mortgageRate: 5, amortization: 25,
    totalClosingCosts: 0, monthlyPayment: 0, unrecoverableMonthly: 0,
    isPrimaryResidence: true,
    ...over,
});

const makeProp = (over: Partial<PropertyStateMutable> = {}): PropertyStateMutable => ({
    id: 'p1', isBought: false, mortgage: 0, currentValue: 0, calculatedPmt: 0,
    ...over,
});

// Fonctions injectées (neutres / déterministes) : offset d'achat à 0 (achat
// possible dès m=0), taxe de bienvenue nulle, taux marginal fixe à 40 %.
const offset0 = () => 0;
const noWelcomeTax = () => 0;

/**
 * [ENG-PROPGROWTH-ZERO-INEXPRIMABLE] Un taux de croissance immobilière de ZÉRO est une SAISIE
 * légitime — « je ne veux pas parier sur l'appréciation » — et elle était inexprimable.
 *
 * ⚠️ MESURÉ : `(goal.propertyGrowthRate || 3)` transformait le 0 en 3 %/an, et le motif existait
 * à CINQ endroits, dont l'éditeur lui-même (`PropertyConfigurator`) — taper 0 réaffichait 3.
 * Deux sites voisins étaient déjà corrects (`?? 3` dans la reconstruction d'équité, un paramètre
 * par défaut dans `services/realEstate.ts`) : c'est le patron appliqué à côté mais pas ici.
 *
 * ⚠️ Et NEUF tests de ce fichier déclarent `propertyGrowthRate: 0` — ils tournaient donc à 3 %
 * depuis toujours. Un seul l'avait remarqué sans le nommer : son assertion était une FOURCHETTE
 * « + ≤1 mois de croissance » sur une fixture qui dit 0. La fourchette absorbait le défaut.
 */
/**
 * [ENG-RENEWAL-CHOC-MORT] Le renouvellement hypothécaire n'annonce plus un changement inexistant.
 *
 * ⚠️ MESURÉ : le « choc » de taux au renouvellement est dérivé du PREMIER CARACTÈRE de
 * l'identifiant du bien — `((id.charCodeAt(0) % 3) - 1) * 0,015`. Or tous les identifiants du
 * dépôt tombent sur la même valeur : l'UI crée `prop_<timestamp>` ('p' → 112, 112 % 3 = 1 → choc
 * NUL), les fixtures utilisent `p1`, les personas `jc-re1` ('j' → 106 → 1). **Aucune propriété
 * atteignable par un utilisateur n'a jamais vu son taux bouger au renouvellement.**
 *
 * ✅ INVERSÉ le 2026-09-05 (`[ENG-RENEWAL-SAISIE]`, décision Marc 2026-09-04) : le choc par
 * identifiant a été RETIRÉ — le taux au renouvellement vient désormais de la SAISIE
 * `goal.renewalRateProjection` (défaut = taux courant). Ce test de limite s'inverse au même
 * endroit plutôt que de disparaître : ce qu'il défend reste le no-fake-data du MESSAGE
 * (« nouveau taux » seulement quand le taux a bougé), mais le discriminant n'est plus le premier
 * caractère de l'identifiant — c'est la saisie. Un identifiant « à choc » (`re1`, jadis −1,5 pt)
 * doit désormais rendre « taux inchangé » : c'est la preuve que le hachage est bien MORT.
 */
describe('[ENG-RENEWAL-SAISIE] le message dit ce qui s\'est passé — piloté par la saisie, plus par l\'identifiant', () => {
    const renouvellement = (id: string, renewalRateProjection?: number) => {
        const state = makeState();
        const goal = makeGoal({ id, mortgageRate: 5, amortization: 25, isPrimaryResidence: true, propertyGrowthRate: 0, ...(renewalRateProjection === undefined ? {} : { renewalRateProjection }) });
        const prop = makeProp({ id, isBought: true, mortgage: 300_000, currentValue: 500_000, calculatedPmt: 1_800 });
        // m = 60 = un terme de 5 ans échu, et 240 − 60 = 180 mois restants (> 60, condition du bloc).
        processRealEstate(state, makeCtx({ m: 60 }), [goal], [prop], offset0, noWelcomeTax);
        return state.lifeEventLogs.filter((l) => l.includes('Renouvellement'));
    };

    it('sans saisie : le message dit « taux INCHANGÉ », quel que soit l\'identifiant', () => {
        const logs = renouvellement('prop_1787632344299');
        expect(logs.length, 'le renouvellement doit bien se produire').toBe(1);
        expect(logs[0]).toContain('taux inchangé');
        expect(logs[0]).toContain('5.00'); // toFixed rend un point décimal
        expect(logs[0]).not.toContain('nouveau taux');
    });

    it('identifiant qui déclenchait l\'ancien choc (`re1`) : plus AUCUN effet — le hachage est mort', () => {
        // Sous l'ancien code, 'r' → 114 % 3 = 0 → −1,5 pt et « nouveau taux 3.50 % ». Ce cas est la
        // trace de la limite levée : s'il annonce un jour un changement sans saisie, le hachage est
        // revenu par une porte de derrière.
        const logs = renouvellement('re1');
        expect(logs.length).toBe(1);
        expect(logs[0]).toContain('taux inchangé');
        expect(logs[0]).not.toContain('nouveau taux');
    });

    it('avec saisie : le message dit « nouveau taux » et l\'annonce au taux SAISI', () => {
        // Anti-vacuité de la branche « nouveau taux » : sans ce cas, « ne contient pas *nouveau
        // taux* » serait vrai parce que la phrase a été supprimée, pas parce qu'elle est conditionnée.
        const logs = renouvellement('prop_1787632344299', 3.5);
        expect(logs.length).toBe(1);
        expect(logs[0]).toContain('nouveau taux');
        expect(logs[0]).toContain('3.50');
        expect(logs[0]).not.toContain('inchangé');
    });

    it('saisie ÉGALE au taux courant : « taux inchangé » — on n\'annonce pas un changement qui n\'existe pas', () => {
        const logs = renouvellement('prop_1787632344299', 5);
        expect(logs.length).toBe(1);
        expect(logs[0]).toContain('taux inchangé');
    });
});

describe('[ENG-PROPGROWTH-ZERO-INEXPRIMABLE] un 0 explicite reste 0', () => {
    it('croissance 0 : la valeur du bien ne bouge PAS d\'un mois à l\'autre', () => {
        const state = makeState();
        const goal = makeGoal({ isPrimaryResidence: true, propertyGrowthRate: 0, mortgageRate: 5 });
        const prop = makeProp({ isBought: true, mortgage: 0, currentValue: 500_000, calculatedPmt: 0 });

        processRealEstate(state, makeCtx({ m: 12 }), [goal], [prop], offset0, noWelcomeTax);

        expect(prop.currentValue).toBe(500_000);
    });

    it('taux ABSENT : le défaut 3 %/an s\'applique toujours (le correctif ne l\'a pas tué)', () => {
        // Anti-vacuité indispensable : remplacer `|| 3` par `?? 3` sans ce test laisserait passer
        // un `fin(x) ?? 3` — toujours défini, donc défaut MORT et taux absent devenu 0 %.
        const state = makeState();
        const goal = makeGoal({ isPrimaryResidence: true, mortgageRate: 5 }); // pas de propertyGrowthRate
        const prop = makeProp({ isBought: true, mortgage: 0, currentValue: 500_000, calculatedPmt: 0 });

        processRealEstate(state, makeCtx({ m: 12 }), [goal], [prop], offset0, noWelcomeTax);

        // Un douzième de 3 %/an, composé : 500 000 × 1,03^(1/12).
        expect(prop.currentValue).toBeCloseTo(500_000 * Math.pow(1.03, 1 / 12), 6);
        expect(prop.currentValue).toBeGreaterThan(500_000);
    });

    it('les deux cas sont bien DISTINCTS (sinon les deux tests ci-dessus seraient d\'accord par hasard)', () => {
        const avec = makeProp({ isBought: true, mortgage: 0, currentValue: 500_000, calculatedPmt: 0 });
        const sans = makeProp({ isBought: true, mortgage: 0, currentValue: 500_000, calculatedPmt: 0 });
        processRealEstate(makeState(), makeCtx({ m: 12 }),
            [makeGoal({ isPrimaryResidence: true, propertyGrowthRate: 0, mortgageRate: 5 })], [avec], offset0, noWelcomeTax);
        processRealEstate(makeState(), makeCtx({ m: 12 }),
            [makeGoal({ isPrimaryResidence: true, mortgageRate: 5 })], [sans], offset0, noWelcomeTax);
        expect(sans.currentValue).not.toBe(avec.currentValue);
    });
});

describe('realEstateMonth — amortissement (propriété détenue)', () => {
    it('sépare intérêt et capital : intérêt = solde × taux mensuel, capital = PMT − intérêt', () => {
        const state = makeState();
        // taux 6 %/an → 0,5 %/mois ; solde 300 000 → intérêt 1 500 ; PMT 2 000 → capital 500.
        const goal = makeGoal({ mortgageRate: 6, isPrimaryResidence: false, propertyGrowthRate: 0 });
        const prop = makeProp({ isBought: true, mortgage: 300000, currentValue: 600000, calculatedPmt: 2000 });

        // m=12 (pas un multiple de 60 → aucun renouvellement déclenché).
        processRealEstate(state, makeCtx({ m: 12 }), [goal], [prop], offset0, noWelcomeTax);

        expect(state.immoInterest).toBeCloseTo(1500, 6);
        expect(state.immoPrincipal).toBeCloseTo(500, 6);
        expect(prop.mortgage).toBeCloseTo(299500, 6);
    });

    it('rembourse à 100 % quand le capital dépasse le solde : clamp à 0, isPaidOff, PMT remis à 0', () => {
        const state = makeState();
        const goal = makeGoal({ mortgageRate: 3, isPrimaryResidence: false, propertyGrowthRate: 0 });
        // solde résiduel 400 $, PMT 10 000 → le capital efface tout.
        const prop = makeProp({ isBought: true, mortgage: 400, currentValue: 500000, calculatedPmt: 10000 });

        processRealEstate(state, makeCtx({ m: 12 }), [goal], [prop], offset0, noWelcomeTax);

        expect(prop.mortgage).toBe(0);
        expect(prop.isPaidOff).toBe(true);
        expect(prop.calculatedPmt).toBe(0);
    });
});

describe('realEstateMonth — valeur de la propriété', () => {
    it('croît mensuellement au taux annuel composé', () => {
        const state = makeState();
        const goal = makeGoal({ propertyGrowthRate: 12, isPrimaryResidence: false });
        const prop = makeProp({ isBought: true, mortgage: 0, currentValue: 500000, calculatedPmt: 0 });

        processRealEstate(state, makeCtx({ m: 1 }), [goal], [prop], offset0, noWelcomeTax);

        expect(prop.currentValue).toBeCloseTo(500000 * Math.pow(1.12, 1 / 12), 2);
    });

    it('plafonne la valeur à maxValue', () => {
        const state = makeState();
        const goal = makeGoal({ propertyGrowthRate: 12, maxValue: 502000, isPrimaryResidence: false });
        const prop = makeProp({ isBought: true, mortgage: 0, currentValue: 500000, calculatedPmt: 0 });

        processRealEstate(state, makeCtx({ m: 1 }), [goal], [prop], offset0, noWelcomeTax);

        // 500 000 × 1,0095 ≈ 504 746 > 502 000 → écrêté.
        expect(prop.currentValue).toBe(502000);
    });
});

describe('realEstateMonth — achat', () => {
    it('achète quand les liquidités couvrent mise de fonds + frais ; débite le cash et calcule le PMT', () => {
        const state = makeState({ liquid: 200000 });
        const goal = makeGoal({
            price: 500000, downPayment: 100000, totalClosingCosts: 5000,
            mortgageRate: 5, amortization: 25, isPrimaryResidence: true, propertyGrowthRate: 0,
        });
        // Solde du prêt pré-initialisé par le moteur (prix − mise de fonds). MDF 20 % → pas de SCHL.
        const prop = makeProp({ isBought: false, mortgage: 400000, currentValue: 500000 });

        processRealEstate(state, makeCtx({ m: 0 }), [goal], [prop], offset0, noWelcomeTax);

        // totalCashNeeded = 100 000 + 5 000 + 0 (taxe bienvenue) − 0 (pas de neuf) = 105 000.
        expect(prop.isBought).toBe(true);
        expect(state.liquid).toBeCloseTo(95000, 6);
        expect(state.withdrawalLiquid).toBeCloseTo(105000, 6);
        expect(state.hasPurchasedPrimary).toBe(true);

        const r = 0.05 / 12;
        const n = 25 * 12;
        const expectedPmt = (400000 * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
        expect(prop.calculatedPmt).toBeCloseTo(expectedPmt, 2);
    });

    it("reporte l'achat quand les liquidités (et comptes) sont insuffisants", () => {
        // reer=0 → la cascade REER/CELI/NonReg n'est même pas tentée (gardée par reer>0).
        const state = makeState({ liquid: 50000, reer: 0, celi: 0, nonReg: 0, celiapp: 0 });
        const goal = makeGoal({ price: 500000, downPayment: 100000, totalClosingCosts: 5000, isPrimaryResidence: true });
        const prop = makeProp({ isBought: false, mortgage: 400000, currentValue: 500000 });

        processRealEstate(state, makeCtx({ m: 0 }), [goal], [prop], offset0, noWelcomeTax);

        expect(prop.isBought).toBe(false);
        expect(state.liquid).toBe(50000); // intact
    });

    it('puise dans le CELI pour compléter la mise de fonds (RAP sauté hors résidence principale)', () => {
        // Non-primaire → pas de RAP ; reer>0 pour entrer dans la cascade ; CELI couvre le manque.
        const state = makeState({ liquid: 50000, reer: 10000, celi: 100000, nonReg: 0, celiapp: 0 });
        const goal = makeGoal({ price: 500000, downPayment: 100000, totalClosingCosts: 5000, isPrimaryResidence: false });
        const prop = makeProp({ isBought: false, mortgage: 400000, currentValue: 500000 });

        processRealEstate(state, makeCtx({ m: 0 }), [goal], [prop], offset0, noWelcomeTax);

        // manque = 105 000 − 50 000 = 55 000 → tiré du CELI.
        expect(state.withdrawalCELI).toBeCloseTo(55000, 6);
        expect(state.celi).toBeCloseTo(45000, 6);
        expect(prop.isBought).toBe(true);
    });

    it('utilise le RAP (REER, sans impôt) pour une résidence principale', () => {
        const state = makeState({ liquid: 50000, reer: 80000, celi: 0, nonReg: 0, celiapp: 0 });
        const goal = makeGoal({ price: 500000, downPayment: 100000, totalClosingCosts: 5000, isPrimaryResidence: true });
        const prop = makeProp({ isBought: false, mortgage: 400000, currentValue: 500000 });

        processRealEstate(state, makeCtx({ m: 0, loopYear: 2026, activeUsersCount: 1 }), [goal], [prop], offset0, noWelcomeTax);

        expect(state.hasUsedRap).toBe(true);
        expect(state.rapBorrowed).toBeGreaterThan(0);
        expect(state.rapRepaymentDueTotal).toBeGreaterThan(0);
        expect(state.rapRepaymentStartOffset).toBeGreaterThan(0); // délai de grâce posé
        expect(prop.isBought).toBe(true);
    });
});

describe('realEstateMonth — flux post-achat', () => {
    it('arrête de compter le loyer une fois la résidence principale achetée', () => {
        const state = makeState({ monthlyExpenses: 5000, hasPurchasedPrimary: true });

        // Aucune propriété active : seule la logique « plus de loyer » s'applique.
        processRealEstate(state, makeCtx({ m: 0, currentRentExpense: 2000, simInflation: 0 }), [], [], offset0, noWelcomeTax);

        expect(state.monthlyExpenses).toBeCloseTo(3000, 6); // 5 000 − 2 000
    });

    it('comptabilise les revenus locatifs des propriétés non-primaires', () => {
        const state = makeState();
        const goal = makeGoal({ isPrimaryResidence: false, rentalIncomeMonthly: 2000, propertyGrowthRate: 0 });
        const prop = makeProp({ isBought: true, mortgage: 0, currentValue: 400000, calculatedPmt: 0 });

        processRealEstate(state, makeCtx({ m: 0, simInflation: 0 }), [goal], [prop], offset0, noWelcomeTax);

        expect(state.monthlyIncome).toBeCloseTo(2000, 6);
        expect(state.accRentesYear).toBeCloseTo(2000, 6);
        expect(state.totalRentalIncome).toBeCloseTo(2000, 6);
    });

    it('[FISC-RRSP-RENTAL-EARNED] le loyer va dans le seau de SON propriétaire (revenu gagné, droits REER)', () => {
        const state = makeState();
        const goal = makeGoal({ isPrimaryResidence: false, rentalIncomeMonthly: 2000, propertyGrowthRate: 0, owner: 'user2' });
        const prop = makeProp({ isBought: true, mortgage: 0, currentValue: 400000, calculatedPmt: 0 });

        processRealEstate(state, makeCtx({ m: 0, simInflation: 0 }), [goal], [prop], offset0, noWelcomeTax);

        expect(state.rentalEarnedParProprietaire).toEqual({ user1: 0, user2: 2000, joint: 0 });
        // Même montant que le registre imposé : une porte, pas deux.
        expect(state.rentalEarnedParProprietaire.user2).toBeCloseTo(state.accRentesYear, 6);
    });

    it('[FISC-RRSP-RENTAL-EARNED] sans propriétaire → seau conjoint ; résidence principale → rien', () => {
        const state = makeState();
        const loue = makeGoal({ isPrimaryResidence: false, rentalIncomeMonthly: 1500, propertyGrowthRate: 0 });
        const principale = makeGoal({ id: 'p2', isPrimaryResidence: true, rentalIncomeMonthly: 9999, propertyGrowthRate: 0, owner: 'user1' });
        const props = [makeProp({ isBought: true, currentValue: 400000 }), makeProp({ id: 'p2', isBought: true, currentValue: 500000 })];

        processRealEstate(state, makeCtx({ m: 0, simInflation: 0 }), [loue, principale], props, offset0, noWelcomeTax);

        expect(state.rentalEarnedParProprietaire).toEqual({ user1: 0, user2: 0, joint: 1500 });
    });
});

describe('realEstateMonth — chemins-bords', () => {
    it('Smith Manoeuvre : le capital remboursé est réemprunté en non-enregistré + intérêts capitalisés', () => {
        const state = makeState();
        const goal = makeGoal({ mortgageRate: 6, isPrimaryResidence: true, propertyGrowthRate: 0 });
        // solde 300 000 @ 6 % → intérêt 1 500 ; PMT 2 000 → capital 500. Valeur haute → pas d'appel de marge.
        const prop = makeProp({ isBought: true, mortgage: 300000, currentValue: 1000000, calculatedPmt: 2000 });

        processRealEstate(state, makeCtx({ m: 12, useSmithManoeuvre: true }), [goal], [prop], offset0, noWelcomeTax);

        expect(state.nonReg).toBeCloseTo(500, 6);
        expect(state.nonRegACB).toBeCloseTo(500, 6);
        // dette Smith = capital 500 + intérêt capitalisé.
        // ⚠️ [SMITH-HELOC-TAUX-FIGE] (2026-08-24) : le taux de la marge n'est plus figé à 5 %, il SUIT
        // celui du prêt du bien (ici 6 %) + l'écart de 2 points ⇒ 8 %. Le littéral reste écrit en
        // toutes lettres — c'est le RATCHET : si le modèle de taux change encore, ce test doit rougir
        // et être relu, pas suivre en silence.
        const smithInterest = 500 * (0.08 / 12);
        expect(state.smithManoeuvreDebt).toBeCloseTo(500 + smithInterest, 4);
        expect(state.smithInterestDeductibleYear).toBeCloseTo(smithInterest, 4);
    });

    it('remboursement RAP : déplace ~1/180 du montant emprunté de liquide vers REER, après le délai de grâce', () => {
        const state = makeState({
            liquid: 10000, reer: 5000,
            hasUsedRap: true, rapBorrowed: 30000, rapRepaymentDueTotal: 30000, rapRepaymentStartOffset: 24,
        });

        // m = 24 = début du remboursement ; aucune propriété active (on isole le RAP).
        processRealEstate(state, makeCtx({ m: 24 }), [], [], offset0, noWelcomeTax);

        const monthly = (30000 / 15) / 12; // 166,67 $
        expect(state.liquid).toBeCloseTo(10000 - monthly, 4);
        expect(state.reer).toBeCloseTo(5000 + monthly, 4);
        expect(state.rapRepaymentDueTotal).toBeCloseTo(30000 - monthly, 4);
    });

    it('ne rembourse pas le RAP avant le délai de grâce (m < rapRepaymentStartOffset)', () => {
        const state = makeState({
            liquid: 10000, reer: 5000,
            hasUsedRap: true, rapBorrowed: 30000, rapRepaymentDueTotal: 30000, rapRepaymentStartOffset: 24,
        });

        processRealEstate(state, makeCtx({ m: 12 }), [], [], offset0, noWelcomeTax);

        expect(state.liquid).toBe(10000);
        expect(state.reer).toBe(5000);
        expect(state.rapRepaymentDueTotal).toBe(30000);
    });

    it('renouvellement à 5 ans (m=60) : recalcule le PMT sur la durée résiduelle', () => {
        const state = makeState();
        // Sans saisie de taux de renouvellement : renouvellement au même taux 6 % ([ENG-RENEWAL-SAISIE]).
        const goal = makeGoal({ mortgageRate: 6, amortization: 25, isPrimaryResidence: false, propertyGrowthRate: 0 });
        const prop = makeProp({ id: 'p1', isBought: true, mortgage: 280000, currentValue: 600000, calculatedPmt: 1 });

        processRealEstate(state, makeCtx({ m: 60 }), [goal], [prop], offset0, noWelcomeTax);

        // 240 mois restants @ 6 % sur 280 000.
        const nr = 0.06 / 12;
        const rem = 240;
        const expectedPmt = (280000 * nr * Math.pow(1 + nr, rem)) / (Math.pow(1 + nr, rem) - 1);
        expect(prop.calculatedPmt).toBeCloseTo(expectedPmt, 2);
        expect(state.lifeEventLogs.some((l) => l.includes('Renouvellement'))).toBe(true);
    });
});

describe('realEstateMonth — downsizing à la retraite (PH4-FUT-B-4)', () => {
    it('downsizeThisMonth=true : libère 40 % de l\'équité de la résidence principale, bien réduit à 60 %, hypothèque 0, exempt d\'impôt', () => {
        const state = makeState({ liquid: 1000 });
        const goal = makeGoal({ isPrimaryResidence: true, propertyGrowthRate: 0 });
        // Bien 600k, hypothèque 200k → équité 400k. Libéré 160k (40 %), reste 240k (60 %).
        const prop = makeProp({ isBought: true, mortgage: 200000, currentValue: 600000, calculatedPmt: 1500 });

        processRealEstate(state, makeCtx({ m: 12, downsizeThisMonth: true }), [goal], [prop], offset0, noWelcomeTax);

        expect(state.liquid).toBeCloseTo(1000 + 160000, 0);   // équité libérée → liquide (cash, pas de croissance)
        // Bien réduit à 60 % de l'équité : EXACTEMENT 240 000 $.
        // ⚠️ [ENG-PROPGROWTH-ZERO-INEXPRIMABLE] Cette assertion était une FOURCHETTE
        // (]240 000 ; 241 000[) « + ≤1 mois de croissance immo » — alors que la fixture déclare
        // `propertyGrowthRate: 0`. Les deux se contredisaient, et c'est la fourchette qui disait
        // vrai : `(goal.propertyGrowthRate || 3)` transformait le 0 en 3 %/an, donc ce test tournait
        // à 3 % en croyant tourner à 0. La borne accommodait un mois de croissance que personne
        // n'avait demandé. Le 0 étant désormais respecté, la valeur est exacte — et si la croissance
        // revenait, cette égalité rougirait au lieu d'être absorbée par la fourchette.
        expect(prop.currentValue).toBe(240000);
        expect(prop.mortgage).toBe(0);                        // payé cash
        expect(prop.calculatedPmt).toBe(0);                   // plus de paiement
        expect(state.accCapitalGainsYear).toBe(0);            // EXEMPTION résidence principale
        expect(state.lifeEventLogs.some((l) => l.includes('Downsizing'))).toBe(true);
    });

    it('NON-RÉGRESSION : downsizeThisMonth absent/false → amortissement normal, bien intact', () => {
        const state = makeState({ liquid: 1000 });
        const goal = makeGoal({ isPrimaryResidence: true, propertyGrowthRate: 0 });
        const prop = makeProp({ isBought: true, mortgage: 200000, currentValue: 600000, calculatedPmt: 1500 });

        processRealEstate(state, makeCtx({ m: 12 }), [goal], [prop], offset0, noWelcomeTax);

        expect(prop.currentValue).toBeGreaterThan(500000);    // PAS réduit à 60 % (downsizing non déclenché)
        expect(prop.mortgage).toBeGreaterThan(0);             // amortissement normal (pas remis à 0)
        expect(state.lifeEventLogs.some((l) => l.includes('Downsizing'))).toBe(false);
    });

    it('underwater (hypothèque > valeur) → équité 0 → aucun downsizing', () => {
        const state = makeState({ liquid: 1000 });
        const goal = makeGoal({ isPrimaryResidence: true, propertyGrowthRate: 0 });
        const prop = makeProp({ isBought: true, mortgage: 700000, currentValue: 600000, calculatedPmt: 1500 });

        processRealEstate(state, makeCtx({ m: 12, downsizeThisMonth: true }), [goal], [prop], offset0, noWelcomeTax);

        expect(state.lifeEventLogs.some((l) => l.includes('Downsizing'))).toBe(false);
    });

    it('locataire (aucune résidence principale détenue) → downsizeThisMonth sans effet', () => {
        const state = makeState({ liquid: 1000 });
        const goal = makeGoal({ isPrimaryResidence: false, propertyGrowthRate: 0 });
        const prop = makeProp({ isBought: true, mortgage: 100000, currentValue: 300000, calculatedPmt: 1000 });

        processRealEstate(state, makeCtx({ m: 12, downsizeThisMonth: true }), [goal], [prop], offset0, noWelcomeTax);

        expect(state.lifeEventLogs.some((l) => l.includes('Downsizing'))).toBe(false);
    });
});
