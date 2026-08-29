// services/projection/buildSimulationParams.ts
//
// Lot 0 — ADAPTATEUR PUR « AppState → SimulationParams ».
//
// Historiquement, l'assemblage des `SimulationParams` (l'entrée du moteur pur
// `calculateFutureProjection`) vivait DANS React, dans `components/FutureProjection.tsx`
// (~L123-240) : une cascade de `useMemo` calculant `calculatedStartingCash`,
// `liveCSVBalances`, `baseGrossAnnual/Net`, `baseMonthlyExpenses`,
// `currentRentExpense`, `startYear/Month`. Le MOTEUR est pur, mais son ASSEMBLAGE
// d'entrée ne l'était pas → impossible de répondre « mon patrimoine dans 20 ans »
// hors du navigateur (connecteur MCP).
//
// Ce module extrait cet assemblage en fonctions PURES, testables et réutilisables
// par l'app web ET le serveur MCP. Le comportement de l'app est strictement
// préservé : `FutureProjection.tsx` appelle désormais `buildSimulationParams`
// avec exactement les mêmes valeurs (ses hooks alimentent l'objet `inputs`),
// et un test de PARITÉ verrouille l'égalité.

import { verifierEntreesMoteur } from './verifierEntreesMoteur';
import type {
    BudgetConfig,
    BudgetCategory,
    Asset,
    RealEstateGoal,
    ChildGoal,
    TravelGoal,
    LifeEvent,
    RetirementGoal,
    Transaction,
    Debt,
    ProjectionConfig,
    FinancialGoal,
    User,
    InsurancePolicy,
    RentalProperty,
    PrivateBusiness,
    VehicleReplacement,
    MajorRenovation,
    CharitableGoal,
    AppState,
} from '../../types';
import type { SimulationParams, LiveCSVBalances } from '../projection';
import {
    reconstructPortfolioHistory,
    type MinimalAsset,
} from '../history/reconstructPortfolioHistory';
import { deriveStartingBalancesFromHistory } from '../history/startingBalancesFromHistory';
import { getEffectivePurchases } from '../../utils/assetPurchases';
import { TAX_BASE_YEAR, ageOptsForSalaryInversion, calculateGrossFromNet } from '../../utils/tax';
import { isSavingsNature } from '../../utils/budget';
import { computeCashLedger, computeCashLedgerDetailed } from '../startingCash';

/**
 * Loyer mensuel par défaut quand aucune ligne de budget « loyer / rent /
 * hypothèque » n'est trouvée. Valeur historique de `FutureProjection.tsx`.
 */
export const DEFAULT_RENT_EXPENSE = 1600;

/**
 * Entrée de l'adaptateur pur. Reprend, champ pour champ, ce que
 * `FutureProjection.tsx` passe au moteur. Les pièces DÉRIVÉES par les hooks du
 * composant (`liveCSVBalances`, `calculatedStartingCash`) sont fournies telles
 * quelles pour garantir une parité bit-à-bit avec le chemin React ; un loader
 * hors-DOM (MCP) les calcule via `deriveSimulationInputsFromState`.
 */
export interface BuildSimulationParamsInputs {
    projection: ProjectionConfig;
    config: BudgetConfig;
    /** Soldes de placement de départ (dérivés de l'historique reconstruit). */
    liveCSVBalances: LiveCSVBalances;
    /** Cash de départ = Σ initialBalances + Σ transactions (hors transfert/doublon). */
    calculatedStartingCash: number;
    /**
     * [ENG-INFINITY-NON-GARDE-A-LA-FRONTIERE] Termes que `computeCashLedgerDetailed` a ÉCARTÉS du
     * total ci-dessus. Optionnel : sans lui, le comportement est celui d'avant.
     *
     * ⚠️ Il est indispensable parce que `calculatedStartingCash` seul ne peut RIEN dire : le ledger
     * écarte les valeurs non finies et rend toujours un total fini, donc « le total est fini » ne
     * prouve pas « aucune donnée n'a été jetée ». C'est la leçon
     * `TRACER-AU-LIEU-DE-JETER-DESARME-LA-GARDE-AVAL` : il faut DEUX portes, le total pour lire et
     * l'inventaire des termes écartés pour refuser. `startingCash.ts` expose déjà la seconde.
     */
    termesFautifsCash?: ReadonlyArray<{ origine: string; cle: string; valeur: unknown }>;
    realEstateGoals: RealEstateGoal[];
    debts: Debt[];
    childGoals: ChildGoal[];
    travelGoals: TravelGoal[];
    lifeEvents: LifeEvent[];
    retirementGoal: RetirementGoal;
    financialGoals: FinancialGoal[];
    budgetItems: BudgetCategory[];
    /** Épargne mensuelle calculée (net mensuel − dépenses) — pilote baseMonthlyExpenses. */
    calculatedMonthlySavings: number;
    startYear: number;
    startMonth: number;
    // W5.x — conteneurs étendus (optionnels, comme dans le moteur).
    insurancePolicies?: InsurancePolicy[];
    vehicleReplacements?: VehicleReplacement[];
    majorRenovations?: MajorRenovation[];
    charitableGoals?: CharitableGoal[];
    rentalProperties?: RentalProperty[];
    privateBusinesses?: PrivateBusiness[];
}

