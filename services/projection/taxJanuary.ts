// services/projection/taxJanuary.ts
// Cycle 23 split (depuis taxCycle.ts): réinitialisation annuelle de janvier.
// Cycle 12 (origine): exécuté uniquement en janvier (currentMonthIndex === 0 && m > 0).

import { RRIF_FIRST_WITHDRAWAL_AGE, RRSP_TO_RRIF_CONVERSION_AGE, rrifRateForAge, projeterAuPatronMga } from './helpers';
import { FHSA_LIFETIME_LIMIT_PER_USER, FHSA_ANNUAL_LIMIT_PER_USER, FHSA_MAX_PARTICIPATION_YEARS, FHSA_MAX_HOLDER_AGE, REGISTERED_PLAN_MIN_AGE, RRSP_ANNUAL_LIMITS, LAST_KNOWN_RRSP_YEAR, RRSP_ROOM_RATE, CELI_LIMIT_ROUNDING, CELI_ANNUAL_LIMITS, LAST_KNOWN_CELI_YEAR, getResidencyStartYear, type FiscalReport, type AgeCreditOptions } from '../../utils/tax';
import { formatCAD } from '../../utils/format';

// [ENG-GK-THRESHOLD-KNIFE] Bande de lissage du gel Guyton-Klinger — DESIGN (stabilité du modèle
// maison), pas des chiffres fiscaux : indexation pleine jusqu'à −4 % de baisse du portefeuille,
// gel total dès −6 %, linéaire entre — centrée sur l'ancien seuil couteau de −5 %.
const GK_SMOOTH_CEIL_DROP = 0.06;
const GK_SMOOTH_BAND_WIDTH = 0.02;

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
    /**
     * [ENG-DIVORCE-ROOM-COUPLE] Titulaires dont les DROITS (CELI, FHSA, facteur d'équivalence)
     * comptent cette année. Défaut : `users` — rétrocompat bit-identique pour tout appelant qui
     * ne le passe pas.
     *
     * ⚠️ Pourquoi un champ SÉPARÉ plutôt que de raccourcir `users` : la boucle FERR itère sur
     * `reerByUser.length` et lit `ctx.users[i]` pour l'âge du conjoint i. Une liste `users`
     * raccourcie y rendrait `undefined` → `currentAgeOfUser` renvoie `-Infinity` → la part REER
     * de l'index 1 ne se convertirait JAMAIS en FERR, en silence. C'est le piège exact d'un
     * précédent correctif (`slice(0,1)` cassant une garde de longueur sans une trace).
     * Les droits sont PERSONNELS, la conversion FERR est adossée au registre per-conjoint :
     * deux questions différentes, deux listes.
     */
    roomUsers?: Array<{ birthYear?: number; age?: number; canadaArrivalYear?: number; isImmigrant?: boolean; hasOwnedPropertyLast4Years?: boolean; facteurEquivalence?: number } | undefined>;
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
    /** [FISC-RRSP-ROOM-PER-USER] Revenu gagné de l'année PAR personne ([Marc, Anna]) — SOURCE
     *  UNIQUE du room REER (règle ARC : par personne ; l'ancien scalaire ménage est supprimé). */
    accGrossIncomeYearByUser: [number, number];
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
    calculateFiscalReport: (gross: number, deductions: number, withheld: number, year: number, skipBreakdown?: boolean, ageOpts?: AgeCreditOptions, employmentIncome?: number, realDeflator?: number) => FiscalReport;
}

