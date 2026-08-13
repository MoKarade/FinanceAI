/**
 * [AUDIT-SAFETY] GARDE DE SOURCE — mode discret dans les graphiques Recharts.
 *
 * POURQUOI UN SCAN DE SOURCE plutôt qu'un test de rendu :
 * un `tickFormatter` / `formatter` de Recharts n'existe QUE comme prop. Les suites qui rendent ces
 * écrans mockent `YAxis`/`Tooltip` en `() => null` (jsdom ne donne aucune dimension à
 * `ResponsiveContainer` : sans mock, rien ne se dessine). La fuite mesurée le 2026-08-12 — l'axe Y
 * de la courbe d'extinction de dette annonçant « 41k » à côté d'une infobulle correctement masquée
 * — était donc invisible AUX DEUX outils habituels : au grep `formatCAD(` (le montant y est
 * construit à la main, `${(val/1000).toFixed(0)}k`) ET aux tests de rendu.
 *
 * CE QUE LA GARDE EXIGE :
 *  1. tout `<YAxis>` non masqué (`hide`) porte une marque de mode discret ;
 *  2. toute ligne de `tickFormatter=` / `formatter={` qui manipule des $ porte cette même marque.
 *
 * ÉCHAPPATOIRE assumée : un axe qui ne montre PAS d'argent (%, âge, nombre d'unités) se déclare
 * avec le jeton `AXE-NON-MONETAIRE` en commentaire — explicite, greppable, et il force à se poser
 * la question au lieu de désactiver la garde.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Marqueurs prouvant qu'une valeur affichée est de l'ARGENT. */
const MONEY = /formatCAD|formatCompactCAD|formatCurrency|toLocaleString|\/\s*1000|money\(|fmt\(/;
/**
 * Marqueurs prouvant que le mode discret est pris en compte sur cette ligne.
 *
 * ⚠️ N'AJOUTE JAMAIS ICI un nom de helper LOCAL (`money(`, `tooltipValue(`, …). Ces noms figurent
 * déjà dans `MONEY` : les mettre aussi dans `PRIVACY` rendrait la garde auto-satisfaite — un
 * `const money = (v) => formatCAD(v)` **sans** `isPrivacyMode` passerait au vert tout en fuyant
 * (trou réel, démontré par PoC à la revue #608). Seule une marque qui PROUVE la lecture du mode
 * discret est recevable ; c'est pourquoi les points d'appel écrivent le ternaire en clair.
 */
const PRIVACY = /maskedTick\(|maskedTooltipValue\(|isPrivacyMode|privacyMode/;
/** Déclaration explicite d'un axe qui ne montre pas d'argent. */
const NOT_MONEY_AXIS = /AXE-NON-MONETAIRE/;

const files = readdirSync(path.join(ROOT, 'components'), { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => path.join(ROOT, 'components', f));

/**
 * Découpe le CORPS de chaque `tickFormatter={…}` / `formatter={…}`, y compris multi-lignes : on part
 * du `={` et on avance jusqu'à ce que les accolades se rééquilibrent. Un scan ligne à ligne raterait
 * un `formatCAD` posé une ligne plus bas (limite relevée à la revue #608) ; `closed: false` signale
 * un corps que la garde n'a pas su délimiter, plutôt que de le laisser passer en silence.
 */
function formatterBlocks(src: string): Array<{ text: string; line: number; closed: boolean }> {
    const lines = src.split('\n');
    const blocks: Array<{ text: string; line: number; closed: boolean }> = [];
    lines.forEach((line, i) => {
        const at = line.search(/tickFormatter=\{|formatter=\{/);
        if (at < 0) return;
        let depth = 0, text = '', done = false;
        for (let j = i; j < lines.length && !done; j++) {
            const chunk = j === i ? lines[j].slice(at) : lines[j];
            for (const ch of chunk) {
                text += ch;
                if (ch === '{') depth++;
                else if (ch === '}' && --depth === 0) { done = true; break; }
            }
            text += '\n';
        }
        blocks.push({ text, line: i + 1, closed: done });
    });
    return blocks;
}

describe('[AUDIT-SAFETY] graphiques : aucun montant ne survit au mode discret', () => {
    it('a bien des fichiers à scanner (la garde ne peut pas être vide)', () => {
        expect(files.length).toBeGreaterThan(20);
    });

    it('chaque <YAxis> visible tient compte du mode discret', () => {
        const offenders: string[] = [];
        for (const file of files) {
            const src = readFileSync(file, 'utf8');
            for (const m of src.matchAll(/<L?YAxis\b[\s\S]*?\/>/g)) {
                const el = m[0];
                if (/\bhide\b/.test(el)) continue;
                if (PRIVACY.test(el) || NOT_MONEY_AXIS.test(el)) continue;
                const line = src.slice(0, m.index).split('\n').length;
                offenders.push(`${path.relative(ROOT, file)}:${line}`);
            }
        }
        expect(
            offenders,
            'axe Y non masqué en mode discret — envelopper le tickFormatter dans maskedTick(isPrivacyMode, …), '
            + 'ou déclarer AXE-NON-MONETAIRE si l\'axe ne montre pas d\'argent',
        ).toEqual([]);
    });

    // ── CANARIS : les deux limites CONNUES du scan, converties en échec BRUYANT ──────────────
    // Une garde qui cesse silencieusement de voir est pire que pas de garde. Plutôt que de
    // prétendre lire du JSX arbitraire, on refuse les deux formes que le scan ne sait PAS lire.
    it("aucun <YAxis> ne contient de JSX imbriqué (le scan s'arrêterait au premier `/>`)", () => {
        const offenders: string[] = [];
        for (const file of files) {
            const src = readFileSync(file, 'utf8');
            for (const m of src.matchAll(/<L?YAxis\b[\s\S]*?\/>/g)) {
                // Le motif est non-greedy : `<YAxis tick={<CustomTick/>} tickFormatter={…} />`
                // s'arrêterait au `/>` de `<CustomTick/>`, laissant le vrai formateur HORS du texte
                // examiné — faux négatif silencieux.
                if (!m[0].slice(1).includes('<')) continue;
                offenders.push(`${path.relative(ROOT, file)}:${src.slice(0, m.index).split('\n').length}`);
            }
        }
        expect(
            offenders,
            'JSX imbriqué dans un <YAxis> : la garde ne peut plus lire ses props. Extrais le composant '
            + 'imbriqué dans une variable avant de le passer en prop.',
        ).toEqual([]);
    });

    it('aucun formateur de graphique ne reste illisible pour la garde (accolades non fermées)', () => {
        const offenders: string[] = [];
        for (const file of files) {
            for (const block of formatterBlocks(readFileSync(file, 'utf8'))) {
                if (block.closed) continue;
                offenders.push(`${path.relative(ROOT, file)}:${block.line}`);
            }
        }
        expect(
            offenders,
            'formateur de graphique dont les accolades ne se referment pas dans le fichier : la garde '
            + 'ne peut pas délimiter son corps, donc ne peut pas le vérifier.',
        ).toEqual([]);
    });

    it('chaque formateur de graphique manipulant des $ tient compte du mode discret', () => {
        const offenders: string[] = [];
        for (const file of files) {
            for (const block of formatterBlocks(readFileSync(file, 'utf8'))) {
                if (!MONEY.test(block.text)) continue;
                if (PRIVACY.test(block.text)) continue;
                offenders.push(`${path.relative(ROOT, file)}:${block.line}`);
            }
        }
        expect(
            offenders,
            'formateur $ de graphique non masqué en mode discret (axe ou infobulle)',
        ).toEqual([]);
    });
});
