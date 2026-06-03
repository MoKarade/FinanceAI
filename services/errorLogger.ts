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

export type ErrorSource = 'ai' | 'projection' | 'ui' | 'network' | 'storage' | 'unknown';

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

// S2 (sécurité/PII) — Le `message` et la `stack` des erreurs sont persistés en
// localStorage et EXPORTABLES via SystemView, mais n'étaient jamais filtrés
// (seul le `context` l'était via sanitizeContext). Un message d'erreur peut
// pourtant contenir un montant (« retrait de 12 500,00$ refusé ») ou un secret
// (clé API loggée par erreur). On applique donc un scrub LÉGER sur le texte
// libre avant persistance. Volontairement conservateur : on ne masque que ce
// qui ressemble à de l'argent (avec marqueur $ ou séparateurs décimaux/milliers)
// ou à un secret, jamais un entier nu (ex. « Error 149 », codes HTTP, line
// numbers de stack), pour garder les messages diagnostiquables.
const SECRET_PATTERNS: Array<{ re: RegExp; tag: string }> = [
    // Clés API Anthropic (sk-ant-...) et OpenAI-like (sk-...) — préfixe + corps base64/hex.
    { re: /sk-ant-[A-Za-z0-9_-]{6,}/g, tag: '[secret]' },
    { re: /sk-[A-Za-z0-9]{16,}/g, tag: '[secret]' },
    // Bearer tokens.
    { re: /\bBearer\s+[A-Za-z0-9._-]{12,}/gi, tag: 'Bearer [secret]' },
    // Jetons longs « bruts » (≥ 24 chars, mélange lettres+chiffres) — JWT, clés, hash.
    // Ancré sur des frontières de « mot » pour ne pas couper un identifiant court.
    { re: /\b(?=[A-Za-z0-9._-]*[A-Za-z])(?=[A-Za-z0-9._-]*\d)[A-Za-z0-9._-]{24,}\b/g, tag: '[secret]' },
];

// Argent : nombre AVEC marqueur monétaire ($ devant/derrière, code devise) OU
// avec séparateurs de milliers/décimales (1 234,56 / 1,234.56 / 12500.00). On
// exige un signal « monétaire » pour ne PAS masquer un entier nu (Error 149,
// HTTP 404, line 42…). NB : pas de \b après « $ » (non-word char) — ça ne
// matcherait jamais devant une espace.
const MONEY_PATTERNS: RegExp[] = [
    // $ devant : $1 234,56 / $ 12500 / $5000
    /\$\s?\d[\d\s.,]*\d|\$\s?\d/g,
    // montant SUIVI de $ (collé ou espacé) : 12 500,00$ / 5000 $ / 99.99$
    /\d[\d\s.,]*\d\s?\$|\d\s?\$/g,
    // montant suivi d'un code devise : 1 234,56 CAD / 5000 USD
    /\d[\d\s.,]*\d\s?(?:CAD|USD|EUR)\b|\d\s?(?:CAD|USD|EUR)\b/gi,
    // nombre avec séparateur de milliers OU décimale type argent (au moins un groupe
    // de 3 chiffres précédé d'un séparateur, ou 2 décimales) : 1,234 / 12 500,00 / 99.99
    /\b\d{1,3}(?:[ .,]\d{3})+(?:[.,]\d{1,2})?\b|\b\d+[.,]\d{2}\b/g,
];

/**
 * Scrub léger d'un texte libre (message/stack) avant persistance : masque les
 * secrets puis les montants. Conservateur — laisse les entiers nus et le reste
 * du message intacts pour le diagnostic.
 */
function scrubFreeText(input: string | undefined): string | undefined {
    if (typeof input !== 'string' || input === '') return input;
    let out = input;
    for (const { re, tag } of SECRET_PATTERNS) out = out.replace(re, tag);
    for (const re of MONEY_PATTERNS) out = out.replace(re, '[montant]');
    return out;
}

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
        // S2 : message/stack scrubés (montants + secrets masqués) AVANT persistance,
        // car ils sont exportables via SystemView au même titre que le context.
        message: scrubFreeText(message) ?? message,
        stack: scrubFreeText(stack),
        // SH5 : context sanitisé pour ne JAMAIS persister/exporter de PII.
        context: input.context ? sanitizeContext(input.context) as Record<string, unknown> : undefined,
        // S-C+ : UA tronqué (le log est exportable via SystemView → on limite le fingerprint).
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : undefined,
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
            // Logger central : écriture console.info volontaire (routing par sévérité).
            // eslint-disable-next-line no-console
            : console.info;
        // SH5/S-C/S2 : on loggue le message ET le context SANITISÉS (entry.*), pas
        // l'input brut — sinon la PII (montants, salaires, clés) fuiterait dans la
        // console DevTools alors que l'entrée stockée/exportée est déjà nettoyée.
        fn(`[${input.source}] ${entry.message}`, entry.context ?? '');
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
