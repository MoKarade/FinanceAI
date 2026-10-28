// [A11Y-LABELS-RESTE-DU-DEPOT] Tout contrôle de formulaire a un NOM ACCESSIBLE.
//
// ⚠️ WCAG 4.1.2. Un `<input>`/`<select>`/`<textarea>` sans nom est annoncé « zone d'édition » par un
// lecteur d'écran, sans dire laquelle.
//
// ⚠️ LE CRITÈRE PORTE SUR LE CONTRÔLE, PAS SUR LE LABEL — et c'est ce qui a redressé ce lot. Le
// ticket d'origine comptait les `<label>` non associés et en annonçait 13 dans `ProjectionControls` :
// or chacun de ces sliders porte déjà un `aria-label` explicite. Le label y est redondant, le champ
// n'est PAS anonyme, et « corriger » ces 13 sites n'aurait rien réparé. Recensé sur les contrôles,
// le vrai périmètre est ailleurs. Un label orphelin est un indice ; l'absence de nom est le défaut.
//
// ⚠️ Quatre façons LÉGITIMES de nommer, et le scan doit connaître les quatre : `aria-label`,
// `aria-labelledby`, un `id` cible d'un `htmlFor` du même fichier, ou un `<label>` ANCÊTRE qui
// enveloppe le contrôle. Un `<label>` sans `htmlFor` qui enveloppe son champ est parfaitement
// valide — un comptage brut `grep -c '<label'` contre `grep -c htmlFor` donnait 40 vs 14 sur
// `AdvancedProjectionParams` là où le vrai chiffre était 26.
//
// ⚠️ La source est lue DÉCOMMENTÉE (`SCAN-QUI-MATCHE-LA-PROSE`) : deux fichiers du dépôt écrivent
// `<label htmlFor>` en toutes lettres dans un commentaire pour EXPLIQUER la règle. Une bonne doc
// fait rougir un scan naïf.
//
// ⚠️ Un `id` littéral ne convient qu'à un contrôle rendu UNE fois. Dans une liste (`policies.map`,
// `holdings.map`, les postes du budget), deux lignes porteraient le même `id` : les labels
// pointeraient alors le MÊME contrôle et un scan d'orphelins n'y verrait rien, chaque `htmlFor`
// trouvant bien un `id` existant (piège payé au lot 50 sur `app-returnRates`). Ces sites reçoivent
// un `aria-label` DISCRIMINANT, et la deuxième assertion tient l'unicité des `id` littéraux.
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { resolve, join, relative, basename } from 'node:path';
import { stripComments, partDeCodeRestante } from '../../utils/stripComments';

const racine = resolve(process.cwd(), 'components');

/**
 * Fichiers dont les contrôles tirent leur nom d'AILLEURS. Nominatif et motivé : ce sont des
 * primitives génériques qui relaient `{...rest}` — le nom accessible est fourni par chaque
 * appelant, et l'exiger ici serait le figer pour tous.
 */
const PRIMITIVES_GENERIQUES: ReadonlyArray<{ fichier: string; raison: string }> = [
    { fichier: 'PrivateNumberInput.tsx', raison: 'relaie `{...rest}` : le nom vient de l\'appelant (`aria-label` ou `<label htmlFor>` côté site d\'usage).' },
    { fichier: 'PrivateSelect.tsx', raison: 'même contrat de primitive : `{...rest}` porte le nom choisi par l\'appelant.' },
    // [DETTE-UI-PRIMITIVES] (lot 156) — les deux primitives canoniques rejoignent le même contrat.
    { fichier: 'Input.tsx', raison: 'primitive `ui/Input` : relaie `{...rest}` — le nom vient du site (`aria-label`, ou `id` posé par `ui/Field` et son `<label htmlFor>`).' },
    { fichier: 'Select.tsx', raison: 'primitive `ui/Select` : même contrat — `{...rest}` porte `id`/`aria-label` de l\'appelant.' },
];

function fichiersTsx(dir: string): string[] {
    return readdirSync(dir).flatMap((nom) => {
        const chemin = join(dir, nom);
        if (statSync(chemin).isDirectory()) return fichiersTsx(chemin);
        return chemin.endsWith('.tsx') ? [chemin] : [];
    });
}

function lireCode(chemin: string): string {
    const brut = readFileSync(chemin, 'utf8');
    const code = stripComments(brut);
    if (brut.trim() !== '' && partDeCodeRestante(brut, code) < 0.05) {
        throw new Error(`${chemin} : décommentage suspect — une garde d'absence lue sur un fichier vidé serait vacueuse`);
    }
    return code;
}

/**
 * Index du `>` fermant la balise ouvrante commencée à `debut`. On compte la PROFONDEUR des accolades
 * JSX et on saute les chaînes : `[^>]*` tronque la balise au premier `>` d'un `className` interpolé
 * ou d'une flèche de lambda (`GARDE-BORNEE-PAR-CLASSE-NEGATIVE`).
 */
function finBaliseOuvrante(s: string, debut: number): number {
    let i = debut + 1;
    let accolades = 0;
    let guillemet: string | null = null;
    while (i < s.length) {
        const c = s[i];
        if (guillemet !== null) {
            if (c === guillemet) guillemet = null;
        } else if (c === '"' || c === "'" || c === '`') {
            guillemet = c;
        } else if (c === '{') {
            accolades++;
        } else if (c === '}') {
            accolades--;
        } else if (c === '>' && accolades === 0) {
            return i;
        }
        i++;
    }
    return -1;
}

