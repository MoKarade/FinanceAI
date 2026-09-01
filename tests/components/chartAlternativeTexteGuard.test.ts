/**
 * [A11Y-BUDGETGROUP-CHART-NOALT] GARDE DE SOURCE — tout graphe Recharts a une alternative TEXTUELLE.
 *
 * Un `<ResponsiveContainer>`/SVG Recharts est OPAQUE pour un lecteur d'écran : sans nom accessible
 * ni table de données, le graphe n'existe tout simplement pas (WCAG 1.1.1 Non-text Content, A).
 * Onze fichiers sur douze appliquaient le patron ; le douzième l'a raté, et rien ne le disait.
 *
 * ⚠️ **Le ticket annonçait « le seul des 10 graphiques » ; le dépôt en a 16 dans 12 fichiers**, et
 * le fichier fautif en portait DEUX, pas un. Sa conclusion était juste, ses deux nombres faux —
 * d'où cette garde, qui compte au lieu d'énumérer.
 *
 * DEUX EXIGENCES, à deux échelles :
 *  1. par FICHIER : au moins un `role="img"` et une `ChartDataTable` — le patron des onze autres ;
 *  2. par GRAPHE : une marque d'alternative (`role="img"` ou `aria-hidden`) dans les 8 lignes qui
 *     le précèdent, sans quoi un second graphe ajouté au même fichier passerait à l'abri du premier.
 *
 * ⚠️ **Les deux règles lisent la source DÉCOMMENTÉE.** Écrite sur la source brute, la règle 2
 * était satisfaite par le COMMENTAIRE que je venais d'écrire au-dessus du graphe — celui qui
 * explique le patron `role="img"` — donc elle restait VERTE quand on retirait l'attribut réel.
 * Mesuré par perturbation, vingt minutes après l'avoir écrite : `SCAN-QUI-MATCHE-LA-PROSE`, la
 * leçon la plus répétée du dépôt, re-commise dans la garde qui la cite.
 *
 * ⚠️ La règle 2 a UNE exemption nominative, avec sa raison — pas un assouplissement de la fenêtre :
 * dans `ZoomableTimeChart`, le `role="img"` est bien là mais quarante lignes plus haut, séparé du
 * graphe par les contrôles de zoom et de plein écran. Élargir la fenêtre à 40 lignes la rendrait
 * vide de sens pour tous les autres.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { stripCommentsJsx } from '../../utils/stripComments';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const RACINE_RECHARTS = /<(ComposedChart|LineChart|BarChart|AreaChart|PieChart|RadarChart|ScatterChart|Treemap)\b/;
/**
 * ⚠️ DEUX écritures acceptées : l'attribut JSX `role="img"` et la forme OBJET `role: 'img'` — un
 * composant qui choisit entre « nommer » et « masquer » étale un objet de props (`{...alternative}`)
 * et n'écrit jamais l'attribut littéral. Ne reconnaître que la première ferait rougir la garde sur
 * du code parfaitement conforme.
 */
const ROLE_IMG = /role="img"|role:\s*'img'/;
const ALTERNATIVE = /role="img"|role:\s*'img'|aria-hidden/;
const FENETRE = 8;

/** Exemptions de la règle PAR GRAPHE, chacune avec la raison qui la rend acceptable. */
const HORS_FENETRE: Record<string, string> = {
    'components/ui/ZoomableTimeChart.tsx':
        'le `role="img"` enveloppe tout le composant, mais les contrôles de zoom et de plein écran '
        + 'le séparent du graphe de ~40 lignes. La règle PAR FICHIER le couvre.',
};

const files = readdirSync(path.join(ROOT, 'components'), { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => path.join(ROOT, 'components', f));

const fichiersAvecGraphe = files.filter((f) => RACINE_RECHARTS.test(stripCommentsJsx(readFileSync(f, 'utf8'))));

describe('[A11Y] aucun graphe sans alternative textuelle', () => {
    it('le dépôt a bien des graphes à garder (anti-vacuité, COMPTÉE)', () => {
        // Le nombre est écrit pour qu'un jour où il tombe à zéro — extraction, refonte — la garde
        // le DISE au lieu de passer au vert sur un dépôt qu'elle ne surveille plus.
        expect(fichiersAvecGraphe.length).toBeGreaterThanOrEqual(10);
    });

    it('chaque FICHIER qui rend un graphe porte le patron : `role="img"` + `ChartDataTable`', () => {
        const offenders: string[] = [];
        for (const file of fichiersAvecGraphe) {
            const src = stripCommentsJsx(readFileSync(file, 'utf8'));
            const manque: string[] = [];
            if (!ROLE_IMG.test(src)) manque.push('role="img"');
            if (!/ChartDataTable/.test(src)) manque.push('ChartDataTable');
            if (manque.length) offenders.push(`${path.relative(ROOT, file)} — manque ${manque.join(' et ')}`);
        }
        expect(
            offenders,
            'graphe sans nom accessible ni alternative textuelle — applique le patron des autres : '
            + 'un conteneur `role="img"` + `aria-label`, et une `ChartDataTable` sr-only des mêmes données.',
        ).toEqual([]);
    });

    it('chaque GRAPHE porte sa marque à lui (un voisin couvert ne couvre pas le suivant)', () => {
        const offenders: string[] = [];
        for (const file of fichiersAvecGraphe) {
            const rel = path.relative(ROOT, file);
            if (HORS_FENETRE[rel]) continue;
            const lignes = stripCommentsJsx(readFileSync(file, 'utf8')).split('\n');
            lignes.forEach((l, i) => {
                if (!RACINE_RECHARTS.test(l)) return;
                const amont = lignes.slice(Math.max(0, i - FENETRE), i + 1).join('\n');
                if (ALTERNATIVE.test(amont)) return;
                offenders.push(`${rel}:${i + 1}  ${l.trim().slice(0, 90)}`);
            });
        }
        expect(
            offenders,
            `graphe sans marque d'alternative dans les ${FENETRE} lignes qui le précèdent`,
        ).toEqual([]);
    });

    it('les exemptions de la règle par graphe restent VRAIES', () => {
        // Une exemption qui a perdu son objet est un constat périmé qui se lit comme un fait
        // (`ENTREE-D-INVENTAIRE-FANTOME`). On exige que le fichier existe, qu'il rende encore un
        // graphe, et qu'il porte bien le `role="img"` sur lequel repose sa dispense.
        for (const [rel, raison] of Object.entries(HORS_FENETRE)) {
            const src = stripCommentsJsx(readFileSync(path.join(ROOT, rel), 'utf8'));
            expect(RACINE_RECHARTS.test(src), `${rel} ne rend plus de graphe — retire son exemption`).toBe(true);
            expect(ROLE_IMG.test(src), `${rel} : ${raison}`).toBe(true);
        }
    });
});