interface JanuaryResult {
    // Reset
    accRetraitsReerYearReset: number;       // 0
    accRentesYearReset: number;              // 0
    monthlyOasReduction: number;             // oasClawback / 12
    // Plafonds
    celiRoomDelta: number;                   // ajouté à celiRoom
    fhsaRoomNew: number;
    rrspRoomDelta: number;                   // ajouté à rrspRoom (ou reset à 0 si 71+)
    rrspRoomReset: boolean;                  // true si âge > 71 (rrspRoom = 0)
    // CELIAPP fermeture 15 ans
    celiappTransferToReer: number;           // si fermeture: solde transféré
    // FERR (only if age >= 72) — PER-CONJOINT [ITEM-2C]
    ferrMandatoryGross: number;          // total ménage (= Σ ferrGrossByUser) — débit du pool + assiette imposable
    ferrGrossByUser: number[];           // part FERR de chaque conjoint (débit du registre reerByUser)
    ferrTaxOnRrif: number;
    ferrLogMsg?: string;
    // Guyton-Klinger
        /** [ENG-GK-THRESHOLD-KNIFE] facteur d'indexation des dépenses 0..1 (1 = pleine, 0 = gel total, lissé linéairement sur la baisse 0-5 % du portefeuille). */
    guytonKlingerIndexationFactor: number;
    newPrevPortfolioNW: number;
    // Logs
    logs: string[];
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// [DETTE-GODFN-JANUARY 2026-09-04] `processJanuaryReset` (183 lignes) est DÉCOUPÉE en étapes
// nommées — à COMPORTEMENT STRICTEMENT INCHANGÉ (empreinte des grandeurs publiées
// `scripts/mesureOrdreBoucle.ts` identique à l'octet avant/après + les tests du module).
// ⚠️ Toute extraction future préserve l'ORDRE des opérations arithmétiques : l'empreinte juge.
// ───────────────────────────────────────────────────────────────────────────────────────────

/** === 1. Plafond CELI annuel (somme des droits PERSONNELS des adultes résidents) === */
function plafondCeliAnnuel(ctx: JanuaryContext, roomUsers: JanuaryContext['users'], nextLoopYear: number): number {
    // FA-4 (audit fiscal 2026-06-09) : SOURCE UNIQUE `CELI_ANNUAL_LIMITS` pour les années connues
    // (l'ancien recalcul local 7000×inflation donnait 7 000 $ en 2027 vs 7 500 $ au doc — divergence
    // code↔doc). Au-delà de la dernière année connue : extrapolation indexée depuis cette valeur,
    // arrondie au 500 $ (mécanisme légal d'indexation du plafond CELI).
    const lastKnownCeliLimit = CELI_ANNUAL_LIMITS[LAST_KNOWN_CELI_YEAR];
    const celiLimitThisYear = nextLoopYear <= LAST_KNOWN_CELI_YEAR
        ? (CELI_ANNUAL_LIMITS[nextLoopYear] ?? lastKnownCeliLimit)
        : Math.round((lastKnownCeliLimit * Math.pow(1 + ctx.simInflation / 100, nextLoopYear - LAST_KNOWN_CELI_YEAR)) / CELI_LIMIT_ROUNDING) * CELI_LIMIT_ROUNDING;

    let totalCeliLimitThisYear = 0;
    roomUsers.filter(u => u).forEach(u => {
        const birthYear = u!.birthYear || (ctx.startYear - (u!.age || 30));
        const residencyStart = getResidencyStartYear(birthYear, u!.isImmigrant, u!.canadaArrivalYear);
        const ageThisYear = nextLoopYear - birthYear;
        if (ageThisYear >= REGISTERED_PLAN_MIN_AGE && nextLoopYear >= residencyStart) {
            totalCeliLimitThisYear += celiLimitThisYear;
        }
    });
    return totalCeliLimitThisYear;
}

/** === 2. FHSA : éligibilité dynamique + carry-forward + fermeture 15 ans OU 71 ans === */
function roulementFhsa(
    ctx: JanuaryContext,
    roomUsers: JanuaryContext['users'],
    nextLoopYear: number,
    logs: string[],
): { fhsaRoomNew: number; celiappTransferToReer: number } {
    // Audit §6.10: ARC exige la fermeture du CELIAPP au 31 décembre de l'année
    // où le titulaire atteint 71 ans (ou après 15 ans, ou 1 an après le premier
    // retrait admissible — premier événement applicable). On ajoute le check 71 ans.
    const anyUserEligibleFhsa = !ctx.hasPurchasedPrimary && roomUsers.some(u => {
        if (!u) return false;
        const birthYear = u.birthYear || (ctx.startYear - (u.age || 30));
        const residencyStart = getResidencyStartYear(birthYear, u.isImmigrant, u.canadaArrivalYear);
        const ageThisYear = nextLoopYear - birthYear;
        const isFirstBuyer = !u.hasOwnedPropertyLast4Years;
        return ageThisYear >= REGISTERED_PLAN_MIN_AGE && ageThisYear < FHSA_MAX_HOLDER_AGE && nextLoopYear >= residencyStart && isFirstBuyer;
    });

    const allUsersExceeded71 = roomUsers.every(u => {
        if (!u) return true;
        const birthYear = u.birthYear || (ctx.startYear - (u.age || 30));
        const ageThisYear = nextLoopYear - birthYear;
        return ageThisYear >= FHSA_MAX_HOLDER_AGE;
    });

    const yearsSinceOpening = nextLoopYear - ctx.celiappOpeningYear;
    const remainingLifetimeRoom = Math.max(0, (FHSA_LIFETIME_LIMIT_PER_USER * ctx.fhsaEligibleUsersCount) - ctx.fhsaLifetimeContrib);

    let fhsaRoomNew = 0;
    let celiappTransferToReer = 0;
    const closureForcedBy71 = allUsersExceeded71;
    if (anyUserEligibleFhsa && yearsSinceOpening < FHSA_MAX_PARTICIPATION_YEARS && remainingLifetimeRoom > 0 && !closureForcedBy71) {
        const fhsaYearlyFixed = FHSA_ANNUAL_LIMIT_PER_USER * ctx.fhsaEligibleUsersCount;
        const unusedPrevious = ctx.fhsaRoomCurrent;
        const allowedCarryForward = Math.min(fhsaYearlyFixed, unusedPrevious);
        const newRoom = Math.min(remainingLifetimeRoom, fhsaYearlyFixed + allowedCarryForward);
        fhsaRoomNew = newRoom;
    } else if ((yearsSinceOpening >= FHSA_MAX_PARTICIPATION_YEARS || closureForcedBy71) && ctx.celiapp > 0) {
        const reason = closureForcedBy71 ? "71 ans atteint" : "Fin des 15 ans";
        logs.push(`🏛️ CELIAPP: ${reason}. Transfert vers REER.`);
        celiappTransferToReer = ctx.celiapp;
        fhsaRoomNew = 0;
    } else {
        fhsaRoomNew = 0;
    }
    return { fhsaRoomNew, celiappTransferToReer };
}

/** === 3. Droits REER annuels : 18 % du revenu brut canadien de l'année précédente − FE === */
function droitsReerAnnuels(ctx: JanuaryContext, roomUsers: JanuaryContext['users'], nextLoopYear: number): number {
    // Plafond REER : la table tant que l'année y figure, extrapolation à `inflation + 0,5 pp`
    // au-delà — depuis la DERNIÈRE année connue de la table, comme le fait déjà le CELI juste
    // au-dessus (`LAST_KNOWN_CELI_YEAR`).
    // ⚠️ [FISC-RRSP-EXTRAP-05] Le `+ 0,5 pp` est une HYPOTHÈSE DE MODÈLE, pas une valeur sourcée :
    // le plafond est de l'ARC, la vitesse à laquelle on le prolonge ne l'est pas. Documentée comme
    // telle dans `docs/FISCAL_REFERENCE.md` §7 « REER — plafonds annuels », avec l'écart mesuré
    // contre l'indexation réellement observée (2,72 %/an de 2010 à 2026).
    // ⚠️ L'ancre était le littéral `2026` alors que la table va jusqu'à 2030 : la couture
    // 2030 → 2031 sautait de +1 663 $ (+4,54 %) en une année (mesuré à inflation 2 %).
    // ⚠️ ANCRE DIFFÉRENTE des quatre autres sites du patron, et c'est VOULU : la base vient
    // d'une TABLE qui s'arrête à `LAST_KNOWN_RRSP_YEAR`, donc on prolonge depuis CETTE année-là,
    // pas depuis le début de la projection. La vitesse est partagée, l'ancre ne l'est pas
    // (`UNE-ANCRE-D-EXTRAPOLATION-EN-DUR-FABRIQUE-UNE-MARCHE`).
    const rrspYearlyCap = RRSP_ANNUAL_LIMITS[nextLoopYear]
        ?? projeterAuPatronMga(RRSP_ANNUAL_LIMITS[LAST_KNOWN_RRSP_YEAR], ctx.simInflation,
            nextLoopYear - LAST_KNOWN_RRSP_YEAR);
    // [FISC-RRSP-ROOM-PER-USER] Règle ARC (décision Marc A1 2026-08-20, ADR 0014 : « par
    // personne ») : les droits REER se calculent PAR PERSONNE — room_i = min(plafond,
    // revenu_gagné_i × 18 %) − FE_i, clampé à 0 par personne, puis sommé. L'ancien calcul
    // ménage min(cap × N, Σrevenus × 18 %) − ΣFE accordait au ménage le plafond de DEUX
    // personnes sur le revenu d'UNE seule : MESURÉ 45 000 $ accordés vs 34 480 $ dus
    // (250 k$ mono-gagnant, droits 2027 — plafond 2026 : 33 810) = +10 520 $/an de droits
    // fantômes. Effets du clamp par personne : le FE d'un conjoint sans revenu ne réduit plus
    // le room de l'autre, et un revenu au-delà du plafond ne « déborde » plus sur le conjoint.
    // ⚠️ Alignement POSITIONNEL : roomUsers[i] doit rester l'utilisateur du slot i du tuple —
    // ne PAS copier le patron `.filter(u => u).forEach` de la boucle CELI ci-dessus, qui
    // désynchroniserait les index en silence.
    const newRrspRoom = roomUsers.reduce((acc, u, i) => {
        // `?? 0` couvre undefined mais PAS NaN — un slot corrompu rendrait rrspRoom NaN qui
        // remonte dans REERMax puis les allocations (2 producteurs alimentent le registre).
        const rawEarned = ctx.accGrossIncomeYearByUser[i] ?? 0;
        const earnedIncome = Number.isFinite(rawEarned) ? rawEarned : 0;
        const roomUser = Math.min(rrspYearlyCap, earnedIncome * RRSP_ROOM_RATE) - (u?.facteurEquivalence || 0);
        return acc + Math.max(0, roomUser);
    }, 0);
    return newRrspRoom;
}

/** === 4. FERR — retrait minimum obligatoire (dès 72 ans), PER-CONJOINT === */
function retraitFerrObligatoire(ctx: JanuaryContext, helpers: JanuaryHelpers): {
    ferrMandatoryGross: number; ferrGrossByUser: number[]; ferrTaxOnRrif: number; ferrLogMsg?: string;
} {
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
        // Impact chiffré : NUL aujourd'hui côté PALIERS — `marginalRate` reste fonction des
        // paliers seulement (les crédits d'âge/pension n'y entrent pas), et la retenue FERR est
        // réconciliée à la déclaration de décembre (effet de timing pur). On passe la bonne
        // assiette pour que le calcul reste juste si marginalRate devient un jour crédit-aware.
        // ⚠️ Depuis le lot 136, `marginalRate` suit (year, realDeflator) — voir l'appel plus bas.
        const deflatedEligiblePension = (ctx.accRetraitsReerYearOld / ctx.activeUsersCount) / inflFactorAtNow;
        const ageOptsFerr: AgeCreditOptions = {
            age: ctx.age,
            eligiblePensionIncome: deflatedEligiblePension,
            hasSpouse: ctx.activeUsersCount > 1,
            familyIncome: deflatedIncomeForMargRate * ctx.activeUsersCount,
        };
        // [FISC-MARGINAL-SPACE] L'assiette ci-dessus est DÉFLATÉE (dollars 2026) : depuis que
        // `marginalRate` suit l'année du rapport, il faut passer AUSSI le déflateur (convention
        // [FISC-BRACKET-REALINDEX], comme taxDecember) — sinon revenu réel contre paliers nominaux
        // de loopYear = retenue FERR sous-évaluée. Avant le lot 136, la cohérence de ce site était
        // ACCIDENTELLE (marginal figé aux paliers 2026 = l'espace du revenu déflaté).
        const rrifMarginalRate = helpers.calculateFiscalReport(deflatedIncomeForMargRate, 0, 0, ctx.loopYear, false, ageOptsFerr, undefined, inflFactorAtNow).marginalRate;

        // M-1 (2026-06) : `calculateFiscalReport(...).marginalRate` est un DÉCIMAL (~0,30–0,53),
        // pas un pourcentage. L'ancien `/ 100` rendait la retenue FERR ~100× trop faible. La retenue
        // n'impacte pas le patrimoine final (réconcilié en décembre via taxCurrentYear.reer), mais
        // l'affichage de la retenue mensuelle / WithheldTaxRrif / ImpotRetraitREER était faux.
        ferrTaxOnRrif = ferrMandatoryGross * rrifMarginalRate;
        const netRrif = ferrMandatoryGross - ferrTaxOnRrif;
        // ⚠️ `decimals: 2` : l'ancien code écrivait `.toFixed(2)$`. Passer au défaut (0 décimale)
        // aurait CHANGÉ la sortie de ce journal — la migration route le formatage vers la source
        // unique, elle ne décide pas à sa place de la précision affichée.
        ferrLogMsg = `🏦 FERR (per-conjoint): Brut ${formatCAD(ferrMandatoryGross, { decimals: 2 })} → Net ${formatCAD(netRrif, { decimals: 2 })} → Liquidités`;
    }
    return { ferrMandatoryGross, ferrGrossByUser, ferrTaxOnRrif, ferrLogMsg };
}

