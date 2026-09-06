// services/personaSanitizer.ts
//
// [PERSONA-PURGE] — purge chirurgicale des artefacts de PERSONA DE TEST d'un état RÉEL.
// Incident 2026-07-15 : les vraies données de Marc contenaient ~600 transactions du persona
// « Karim » (persona-tx-*) + son objectif financier (kar-fg1) — mélangés aux vraies
// transactions. Cause exacte de la fuite inconnue (antérieure aux gardes actuelles) ;
// défense en profondeur : quel que soit le chemin (boot, snapshot de sortie de mode test,
// push Drive, pull Drive, restauration de backup), un état RÉEL ne doit JAMAIS contenir
// un id de persona. La reconnaissance est par ID DÉTERMINISTE (registre artifactIds.ts,
// parité verrouillée par test-scan) → zéro risque pour les vraies données (conventions
// d'ids réelles disjointes, cf. registre).
//
// PURE : ne mute jamais l'entrée ; rend la MÊME référence si rien à retirer (aucun
// re-render/re-hash parasite).

import type { AppState } from '../types';
import { isPersonaArtifactId } from './testPersonas/artifactIds';

/** Tranches TABLEAU de AppState où un persona plante des fixtures à id. */
const ARRAY_SLICES = [
    'transactions',
    'assets',
    'investmentTransactions',
    'investmentAccounts',
    'budgetItems',
    'debts',
    'travelGoals',
    'lifeEvents',
    'financialGoals',
    'realEstateGoals',
    'childGoals',
    'insurancePolicies',
    'rentalProperties',
    'privateBusinesses',
    'vehicleReplacements',
    'majorRenovations',
    'charitableGoals',
    'documents',
    'categorizationRules',
] as const;

interface PersonaPurgeReport {
    /** Nombre total d'items retirés (0 = état déjà propre). */
    removedTotal: number;
    /** Détail par tranche (uniquement les tranches touchées). */
    bySlice: Record<string, number>;
}

interface SanitizeResult<T> {
    state: T;
    report: PersonaPurgeReport;
}

/**
 * Retire d'un état (partiel) toute entrée dont l'id est un artefact de persona de test.
 * À n'appeler que sur un état RÉEL (jamais en mode test — c'est à l'appelant de gater).
 */
export function sanitizePersonaArtifacts<T extends Partial<AppState>>(input: T): SanitizeResult<T> {
    const bySlice: Record<string, number> = {};
    let removedTotal = 0;
    let out: T = input;
    const ensureCopy = (): void => {
        if (out === input) out = { ...input };
    };

    for (const slice of ARRAY_SLICES) {
        const arr = (input as Record<string, unknown>)[slice];
        if (!Array.isArray(arr) || arr.length === 0) continue;
        const kept = arr.filter(item => !isPersonaArtifactId((item as { id?: unknown } | null)?.id));
        const removed = arr.length - kept.length;
        if (removed > 0) {
            ensureCopy();
            (out as Record<string, unknown>)[slice] = kept;
            bySlice[slice] = removed;
            removedTotal += removed;
        }
    }

    // Objets SINGULIERS à id (`childGoal` legacy, `weddingGoal` optionnel) : un id de fixture
    // peut s'y loger. On ne peut pas « filtrer » un singulier → on le RETIRE du patch (le défaut
    // du store/l'absence reprendront), plutôt que d'inventer une valeur. ⚠️ Les consommateurs qui
    // font un spread `{...prev, ...cleaned}` doivent traiter ces clés EXPLICITEMENT (une clé
    // supprimée n'écrase rien — cf. fix disableTestMode, finding panel 2026-07-15).
    for (const single of ['childGoal', 'weddingGoal'] as const) {
        const value = (input as unknown as Record<string, { id?: unknown } | null | undefined>)[single];
        if (value && isPersonaArtifactId(value.id)) {
            ensureCopy();
            delete (out as Record<string, unknown>)[single];
            bySlice[single] = 1;
            removedTotal += 1;
        }
    }

    // [PERSONA-SANITIZE-CHAT] Chat IA (defense-in-depth, finding panel B2 — LATENT : aucun persona
    // n'écrit de chat AUJOURD'HUI, mais un futur persona de démo qui pré-remplirait une conversation
    // passerait sinon entre les mailles). Deux tranches : `aiConversation` (messages de la
    // conversation ACTIVE, filtrés par id) et `aiConversations` (archives : une archive dont l'ID
    // OU un message est un artefact de persona est retirée EN ENTIER — une conversation de démo ne
    // se « répare » pas message par message).
    {
        const active = (input as Record<string, unknown>).aiConversation;
        if (Array.isArray(active) && active.length > 0) {
            const kept = active.filter(m => !isPersonaArtifactId((m as { id?: unknown } | null)?.id));
            const removed = active.length - kept.length;
            if (removed > 0) {
                ensureCopy();
                (out as Record<string, unknown>).aiConversation = kept;
                bySlice.aiConversation = removed;
                removedTotal += removed;
            }
        }
        const archives = (input as Record<string, unknown>).aiConversations;
        if (Array.isArray(archives) && archives.length > 0) {
            const kept = archives.filter((c) => {
                const conv = c as { id?: unknown; messages?: Array<{ id?: unknown }> } | null;
                if (!conv) return true;
                if (isPersonaArtifactId(conv.id)) return false;
                return !(conv.messages ?? []).some(m => isPersonaArtifactId(m?.id));
            });
            const removed = archives.length - kept.length;
            if (removed > 0) {
                ensureCopy();
                (out as Record<string, unknown>).aiConversations = kept;
                bySlice.aiConversations = removed;
                removedTotal += removed;
            }
        }
    }

    return { state: out, report: { removedTotal, bySlice } };
}

/**
 * Variante pour une ENVELOPPE persist Zustand (`{ state, version }` — payload sync Drive,
 * backup, localStorage). Skip TOTAL si l'état est en MODE TEST (les fixtures y sont
 * légitimes ; le push Drive est de toute façon coupé en test par `shouldPush`).
 * Rend la même référence si rien à changer.
 */
export function sanitizePersistEnvelope(envelope: unknown): { envelope: unknown; report: PersonaPurgeReport } {
    const empty: PersonaPurgeReport = { removedTotal: 0, bySlice: {} };
    if (!envelope || typeof envelope !== 'object') return { envelope, report: empty };
    const env = envelope as { state?: unknown };
    if (!env.state || typeof env.state !== 'object') return { envelope, report: empty };
    const state = env.state as Partial<AppState> & { isTestMode?: boolean };
    if (state.isTestMode === true) return { envelope, report: empty };
    const { state: cleaned, report } = sanitizePersonaArtifacts(state);
    if (report.removedTotal === 0) return { envelope, report };
    return { envelope: { ...(envelope as Record<string, unknown>), state: cleaned }, report };
}
