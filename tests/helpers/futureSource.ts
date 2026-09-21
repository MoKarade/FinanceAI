// tests/helpers/futureSource.ts
//
// [DETTE-LEVIER-EXPLICITE] Lecteurs PARTAGÉS de `components/FutureProjection.tsx` pour les gardes
// qui scannent sa source.
//
// ⚠️ Pourquoi ce module existe — `UN-CONTROLE-DE-DUPLICATION-EST-UNE-GARDE-CONTRE-LA-DUPLICATION-
// DE-GARDES` (2026-09-18), et la règle « avant d'écrire une garde, chercher dans `tests/helpers/` ».
// `curveFieldsDuComposant` existait en DEUX exemplaires (`tests/services/bilanQuotidien.test.ts`,
// `tests/components/futureProjection.curveFields.test.ts`) et `colonnesDeLaTable` en un troisième
// (`tests/a11y/tableDonneesSuitLaLegende.test.ts`) — un quatrième était sur le point d'être écrit.
//
// ⚠️⚠️ ET LES DEUX COPIES NE FAISAIENT PAS LA MÊME CHOSE : celle de `futureProjection.curveFields`
// lisait la source **BRUTE** (`readFileSync`), donc elle portait encore la bombe
// `UNE-APOSTROPHE-FRANCAISE-EST-UN-DELIMITEUR-DE-CHAINE` — un commentaire français à nombre IMPAIR
// d'apostrophes ASCII dans le bloc `CURVE_FIELDS` décale toutes les paires suivantes et fait
// accuser un champ présent d'être absent. Sa jumelle avait été corrigée le 2026-09-18, pas elle.
// Consolider ici règle les deux d'un coup, et il n'existe plus d'endroit où l'oublier.

import { expect } from 'vitest';
import { join } from 'node:path';
import { readCodeOnly } from './source';

const SOURCE = join(__dirname, '../../components/FutureProjection.tsx');

/**
 * La source DÉCOMMENTÉE du composant.
 *
 * ⚠️ Seuil 0,35 et non le 0,2 par défaut : MESURÉ le 2026-09-18, ce fichier est à **0,455** de code
 * non blanc — plus qu'à moitié commentaire par conception
 * (`UN-SEUIL-D-ANTI-VACUITE-APPARTIENT-A-LA-PORTEE-QU-IL-MESURE`).
 * Re-mesurer : `node -e "const{readFileSync}=require('fs');..."` — ou simplement lire l'échec, qui
 * imprime la part réelle.
 *
 * Le SECOND témoin (celui que `readCodeOnly` ne porte pas) : un jeton de PROSE doit avoir DISPARU.
 * Sans lui, un décommenteur qui ne décommenterait rien passerait les deux autres contrôles.
 */
export function sourceFutureProjection(): string {
    const src = readCodeOnly(SOURCE, 'RENDER_MAX_POINTS', 0.35);
    expect(src).not.toContain('patrimoine faux et crédible');
    return src;
}

/** Les champs déclarés dans `CURVE_FIELDS` — la ventilation ALLÉGÉE de la vraie courbe. */
export function curveFieldsDuComposant(): Set<string> {
    const bloc = sourceFutureProjection().match(/const CURVE_FIELDS[^=]*= new Set\(\[([\s\S]*?)\]\)/);
    if (!bloc) throw new Error('CURVE_FIELDS introuvable dans FutureProjection.tsx');
    const champs = new Set([...bloc[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
    // Anti-vacuité de l'EXTRACTEUR : si la regex ne matchait plus (renommage, reformatage), le set
    // serait vide et TOUTE assertion d'appartenance deviendrait trivialement satisfaite.
    expect(champs.size, 'CURVE_FIELDS extrait vide ou tronqué — extracteur à réparer').toBeGreaterThan(10);
    return champs;
}

/** Les `key` des colonnes de la table `sr-only` (le `useMemo<ChartDataColumn[]>`). */
export function colonnesDeLaTable(): string[] {
    const src = sourceFutureProjection();
    expect(src).not.toContain('alternative texte à la courbe');
    const bloc = src.match(/useMemo<ChartDataColumn\[\]>\(\(\) => \{([\s\S]*?)\n {4}\}, \[/);
    if (!bloc) throw new Error('bloc `dataColumns` introuvable dans FutureProjection.tsx');
    const cols = [...bloc[1].matchAll(/\{\s*key:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(cols.length, 'colonnes extraites vides ou tronquées — extracteur à réparer').toBeGreaterThan(5);
    return cols;
}

/**
 * Les `dataKey` tracés par le render, dans les DEUX écritures.
 *
 * ⚠️ La forme `dataKey={accesseur}` (une FONCTION, pour tracer une valeur DÉRIVÉE comme la dette en
 * négatif) échappait entièrement à la garde `[FUTUR-DAILY-NATIVE]`, qui ne cherchait que
 * `dataKey="…"`. Une série tracée par accesseur pouvait donc manquer à `CURVE_FIELDS` et rester
 * MUETTE au jour, en silence — exactement la classe que cette garde existe pour fermer.
 */
export function dataKeysDuRender(): { litteraux: string[]; accesseurs: string[] } {
    const src = sourceFutureProjection();
    return {
        litteraux: [...src.matchAll(/dataKey="([^"]+)"/g)].map((m) => m[1]).filter((k) => k !== 'monthIndex'),
        accesseurs: [...src.matchAll(/dataKey=\{([A-Za-z_$][\w$]*)\}/g)].map((m) => m[1]),
    };
}
