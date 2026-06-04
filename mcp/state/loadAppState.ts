// mcp/state/loadAppState.ts
//
// Lot 1 — chargement de l'AppState réel de l'utilisateur pour le serveur MCP.
//
// CONTEXTE (cf docs/MCP_CONNECTOR_DESIGN.md) : FinanceAI est local-first, sans
// backend. L'état vit dans le navigateur + le Google Drive de l'utilisateur. Un
// serveur MCP est un process séparé : il doit charger l'état depuis une SOURCE.
//
// Ce module définit une ABSTRACTION `StateSource` (charge une chaîne JSON brute)
// et un loader qui valide + normalise. En mode stdio (Lot 1), la source est un
// FICHIER JSON local (chemin via $FINANCEAI_STATE_FILE ou argument). La structure
// est pensée pour qu'un loader « fetch Drive » (Lot 3) se branche SANS réécrire
// les tools : il suffira d'implémenter une nouvelle `StateSource`.

import { promises as fs } from 'node:fs';
import type { AppState } from '../../types';
import {
    INITIAL_BUDGET,
    INITIAL_CONFIG,
    INITIAL_PROJECTION,
    INITIAL_REAL_ESTATE_GOAL,
    INITIAL_CHILD_GOAL,
    DEFAULT_FX_RATES,
} from '../../constants';
import { validateAppStateShape } from './appStateSchema';
import { saveAppStateToFile, type SaveResult } from './writeAppState';

// Ré-export pour les consommateurs (tools / tests) qui veulent valider une forme
// sans connaître le module de schéma.
export { validateAppStateShape } from './appStateSchema';

/** Variable d'environnement portant le chemin du fichier d'état (mode stdio). */
export const STATE_FILE_ENV = 'FINANCEAI_STATE_FILE';

/**
 * Source d'état : abstraction minimale. Une implémentation rend la chaîne JSON
 * brute de l'enveloppe/état. Drive (Lot 3) implémentera cette interface (lecture
 * de financeai-sync.json + déchiffrement éventuel) sans toucher aux tools.
 */
export interface StateSource {
    /** Identifiant lisible de la source (pour messages d'erreur / logs stderr). */
    readonly description: string;
    /** Charge et renvoie le JSON brut de l'état. Lève une Error claire si indispo. */
    loadRaw(): Promise<string>;
}

/**
 * Source INSCRIPTIBLE (Lot 2) : sait aussi persister un AppState. Le fichier local
 * l'implémente (écriture sûre + sauvegarde). Drive (couche fluide) l'implémentera
 * en réécrivant le blob chiffré, sans toucher aux tools d'écriture.
 */
export interface WritableStateSource extends StateSource {
    saveState(state: AppState): Promise<SaveResult>;
}

/** Garde de type : la source sait-elle écrire ? */
export function isWritableSource(source: StateSource | null): source is WritableStateSource {
    return !!source && typeof (source as Partial<WritableStateSource>).saveState === 'function';
}

/** Source fichier local (mode stdio). Lecture + écriture sûre (sauvegarde + atomique). */
export class FileStateSource implements WritableStateSource {
    constructor(private readonly filePath: string) {}
    get description(): string {
        return `fichier local ${this.filePath}`;
    }
    async loadRaw(): Promise<string> {
        try {
            return await fs.readFile(this.filePath, 'utf8');
        } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            throw new Error(
                `Impossible de lire l'état FinanceAI depuis ${this.filePath} : ${reason}. ` +
                `Renseigne le chemin via $${STATE_FILE_ENV} ou un argument, et exporte ton état depuis l'app.`,
            );
        }
    }
    async saveState(state: AppState): Promise<SaveResult> {
        return saveAppStateToFile(this.filePath, state);
    }
}

/**
 * Construit un AppState COMPLET par défaut (sans dépendance React/localStorage).
 * Mirroir du `defaultState` du store, utilisé comme base de normalisation pour
 * fusionner un état partiel (export app, persona, blob Drive) → AppState valide.
 */
export function buildDefaultAppState(): AppState {
    return {
        transactions: [],
        assets: [],
        investmentTransactions: [],
        investmentAccounts: [],
        budgetItems: INITIAL_BUDGET,
        config: INITIAL_CONFIG,
        projection: INITIAL_PROJECTION,
        realEstateGoals: [INITIAL_REAL_ESTATE_GOAL],
        childGoal: INITIAL_CHILD_GOAL,
        childGoals: [INITIAL_CHILD_GOAL],
        savingsGoals: [],
        debts: [],
        travelGoals: [],
        lifeEvents: [],
        retirementGoal: { targetAge: 65, targetMonthlyIncome: 4000, governmentPension: 1200 },
        financialGoals: [],
        initialBalances: {},
        apiKeys: { anthropic: '', finnhub: '' },
        fxRates: DEFAULT_FX_RATES,
        lastUpdate: Date.now(),
        categorizationRules: [],
        aiConversation: [],
        insurancePolicies: [],
        rentalProperties: [],
        privateBusinesses: [],
        vehicleReplacements: [],
        majorRenovations: [],
        charitableGoals: [],
        documents: [],
    };
}

/**
 * Normalise un état (potentiellement partiel) en AppState complet : on part des
 * défauts et on écrase avec les champs présents. Garantit que les collections et
 * `config`/`projection`/`fxRates` existent toujours pour le moteur pur.
 */
export function normalizeAppState(partial: Partial<AppState>): AppState {
    const base = buildDefaultAppState();
    return {
        ...base,
        ...partial,
        // Sous-objets : fusion peu profonde pour ne pas perdre les défauts si la
        // source ne fournit qu'une partie (ex. fxRates sans CAD).
        config: { ...base.config, ...(partial.config ?? {}) },
        fxRates: { ...base.fxRates, ...(partial.fxRates ?? {}) },
    };
}

/**
 * Charge, valide (zod) et normalise l'AppState depuis une `StateSource`.
 * - JSON illisible → Error claire (« JSON invalide … »).
 * - Forme inattendue → Error claire (préfixe « AppState invalide … »).
 */
export async function loadAppStateFromSource(source: StateSource): Promise<AppState> {
    const raw = await source.loadRaw();
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`JSON invalide depuis ${source.description} : ${reason}.`);
    }
    // Tolère une enveloppe { payload: AppState } (format blob Drive) OU l'état nu.
    const candidate =
        parsed && typeof parsed === 'object' && 'payload' in (parsed as Record<string, unknown>)
            ? (parsed as { payload: unknown }).payload
            : parsed;
    const shaped = validateAppStateShape(candidate);
    return normalizeAppState(shaped as Partial<AppState>);
}

/**
 * Résout la `StateSource` par défaut pour le mode stdio : argument explicite,
 * sinon $FINANCEAI_STATE_FILE. Renvoie null si aucune source n'est configurée
 * (les tools « data-aware » renverront alors une erreur explicite « configure ta
 * source d'état », tandis que les tools sans état restent utilisables).
 */
export function resolveDefaultStateSource(explicitPath?: string): StateSource | null {
    const path = explicitPath || process.env[STATE_FILE_ENV];
    if (!path) return null;
    return new FileStateSource(path);
}
