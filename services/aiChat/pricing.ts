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

/**
 * [AI-MODELID-PINNING-DRIFT] ⚠️ TOUS LES IDS NE SE PÉRIMENT PAS DE LA MÊME FAÇON, et le tableau ne
 * le disait pas.
 *
 * Un id **daté** (`claude-haiku-4-5-20251001`) désigne un instantané figé : son tarif ne peut pas
 * changer sous nos pieds. Un id **flottant** (`claude-sonnet-4-6`) est un alias qu'Anthropic peut
 * repointer vers un autre instantané, avec un autre tarif — et rien dans l'app ne le remarquerait.
 * Le coût affiché à l'écran deviendrait faux **en silence**, ce qui est exactement le mode de panne
 * que `no-fake-data` vise : un chiffre plausible vaut moins qu'une absence honnête.
 *
 * Le ticket proposait « épingler des instantanés datés partout ». Ce n'est PAS faisable ici :
 * inventer un identifiant d'instantané casserait tous les appels, et l'app n'a aucun moyen de le
 * découvrir seule. C'est la seconde branche du ticket qui est livrée — **dater la vérification** et
 * rendre la distinction EXPLICITE, pour qu'un alias non revérifié soit visible plutôt que supposé
 * à jour.
 *
 * ⚠️ Volontairement PAS de test qui lit l'horloge pour crier « tarif périmé » : un contrôle qui
 * rougit à une date sans qu'aucune ligne n'ait changé est une bombe (leçon du dépôt sur les tests
 * qui figent une année). C'est un INVENTAIRE qui porte la dette — et il doit décroître : un id daté
 * n'a rien à y faire, et le test le refuse.
 */
interface TarifModele {
    readonly input: number;
    readonly output: number;
    /** Date du relevé sur docs.claude.com/pricing — ce que l'app peut honnêtement affirmer. */
    readonly releveLe: string;
    /**
     * `true` = l'id est un ALIAS que le fournisseur peut repointer. Le tarif ci-dessus était juste
     * au `releveLe` pour l'instantané visé CE JOUR-LÀ ; rien ne garantit qu'il le soit encore.
     */
    readonly aliasFlottant: boolean;
}

/** USD par MILLION de tokens, par id de modèle COMPLET (docs.claude.com/pricing).
 *  ⚠️ Doit couvrir TOUS les ids de MODEL_IDS (services/aiChat/models) — parité verrouillée par test. */
export const PRICING_USD_PER_MTOK: Record<string, TarifModele> = {
    // Instantané DATÉ : ni le modèle ni son tarif ne peuvent bouger sous cet identifiant.
    'claude-haiku-4-5-20251001': { input: 1, output: 5, releveLe: '2026-06-24', aliasFlottant: false },
    // ⚠️ Alias FLOTTANTS — cf. `ALIAS_A_EPINGLER` ci-dessous.
    'claude-sonnet-4-6': { input: 3, output: 15, releveLe: '2026-06-24', aliasFlottant: true },
    'claude-opus-4-8': { input: 5, output: 25, releveLe: '2026-06-24', aliasFlottant: true },
};

/**
 * Inventaire de la dette : les ids qu'on aimerait épingler et qu'on ne peut pas encore.
 *
 * ⚠️ Il doit SAVOIR MOURIR. Le test associé exige les deux sens — aucun alias flottant absent de
 * cette liste (sinon la dette grossit en silence), et aucune entrée qui ne corresponde plus à un
 * alias (sinon l'inventaire affirme au présent un défaut déjà réglé, et se lit comme un fait).
 */
export const ALIAS_A_EPINGLER: ReadonlyArray<{ id: string; raison: string }> = [
    {
        id: 'claude-sonnet-4-6',
        raison: "aucun identifiant d'instantané daté connu de l'app pour ce modèle ; en inventer un "
            + "casserait tous les appels du chat, ce qui est bien pire qu'un tarif qui dérive.",
    },
    {
        id: 'claude-opus-4-8',
        raison: "même raison que Sonnet. À épingler dès que le snapshot daté est connu — c'est "
            + "l'ajout d'un suffixe de date, pas un changement de code.",
    },
];

/**
 * Ce que l'app peut honnêtement dire d'un tarif : la date du relevé, et si l'id peut avoir bougé.
 * Rend `null` pour un modèle sans tarif — cohérent avec `chatCostUsd`, qui rend `null` plutôt qu'un
 * zéro plausible.
 */
export function provenanceTarif(modelId: string): string | null {
    const t = PRICING_USD_PER_MTOK[modelId];
    if (!t) return null;
    return t.aliasFlottant
        ? `Tarif Anthropic relevé le ${t.releveLe}. L'identifiant « ${modelId} » est un alias : le fournisseur peut l'avoir repointé depuis, le coût est donc un ordre de grandeur.`
        : `Tarif Anthropic relevé le ${t.releveLe} pour cette version figée du modèle.`;
}

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
