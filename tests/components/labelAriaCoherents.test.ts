// tests/components/labelAriaCoherents.test.ts
//
// [A11Y-LABELS-REDONDANTS-NON-ASSOCIES] — GARDE DE DÉRIVE, pas de conformité.
//
// Le ticket signalait des `<label>` sans `htmlFor` ni enveloppement dont le contrôle porte déjà un
// `aria-label` : ce n'est PAS un défaut WCAG (le champ est nommé — `controlAccessibleNameGuard`),
// mais le même texte existe alors EN DOUBLE (le `<span>` visible et l'`aria-label`), deux écritures
// qui peuvent diverger en silence (famille `DOC-METRIQUE-RECOPIEE`). Le ticket posait sa propre
// condition : « à faire seulement si un scan prouve d'abord que les deux textes divergent déjà ».
//
// MESURÉ (lot 201, 2026-09-06) sur tout `components/` : **26 sites dans 9 fichiers**. 20 paires
// strictement IDENTIQUES (à un emoji décoratif près — `🇺🇸 Part actions US…`, exclu à dessein du
// nom accessible) ; 4 paires DÉLIBÉRÉMENT différentes, où l'`aria-label` est plus descriptif que le
// libellé court (« Champ : » → « Filtrer par champ modifié », les deux visionneuses système) ; 2 sites
// à libellé DYNAMIQUE ou porté par une autre ligne, non comparables par un scan. Aucune dérive :
// la précondition du ticket n'est pas remplie, le balisage n'est pas touché, et ce fichier fige le
// fait mesuré pour que la prochaine dérive rougisse au lieu d'être découverte par un lecteur d'écran.
//
// ⚠️ Lecture DÉCOMMENTÉE (les commentaires JSX citent des libellés) ; extraction par le MÊME motif
// que le recensement, témoins nommés, anti-vacuité sur le nombre de paires.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { stripCommentsJsx } from '../../utils/stripComments';

interface Paire { fichier: string; ligne: number; libelle: string; aria: string }

const marcher = (dir: string, out: string[] = []): string[] => {
    for (const nom of readdirSync(dir)) {
        const p = join(dir, nom);
        if (statSync(p).isDirectory()) marcher(p, out);
        else if (p.endsWith('.tsx')) out.push(p);
    }
    return out;
};

/** Un `<label>` sans `htmlFor` qui n'enveloppe aucun contrôle, suivi (≤ 8 lignes) d'un contrôle à `aria-label` LITTÉRAL. */
function extraire(): { paires: Paire[]; nonComparables: number } {
    const racine = resolve(process.cwd(), 'components');
    const paires: Paire[] = [];
    let nonComparables = 0;
    for (const f of marcher(racine)) {
        const lignes = stripCommentsJsx(readFileSync(f, 'utf8')).split('\n');
        for (let i = 0; i < lignes.length; i++) {
            const l = lignes[i];
            if (!l.includes('<label') || l.includes('htmlFor')) continue;
            // ⚠️ Fenêtre de 12 lignes pour la FERMETURE : un `<label className="block">` qui enveloppe un
            // `<select>` cinq lignes plus bas (TestModePanel) est nommé par enveloppement, pas un offender.
            const large = lignes.slice(i, i + 12).join('\n');
            const fermeture = large.indexOf('</label>');
            if (fermeture !== -1 && /<(input|select|textarea|button)/.test(large.slice(0, fermeture))) continue; // enveloppe → nommé par enveloppement
            const bloc = lignes.slice(i, i + 4).join('\n');
            const apres = lignes.slice(i + 1, i + 9).join('\n');
            const a = /<(?:input|select|textarea)[^>]*aria-label=(?:"([^"]+)"|\{`([^`]+)`\})/.exec(apres);
            if (!a) continue;
            const aria = (a[1] ?? a[2] ?? '').trim();
            const m = /<label[^>]*>\s*(?:<span[^>]*>)?\s*([^<{]+)/.exec(bloc);
            const libelle = m ? m[1].replace(/\s+/g, ' ').trim() : '';
            if (!libelle || aria.includes('${')) { nonComparables++; continue; }
            paires.push({ fichier: f.slice(racine.length + 1), ligne: i + 1, libelle, aria });
        }
    }
    return { paires, nonComparables };
}

/** Normalisation : casse, espaces, emoji et ponctuation décorative — le SENS, pas la forme. */
const norm = (s: string): string => s.replace(/[^\p{L}\p{N}%()/ -]/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Les paires DÉLIBÉRÉMENT différentes : un libellé court à l'écran, un nom accessible plus
 * descriptif. Déclarées ici avec le MOT que l'`aria-label` doit encore porter — une dérive
 * (renommer « Champ » en « Colonne » d'un seul côté) rougit quand même.
 */
const DESCRIPTIFS: ReadonlyArray<{ fichier: string; libelle: string; motCle: string }> = [
    { fichier: 'system/AuditLogViewer.tsx', libelle: 'Champ :', motCle: 'champ' },
    { fichier: 'system/AuditLogViewer.tsx', libelle: 'Opération :', motCle: 'opération' },
    { fichier: 'system/ErrorLogViewer.tsx', libelle: 'Source :', motCle: 'source' },
    { fichier: 'system/ErrorLogViewer.tsx', libelle: 'Severity :', motCle: 'severity' },
];

describe('[A11Y-LABELS-REDONDANTS-NON-ASSOCIES] un libellé visible et son aria-label ne divergent pas en silence', () => {
    const { paires, nonComparables } = extraire();

    it('anti-vacuité : le recensement retrouve le contingent mesuré (témoins nommés)', () => {
        // Mesuré 2026-09-06 : 24 paires comparables + 2 non comparables (libellé dynamique / porté
        // par une autre ligne). Bornes larges : un site en plus ou en moins n'est pas une dérive.
        expect(paires.length).toBeGreaterThanOrEqual(20);
        expect(paires.filter((p) => p.fichier === 'projection/ProjectionControls.tsx').length, 'les sliders de ProjectionControls sont le gros du contingent').toBeGreaterThanOrEqual(10);
        expect(paires.some((p) => p.libelle.includes('Part actions US')), 'témoin : le libellé à emoji doit être vu ET normalisé').toBe(true);
        expect(nonComparables, 'libellés dynamiques non comparables (mesuré : 1, la boucle INFLATION_CATEGORIES)').toBeLessThanOrEqual(3);
    });

    it('toute paire non déclarée descriptive porte le MÊME texte des deux côtés (à la décoration près)', () => {
        const divergentes = paires
            .filter((p) => !DESCRIPTIFS.some((d) => d.fichier === p.fichier && d.libelle === p.libelle))
            .filter((p) => norm(p.libelle) !== norm(p.aria))
            .map((p) => `${p.fichier}:${p.ligne} « ${p.libelle} » ≠ aria-label « ${p.aria} »`);
        expect(divergentes, 'un libellé visible et son aria-label ont DIVERGÉ : corriger les deux, ou déclarer la paire descriptive ici').toEqual([]);
    });

    it('les paires descriptives existent toujours, et leur aria-label porte encore le mot du libellé', () => {
        for (const d of DESCRIPTIFS) {
            const p = paires.find((x) => x.fichier === d.fichier && x.libelle === d.libelle);
            expect(p, `paire descriptive disparue : ${d.fichier} « ${d.libelle} » — retirer sa déclaration`).toBeTruthy();
            expect(norm(p!.aria)).toContain(d.motCle);
        }
    });
});
