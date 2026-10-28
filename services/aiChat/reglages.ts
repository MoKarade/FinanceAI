// services/aiChat/reglages.ts
//
// Réglages d'appel par génération de modèle. Module PUR et léger (zéro import — boot-safe).
//
// POURQUOI : la famille 5.5 PENSE par défaut, et la pensée compte dans `max_tokens`. Un appel
// d'extraction plafonné à 512 jetons (fiche de paie) serait mangé par la pensée avant la réponse.
// Et `temperature` / `top_p` / `top_k` sont REFUSÉS (400) : le déterminisme ne se règle plus à
// l'appel, il se tient par le prompt et par la validation Zod de la sortie.
//
// Règles de l'API (skill claude-api, `shared/model-migration.md`, relu le 28/10/2026) :
//   · Haiku 5.5 : `thinking: {type:'disabled'}` accepté à effort ≤ high ;
//   · Sonnet 5.5 / Opus 5.5 : `disabled` → 400 ; le plus bas est `between_tools` (Sonnet 5.5 seul).
// Un id inconnu ne reçoit AUCUN réglage : mieux vaut le comportement par défaut qu'un 400.

type Effort = 'low' | 'medium' | 'high';

export interface ReglagesAppel {
    thinking?: { type: 'disabled' } | { type: 'between_tools' };
    output_config?: { effort: Effort };
}

/**
 * Lecture / extraction / catégorisation : on ne veut pas de réflexion, on veut le JSON.
 * Haiku : pensée coupée, effort bas. Sonnet : pensée au plus bas (`between_tools`), effort moyen
 * (documents financiers : la qualité prime sur le coût). Opus ne peut pas couper la pensée : effort bas.
 */
export function reglagesLecture(modelId: string): ReglagesAppel {
    if (modelId.startsWith('claude-haiku-5-5')) return { thinking: { type: 'disabled' }, output_config: { effort: 'low' } };
    if (modelId.startsWith('claude-sonnet-5-5')) return { thinking: { type: 'between_tools' }, output_config: { effort: 'medium' } };
    if (modelId.startsWith('claude-opus-5-5')) return { output_config: { effort: 'low' } };
    return {};
}

/** Conversation (une seule réponse, sans outils) : pensée adaptative conservée, effort moyen. */
export function reglagesConversation(modelId: string): ReglagesAppel {
    if (/^claude-(haiku|sonnet|opus)-5-5/.test(modelId)) return { output_config: { effort: 'medium' } };
    return {};
}
