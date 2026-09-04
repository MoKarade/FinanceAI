// services/projection/monthlyOutput.ts
// Cycle 21: assemblage du point de données mensuel (data.push) — ~100 lignes.
// Inclut: calcul CoastFIRE + BaristaFIRE, puis formatage complet du
// ProjectionChartPoint (mode déterministe) ou point minimal (mode MC).
//
// Pattern: Pure Function — reçoit un contexte immuable, retourne le point.

import type { ProjectionChartPoint } from './types';
import {
    COAST_FIRE_ASSUMED_ANNUAL_GROWTH, BARISTA_ASSUMED_MONTHLY_INCOME, FIRE_TARGET_MULTIPLE,
} from './modelAssumptions';
// [PERF-ENGINE-TOFIXED-ROUND] round2 = Number(x.toFixed(2)) bit-identique, ~13× plus rapide —
// ~92 champs par mois passaient par toFixed dans la boucle chaude. Parité prouvée par fuzz
// (projection.round2.test.ts) ; la garde du même fichier interdit de réintroduire toFixed(2) ici.
import { round2 } from './helpers';

type TaxBucket = { revenu: number; gains: number; reer: number; divers: number };

// [PERF-ENGINE-DATELABEL-INTL] Table des 12 mois abrégés, construite UNE fois au chargement du
// module — même patron (et même raison) que `WEEKDAY_SHORT_FR` dans `dailyLedger.ts`.
//
// Pourquoi : `toLocaleString('fr-CA', { month: 'short' })` était appelé À CHAQUE MOIS de CHAQUE run.
// Mesuré 79,4 µs/appel contre 0,023 µs pour un accès indexé (~3 400×) → ~45 ms par run déterministe
// pour ce seul point, sur un chemin qui tourne à chaque debounce de saisie (300 ms) dans l'onglet
// Futur. Le coût vient de la construction d'un formateur Intl à chaque appel, pas du formatage.
//
// ⚠️ La table est construite depuis `toLocaleString` — PAS depuis une liste de noms recopiée à la
// main, qui divergerait du locale en silence (classe DOC-METRIQUE-RECOPIEE appliquée aux données).
// ⚠️ Indexée par `getMonth()` LOCAL, et les dates sources sont construites en LOCAL
// (`new Date(2026, i, 1)`) : c'est exactement ce que faisait l'appel remplacé, qui lisait lui aussi
// le fuseau local (aucun `timeZone` passé) sur un `currentLoopDate` local
// (`new Date(startYear, startMonth + i, 1)`, projection.ts). Le libellé rendu est donc
// bit-identique — utiliser UTC d'un côté et local de l'autre décalerait le mois d'un cran.
const MONTH_SHORT_FR: ReadonlyArray<string> = Array.from({ length: 12 }, (_, i) =>
    new Date(2026, i, 1).toLocaleString('fr-CA', { month: 'short' }));