/** Plages [début, fin] du CONTENU de chaque `<label>…</label>`. */
function plagesDeLabel(code: string): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    let i = 0;
    while ((i = code.indexOf('<label', i)) !== -1) {
        const fin = finBaliseOuvrante(code, i);
        if (fin === -1) break;
        const ferme = code.indexOf('</label>', fin);
        if (ferme !== -1) out.push([fin, ferme]);
        i = fin + 1;
    }
    return out;
}

interface Anonyme { fichier: string; ligne: number; balise: string }

function controlesSansNom(): Anonyme[] {
    const exempts = new Set(PRIMITIVES_GENERIQUES.map((e) => e.fichier));
    const out: Anonyme[] = [];
    for (const chemin of fichiersTsx(racine)) {
        if (exempts.has(basename(chemin))) continue;
        const code = lireCode(chemin);
        const plages = plagesDeLabel(code);
        const cibles = new Set([...code.matchAll(/htmlFor=["']([^"']+)["']/g)].map((m) => m[1]));
        const htmlForDynamique = /htmlFor=\{/.test(code);
        for (const m of code.matchAll(/<(input|select|textarea)\b/g)) {
            const i = m.index;
            const fin = finBaliseOuvrante(code, i);
            if (fin === -1) break;
            const balise = code.slice(i, fin + 1);
            // `display:none` retire l'élément de l'arbre d'accessibilité : un déclencheur de fichier
            // caché derrière un bouton visible n'a pas de nom à porter. Règle, pas liste — le patron
            // est employé cinq fois dans le dépôt.
            if (/type=["']hidden["']/.test(balise)) continue;
            if (/className=["'][^"']*\bhidden\b[^"']*["']/.test(balise)) continue;
            const idLitteral = balise.match(/\bid=["']([^"']+)["']/);
            const nomme = /\baria-label(ledby)?\s*=/.test(balise)
                || plages.some(([a, b]) => i > a && i < b)
                || (idLitteral !== null && cibles.has(idLitteral[1]))
                || (/\bid=\{/.test(balise) && htmlForDynamique);
            if (!nomme) {
                out.push({
                    fichier: relative(process.cwd(), chemin),
                    ligne: code.slice(0, i).split('\n').length,
                    balise: balise.replace(/\s+/g, ' ').slice(0, 90),
                });
            }
        }
    }
    return out;
}

/** `id` littéraux répétés DANS un même fichier — deux contrôles qu'un `htmlFor` ne peut pas départager. */
function idsDupliques(): string[] {
    const out: string[] = [];
    for (const chemin of fichiersTsx(racine)) {
        const code = lireCode(chemin);
        const vus = new Set<string>();
        for (const m of code.matchAll(/\bid=["']([^"']+)["']/g)) {
            if (vus.has(m[1])) out.push(`${relative(process.cwd(), chemin)} : ${m[1]}`);
            vus.add(m[1]);
        }
    }
    return out;
}

describe('[A11Y-LABELS-RESTE-DU-DEPOT] tout contrôle porte un nom accessible', () => {
    it('anti-vacuité : le scan voit du code, des contrôles et des noms', () => {
        const fichiers = fichiersTsx(racine);
        const code = fichiers.map(lireCode).join('\n');
        expect(fichiers.length, 'aucun .tsx balayé').toBeGreaterThan(50);
        expect((code.match(/<(input|select|textarea)\b/g) ?? []).length, 'aucun contrôle vu').toBeGreaterThan(100);
        expect((code.match(/htmlFor\s*=/g) ?? []).length, 'aucun htmlFor vu').toBeGreaterThan(50);
        expect((code.match(/aria-label/g) ?? []).length, 'aucun aria-label vu').toBeGreaterThan(50);
    });

    it('aucun contrôle anonyme dans components/', () => {
        const anonymes = controlesSansNom();
        const detail = anonymes.map((a) => `  ${a.fichier}:${a.ligne} — ${a.balise}`).join('\n');
        expect(anonymes, `Contrôle(s) sans nom accessible :\n${detail}`).toEqual([]);
    });

    it('aucun `id` littéral dupliqué dans un même fichier', () => {
        const doublons = idsDupliques();
        expect(doublons, `id dupliqué(s) :\n${doublons.join('\n')}`).toEqual([]);
    });

    it('chaque primitive exemptée existe encore et relaie bien `{...rest}`', () => {
        // Une exemption qui ne correspond plus à rien compte comme protection dans tout inventaire
        // futur (`ENTREE-D-INVENTAIRE-FANTOME`) : elle se prouve, ou elle se retire.
        for (const { fichier } of PRIMITIVES_GENERIQUES) {
            const trouve = fichiersTsx(racine).filter((c) => basename(c) === fichier);
            expect(trouve, `exemption fantôme : ${fichier} n'existe plus`).toHaveLength(1);
            expect(lireCode(trouve[0]), `${fichier} ne relaie plus {...rest} — l'exemption n'a plus de raison`).toContain('{...rest}');
        }
    });
});
