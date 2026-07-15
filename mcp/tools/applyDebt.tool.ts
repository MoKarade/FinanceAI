// mcp/tools/applyDebt.tool.ts
//
// [MCP-APPLY-DEBT] — tool d'ÉCRITURE : ajoute (ou met à jour, par nom) une dette RÉELLE dans l'état
// FinanceAI — prêt auto, carte de crédit, prêt perso… Demande Marc 2026-07-15 (« rajouter des dettes
// avec mcp genre achat de voiture »).
//
// ⚠️ Sémantique moteur : les dettes n'ont PAS de date de début — la projection les SERT DÈS LE MOIS 0
// (paiements + intérêts immédiats). Ce tool est donc réservé aux dettes DÉJÀ CONTRACTÉES. Pour un
// achat FUTUR ou hypothétique (« si j'achète une voiture demain ? ») → `simulate_what_if`, qui
// modélise l'événement daté sans fausser le patrimoine d'avant.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runApply } from './_writeHelper';
import type { ToolTextResult } from './_dataAware';
import type { StateStore } from '../state/stateStore';

// Leçon MCP-WHATIF : `.finite()` OBLIGATOIRE sur tout montant (Zod .positive()/.max() laissent
// passer Infinity) — et applyDebt re-garde côté métier (un appel direct du handler bypasse Zod).
const inputSchema = {
    name: z.string().min(1).max(120)
        .describe('Nom de la dette (ex. « Prêt auto Honda Civic »). ⚠️ Une dette EXISTANTE du même nom est ÉCRASÉE (mise à jour), pas dupliquée : pour une dette DIFFÉRENTE, choisis un nom distinctif (« Marge perso » vs « Marge auto »).'),
    balance: z.number().positive().finite().optional()
        .describe('Solde ACTUELLEMENT dû ($ CAD). REQUIS pour un ajout ; omissible en mise à jour partielle (le champ existant est conservé).'),
    interestRate: z.number().min(0).max(100).finite().optional()
        .describe("Taux d'intérêt annuel (%). Ex. 7.49. REQUIS pour un ajout ; omissible en mise à jour."),
    minimumPayment: z.number().min(0).finite().optional()
        .describe('Paiement mensuel (minimum ou régulier, $ CAD). REQUIS pour un ajout ; omissible en mise à jour.'),
    category: z.enum(['CreditCard', 'Car', 'Student', 'Personal', 'Other']).optional()
        .describe('Catégorie. Absente → inférée du nom (auto/études/carte), sinon Personal.'),
    amortizationYears: z.number().int().min(1).max(50).optional()
        .describe("Durée d'amortissement en années (prêt auto/perso à terme)."),
    rateProvider: z.string().max(80).optional()
        .describe('Institution prêteuse (optionnel, informatif).'),
};

export const registerApplyDebt = (server: McpServer, store: StateStore): void => {
    server.tool(
        'apply_debt',
        "ÉCRIT dans l'état FinanceAI : ajoute une dette RÉELLE (prêt auto, carte de crédit, prêt " +
        'perso, marge…) ou MET À JOUR la dette existante du même nom — mise à jour PARTIELLE : ' +
        'seuls les champs fournis changent, jamais de doublon au retry. ⚠️ Même nom = ÉCRASEMENT ' +
        "(pas d'ajout) : une dette différente exige un nom distinctif. Une sauvegarde horodatée est " +
        "créée AVANT l'écriture (annulable). ⚠️ Réservé aux dettes DÉJÀ CONTRACTÉES : la projection " +
        'les sert immédiatement (paiements + intérêts dès maintenant). Pour un achat FUTUR ou ' +
        'hypothétique (« si j\'achète une voiture demain ? »), utilise simulate_what_if à la place — ' +
        "sinon le patrimoine serait faussé avant l'événement. N'invente jamais de chiffres : ne " +
        "renseigne que ce que l'utilisateur a fourni.",
        inputSchema,
        async (args): Promise<ToolTextResult> => runApply(store, { kind: 'debt', ...args }),
    );
};
