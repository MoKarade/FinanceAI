// services/testFixtures.ts
//
// Point d'entrée historique du « Mode Test ». Délègue désormais au registre de
// personas (services/testPersonas/) : buildTestFixtures() retourne le persona
// PAR DÉFAUT (« Couple à l'aise »), conservé pour la rétrocompat. Le sélecteur
// de personas (TestModePanel) appelle directement persona.build().
//
// Convention "no fake data" du CLAUDE.md : ces fixtures NE sont JAMAIS chargées
// au boot ni dans un état par défaut. Elles ne s'activent que sur action
// utilisateur explicite, et un banner permanent (Layout.tsx) signale le mode.

import type { AppState } from '../types';
import { getPersonaOrDefault, DEFAULT_PERSONA_ID } from './testPersonas';

// Re-export pour les consommateurs qui importaient depuis ce fichier (hooks,
// tests qui mockent generateTestMarketData).
export { generateTestMarketData } from './testMarketData';

// Re-export du registre pour un accès centralisé.
export { TEST_PERSONAS, DEFAULT_PERSONA_ID, getPersonaById, getPersonaOrDefault } from './testPersonas';
export type { TestPersona } from './testPersonas';

/**
 * Jeu de données par défaut (persona « couple à l'aise »). Conservé pour les
 * consommateurs historiques ; le sélecteur de personas appelle persona.build().
 */
export function buildTestFixtures(): Partial<AppState> {
    return getPersonaOrDefault(DEFAULT_PERSONA_ID).build();
}
