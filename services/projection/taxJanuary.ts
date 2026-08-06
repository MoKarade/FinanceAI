// services/projection/taxJanuary.ts
// Cycle 23 split (depuis taxCycle.ts): réinitialisation annuelle de janvier.
// Cycle 12 (origine): exécuté uniquement en janvier (currentMonthIndex === 0 && m > 0).

import { RRIF_FIRST_WITHDRAWAL_AGE, rrifRateForAge } from './helpers';
import { FHSA_LIFETIME_LIMIT_PER_USER, FHSA_ANNUAL_LIMIT_PER_USER, RRSP_ANNUAL_LIMITS, RRSP_ROOM_RATE, CELI_LIMIT_ROUNDING, CELI_ANNUAL_LIMITS, LAST_KNOWN_CELI_YEAR, getResidencyStartYear, type FiscalReport, type AgeCreditOptions } from '../../utils/tax';

// FA-4 (audit fiscal 2026-06-09) — dernière année où le plafond CELI est CONNU (annoncé, sourcé
// dans FISCAL_REFERENCE §7 via CELI_ANNUAL_LIMITS). Au-delà : extrapolation indexée arrondie 500 $.
// FA-8 (2026-06-11) : LAST_KNOWN_CELI_YEAR vient de utils/tax.ts (source unique partagée avec
// calculateCeliRoom — même formule d'extrapolation, l'ancien calcul local est supprimé).
//
// Janvier — Réinitialisation annuelle + recalcul plafonds CELI/FHSA/REER + FERR.
//
// 6 sous-blocs :
//  1. Reset accumulateurs (accRetraitsReerYear, accRentesYear)
//  2. Nouveau plafond CELI (V38: indexé inflation + arrondi 500$)
//  3. FHSA: éligibilité dynamique + carry-forward + fermeture 15 ans
//  4. REER: 18% revenu brut canadien année précédente - FE
//  5. FERR conversion à 71+ (retrait minimum)
//  6. Guyton-Klinger trigger

export interface JanuaryContext {
    m: number;
    startYear: number;
    simInflation: number;
    age: number;
    isRetired: boolean;
    activeUsersCount: number;
    oasClawbackNextPeriod: number;
    hasPurchasedPrimary: boolean;
    celiappOpeningYear: number;
    fhsaEligibleUsersCount: number;
    users: Array<{ birthYear?: number; age?: number; canadaArrivalYear?: number; isImmigrant?: boolean; hasOwnedPropertyLast4Years?: boolean; facteurEquivalence?: number } | undefined>;
    // Soldes courants (read-only)
    celiapp: number;
    reer: number;
    // [ITEM-2C] Registre REER PAR CONJOINT (Σ == reer). Sert au gate FERR per-conjoint (chaque conjoint
    // de 72+ convertit SA part au facteur RRIF de SON âge). Aligné sur `config.users` (même ordre/longueur).
    reerByUser: number[];
    liquid: number;
    nonReg: number;
    crypto: number;
    celi: number;
    // Accumulateurs
    accGrossIncomeYear: number;
    accRetraitsReerYearOld: number;     // valeur AVANT le reset (pour FERR margRate)
    incomeRetirementMonthly: number;
    fhsaRoomCurrent: number;
    fhsaLifetimeContrib: number;
    celiRoomCurrent: number;
    rrspRoomCurrent: number;
    taxCurrentYearGains: number;        // pour FERR margRate proxy
    prevPortfolioNW: number;
    loopYear: number;
}

export interface JanuaryHelpers {
    RRIF_RATES: Record<number, number>;
    calculateFiscalReport: (gross: number, deductions: number, withheld: number, year: number, skipBreakdown?: boolean, ageOpts?: AgeCreditOptions) => FiscalReport;
}

export interface JanuaryResult {
    // Reset
    accRetraitsReerYearReset: number;       // 0
    accRentesYearReset: number;              // 0
    monthlyOasReduction: number;             // oasClawback / 12
    // Plafonds
    celiRoomDelta: number;                   // ajouté à celiRoom
    fhsaRoomNew: number;
    rrspRoomDelta: number;                   // ajouté à rrspRoom (ou reset à 0 si 71+)
    rrspRoomReset: boolean;                  // true si âge > 71 (rrspRoom = 0)
    accGrossIncomeYearReset: number;         // 0
    // CELIAPP fermeture 15 ans
    celiappTransferToReer: number;           // si fermeture: solde transféré
    // FERR (only if age >= 72) — PER-CONJOINT [ITEM-2C]
    ferrMandatoryGross: number;          // total ménage (= Σ ferrGrossByUser) — débit du pool + assiette imposable
    ferrGrossByUser: number[];           // part FERR de chaque conjoint (débit du registre reerByUser)
    ferrTaxOnRrif: number;
    ferrLogMsg?: string;
    // Guyton-Klinger
    guytonKlingerFreeze: boolean;
    newPrevPortfolioNW: number;
    // Logs
    logs: string[];
}

