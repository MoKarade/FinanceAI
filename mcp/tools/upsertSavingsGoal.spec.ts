// mcp/tools/upsertSavingsGoal.spec.ts
// [MCP-DIRECT-EDIT Lot 3] SPEC pur (browser-safe) du tool d'ÉCRITURE `upsert_savings_goal` — ajoute ou
// met à jour (PAR NOM, update PARTIEL) un objectif d'épargne. Confirmation à 2 temps via `confirm`.

import { z } from 'zod';
import type { WriteToolSpec } from './_toolSpec';

// Leçon MCP-WHATIF : `.finite()` OBLIGATOIRE sur tout montant $ (Zod .min()/.max() laissent passer Infinity).
const inputSchema = {
    name: z.string().min(1).max(120)
        .describe('Nom de l\'objectif (ex. « Voyage Japon », « Fonds d\'urgence »). ⚠️ Un objectif EXISTANT ' +
            'du même nom (casse/accents ignorés) est MIS À JOUR, pas dupliqué.'),
    targetAmountCad: z.number().positive().finite().optional()
        .describe('Montant CIBLE en $ CAD (ex. 8000). REQUIS pour un AJOUT ; omissible en mise à jour ' +
            'partielle. N\'invente jamais ce chiffre.'),
    currentAmountCad: z.number().min(0).finite().optional()
        .describe('Montant DÉJÀ accumulé en $ CAD. Optionnel (0 par défaut à l\'ajout ; inchangé en mise à jour).'),
    deadline: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).optional()
        .describe('Échéance au format YYYY-MM-DD (ou YYYY-MM). Optionnelle.'),
    icon: z.string().max(8).optional()
        .describe('Emoji d\'icône (ex. ✈️). Optionnel (💰 par défaut à l\'ajout).'),
    confirm: z.boolean().optional()
        .describe('Laisse VIDE au 1er appel. SI la réponse est un APERÇU (preview:true, rien écrit), montre-le ' +
            'à l\'utilisateur et, APRÈS son accord explicite, rappelle ce tool avec confirm:true (mêmes ' +
            'arguments) pour appliquer. SI la réponse est déjà appliquée (applied:true — certaines surfaces ' +
            'confirment visuellement d\'elles-mêmes), NE rappelle PAS : c\'est déjà fait.'),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const upsertSavingsGoalSpec = {
    kind: 'write',
    name: 'upsert_savings_goal',
    description:
        'ÉCRIT dans l\'état FinanceAI : ajoute un objectif d\'épargne (voyage, fonds d\'urgence, mise de ' +
        'fonds…) ou MET À JOUR l\'objectif existant du même nom — mise à jour PARTIELLE : seuls les champs ' +
        'fournis changent, jamais de doublon au retry. Une sauvegarde horodatée est créée AVANT l\'écriture ' +
        '(annulable). ⚠️ CONFIRMATION à 2 temps : sans confirm:true, l\'appel renvoie un APERÇU (avant→après) ' +
        'SANS écrire ; n\'applique (confirm:true) qu\'après accord explicite de l\'utilisateur. N\'invente ' +
        'jamais de chiffres : ne renseigne que ce que l\'utilisateur a fourni.',
    inputSchema,
    // `confirm` est un flag de CONTRÔLE (pas une donnée du document) → non inclus dans le DocumentPayload.
    toDocument: (args: Args) => ({
        kind: 'savings_goal',
        name: args.name,
        ...(args.targetAmountCad != null ? { targetAmountCad: args.targetAmountCad } : {}),
        ...(args.currentAmountCad != null ? { currentAmountCad: args.currentAmountCad } : {}),
        ...(args.deadline ? { deadline: args.deadline } : {}),
        ...(args.icon ? { icon: args.icon } : {}),
    }),
} satisfies WriteToolSpec<Args>;
