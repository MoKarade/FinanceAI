// services/marketData/negativeCache.ts
//
// [QUOTE-NEGATIVE-CACHE] Cache NÉGATIF TTL par symbole : après N échecs CONSÉCUTIFS d'un provider
// (quote/profil null), on saute les prochains essais pendant un TTL borné — un titre MANUEL/GIC
// (jamais coté nulle part) payait sinon un aller-retour Yahoo + 2,5 s de pacing à CHAQUE refresh,
// et un profil non couvert par Finnhub était retenté à CHAQUE boot, à vie.
//
// Règles (leçons B2-CHAT-HISTORY « mémo négatif à TTL, jamais permanent » + HIST-COVERAGE (4)
// « une panne transitoire ne condamne pas un bon symbole ») :
//  - seuil de 3 échecs CONSÉCUTIFS (une panne isolée ne déclenche rien) ;
//  - la consécutivité a une FENÊTRE (7 j) : deux échecs espacés de plusieurs semaines ne
//    s'additionnent pas (le compteur repart à 1) ;
//  - skip BORNÉ par TTL par genre (quote 24 h, profil 7 j) → self-heal automatique : à
//    l'expiration, UN nouvel essai est permis (succès → entrée effacée ; échec → skip réarmé) ;
//  - un succès EFFACE l'entrée (retour au comportement normal, zéro écriture si pas d'entrée) ;
//  - purge des entrées mortes (> 30 j sans échec) à chaque sauvegarde (classe « déborner sans purge ») ;
//  - changement de clé provider / resync forcé → wipe complet (la couverture change).
//
// Périmètre VOLONTAIREMENT limité à 'quote' + 'profile' : l'HISTORIQUE est exclu — son contrat
// `[]` (vide confirmé, déjà caché 24 h) vs `null` (erreur) pilote la résolution de variantes de
// hydrateAssetHistories ; un cache négatif qui rendrait `null` à la place masquerait ce contrat,
// et le coût résiduel est déjà borné (~1 essai/symbole/jour via needsHistorySync + cache 24 h).
//
// Stockage : localStorage sous une clé DÉDIÉE device-local (jamais dans `financeai-storage` →
// jamais synchronisée Drive) ; repli mémoire hors navigateur (MCP/Node).

export type NegativeKind = 'quote' | 'profile';

interface NegativeEntry {
    /** Échecs consécutifs (dans la fenêtre CONSEC_WINDOW_MS). */
    fails: number;
    /** Horodatage du dernier échec (ms). */
    lastFailAt: number;
    /** Skip actif jusqu'à cet horodatage (ms) — présent seulement quand fails >= seuil. */
    until?: number;
}

const STORAGE_KEY = 'financeai:marketdata:negcache:v1';
const FAIL_THRESHOLD = 3;
const CONSEC_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const PRUNE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const SKIP_TTL_MS: Record<NegativeKind, number> = {
    quote: 24 * 60 * 60 * 1000,
    profile: 7 * 24 * 60 * 60 * 1000,
};

let _entries: Record<string, NegativeEntry> | null = null;

function storageAvailable(): boolean {
    try {
        return typeof localStorage !== 'undefined';
    } catch {
        return false; // accès localStorage peut LEVER (SecurityError) selon l'environnement
    }
}

function load(): Record<string, NegativeEntry> {
    if (_entries) return _entries;
    _entries = {};
    if (storageAvailable()) {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed: unknown = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    for (const [key, e] of Object.entries(parsed as Record<string, unknown>)) {
                        const entry = e as Partial<NegativeEntry>;
                        // FINITUDE exigée (finding sécurité #499) : JSON.parse accepte `1e999` →
                        // Infinity, typeof 'number' — un `until` infini gèlerait le symbole à VIE
                        // (self-heal TTL cassé). Entrée non finie = corrompue → ignorée.
                        if (Number.isFinite(entry?.fails) && Number.isFinite(entry?.lastFailAt)
                            && (entry.until === undefined || Number.isFinite(entry.until))) {
                            _entries[key] = { fails: entry.fails as number, lastFailAt: entry.lastFailAt as number, until: entry.until };
                        }
                    }
                }
            }
        } catch {
            _entries = {}; // JSON corrompu → repart propre (cache d'optimisation, jamais critique)
        }
    }
    return _entries;
}

function save(now: number): void {
    if (!_entries) return;
    for (const [key, e] of Object.entries(_entries)) {
        if (now - e.lastFailAt > PRUNE_AFTER_MS) delete _entries[key]; // purge des entrées mortes
    }
    if (!storageAvailable()) return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(_entries));
    } catch {
        // Quota/écriture impossible : le cache reste en mémoire pour la session — jamais bloquant.
    }
}

const k = (kind: NegativeKind, symbol: string): string => `${kind}::${symbol.toUpperCase()}`;

/** Ce (genre, symbole) est-il en skip négatif actif ? (aucune écriture) */
export function shouldSkipNegative(kind: NegativeKind, symbol: string, now: number = Date.now()): boolean {
    if (!symbol) return false;
    const e = load()[k(kind, symbol)];
    return Boolean(e && e.fails >= FAIL_THRESHOLD && typeof e.until === 'number' && now < e.until);
}

/** Enregistre un échec (provider null). Au 3ᵉ échec consécutif, arme le skip TTL. */
export function recordNegative(kind: NegativeKind, symbol: string, now: number = Date.now()): void {
    if (!symbol) return;
    const entries = load();
    const key = k(kind, symbol);
    const prev = entries[key];
    // Fenêtre de consécutivité : un échec trop ancien ne compte plus (le compteur repart).
    const fails = prev && now - prev.lastFailAt <= CONSEC_WINDOW_MS ? prev.fails + 1 : 1;
    const entry: NegativeEntry = { fails, lastFailAt: now };
    if (fails >= FAIL_THRESHOLD) entry.until = now + SKIP_TTL_MS[kind];
    entries[key] = entry;
    save(now);
}

/** Efface l'entrée au succès (zéro écriture si aucune entrée — appelé sur chaque hit de cache). */
export function clearNegative(kind: NegativeKind, symbol: string): void {
    if (!symbol) return;
    const entries = load();
    const key = k(kind, symbol);
    if (!(key in entries)) return;
    delete entries[key];
    save(Date.now());
}

/** Wipe complet — changement de clé provider ou resync forcé (la couverture change). */
export function clearNegativeCache(): void {
    _entries = {};
    if (!storageAvailable()) return;
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // no-op — au pire les entrées expirent par TTL
    }
}

/** Test-only : réinitialise l'état mémoire (le localStorage jsdom est isolé par test par ailleurs). */
export function __resetNegativeCacheForTests(): void {
    _entries = null;
}
