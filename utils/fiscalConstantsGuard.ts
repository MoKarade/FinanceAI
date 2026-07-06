// utils/fiscalConstantsGuard.ts
//
// [FISC-CONST-LINT] — ferme STRUCTURELLEMENT la classe de bugs M1-M3 : une constante fiscale
// recopiée en dur ailleurs que dans la source unique (`utils/tax.ts` / `services/realEstate.ts`)
// finit par diverger du barème daté (cf docs/FISCAL_REFERENCE.md). Ce garde-fou interdit qu'un
// littéral fiscal DISTINCTIF réapparaisse hors de ces deux fichiers.
//
// Scope SÛR (anti faux-positif, choix Marc 2026-06-18) : on ne bannit QUE le NON-COLLISIONNABLE.
//   • Entiers à ≥ 5 chiffres NE finissant PAS par « 000 » : un seuil comme 58523 / 95323 / 18952
//     n'apparaît jamais par hasard. Les ronds (40000, 60000 = 60 s en ms, 85000, 103000) sont
//     EXCLUS — ils collisionnent avec des timeouts/limites légitimes.
//   • Taux à 4 décimales (0.2575, 0.0043, 0.0130) : assez spécifiques. Les taux 2-décimales
//     génériques (0.14, 0.29, 0.50) sont EXCLUS (omniprésents en ratios/opacités).
// La liste est AUTO-EXTRAITE des fichiers source à chaque run → reste en phase avec les valeurs
// chaque année (aucune liste figée à maintenir).

/** Littéral à ignorer sur une ligne portant ce marqueur (faux positif légitime documenté). */
export const FISCAL_CONST_ESCAPE = 'fiscal-const-ok';

const DISTINCTIVE_INT = /(?<![\d.])\d{5,}(?![\d.])/g;          // ≥ 5 chiffres, pas dans un plus grand nombre
const DISTINCTIVE_RATE = /(?<![\d.])0\.\d{4}(?![\d])/g;        // 0.dddd (4 décimales exactement)

/**
 * Remplace les commentaires (`//…` et `/* … *\/`) par des espaces, en PRÉSERVANT les sauts de ligne
 * (donc les numéros de ligne). Indispensable : sans ça, les numéros de ligne de formulaire ARC cités
 * en commentaire (« ARC ligne 23500 ») polluent à la fois l'extraction ET le scan (faux positifs des
 * deux côtés). On ne raisonne JAMAIS sur du texte de commentaire ici.
 *
 * ⚠️ Angle mort assumé (pas de parser TS) : un `//` DANS une string (`"http://…/58523"`) est traité
 * comme un commentaire → le reste de la ligne est stripé. Conséquence = un littéral fiscal placé
 * APRÈS un `//` dans une string échapperait au scan (faux négatif). Cas irréaliste en code fiscal
 * (personne ne met un seuil dans une URL) ; un seuil dans une string normale, lui, reste détecté.
 */
function stripComments(source: string): string {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
        .replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length));
}

/**
 * Extrait les littéraux fiscaux DISTINCTIFS (non-collisionnables) des sources fiscales.
 * Retourne la liste triée par longueur décroissante (les plus longs d'abord pour l'alternance regex).
 */
export function extractDistinctiveFiscalLiterals(sources: readonly string[]): string[] {
    const found = new Set<string>();
    for (const raw of sources) {
        const src = stripComments(raw); // n'extraire QUE des vraies constantes, pas des n° de ligne ARC en commentaire
        for (const m of src.matchAll(DISTINCTIVE_INT)) {
            if (!m[0].endsWith('000')) found.add(m[0]);
        }
        for (const m of src.matchAll(DISTINCTIVE_RATE)) {
            found.add(m[0]);
        }
    }
    return [...found].sort((a, b) => b.length - a.length);
}

export interface FiscalLeak {
    /** Le littéral fiscal trouvé hors source. */
    value: string;
    /** Numéro de ligne (1-indexé) dans le fichier scanné. */
    line: number;
    /** Contenu (trimé) de la ligne fautive. */
    text: string;
}

/**
 * Trouve les littéraux bannis présents dans `source` (un fichier scanné). Une ligne portant le
 * marqueur `fiscal-const-ok` est ignorée (échappatoire pour un faux positif légitime documenté).
 */
export function findFiscalLeaks(source: string, banned: readonly string[]): FiscalLeak[] {
    if (banned.length === 0) return [];
    const escaped = banned.map(b => b.replace(/[.]/g, '\\.'));
    // (?<![\d.]) et (?![\d]) : ne pas matcher un littéral banni à l'intérieur d'un nombre plus grand
    // (ex. 58523 dans 585234, ou la partie décimale d'un autre nombre).
    const re = new RegExp(`(?<![\\d.])(${escaped.join('|')})(?![\\d])`, 'g');
    const rawLines = source.split('\n');
    const codeLines = stripComments(source).split('\n'); // sans commentaires (n° de ligne préservés)
    const leaks: FiscalLeak[] = [];
    codeLines.forEach((code, i) => {
        // Échappatoire vérifiée sur la ligne BRUTE (le marqueur vit dans un commentaire, déjà stripé du code).
        if (rawLines[i].includes(FISCAL_CONST_ESCAPE)) return;
        for (const m of code.matchAll(re)) {
            leaks.push({ value: m[1], line: i + 1, text: rawLines[i].trim() });
        }
    });
    return leaks;
}