export interface MonthlyOutputCtx {
    m: number;
    retirementMonthIndex: number;
    fireTargetNetWorth: number;
    futureFireTarget: number;
    simInflation: number;
    expenseMultiplier: number;
    effectiveBaseExpenses: number;
    enableMonteCarlo: boolean;
    /**
     * [ENG-MC-OBSERVABILITY] Force le point COMPLET même sous Monte-Carlo. Défaut : absent (donc
     * le point allégé, comportement de production inchangé).
     *
     * ⚠️ Pourquoi ce drapeau existe : sous MC, ce module ne rend que `{ NetWorth, monthIndex }`
     * — un choix de PERFORMANCE assumé (jusqu'à ~600 k objets retenus sinon). Mais le divorce,
     * la mortalité du conjoint, le LTC et la perte d'emploi n'existent QUE sous MC : leurs flux
     * mensuels étaient donc INOBSERVABLES, et trois lots ont dû se rabattre sur des agrégats ou
     * des tests de fonction pure (`RetraitREER` pendant un divorce, `ImpotLatent`, et l'absence de
     * garde de conservation sur le splitter).
     *
     * Réservé aux TESTS et aux diagnostics : ne jamais l'activer sur un chemin utilisateur, la
     * boucle MC retiendrait tous les points complets de toutes les itérations.
     */
    verboseMonthlyPoints?: boolean;
    rawNetWorth: number;
    // Labels
    currentLoopDate: Date;
    loopYear: number;
    age: number;
    isRetired: boolean;
    // Revenus / dépenses
    incomeMarc: number;
    incomeAnna: number;
    incomeRetirement: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    // Enfants
    childMonthlyCost: number;
    childGrossCost: number;
    childBenefits: number;
    reeeContribMonthly: number;
    reeePayoutMonthly: number;
    // Phase 3 Tier 2 — REEE cumulés ménage
    reeeContribCum: number;
    reeeGrantsCum: number;
    // Phase 3 Tier 3 — dividendes mensuels + revenus de placement imposables
    dividendIncome: number;
    taxableInvIncome: number;
    // Phase 3 Tier 3 — taux d'imposition (par adulte)
    marginalTaxRate: number;
    effectiveTaxRate: number;
    // Phase 3 Tier 3 — split pensions retraite
    pensionRRQ: number;
    pensionPSV: number;
    pensionPrivee: number;
    // Immobilier
    immoHypo: number;
    immoCharges: number;
    immoInterest: number;
    immoPrincipal: number;
    totalRentalIncome: number;
    // Actifs
    liquid: number;
    celi: number;
    celiapp: number;
    reer: number;
    reee: number;
    nonReg: number;
    crypto: number;
    // Retraits et espaces
    retraitReerMois: number;
    retraitCeliMois: number;
    celiRoom: number;
    rrspRoom: number;
    fhsaRoom: number;
    // Immobilier / dettes
    rapRepaymentDueTotal: number;
    realEstateEquity: number;
    mortgageBalance: number;
    activeDebtsTotal: number;
    /** Découvert non couvert porté en dette [PV-6] — soustrait du patrimoine, désormais EXPOSÉ. */
    liquidDebt: number;
    /** HELOC du levier Smith — soustrait du patrimoine (actif réinvesti dans NonReg). */
    smithManoeuvreDebt: number;
    // Valeurs précédentes (diff)
    prevNW: number;
    prevCELI: number;
    prevREER: number;
    prevLiquid: number;
    // Impôts affichage
    impotLatent: number;
    fluxImpots: number;
    impotReerMois: number;
    impotSalaireMois: number;
    impotGainsMois: number;
    impotDiversMois: number;
    taxPaidRevenu: number;
    taxPaidGains: number;
    taxPaidDivers: number;
    taxPaidREER: number;
    taxOnRrif: number;
    // Contributions / retraits suivi mensuel
    contribCELI: number;
    withdrawalCELI: number;
    contribREER: number;
    withdrawalREER: number;
    contribNonReg: number;
    withdrawalNonReg: number;
    contribCrypto: number;
    withdrawalCrypto: number;
    contribLiquid: number;
    withdrawalLiquid: number;
    contribCELIAPP: number;
    withdrawalCELIAPP: number;
    contribREEE: number;
    withdrawalREEE: number;
    // Croissance marché
    growthCELI: number;
    growthREER: number;
    growthNonReg: number;
    growthCrypto: number;
    growthLiquid: number;
    growthCELIAPP: number;
    growthREEE: number;
    growthPctCELI: number;
    growthPctREER: number;
    growthPctNonReg: number;
    growthPctCrypto: number;
    growthPctLiquid: number;
    growthPctCELIAPP: number;
    growthPctREEE: number;
    // Fiscalité cumulée
    taxCurrentYear: TaxBucket;
    taxPreviousYear: TaxBucket;
    // Événements
    lifeEventsLog: string[];
    flowEventsLog: string[];
    /** [FUTUR-DAILY-EVENTS] Jour (1-31) par message d'événement daté. */
    eventDaysLog?: Record<string, number>;
}

