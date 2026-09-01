import type { BudgetConfig, BudgetCategory, Debt, Asset, Transaction, RecurringItem, HealthWeights } from '../types';
import { computeBudgetParity } from './budget';
import { computeBudgetParityScore, computeSubscriptionLoadScore, subscriptionsMonthlyCost, monthlyConsumptionExpenses, budgetParityInputsUsable, incomeUsableForRatios } from './healthRatios';
import { totalYearlyCostAudit } from './subscriptions';
import { formatPercent, formatCAD, formatNumber } from './format';
import { computeCurrentLiquidity, computeInvestmentsValue, computeTotalDebt } from '../services/portfolio';
import { logErrorThrottled } from '../services/errorLogger';
import { MASKED_AMOUNT_LABEL } from './privacyAria';

// [NAV-MERGE-SANTE-FUTUR] Extrait de `components/dashboard/HealthIndicator.tsx` (Phase D.6) pour
// SOURCE UNIQUE : la carte détaillée (Santé, sous-onglet Budget) et le résumé condensé (Futur)
// doivent afficher le MÊME score — deux implémentations divergeraient (même classe que
// `SyncStaleBanner`/`MCP-NETINCOME-MISLEADING`). Comportement inchangé, extraction PURE.

const clamp01 = (x: number) => Math.max(0, Math.min(100, x));

/**
 * [HEALTH-SCORE-NAN-SILENCIEUX] `clamp01` ne neutralise PAS `NaN` (`Math.max(0, Math.min(100, NaN))`
 * vaut `NaN`), et une seule métrique non finie contamine le score pondéré : les deux surfaces
 * (carte détaillée du sous-onglet Santé, résumé condensé de Futur) afficheraient littéralement
 * « NaN/100 », sans aucune trace.
 *
 * Chemin MESURÉ le 2026-08-28 : `netSalary: Infinity` — que `|| 0` ne rattrape pas (Infinity est
 * truthy) et que `JSON.parse` PRODUIT à partir d'un blob Drive/backup contenant `1e999` — donne
 * `savingsRateRaw = (∞ − dépenses) / ∞ = NaN`, donc `total = NaN`. Les autres entrées testées
 * (montant de poste, soldes, prix d'actif, cible FIRE) sont déjà durcies en amont.
 *
 * Le correctif est un point de passage UNIQUE appliqué à la liste finale, pas un `?? 0` par
 * métrique : `0` serait un score CRÉDIBLE inventé (règle no-fake-data), alors qu'`available:false`
 * est l'état « — » que l'UI sait déjà rendre, et qui EXCLUT la métrique du score pondéré.
 *
 * ⚠️ **Portée exacte** (finding silent-failure-hunter, panel PR #756) : cette garde voit ce qui
 * arrive ICI non fini. Elle ne voit donc PAS `budgetParity` ni `subscriptionLoad`, dont les
 * producteurs (`clamp01` local de `utils/healthRatios.ts`, `totalYearlyCost` de
 * `utils/subscriptions.ts`) absorbent déjà un `NaN` en `0` SILENCIEUSEMENT en amont — un `0`
 * crédible qui se lit « 100 % de dépassement ». Classe `TRACER-AU-LIEU-DE-JETER-DESARME-LA-GARDE-AVAL`,
 * pré-existante à ce lot, routée au BACKLOG (`[HEALTH-RATIOS-NAN-ABSORBE-EN-AMONT]`) plutôt que
 * corrigée ici : ces deux absorptions ont d'autres consommateurs. Ne pas lire « couvre toute
 * métrique » — lire « couvre toute métrique dont la valeur ARRIVE non finie ».
 */
function sanitizeNonFinite(rows: HealthMetricRow[]): HealthMetricRow[] {
    const invalides = rows.filter((r) => !Number.isFinite(r.value)).map((r) => r.id);
    if (invalides.length === 0) return rows;
    logErrorThrottled(`health-score-non-fini:${invalides.join(',')}`, {
        // 'storage' comme pour `healthWeights` : l'origine d'une valeur non finie est une donnée
        // SAISIE ou RESTAURÉE corrompue, pas une panne de calcul.
        source: 'storage', severity: 'warning',
        message: `Santé financière : ${invalides.length} métrique(s) au score non fini, exclue(s) du total`,
        context: { metriques: invalides },
    });
    return rows.map((r) => (Number.isFinite(r.value) ? r : {
        ...r,
        value: 0,
        available: false, // → l'UI affiche « — » et le total pondéré l'ignore
        raw: [txt('Donnée invalide (valeur non finie)')],
        help: 'Une donnée source de cette métrique n\'est pas un nombre exploitable (infinie ou absente). '
            + 'Corrige-la dans Réglages (revenus, soldes, postes) pour réactiver la mesure.',
    }));
}

