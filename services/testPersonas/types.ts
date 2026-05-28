// services/testPersonas/types.ts
//
// Mode test multi-personas — un persona = un jeu complet de données fictives
// (Partial<AppState>) représentant une situation financière type : seul/couple,
// fauché/aisé/riche, dettes/zéro, locataire/proprio, immigré/natif, actif/retraité.
//
// Convention "no fake data" du CLAUDE.md : ces fixtures ne sont JAMAIS chargées
// au boot ni dans un état par défaut. Elles ne s'activent que sur action
// utilisateur explicite via TestModePanel, et un banner permanent (Layout.tsx)
// rappelle en continu qu'on est en mode test.

import type { AppState } from '../../types';

export interface TestPersona {
    /** Identifiant stable (slug) — clé dans le store et le sélecteur. */
    id: string;
    /** Emoji d'illustration (sélecteur + banner). */
    emoji: string;
    /** Nom court affiché dans le menu déroulant (ex: « Léa, 24 ans »). */
    label: string;
    /** Phrase d'accroche (ex: « Seule, début de carrière, budget serré »). */
    tagline: string;
    /** Description (1-2 phrases) du cas et de ce qu'il permet de tester. */
    description: string;
    /** Construit le jeu de données complet pour ce persona. */
    build: () => Partial<AppState>;
}