/**
 * Σ (brut annuel) sur tous les utilisateurs, avec REPLI net→brut.
 *
 * ⚠️ [MIGRATE-GROSS-135] — ce site n'avait AUCUN repli : `grossSalary || 0`. Un conjoint sans brut
 * saisi comptait donc pour ZÉRO ici, pendant que `computeIncomeBaseline` lui déduisait un brut et
 * l'IMPOSAIT dessus. Or `baseGrossAnnual` alimente exactement deux choses, toutes deux
 * money-critical : les DROITS REER historiques (`computeHistoricalContributionRoom`) et le ratio
 * gains/MGA qui détermine la RENTE RRQ (`computeRetirementIncome`).
 *
 * Le moteur imposait donc un revenu qu'il refusait de créditer. MESURÉ sur un couple dont le
 * conjoint a 4 000 $/mois de net sans brut saisi : **−211 532 $ de droits REER** et
 * **−247 $/mois de rente RRQ** (≈ −2 968 $/an à vie).
 *
 * Trois conventions net→brut coexistaient dans le dépôt (`× 1,35`, `calculateGrossFromNet`, et
 * `|| 0`). Le patron retenu est celui de `components/Retirement.tsx`, réutilisé tel quel.
 */
export function computeBaseGrossAnnual(users: readonly User[], year: number = TAX_BASE_YEAR): number {
    return (users ?? []).reduce((sum, u) => {
        if (u?.grossSalary) return sum + (u.grossSalary * 12);
        const netAnnual = ((u?.netSalary || u?.salary || 0) as number) * 12;
        // [GROSSFROMNET-CREDITS-65] `users` porte déjà `age`/`birthYear` : les crédits d'âge se
        // construisent PAR UTILISATEUR, jamais au niveau du ménage.
        return sum + (netAnnual > 0
            ? calculateGrossFromNet(netAnnual, year, ageOptsForSalaryInversion(u, year, (users ?? []).length))
            : 0);
    }, 0);
}

/**
 * Σ ((netSalary || salary) × 12) sur tous les utilisateurs. Réplique
 * `baseNetAnnual` (note : le fallback `salary` est historique).
 */
export function computeBaseNetAnnual(users: readonly User[]): number {
    return (users ?? []).reduce((sum, u) => sum + ((u?.netSalary || u?.salary || 0) * 12), 0);
}

/**
 * Loyer mensuel courant = 1re ligne de budget contenant « loyer / rent /
 * hypothèque », normalisée en mensuel (Yearly /12, Weekly ×4.33). Défaut 1600.
 * Réplique exacte de `currentRentExpense` (FutureProjection.tsx).
 */
export function computeCurrentRentExpense(budgetItems: readonly BudgetCategory[]): number {
    const rentItem = (budgetItems ?? []).find(
        (b) =>
            b.name.toLowerCase().includes('loyer') ||
            b.name.toLowerCase().includes('rent') ||
            b.name.toLowerCase().includes('hypothèque') ||
            // [BUDGET-TX-CATEGORIES] « Logement » = nom canonique des postes auto-alignés sur les
            // catégories de transactions — sans lui, un budget auto retomberait sur le défaut 1600 $.
            b.name.toLowerCase().includes('logement'),
    );
    if (rentItem) {
        let val = rentItem.target;
        if (rentItem.frequency === 'Yearly') val /= 12;
        if (rentItem.frequency === 'Weekly') val *= 4.33;
        return val;
    }
    return DEFAULT_RENT_EXPENSE;
}

/**
 * Cash de départ = Σ initialBalances + Σ transactions (hors doublon / transfert).
 * Réplique exacte de `calculatedStartingCash` (FutureProjection.tsx) — exposé
 * pour le loader MCP (hors-DOM) qui n'a pas les hooks du composant.
 */
export function computeStartingCash(
    initialBalances: Record<string, number>,
    transactions: readonly Transaction[],
): number {
    // [CASH-NAN-SILENT] Délègue à la SOURCE UNIQUE (`services/startingCash.ts`). La formule était
    // recopiée ici avec des `Number(v) || 0` muets, alors que c'est l'ANCRE de toute la
    // reconstruction du passé ET le cash de départ du moteur.
    return computeCashLedger(initialBalances, transactions);
}

