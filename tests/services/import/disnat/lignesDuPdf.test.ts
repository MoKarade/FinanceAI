// tests/services/import/disnat/lignesDuPdf.test.ts
//
// [PTF-L1F2-LECTURE-PDF] Relevé PDF → lignes. La preuve qui compte TRAVERSE : le relevé FICTIF de
// `fixtureReleve.ts` est imprimé dans un vrai PDF (jsPDF, déjà une dépendance de l'app), relu par
// pdfjs, puis lu par `lireReleveDisnat` — et le résultat doit être celui du texte d'origine.
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import { reconstruireLignes, lireLignesPdf, type PdfjsMinimal } from '../../../../services/import/disnat/lignesDuPdf';
import { lireReleveDisnat } from '../../../../services/import/disnat/lireReleveDisnat';
import { LIGNES } from './fixtureReleve';

/** pdfjs version Node : le worker est chargé par pdfjs lui-même (« faux worker »), pas par Vite. */
const pdfjsNode = async (): Promise<PdfjsMinimal> => (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfjsMinimal;

/** Imprime des lignes dans un PDF, 40 par page, à la façon d'un relevé (pas de 14 points). */
function pdfDe(lignes: readonly string[]): Uint8Array {
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    doc.setFont('helvetica');
    doc.setFontSize(9);
    lignes.forEach((l, i) => {
        if (i > 0 && i % 40 === 0) doc.addPage();
        doc.text(l, 36, 40 + (i % 40) * 14);
    });
    return new Uint8Array(doc.output('arraybuffer'));
}

describe('[PTF-L1F2] reconstruction des lignes (pure)', () => {
    it('regroupe à la tolérance verticale, ordonne de haut en bas puis de gauche à droite', () => {
        expect(reconstruireLignes([
            { texte: 'B', x: 60, y: 700.4, largeur: 10 },
            { texte: 'bas', x: 10, y: 600, largeur: 20 },
            { texte: 'A', x: 10, y: 701.9, largeur: 10 },
        ])).toEqual(['A B', 'bas']);
    });

    it('deux fragments COLLÉS ne reçoivent pas d\'espace, deux fragments espacés en reçoivent une', () => {
        expect(reconstruireLignes([
            { texte: '1 011', x: 10, y: 500, largeur: 20 },
            { texte: ',2657', x: 30, y: 500, largeur: 20 },
            { texte: 'C', x: 80, y: 500, largeur: 5 },
        ])).toEqual(['1 011,2657 C']);
    });

    it('à 3 points d\'écart vertical, ce sont DEUX lignes (la tolérance est stricte)', () => {
        expect(reconstruireLignes([
            { texte: '2', x: 10, y: 503, largeur: 5 },
            { texte: 'TITRE', x: 10, y: 500, largeur: 30 },
        ])).toEqual(['2', 'TITRE']);
    });

    it('fragments vides et coordonnées non finies ignorés', () => {
        expect(reconstruireLignes([
            { texte: '', x: 1, y: 1, largeur: 0 },
            { texte: 'X', x: Number.NaN, y: 1, largeur: 1 },
        ])).toEqual([]);
    });
});

describe('[PTF-L1F2] traversée : PDF réel → pdfjs → lignes → relevé', () => {
    it('le relevé fictif imprimé en PDF se relit ligne pour ligne', async () => {
        const lignes = await lireLignesPdf(pdfDe(LIGNES), pdfjsNode);
        const attendu = LIGNES.map((l) => l.replace(/[’]/g, '\'').replace(/\s+/g, ' ').trim());
        const lues = lignes.map((l) => l.replace(/[’]/g, '\''));
        expect(lues).toEqual(attendu);
    }, 30_000);

    it('et le relevé lu depuis le PDF est celui lu depuis le texte', async () => {
        const lignes = await lireLignesPdf(pdfDe(LIGNES), pdfjsNode);
        const depuisPdf = lireReleveDisnat(lignes);
        expect(depuisPdf.anomalies).toEqual([]);
        expect(depuisPdf).toEqual(lireReleveDisnat(LIGNES));
    }, 30_000);
});