/**
 * [A11Y-PRIVACY-HEALTH-RAW] Segment du détail d'une métrique de santé.
 *
 * `raw` était une CHAÎNE, donc les deux montants qu'elle interpole — la cible FIRE et le coût
 * mensuel des abonnements — n'étaient plus des NŒUDS : `<PrivateAmount>` n'a rien à envelopper, et
 * le mode discret les laissait en clair. Même classe que les journaux du moteur du lot 56
 * (`UN-MONTANT-INTERPOLE-DANS-UNE-CHAINE-N-EST-PLUS-UN-NOEUD`) : là où une valeur sensible finira
 * masquée, elle doit rester une DONNÉE jusqu'au rendu.
 *
 * Ce module est PUR — il ne lit pas le store et ne connaît donc pas le mode discret. Il FORMATE et
 * MARQUE ; c'est le composant qui DÉCIDE de masquer. D'où le découpage plutôt qu'une seconde
 * chaîne « déjà masquée », qui dupliquerait chaque gabarit et divergerait.
 */
export type HealthRawPart =
    /** Texte affiché tel quel (pourcentage, libellé, décompte) — jamais masqué. */
    | { readonly type: 'texte'; readonly texte: string }
    /** Montant en dollars, DÉJÀ formaté par `formatCAD` — masqué en mode discret. */
    | { readonly type: 'montant'; readonly texte: string };

/** Segment de texte simple. */
const txt = (texte: string): HealthRawPart => ({ type: 'texte', texte });

/**
 * Segment de MONTANT. Le formatage passe obligatoirement par `formatCAD` (non négociable
 * « Formatage $ » du `CLAUDE.md`) : le constructeur prend le NOMBRE, jamais une chaîne déjà
 * composée, pour qu'aucun site ne puisse re-fabriquer son propre format.
 */
const mnt = (valeur: number): HealthRawPart => ({ type: 'montant', texte: formatCAD(valeur) });

/**
 * Rend les segments en CHAÎNE, pour un ATTRIBUT (`aria-label`) où il n'y a aucun nœud à envelopper.
 *
 * ⚠️ `masquer` n'est pas optionnel : un attribut est justement le canal par lequel ce dépôt a déjà
 * vu fuir une valeur sensible (`MASQUAGE-RETIRE-UN-DISCRIMINANT`, revue #608). L'appelant doit
 * trancher explicitement, et le libellé de remplacement est celui de `PrivateAmount` — un seul
 * wording pour l'œil et pour le lecteur d'écran.
 */
export function healthRawText(parts: readonly HealthRawPart[], masquer: boolean): string {
    return parts.map((p) => (masquer && p.type === 'montant' ? MASKED_AMOUNT_LABEL : p.texte)).join('');
}

export interface HealthMetricRow {
    id: keyof HealthWeights;
    label: string;
    value: number; // 0-100 (déjà clampé)
    /** Détail formaté, en SEGMENTS : un montant y reste identifiable jusqu'au rendu. */
    raw: readonly HealthRawPart[];
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
    // [HEALTH-RATIOS-NAN-ABSORBE-EN-AMONT] Un total de dépenses illisible rend NON MESURABLES les
    // deux métriques qui en dépendent. On propage `NaN` plutôt que de calculer sur une valeur
    // fausse : le point de passage unique `sanitizeNonFinite` (plus bas) le convertit en « — ».
    // Sans ça, `monthlyExpenses > 0` était FAUX pour un `NaN` et le coussin retombait sur un `0`
    // parfaitement crédible — « 0 mois de coussin » — que rien ne distinguait d'une vraie détresse.
    const expensesUsable = Number.isFinite(monthlyExpenses);
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
    const savingsRateScore = expensesUsable ? clamp01((savingsRateRaw / 20) * 100) : NaN; // 20% = 100 score

    // 2. Couverture coussin (mois)
    const emergencyMonths = monthlyExpenses > 0 ? liquidity / monthlyExpenses : 0;
    const emergencyScore = expensesUsable ? clamp01((emergencyMonths / 6) * 100) : NaN; // 6 mois = 100 score

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
    // [HEALTH-RATIOS-NAN-ABSORBE-EN-AMONT] Un refus pour DONNÉE ILLISIBLE ne doit pas hériter du
    // message de l'état vide voisin : la métrique disait « Dépenses non rapprochées à un poste
    // budget » alors que les dépenses ÉTAIENT rapprochées — un diagnostic faux qui envoie corriger
    // le mauvais champ (finding financial-integrity, panel PR #757). Le prédicat est la SOURCE
    // UNIQUE partagée avec `computeBudgetParityScore`, pour que les deux ne puissent pas diverger.
    const budgetInputsUsable = budgetParityInputsUsable(prevParity.actualsMap, budgetItems);
    const budgetParityRaw = budgetParityScore != null
        ? 'Mois précédent : dépenses réelles vs cibles'
        : !budgetInputsUsable
            ? 'Cible ou dépense illisible — corrige le poste dans Budget'
            : hadSpending
                ? 'Dépenses non rapprochées à un poste budget'
                : 'Pas encore de dépenses à comparer';