/**
 * Dérive les soldes de placement de départ (`liveCSVBalances`) PUREMENT depuis
 * les avoirs, en réutilisant EXACTEMENT la même chaîne que le composant via le
 * hook `usePastPortfolioHistory` : `reconstructPortfolioHistory` (passé réel
 * des comptes) → `deriveStartingBalancesFromHistory` (dernier point = solde
 * actuel). En contexte hors-DOM (MCP), aucun enrichissement réseau (Finnhub)
 * n'a lieu : la reconstruction part du `priceHistory` présent dans les avoirs,
 * comme en mode test du composant.
 */
export function derivePortfolioStartingBalances(
    assets: readonly Asset[],
    fxRates: Record<string, number>,
): LiveCSVBalances {
    const minimal: MinimalAsset[] = (assets ?? []).map((a) => ({
        symbol: a.symbol,
        quantity: a.quantity || 0,
        currency: a.currency || 'CAD',
        currentPrice: a.currentPrice || 0,
        accountType: a.accountType,
        dateBought: a.dateBought,
        purchases: getEffectivePurchases(a),
        priceHistory: (a.priceHistory || []).map((p) => ({ date: p.date, price: p.price })),
    }));
    const history = reconstructPortfolioHistory(minimal, fxRates ?? {});
    return deriveStartingBalancesFromHistory(history.points);
}

/**
 * ADAPTATEUR PUR — assemble les `SimulationParams` à partir d'`inputs` déjà
 * normalisés. C'est l'extraction exacte du `useMemo params` de
 * `FutureProjection.tsx` : aucune nouvelle logique, juste sortie de React.
 *
 * `baseMonthlyExpenses = (baseNetAnnual / 12) − calculatedMonthlySavings`,
 * et les listes immo/enfants sont filtrées de leurs entrées falsy — à
 * l'identique du composant.
 */
export function buildSimulationParams(inputs: BuildSimulationParamsInputs): SimulationParams {
    const users = (inputs.config?.users ?? []) as unknown as User[];
    // [GROSSFROMNET-ANNEE-FIGEE] même barème que le moteur, pas celui de 2026 en dur.
    const baseGrossAnnual = computeBaseGrossAnnual(users, inputs.startYear);
    const baseNetAnnual = computeBaseNetAnnual(users);
    const baseMonthlyExpenses = baseNetAnnual / 12 - inputs.calculatedMonthlySavings;
    const currentRentExpense = computeCurrentRentExpense(inputs.budgetItems);

    // [ENG-INFINITY-NON-GARDE-A-LA-FRONTIERE] La garde d'entrée vit ICI — décision de Marc
    // (2026-08-29) : c'est le point de passage UNIQUE vers le moteur, donc une seule garde couvre
    // la saisie, la restauration Drive, l'import et le mode test. Elle REFUSE et NOMME le champ ;
    // borner fabriquerait un chiffre plausible et faux, tracer en silence laisserait le défaut
    // invisible — c'est précisément ce qui l'a laissé vivre jusqu'ici.
    const entreesRefusees = verifierEntreesMoteur({
        config: inputs.config as unknown as { users?: ReadonlyArray<unknown> },
        baseNetAnnual,
        baseGrossAnnual,
        baseMonthlyExpenses,
        calculatedStartingCash: inputs.calculatedStartingCash,
        currentRentExpense,
        budgetItems: inputs.budgetItems,
        termesFautifsCash: inputs.termesFautifsCash,
    });

    return {
        // Omis quand il n'y a rien à refuser : le champ reste absent sur le chemin nominal, donc
        // la signature JSON des params (clé de dédup du moteur) ne bouge pas d'un octet.
        ...(entreesRefusees.length > 0 ? { entreesRefusees } : {}),
        projection: inputs.projection,
        calculatedStartingCash: inputs.calculatedStartingCash,
        liveCSVBalances: inputs.liveCSVBalances,
        realEstateGoals: (inputs.realEstateGoals ?? []).filter(Boolean),
        debts: inputs.debts ?? [],
        childGoals: (inputs.childGoals ?? []).filter(Boolean),
        travelGoals: inputs.travelGoals ?? [],
        lifeEvents: inputs.lifeEvents ?? [],
        retirementGoal: inputs.retirementGoal,
        config: inputs.config,
        baseGrossAnnual,
        baseNetAnnual,
        currentRentExpense,
        baseMonthlyExpenses,
        startYear: inputs.startYear,
        startMonth: inputs.startMonth,
        insurancePolicies: inputs.insurancePolicies ?? [],
        vehicleReplacements: inputs.vehicleReplacements ?? [],
        majorRenovations: inputs.majorRenovations ?? [],
        charitableGoals: inputs.charitableGoals ?? [],
        rentalProperties: inputs.rentalProperties ?? [],
        privateBusinesses: inputs.privateBusinesses ?? [],
        financialGoals: inputs.financialGoals ?? [],
    };
}

