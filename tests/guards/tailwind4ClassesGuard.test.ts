// [S5-TAILWIND4] Aucune classe au nom v3 ne revient dans le code.
//
// La migration a renommé ~100 fichiers d'un coup (outil officiel). Mais `main` continue d'avancer
// pendant la refonte : un correctif écrit à l'ancienne (`rounded`, `shadow-sm`, `outline-none`,
// `bg-gradient-to-r`…) arrive par rebase et, en v4, ces noms ont CHANGÉ DE SENS ou n'existent plus
// — `rounded` et `shadow` y sont désormais plus petits d'un cran, `outline-none` n'est plus un
// contour transparent, `bg-gradient-to-*` ne produit rien. Rien ne casse à la compilation : seul un
// écran un peu faux le trahit. Cette garde le trahit avant.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINES = ['components', 'App.tsx', 'index.tsx'];

/** Noms v3 dont le sens a changé ou qui ont disparu en v4 (règles de l'outil @tailwindcss/upgrade). */
const EXACTS = new Set(['shadow', 'rounded', 'ring', 'blur', 'drop-shadow', 'backdrop-blur', 'outline-none', 'overflow-ellipsis', 'decoration-slice', 'decoration-clone']);
const PREFIXES = ['bg-gradient-to-', 'flex-shrink-', 'flex-grow-', 'bg-opacity-', 'text-opacity-', 'border-opacity-', 'ring-opacity-', 'divide-opacity-', 'placeholder-opacity-'];
/** Une chaîne « ressemble à une liste de classes » si elle porte au moins un utilitaire courant. */
const INDICE_CLASSES = /(?:^|\s)(?:[a-z-]+:)*(?:flex|grid|text-|bg-|p[xytblr]?-\d|m[xytblr]?-\d|gap-|border|w-|h-)/;

function fichiers(chemin: string): string[] {
    if (statSync(chemin).isDirectory()) return readdirSync(chemin).flatMap((n) => fichiers(join(chemin, n)));
    return /\.tsx?$/.test(chemin) ? [chemin] : [];
}

function residus(code: string): string[] {
    const trouves: string[] = [];
    for (const m of code.matchAll(/(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) {
        const chaine = m[2];
        if (!INDICE_CLASSES.test(chaine)) continue;
        for (const brut of chaine.split(/\s+/)) {
            const jeton = brut.replace(/^!|!$/g, '').split(':').pop() ?? '';
            if (EXACTS.has(jeton) || PREFIXES.some((p) => jeton.startsWith(p))) trouves.push(brut);
        }
    }
    return trouves;
}

describe('[S5-TAILWIND4] garde des noms de classes v3', () => {
    it('aucun nom de classe v3 dans les composants', () => {
        const fautes = RACINES.flatMap((r) => fichiers(r)).flatMap((f) => residus(readFileSync(f, 'utf8')).map((c) => `${f} : ${c}`));
        expect(fautes, 'renommer selon la table de migration v4 (rounded → rounded-sm, shadow-sm → shadow-xs, outline-none → outline-hidden, bg-gradient-to-* → bg-linear-to-*/srgb…)').toEqual([]);
    });

    it('la garde voit bien ce qu\'elle cherche (témoins)', () => {
        expect(residus(`className="flex rounded px-2"`)).toEqual(['rounded']);
        expect(residus(`cls = 'text-sm hover:shadow bg-gradient-to-r from-x'`)).toEqual(['hover:shadow', 'bg-gradient-to-r']);
        expect(residus(`className="flex rounded-sm shadow-xs outline-hidden bg-linear-to-r/srgb"`)).toEqual([]);
        expect(residus(`const titre = "Le blur est purement CSS"`), 'une phrase n\'est pas une liste de classes').toEqual([]);
    });
});