/** === 5. Guyton-Klinger : facteur d'indexation des dépenses (bande lissée autour du seuil) === */
function facteurGuytonKlinger(ctx: JanuaryContext, logs: string[]): {
    guytonKlingerIndexationFactor: number; newPrevPortfolioNW: number;
} {
    // [ENG-GK-THRESHOLD-KNIFE] Le gel binaire à −5 % était un seuil COUTEAU : quelques centaines
    // de dollars d'impôt suffisaient à déclencher un gel valant −174,36 $/mois À VIE, et le
    // CLASSEMENT des stratégies basculait sur un écart négligeable (panel #564 : le CID de
    // 256 $/an faisait passer MELTDOWN de 1re à 3e). Désormais LISSÉ dans une BANDE autour du
    // seuil : indexation pleine jusqu'à −4 % de baisse, nulle dès −6 %, linéaire entre les deux.
    // LOIN du seuil le comportement est STRICTEMENT identique à l'ancien (baisse < 4 % →
    // indexation pleine comme avant ; ≥ 6 % → gel total comme avant) — seul le voisinage du
    // couteau change. (Un premier jet lissait 0→−5 % : il réduisait l'indexation dès −0,1 % de
    // baisse — changement de politique BEAUCOUP plus large que le défaut à corriger, attrapé
    // par les goldens : +8 683 $ sur la fixture FERR.) NB : le GK canonique gèle en binaire,
    // mais le moteur applique une variante maison (seuil NW, pas taux de retrait initial) —
    // le lissage corrige l'INSTABILITÉ de la variante maison.
    let guytonKlingerIndexationFactor = 1;
    let newPrevPortfolioNW = ctx.prevPortfolioNW;
    if (ctx.isRetired && ctx.m > 12) {
        const currentPortfolio = ctx.liquid + ctx.celi + ctx.reer + ctx.nonReg + ctx.crypto;
        // [Revue #683 F1] « strictement identique hors bande » ne vaut que pour prev > 0 FINI :
        // un portefeuille précédent négatif ou corrompu rend le facteur 1 (pas de gel — l'ancien
        // code gelait parfois sur un prev négatif, comportement dénué de sens économique).
        const rawDrop = (ctx.prevPortfolioNW - currentPortfolio) / ctx.prevPortfolioNW;
        const drop = ctx.prevPortfolioNW > 0 && Number.isFinite(rawDrop) ? Math.max(0, rawDrop) : 0;
        guytonKlingerIndexationFactor = Math.max(0, Math.min(1, (GK_SMOOTH_CEIL_DROP - drop) / GK_SMOOTH_BAND_WIDTH));
        if (guytonKlingerIndexationFactor < 1) {
            logs.push(`❄️ Guyton-Klinger: indexation des dépenses réduite à ${Math.round(guytonKlingerIndexationFactor * 100)} % (portefeuille −${(drop * 100).toFixed(1)} %)`);
        }
        newPrevPortfolioNW = currentPortfolio;
    }
    return { guytonKlingerIndexationFactor, newPrevPortfolioNW };
}

