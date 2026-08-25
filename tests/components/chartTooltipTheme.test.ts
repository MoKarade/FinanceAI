/**
 * [DETTE-CHART-THEME-DUP] Les infobulles Recharts ont UN seul style, et il vient des tokens.
 *
 * ⚠️ MESURÉ avant d'écrire la constante : 14 infobulles, **9 styles distincts**, **six fonds
 * différents** (`#1e1e1e` ×4, `#151922` ×2, `#1a1a1a` ×2, `#1a1e29`, `#111`, `#0B0E14` ×2) — et
 * **deux infobulles BLANCHES** (`#fff`, texte noir) au milieu d'une app sombre. Aucun de ces fonds
 * n'existe dans `tailwind.config.js` : les 14 étaient peintes à la main, hors système de design.
 * Le ticket disait « dédupliquer » ; ce qui se mesurait, c'est qu'aucune n'utilisait les tokens.
 *
 * Deux gardes, dans les deux sens :
 *   1. la constante ne DÉRIVE pas des tokens (un `contentStyle` part dans la prop d'un composant
 *      TIERS — il ne peut pas être une classe Tailwind, donc rien au runtime ne les confronte) ;
 *   2. aucun composant ne re-peint un style à la main à côté de la constante.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import twConfig from '../../tailwind.config.js';
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_ITEM_STYLE } from '../../utils/chartTooltip';

const RACINE = resolve(__dirname, '../..');
const COULEURS = (twConfig as { theme: { extend: { colors: Record<string, unknown> } } }).theme.extend.colors;

/** Retire commentaires de bloc et de ligne — un scan d'ABSENCE matche sinon la PROSE qui décrit
 *  justement le motif interdit (`SCAN-QUI-MATCHE-LA-PROSE`, payé plusieurs fois dans ce dépôt). */
function sansCommentaires(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function fichiersTsx(dir: string): string[] {
    return readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith('.tsx'))
        .map((e) => join(e.parentPath ?? dir, e.name));
}

describe('[DETTE-CHART-THEME-DUP] un seul style d’infobulle, issu des tokens', () => {
    it('la constante REPRODUIT les tokens de tailwind.config.js', () => {
        // `surfaceHighlight` : l'infobulle est une surface ÉLEVÉE au-dessus de `surface`/`dark`.
        expect(CHART_TOOLTIP_STYLE.backgroundColor).toBe(COULEURS.surface_highlight ?? COULEURS.surfaceHighlight);
        expect(CHART_TOOLTIP_STYLE.border).toContain(String(COULEURS.border));
        // Texte `ink-100` — ratio 14,42 sur ce fond (mesuré ; WCAG AA exige 4,5).
        const ink = COULEURS.ink as Record<string, string>;
        expect(CHART_TOOLTIP_STYLE.color).toBe(ink['100']);
        expect(CHART_TOOLTIP_ITEM_STYLE.color).toBe(ink['100']);
    });

    it('le texte de l’infobulle passe WCAG AA sur son propre fond', () => {
        const lin = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : (((c / 255) + 0.055) / 1.055) ** 2.4);
        const lum = (hex: string) => {
            const h = hex.replace('#', '');
            const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
            return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
        };
        const a = lum(CHART_TOOLTIP_STYLE.backgroundColor);
        const b = lum(CHART_TOOLTIP_STYLE.color);
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        // Choisi par MESURE, jamais au jugé — et la garde le re-mesure à chaque exécution.
        expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('aucun composant ne re-peint un `contentStyle` à la main', () => {
        const offenders: string[] = [];
        let octetsCode = 0;
        let temoinTrouve = false;
        for (const f of fichiersTsx(join(RACINE, 'components'))) {
            const code = sansCommentaires(readFileSync(f, 'utf8'));
            octetsCode += code.length;
            if (code.includes('contentStyle={CHART_TOOLTIP_STYLE}')) temoinTrouve = true;
            // Un objet littéral inline = un style peint à la main. La constante, elle, passe par
            // un identifiant : `contentStyle={CHART_TOOLTIP_STYLE}`.
            for (const m of code.matchAll(/contentStyle=\{\{/g)) {
                offenders.push(`${f.replace(RACINE + '/', '')} @ ${code.slice(0, m.index).split('\n').length}`);
            }
        }
        // Anti-vacuité DOUBLE : le décommenteur n'a pas tout mangé, ET le motif recherché sait
        // trouver quelque chose (le témoin est repéré par le MÊME lecteur que les offenders).
        expect(octetsCode).toBeGreaterThan(200_000);
        expect(temoinTrouve, 'aucun `contentStyle={CHART_TOOLTIP_STYLE}` trouvé — le scan lit-il vraiment le source ?').toBe(true);
        expect(offenders, `Infobulle peinte à la main : ${offenders.join(' · ')}`).toEqual([]);
    });
});
