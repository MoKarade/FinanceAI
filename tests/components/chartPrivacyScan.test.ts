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
/** Marqueurs prouvant que le mode discret est pris en compte sur cette ligne. */
const PRIVACY = /maskedTick\(|maskedTooltipValue\(|isPrivacyMode|privacyMode|money\(|tooltipValue\(/;
/** Déclaration explicite d'un axe qui ne montre pas d'argent. */
const NOT_MONEY_AXIS = /AXE-NON-MONETAIRE/;

const files = readdirSync(path.join(ROOT, 'components'), { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => path.join(ROOT, 'components', f));

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

    it('chaque formateur de graphique manipulant des $ tient compte du mode discret', () => {
        const offenders: string[] = [];
        for (const file of files) {
            readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
                if (!/tickFormatter=|formatter={/.test(line)) return;
                if (!MONEY.test(line)) return;
                if (PRIVACY.test(line)) return;
                offenders.push(`${path.relative(ROOT, file)}:${i + 1}`);
            });
        }
        expect(
            offenders,
            'formateur $ de graphique non masqué en mode discret (axe ou infobulle)',
        ).toEqual([]);
    });
});
