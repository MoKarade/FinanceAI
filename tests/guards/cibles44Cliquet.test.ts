// [A11Y-CIBLES-44-CLIQUET] Cliquet des contrôles dont la hauteur de 44 px n'est PAS établie par leur classe.
//
// Posé le 2026-10-16 pour #1151 (clause réécrite par Marc : « le cliquet baisse » ne pouvait pas se
// lire, il n'existait pas). Le formulaire de dette a été porté à 44 px par #1101 ; ce fichier fait
// de ce résultat un plancher qui ne recule pas, et mesure le reste de l'app pour qu'il puisse baisser.
//
// ⚠️ CE QUE ÇA MESURE, ET CE QUE ÇA NE MESURE PAS. jsdom ne calcule aucune mise en page : on lit la
// CLASSE de chaque `<button>`, `<input>`, `<select>` et `<textarea>` de `components/` et on cherche
// une hauteur de 44 px ou plus (`touch-target`, `min-h-11`/`h-11` et au-delà, `h-[44px]`…). Un
// contrôle sans cette marque compte, même s'il atteint 44 px par son contenu ou son parent : c'est
// un compte de cibles NON PROUVÉES à 44 px, pas de cibles rendues trop petites. Il surestime donc, et
// c'est le bon sens pour un cliquet (il ne laisse pas passer un nouveau contrôle sans marque).
// Voir `touchTargetGuard.test.ts` pour l'autre plancher (24 px, icône seule, WCAG 2.5.8).
//
// Périmètre, par choix : la HAUTEUR seule (le défaut du ticket, des champs de ≈ 26 px de haut) ;
// `checkbox`, `radio`, `range`, `hidden`, `file` exclus (case enveloppée par son libellé, curseur
// à poignée) ; un composant enveloppe (`<Input>`, `<Button>`) compte à sa DÉFINITION, pas à chaque usage.
//
// ⚠️ Un cliquet qui ne sait que monter la barre devient un décor : ce test échoue aussi quand le
// compte BAISSE sous le plafond. Il demande alors de resserrer la constante (`PLAFOND`), qui est
// l'unique valeur à changer — jamais à relever sans décision de Marc.
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { toPosix, cwdPosix } from '../helpers/toPosix';
import { stripComments, partDeCodeRestante } from '../../utils/stripComments';

const racine = resolve(process.cwd(), 'components');

/**
 * Valeur MESURÉE le 2026-10-16 sur `origin/main` (2222ef5) + le correctif du lot (3 boutons de l'écran
 * Dettes) : 349 contrôles sur 494 sans hauteur de 44 px établie. Ne se relève pas sans décision de Marc.
 * Resserré à 331 le 2026-10-28 : le retrait de l'ancien assistant (FinanceAI#15) emporte 18 contrôles.
 */
const PLAFOND = 331;

/** Fichiers qui DOIVENT rester à zéro : le formulaire de dette (#1101) et ses sous-composants. */
const ZERO = /(^|\/)components\/(DebtManager\.tsx|debt\/)/;

const TYPES_EXCLUS = new Set(['checkbox', 'radio', 'range', 'hidden', 'file']);

function fichiersTsx(dir: string): string[] {
    return readdirSync(dir).flatMap((nom) => {
        const chemin = toPosix(join(dir, nom));
        if (statSync(chemin).isDirectory()) return fichiersTsx(chemin);
        return chemin.endsWith('.tsx') ? [chemin] : [];
    });
}

function lireCode(chemin: string): string {
    const brut = readFileSync(chemin, 'utf8');
    const code = stripComments(brut);
    if (brut.trim() !== '' && partDeCodeRestante(brut, code) < 0.05) {
        throw new Error(`${chemin} : décommentage suspect — un compte lu sur un fichier vidé serait vacueux`);
    }
    return code;
}

