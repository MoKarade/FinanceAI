// services/aiChat/models.ts
//
// [B3-CHAT-MODEL] Source UNIQUE des modèles Claude offerts dans le chat (demande Marc : « choisir
// quel ia » par conversation). Module LÉGER (zéro import — boot-safe : consommé statiquement par
// AiChatView/useAiChat). `services/claude.ts` dérive ses constantes MODEL_SONNET/MODEL_HAIKU d'ici
// (jamais deux littéraux d'id qui divergent — classe « littéral dupliqué à côté de la source »).

import type { AiChatModelKey } from '../../types';

/** Ids API complets par clé de chat. ⚠️ Chaque id DOIT avoir une entrée dans PRICING_USD_PER_MTOK
 *  (services/aiChat/pricing) — parité verrouillée par tests/services/aiChatPricing.test.ts. */
export const MODEL_IDS: Record<AiChatModelKey, string> = {
    haiku: 'claude-haiku-4-5-20251001',
    sonnet: 'claude-sonnet-4-6',
    opus: 'claude-opus-4-8',
};

/** Défaut historique du chat (choix Marc, AITOOLS-B) — utilisé quand `aiChatModel` est absent. */
export const DEFAULT_AI_CHAT_MODEL: AiChatModelKey = 'sonnet';

/** Options du sélecteur UI (ordre = du plus économique au plus capable). */
export const AI_CHAT_MODELS: Array<{ key: AiChatModelKey; label: string; description: string }> = [
    { key: 'haiku', label: 'Haiku', description: 'Rapide et économique' },
    { key: 'sonnet', label: 'Sonnet', description: 'Équilibre qualité/coût (défaut)' },
    { key: 'opus', label: 'Opus', description: 'Le plus capable (5× le coût de Sonnet)' },
];

/** Ceinture : une valeur inconnue (état synchronisé par une version future/corrompu) retombe sur le
 *  défaut — jamais un id de modèle invalide envoyé à l'API. */
export function resolveChatModelKey(value: unknown): AiChatModelKey {
    return value === 'haiku' || value === 'sonnet' || value === 'opus' ? value : DEFAULT_AI_CHAT_MODEL;
}
