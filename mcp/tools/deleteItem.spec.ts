// mcp/tools/deleteItem.spec.ts
// [MCP-DIRECT-EDIT Lots 4-5] SPEC pur (browser-safe) du tool de SUPPRESSION `delete_item` — actif
// (« j'ai tout vendu mes X »), dette (soldée/erronée) ou objectif d'épargne. Geste DESTRUCTIF :
// correspondance normalisée EXACTE (jamais de fuzzy), ambiguïté → erreur, confirmation à 2 temps
// STRICTE + sauvegarde horodatée avant écriture. Détail des choix : docs/adr/0009-suppressions-via-mcp-delete-item.md (ADR Lots 4-5).

import { z } from 'zod';
import type { WriteToolSpec } from './_toolSpec';

const inputSchema = {
    entity: z.enum(['asset', 'debt', 'savings_goal'])
        .describe('Type d\'entité : asset = un ACTIF du portefeuille (par SYMBOLE — « j\'ai tout vendu mes ' +
            'VFV.TO ») ; debt = une DETTE (soldée ou saisie par erreur) ; savings_goal = un OBJECTIF d\'épargne.'),
    name: z.string().min(1).max(120)
        .describe('SYMBOLE exact de l\'actif (ex. VFV.TO), ou NOM exact de la dette/objectif (casse/accents ' +
            'ignorés, mais PAS de correspondance approximative : le nom doit désigner l\'entité sans ambiguïté).'),
    accountType: z.string().max(20).optional()
        .describe('Actifs seulement : compte (CELI / REER / NON-ENREG / CRYPTO…) pour désambiguïser un ' +
            'symbole détenu dans plusieurs comptes.'),
    confirm: z.boolean().optional()
        .describe('Laisse VIDE au 1er appel. SI la réponse est un APERÇU (preview:true, rien supprimé), ' +
            'montre-le à l\'utilisateur (ce qui disparaît + les effets listés) et, APRÈS son accord ' +
            'EXPLICITE, rappelle ce tool avec confirm:true pour supprimer réellement. SI la réponse est ' +
            'déjà appliquée (applied:true — certaines surfaces confirment d\'elles-mêmes), NE rappelle PAS.'),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const deleteItemSpec = {
    kind: 'write',
    name: 'delete_item',
    description:
        'SUPPRIME de l\'état FinanceAI : un ACTIF du portefeuille (= « vente totale » — il n\'y a pas de ' +
        'registre de ventes, la position disparaît AVEC sa contribution passée à la courbe ; le produit ' +
        'd\'une vraie vente arrive par les transactions bancaires), une DETTE (le patrimoine net MONTE du ' +
        'solde retiré — réservé à une dette soldée/erronée) ou un OBJECTIF d\'épargne (son décaissement ' +
        'planifié est annulé). Correspondance EXACTE par symbole/nom (ambiguïté → erreur, jamais de ' +
        'suppression approximative). Une sauvegarde horodatée est créée AVANT (annulable via Réglages → ' +
        'Sauvegarde). ⚠️ CONFIRMATION à 2 temps OBLIGATOIRE : sans confirm:true, l\'appel renvoie un APERÇU ' +
        'SANS rien supprimer ; ne supprime (confirm:true) qu\'après accord explicite de l\'utilisateur sur ' +
        'l\'aperçu. Ne supprime JAMAIS de ta propre initiative.',
    inputSchema,
    // `confirm` est un flag de CONTRÔLE (pas une donnée du document) → non inclus dans le DocumentPayload.
    toDocument: (args: Args) => ({
        kind: 'delete_item',
        entity: args.entity,
        name: args.name,
        ...(args.accountType ? { accountType: args.accountType } : {}),
    }),
} satisfies WriteToolSpec<Args>;