/**
 * Calcule l'épargne mensuelle « budget » = net mensuel des utilisateurs moins
 * les dépenses budgétées (hors nature Épargne), normalisées en mensuel.
 * Réplique `useDerivedFinancials.calculatedMonthlySavings`, fournie ici pour que
 * le loader MCP puisse alimenter `calculatedMonthlySavings` sans passer par
 * React. (L'app web continue de passer SA valeur calculée via les hooks.)
 */
export function computeMonthlySavings(
    config: BudgetConfig,
    budgetItems: readonly BudgetCategory[],
): number {
    const users = (config?.users ?? []) as unknown as User[];
    const income = users.reduce((acc, u) => acc + (u?.netSalary || u?.salary || 0), 0);
    const budgetExp = (budgetItems ?? []).reduce((acc, item) => {
        if (isSavingsNature(item.nature)) return acc; // [HEALTH-SAVINGS-CONSISTENCY] NFD, pas `=== 'Epargne'` (entrée moteur)
        let amount = item.target;
        if (item.frequency === 'Yearly') amount /= 12;
        if (item.frequency === 'Quarterly') amount /= 3;
        if (item.frequency === 'Weekly') amount *= 4.33;
        return acc + amount;
    }, 0);
    return Math.max(0, income - budgetExp);
}

/**
 * Loader hors-DOM (MCP) : construit un `BuildSimulationParamsInputs` complet à
 * partir d'un AppState, en dérivant PUREMENT toutes les pièces que le composant
 * obtient via ses hooks. `startYear/startMonth` par défaut = mois courant (le
 * moteur démarre « aujourd'hui »), surchargeable pour des tests déterministes.
 */
export function deriveSimulationInputsFromState(
    state: AppState,
    opts?: { startYear?: number; startMonth?: number; now?: Date },
): BuildSimulationParamsInputs {
    const now = opts?.now ?? new Date();
    const startYear = opts?.startYear ?? now.getFullYear();
    const startMonth = opts?.startMonth ?? now.getMonth();

    return {
        projection: state.projection,
        config: state.config,
        liveCSVBalances: derivePortfolioStartingBalances(state.assets ?? [], state.fxRates ?? {}),
        // [ENG-INFINITY-NON-GARDE-A-LA-FRONTIERE] ⚠️ Le ledger DÉTAILLÉ, comme dans le hook. Sans lui,
        // le chemin MCP restait nu sur le canal cash alors que le chemin navigateur était protégé :
        // mesuré, `initialBalances.CELI = NaN` passait sans refus et rendait 7 082 228 $ au lieu de
        // 7 270 228 $ (−188 000 $) à un LLM, `isError` à faux. Le correctif précédent affirmait
        // fermer ce canal pour les deux surfaces ; il n'en fermait qu'une (finding 2e passe, #764).
        // Un seul parcours des transactions sert les deux besoins (le total et l'inventaire).
        ...(() => {
            const ledger = computeCashLedgerDetailed(state.initialBalances ?? {}, (state.transactions ?? []) as Transaction[]);
            return { calculatedStartingCash: ledger.cash, termesFautifsCash: ledger.termesFautifs };
        })(),
        realEstateGoals: state.realEstateGoals ?? [],
        debts: state.debts ?? [],
        childGoals: state.childGoals ?? [],
        travelGoals: state.travelGoals ?? [],
        lifeEvents: state.lifeEvents ?? [],
        retirementGoal: state.retirementGoal,
        financialGoals: state.financialGoals ?? [],
        budgetItems: state.budgetItems ?? [],
        calculatedMonthlySavings: computeMonthlySavings(state.config, state.budgetItems ?? []),
        startYear,
        startMonth,
        insurancePolicies: state.insurancePolicies ?? [],
        vehicleReplacements: state.vehicleReplacements ?? [],
        majorRenovations: state.majorRenovations ?? [],
        charitableGoals: state.charitableGoals ?? [],
        rentalProperties: state.rentalProperties ?? [],
        privateBusinesses: state.privateBusinesses ?? [],
    };
}

/** Raccourci pratique : AppState → SimulationParams en une étape (pur). */
export function buildSimulationParamsFromState(
    state: AppState,
    opts?: { startYear?: number; startMonth?: number; now?: Date },
): SimulationParams {
    return buildSimulationParams(deriveSimulationInputsFromState(state, opts));
}
