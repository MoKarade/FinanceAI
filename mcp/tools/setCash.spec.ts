// mcp/tools/setCash.spec.ts
// [MCP-DIRECT-EDIT] SPEC pur (browser-safe) du tool d'ÉCRITURE DIRECTE `set_cash` — ajuste le solde de
// LIQUIDITÉS (cash) à une cible « juste en le demandant » (demande Marc). Le cash étant DÉRIVÉ des
// transactions + soldes de départ, l'application se fait par DELTA sur `initialBalances.LIQUIDITE`
// (voir `applyCashBalance` dans mcp/ingest/applyDocument.ts). Confirmation à 2 temps via `confirm`.

import { z } from 'zod';
import type { WriteToolSpec } from './_toolSpec';

// Leçon MCP-WHATIF : `.finite()` OBLIGATOIRE sur tout montant $ (Zod .min()/.max() laissent passer Infinity).
const inputSchema = {
    targetCad: z.number().min(0).finite()
        .describe('Nouveau solde de LIQUIDITÉS (cash) TOTAL visé, en $ CAD (ex. 50000). C\'est la valeur ' +
            'CIBLE après ajustement, pas un delta. N\'invente jamais ce chiffre : ne le renseigne que si ' +
            'l\'utilisateur l\'a donné.'),
    confirm: z.boolean().optional()
        .describe('Laisse VIDE au 1er appel → tu reçois un APERÇU (solde avant → après) SANS rien écrire. ' +
            'Montre cet aperçu à l\'utilisateur ; APRÈS son accord explicite, rappelle ce tool avec ' +
            'confirm:true (mêmes arguments) pour appliquer réellement.'),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const setCashSpec = {
    kind: 'write',
    name: 'set_cash',
    description:
        'ÉCRIT dans l\'état FinanceAI : ajuste le solde de LIQUIDITÉS (cash / compte chèque) à une cible en ' +
        '$ CAD. Le cash est calculé depuis tes transactions + soldes de départ → l\'ajustement se fait via ' +
        'le compte « LIQUIDITE » des soldes de départ (visible dans Réglages → Comptes), sans écraser tes ' +
        'transactions. Idempotent (redemander la même cible ne change rien). Une sauvegarde horodatée est ' +
        'créée AVANT l\'écriture (annulable). ⚠️ CONFIRMATION à 2 temps : sans confirm:true, l\'appel renvoie ' +
        'seulement un APERÇU (avant→après) SANS écrire ; n\'applique (confirm:true) qu\'après accord explicite ' +
        'de l\'utilisateur. Pour l\'ARGENT dans un compte de PLACEMENT (CELI/REER…), utilise plutôt un relevé ' +
        '(apply_broker_statement), pas ce tool (réservé au cash/liquidités).',
    inputSchema,
    // `confirm` est un flag de CONTRÔLE (pas une donnée du document) → non inclus dans le DocumentPayload.
    toDocument: (args: Args) => ({ kind: 'cash_balance', targetCad: args.targetCad }),
} satisfies WriteToolSpec<Args>;