/** Index du `>` qui ferme la balise ouvrante commencée en `debut`, hors accolades JSX et chaînes. */
function finBaliseOuvrante(code: string, debut: number): number {
    let accolades = 0;
    let guillemet: string | null = null;
    for (let i = debut; i < code.length; i++) {
        const c = code[i];
        if (guillemet) {
            if (c === '\\') i++;
            else if (c === guillemet) guillemet = null;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') { guillemet = c; continue; }
        if (c === '{') accolades++;
        else if (c === '}') accolades--;
        else if (c === '>' && accolades === 0 && code[i - 1] !== '=') return i;
    }
    return -1;
}

/** Hauteur minimale en px que la classe établit, ou 0. Une branche conditionnelle suffit (lecture optimiste). */
function hauteurEtablie(classes: string): number {
    if (/(^|[\s"'`])touch-target(?=[\s"'`]|$)/.test(classes)) return 44;
    let h = 0;
    for (const m of classes.matchAll(/(?<![\w-])(?:min-)?h-(\d+(?:\.\d+)?)(?![\w.-])/g)) h = Math.max(h, Number(m[1]) * 4);
    for (const m of classes.matchAll(/(?<![\w-])size-(\d+(?:\.\d+)?)(?![\w.-])/g)) h = Math.max(h, Number(m[1]) * 4);
    for (const m of classes.matchAll(/(?<![\w-])(?:min-)?h-\[(\d+(?:\.\d+)?)px\]/g)) h = Math.max(h, Number(m[1]));
    for (const m of classes.matchAll(/(?<![\w-])(?:min-)?h-\[(\d+(?:\.\d+)?)rem\]/g)) h = Math.max(h, Number(m[1]) * 16);
    return h;
}

/** Valeur brute de l'attribut `className` : la chaîne, ou le contenu de l'accolade fermée en équilibre. */
function valeurClassName(balise: string): string | null {
    const debut = balise.search(/\bclassName=/);
    if (debut < 0) return null;
    let i = debut + 'className='.length;
    const ouvrant = balise[i];
    if (ouvrant === '"' || ouvrant === "'") {
        const fin = balise.indexOf(ouvrant, i + 1);
        return fin < 0 ? null : balise.slice(i + 1, fin);
    }
    if (ouvrant !== '{') return null;
    let profondeur = 0;
    let guillemet: string | null = null;
    for (let k = i; k < balise.length; k++) {
        const c = balise[k];
        if (guillemet) {
            if (c === '\\') k++;
            else if (c === guillemet) guillemet = null;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') guillemet = c;
        else if (c === '{') profondeur++;
        else if (c === '}' && --profondeur === 0) return balise.slice(i + 1, k);
    }
    return null;
}

/**
 * Texte des classes d'une balise ouvrante : le littéral ou le gabarit tel quel (le contenu des `${}`
 * est conservé), plus la définition de chaque constante du fichier qu'il nomme (`const champ = '…'`).
 */
function classesDeLaBalise(balise: string, fichier: string): string {
    const brut = valeurClassName(balise);
    if (brut === null) return '';
    const texte: string[] = [brut];
    for (const id of brut.matchAll(/\b([A-Za-z_]\w*)\b/g)) {
        const def = fichier.match(new RegExp(`\\bconst\\s+${id[1]}\\b[^=\\n]*=\\s*(?:"([^"]*)"|'([^']*)'|\`((?:[^\`\\\\]|\\\\.)*)\`)`));
        if (def) texte.push(def[1] ?? def[2] ?? def[3] ?? '');
    }
    return texte.join(' ');
}

interface Controle { chemin: string; ligne: number; balise: string; hauteur: number }

function controlesDe(code: string, chemin: string): Controle[] {
    const out: Controle[] = [];
    for (const m of code.matchAll(/<(button|input|select|textarea)(?=[\s/>])/g)) {
        const debut = m.index ?? 0;
        const fin = finBaliseOuvrante(code, debut);
        if (fin < 0) continue;
        const balise = code.slice(debut, fin + 1);
        const type = balise.match(/\btype=(?:"([^"]*)"|'([^']*)')/);
        if (m[1] === 'input' && type && TYPES_EXCLUS.has(type[1] ?? type[2])) continue;
        out.push({
            chemin,
            ligne: code.slice(0, debut).split('\n').length,
            balise: m[1],
            hauteur: hauteurEtablie(classesDeLaBalise(balise, code)),
        });
    }
    return out;
}

function mesurer(): { tous: Controle[]; nonEtablis: Controle[] } {
    const tous = fichiersTsx(racine).flatMap((f) => controlesDe(lireCode(f), f.replace(`${cwdPosix()}/`, '')));
    return { tous, nonEtablis: tous.filter((c) => c.hauteur < 44) };
}

describe('[A11Y-CIBLES-44-CLIQUET] hauteur de 44 px des contrôles', () => {
    it('le recenseur lit ce qu\'il croit lire (anti-vacuité, témoins nommés)', () => {
        const { tous } = mesurer();
        expect(tous.length, 'trop peu de contrôles reconnus → le scan ne lit plus components/').toBeGreaterThan(400);
        // Témoin positif : les champs du formulaire de dette portent `touch-target` (#1101).
        const dette = tous.filter((c) => c.chemin.endsWith('components/DebtManager.tsx'));
        expect(dette.filter((c) => c.balise === 'input' && c.hauteur >= 44).length).toBeGreaterThanOrEqual(4);
        // Témoin négatif : le scan sait aussi voir un contrôle SANS la marque.
        expect(tous.some((c) => c.hauteur < 44)).toBe(true);
    });

    it('lit les formes de classes du dépôt (littéral, gabarit, constante du fichier, syntaxe arbitraire)', () => {
        expect(hauteurEtablie('touch-target')).toBe(44);
        expect(hauteurEtablie('min-h-11 px-3')).toBe(44);
        expect(hauteurEtablie('h-12 w-full')).toBe(48);
        expect(hauteurEtablie('h-[44px] w-full')).toBe(44);
        expect(hauteurEtablie('min-h-[2.75rem]')).toBe(44);
        expect(hauteurEtablie('size-11')).toBe(44);
        // Sous 44, ou une valeur qui n'est pas une hauteur : rien d'établi.
        expect(hauteurEtablie('h-10 px-3')).toBe(40);
        expect(hauteurEtablie('max-h-60 w-11 lg:h-full')).toBe(0);
        expect(hauteurEtablie('py-3 text-body')).toBe(0);
        // Un nom qui CONTIENT `touch-target` sans l'être ne compte pas.
        expect(hauteurEtablie('no-touch-targets')).toBe(0);
        const src = "const champ = 'min-h-11 rounded';\n<input className={champ} />\n<input className={`${champ} mt-2`} />\n<input className=\"h-9\" />";
        expect(controlesDe(src, 'x.tsx').map((c) => c.hauteur)).toEqual([44, 44, 36]);
    });

    it('exclut les cases, boutons radio, curseurs et champs cachés, mais pas les champs de texte', () => {
        const src = '<input type="checkbox" /><input type="radio" /><input type="range" /><input type="hidden" /><input type="file" /><input type="number" className="h-9" /><button className="p-1">x</button><select className="h-11"></select><textarea />';
        expect(controlesDe(src, 'x.tsx').map((c) => `${c.balise}:${c.hauteur}`)).toEqual(['input:36', 'button:0', 'select:44', 'textarea:0']);
    });

    it('trouve la fin d\'une balise malgré une flèche ou un gabarit dans un attribut', () => {
        const src = '<button onClick={() => { a(); }} className={`h-11 ${x ? "a" : "b"}`}>Ok</button>';
        expect(controlesDe(src, 'x.tsx').map((c) => c.hauteur)).toEqual([44]);
    });

    it('l\'écran Dettes (formulaire et liste) n\'a aucun contrôle sous 44 px', () => {
        // #1101 a porté le formulaire à 44 px ; le lot #1151 a repris les trois boutons de l'écran
        // (Ajouter, Modifier, Supprimer) qui restaient à 40 px et ≈ 16 px de haut.
        const fautifs = mesurer().nonEtablis.filter((c) => ZERO.test(c.chemin)).map((c) => `${c.chemin}:${c.ligne} <${c.balise}>`);
        expect(fautifs, `Contrôle(s) de l'écran Dettes sans hauteur de 44 px :\n${fautifs.join('\n')}`).toEqual([]);
    });

    it('le cliquet : le compte ne monte pas, et il se resserre quand il baisse', () => {
        const { nonEtablis } = mesurer();
        const parFichier = new Map<string, number>();
        for (const c of nonEtablis) parFichier.set(c.chemin, (parFichier.get(c.chemin) ?? 0) + 1);
        const pires = [...parFichier.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, n]) => `${n} ${f}`).join('\n');
        expect(
            nonEtablis.length,
            `${nonEtablis.length} contrôles sans hauteur de 44 px établie (plafond ${PLAFOND}). `
            + `Un nouveau contrôle doit porter \`touch-target\` (ou h-11 et plus). Les plus chargés :\n${pires}`,
        ).toBeLessThanOrEqual(PLAFOND);
        // Le sens inverse : une dette soldée se constate, le plafond se resserre (jamais l'inverse).
        expect(nonEtablis.length, `le compte est tombé à ${nonEtablis.length} : resserrer PLAFOND à cette valeur.`).toBeGreaterThanOrEqual(PLAFOND);
    });
});
