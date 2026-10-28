// tests/helpers/donneesPerso.ts
//
// [DONNEES-PERSO-GARDE] Fonctions PURES du verrou « aucune donnée personnelle dans un fichier versionné »
// (dépôt PUBLIC, FinanceAI#1238). Même modèle que la garde de DriveAI (#628) : on ne garde pas le texte
// à bannir en clair (ce serait republier la donnée), seulement son EMPREINTE.
//
// Deux familles de détecteurs :
//   1. des EMPREINTES de séquences de mots (`empreintes.json`) : les formulations réelles retirées ;
//   2. des FORMES (regex) : « <objet financier> de Marc », courriel webmail, téléphone, code postal.
//
// ⚠️ Rien ici n'imprime le texte trouvé : un résultat est (fichier, ligne, catégorie). Une garde qui
// affichait la donnée la republierait dans le journal CI, public lui aussi.

/** Fin du hachage cyrb53 : mélange final de l'état (h1, h2) et mise en hexadécimal. */
function finaliser(h1: number, h2: number): string {
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/** Empreinte 53 bits (cyrb53) en hexadécimal — pas de la cryptographie : un index à sens unique suffisant. */
export function empreinte(texte: string): string {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < texte.length; i++) {
        const c = texte.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 2654435761);
        h2 = Math.imul(h2 ^ c, 1597334677);
    }
    return finaliser(h1, h2);
}

/** Mots minuscules, sans accents, sur [a-z0-9] : « −1 877,00 $ » → ["1", "877", "00"]. */
export function mots(texte: string): string[] {
    return texte
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
}

export interface Trouvaille {
    ligne: number;
    categorie: string;
}

export interface Empreintes {
    /** Longueurs (en mots) des séquences empreintées. */
    longueurs: number[];
    hachages: string[];
}

/**
 * Séquences de mots du texte dont l'empreinte figure dans la liste. Les lignes sont celles du 1er mot.
 * L'empreinte est calculée de façon incrémentale (état du hachage copié à chaque longueur voulue) :
 * le scan de tout le dépôt reste de l'ordre de la seconde.
 */
export function trouverEmpreintes(texte: string, liste: Empreintes): Trouvaille[] {
    const connus = new Set(liste.hachages);
    const longueurs = new Set(liste.longueurs);
    const maxN = Math.max(0, ...liste.longueurs);
    const jetons: { mot: string; ligne: number }[] = [];
    texte.split('\n').forEach((l, i) => {
        for (const mot of mots(l)) jetons.push({ mot, ligne: i + 1 });
    });
    const trouves: Trouvaille[] = [];
    for (let i = 0; i < jetons.length; i++) {
        let h1 = 0xdeadbeef;
        let h2 = 0x41c6ce57;
        for (let n = 1; n <= maxN && i + n <= jetons.length; n++) {
            const mot = n === 1 ? jetons[i].mot : ' ' + jetons[i + n - 1].mot;
            for (let k = 0; k < mot.length; k++) {
                const c = mot.charCodeAt(k);
                h1 = Math.imul(h1 ^ c, 2654435761);
                h2 = Math.imul(h2 ^ c, 1597334677);
            }
            if (longueurs.has(n) && connus.has(finaliser(h1, h2))) trouves.push({ ligne: jetons[i].ligne, categorie: 'empreinte' });
        }
    }
    return trouves;
}

const OBJETS = '(?:positions?|transactions?|comptes?|avoirs?|patrimoine|soldes?|hypothèque|portefeuille|titres?|placements?|REER|CELI|CRI|dépenses?|revenus?|dettes?)';
// `\\b` ne voit pas les lettres accentuées en tête de mot (« état ») : bornes Unicode explicites.
const DEB = '(?<![\\p{L}\\p{N}])';
const FIN = '(?![\\p{L}\\p{N}])';

/** Formes interdites : (catégorie, regex). Chaque regex est SANS drapeau `g` (usage ligne à ligne). */
const FORMES: ReadonlyArray<readonly [string, RegExp]> = [
    ['bien-de-marc', new RegExp(`${DEB}${OBJETS}\\s+(?:réel(?:le)?s?\\s+)?(?:de|du|d['’])\\s*Marc${FIN}`, 'iu')],
    ['reel-de-marc', new RegExp(`${DEB}(?:état|données)\\s+réel\\p{L}*\\s+de\\s+Marc${FIN}`, 'iu')],
    ['ses-vraies', new RegExp(`${DEB}ses\\s+(?:vraies?|réel(?:le)?s?)\\s+(?:positions?|transactions?|dépenses?|comptes?)${FIN}`, 'iu')],
    ['vraies-de-marc', new RegExp(`${DEB}(?:vraies?|réel(?:le)?s?)\\s+(?:positions?|transactions?|dépenses?|comptes?)\\s+de\\s+Marc${FIN}`, 'iu')],
    ['courriel-webmail', /[\w.+-]+@(?:gmail|hotmail|outlook|yahoo|icloud|live)\.[a-z]{2,}/i],
    // Les numéros fictifs réservés (555-01xx) sont tolérés : ce sont les valeurs d'exemple qu'on veut voir.
    ['telephone', /(?<![\d.])\(?(?!\d{3}\)?[ .-]555[ .-]01)\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?!\d)/],
    ['code-postal-ca', /\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d\b/],
];

export function trouverFormes(texte: string): Trouvaille[] {
    const trouves: Trouvaille[] = [];
    texte.split('\n').forEach((l, i) => {
        for (const [categorie, re] of FORMES) if (re.test(l)) trouves.push({ ligne: i + 1, categorie });
    });
    return trouves;
}

export function analyser(texte: string, liste: Empreintes): Trouvaille[] {
    return [...trouverEmpreintes(texte, liste), ...trouverFormes(texte)];
}