export function processJanuaryReset(
    currentMonthIndex: number,
    ctx: JanuaryContext,
    helpers: JanuaryHelpers,
): JanuaryResult | null {
    if (currentMonthIndex !== 0 || ctx.m === 0) return null;

    const logs: string[] = [];
    const nextLoopYear = ctx.startYear + Math.floor(ctx.m / 12);
    // [ENG-DIVORCE-ROOM-COUPLE] Les droits sont PERSONNELS : ceux d'un conjoint parti (divorce)
    // ou décédé ne s'ajoutent plus aux miens. `users` reste INTACT pour la boucle FERR.
    const roomUsers = ctx.roomUsers ?? ctx.users;

    const totalCeliLimitThisYear = plafondCeliAnnuel(ctx, roomUsers, nextLoopYear);
    const { fhsaRoomNew, celiappTransferToReer } = roulementFhsa(ctx, roomUsers, nextLoopYear, logs);
    const newRrspRoom = droitsReerAnnuels(ctx, roomUsers, nextLoopYear);
    const { ferrMandatoryGross, ferrGrossByUser, ferrTaxOnRrif, ferrLogMsg } = retraitFerrObligatoire(ctx, helpers);
    const { guytonKlingerIndexationFactor, newPrevPortfolioNW } = facteurGuytonKlinger(ctx, logs);

    return {
        accRetraitsReerYearReset: 0,
        accRentesYearReset: 0,
        monthlyOasReduction: ctx.oasClawbackNextPeriod / 12,
        celiRoomDelta: totalCeliLimitThisYear,
        fhsaRoomNew,
        rrspRoomDelta: ctx.age <= RRSP_TO_RRIF_CONVERSION_AGE ? newRrspRoom : 0,
        rrspRoomReset: ctx.age > RRSP_TO_RRIF_CONVERSION_AGE,
        celiappTransferToReer,
        ferrMandatoryGross,
        ferrGrossByUser,
        ferrTaxOnRrif,
        ferrLogMsg,
        guytonKlingerIndexationFactor,
        newPrevPortfolioNW,
        logs,
    };
}
