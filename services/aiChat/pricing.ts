// services/aiChat/pricing.ts
//
// [B4-CHAT-COST] Coût API RÉEL du chat : tokens d'usage (response.usage du SDK Anthropic) × tarif
// public du modèle. Module PUR et léger (boot-safe). Le coût est calculé en USD (les tarifs
// Anthropic sont en USD) et converti en CAD À L'AFFICHAGE via fxRates.USD (source unique FX de
// l'app) — jamais de taux en dur.
//
// Tarifs : https://docs.claude.com/en/docs/about-claude/pricing (relevés via le skill claude-api,
// cache 2026-06-24). ⚠️ Pas des constantes fiscales (FISCAL_REFERENCE hors périmètre) mais bien du
// money-critical : datées + sourcées, à rafraîchir si Anthropic change ses prix.
//  - cache READ  = 0,1 × le tarif input ;
//  - cache WRITE = 1,25 × le tarif input (TTL 5 min — le seul utilisé par le chat, cf. useAiChat
//    `cache_control: ephemeral` sur les pièces jointes ; le TTL 1h/2× n'est pas utilisé ici).

/** Tokens consommés, champs du SDK agrégés sur tous les tours d'une boucle agentique. */
export interface AiTokenUsage {
    inputTokens: number;
    outputTokens: number;
    /** cache_creation_input_tokens (écriture de cache, facturée 1,25× l'input). */
    cacheWriteTokens: number;
    /** cache_read_input_tokens (lecture de cache, facturée 0,1× l'input). */
    cacheReadTokens: number;
}

export const EMPTY_USAGE: AiTokenUsage = { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };

/** Somme deux usages (accumulation par tour). Champs non finis ignorés (jamais de NaN propagé). */
export function addUsage(a: AiTokenUsage, b: AiTokenUsage): AiTokenUsage {
    const n = (v: number): number => (Number.isFinite(v) ? v : 0);
    return {
        inputTokens: n(a.inputTokens) + n(b.inputTokens),
        outputTokens: n(a.outputTokens) + n(b.outputTokens),
        cacheWriteTokens: n(a.cacheWriteTokens) + n(b.cacheWriteTokens),
        cacheReadTokens: n(a.cacheReadTokens) + n(b.cacheReadTokens),
    };
}

/** USD par MILLION de tokens, par id de modèle COMPLET (docs.claude.com/pricing, 2026-06-24).
 *  ⚠️ Doit couvrir TOUS les ids de MODEL_IDS (services/aiChat/models) — parité verrouillée par test. */
export const PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
    'claude-haiku-4-5-20251001': { input: 1, output: 5 },
    'claude-sonnet-4-6': { input: 3, output: 15 },
    'claude-opus-4-8': { input: 5, output: 25 },
};

const CACHE_READ_FACTOR = 0.1;
const CACHE_WRITE_FACTOR = 1.25;

/**
 * Coût USD d'un usage pour un modèle donné. `null` si le modèle n'a PAS de tarif connu — jamais un
 * 0 plausible (no-fake-data : un coût inconnu affiché « 0,00 $ » mentirait, l'absence est honnête).
 */
export function chatCostUsd(usage: AiTokenUsage, modelId: string): number | null {
    const rate = PRICING_USD_PER_MTOK[modelId];
    if (!rate) return null;
    const n = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);
    return (
        n(usage.inputTokens) * rate.input
        + n(usage.outputTokens) * rate.output
        + n(usage.cacheWriteTokens) * rate.input * CACHE_WRITE_FACTOR
        + n(usage.cacheReadTokens) * rate.input * CACHE_READ_FACTOR
    ) / 1_000_000;
}

/** Coût USD cumulé d'une liste de messages (Σ des `costUsd` posés sur les réponses du modèle). */
export function sumMessagesCostUsd(messages: Array<{ costUsd?: number }>): number {
    let total = 0;
    for (const m of messages) {
        if (typeof m.costUsd === 'number' && Number.isFinite(m.costUsd) && m.costUsd > 0) total += m.costUsd;
    }
    return total;
}
