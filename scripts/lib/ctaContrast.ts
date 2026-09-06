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

/** Résout un nom de classe Tailwind (`danger-600`, `white`, `dark`, `ink-100`) en HEX opaque, ou null. */
export function hexDeClasse(nom: string): string | null {
    if (nom === 'white') return '#ffffff';
    if (nom === 'black') return '#000000';
    const plat = COLORS[nom];
    if (isOpaqueHex(plat)) return plat;
    const sep = nom.lastIndexOf('-');
    if (sep <= 0) return null;
    const famille = COLORS[nom.slice(0, sep)];
    if (famille && typeof famille === 'object') {
        const v = (famille as Record<string, unknown>)[nom.slice(sep + 1)];
        if (isOpaqueHex(v)) return v;
    }
    return null;
}

export type PaireCta = { bg: string; text: string; bgHex: string; textHex: string; ratio: number; sites: string[] };

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
                if (!repos || !text) continue;
                const ligne = src.slice(0, m.index).split('\n').length;
                const site = `${fichier.slice(RACINE_DEPOT.length + 1)}:${ligne}`;
                for (const bg of [repos, ...fondsDeSurvol(classes)]) {
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
