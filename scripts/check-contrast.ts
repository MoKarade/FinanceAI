#!/usr/bin/env tsx
// Script CLI : la sortie console est volontaire.
/* eslint-disable no-console */
/**
 * §7.D.1 — Audit WCAG AA contrast pour les tokens sémantiques.
 *
 * Lit les couleurs définies dans tailwind.config.js et calcule le ratio de
 * contraste WCAG entre chaque combinaison `text-{color}` × `bg-{surface}`.
 *
 * WCAG AA :
 *  - texte normal (≥ 14px) : ratio ≥ 4.5
 *  - texte large (≥ 18px ou ≥ 14px bold) : ratio ≥ 3.0
 *
 * Output : table Markdown des combos non-conformes.
 *
 * Run : `npx tsx scripts/check-contrast.ts`
 */

// [A11Y-CHECK-CONTRAST-DRIFT 2026-07-16] Les tokens sont LUS depuis tailwind.config.js (source unique) au
// lieu d'être re-codés en dur ici — sinon ils DÉRIVENT en silence (vu : `surface #151922` au lieu de
// `#0E1014`, `primary #10b981` au lieu de `#e6eaf2`) et le script « teste » des combos qui n'existent plus
// (protection nulle). On ne teste que les valeurs HEX opaques : les tokens `rgba(...)` (bg/border
// translucides) exigeraient une composition sur le fond sous-jacent (hors périmètre de ce contrôle).
import twConfig from '../tailwind.config.js';

const COLORS = (twConfig as { theme?: { extend?: { colors?: Record<string, unknown> } } })?.theme?.extend?.colors ?? {};

/** Vrai si une valeur de token est une couleur HEX opaque (`#rrggbb`) — seul cas testable ici. */
function isOpaqueHex(v: unknown): v is string {
    return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}

// Clés servant de FOND (surfaces) : exclues de l'ensemble « texte » (tester « surface sur surface » = bruit à 1.00).
const BG_KEYS = ['dark', 'surface', 'surfaceHighlight'] as const;

// --- Surfaces de fond utilisées dans l'app (lues depuis la config) ---
const BACKGROUNDS: Record<string, string> = {};
for (const [name, key] of [['dark (page)', 'dark'], ['surface (card)', 'surface'], ['surfaceHighlight', 'surfaceHighlight']] as const) {
    const v = COLORS[key];
    if (isOpaqueHex(v)) BACKGROUNDS[name] = v;
}

// --- Couleurs de texte testées : tokens plats (primary/secondary) + échelles numériques (ink/success/…) ---
const TEXT_COLORS: Record<string, string> = {};
for (const [key, val] of Object.entries(COLORS)) {
    if ((BG_KEYS as readonly string[]).includes(key)) continue; // les surfaces ne sont pas du texte
    if (isOpaqueHex(val)) {
        TEXT_COLORS[key] = val; // token plat : primary, secondary…
    } else if (val && typeof val === 'object') {
        for (const [shade, shadeVal] of Object.entries(val as Record<string, unknown>)) {
            if (isOpaqueHex(shadeVal)) TEXT_COLORS[`${key}-${shade}`] = shadeVal; // ex. ink-400, success-500
        }
    }
}

// Garde-fou anti-scan-vide (cf leçon FISC-CONST-LINT) : un import cassé/refactor de la config donnerait
// des tables vides → le script « passe » sans rien tester. On exige un volume plancher plausible.
if (Object.keys(BACKGROUNDS).length < 3 || Object.keys(TEXT_COLORS).length < 8) {
    console.error(`check-contrast: tokens introuvables dans tailwind.config.js (bg=${Object.keys(BACKGROUNDS).length}, text=${Object.keys(TEXT_COLORS).length}) — l'import a-t-il changé ?`);
    process.exit(2);
}

// --- WCAG contrast calculation ---
function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return [r, g, b];
}

