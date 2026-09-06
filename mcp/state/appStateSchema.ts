// mcp/state/appStateSchema.ts
//
// Lot 1 — validation de FORME de l'AppState chargé par le serveur MCP.
//
// L'état réel de l'utilisateur (comptes, transactions, budget, objectifs…) est
// chargé depuis une source externe (fichier JSON local en stdio ; plus tard, le
// blob Drive — Lot 3). Avant de le passer au moteur pur, on valide sa forme avec
// zod pour échouer TÔT et CLAIREMENT sur un état malformé, plutôt que de laisser
// le moteur planter avec une erreur obscure.
//
// La validation est VOLONTAIREMENT permissive (`.passthrough()`, beaucoup de
// champs optionnels) : l'AppState est riche et évolue ; on vérifie surtout que
// les COLLECTIONS clés sont des tableaux et que `config.users` est exploitable.
// La normalisation (remplissage des défauts manquants) est faite séparément par
// `normalizeAppState` (mcp/state/appStateDefaults.ts — browser-safe, ré-exporté par loadAppState).

import { z } from 'zod';

// Un utilisateur : seuls name/salaires sont « attendus », tout le reste est
// optionnel (le moteur tolère les champs absents via des défauts).
const UserShape = z
    .object({
        name: z.string().optional(),
        grossSalary: z.number().optional(),
        netSalary: z.number().optional(),
        salary: z.number().optional(),
        age: z.number().optional(),
        birthYear: z.number().optional(),
        canadaArrivalYear: z.number().optional(),
        isImmigrant: z.boolean().optional(),
    })
    .passthrough();

const ConfigShape = z
    .object({
        users: z.array(UserShape).optional(),
        splitMode: z.string().optional(),
    })
    .passthrough();

/**
 * Schéma de FORME minimal de l'AppState. Tout est optionnel sauf qu'on impose
 * que, s'ils sont présents, les champs cités soient du bon type (tableaux /
 * objet config). Les blobs partiels (persona, Drive) restent acceptés.
 */
const AppStateShape = z
    .object({
        transactions: z.array(z.unknown()).optional(),
        assets: z.array(z.unknown()).optional(),
        budgetItems: z.array(z.unknown()).optional(),
        config: ConfigShape.optional(),
        projection: z.object({}).passthrough().optional(),
        realEstateGoals: z.array(z.unknown()).optional(),
        childGoals: z.array(z.unknown()).optional(),
        debts: z.array(z.unknown()).optional(),
        travelGoals: z.array(z.unknown()).optional(),
        lifeEvents: z.array(z.unknown()).optional(),
        retirementGoal: z.object({}).passthrough().optional(),
        financialGoals: z.array(z.unknown()).optional(),
        initialBalances: z.record(z.string(), z.number()).optional(),
        fxRates: z.object({}).passthrough().optional(),
    })
    .passthrough();

type AppStateShapeInput = z.infer<typeof AppStateShape>;

/**
 * Valide la forme d'un état chargé. Lève une Error au message clair (préfixe
 * « AppState invalide ») si la forme ne tient pas — utilisable directement dans
 * un handler de tool pour renvoyer une erreur exploitable à Claude.
 */
export function validateAppStateShape(raw: unknown): AppStateShapeInput {
    const parsed = AppStateShape.safeParse(raw);
    if (!parsed.success) {
        const first = parsed.error.issues[0];
        const path = first?.path?.join('.') || '(racine)';
        throw new Error(
            `AppState invalide : champ « ${path} » — ${first?.message ?? 'forme inattendue'}. ` +
            `Vérifie que le fichier JSON est bien un export FinanceAI (clés transactions/assets/config/…).`,
        );
    }
    return parsed.data;
}
