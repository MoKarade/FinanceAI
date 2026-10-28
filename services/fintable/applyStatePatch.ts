// services/fintable/applyStatePatch.ts
//
// [FINTABLE-7] Patch d'état par DELTA D'IDENTITÉ DE RÉFÉRENCE, partagé entre la carte Réglages
// (sync manuelle) et la sync AUTO au boot — extrait de FintableSyncCard AU MOMENT où un 2ᵉ
// consommateur apparaît, pas après (leçon « consolider avant que la 2ᵉ copie existe »).
//
// Pourquoi un delta par référence et JAMAIS une liste de clés à la main (finding silent-failure,
// PR #536) : un 1er jet énumérait 5 clés et perdait DÉJÀ `lastUpdate` ; et toute clé FUTURE touchée
// par un payload serait silencieusement lâchée. `applyDocument` fait des mises à jour immuables →
// une clé modifiée porte une nouvelle référence : on n'écrit QUE celles-là. Double bénéfice :
// (a) tout champ futur est capté sans y penser ; (b) les clés inchangées ne sont pas réécrites,
// donc une modification concurrente survenue pendant la passe n'est pas écrasée (pas d'OCC côté
// navigateur). Les actions du store ont une référence stable → jamais dans le patch.

import type { AppState } from '../../types';

/** Clés de `nextState` dont la référence diffère de `current` — le patch minimal à écrire. */
export function referenceDeltaPatch(current: AppState, nextState: AppState): Partial<AppState> {
    const patch: Partial<AppState> = {};
    for (const key of Object.keys(nextState) as (keyof AppState)[]) {
        if (nextState[key] !== current[key]) {
            (patch as Record<string, unknown>)[key] = nextState[key];
        }
    }
    return patch;
}