function luminance([r, g, b]: [number, number, number]): number {
    const channel = (c: number): number => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(fg: string, bg: string): number {
    const lf = luminance(hexToRgb(fg));
    const lb = luminance(hexToRgb(bg));
    const lighter = Math.max(lf, lb);
    const darker = Math.min(lf, lb);
    return (lighter + 0.05) / (darker + 0.05);
}

// --- Audit ---
type Result = {
    text: string;
    background: string;
    ratio: number;
    aa_normal: boolean;
    aa_large: boolean;
};

const results: Result[] = [];

for (const [textName, textHex] of Object.entries(TEXT_COLORS)) {
    for (const [bgName, bgHex] of Object.entries(BACKGROUNDS)) {
        const ratio = contrastRatio(textHex, bgHex);
        results.push({
            text: textName,
            background: bgName,
            ratio,
            aa_normal: ratio >= 4.5,
            aa_large: ratio >= 3.0,
        });
    }
}

// --- Output ---
const failures = results.filter(r => !r.aa_normal);
const largeOnly = results.filter(r => !r.aa_normal && r.aa_large);
const total = results.length;

console.log('# WCAG AA Contrast Audit (Phase 7.D.1)\n');
console.log(`Tokens testés : ${Object.keys(TEXT_COLORS).length} text × ${Object.keys(BACKGROUNDS).length} bg = ${total} combinaisons.\n`);
console.log(`- ✅ Conformes AA texte normal (≥ 4.5) : ${total - failures.length} / ${total}`);
console.log(`- ⚠️  Conformes uniquement texte large (≥ 3.0) : ${largeOnly.length}`);
console.log(`- ❌ Non conformes du tout : ${failures.length - largeOnly.length}\n`);

console.log('## Détail des échecs AA texte normal\n');
console.log('| Text | Background | Ratio | AA normal | AA large |');
console.log('|---|---|---|---|---|');
failures
    .sort((a, b) => a.ratio - b.ratio)
    .forEach(r => {
        const aa = r.aa_normal ? '✅' : '❌';
        const large = r.aa_large ? '✅' : '❌';
        console.log(`| ${r.text} | ${r.background} | ${r.ratio.toFixed(2)} | ${aa} | ${large} |`);
    });

// ─────────────────────────────────────────────────────────────────────────────
// [A11Y-CONTRAST-TOOL-GAP-CTA] Deuxième passe : les CTA PLEINS (`bg-{couleur}-{shade}` + `text-…`).
//
// Trou de couverture de l'outil-arbitre, pas un échec constaté : la passe ci-dessus ne teste que
// `text-*` sur les TROIS fonds de page. Un bouton plein (`bg-danger-600` + `text-white`) n'y
// apparaît jamais — or c'est précisément une combinaison où le contraste peut échouer, et on ne
// juge pas un contraste à l'œil.
//
// ⚠️ Les paires sont EXTRAITES DU CODE PEINT, jamais devinées : une liste écrite à la main
// « teste » des combinaisons qui n'existent plus et rate celles qu'on vient d'ajouter — exactement
// le défaut que l'en-tête de ce fichier décrit pour les tokens (`A11Y-CHECK-CONTRAST-DRIFT`).
//
// ⚠️ ANGLE MORT ASSUMÉ, déclaré ici plutôt que découvert plus tard : seuls les `className="…"`
// LITTÉRAUX sont lus. Une classe construite par interpolation (`` className={`bg-${v}-600`} ``) ou
// par une fonction utilitaire échappe à ce scan. Le compteur plancher ci-dessous garantit qu'on
// trouve quand même un volume plausible ; il ne garantit pas l'exhaustivité, et prétendre le
// contraire serait pire que le trou lui-même.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// `__dirname` n'existe PAS en module ES (ce dépôt est `"type": "module"`) — il faut le dériver de
// `import.meta.url`. Erreur commise ici en écrivant cette passe, attrapée en rejouant l'outil.
const ICI = dirname(fileURLToPath(import.meta.url));

/** Marche récursive — `readdirSync(recursive)` (Node 18.17+), patron déjà employé par les gardes du
 *  dépôt et dont la compatibilité est prouvée par la CI (cf. GATE-LOCAL-VERT-CI-ROUGE-PAR-VERSION-DE-NODE). */
function fichiersTsx(racine: string): string[] {
    try {
        if (!statSync(racine).isDirectory()) return [];
    } catch { return []; }
    return readdirSync(racine, { recursive: true })
        .map((f) => String(f))
        .filter((f) => f.endsWith('.tsx'))
        .map((f) => join(racine, f));
}

/** Résout un nom de classe Tailwind (`danger-600`, `white`, `ink-100`) en HEX opaque, ou null. */
function hexDeClasse(nom: string): string | null {
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

const CTA_PAIRES = new Map<string, { bg: string; text: string; bgHex: string; textHex: string }>();
let attributsLus = 0;
for (const fichier of fichiersTsx(join(ICI, '..', 'components'))) {
    const src = readFileSync(fichier, 'utf8');
    for (const m of src.matchAll(/className="([^"]*)"/g)) {
        attributsLus++;
        const classes = m[1].split(/\s+/);
        // Fond PLEIN uniquement : un `bg-…/10` (translucide) exigerait une composition sur le fond
        // sous-jacent, hors périmètre de ce contrôle (même règle que les tokens `rgba(...)`).
        const bg = classes.find((c) => /^bg-[a-z]+-\d{3}$/.test(c));
        const text = classes.find((c) => /^text-(white|black|[a-z]+-\d{2,3})$/.test(c));
        if (!bg || !text) continue;
        const bgNom = bg.slice(3);
        const textNom = text.slice(5);
        const bgHex = hexDeClasse(bgNom);
        const textHex = hexDeClasse(textNom);
        if (!bgHex || !textHex) continue;
        CTA_PAIRES.set(`${bg}|${text}`, { bg, text, bgHex, textHex });
    }
}

// Anti-vacuité : sans ce plancher, un motif cassé ou un déplacement de `components/` rendrait la
// passe VIDE et donc « verte » — le mode de panne exact que ce lot corrige ailleurs.
if (attributsLus < 200 || CTA_PAIRES.size < 5) {
    console.error(`check-contrast: passe CTA quasi vide (attributs=${attributsLus}, paires=${CTA_PAIRES.size}) — le scan a-t-il cassé ?`);
    process.exit(2);
}

const ctaResults: Result[] = [...CTA_PAIRES.values()].map(({ bg, text, bgHex, textHex }) => {
    const ratio = contrastRatio(textHex, bgHex);
    return { text, background: bg, ratio, aa_normal: ratio >= 4.5, aa_large: ratio >= 3.0 };
});

console.log(`\n## CTA pleins (${ctaResults.length} paires extraites de ${attributsLus} attributs className littéraux)\n`);
console.log('| Texte | Fond | Ratio | AA normal | AA large |');
console.log('|---|---|---|---|---|');
ctaResults
    .sort((a, b) => a.ratio - b.ratio)
    .forEach(r => {
        console.log(`| ${r.text} | ${r.background} | ${r.ratio.toFixed(2)} | ${r.aa_normal ? '✅' : '❌'} | ${r.aa_large ? '✅' : '❌'} |`);
    });

const ctaFailures = ctaResults.filter(r => !r.aa_normal);
console.log(`\n- CTA conformes AA texte normal : ${ctaResults.length - ctaFailures.length} / ${ctaResults.length}`);

// ⚠️ Cette passe RAPPORTE mais ne fait PAS échouer le script — choix assumé et daté, pas un oubli.
// En l'étendant (2026-08-21) elle a révélé 4 offenders PRÉEXISTANTS, dont `text-white` sur
// `bg-warning-500` à 2,15 (sous le seuil même pour du texte large). Les rendre bloquants tout de
// suite livrerait un outil ROUGE dès sa première exécution, ce qui apprend à ignorer sa sortie —
// et corriger 4 couleurs de bouton est une décision d'APPARENCE qui appartient à Marc, pas un
// correctif mécanique. Les offenders sont routés en `[A11Y-CTA-CONTRASTE-OFFENDERS]`, dont la
// dernière étape est précisément de basculer ce bloc en `process.exit(1)`.
if (ctaFailures.length > 0) {
    console.log(`  ⚠️  ${ctaFailures.length} CTA sous le seuil AA — voir [A11Y-CTA-CONTRASTE-OFFENDERS] (non bloquant pour l'instant).`);
}

console.log('\n## Tous les ratios\n');
console.log('| Text | Background | Ratio | AA normal | AA large |');
console.log('|---|---|---|---|---|');
results
    .sort((a, b) => b.ratio - a.ratio)
    .forEach(r => {
        const aa = r.aa_normal ? '✅' : '❌';
        const large = r.aa_large ? '✅' : '❌';
        console.log(`| ${r.text} | ${r.background} | ${r.ratio.toFixed(2)} | ${aa} | ${large} |`);
    });

// Exit code : 0 si aucun échec AA normal sur ink-100/ink-200 (texte body principal)
const criticalFailures = failures.filter(r =>
    ['ink-50', 'ink-100', 'ink-200', 'ink-300'].includes(r.text)
);
process.exit(criticalFailures.length > 0 ? 1 : 0);
