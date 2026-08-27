import type { BudgetConfig, BudgetCategory, Debt, Asset, Transaction, RecurringItem, HealthWeights } from '../types';
import { computeBudgetParity } from './budget';
import { computeBudgetParityScore, computeSubscriptionLoadScore, subscriptionsMonthlyCost, monthlyConsumptionExpenses } from './healthRatios';
import { formatPercent, formatCAD, formatNumber } from './format';
import { computeCurrentLiquidity, computeInvestmentsValue, computeTotalDebt } from '../services/portfolio';

// [NAV-MERGE-SANTE-FUTUR] Extrait de `components/dashboard/HealthIndicator.tsx` (Phase D.6) pour
// SOURCE UNIQUE : la carte détaillée (Santé, sous-onglet Budget) et le résumé condensé (Futur)
// doivent afficher le MÊME score — deux implémentations divergeraient (même classe que
// `SyncStaleBanner`/`MCP-NETINCOME-MISLEADING`). Comportement inchangé, extraction PURE.

const clamp01 = (x: number) => Math.max(0, Math.min(100, x));

export interface HealthMetricRow {
    id: keyof HealthWeights;
    label: string;
    value: number; // 0-100 (déjà clampé)
    raw: string;   // valeur brute formatée pour le tooltip
    help: string;
    /** false = donnée de base manquante (ex. pas de projection FIRE, pas de dépenses du mois) :
     *  la métrique est affichée « requis » et EXCLUE du score pondéré. */
    available: boolean;
}

export interface HealthScoreInputs {
    config: BudgetConfig;
    budgetItems: BudgetCategory[];
    debts: Debt[];
    assets: Asset[];
    initialBalances: Record<string, number>;
    transactions: Transaction[];
    subscriptions: readonly RecurringItem[];
    fxRates: Record<string, number>;
    /** Cible FIRE — vient EXCLUSIVEMENT de la projection Future (0 si non calculée). */
    projectionFireTarget: number;
}