export function processJanuaryReset(
    currentMonthIndex: number,
    ctx: JanuaryContext,
    helpers: JanuaryHelpers,
): JanuaryResult | null {
    if (currentMonthIndex !== 0 || ctx.m === 0) return null;

    const logs: string[] = [];
    const nextLoopYear = ctx.startYear + Math.floor(ctx.m / 12);

    // === 1. Plafond CELI annuel ===
    // FA-4 (audit fiscal 2026-06-09) : SOURCE UNIQUE `CELI_ANNUAL_LIMITS` pour les années connues
    // (l'ancien recalcul local 7000×inflation donnait 7 000 $ en 2027 vs 7 500 $ au doc — divergence
    // code↔doc). Au-delà de la dernière année connue : extrapolation indexée depuis cette valeur,
    // arrondie au 500 $ (mécanisme légal d'indexation du plafond CELI).
    const lastKnownCeliLimit = CELI_ANNUAL_LIMITS[LAST_KNOWN_CELI_YEAR];
    const celiLimitThisYear = nextLoopYear <= LAST_KNOWN_CELI_YEAR
        ? (CELI_ANNUAL_LIMITS[nextLoopYear] ?? lastKnownCeliLimit)
        : Math.round((lastKnownCeliLimit * Math.pow(1 + ctx.simInflation / 100, nextLoopYear - LAST_KNOWN_CELI_YEAR)) / CELI_LIMIT_ROUNDING) * CELI_LIMIT_ROUNDING;

    let totalCeliLimitThisYear = 0;
    ctx.users.filter(u => u).forEach(u => {
        const birthYear = u!.birthYear || (ctx.startYear - (u!.age || 30));
        const residencyStart = getResidencyStartYear(birthYear, u!.isImmigrant, u!.canadaArrivalYear);
        const ageThisYear = nextLoopYear - birthYear;
        if (ageThisYear >= 18 && nextLoopYear >= residencyStart) {
            totalCeliLimitThisYear += celiLimitThisYear;
        }
    });

    // === 2. FHSA: éligibilité dynamique + carry-forward + fermeture 15 ans OU 71 ans ===
    // Audit §6.10: ARC exige la fermeture du CELIAPP au 31 décembre de l'année
    // où le titulaire atteint 71 ans (ou après 15 ans, ou 1 an après le premier
    // retrait admissible — premier événement applicable). On ajoute le check 71 ans.
    const anyUserEligibleFhsa = !ctx.hasPurchasedPrimary && ctx.users.some(u => {
        if (!u) return false;
        const birthYear = u.birthYear || (ctx.startYear - (u.age || 30));
        const residencyStart = getResidencyStartYear(birthYear, u.isImmigrant, u.canadaArrivalYear);
        const ageThisYear = nextLoopYear - birthYear;
        const isFirstBuyer = !u.hasOwnedPropertyLast4Years;
        return ageThisYear >= 18 && ageThisYear < 71 && nextLoopYear >= residencyStart && isFirstBuyer;
    });

    const allUsersExceeded71 = ctx.users.every(u => {
        if (!u) return true;
        const birthYear = u.birthYear || (ctx.startYear - (u.age || 30));
        const ageThisYear = nextLoopYear - birthYear;
        return ageThisYear >= 71;
    });

    const yearsSinceOpening = nextLoopYear - ctx.celiappOpeningYear;
    const remainingLifetimeRoom = Math.max(0, (FHSA_LIFETIME_LIMIT_PER_USER * ctx.fhsaEligibleUsersCount) - ctx.fhsaLifetimeContrib);

    let fhsaRoomNew = 0;
    let celiappTransferToReer = 0;
    const closureForcedBy71 = allUsersExceeded71;
    if (anyUserEligibleFhsa && yearsSinceOpening < 15 && remainingLifetimeRoom > 0 && !closureForcedBy71) {
        const fhsaYearlyFixed = FHSA_ANNUAL_LIMIT_PER_USER * ctx.fhsaEligibleUsersCount;
        const unusedPrevious = ctx.fhsaRoomCurrent;
        const allowedCarryForward = Math.min(fhsaYearlyFixed, unusedPrevious);
        const newRoom = Math.min(remainingLifetimeRoom, fhsaYearlyFixed + allowedCarryForward);
        fhsaRoomNew = newRoom;
    } else if ((yearsSinceOpening >= 15 || closureForcedBy71) && ctx.celiapp > 0) {
        const reason = closureForcedBy71 ? "71 ans atteint" : "Fin des 15 ans";
        logs.push(`🏛️ CELIAPP: ${reason}. Transfert vers REER.`);
        celiappTransferToReer = ctx.celiapp;
        fhsaRoomNew = 0;
    } else {
        fhsaRoomNew = 0;
    }

    // === 3. REER: 18% revenu brut canadien année précédente - FE ===
    // Use RRSP_ANNUAL_LIMITS when year is known; extrapolate beyond table via
    // inflation + 0.5%/yr from the 2026 official cap (§7.G RRSP desync fix).
    const rrspYearlyCap = RRSP_ANNUAL_LIMITS[nextLoopYear]
        ?? (RRSP_ANNUAL_LIMITS[2026] * Math.pow(1 + (ctx.simInflation + 0.5) / 100, nextLoopYear - 2026));
    const totalFE = ctx.users.reduce((acc, u) => acc + (u?.facteurEquivalence || 0), 0);
    const newRrspRoom = Math.max(0, Math.min(rrspYearlyCap * ctx.activeUsersCount, ctx.accGrossIncomeYear * RRSP_ROOM_RATE) - totalFE);

    // === 4. FERR — retrait minimum obligatoire (dès 72 ans) ===
    let ferrMandatoryGross = 0;
    let ferrTaxOnRrif = 0;
    let ferrLogMsg: string | undefined;
    const ferrGrossByUser = ctx.reerByUser.map(() => 0);
    // Règle ARC (cf docs/FISCAL_REFERENCE.md §6) : la conversion REER→FERR est obligatoire AU PLUS
    // TARD à la fin de l'année des 71 ans, mais AUCUN retrait minimum n'est dû l'année d'ouverture du
    // FERR. Pour le cas standard (conversion à l'échéance des 71 ans), le 1er retrait minimum
    // obligatoire tombe donc l'année des 72 ans → gate `>= 72`. Le facteur 71 (5,28 %, RRIF_RATES[71])
    // n'existe que pour une conversion VOLONTAIRE précoce (non modélisée ici).
    // (Révision 2026-06 : un commit avait passé le gate à 71 — anticipait d'un an le revenu imposable
    // + la retenue + le clawback PSV/SRG. Corrigé après audit fiscal-accuracy, choix de Marc.)
    // [ITEM-2C] PER-CONJOINT : chaque conjoint de 72+ convertit SA part REER (`reerByUser[i]`) au facteur
    // RRIF de SON âge. Avant : un âge MÉNAGE unique (user1) sur le pool entier → mauvais timing pour un
    // couple à écart d'âge. Défaut additif : âges égaux ⇒ Σ = `reer × rate` (identique à l'ancien calcul).
    const yearsElapsed = Math.floor(ctx.m / 12);
    const currentAgeOfUser = (i: number): number => {
        // user0 : `ctx.age` est SON âge courant authoritative (= users[0].age + yearsElapsed côté moteur).
        if (i === 0) return ctx.age;
        const u = ctx.users[i];
        if (u?.age != null && Number.isFinite(u.age)) return u.age + yearsElapsed;
        // Repli depuis `birthYear` : un conjoint réel saisi par année de naissance (sans `age`) doit quand
        // même déclencher SA FERR — sinon sa part REER ne se convertirait jamais (sous-imposition silencieuse).
        if (u?.birthYear != null && Number.isFinite(u.birthYear)) return (ctx.startYear + yearsElapsed) - u.birthYear;
        return Number.NEGATIVE_INFINITY; // conjoint sans âge ni année de naissance → jamais FERR
    };
    for (let i = 0; i < ctx.reerByUser.length; i++) {
        const ageI = currentAgeOfUser(i);
        if (ageI < RRIF_FIRST_WITHDRAWAL_AGE) continue;
        const rrifRateI = rrifRateForAge(ageI, helpers.RRIF_RATES);
        ferrGrossByUser[i] = Math.max(0, Number.isFinite(ctx.reerByUser[i]) ? ctx.reerByUser[i] : 0) * rrifRateI;
        ferrMandatoryGross += ferrGrossByUser[i];
    }
    if (ferrMandatoryGross > 0) {
        // V47: RRIF Marginal Rate Fix
        const priorYearGainsProxy = (ctx.taxCurrentYearGains / 0.25) || 0;
        const inflFactorAtNow = Math.pow(1 + ctx.simInflation / 100, ctx.m / 12);
        const deflatedIncomeForMargRate = ((ctx.accRetraitsReerYearOld + priorYearGainsProxy + (ctx.isRetired ? ctx.incomeRetirementMonthly * 12 : 0)) / ctx.activeUsersCount) / inflFactorAtNow;
        // §6.2 — applique les crédits 65+ et revenu retraite au calcul du taux marginal FERR.
        // Sans cela (audit silent-failure FINDING 1), la retenue FERR est surestimée
        // de ~1 200-1 800$/an pour un retraité 72+.
        // FA-8 (2026-06-11, aligné FA-1) — assiette du crédit pension = pension ADMISSIBLE
        // seulement (FERR/DB — PAS RRQ/PSV/SRG, cf FISCAL_REFERENCE §4). Proxy disponible dans
        // ctx : les retraits REER/FERR de l'année précédente par tête, déflatés (à 72+, cas
        // standard = retraits FERR ; la rente DB n'est pas isolable dans JanuaryContext → exclue,
        // crédit sous-évalué = retenue surévaluée = conservateur ; l'année charnière des 72 ans,
        // ce sont les retraits REER des 71 ans — légère surévaluation ponctuelle). Avant : le
        // revenu TOTAL (RRQ+PSV+SRG+gains inclus) était passé — assiette surévaluée vs FA-1.
        // Impact chiffré : NUL aujourd'hui — `calculateFiscalReport().marginalRate` =
        // `getMarginalRate(netTaxable)`, fonction des PALIERS seulement (les crédits d'âge/
        // pension n'y entrent pas), et la retenue FERR est réconciliée à la déclaration de
        // décembre (effet de timing pur). On passe la bonne assiette pour que le calcul reste
        // juste si marginalRate devient un jour crédit-aware.
        const deflatedEligiblePension = (ctx.accRetraitsReerYearOld / ctx.activeUsersCount) / inflFactorAtNow;
        const ageOptsFerr: AgeCreditOptions = {
            age: ctx.age,
            eligiblePensionIncome: deflatedEligiblePension,
            hasSpouse: ctx.activeUsersCount > 1,
            familyIncome: deflatedIncomeForMargRate * ctx.activeUsersCount,
        };
        const rrifMarginalRate = helpers.calculateFiscalReport(deflatedIncomeForMargRate, 0, 0, ctx.loopYear, false, ageOptsFerr).marginalRate;

        // M-1 (2026-06) : `calculateFiscalReport(...).marginalRate` est un DÉCIMAL (~0,30–0,53),
        // pas un pourcentage. L'ancien `/ 100` rendait la retenue FERR ~100× trop faible. La retenue
        // n'impacte pas le patrimoine final (réconcilié en décembre via taxCurrentYear.reer), mais
        // l'affichage de la retenue mensuelle / WithheldTaxRrif / ImpotRetraitREER était faux.
        ferrTaxOnRrif = ferrMandatoryGross * rrifMarginalRate;
        const netRrif = ferrMandatoryGross - ferrTaxOnRrif;
        ferrLogMsg = `🏦 FERR (per-conjoint): Brut ${ferrMandatoryGross.toFixed(2)}$ → Net ${netRrif.toFixed(2)}$ → Liquidités`;
    }

    // === 5. Guyton-Klinger trigger ===
    let guytonKlingerFreeze = false;
    let newPrevPortfolioNW = ctx.prevPortfolioNW;
    if (ctx.isRetired && ctx.m > 12) {
        const currentPortfolio = ctx.liquid + ctx.celi + ctx.reer + ctx.nonReg + ctx.crypto;
        guytonKlingerFreeze = currentPortfolio < ctx.prevPortfolioNW * 0.95;
        if (guytonKlingerFreeze) logs.push('❄️ Guyton-Klinger: Gel de l’indexation des dépenses');
        newPrevPortfolioNW = currentPortfolio;
    }

    return {
        accRetraitsReerYearReset: 0,
        accRentesYearReset: 0,
        monthlyOasReduction: ctx.oasClawbackNextPeriod / 12,
        celiRoomDelta: totalCeliLimitThisYear,
        fhsaRoomNew,
        rrspRoomDelta: ctx.age <= 71 ? newRrspRoom : 0,
        rrspRoomReset: ctx.age > 71,
        accGrossIncomeYearReset: 0,
        celiappTransferToReer,
        ferrMandatoryGross,
        ferrGrossByUser,
        ferrTaxOnRrif,
        ferrLogMsg,
        guytonKlingerFreeze,
        newPrevPortfolioNW,
        logs,
    };
}
