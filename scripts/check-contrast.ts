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
import { contrastRatio, extraireCtaPaires, extraireTextePaires, isOpaqueHex, SEUIL_AA_LARGE, SEUIL_AA_NORMAL } from './lib/ctaContrast.ts';

const COLORS = (twConfig as { theme?: { extend?: { colors?: Record<string, unknown> } } })?.theme?.extend?.colors ?? {};

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

// Le calcul WCAG lui-même vit dans `scripts/lib/ctaContrast.ts` (source unique, partagée avec la garde).

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
            aa_normal: ratio >= SEUIL_AA_NORMAL,
            aa_large: ratio >= SEUIL_AA_LARGE,
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
// [A11Y-CONTRAST-TOOL-GAP-CTA] Deuxième passe : les CTA PLEINS (`bg-{couleur}-{shade}` + `text-…`),
// au repos ET au survol. La passe ci-dessus ne teste que `text-*` sur les TROIS fonds de page :
// un bouton plein (`bg-danger-600` + `text-white`) n'y apparaît jamais — or c'est précisément une
// combinaison où le contraste peut échouer, et on ne juge pas un contraste à l'oeil.
//
// L'extraction vit dans `scripts/lib/ctaContrast.ts` : elle est PARTAGÉE avec la garde Vitest
// `tests/a11y/ctaContrast.test.ts`, qui est le vrai point d'application (la CI lance `npm run test`,
// pas ce script). La dupliquer ici la ferait dériver en silence.
const { paires: ctaPaires, attributsLus } = extraireCtaPaires();

// Anti-vacuité : sans ce plancher, un motif cassé ou un déplacement de `components/` rendrait la
// passe VIDE et donc « verte » — le mode de panne exact que ce lot corrige ailleurs. Le plancher
// porte surtout sur les ATTRIBUTS LUS (3 494 aujourd'hui) : le nombre de paires DISTINCTES, lui,
// baisse légitimement quand on converge les teintes, comme ce lot vient de le faire (8 paires).
if (attributsLus < 200 || ctaPaires.length < 3) {
    console.error(`check-contrast: passe CTA quasi vide (attributs=${attributsLus}, paires=${ctaPaires.length}) — le scan a-t-il cassé ?`);
    process.exit(2);
}

const ctaResults: Result[] = ctaPaires.map((p) => ({
    text: p.text, background: p.bg, ratio: p.ratio,
    aa_normal: p.ratio >= SEUIL_AA_NORMAL, aa_large: p.ratio >= SEUIL_AA_LARGE,
}));

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

// [A11Y-CTA-CONTRASTE-OFFENDERS 2026-08-24] Cette passe est BLOQUANTE depuis que les 4 offenders
// qu'elle avait révélés sont corrigés (décision de Marc : corriger, pas tolérer). Elle ne l'était
// pas avant, volontairement : un outil ROUGE dès sa première exécution apprend à ignorer sa sortie.
if (ctaFailures.length > 0) {
    console.error(`\n❌ ${ctaFailures.length} CTA sous le seuil AA (${SEUIL_AA_NORMAL}) — corrige la teinte PAR MESURE (un shade hors palette est un no-op silencieux).`);
    ctaFailures.forEach(r => console.error(`   ${r.text} sur ${r.background} : ${r.ratio.toFixed(2)}`));
    process.exit(1);
}

// [A11Y-CONTRAST-ANGLE-MORT-541] (lot 208) Troisième passe : le TEXTE de la palette Tailwind par défaut
// (`text-amber-300`, `text-green-400`…) posé directement sur les fonds de page. La première passe ne
// connaît que les tokens du projet ; 539 occurrences dans 70 fichiers lui échappaient.
const { paires: textePaires, classesLues } = extraireTextePaires();
if (classesLues < 30) {
    console.error(`check-contrast: passe texte par défaut quasi vide (classes=${classesLues}) — le scan a-t-il cassé ?`);
    process.exit(2);
}
const texteFailures = textePaires.filter((p) => p.ratio < SEUIL_AA_NORMAL);
console.log(`\n## Texte de la palette par défaut sur les fonds de page (${textePaires.length} combinaisons, ${classesLues} classes lues)\n`);
console.log(`- conformes AA texte normal : ${textePaires.length - texteFailures.length} / ${textePaires.length}`);
if (texteFailures.length > 0) {
    console.error(`\n❌ ${texteFailures.length} texte(s) par défaut sous le seuil AA sur un fond de page :`);
    texteFailures.sort((a, b) => a.ratio - b.ratio).forEach((r) => console.error(`   ${r.text} sur ${r.bg} : ${r.ratio.toFixed(2)} (${r.sites.slice(0, 3).join(', ')})`));
    process.exit(1);
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
