// [SOCLE-VISUEL-1] Verrou du socle visuel commun des apps du hub (MoKarade/app-template, tâche #39),
// tranche 1 de FinanceAI#1176 (#1212).
//
// Trois choses, dans l'ordre où elles protègent :
//   1. les variables du socle existent dans `index.css`, avec les valeurs sombres de FinanceAI
//      (alignées sur `tailwind.config.js`, pour que poser les variables ne change aucun pixel) ;
//   2. les couples texte/fond lisibles au sens WCAG (4,5:1 pour du texte, 3:1 pour un contour de champ) ;
//   3. un CLIQUET sur les couleurs écrites en dur dans `components/` et `App.tsx` : classes de palette
//      numérotées (`text-slate-400`), `white`/`black` de Tailwind (`border-white/10`) et hex. Elles
//      migrent vers les variables écran par écran (tâche #1176) ; ce compte ne doit plus monter.
//
// ⚠️ Le cliquet mesure le CODE (commentaires blanchis), pas la vue rendue : une couleur construite par
// concaténation échappe au scan. Il sous-estime donc, et c'est assumé : il empêche d'AJOUTER des
// couleurs en dur de la forme courante, il ne prouve pas que tout est migré.
//
// ⚠️ Il échoue aussi quand le compte BAISSE sous le plafond : il demande alors de resserrer la
// constante (`PLAFOND_*`), seule valeur à changer — jamais à relever sans décision de Marc.
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { toPosix } from '../helpers/toPosix';
import { stripComments, partDeCodeRestante } from '../../utils/stripComments';

const racine = process.cwd();
const css = readFileSync(resolve(racine, 'index.css'), 'utf8');
const configTailwind = readFileSync(resolve(racine, 'tailwind.config.js'), 'utf8');

/**
 * Valeurs MESURÉES le 2026-10-24 sur `origin/main` + le groupe 5 (réglages Sauvegarde, Drive et
 * configuration migrés, après Patrimoine/Budget/Système, Futur, configurateur immobilier et paramètres avancés, Placements, Transactions
 * et le groupe 2 ; départ du 2026-10-17 : 439 / 1 305 / 220). Ne se relèvent pas sans décision de Marc ; se resserrent à chaque
 * écran migré. Restent en dur : les palettes des graphiques (courbes, légendes, jalons).
 */
const PLAFOND_PALETTE = 238;
const PLAFOND_BLANC_NOIR = 838;
const PLAFOND_HEX = 208;

const VARIABLES = [
    '--fond', '--surface', '--surface-douce', '--bordure', '--bordure-champ',
    '--texte', '--texte-doux', '--accent', '--accent-fonce', '--sur-accent', '--repere', '--repere-doux',
    '--succes-fond', '--succes-texte', '--alerte-fond', '--alerte-texte', '--erreur-fond', '--erreur-texte',
] as const;

/** Valeur d'une variable : la dernière déclaration du fichier, en minuscules. */
function variable(nom: string): string | null {
    const trouvees = [...css.matchAll(new RegExp(`${nom}\\s*:\\s*(#[0-9a-fA-F]{3,8})\\s*;`, 'g'))];
    return trouvees.length ? trouvees[trouvees.length - 1][1].toLowerCase() : null;
}

function luminance(hex: string): number {
    const h = hex.replace('#', '');
    const canal = (i: number): number => {
        const c = parseInt(h.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
}

function contraste(a: string, b: string): number {
    const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (clair + 0.05) / (sombre + 0.05);
}

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

const FAMILLES = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const UTILITAIRES = 'bg|text|border|ring|fill|stroke|from|to|via|divide|outline|shadow|decoration|accent|caret|placeholder';
/** `text-slate-400`, `hover:bg-emerald-500/20`… (préfixes de variante compris). */
const RE_PALETTE = new RegExp(`(?<![\\w-])(?:[a-z0-9-]+:)*(?:${UTILITAIRES})-(?:${FAMILLES})-\\d{2,3}(?![\\w-])`, 'g');
/** `bg-white`, `border-white/10`, `text-black`… : le blanc et le noir de Tailwind, pas un jeton du socle. */
const RE_BLANC_NOIR = new RegExp(`(?<![\\w-])(?:[a-z0-9-]+:)*(?:${UTILITAIRES})-(?:white|black)(?![\\w-])`, 'g');
/** Couleur hex dans le code (3, 6 ou 8 chiffres), hors ancre d'URL ou entité (`&#39;`). */
const RE_HEX = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w-])/g;

function mesurer(): { palette: number; blancNoir: number; hex: number; fichiers: number } {
    const fichiers = [...fichiersTsx(resolve(racine, 'components')), toPosix(resolve(racine, 'App.tsx'))];
    let palette = 0;
    let blancNoir = 0;
    let hex = 0;
    for (const f of fichiers) {
        const code = lireCode(f);
        palette += (code.match(RE_PALETTE) ?? []).length;
        blancNoir += (code.match(RE_BLANC_NOIR) ?? []).length;
        hex += (code.match(RE_HEX) ?? []).length;
    }
    return { palette, blancNoir, hex, fichiers: fichiers.length };
}

