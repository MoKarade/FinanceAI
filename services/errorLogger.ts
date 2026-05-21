// P1 — Error logger local self-contained (zéro infrastructure).
//
// Capture les erreurs runtime + erreurs manuelles dans un rolling buffer
// localStorage. Pas de backend, pas de tier payant. L'utilisateur peut
// consulter les erreurs dans SystemView et les exporter pour debug.
//
// Sources captureées :
//   - window.onerror (script crashes)
//   - window.unhandledrejection (promise rejections non gérées)
//   - logError() appels manuels depuis services/composants
//
// Format JSON local — exportable, partageable, jamais envoyé sur le réseau.

const STORAGE_KEY = 'financeai:errorLog:v1';
const MAX_ENTRIES = 100;

export type ErrorSource = 'ai' | 'era' | 'projection' | 'ui' | 'network' | 'storage' | 'unknown';

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface LoggedError {
    id: string;
    timestamp: number;
    severity: ErrorSeverity;
    source: ErrorSource;
    message: string;
    stack?: string;
    context?: Record<string, unknown>;
    userAgent?: string;
    url?: string;
}

interface ErrorLogState {
    entries: LoggedError[];
}

function readState(): ErrorLogState {
    try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
        if (!raw) return { entries: [] };
        const parsed = JSON.parse(raw) as ErrorLogState;
        if (!Array.isArray(parsed.entries)) return { entries: [] };
        return parsed;
    } catch {
        return { entries: [] };
    }
}

function writeState(state: ErrorLogState): void {
    try {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // localStorage plein ou indisponible — fail silencieusement (priorité : ne jamais crasher
        // l'app à cause du logger)
    }
}

function makeId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Log une erreur. Appelable depuis n'importe quel service ou composant.
 *
 * @example
 *   logError({ source: 'ai', message: 'Claude timeout', severity: 'warning', context: { tab: 'budget' } });
 */
// Sprint 3 SH5 (sécurité) — Champs financiers/PII à masquer du context.
// Le logger est exporté/partagé via SystemView donc tout PII fuiterait.
// Match récursif sur les clés (case-insensitive).
const SENSITIVE_KEY_PATTERNS = /^(amount|balance|payee|fact|salary|netSalary|grossSalary|income|expense|cost|price|debt|net.*worth|api.*key|token|password|passphrase|email|phone|sin|nas|account.*number)$/i;
const MAX_DEPTH = 4;

function sanitizeContext(value: unknown, depth = 0): unknown {
    if (value === null || value === undefined) return value;
    if (depth >= MAX_DEPTH) return '[truncated]';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.slice(0, 10).map(v => sanitizeContext(v, depth + 1));
    if (typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            if (SENSITIVE_KEY_PATTERNS.test(k)) {
                out[k] = '[redacted]';
            } else {
                out[k] = sanitizeContext(v, depth + 1);
            }
        }
        return out;
    }
    return String(value);
}

export function logError(input: {
    source: ErrorSource;
    message: string;
    severity?: ErrorSeverity;
    stack?: string;
    context?: Record<string, unknown>;
    error?: unknown;
}): void {
    const severity = input.severity ?? 'error';

    // Si une instance Error est passée, extrait message/stack automatiquement
    let message = input.message;
    let stack = input.stack;
    if (input.error instanceof Error) {
        message = message || input.error.message;
        stack = stack || input.error.stack;
    }

    const entry: LoggedError = {
        id: makeId(),
        timestamp: Date.now(),
        severity,
        source: input.source,
        message,
        stack,
        // SH5 : context sanitisé pour ne JAMAIS persister/exporter de PII.
        context: input.context ? sanitizeContext(input.context) as Record<string, unknown> : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        url: typeof window !== 'undefined' ? window.location.pathname : undefined,
    };

    const state = readState();
    // Rolling buffer : on garde les MAX_ENTRIES plus récentes
    const entries = [entry, ...state.entries].slice(0, MAX_ENTRIES);
    writeState({ entries });

    // Aussi en console pour DX (peut être stripé en prod via vite define)
    if (typeof console !== 'undefined') {
        const fn = severity === 'critical' || severity === 'error' ? console.error
            : severity === 'warning' ? console.warn
            : console.info;
        fn(`[${input.source}] ${message}`, input.context ?? '');
    }
}

/** Retourne toutes les erreurs (du plus récent au plus ancien) */
export function getErrors(): LoggedError[] {
    return readState().entries;
}

/** Filtre par source / severity */
export function filterErrors(opts: { source?: ErrorSource; severity?: ErrorSeverity; sinceMs?: number }): LoggedError[] {
    const entries = readState().entries;
    return entries.filter(e => {
        if (opts.source && e.source !== opts.source) return false;
        if (opts.severity && e.severity !== opts.severity) return false;
        if (opts.sinceMs && Date.now() - e.timestamp > opts.sinceMs) return false;
        return true;
    });
}

/** Vide le journal */
export function clearErrors(): void {
    writeState({ entries: [] });
}

/** Statistiques par source/severity pour dashboard rapide */
export function getErrorStats(): { total: number; bySource: Record<string, number>; bySeverity: Record<string, number>; last24h: number } {
    const entries = readState().entries;
    const stats = {
        total: entries.length,
        bySource: {} as Record<string, number>,
        bySeverity: {} as Record<string, number>,
        last24h: 0,
    };
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    for (const e of entries) {
        stats.bySource[e.source] = (stats.bySource[e.source] ?? 0) + 1;
        stats.bySeverity[e.severity] = (stats.bySeverity[e.severity] ?? 0) + 1;
        if (e.timestamp >= dayAgo) stats.last24h += 1;
    }
    return stats;
}

/**
 * Export JSON téléchargeable des erreurs (pour partage/support).
 * @returns Blob URL — caller doit appeler URL.revokeObjectURL après usage.
 */
export function exportErrorsAsJSON(): string {
    const entries = readState().entries;
    const payload = {
        exportedAt: new Date().toISOString(),
        count: entries.length,
        stats: getErrorStats(),
        entries,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    return URL.createObjectURL(blob);
}

/**
 * Installe les hooks globaux : window.onerror et unhandledrejection.
 * À appeler UNE FOIS au boot de l'app (depuis App.tsx).
 */
export function installGlobalErrorHandlers(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('error', (event: ErrorEvent) => {
        logError({
            source: 'ui',
            severity: 'error',
            message: event.message || 'Unknown script error',
            stack: event.error?.stack,
            context: {
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
            },
        });
    });

    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
        const reason = event.reason;
        logError({
            source: 'unknown',
            severity: 'error',
            message: reason instanceof Error ? reason.message : String(reason),
            stack: reason instanceof Error ? reason.stack : undefined,
            context: { unhandledRejection: true },
        });
    });
}
