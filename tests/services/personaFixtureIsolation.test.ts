// tests/services/personaFixtureIsolation.test.ts
//
// [TEST-PERSONA-FIXTURE-PARTAGEE] `buildCoupleConfort` rendait les MÊMES objets à chaque appel —
// `config`, `budgetItems`, `assets`, `debts`, `retirementGoal` étaient identiques au sens de `===`
// entre deux `build()`. Toute mutation d'un consommateur contaminait donc tous les suivants dans
// le même processus, et c'est le persona PAR DÉFAUT : celui qu'un audit prend spontanément (même
// classe que `[TEST-PERSONA-NON-DETERMINISTE]`, sur le même persona, au lot 30).
//
// Un fixture partagé ne fait pas ÉCHOUER un test, il en fabrique un FAUX — ce qui est pire, parce
// que rien n'alerte. Mesuré dans cette session : deux cas d'un même relevé se partageaient une
// corruption, et le second annonçait `baseNetAnnual = 52 800` au lieu de 115 200 sans raison
// visible. Les six autres personas construisaient déjà des littéraux frais ; celui-ci réutilisait
// les constantes de module `TEST_CONFIG`/`TEST_ASSETS`/…

import { describe, it, expect } from 'vitest';
import { TEST_PERSONAS, DEFAULT_PERSONA_ID } from '../../services/testPersonas';
import type { AppState } from '../../types';

/** Champs de premier niveau qu'un persona peut réutiliser depuis une constante de module. */
const CHAMPS = ['config', 'budgetItems', 'assets', 'debts', 'retirementGoal',
    'realEstateGoals', 'childGoals', 'travelGoals', 'lifeEvents', 'financialGoals'] as const;

describe('[TEST-PERSONA-FIXTURE-PARTAGEE] deux builds d\'un persona ne partagent aucun objet', () => {
    it('AUCUN persona ne renvoie deux fois le même objet (identité stricte)', () => {
        for (const persona of TEST_PERSONAS) {
            const a = persona.build() as unknown as Record<string, unknown>;
            const b = persona.build() as unknown as Record<string, unknown>;
            // Anti-vacuité : le persona produit bien les champs qu'on inspecte, sinon
            // « aucun partagé » serait satisfait par « aucun champ ».
            const presents = CHAMPS.filter((k) => a[k] !== undefined);
            expect(presents.length, `${persona.id} : aucun des champs inspectés n'existe`).toBeGreaterThanOrEqual(5);
            for (const k of presents) {
                expect(a[k] === b[k], `${persona.id} · ${k} : même objet rendu par deux build()`).toBe(false);
            }
        }
    });

    it('muter un build ne change PAS ce que lit le build suivant (persona par défaut)', () => {
        // La conséquence observable, et la seule qui compte : c'est elle qui a faussé une mesure.
        const persona = TEST_PERSONAS.find((p) => p.id === DEFAULT_PERSONA_ID)!;
        const avant = (persona.build() as AppState).config.users[0].netSalary;
        expect(avant).toBeGreaterThan(0); // anti-vacuité : la valeur observée est réelle

        const mute = persona.build() as AppState;
        (mute.config.users[0] as { netSalary: number }).netSalary = 999;
        expect((persona.build() as AppState).config.users[0].netSalary).toBe(avant);

        // Et en PROFONDEUR : muter un élément d'un tableau ne doit pas fuir non plus — un spread
        // superficiel (`[...TEST_ASSETS]`) partagerait encore chaque actif, or c'est à ce
        // niveau-là qu'on mute.
        const assetsAvant = (persona.build() as AppState).assets[0].quantity;
        const mute2 = persona.build() as AppState;
        (mute2.assets[0] as { quantity: number }).quantity = 12345;
        expect((persona.build() as AppState).assets[0].quantity).toBe(assetsAvant);
    });
});
