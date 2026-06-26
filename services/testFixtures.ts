// services/testFixtures.ts
//
// Barrel de re-exports du « Mode Test ». Point d'accès centralisé au registre de
// personas (services/testPersonas/) et au générateur de données de marché de test :
// les consommateurs (TestModePanel, Layout, PageSetupGate, usePortfolioHistory)
// importent les personas et `generateTestMarketData` depuis ici. Le sélecteur de
// personas appelle directement `persona.build()`.
//
// Convention "no fake data" du CLAUDE.md : ces fixtures NE sont JAMAIS chargées
// au boot ni dans un état par défaut. Elles ne s'activent que sur action
// utilisateur explicite, et un banner permanent (Layout.tsx) signale le mode.

// Re-export pour les consommateurs qui importaient depuis ce fichier (hooks,
// tests qui mockent generateTestMarketData).
export { generateTestMarketData } from './testMarketData';

// Re-export du registre pour un accès centralisé.
export { TEST_PERSONAS, DEFAULT_PERSONA_ID, getPersonaById, getPersonaOrDefault } from './testPersonas';
export type { TestPersona } from './testPersonas';
