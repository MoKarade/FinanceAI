// tests/nodeVersionDeclared.test.ts
//
// [ENV-NODE-NON-DECLARE 2026-08-21] Garde née d'un incident RÉEL, pas d'une précaution.
//
// Le 2026-08-19 (PR #665), `globSync` (`node:fs`, disponible à partir de Node 22) a donné un gate
// LOCAL VERT et une CI ROUGE **sur le même commit** : `TypeError: globSync is not a function`.
// Rien n'avertissait à l'écriture. Trois causes se combinaient :
//   1. le conteneur de dev tourne sur Node 22, les workflows épinglent Node 20 ;
//   2. AUCUNE déclaration ne disait quelle version est visée (`engines` absent, `.nvmrc` absent) ;
//   3. `@types/node` était en `^22`, donc le TYPECHECK autorisait des API que la CI n'a pas.
//
// ⚠️ Le point (3) est le vrai coupable, et c'est le moins évident : `engines` et `.nvmrc` DÉCRIVENT
// la cible, mais ne l'IMPOSENT à rien (sans `engine-strict`, `engines` n'est qu'un avertissement
// npm). Ce qui transforme la classe entière en erreur de compilation, c'est d'aligner les TYPES sur
// la version réellement exécutée : `tsc` refuse alors `globSync` à l'écriture, là où le développeur
// peut encore le corriger. Mesuré en posant `@types/node@^20` : le typecheck passe, donc aucun code
// n'utilisait d'API 22+ — la garde est posée sur un arbre propre, elle ne masque pas une dette.
//
// Cette garde vérifie que les trois déclarations existent ET qu'elles CONCORDENT. Elle ne fige pas
// le numéro 20 : passer le dépôt à Node 22 reste possible, mais exige de bouger les trois ensemble
// (classe `CABLER-UNE-ANNEE-C-EST-CABLER-UNE-PAIRE`, appliquée ici à la version de Node).

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const racine = join(__dirname, '..');
const lire = (rel: string): string => readFileSync(join(racine, rel), 'utf8');

/** Majeure déclarée par `.nvmrc` — la SOURCE UNIQUE dont tout le reste doit dériver. */
const majeureNvmrc = (): number => {
    const brut = lire('.nvmrc').trim();
    const m = /^v?(\d+)/.exec(brut);
    expect(m, `.nvmrc illisible : ${JSON.stringify(brut)}`).toBeTruthy();
    return Number(m![1]);
};

describe('[ENV-NODE-NON-DECLARE] la version de Node est déclarée UNE fois et concorde partout', () => {
    it('`.nvmrc` existe et porte une majeure lisible', () => {
        expect(majeureNvmrc()).toBeGreaterThanOrEqual(18);
    });

    it('`engines.node` de package.json vise la MÊME majeure que `.nvmrc`', () => {
        const pkg = JSON.parse(lire('package.json')) as { engines?: { node?: string } };
        const declare = pkg.engines?.node;
        expect(declare, 'package.json doit déclarer engines.node').toBeTruthy();
        const m = /(\d+)/.exec(declare!);
        expect(m).toBeTruthy();
        expect(Number(m![1])).toBe(majeureNvmrc());
    });

    it('`@types/node` est aligné sur la MÊME majeure — c’est LUI qui fait échouer le typecheck sur une API trop récente', () => {
        const pkg = JSON.parse(lire('package.json')) as { devDependencies?: Record<string, string> };
        const portee = pkg.devDependencies?.['@types/node'];
        expect(portee, '@types/node doit être déclaré').toBeTruthy();
        const m = /(\d+)/.exec(portee!);
        expect(m).toBeTruthy();
        // Un `@types/node` en avance sur la version EXÉCUTÉE est précisément ce qui a produit le
        // « gate local vert / CI rouge » du 2026-08-19 : les types promettent une API que le
        // runtime de la CI n'a pas.
        expect(Number(m![1])).toBe(majeureNvmrc());
    });

    it('aucun workflow ne re-code la version en dur : tous pointent sur `.nvmrc`', () => {
        const dir = join(racine, '.github', 'workflows');
        const fichiers = readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
        expect(fichiers.length).toBeGreaterThan(0); // anti-vacuité : la garde balaie vraiment quelque chose

        const enDur: string[] = [];
        let pointeurs = 0;
        for (const f of fichiers) {
            const contenu = readFileSync(join(dir, f), 'utf8');
            // `node-version:` (littéral) est interdit ; `node-version-file:` est la forme voulue.
            for (const ligne of contenu.split('\n')) {
                if (/^\s*node-version\s*:/.test(ligne)) enDur.push(`${f} → ${ligne.trim()}`);
                if (/^\s*node-version-file\s*:/.test(ligne)) pointeurs++;
            }
        }
        expect(enDur, 'la version doit venir de .nvmrc, pas d’un littéral répété par workflow').toEqual([]);
        // Anti-vacuité : sans cette borne, supprimer TOUS les setup-node rendrait le test vert.
        expect(pointeurs).toBeGreaterThanOrEqual(4);
    });
});
