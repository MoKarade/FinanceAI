// services/sync/syncSnapshot.ts
// [ARCH-SYNC-SPLIT] Snapshot du store local + helpers PURS de la sync (aucun état module-level mutable,
// aucun I/O réseau). `getLocalPayload` porte la CEINTURE persona côté PUSH (sanitizePersistEnvelope avant
// tout départ vers Drive). Importé par : syncPush, syncPull (hasAnyKey/STORE_KEY), syncLifecycle.

import { hashPayload } from './syncEngine';
import type { ApiKeys, ConflictSideCounts } from './syncTypes';
import { useFinanceStore } from '../../store/useFinanceStore';
import { hasMeaningfulData } from '../../utils/onboarding';
import { sanitizePersistEnvelope } from '../personaSanitizer';

// Doit correspondre au `name` du persist Zustand (store/useFinanceStore.ts) et à backupAuto.
export const STORE_KEY = 'financeai-storage';

/** Lit les clés API courantes depuis le store (vide si indispo). Sync v2 (V2-C). */
function currentApiKeys(): ApiKeys {
    try {
        const k = useFinanceStore.getState().apiKeys;
        return { anthropic: k?.anthropic ?? '', finnhub: k?.finnhub ?? '' };
    } catch {
        return { anthropic: '', finnhub: '' };
    }
}

/** Vrai s'il y a au moins une clé à synchroniser (évite d'écrire un objet de clés vides). */
export function hasAnyKey(k: ApiKeys): boolean {
    return Boolean(k.anthropic || k.finnhub);
}

// ── Helpers purs (testables) ─────────────────────────────────────────────────

/** Retire défensivement les clés API du snapshot (déjà exclues par le partialize, ceinture+bretelles). */
export function stripApiKeys(snapshot: unknown): unknown {
    if (!snapshot || typeof snapshot !== 'object') return snapshot;
    const obj = snapshot as Record<string, unknown>;
    const state = obj.state as Record<string, unknown> | undefined;
    if (state && 'apiKeys' in state) {
        const { apiKeys: _drop, ...rest } = state;
        return { ...obj, state: rest };
    }
    return snapshot;
}

/**
 * « Vide » = état par défaut d'un appareil neuf / navigation privée (rien à sauvegarder, et surtout
 * rien qui doive écraser Drive). NON-vide dès qu'il y a une vraie donnée utilisateur. La logique
 * « a des données » est partagée avec l'onboarding via `hasMeaningfulData` (source unique : avant,
 * deux listes divergentes faisaient afficher l'onboarding sur des données que la sync refusait
 * d'écraser — revue archi 2026-05-29). Le défaut frais (profil vide + tableaux vides) → « vide ».
 */
export function computeIsEmpty(snapshot: unknown): boolean {
    if (!snapshot || typeof snapshot !== 'object') return true;
    const state = (snapshot as { state?: unknown }).state;
    return !hasMeaningfulData(state as Parameters<typeof hasMeaningfulData>[0]);
}

/**
 * Compte les collections clés d'un payload (state.assets / state.transactions). Purement défensif :
 * un payload chiffré (`null`) ou malformé rend des zéros (le modal affichera « inconnu » côté Drive).
 * On NE calcule PAS le patrimoine (nécessiterait le moteur) : le nombre de placements/transactions
 * suffit à distinguer « appareil riche » d'une « vieille copie pauvre ».
 */
export function summarizeForConflict(payload: unknown): ConflictSideCounts {
    const state = (payload as { state?: Record<string, unknown> } | null)?.state;
    const len = (v: unknown): number => (Array.isArray(v) ? v.length : 0);
    return { assets: len(state?.assets), transactions: len(state?.transactions) };
}

export interface LocalPayload {
    payload: unknown;
    apiKeys: ApiKeys;
    isEmpty: boolean;
    hash: string;
}

/** @internal — snapshot local désinfecté prêt à pousser. Partagé par syncPush + syncLifecycle (runDecision). */
export function getLocalPayload(): LocalPayload {
    let raw: string | null = null;
    try {
        raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORE_KEY) : null;
    } catch {
        raw = null;
    }
    let parsed: unknown = null;
    if (raw) {
        try {
            parsed = JSON.parse(raw);
        } catch {
            parsed = null;
        }
    }
    // [PERSONA-PURGE] Ceinture côté PUSH : un payload RÉEL (non test) ne part JAMAIS vers Drive
    // avec des artefacts de persona de test — même si le self-heal du boot n'a pas (encore)
    // tourné (vieil onglet, autre appareil). Le hash suit le payload DÉSINFECTÉ → pas de boucle.
    const { envelope: sanitized } = sanitizePersistEnvelope(stripApiKeys(parsed));
    const payload = sanitized;
    const apiKeys = currentApiKeys();
    // Hash de détection-de-changement = PAYLOAD SEUL (pas les clés API). Raison : au gate, les clés
    // ne sont pas encore hydratées (currentApiKeys() = vide tant que App.tsx n'a pas restauré depuis
    // secureKeyStore en async). Les inclure rendrait le hash instable selon le MOMENT du calcul →
    // après un pull+reload, le local paraîtrait « modifié » → push parasite qui EFFACERAIT les clés
    // dans Drive (régression Sync v2). Payload-only = invariant. Les clés restent incluses dans
    // l'enveloppe poussée (cf buildEnvelope) → elles se synchronisent au prochain push de données.
    return { payload, apiKeys, isEmpty: computeIsEmpty(payload), hash: hashPayload(payload) };
}
