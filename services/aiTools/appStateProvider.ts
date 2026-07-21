// services/aiTools/appStateProvider.ts
//
// [AITOOLS-B] Fournisseur d'état du chat in-app : un AppState PLAT (données seulement) dérivé du
// store Zustand vivant. Deux impératifs :
//  1. ÉCARTER les actions/fonctions du store (FinanceState étend AppState avec des méthodes) —
//     un handler qui clone l'état (structuredClone dans simulate_what_if) planterait sinon
//     (« could not be cloned », vu au test de parité) ;
//  2. passer par la MÊME `normalizeAppState` que le serveur MCP → parité « mêmes réponses que
//     claude.ai » par CONSTRUCTION (vérifiée par tests/aiTools/registryParity.test.ts).
// Le pick des clés vient de `buildDefaultAppState()` (la liste canonique des champs de données) —
// jamais de liste maintenue à la main (drift garanti sinon).

import type { AppState } from '../../types';
import { buildDefaultAppState, normalizeAppState } from '../../mcp/state/appStateDefaults';
import { validateAppStateShape } from '../../mcp/state/appStateSchema';
import { useFinanceStore } from '../../store/useFinanceStore';

/**
 * Snapshot PLAT, VALIDÉ et CLONÉ de l'état courant. Trois protections (findings panel 2026-07-21) :
 *  - `apiKeys` EXCLU : aucun tool n'en a besoin — les vraies clés (Anthropic/Finnhub) ne doivent
 *    jamais entrer dans un état que des handlers pourraient sérialiser vers un tool_result (même
 *    principe que l'Omit<'apiKeys'> de realDataSnapshot côté store) ;
 *  - `validateAppStateShape` AVANT normalisation : la MÊME étape que le chemin MCP (loadAppState) —
 *    un champ `null` corrompu doit LEVER une erreur claire, jamais être masqué en « absence
 *    légitime » par les `??` des handlers (chiffres à zéro plausibles sans trace) ;
 *  - `structuredClone` à la frontière : les handlers reçoivent une COPIE — même une mutation
 *    in-place accidentelle d'un handler futur ne peut pas toucher le vrai store (« aucune donnée
 *    changée » garanti structurellement ; coût mesuré ~1 ms sur ~700 tx, une fois par envoi).
 */
export function snapshotAppState(): AppState {
    const store = useFinanceStore.getState() as unknown as Record<string, unknown>;
    const dataOnly: Partial<AppState> = {};
    for (const key of Object.keys(buildDefaultAppState()) as Array<keyof AppState>) {
        if (key === 'apiKeys') continue; // jamais les vraies clés dans le snapshot (défaut vide via normalize)
        const value = store[key];
        if (value !== undefined) (dataOnly as Record<string, unknown>)[key] = value;
    }
    validateAppStateShape(dataOnly); // throw clair sur état corrompu — journalisé par l'appelant (agentLoop)
    return normalizeAppState(structuredClone(dataOnly));
}

/** StateProvider (contrat des specs) — capturé UNE fois par envoi dans agentLoop (snapshot cohérent). */
export const appStateProvider = async (): Promise<AppState> => snapshotAppState();
