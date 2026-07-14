// mcp/state/freshness.ts
//
// [MCP-STALE-FRESHNESS] — fraîcheur de l'état servi par le connecteur. Le connecteur lit la copie
// Drive : si l'app n'a pas poussé récemment (appareil déconnecté, onglet fermé avant le debounce),
// cette copie peut être PÉRIMÉE — et Claude répondait avec ces chiffres sans le savoir (incident
// 2026-07-14 : le MCP servait 5 732 $ pendant que l'app locale affichait 160 k$+).
//
// La source d'état (DriveStateSource) publie ici l'`updatedAt` du blob qu'elle vient de lire/écrire ;
// `withState` (_dataAware) appose une note de fraîcheur à CHAQUE réponse de tool data-aware → Claude
// voit l'âge des données et peut avertir l'utilisateur au lieu d'affirmer des chiffres périmés.
//
// Registre module-level volontairement simple : le serveur MCP est mono-UTILISATEUR (une source
// d'état par processus). ⚠️ mono-utilisateur ≠ mono-SESSION : deux sessions concurrentes du même
// utilisateur partagent ce registre — une lecture/écriture de l'autre session entre `fn(state)` et
// `freshnessNotice()` peut horodater une réponse avec la fraîcheur du DERNIER accès, pas de l'état
// exact utilisé (fenêtre de quelques ms, même blob utilisateur → écart d'affichage négligeable,
// jamais de chiffre $ faux). Un vrai per-call viendrait avec `[MCP-WRITE-VERSION-TOKEN]`.

export interface StateFreshness {
    /** Epoch ms de la dernière écriture du blob source (updatedAt de l'enveloppe Drive). */
    updatedAt: number | null;
    /** Étiquette de la source (diagnostic) — ex. « Google Drive ». */
    source: string | null;
}

let _current: StateFreshness = { updatedAt: null, source: null };

/** Publie la fraîcheur du blob que la source vient de lire/écrire. */
export function setStateFreshness(f: StateFreshness): void {
    _current = f;
}

/** Fraîcheur courante (updatedAt null = source sans horodatage, ex. fixture/fichier local). */
export function getStateFreshness(): StateFreshness {
    return _current;
}

/** Seuil au-delà duquel la note devient un AVERTISSEMENT explicite (données possiblement périmées). */
export const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 h

/** Âge lisible (« 3 min », « 5 h », « 2 j »). */
function humanAge(ageMs: number): string {
    const min = Math.round(ageMs / 60_000);
    if (min < 60) return `${Math.max(0, min)} min`;
    const h = Math.round(min / 60);
    if (h < 48) return `${h} h`;
    return `${Math.round(h / 24)} j`;
}

/**
 * Note de fraîcheur à apposer aux réponses des tools (null si la source n'a pas d'horodatage).
 * Toujours la date exacte ; au-delà du seuil, avertissement actionnable (ouvrir l'app pour pousser).
 */
export function freshnessNotice(now: number = Date.now()): string | null {
    if (_current.updatedAt == null) return null;
    const age = Math.max(0, now - _current.updatedAt);
    const when = new Date(_current.updatedAt).toISOString();
    const base = `Données synchronisées le ${when} (il y a ${humanAge(age)}${_current.source ? `, source : ${_current.source}` : ''}).`;
    if (age <= STALE_THRESHOLD_MS) return base;
    return (
        `⚠️ ${base} Elles peuvent être PÉRIMÉES : si l'utilisateur a modifié ses finances depuis, ` +
        "demande-lui d'ouvrir l'app FinanceAI (connectée à Drive) pour pousser l'état récent, puis relance le tool."
    );
}
