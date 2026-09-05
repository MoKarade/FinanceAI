// services/testPersonas/artifactIds.ts
//
// [PERSONA-PURGE] — registre AUTONOME des identifiants d'artefacts de PERSONA DE TEST.
// Sert au sanitizer (services/personaSanitizer.ts) à reconnaître, dans un état RÉEL,
// tout résidu de mode test (incident 2026-07-15 : ~600 transactions « persona-tx-* » de
// Karim + son objectif « kar-fg1 » retrouvés MÉLANGÉS aux vraies données de Marc).
//
// ⚠️ Ce fichier est importé par le chemin de BOOT (self-heal) : il ne doit JAMAIS
// importer les fixtures elles-mêmes (poids bundle). La PARITÉ avec les fixtures est
// verrouillée par le test-scan tests/services/personaSanitizer.test.ts : tout id de
// fixture absent d'ici = test rouge (un futur persona ne peut pas passer entre les mailles).
//
// Conventions d'ids RÉELS vérifiées disjointes (2026-07-15, tranches auditées : transactions
// importées `-<timestamp>` numérique, budget `cat_<ts>`, dettes `<ts>`/`debt_<ts>` (MCP), règles
// `rule_<ts>`, défauts app `child_1`/`main_property` — underscore, distincts des fixtures
// `child-1`/`re-1` à tiret ; autres tranches : `Date.now()`/`prop_<ts>`/random36 au grep).
// ⚠️ Pas une garantie universelle future : toute NOUVELLE surface qui crée des ids doit garder
// la convention horodatée/préfixée — jamais d'id court générique (`b1`, `d1`, `tr-1`, `fg-1`…).

/** Préfixes d'ids GÉNÉRÉS par les personas (compteurs). */
export const PERSONA_ID_PREFIXES: readonly string[] = [
    'persona-tx-',  // buildPersonaTransactions (tous les personas paramétriques)
    'test-tx-',     // generateTestTransactions (persona par défaut « Couple à l'aise »)
    'test-asset-',  // TEST_ASSETS (persona par défaut)
];

/** Ids EXACTS des fixtures statiques de tous les personas (y compris legacy testBudget/testGoals). */
export const PERSONA_EXACT_IDS: ReadonlySet<string> = new Set([
    'b1', 'b10', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9',
    'cd-a1', 'cd-b1', 'cd-b2', 'cd-b3', 'cd-b4', 'cd-b5', 'cd-b6', 'cd-b7',
    'cd-d1', 'cd-d2', 'cd-d3', 'cd-fg1',
    'child-1', 'd1', 'd2', 'fg-1',
    'gi-a1', 'gi-a2', 'gi-a3', 'gi-b1', 'gi-b2', 'gi-b3', 'gi-b4', 'gi-b5', 'gi-b6', 'gi-b7',
    'gi-fg1', 'gi-tr1',
    'jc-a1', 'jc-a2', 'jc-b1', 'jc-b2', 'jc-b3', 'jc-b4', 'jc-b5', 'jc-b6',
    'jc-b7', 'jc-b8', 'jc-d1', 'jc-fg1', 'jc-re1', 'jc-tr1',
    'kar-a1', 'kar-a2', 'kar-a3', 'kar-a4', 'kar-b1', 'kar-b2', 'kar-b3',
    'kar-b4', 'kar-b5', 'kar-b6', 'kar-b7', 'kar-b8', 'kar-b9', 'kar-fg1', 'kar-tr1',
    'le-1',
    'lea-a1', 'lea-b1', 'lea-b2', 'lea-b3', 'lea-b4', 'lea-b5', 'lea-b6', 'lea-b7',
    'lea-d1', 'lea-fg1',
    'na-a1', 'na-a2', 'na-b1', 'na-b2', 'na-b3', 'na-b4', 'na-b5', 'na-b6',
    'na-b7', 'na-b8', 'na-child1', 'na-d1', 'na-fg1', 'na-tr1',
    'pr-a1', 'pr-a2', 'pr-a3', 'pr-b1', 'pr-b2', 'pr-b3', 'pr-b4', 'pr-b5',
    'pr-b6', 'pr-b7', 'pr-fg1', 'pr-tr1', 'pr-tr2',
    're-1',
    'test-asset-1', 'test-asset-2', 'test-asset-3', 'test-asset-4', 'test-asset-5',
    'tr-1', 'tr-2',
]);

/** true si `id` est un artefact de persona de test (préfixe généré OU id exact de fixture). */
export function isPersonaArtifactId(id: unknown): boolean {
    if (typeof id !== 'string' || id.length === 0) return false;
    if (PERSONA_EXACT_IDS.has(id)) return true;
    return PERSONA_ID_PREFIXES.some(p => id.startsWith(p));
}
