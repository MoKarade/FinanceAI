// services/aiChat/coutIa.ts
//
// [COUT-IA-MESURE] Coût RÉEL des appels Claude de l'app, mesuré AU POINT DE CONTACT SDK
// (`services/claude.ts` : chaque `messages.create(` / `messages.stream(`), avec le tarif de
// `pricing.ts`. Le cumul à vie (`aiChatCostUsdTotal`) alimente le bloc `usage` du résumé du hub :
// sans écrivain il restait figé à 0 $ pendant que catégorisation, Planning, Impôts et lecture de
// talon coûtaient de vrais dollars (FinanceAI#50) — un chiffre non mesuré, donc faux.
//
// Module PUR et léger (boot-safe) : il ne connaît ni le store ni le réseau. Le store s'y abonne
// (`brancherCoutIa`) ; sans abonné (tests, Node), la mesure est calculée puis ignorée.

import { chatCostUsd, type AiTokenUsage } from './pricing';

/** Forme minimale de `response.usage` du SDK Anthropic (champs de cache absents sur certaines réponses). */
export interface UsageSdk {
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
}

/** Usage du SDK → tokens de `pricing.ts`. `null` si la réponse ne porte aucun usage (jamais un 0 inventé). */
export function usageDepuisSdk(usage: UsageSdk | null | undefined): AiTokenUsage | null {
    if (!usage) return null;
    const n = (v: number | null | undefined): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
    return {
        inputTokens: n(usage.input_tokens),
        outputTokens: n(usage.output_tokens),
        cacheWriteTokens: n(usage.cache_creation_input_tokens),
        cacheReadTokens: n(usage.cache_read_input_tokens),
    };
}

type Abonne = (coutUsd: number) => void;
const abonnes = new Set<Abonne>();

/** Branche un écrivain du cumul (en production : le store seul). Rend la fonction de débranchement. */
export function brancherCoutIa(fn: Abonne): () => void {
    abonnes.add(fn);
    return () => {
        abonnes.delete(fn);
    };
}

/**
 * À appeler UNE fois par réponse du modèle. Coût inconnu (modèle sans tarif) ou usage absent :
 * trace dans la console, rien n'est cumulé — jamais un coût fabriqué (no-fake-data).
 * Un échec de l'abonné ne doit jamais faire échouer l'appel Claude payé : il est journalisé, pas avalé.
 */
export function signalerUsageIa(modelId: string, usageSdk: UsageSdk | null | undefined): void {
    const usage = usageDepuisSdk(usageSdk);
    if (!usage) {
        console.warn(`[coutIa] réponse sans usage (modèle ${modelId}) : coût non mesuré`);
        return;
    }
    const cout = chatCostUsd(usage, modelId);
    if (cout === null) {
        console.warn(`[coutIa] modèle sans tarif (${modelId}) : coût non mesuré`);
        return;
    }
    if (cout <= 0) return;
    for (const fn of abonnes) {
        try {
            fn(cout);
        } catch (err) {
            console.error('[coutIa] le cumul du coût a échoué', err);
        }
    }
}
