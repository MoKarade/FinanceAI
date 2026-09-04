// tests/store/storeRenameGuard.test.ts
//
// [STORE-RENAME-NO-GUARD] La chaîne de migration protège les cas TRAITÉS ; RIEN ne protégeait
// contre la RÉUTILISATION d'un nom de champ déjà consommé par un palier. `partialize` est un
// allow-all moins une liste d'exclusions : renommer un champ persisté passe le typecheck pendant
// qu'un blob localStorage/Drive existant garde l'ANCIEN nom — ignoré en silence au rehydrate
// (merge shallow). Perte de données sans aucune exception, plus discrète que STORE-REHYDRATE-SILENT.
//
// ⚠️ LA RÈGLE (à lire avant de renommer quoi que ce soit de persisté) :
//   1. Renommer un champ persisté = un NOUVEAU palier de migration (vN→vN+1) qui recopie
//      l'ancien nom vers le nouveau — jamais un simple renommage de type.
//   2. Le nom RETIRÉ entre dans l'inventaire RESERVED_LEGACY ci-dessous : il est RÉSERVÉ à
//      jamais (un blob ancien peut encore le porter — lui redonner un sens NOUVEAU ferait lire
//      de vieilles données sous la nouvelle sémantique, ou l'inverse).
//
// ⚠️ Recensement du 2026-09-04 — l'inventaire est PETIT, et c'est un constat, pas une omission :
//   · `apiKeys.gemini` — supprimé au palier v2→v3 (formats incompatibles, pas de copie).
//   · `User.salary` — l'ancien nom du net mensuel ; consommé par le repli legacy
//     `u.netSalary || u.salary` (migrateUserConfig, chemin localStorage historique). Toujours
//     DÉCLARÉ `salary?: number` dans types.ts pour la rétrocompat — réservé, pas réutilisable.
//   · Les champs du mode test (isTestMode/realDataSnapshot/activeTestPersonaId) ont été purgés
//     par v6→v7 puis RE-LÉGITIMÉS (persistés à nouveau, choix Marc — bannière/persona survivent
//     au reload, poussée Drive toujours gatée par shouldPush) : ils ne sont PAS retirés.
//   · `dateBought`/`buyPrice`/`quantity` (v5→v6) restent des champs VIVANTS (rétrocompat) : pas
//     retirés non plus.
// La liste est ÉCRITE À LA MAIN (une garde qui lit la table qu'elle vérifie est circulaire).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { migratePersistedState } from '../../store/useFinanceStore';
import { buildDefaultAppState } from '../../mcp/state/appStateDefaults';
import { INITIAL_CONFIG } from '../../constants';
import { stripComments } from '../../utils/stripComments';

describe('[STORE-RENAME-NO-GUARD] les noms consommés par un palier restent consommés, et jamais réutilisés', () => {
    it('v2→v3 : `apiKeys.gemini` est bien JETÉ par la chaîne complète (et anthropic préservé)', () => {
        // Comportemental, pas un scan : un blob v2 qui porte encore gemini traverse v2→…→v7.
        // ⚠️ REDONDANCE mesurée (perturbations 2026-09-04) : DEUX paliers reconstruisent apiKeys
        // (v2→v3 ET v3→v4) et chacun jette gemini à lui seul — perturber un seul reste vert, les
        // deux rougit. Ce test défend le FAIT (la chaîne jette le nom), pas un palier précis.
        const out = migratePersistedState(
            { apiKeys: { anthropic: 'clef-a', gemini: 'clef-g' } }, 2,
        ) as { apiKeys: Record<string, unknown> };
        expect(out.apiKeys.anthropic).toBe('clef-a');
        expect('gemini' in out.apiKeys, 'gemini a survécu au palier v2→v3 — le palier ne consomme plus son nom').toBe(false);
    });

    it('les noms retirés ne réapparaissent dans AUCUN défaut (la porte de la réutilisation)', () => {
        // Un nom réutilisé commencerait sa nouvelle vie ici : dans les défauts du contrat.
        const d = buildDefaultAppState();
        expect('gemini' in (d.apiKeys as Record<string, unknown>)).toBe(false);
        for (const u of INITIAL_CONFIG.users) {
            expect(Object.prototype.hasOwnProperty.call(u, 'salary'),
                'un défaut utilisateur pose `salary` — nom RÉSERVÉ au legacy (net mensuel d\'avant le renommage)').toBe(false);
        }
        // Et le TYPE ne re-déclare gemini nulle part (usage/déclaration, source décommentée).
        const types = stripComments(readFileSync('types.ts', 'utf8'));
        expect(types.replace(/\s/g, '').length).toBeGreaterThan(10_000); // anti-vacuité du décommentage
        expect(types).not.toMatch(/\bgemini\s*[?:]/);
    });

    it('ANTI-OBSOLESCENCE : le repli legacy `netSalary || salary` existe toujours — sinon, re-juger l\'entrée `salary`', () => {
        // Si un refactor retire ce repli, l'entrée `salary` de l'inventaire ci-dessus doit être
        // RE-JUGÉE (le nom reste réservé tant que de vieux blobs peuvent le porter — mais la
        // justification écrite ici ne serait plus la bonne). Usage-anchored, source décommentée.
        // [GODFILE-STORE] (lot 158) le repli vit désormais dans `migrateUserConfig`, déménagé tel
        // quel vers store/etatParDefaut.ts — la garde suit le code. Anti-vacuité re-mesurée à la
        // portée du NOUVEAU fichier (2026-09-04) : ~11 000 caractères non blancs.
        const src = stripComments(readFileSync('store/etatParDefaut.ts', 'utf8'));
        expect(src.replace(/\s/g, '').length).toBeGreaterThan(8_000);
        expect(src).toMatch(/u\.netSalary\s*\|\|\s*u\.salary/);
        // Et `salary?` est bien toujours DÉCLARÉ (rétrocompat de type) — sa disparition serait un
        // renommage de contrat qui exige exactement le palier que ce fichier réclame.
        const types = stripComments(readFileSync('types.ts', 'utf8'));
        expect(types).toMatch(/\bsalary\?\s*:\s*number/);
    });
});