/**
 * Assemble le point de données mensuel pour data.push().
 * En mode MC, retourne { NetWorth, monthIndex } seulement.
 * En mode déterministe, calcule CoastFIRE / BaristaFIRE et retourne
 * le ProjectionChartPoint complet (~50 champs).
 */
/**
 * Le point mensuel est-il ALLÉGÉ, c'est-à-dire réduit à `{ NetWorth, monthIndex }` ?
 *
 * ⚠️ Exporté pour que l'APPELANT puisse sauter les calculs dont ce point ne garde rien
 * (`[PERF-ENG-LATENT-MC-WASTE]`) — et exporté plutôt que recopié : deux écritures de la même
 * condition finissent par diverger, et la divergence serait SILENCIEUSE (des champs calculés pour
 * rien, ou pire, un point verbeux privé de ses champs). Une condition qui gouverne deux endroits
 * vit à un seul.
 */
export const estPointAllege = (enableMonteCarlo: boolean, verboseMonthlyPoints?: boolean): boolean =>
    enableMonteCarlo && verboseMonthlyPoints !== true;

export function buildMonthlyDataPoint(ctx: MonthlyOutputCtx): ProjectionChartPoint {
    const { m, retirementMonthIndex, fireTargetNetWorth, futureFireTarget,
        simInflation, expenseMultiplier, effectiveBaseExpenses,
        enableMonteCarlo, rawNetWorth, verboseMonthlyPoints } = ctx;

    if (estPointAllege(enableMonteCarlo, verboseMonthlyPoints)) {
        return { NetWorth: round2(rawNetWorth), monthIndex: m };
    }

    const coastFireNominal = m >= retirementMonthIndex
        ? futureFireTarget
        : (fireTargetNetWorth / Math.pow(1 + COAST_FIRE_ASSUMED_ANNUAL_GROWTH / 12, Math.max(0, retirementMonthIndex - m))) * expenseMultiplier;

    const baristaTargetFuture = Math.max(0, effectiveBaseExpenses - BARISTA_ASSUMED_MONTHLY_INCOME)
        * 12 * FIRE_TARGET_MULTIPLE * expenseMultiplier;

    const {
        currentLoopDate, loopYear, age, isRetired,
        incomeMarc, incomeAnna, incomeRetirement, monthlyIncome, monthlyExpenses,
        childMonthlyCost, childGrossCost, childBenefits,
        reeeContribMonthly, reeePayoutMonthly,
        reeeContribCum, reeeGrantsCum,
        dividendIncome, taxableInvIncome,
        marginalTaxRate, effectiveTaxRate,
        pensionRRQ, pensionPSV, pensionPrivee,
        immoHypo, immoCharges, immoInterest, immoPrincipal, totalRentalIncome,
        liquid, celi, celiapp, reer, reee, nonReg, crypto,
        retraitReerMois, retraitCeliMois, celiRoom, rrspRoom, fhsaRoom,
        rapRepaymentDueTotal, realEstateEquity, mortgageBalance, activeDebtsTotal,
        liquidDebt, smithManoeuvreDebt,
        prevNW, prevCELI, prevREER, prevLiquid,
        impotLatent, fluxImpots, impotReerMois, impotSalaireMois, impotGainsMois, impotDiversMois,
        taxPaidRevenu, taxPaidGains, taxPaidDivers, taxPaidREER, taxOnRrif,
        contribCELI, withdrawalCELI, contribREER, withdrawalREER,
        contribNonReg, withdrawalNonReg, contribCrypto, withdrawalCrypto,
        contribLiquid, withdrawalLiquid, contribCELIAPP, withdrawalCELIAPP,
        contribREEE, withdrawalREEE,
        growthCELI, growthREER, growthNonReg, growthCrypto, growthLiquid, growthCELIAPP, growthREEE,
        growthPctCELI, growthPctREER, growthPctNonReg, growthPctCrypto, growthPctLiquid, growthPctCELIAPP, growthPctREEE,
        taxCurrentYear, taxPreviousYear,
        lifeEventsLog, flowEventsLog, eventDaysLog,
    } = ctx;

    return {
        lifeEvents: lifeEventsLog,
        flowEvents: flowEventsLog,
        // [FUTUR-DAILY-EVENTS] Jour du mois des événements qui en ONT un (saisie datée, échéance
        // fiscale) — clé = le message. ABSENT si aucun événement daté ce mois-ci (champ additif :
        // aucun consommateur existant n'est affecté).
        ...(eventDaysLog && Object.keys(eventDaysLog).length > 0 ? { eventDays: { ...eventDaysLog } } : {}),
        monthIndex: m,
        dateLabel: `${MONTH_SHORT_FR[currentLoopDate.getMonth()]} ${loopYear}`,
        year: loopYear,
        age,
        IncomeMarc: round2(incomeMarc),
        IncomeAnna: round2(incomeAnna),
        IncomeRetirement: round2(incomeRetirement),
        Income: round2(monthlyIncome),
        Expenses: round2(monthlyExpenses),
        childCost: round2(childMonthlyCost),
        childGross: round2(childGrossCost),
        childBenefits: round2(childBenefits),
        ReeeContrib: round2(reeeContribMonthly),
        ReeePayout: round2(reeePayoutMonthly),
        // Phase 3 Tier 2 — cumul REEE pour ChildPlanning respProjection
        reeeContribCum: round2(reeeContribCum),
        reeeGrantsCum: round2(reeeGrantsCum),
        // Phase 3 Tier 3 — dividendes et revenus de placement imposables
        DividendIncome: round2(dividendIncome),
        TaxableInvIncome: round2(taxableInvIncome),
        marginalTaxRate: round2(marginalTaxRate),
        effectiveTaxRate: round2(effectiveTaxRate),
        pensionRRQ: round2(pensionRRQ),
        pensionPSV: round2(pensionPSV),
        pensionPrivee: round2(pensionPrivee),
        ImmoHypo: round2(immoHypo),
        ImmoCharges: round2(immoCharges),
        ImmoInterest: round2(immoInterest),
        ImmoPrincipal: round2(immoPrincipal),
        RentalIncome: round2(totalRentalIncome),
        Savings: round2((monthlyIncome - monthlyExpenses)),
        NetSalary: round2(monthlyIncome),
        Liquidites: round2(liquid),
        CELI: round2(celi),
        RetraitREER: round2(retraitReerMois),
        RetraitCELI: round2(retraitCeliMois),
        CELIMax: round2((celiRoom + celi)),
        CELIAPP: round2(celiapp),
        CELIAPPMax: round2((fhsaRoom + celiapp)),
        REER: round2(reer),
        REERMax: round2((rrspRoom + reer)),
        REEE: round2(reee),
        NonReg: round2(nonReg),
        Crypto: round2(crypto),
        rapBalance: round2(rapRepaymentDueTotal),
        Immobilier: round2(realEstateEquity),
        // Dette TOTALE affichée = hypothèque + prêts/cartes + découvert + HELOC Smith. Inclut
        // désormais liquidDebt + smithManoeuvreDebt : sans eux, un patrimoine net NÉGATIF
        // (découvert porté en dette) n'était EXPLIQUÉ par aucune ligne de l'UI (bug Marc 2026-06-16).
        DetteTotale: round2((mortgageBalance + activeDebtsTotal + liquidDebt + smithManoeuvreDebt)),
        /** [M5] Dettes HORS hypothèque → `NetWorth = Σ(actifs, Immobilier=équité) − DettesNonImmo`
         *  reconstruit le patrimoine net même sous hypothèque (DetteTotale double-compterait l'hypo,
         *  déjà nettée dans Immobilier). Garde : INV-9 (moneyConservation). */
        DettesNonImmo: round2((activeDebtsTotal + liquidDebt + smithManoeuvreDebt)),
        /** Découvert (liquidité négative non couverte) porté en dette — exposé pour l'UI. */
        LiquidDebt: round2(liquidDebt),
        NetWorth: round2(rawNetWorth),
        // Centralisation Phase 3 Tier 1 — champs dérivés simples
        realNetWorth: round2(rawNetWorth / Math.max(1e-9, expenseMultiplier)),
        liquidityRunway: monthlyExpenses > 0 ? Number((liquid / monthlyExpenses).toFixed(1)) : 0,
        // Estimation linéaire : balance / paiement mensuel (approximation
        // raisonnable pour amortissement classique sans changement de taux).
        // Pour une valeur exacte avec capitalisation, voir mortgageBlendedRate
        // (Phase 3 ultérieure).
        mortgageRemainingMonths: immoHypo > 0 && mortgageBalance > 0
            ? Math.ceil(mortgageBalance / immoHypo)
            : 0,
        diffNW: round2((rawNetWorth - prevNW)),
        diffCELI: round2((celi - prevCELI)),
        diffREER: round2((reer - prevREER)),
        diffLiquid: round2((liquid - prevLiquid)),
        ImpotLatent: round2(impotLatent),
        FluxImpots: round2(fluxImpots),
        ImpotRetraitREER: round2(impotReerMois),
        ImpotSalaireMois: round2(impotSalaireMois),
        ImpotGainsCap: round2(impotGainsMois),
        ImpotDivers: round2(impotDiversMois),
        TaxPaidRevenu: round2(taxPaidRevenu),
        TaxPaidGains: round2(taxPaidGains),
        TaxPaidDivers: round2(taxPaidDivers),
        TaxPaidREER: round2(taxPaidREER),
        WithheldTaxRrif: round2((taxOnRrif || 0)),
        FireTarget: round2(futureFireTarget),
        CoastFIRE: round2(coastFireNominal),
        BaristaFIRE: round2(baristaTargetFuture),
        isRetired,
        ContribCELI: round2(contribCELI),
        ContribREER: round2(contribREER),
        ContribNonReg: round2(contribNonReg),
        MarketGrowthCELI: round2(growthCELI),
        MarketGrowthREER: round2(growthREER),
        MarketGrowthNonReg: round2(growthNonReg),
        MarketGrowthCrypto: round2(growthCrypto),
        MarketGrowthLiquid: round2(growthLiquid),
        MarketGrowthCELIAPP: round2(growthCELIAPP),
        MarketGrowthREEE: round2(growthREEE),
        MarketGrowthPctCELI: round2(growthPctCELI),
        MarketGrowthPctREER: round2(growthPctREER),
        MarketGrowthPctNonReg: round2(growthPctNonReg),
        MarketGrowthPctCrypto: round2(growthPctCrypto),
        MarketGrowthPctLiquid: round2(growthPctLiquid),
        MarketGrowthPctCELIAPP: round2(growthPctCELIAPP),
        MarketGrowthPctREEE: round2(growthPctREEE),
        NetTransferCELI: round2((contribCELI - withdrawalCELI)),
        NetTransferREER: round2((contribREER - withdrawalREER)),
        NetTransferNonReg: round2((contribNonReg - withdrawalNonReg)),
        NetTransferCrypto: round2((contribCrypto - withdrawalCrypto)),
        NetTransferLiquid: round2((contribLiquid - withdrawalLiquid)),
        NetTransferCELIAPP: round2((contribCELIAPP - withdrawalCELIAPP)),
        NetTransferREEE: round2((contribREEE - withdrawalREEE)),
        ExpenseInflationImpact: round2(monthlyExpenses * (simInflation / 100 / 12)),
        ExpenseInflationPct: round2((simInflation / 12)),
        AccruedTaxRevenu: round2((taxCurrentYear.revenu + taxPreviousYear.revenu)),
        AccruedTaxGains: round2((taxCurrentYear.gains + taxPreviousYear.gains)),
        AccruedTaxDivers: round2((taxCurrentYear.divers + taxPreviousYear.divers)),
        AccruedTaxREER: round2((taxCurrentYear.reer + taxPreviousYear.reer)),
    };
}