describe('[SOCLE-VISUEL-1] variables du socle visuel', () => {
    it.each(VARIABLES)('%s est définie dans index.css', (nom) => {
        expect(variable(nom), `${nom} manque dans index.css`).not.toBeNull();
    });

    it('les valeurs sombres reprennent celles de tailwind.config.js (poser les variables ne change aucun pixel)', () => {
        expect(configTailwind).toMatch(/dark:\s*'#07090D'/i);
        expect(variable('--fond')).toBe('#07090d');
        expect(configTailwind).toMatch(/surface:\s*'#0E1014'/i);
        expect(variable('--surface')).toBe('#0e1014');
        expect(configTailwind).toMatch(/surfaceHighlight:\s*'#15181E'/i);
        expect(variable('--surface-douce')).toBe('#15181e');
        expect(configTailwind).toMatch(/primary:\s*'#e6eaf2'/i);
        expect(variable('--accent')).toBe('#e6eaf2');
    });

    it('les couples texte/fond tiennent 4,5:1 (WCAG 1.4.3) et le contour de champ 3:1 (WCAG 1.4.11)', () => {
        const v = (n: string): string => variable(n) ?? '';
        const couples: Array<[string, string]> = [
            ['--texte', '--fond'], ['--texte', '--surface'], ['--texte', '--surface-douce'],
            ['--texte-doux', '--fond'], ['--texte-doux', '--surface'], ['--texte-doux', '--surface-douce'],
            ['--sur-accent', '--accent'], ['--sur-accent', '--accent-fonce'],
            ['--repere', '--fond'], ['--repere', '--repere-doux'],
            ['--succes-texte', '--succes-fond'], ['--alerte-texte', '--alerte-fond'], ['--erreur-texte', '--erreur-fond'],
        ];
        for (const [texte, fond] of couples) {
            expect(contraste(v(texte), v(fond)), `${texte} sur ${fond}`).toBeGreaterThanOrEqual(4.5);
        }
        for (const fond of ['--fond', '--surface', '--surface-douce']) {
            expect(contraste(v('--bordure-champ'), v(fond)), `--bordure-champ sur ${fond}`).toBeGreaterThanOrEqual(3);
        }
    });

    it('le calcul de contraste est juste (témoins : noir/blanc = 21, identiques = 1)', () => {
        expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 5);
        expect(contraste('#777777', '#777777')).toBeCloseTo(1, 5);
        expect(contraste('#777777', '#ffffff')).toBeLessThan(4.5);
    });
});

describe('[SOCLE-VISUEL-1] jetons Tailwind du socle', () => {
    it.each(VARIABLES.filter((nom) => nom !== '--surface'))('%s est lisible par les écrans (jeton Tailwind → var(%s))', (nom) => {
        const jeton = nom.slice(2);
        expect(configTailwind, `${jeton} manque dans tailwind.config.js`).toMatch(new RegExp(`['"]?${jeton}['"]?:\\s*'var\\(${nom}\\)'`));
    });
});

describe('[SOCLE-VISUEL-1] cliquet des couleurs écrites en dur', () => {
    it('les motifs reconnaissent ce qu\'ils doivent (anti-vacuité) et rien de plus', () => {
        // Classes assemblées à l'exécution : écrites en clair, Tailwind (qui lit aussi les tests) les émettrait.
        const c = (...morceaux: string[]): string => morceaux.join('-');
        const palette = [c('text', 'slate', '400'), c('hover:bg', 'emerald', '500/20'), c('border', 'red', '900')].join(' ');
        expect(palette.match(RE_PALETTE)).toHaveLength(3);
        expect([c('text', 'ink'), c('bg', 'surface'), c('border', 'border'), c('text', 'danger'), c('bg', 'dark')].join(' ').match(RE_PALETTE)).toBeNull();
        expect([c('bg', 'white/5'), c('border', 'white/10'), c('text', 'white'), c('md:bg', 'black')].join(' ').match(RE_BLANC_NOIR)).toHaveLength(4);
        expect([c('text', 'white', 'space'), c('bg', 'whiteboard')].join(' ').match(RE_BLANC_NOIR)).toBeNull();
        expect('fill="#fff" stroke="#e6eaf2" c="#e6eaf2cc"'.match(RE_HEX)).toHaveLength(3);
        expect('&#39; href="#section" id="a#b"'.match(RE_HEX)).toBeNull();
    });

    const { palette, blancNoir, hex, fichiers } = mesurer();

    it('le scan lit bien components/ et App.tsx (témoin de volume)', () => {
        expect(fichiers).toBeGreaterThan(150);
        expect(palette + blancNoir + hex, 'aucune couleur en dur reconnue → le scan ne lit plus rien').toBeGreaterThan(0);
    });

    it.each([
        ['classes de palette numérotées', palette, PLAFOND_PALETTE],
        ['white/black de Tailwind', blancNoir, PLAFOND_BLANC_NOIR],
        ['couleurs hex', hex, PLAFOND_HEX],
    ] as const)('%s : le compte ne monte pas, et le plafond suit quand il baisse', (nom, compte, plafond) => {
        expect(compte, `${nom} : ${compte} > plafond ${plafond}. Utiliser une variable du socle (index.css).`).toBeLessThanOrEqual(plafond);
        expect(compte, `${nom} : ${compte} < plafond ${plafond}. Bravo : resserrer la constante PLAFOND_* à ${compte}.`).toBe(plafond);
    });
});
