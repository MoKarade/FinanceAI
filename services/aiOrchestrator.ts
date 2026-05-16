// services/aiOrchestrator.ts
// Phase 4 B7 — Compositeur qui combine Era Context insights + Claude.
//
// Pattern: au lieu de demander à Claude de calculer (lent, coûteux, peu
// précis), on pré-calcule via Era Context puis on passe les chiffres tout
// prêts dans le system prompt de Claude. Claude se contente d'interpréter.
//
// Bénéfices:
//   - Réponses Claude basées sur des chiffres réels (pas hallucinations)
//   - Era Context fait les calculs en O(1) côté serveur
//   - Mémoire persistante (knowledge.recall) entre sessions
//   - Cache TTL côté Era Context évite les appels répétés

import {
    getCashFlow,
    analyzeSpending,
    forecastSpending,
    recallHistory,
    rememberFact,
    type CashFlowInsight,
    type SpendingAnalysis,
    type SpendingForecast,
    type RecalledFact,
} from './eraContext';

export interface EnrichedContext {
    cashFlow: CashFlowInsight | null;
    spending: SpendingAnalysis | null;
    forecast: SpendingForecast | null;
    memory: RecalledFact[];
    /** Token Era Context utilisé. Vide si l'utilisateur n'a pas configuré. */
    hasEraContext: boolean;
}

/**
 * Compose un snapshot enrichi depuis Era Context.
 *
 * Tous les appels sont parallèles (Promise.all). En cas d'échec d'un endpoint,
 * on retourne null pour ce slot — le caller peut décider comment dégrader.
 *
 * Ne lève PAS si Era Context est down ou non configuré (token vide).
 */
export async function buildEnrichedContext(
    eraContextToken: string,
    options: { signal?: AbortSignal } = {},
): Promise<EnrichedContext> {
    if (!eraContextToken) {
        return { cashFlow: null, spending: null, forecast: null, memory: [], hasEraContext: false };
    }

    const [cashFlow, spending, forecast, memory] = await Promise.all([
        getCashFlow(eraContextToken, { days: 90, signal: options.signal }).catch(() => null),
        analyzeSpending(eraContextToken, { days: 30, signal: options.signal }).catch(() => null),
        forecastSpending(eraContextToken, { months: 3, signal: options.signal }).catch(() => null),
        recallHistory(eraContextToken, { limit: 10, signal: options.signal }).catch(() => []),
    ]);

    return { cashFlow, spending, forecast, memory, hasEraContext: true };
}

/**
 * Formate l'EnrichedContext en string lisible par Claude (system prompt).
 *
 * Retourne une chaîne vide si rien à dire (pas d'Era Context configuré).
 * Le caller concatène cette string à son system prompt principal.
 */
export function renderEnrichedContext(ctx: EnrichedContext): string {
    if (!ctx.hasEraContext) return '';

    const lines: string[] = ['\n=== ERA CONTEXT INSIGHTS ==='];

    if (ctx.cashFlow) {
        lines.push(
            `Cash-flow ${ctx.cashFlow.period_start}→${ctx.cashFlow.period_end}:`,
            `  Revenus: ${ctx.cashFlow.income_total.toLocaleString()} CAD`,
            `  Dépenses: ${ctx.cashFlow.expense_total.toLocaleString()} CAD`,
            `  Net: ${ctx.cashFlow.net_cash_flow.toLocaleString()} CAD`,
        );
        if (ctx.cashFlow.by_category?.length) {
            const top3 = ctx.cashFlow.by_category.slice(0, 3);
            lines.push(`  Top 3 catégories: ${top3.map(c => `${c.category} (${c.amount.toLocaleString()}$)`).join(', ')}`);
        }
    }

    if (ctx.spending?.top_categories?.length) {
        lines.push(
            `\nAnalyse 30j: ${ctx.spending.total_spent.toLocaleString()} CAD total.`,
            `Top dépenses:`,
            ...ctx.spending.top_categories.slice(0, 5).map(c =>
                `  - ${c.category}: ${c.amount.toLocaleString()}$ (${c.pct.toFixed(1)}%)`,
            ),
        );
        if (ctx.spending.anomalies?.length) {
            lines.push(`Anomalies détectées:`);
            ctx.spending.anomalies.forEach(a => lines.push(`  ⚠️ ${a.category}: ${a.description}`));
        }
    }

    if (ctx.forecast?.forecast?.length) {
        lines.push(`\nPrévision ${ctx.forecast.months_ahead} mois:`);
        ctx.forecast.forecast.forEach(f =>
            lines.push(`  ${f.month}: dépenses ~${f.projected_expenses.toLocaleString()}$${f.projected_income ? `, revenus ~${f.projected_income.toLocaleString()}$` : ''}`),
        );
    }

    if (ctx.memory.length > 0) {
        lines.push(`\n=== MÉMOIRE UTILISATEUR (préférences/objectifs casuels) ===`);
        ctx.memory.slice(0, 8).forEach(f => lines.push(`  - "${f.fact}" (mémorisé le ${f.stored_at.split('T')[0]})`));
    }

    return lines.join('\n');
}

/**
 * Détecte si un message utilisateur est une commande "remember this" et
 * persiste le fait dans Era Context. Retourne true si capturé (le caller
 * peut alors court-circuiter l'appel Claude).
 *
 * Patterns reconnus:
 *   "remember: X"
 *   "souviens-toi: X"
 *   "note: X"
 */
export async function maybeRememberFromMessage(
    message: string,
    eraContextToken: string,
): Promise<{ captured: boolean; fact?: string }> {
    if (!eraContextToken) return { captured: false };
    const match = message.match(/^\s*(?:remember|souviens-toi|note|memorize)\s*:\s*(.+)$/i);
    if (!match) return { captured: false };
    const fact = match[1].trim();
    if (!fact) return { captured: false };
    const result = await rememberFact(eraContextToken, fact);
    return result ? { captured: true, fact } : { captured: false };
}