    // 6. Poids des abonnements épinglés — coût MENSUEL (yearlyCost/12, pas de ×12) / revenu net mensuel.
    //    Aucun abo ÉPINGLÉ → indisponible (cohérent avec FIRE/budget) : un 100 « aucun fardeau » serait
    //    trompeur car l'utilisateur a peut-être des abos non épinglés (détectés à la volée seulement).
    const subMonthly = subscriptionsMonthlyCost(subscriptions);
    // Même garde d'entrée que `computeSubscriptionLoadScore` : un revenu `Infinity` rendrait 0,0 %,
    // un libellé FAUX affiché à l'utilisateur (finding financial-integrity, panel PR #756).
    const incomeUsable = incomeUsableForRatios(monthlyIncome);
    const subLoadPct = incomeUsable ? (subMonthly / monthlyIncome) * 100 : 0;
    const subscriptionLoadScore = subscriptions.length > 0
        ? computeSubscriptionLoadScore(subscriptions, monthlyIncome)
        : null;
    // Même correctif de LIBELLÉ : un refus pour coût illisible affichait « Revenu requis » alors
    // que le revenu était parfaitement valide (finding financial-integrity, panel PR #757).
    // ⚠️ Et l'ORDRE compte, dans les deux sens : `computeSubscriptionLoadScore` teste le REVENU
    // AVANT les abonnements, donc un utilisateur sans revenu saisi (cas très courant — on épingle
    // ses abos avant de remplir son salaire) et un abo illisible se serait vu dire « corrige tes
    // abonnements » alors que la vraie cause est le revenu manquant. Re-dériver `discarded` sans
    // reproduire cette priorité recréait le défaut qu'on vient de corriger, une métrique plus loin
    // (finding code-reviewer, 2e passe panel PR #757).
    // Même prédicat que la garde d'entrée de `computeSubscriptionLoadScore` — UNE définition, pas
    // trois copies (finding code-reviewer, 3e passe panel PR #757).
    const subsDiscarded = incomeUsable ? totalYearlyCostAudit(subscriptions).discarded : 0;

    return sanitizeNonFinite([
        {
            id: 'savingsRate' as const,
            label: "Taux d'épargne",
            value: savingsRateScore,
            raw: [txt(`${formatPercent(savingsRateRaw, 1)} (revenus − dépenses)`)],
            help: "Cible 20%+ : marge mensuelle confortable.",
            available: true,
        },
        {
            id: 'emergencyFund' as const,
            label: 'Coussin d\'urgence',
            value: emergencyScore,
            raw: [txt(`${formatNumber(emergencyMonths, { decimals: 2 })} mois`)],
            help: "Cible 6 mois : suffisant pour absorber une perte d'emploi.",
            available: true,
        },
        {
            id: 'debtRatio' as const,
            label: 'Ratio dette/actif',
            value: debtScore,
            raw: [txt(formatPercent(debtAssetsRatio, 1))],
            help: "Cible 0% : pas de dette. >50% : zone critique.",
            available: true,
        },
        {
            id: 'fireProgress' as const,
            label: 'Progression FIRE',
            value: fireScore ?? 0,
            // ⚠️ Le montant est un SEGMENT à part (masquable), et il passe désormais par
            // `formatCAD` : l'ancien `${formatNumber(x)} $` composait le format à la main, ce que le
            // non-négociable « Formatage $ » interdit. Seule différence de rendu, MESURÉE :
            // l'espace avant le « $ » devient insécable (U+00A0 au lieu de U+0020) — invisible.
            raw: fireProgressPct != null
                ? [txt(`${formatPercent(fireProgressPct, 1)} (cible Future : `), mnt(fireTarget ?? 0), txt(')')]
                : [txt('Projection requise — ouvrir Future')],
            help: fireProgressPct != null
                ? "Cible 100% : indépendance financière atteinte (règle des 4%)."
                : "La cible FIRE vient de l'onglet Future (moteur de projection). Calculez-la d'abord.",
            available: fireScore != null,
        },
        {
            id: 'budgetParity' as const,
            label: 'Adhérence au budget',
            value: budgetParityScore ?? 0,
            raw: [txt(budgetParityRaw)],
            help: budgetParityScore != null
                ? "Cible 100% : tu restes dans tes cibles par poste (hors épargne). Le score baisse avec le dépassement."
                : !budgetInputsUsable
                    ? "Un poste de budget porte une cible, ou une dépense rapprochée, qui n'est pas un nombre exploitable. Corrige-la dans Budget pour réactiver la mesure."
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
                ? [mnt(subMonthly), txt(`/mois (${formatPercent(subLoadPct, 1)} du revenu net)`)]
                : subscriptions.length === 0
                    ? [txt('Aucun abonnement épinglé')]
                    : subsDiscarded > 0
                        ? [txt(`${subsDiscarded} abonnement(s) au coût illisible — corrige-les dans Charges fixes`)]
                        : [txt('Revenu requis')],
            // ⚠️ Aucun chiffre dans ce texte : il est LU par l'utilisateur, donc il aurait l'autorité
            // d'une mesure. Le « +7 points » que j'y avais écrit venait d'une fixture précise du
            // panel et n'était re-dérivable par personne — même classe que le chiffre recopié d'un
            // ticket au lot 30. La direction du biais, elle, est un fait de structure : un coût
            // écarté ne peut qu'ALLÉGER le fardeau, donc flatter le score.
            help: subsDiscarded > 0
                ? "Un abonnement épinglé porte un coût annuel qui n'est pas un nombre exploitable. Tant qu'il est là, le poids des abonnements n'est pas mesuré : écarter ce coût rendrait le fardeau artificiellement plus léger, donc le score meilleur qu'il ne l'est."
                : "Cible <15% du revenu net en abonnements épinglés. Épingle tes abos dans « Charges fixes ».",
            available: subscriptionLoadScore != null,
        },
    ]);
}

