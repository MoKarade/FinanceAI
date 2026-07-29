// mcp/tools/setBudgetItem.spec.ts
// [MCP-DIRECT-EDIT Lot 2] SPEC pur (browser-safe) du tool d'ÉCRITURE `set_budget_item` — ajoute ou met
// à jour (PAR NOM, update PARTIEL) un poste de budget. Éditer la cible décroche la cible auto-gérée
// (`autoTarget: false`, règle BUDGET-TX-CATEGORIES). Confirmation à 2 temps via `confirm`.

import { z } from 'zod';
import type { WriteToolSpec } from './_toolSpec';

// Leçon MCP-WHATIF : `.finite()` OBLIGATOIRE sur tout montant $ (Zod .min()/.max() laissent passer Infinity).
const inputSchema = {
    name: z.string().min(1).max(120)
        .describe('Nom du poste de budget (ex. « Épicerie »). ⚠️ Un poste EXISTANT du même nom (casse/accents ' +
            'ignorés) est MIS À JOUR, pas dupliqué. Pour rapprocher les dépenses réelles, le nom doit ' +
            'correspondre à une catégorie de transactions de l\'utilisateur.'),
    targetCad: z.number().min(0).finite().optional()
        .describe('Cible en $ CAD (dans la fréquence du poste — ex. 600 si Monthly). REQUISE pour un AJOUT ; ' +
            'omissible en mise à jour partielle. ⚠️ Éditer la cible fige le poste en cible MANUELLE (la ' +
            'cible auto-calculée depuis l\'historique ne l\'écrasera plus). N\'invente jamais ce chiffre.'),
    frequency: z.enum(['Monthly', 'Yearly', 'Weekly', 'Quarterly']).optional()
        .describe('Fréquence de la cible. Absente : Monthly à l\'ajout, inchangée en mise à jour.'),
    nature: z.enum(['Besoin', 'Envie', 'Epargne']).optional()
        .describe('Nature du poste (règle 50/30/20). Absente : Besoin à l\'ajout, inchangée en mise à jour.'),
    type: z.enum(['Commun', 'Perso 1', 'Perso 2']).optional()
        .describe('Répartition couple. Absente : Commun à l\'ajout, inchangée en mise à jour.'),
    confirm: z.boolean().optional()
        .describe('Laisse VIDE au 1er appel. SI la réponse est un APERÇU (preview:true, rien écrit), montre-le ' +
            'à l\'utilisateur et, APRÈS son accord explicite, rappelle ce tool avec confirm:true (mêmes ' +
            'arguments) pour appliquer. SI la réponse est déjà appliquée (applied:true — certaines surfaces ' +
            'confirment visuellement d\'elles-mêmes), NE rappelle PAS : c\'est déjà fait.'),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const setBudgetItemSpec = {
    kind: 'write',
    name: 'set_budget_item',
    description:
        'ÉCRIT dans l\'état FinanceAI : ajoute un poste de budget ou MET À JOUR le poste existant du même ' +
        'nom — mise à jour PARTIELLE : seuls les champs fournis changent, jamais de doublon au retry. ' +
        '⚠️ Éditer la cible d\'un poste auto-géré le passe en cible MANUELLE (décroché de la moyenne ' +
        'historique). Une sauvegarde horodatée est créée AVANT l\'écriture (annulable). ⚠️ CONFIRMATION à ' +
        '2 temps : sans confirm:true, l\'appel renvoie un APERÇU (avant→après) SANS écrire ; n\'applique ' +
        '(confirm:true) qu\'après accord explicite de l\'utilisateur. N\'invente jamais de chiffres : ne ' +
        'renseigne que ce que l\'utilisateur a fourni.',
    inputSchema,
    // `confirm` est un flag de CONTRÔLE (pas une donnée du document) → non inclus dans le DocumentPayload.
    toDocument: (args: Args) => ({
        kind: 'budget_item',
        name: args.name,
        ...(args.targetCad != null ? { targetCad: args.targetCad } : {}),
        ...(args.frequency ? { frequency: args.frequency } : {}),
        ...(args.nature ? { nature: args.nature } : {}),
        ...(args.type ? { type: args.type } : {}),
    }),
} satisfies WriteToolSpec<Args>;