export function computeHealthMetrics(inputs: HealthScoreInputs): HealthMetricRow[] {
    const { config, budgetItems, debts, assets, initialBalances, transactions, subscriptions, fxRates, projectionFireTarget } = inputs;

    // [INCOME-PROVENANCE] Revenus mensuels = config.users[].netSalary UNIQUEMENT (mensuel dans
    // le store) — c'est la valeur écrite par la fiche de paie (TaxCenter « Calcul rapide » ou
    // MCP apply_payslip). Chaîne de vérité voulue par Marc (2026-07-15) : paie → onglet Impôt →
    // Santé financière. Ne JAMAIS dériver ce revenu des transactions ici.
    const monthlyIncome = (config?.users || []).reduce(
        (sum, u) => sum + (u.netSalary || u.salary || 0),
        0,
    );
    // [PH4D-BUDGET-RATIOS + HEALTH-SAVINGS-RATE] dépenses de CONSOMMATION mensuelles : fréquence normalisée
    // ET postes ÉPARGNE EXCLUS (virements, pas des dépenses) → taux d'épargne + coussin justes et cohérents
    // avec la parité budget / Budget.tsx (cf `monthlyConsumptionExpenses`).
    const monthlyExpenses = monthlyConsumptionExpenses(budgetItems || []);
    // Liquidités = cash de TOUS les comptes, via la source unique computeCurrentLiquidity.
    const liquidity = computeCurrentLiquidity(initialBalances, transactions);
    // [DEBT-SUM-DUP, audit 2026-07-16] Source unique (garde isFinite incluse) au lieu du reduce local.
    const totalDebts = computeTotalDebt(debts || []);
    // [ASSET-FX-DISPLAY] valeur CAD via la source unique (prix natifs × FX).
    const investmentValue = computeInvestmentsValue(assets || [], fxRates);
    // Patrimoine = placements + liquidités (la liquidité inclut déjà tout le cash : CELI, REER, comptes courants…).
    const totalAssets = investmentValue + liquidity;

    // 1. Taux d'épargne
    const savingsRateRaw = monthlyIncome > 0 ? ((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100 : 0;
    const savingsRateScore = clamp01((savingsRateRaw / 20) * 100); // 20% = 100 score

    // 2. Couverture coussin (mois)
    const emergencyMonths = monthlyExpenses > 0 ? liquidity / monthlyExpenses : 0;
    const emergencyScore = clamp01((emergencyMonths / 6) * 100); // 6 mois = 100 score

    // 3. Ratio dette/actif (inversé — moins c'est haut, mieux c'est)
    const debtAssetsRatio = totalAssets > 0 ? (totalDebts / totalAssets) * 100 : (totalDebts > 0 ? 100 : 0);
    const debtScore = clamp01(100 - (debtAssetsRatio / 50) * 100); // 0% dette = 100, 50%+ = 0

    // 4. Progression FIRE (patrimoine / 25× dépenses annuelles)
    // Mode strict : la cible FIRE vient EXCLUSIVEMENT de Future. Si la projection n'a pas été
    // calculée, on retourne null et l'UI affiche un état "Projection requise" plutôt qu'une valeur inventée.
    const fireTarget = projectionFireTarget > 0 ? projectionFireTarget : null;
    const fireProgressPct = fireTarget != null ? (totalAssets / fireTarget) * 100 : null;
    const fireScore = fireProgressPct != null ? clamp01(fireProgressPct) : null;

    // 5. Adhérence au budget — dépenses réelles vs cibles, sur le MOIS COMPLET PRÉCÉDENT (évite le biais
    //    d'un mois courant partiel). YYYY-MM dérivé des composantes LOCALES (toISOString décalerait le mois
    //    en fuseau négatif). On distingue 3 états : (a) aucune dépense le mois dernier → indispo « pas de
    //    données » ; (b) des dépenses mais AUCUNE rapprochée à un poste (toutes orphelines) → indispo, mais
    //    message explicite (sinon un faux 100 ou un « pas de données » trompeur) ; (c) au moins une rapprochée → score.
    const nowDate = new Date();
    const prevMonthDate = new Date(nowDate.getFullYear(), nowDate.getMonth() - 1, 1);
    const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
    const prevSpend = (transactions || []).filter(
        t => typeof t.date === 'string' && t.date.startsWith(prevMonthStr) && t.amount < 0 && !t.isTransfer && !t.isDuplicate,
    );
    const prevParity = computeBudgetParity(prevSpend, budgetItems);
    const hasMatchedActuals = Object.keys(prevParity.actualsMap).length > 0;
    const hadSpending = prevParity.totalSpent > 0;
    const budgetParityScore = hasMatchedActuals ? computeBudgetParityScore(prevParity.actualsMap, budgetItems) : null;
    const budgetParityRaw = budgetParityScore != null
        ? 'Mois précédent : dépenses réelles vs cibles'
        : hadSpending
            ? 'Dépenses non rapprochées à un poste budget'
            : 'Pas encore de dépenses à comparer';

    // 6. Poids des abonnements épinglés — coût MENSUEL (yearlyCost/12, pas de ×12) / revenu net mensuel.
    //    Aucun abo ÉPINGLÉ → indisponible (cohérent avec FIRE/budget) : un 100 « aucun fardeau » serait
    //    trompeur car l'utilisateur a peut-être des abos non épinglés (détectés à la volée seulement).
    const subMonthly = subscriptionsMonthlyCost(subscriptions);
    const subLoadPct = monthlyIncome > 0 ? (subMonthly / monthlyIncome) * 100 : 0;
    const subscriptionLoadScore = subscriptions.length > 0
        ? computeSubscriptionLoadScore(subscriptions, monthlyIncome)
        : null;

    return [
        {
            id: 'savingsRate' as const,
            label: "Taux d'épargne",
            value: savingsRateScore,
            raw: `${formatPercent(savingsRateRaw, 1)} (revenus − dépenses)`,
            help: "Cible 20%+ : marge mensuelle confortable.",
            available: true,
        },
        {
            id: 'emergencyFund' as const,
            label: 'Coussin d\'urgence',
            value: emergencyScore,
            raw: `${formatNumber(emergencyMonths, { decimals: 2 })} mois`,
            help: "Cible 6 mois : suffisant pour absorber une perte d'emploi.",
            available: true,
        },
        {
            id: 'debtRatio' as const,
            label: 'Ratio dette/actif',
            value: debtScore,
            raw: `${formatPercent(debtAssetsRatio, 1)}`,
            help: "Cible 0% : pas de dette. >50% : zone critique.",
            available: true,
        },
        {
            id: 'fireProgress' as const,
            label: 'Progression FIRE',
            value: fireScore ?? 0,
            raw: fireProgressPct != null
                ? `${formatPercent(fireProgressPct, 1)} (cible Future : ${formatNumber(fireTarget ?? 0)} $)`
                : 'Projection requise — ouvrir Future',
            help: fireProgressPct != null
                ? "Cible 100% : indépendance financière atteinte (règle des 4%)."
                : "La cible FIRE vient de l'onglet Future (moteur de projection). Calculez-la d'abord.",
            available: fireScore != null,
        },
        {
            id: 'budgetParity' as const,
            label: 'Adhérence au budget',
            value: budgetParityScore ?? 0,
            raw: budgetParityRaw,
            help: budgetParityScore != null
                ? "Cible 100% : tu restes dans tes cibles par poste (hors épargne). Le score baisse avec le dépassement."
                : hadSpending
                    ? "Tes dépenses du mois dernier ne correspondent à aucun poste budget — vérifie les noms de tes postes."
                    : "Catégorise des dépenses sur un mois complet pour mesurer ton adhérence au budget.",
            available: budgetParityScore != null,
        },
        {
            id: 'subscriptionLoad' as const,
            label: 'Poids des abonnements',
            value: subscriptionLoadScore ?? 0,
            raw: subscriptionLoadScore != null
                ? `${formatCAD(subMonthly)}/mois (${formatPercent(subLoadPct, 1)} du revenu net)`
                : subscriptions.length === 0
                    ? 'Aucun abonnement épinglé'
                    : 'Revenu requis',
            help: "Cible <15% du revenu net en abonnements épinglés. Épingle tes abos dans « Charges fixes ».",
            available: subscriptionLoadScore != null,
        },
    ];
}

/** Score global pondéré. N'inclut que les métriques DISPONIBLES (numérateur ET dénominateur) :
 *  une métrique sans donnée (ex. FIRE sans projection, budget sans dépenses) ne doit pas peser
 *  comme un 0 qui écraserait le score. Normalisé par la somme des poids des seules métriques comptées. */
export function computeHealthTotalScore(metrics: readonly HealthMetricRow[], weights: HealthWeights): number {
    const counted = metrics.filter(m => m.available);
    const weightedSum = counted.reduce((sum, m) => sum + m.value * (weights[m.id] || 0), 0);
    const totalWeight = counted.reduce((sum, m) => sum + (weights[m.id] || 0), 0);
    return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
}

export function colorForHealthScore(score: number): { ring: string; text: string; bg: string } {
    if (score >= 70) return { ring: 'stroke-success-400', text: 'text-emerald-300', bg: 'bg-success-500/10' };
    if (score >= 40) return { ring: 'stroke-warning-400', text: 'text-amber-300', bg: 'bg-warning-500/10' };
    return { ring: 'stroke-danger-400', text: 'text-red-300', bg: 'bg-danger-500/10' };
}
