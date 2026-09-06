/**
 * Source unique de la passe « CTA pleins » du contrôle de contraste WCAG.
 *
 * Partagée par le script CLI (`scripts/check-contrast.ts`) et la garde Vitest
 * (`tests/a11y/ctaContrast.test.ts`) : re-coder l'extraction ou les couleurs dans la garde
 * la ferait DÉRIVER en silence par rapport à l'outil (leçon `A11Y-CHECK-CONTRAST-DRIFT`).
 *
 * ⚠️ ANGLE MORT ASSUMÉ : seuls les `className="…"` LITTÉRAUX sont lus. Une classe construite
 * par interpolation (`` className={`bg-${v}-600`} ``) ou par une fonction utilitaire échappe
 * à ce scan. Les plancher anti-vacuité garantissent un volume plausible, pas l'exhaustivité.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import twConfig from '../../tailwind.config.js';
// [A11Y-CONTRAST-ANGLE-MORT-541] (lot 208) La palette Tailwind PAR DÉFAUT (`text-green-400`, `bg-indigo-600`…)
// est lue depuis le paquet lui-même (`tailwindcss/colors`, source unique de ces hex) — 539 occurrences dans
// 70 fichiers de `components/` n'étaient vues par AUCUNE passe : le résolveur ne connaissait que les tokens
// du projet, donc un bouton `bg-green-600 text-white` (3,30) n'était jamais une « paire ».
import twColors from 'tailwindcss/colors';

/** WCAG AA — texte normal (< 18px, ou < 14px bold). */
export const SEUIL_AA_NORMAL = 4.5;
/** WCAG AA — texte large (≥ 18px, ou ≥ 14px bold). */
export const SEUIL_AA_LARGE = 3.0;

const COLORS = (twConfig as { theme?: { extend?: { colors?: Record<string, unknown> } } })?.theme?.extend?.colors ?? {};

