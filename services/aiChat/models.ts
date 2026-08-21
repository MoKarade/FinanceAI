// services/aiChat/models.ts
//
// [B3-CHAT-MODEL] Source UNIQUE des modèles Claude offerts dans le chat (demande Marc : « choisir
// quel ia » par conversation). Module LÉGER (zéro import — boot-safe : consommé statiquement par
// AiChatView/useAiChat). `services/claude.ts` dérive ses constantes MODEL_SONNET/MODEL_HAIKU d'ici
// (jamais deux littéraux d'id qui divergent — classe « littéral dupliqué à côté de la source »).

import type { AiChatModelKey } from '../../types';
import { PRICING_USD_PER_MTOK } from './pricing';

/** Ids API complets par clé de chat. ⚠️ Chaque id DOIT avoir une entrée dans PRICING_USD_PER_MTOK
 *  (services/aiChat/pricing) — parité verrouillée par tests/services/aiChatPricing.test.ts. */
export const MODEL_IDS: Record<AiChatModelKey, string> = {
    haiku: 'claude-haiku-4-5-20251001',
    sonnet: 'claude-sonnet-4-6',
    opus: 'claude-opus-4-8',
};

/** Défaut historique du chat (choix Marc, AITOOLS-B) — utilisé quand `aiChatModel` est absent. */
export const DEFAULT_AI_CHAT_MODEL: AiChatModelKey = 'sonnet';

// [Finding ai-reviewer #489] Le ratio de coût affiché DÉRIVE du tarif réel (pricing.ts) — un texte
// en dur (« 5× ») avait déjà divergé de la table (5/3 ≈ 1,7×) dans le même diff.
const ratioVsSonnet = (key: AiChatModelKey): string => {
    const a = PRICING_USD_PER_MTOK[MODEL_IDS[key]]?.input;
    const b = PRICING_USD_PER_MTOK[MODEL_IDS.sonnet]?.input;
    return a && b ? `≈ ${(a / b).toFixed(1).replace('.', ',')}×` : '';
};

/** Options du sélecteur UI (ordre = du plus économique au plus capable). */
export const AI_CHAT_MODELS: Array<{ key: AiChatModelKey; label: string; description: string }> = [
    { key: 'haiku', label: 'Haiku', description: `Rapide et économique (${ratioVsSonnet('haiku')} le coût de Sonnet)` },
    { key: 'sonnet', label: 'Sonnet', description: 'Équilibre qualité/coût (défaut)' },
    { key: 'opus', label: 'Opus', description: `Le plus capable (${ratioVsSonnet('opus')} le coût de Sonnet)` },
];

/** Ceinture : une valeur inconnue (état synchronisé par une version future/corrompu) retombe sur le
 *  défaut — jamais un id de modèle invalide envoyé à l'API. */
export function resolveChatModelKey(value: unknown): AiChatModelKey {
    return value === 'haiku' || value === 'sonnet' || value === 'opus' ? value : DEFAULT_AI_CHAT_MODEL;
}

/**
 * [TX-STALE-MODEL-LABEL] Libellé LISIBLE d'un id de modèle, DÉRIVÉ de la table ci-dessus.
 * Pourquoi : une surface affichait « Claude Sonnet 4.6 » en dur pendant une opération qui tourne
 * sur Haiku depuis la bascule — un libellé recopié ne suit jamais le modèle qu'il prétend nommer
 * (classe `DOC-METRIQUE-RECOPIEE` appliquée à l'UI). Rendu ici plutôt qu'au site d'affichage pour
 * que TOUTE surface qui nomme un modèle lise la même source.
 * Un id inconnu rend l'id brut : honnête (on ne sait pas le traduire) plutôt qu'un faux nom.
 */
export function modelLabelFromId(id: string): string {
    const entry = AI_CHAT_MODELS.find((m) => MODEL_IDS[m.key] === id);
    return entry ? `Claude ${entry.label}` : id;
}
