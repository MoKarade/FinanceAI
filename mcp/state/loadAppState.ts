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
import { normalizeAppState } from './appStateDefaults';
import { validateAppStateShape } from './appStateSchema';
import { saveAppStateToFile, type SaveResult } from './writeAppState';

// Ré-export pour les consommateurs (tools / tests) qui veulent valider une forme
// sans connaître le module de schéma.
export { validateAppStateShape } from './appStateSchema';
// [AITOOLS-B] buildDefaultAppState/normalizeAppState EXTRAITS vers appStateDefaults.ts
// (browser-safe — ce fichier-ci importe node:fs). Ré-export de compat : les consommateurs
// existants (tools/tests) continuent d'importer depuis loadAppState sans changement.
export { buildDefaultAppState, normalizeAppState } from './appStateDefaults';

/** Variable d'environnement portant le chemin du fichier d'état (mode stdio). */
export const STATE_FILE_ENV = 'FINANCEAI_STATE_FILE';

/**
 * Source d'état : abstraction minimale. Une implémentation rend la chaîne JSON
 * brute de l'enveloppe/état. Drive (Lot 3) implémentera cette interface (lecture
 * de financeai-sync.json + déchiffrement éventuel) sans toucher aux tools.
 */
/**
 * [MCP-WRITE-VERSION-TOKEN] Jeton de version de concurrence : `updatedAt` (epoch ms) du blob au moment
 * de la lecture. `null` = pas de blob / source sans versioning (fichier local mono-processus). Sert à
 * l'OCC (optimistic concurrency) : un `saveState(state, expectedVersion)` n'écrit QUE si le blob n'a pas
 * bougé depuis la lecture qui a produit `expectedVersion` (sinon deux tool-calls MCP concurrents partis du
 * même cache s'écraseraient — le dernier gagnant silencieux, la limite process-wide de `lastSeenUpdatedAt`).
 */
export type StateVersion = number | null;

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
    /**
     * Persiste l'état. `expectedVersion` (optionnel, additif) = jeton lu par CET appelant : si fourni,
     * l'écriture est REFUSÉE (conflit) quand la version stockée a changé depuis (OCC per-call). Omis →
     * comportement historique (garde process-wide `lastSeenUpdatedAt`). Rétrocompat : les appelants qui ne
     * passent pas de jeton gardent la sémantique d'avant.
     */
    saveState(state: AppState, expectedVersion?: StateVersion): Promise<SaveResult>;
    /**
     * Lecture ATOMIQUE raw + version pour l'OCC des writers. Optionnel : si absent, le store retombe sur
     * `loadRaw()` avec `version: null` (pas d'OCC — cas fichier local). Atomique = raw et version viennent
     * de la MÊME lecture (pas de capture séparée racée sous lectures concurrentes).
     */
    loadRawVersioned?(): Promise<{ raw: string; version: StateVersion }>;
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
    async saveState(state: AppState, _expectedVersion?: StateVersion): Promise<SaveResult> {
        // Fichier local = mode stdio mono-processus : pas de concurrence multi-appareils → l'OCC
        // (`expectedVersion`) ne s'applique pas ; l'écriture atomique + sauvegarde suffisent.
        return saveAppStateToFile(this.filePath, state);
    }
}

/**
 * Charge, valide (zod) et normalise l'AppState depuis une `StateSource`.
 * - JSON illisible → Error claire (« JSON invalide … »).
 * - Forme inattendue → Error claire (préfixe « AppState invalide … »).
 */
export async function loadAppStateFromSource(source: StateSource): Promise<AppState> {
    return parseRawToAppState(await source.loadRaw(), source.description);
}

/**
 * Transforme le JSON brut d'une source en AppState validé+normalisé. Extrait de `loadAppStateFromSource`
 * pour être réutilisé par le chemin VERSIONNÉ (getWithVersion), qui a déjà le raw en main via
 * `loadRawVersioned` — évite une 2ᵉ lecture réseau et garde une seule source de vérité pour la transformation.
 */
export function parseRawToAppState(raw: string, sourceDescription: string): AppState {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`JSON invalide depuis ${sourceDescription} : ${reason}.`);
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
