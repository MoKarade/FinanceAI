// mcp/state/stateErrors.ts
//
// [HUB-REFRESH-CRON] Erreur TYPÉE pour le conflit de concurrence OCC. Module feuille (aucun import
// interne) pour être partagé sans cycle par la source d'écriture (qui la lève) et les appelants qui
// doivent DISTINGUER un conflit transitoire d'une vraie panne (ex. `POST /refresh` renvoie alors
// 200 { ok:false, conflict:true } — à réessayer — plutôt qu'un 5xx qui ferait rougir le cron).
//
// Un conflit n'écrase RIEN : l'app (ou un autre appel) a poussé entre la lecture et le save ; le
// prochain tick relira l'état frais. Toute AUTRE erreur (source non inscriptible, jeton Drive
// révoqué, coffre chiffré, Drive injoignable) reste une panne réelle à SIGNALER, pas à avaler.

export class StateConflictError extends Error {
    readonly conflict = true as const;

    constructor(message: string) {
        super(message);
        this.name = 'StateConflictError';
        // Chaîne de prototype correcte après transpilation vers ES5/ES2015 (extends Error).
        Object.setPrototypeOf(this, StateConflictError.prototype);
    }
}

/** Garde de type — sûre à travers les frontières de module/bundle (ne dépend pas de `instanceof`). */
export function isStateConflictError(err: unknown): err is StateConflictError {
    return err instanceof StateConflictError
        || (typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'StateConflictError');
}
