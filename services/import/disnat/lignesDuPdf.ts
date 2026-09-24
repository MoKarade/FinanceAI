// services/import/disnat/lignesDuPdf.ts
//
// [PTF-L1F2-LECTURE-PDF] Relevé PDF → lignes de texte, pour `lireReleveDisnat`. Deux moitiés :
//   1. `reconstruireLignes` : PURE. Regroupe les fragments de texte d'une page en lignes (même
//      ordonnée à la tolérance près), de haut en bas, puis de gauche à droite. Tolérance verticale
//      3 points, MESURÉE au Lot 0 sur les vrais relevés : identique ligne pour ligne à pdfplumber ;
//      à 2, l'indicateur « ² » imprimé en exposant ne tombe plus sur la bonne ligne.
//   2. `lireLignesPdf` : charge pdfjs EN DIFFÉRÉ (≈ 500 Ko compressés, jamais dans le paquet de
//      démarrage) et lui passe le fichier. Aucun réseau : le relevé ne quitte pas l'appareil.
// ⚠️ La CSP (`vercel.json`) interdit `eval` : `isEvalSupported: false`. Le worker vient du même
// domaine (`worker-src 'self'`).

/** Fragment de texte positionné, tel que pdfjs le rend (`getTextContent`). */
export interface FragmentTexte {
    texte: string;
    /** Abscisse du début, en points. */
    x: number;
    /** Ordonnée de la ligne de base, en points (pdf : 0 en BAS de la page). */
    y: number;
    largeur: number;
}

const TOLERANCE_VERTICALE = 3;
/** Écart horizontal au-delà duquel deux fragments voisins sont séparés par une espace. */
const ECART_MOT = 1;

/** Lignes d'une page, de haut en bas. Les fragments vides sont ignorés. */
export function reconstruireLignes(fragments: readonly FragmentTexte[]): string[] {
    const rangs: { y: number; morceaux: FragmentTexte[] }[] = [];
    for (const f of fragments) {
        if (f.texte === '' || !Number.isFinite(f.x) || !Number.isFinite(f.y)) continue;
        let rang = rangs.find((r) => Math.abs(r.y - f.y) < TOLERANCE_VERTICALE);
        if (!rang) { rang = { y: f.y, morceaux: [] }; rangs.push(rang); }
        rang.morceaux.push(f);
    }
    rangs.sort((a, b) => b.y - a.y);
    return rangs
        .map((r) => {
            r.morceaux.sort((a, b) => a.x - b.x);
            let ligne = '';
            let fin: number | null = null;
            for (const m of r.morceaux) {
                if (fin !== null && m.x - fin > ECART_MOT) ligne += ' ';
                ligne += m.texte;
                fin = m.x + m.largeur;
            }
            return ligne.replace(/\s+/g, ' ').trim();
        })
        .filter((l) => l !== '');
}

/** Le strict nécessaire de pdfjs, pour que l'appelant (ou un test) fournisse le module. */
export interface PdfjsMinimal {
    getDocument: (src: { data: Uint8Array; isEvalSupported: boolean; useSystemFonts: boolean }) => {
        promise: Promise<{
            numPages: number;
            getPage: (n: number) => Promise<{
                getTextContent: () => Promise<{ items: readonly unknown[] }>;
            }>;
        }>;
    };
}

/** Chargement navigateur : module et worker en DIFFÉRÉ, worker servi par l'app elle-même. */
async function chargerPdfjsNavigateur(): Promise<PdfjsMinimal> {
    const [pdfjs, worker] = await Promise.all([
        import('pdfjs-dist/legacy/build/pdf.mjs'),
        import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs as unknown as PdfjsMinimal;
}

const estFragment = (it: unknown): it is { str: string; transform: number[]; width: number } =>
    typeof it === 'object' && it !== null && typeof (it as { str?: unknown }).str === 'string'
    && Array.isArray((it as { transform?: unknown }).transform);

/**
 * Lignes de toutes les pages, dans l'ordre. `charger` est remplaçable (les tests passent la version
 * Node de pdfjs, sans worker de navigateur).
 */
export async function lireLignesPdf(donnees: Uint8Array, charger: () => Promise<PdfjsMinimal> = chargerPdfjsNavigateur): Promise<string[]> {
    const pdfjs = await charger();
    const doc = await pdfjs.getDocument({ data: donnees, isEvalSupported: false, useSystemFonts: false }).promise;
    const lignes: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const { items } = await page.getTextContent();
        const fragments = items.filter(estFragment).map((it) => ({ texte: it.str, x: it.transform[4], y: it.transform[5], largeur: it.width }));
        lignes.push(...reconstruireLignes(fragments));
    }
    return lignes;
}
