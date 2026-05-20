// P1.7 — Audit log local pour tracer les changements de state.
//
// Captures les modifications appliquées via `setAppState`/`setState`
// dans un rolling buffer localStorage. Permet à l'utilisateur (et au
// développeur) de répondre à la question "qui a changé quoi quand".
//
// Stocké localement seulement (pas envoyé sur le réseau).
// Pattern de finance apps sérieux.

const STORAGE_KEY = 'financeai:auditLog:v1';
const MAX_ENTRIES = 500;

export interface AuditEntry {
    id: string;
    timestamp: number;
    /** Champ modifié dans le store (ex: 'transactions', 'budgetItems') */
    field: string;
    /** Type de change : 'add' | 'remove' | 'update' | 'replace' */
    operation: 'add' | 'remove' | 'update' | 'replace';
    /** Brève description human-readable */
    description: string;
    /** Compteur d'éléments (ex: nombre de transactions) avant/après si applicable */
    countBefore?: number;
    countAfter?: number;
}

interface AuditLogState {
    entries: AuditEntry[];
}

function readState(): AuditLogState {
    try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
        if (!raw) return { entries: [] };
        const parsed = JSON.parse(raw) as AuditLogState;
        if (!Array.isArray(parsed.entries)) return { entries: [] };
        return parsed;
    } catch {
        return { entries: [] };
    }
}

function writeState(state: AuditLogState): void {
    try {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // localStorage plein — silent fail
    }
}

function makeId(): string {
    return `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Enregistre une entrée d'audit.
 *
 * @example
 *   logAudit({
 *     field: 'transactions', operation: 'add',
 *     description: 'Import CSV 47 transactions',
 *     countBefore: 100, countAfter: 147,
 *   });
 */
export function logAudit(input: Omit<AuditEntry, 'id' | 'timestamp'>): void {
    const entry: AuditEntry = {
        id: makeId(),
        timestamp: Date.now(),
        ...input,
    };
    const state = readState();
    const entries = [entry, ...state.entries].slice(0, MAX_ENTRIES);
    writeState({ entries });
}

/** Liste les entrées (du plus récent au plus ancien). */
export function getAuditLog(): AuditEntry[] {
    return readState().entries;
}

/** Filtre par field/operation/since. */
export function filterAuditLog(opts: { field?: string; operation?: AuditEntry['operation']; sinceMs?: number }): AuditEntry[] {
    const entries = readState().entries;
    return entries.filter(e => {
        if (opts.field && e.field !== opts.field) return false;
        if (opts.operation && e.operation !== opts.operation) return false;
        if (opts.sinceMs && Date.now() - e.timestamp > opts.sinceMs) return false;
        return true;
    });
}

export function clearAuditLog(): void {
    writeState({ entries: [] });
}

export function getAuditStats(): { total: number; byField: Record<string, number>; byOperation: Record<string, number>; last24h: number } {
    const entries = readState().entries;
    const stats = {
        total: entries.length,
        byField: {} as Record<string, number>,
        byOperation: {} as Record<string, number>,
        last24h: 0,
    };
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    for (const e of entries) {
        stats.byField[e.field] = (stats.byField[e.field] ?? 0) + 1;
        stats.byOperation[e.operation] = (stats.byOperation[e.operation] ?? 0) + 1;
        if (e.timestamp >= dayAgo) stats.last24h += 1;
    }
    return stats;
}

export function exportAuditLogAsJSON(): string {
    const entries = readState().entries;
    const payload = {
        exportedAt: new Date().toISOString(),
        count: entries.length,
        stats: getAuditStats(),
        entries,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    return URL.createObjectURL(blob);
}

/**
 * Helper pour wrapper `setAppState` du store avec audit automatique.
 *
 * @example
 *   const setAppStateAudited = wrapWithAudit(setAppState, getCurrentState);
 *   setAppStateAudited({ transactions: [...] });
 *   // → audit logé automatiquement
 *
 * Note : pour cette première version, on ne wire PAS automatiquement le
 * store (risque de breakage). L'audit est appelé manuellement dans les
 * paths les plus importants (import CSV, suppression, etc.) via `logAudit`.
 * L'intégration globale via Zustand middleware viendra dans un cycle suivant.
 */
