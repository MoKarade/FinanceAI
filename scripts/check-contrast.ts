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

// --- Surfaces de fond utilisées dans l'app ---
const BACKGROUNDS: Record<string, string> = {
    'dark (page)': '#0B0E14',
    'surface (card)': '#151922',
    'surfaceHighlight': '#1E2330',
};

// --- Couleurs de texte testées (à partir des tokens sémantiques) ---
const TEXT_COLORS: Record<string, string> = {
    'primary': '#10b981',
    'secondary': '#8b5cf6',
    'success-400': '#34d399',
    'success-500': '#10b981',
    'warning-400': '#fbbf24',
    'warning-500': '#f59e0b',
    'danger-400': '#f87171',
    'danger-500': '#ef4444',
    'info-400': '#60a5fa',
    'info-500': '#3b82f6',
    'ink-50': '#f8fafc',
    'ink-100': '#e2e8f0',
    'ink-200': '#cbd5e1',
    'ink-300': '#94a3b8',
    // P2.5 (2026-05): éclaircis pour respecter WCAG AA sur les 3 bgs.
    'ink-400': '#8896a8', // était #64748b (ratio 3.30 fail)
    'ink-500': '#6a7689', // était #475569 (ratio 2.07 fail)
};

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