/** Score global pondéré. N'inclut que les métriques DISPONIBLES (numérateur ET dénominateur) :
 *  une métrique sans donnée (ex. FIRE sans projection, budget sans dépenses) ne doit pas peser
 *  comme un 0 qui écraserait le score. Normalisé par la somme des poids des seules métriques comptées.
 *
 *  ⚠️ Rend **`null`** quand RIEN n'est mesurable (aucune métrique disponible, ou des poids tous à
 *  zéro) — jamais `0`. Le repli `: 0` d'avant était une branche MORTE tant que les trois métriques
 *  de base (`savingsRate`, `emergencyFund`, `debtRatio`) étaient déclarées `available: true` en dur ;
 *  `sanitizeNonFinite` vient justement de rendre ce chemin ATTEIGNABLE (une corruption large peut
 *  désormais les exclure toutes les trois). Or `0` s'affiche « 0/100 » avec l'anneau ROUGE
 *  (`colorForHealthScore(0)`) : l'utilisateur lirait « santé critique » là où la vraie réponse est
 *  « on ne peut rien mesurer » (mesuré : total 0, palette `stroke-danger-400`). Le type union force
 *  `tsc` à exiger la branche honnête sur CHAQUE surface d'affichage, présente et future
 *  (finding silent-failure-hunter, panel PR #756). */
export function computeHealthTotalScore(metrics: readonly HealthMetricRow[], weights: HealthWeights): number | null {
    // `Number.isFinite` en CEINTURE : `computeHealthMetrics` assainit déjà sa sortie, mais cette
    // fonction est exportée et peut recevoir des lignes d'une autre provenance — une seule valeur
    // non finie rendrait tout le score `NaN`.
    const counted = metrics.filter(m => m.available && Number.isFinite(m.value));
    const weightedSum = counted.reduce((sum, m) => sum + m.value * (weights[m.id] || 0), 0);
    const totalWeight = counted.reduce((sum, m) => sum + (weights[m.id] || 0), 0);
    return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;
}

/** Palette NEUTRE pour « aucun score mesurable ». Surtout pas celle de `colorForHealthScore(0)`,
 *  qui est la palette DANGER — un état « on ne sait pas » ne se peint pas en alarme rouge. */
export const HEALTH_SCORE_UNKNOWN_COLORS = { ring: 'stroke-ink-500', text: 'text-ink-400', bg: 'bg-white/5' } as const;

export function colorForHealthScore(score: number): { ring: string; text: string; bg: string } {
    if (score >= 70) return { ring: 'stroke-success-400', text: 'text-emerald-300', bg: 'bg-success-500/10' };
    if (score >= 40) return { ring: 'stroke-warning-400', text: 'text-amber-300', bg: 'bg-warning-500/10' };
    return { ring: 'stroke-danger-400', text: 'text-red-300', bg: 'bg-danger-500/10' };
}