/** Vrai si une valeur de token est une couleur HEX opaque (`#rrggbb`) — seul cas testable ici. */
export function isOpaqueHex(v: unknown): v is string {
    return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function luminance([r, g, b]: [number, number, number]): number {
    const channel = (c: number): number => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(fg: string, bg: string): number {
    const lf = luminance(hexToRgb(fg));
    const lb = luminance(hexToRgb(bg));
    return (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
}

const PALETTE_DEFAUT = twColors as unknown as Record<string, unknown>;

/** Vrai si la famille de couleur (`green`, `indigo`…) vient de la palette Tailwind PAR DÉFAUT, pas des tokens du projet. */
export function estFamilleParDefaut(nom: string): boolean {
    const sep = nom.lastIndexOf('-');
    const famille = sep > 0 ? nom.slice(0, sep) : nom;
    return !(famille in COLORS) && typeof PALETTE_DEFAUT[famille] === 'object';
}

/** Résout un nom de classe Tailwind (`danger-600`, `white`, `dark`, `ink-100`, `green-600`) en HEX opaque, ou null.
 *  Tokens du projet D'ABORD (ils peuvent redéfinir une famille), palette Tailwind par défaut ENSUITE. */
export function hexDeClasse(nom: string): string | null {
    if (nom === 'white') return '#ffffff';
    if (nom === 'black') return '#000000';
    const plat = COLORS[nom];
    if (isOpaqueHex(plat)) return plat;
    const sep = nom.lastIndexOf('-');
    if (sep <= 0) return null;
    const cle = nom.slice(0, sep);
    const shade = nom.slice(sep + 1);
    for (const famille of [COLORS[cle], PALETTE_DEFAUT[cle]]) {
        if (famille && typeof famille === 'object') {
            const v = (famille as Record<string, unknown>)[shade];
            if (isOpaqueHex(v)) return v;
        }
    }
    return null;
}

type PaireCta = { bg: string; text: string; bgHex: string; textHex: string; ratio: number; sites: string[] };

/** Marche récursive — `readdirSync(recursive)` (Node 18.17+), patron déjà employé par les gardes du dépôt. */
function fichiersTsx(racine: string): string[] {
    try {
        if (!statSync(racine).isDirectory()) return [];
    } catch { return []; }
    return readdirSync(racine, { recursive: true })
        .map((f) => String(f))
        .filter((f) => f.endsWith('.tsx'))
        .map((f) => join(racine, f));
}

const RACINE_DEPOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * ⚠️ On prend la première classe qui RÉSOUT en couleur, pas la première qui MATCHE la forme :
 * `text-meta` / `text-body` sont des tailles de police (`fontSize`) et matchent la même forme que
 * `text-dark`. La version « première qui matche » rendait invisibles tous les boutons écrits
 * `text-meta … bg-warning-600 text-white` — le scan se croyait complet en ratant des offenders.
 */
function premiereCouleur(classes: string[], prefixe: 'bg-' | 'text-'): { nom: string; hex: string } | null {
    for (const c of classes) {
        if (!c.startsWith(prefixe)) continue;
        const nom = c.slice(prefixe.length);
        // Fond PLEIN uniquement : un `bg-…/10` (translucide) exigerait une composition sur le fond
        // sous-jacent, hors périmètre de ce contrôle (même règle que les tokens `rgba(...)`).
        if (prefixe === 'bg-' && !/^[a-z]+-\d{3}$/.test(nom)) continue;
        if (prefixe === 'text-' && !/^([a-z]+|[a-z]+-\d{2,3})$/.test(nom)) continue;
        const hex = hexDeClasse(nom);
        if (hex) return { nom: c, hex };
    }
    return null;
}

/**
 * Fonds de SURVOL (`hover:bg-danger-700`). WCAG 1.4.3 ne connaît pas d'exemption « état
 * survolé » : un bouton lisible au repos et illisible au survol reste non conforme. Ne lire
 * que le fond de repos laissait passer `DebtManager` (blanc sur `danger-600`, survol
 * `danger-500` à 3,76) — l'outil se croyait complet en ratant la moitié des états.
 */
function fondsDeSurvol(classes: string[]): { nom: string; hex: string }[] {
    const trouves: { nom: string; hex: string }[] = [];
    for (const c of classes) {
        if (!c.startsWith('hover:bg-')) continue;
        const nom = c.slice('hover:bg-'.length);
        if (!/^[a-z]+-\d{3}$/.test(nom)) continue;
        const hex = hexDeClasse(nom);
        if (hex) trouves.push({ nom: c, hex });
    }
    return trouves;
}

/** Extrait du CODE PEINT les paires « fond plein × couleur de texte », jamais devinées. */
export function extraireCtaPaires(racines: string[] = [join(RACINE_DEPOT, 'components')]): {
    paires: PaireCta[];
    attributsLus: number;
} {
    const parCle = new Map<string, PaireCta>();
    let attributsLus = 0;
    for (const racine of racines) {
        for (const fichier of fichiersTsx(racine)) {
            const src = readFileSync(fichier, 'utf8');
            for (const m of src.matchAll(/className="([^"]*)"/g)) {
                attributsLus++;
                const classes = m[1].split(/\s+/);
                const repos = premiereCouleur(classes, 'bg-');
                const text = premiereCouleur(classes, 'text-');
                const survols = fondsDeSurvol(classes);
                // [lot 208] Un bouton au repos TRANSLUCIDE (`bg-violet-600/20`) et au survol PLEIN (`hover:bg-violet-600`)
                // n'a pas de fond de repos mesurable, mais son survol l'est : `continue` ici le rendait invisible en
                // entier (mesuré sur `Investments.tsx`).
                if (!text || (!repos && survols.length === 0)) continue;
                // [lot 208] Au survol, c'est le texte de SURVOL qui compte quand il existe : `text-violet-300 …
                // hover:bg-violet-600 hover:text-white` est lisible (blanc sur violet-600 = 5,70) ; apparier le
                // texte de REPOS au fond de survol fabriquait un faux offender (violet-300 sur violet-600 = 3,09).
                const survolTexte = premiereCouleur(classes.filter((c) => c.startsWith('hover:text-')).map((c) => c.slice('hover:'.length)), 'text-');
                const texteSurvol = survolTexte ? { nom: `hover:${survolTexte.nom}`, hex: survolTexte.hex } : text;
                const ligne = src.slice(0, m.index).split('\n').length;
                const site = `${fichier.slice(RACINE_DEPOT.length + 1)}:${ligne}`;
                const combos: ReadonlyArray<readonly [{ nom: string; hex: string }, { nom: string; hex: string }]> =
                    [...(repos ? [[repos, text] as const] : []), ...survols.map((b) => [b, texteSurvol] as const)];
                for (const [bg, txt] of combos) {
                    const text = txt;
                    const cle = `${bg.nom}|${text.nom}`;
                    const existante = parCle.get(cle);
                    if (existante) { existante.sites.push(site); continue; }
                    parCle.set(cle, {
                        bg: bg.nom, text: text.nom, bgHex: bg.hex, textHex: text.hex,
                        ratio: contrastRatio(text.hex, bg.hex), sites: [site],
                    });
                }
            }
        }
    }
    return { paires: [...parCle.values()], attributsLus };
}

export type PaireTexte = { text: string; bg: string; textHex: string; bgHex: string; ratio: number; sites: string[] };

/**
 * [A11Y-CONTRAST-ANGLE-MORT-541] (lot 208) Passe TEXTE de la palette par défaut : chaque `text-{famille}-{shade}`
 * Tailwind par défaut porté par un élément SANS fond opaque propre est supposé posé sur les fonds de page
 * (`dark`, `surface`, `surfaceHighlight`) — les tokens du projet, eux, sont déjà couverts par la première
 * passe du script. Un élément qui porte son propre fond (`bg-white`, `bg-green-600`, `bg-surface`…) n'est
 * PAS sur le fond de page : il relève de la passe CTA (mesuré : `bg-white text-rose-700` ressortait à 2,83
 * sur le fond de page alors qu'il vaut 5,9 sur son blanc).
 */
export function extraireTextePaires(racines: string[] = [join(RACINE_DEPOT, 'components')]): {
    paires: PaireTexte[];
    classesLues: number;
} {
    const fonds: Record<string, string> = {};
    for (const k of ['dark', 'surface', 'surfaceHighlight']) { const v = COLORS[k]; if (isOpaqueHex(v)) fonds[k] = v; }
    const parCle = new Map<string, PaireTexte>();
    let classesLues = 0;
    for (const racine of racines) {
        for (const fichier of fichiersTsx(racine)) {
            const src = readFileSync(fichier, 'utf8');
            for (const m of src.matchAll(/className="([^"]*)"/g)) {
                const classes = m[1].split(/\s+/);
                const fondPropre = classes.some((c) => /^bg-[a-z]+(-\d{2,3})?$/.test(c) && hexDeClasse(c.slice(3)) !== null);
                if (fondPropre) continue;
                for (const c of classes) {
                    const mm = /^text-([a-z]+-\d{2,3})$/.exec(c);
                    if (!mm || !estFamilleParDefaut(mm[1])) continue;
                    const hex = hexDeClasse(mm[1]);
                    if (!hex) continue;
                    classesLues++;
                    const ligne = src.slice(0, m.index).split('\n').length;
                    const site = `${fichier.slice(RACINE_DEPOT.length + 1)}:${ligne}`;
                    for (const [nomFond, hexFond] of Object.entries(fonds)) {
                        const cle = `${c}|${nomFond}`;
                        const existante = parCle.get(cle);
                        if (existante) { existante.sites.push(site); continue; }
                        parCle.set(cle, { text: c, bg: nomFond, textHex: hex, bgHex: hexFond, ratio: contrastRatio(hex, hexFond), sites: [site] });
                    }
                }
            }
        }
    }
    return { paires: [...parCle.values()], classesLues };
}
