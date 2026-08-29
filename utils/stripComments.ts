// utils/stripComments.ts
//
// [GUARD-STRIPCOMMENTS-CONSOLIDER] Le décommenteur PARTAGÉ des gardes-scan.
//
// Pourquoi ici et pas dans `tests/` : `utils/chartDataSumGuard.ts` est importé par
// `components/projection/FutureDetailModal.tsx`, donc il part dans le bundle du navigateur. Un
// helper qui vivrait sous `tests/` (et qui touche `node:fs`) lui serait INATTEIGNABLE — la leçon
// `HELPER-INAPPELABLE-PAR-SON-CONSOMMATEUR` du dépôt, exactement. Ce module est donc PUR : il
// transforme une chaîne, il ne lit aucun fichier. La lecture reste dans `tests/helpers/source.ts`.
//
// ⚠️ POURQUOI IL BLANCHIT AU LIEU DE SUPPRIMER. Les copies existantes ne partageaient pas le même
// contrat : celles d'`utils/` remplacent les commentaires par des ESPACES (les gardes fiscales
// reportent des numéros de ligne, et `chartDataSumGuard` travaille ligne par ligne), là où celle de
// `tests/helpers/source.ts` les supprimait purement. Blanchir est le sur-ensemble : lignes et
// colonnes sont préservées, et qui n'en a pas besoin ne perd rien. L'inverse aurait cassé en
// silence les gardes qui pointent une ligne.
//
// ⚠️ ET POURQUOI IL N'EST PAS UNE REGEX. `'https://api.example.com'` contient `//` : un décommenteur
// naïf ampute la ligne à partir de là. Ce n'est pas théorique — **37 fichiers** du dépôt portent au
// moins une URL dans un littéral de chaîne (mesuré). `utils/fiscalConstantsGuard.ts` documentait
// même le défaut en le jugeant « irréaliste en code fiscal » : vrai pour LUI, faux dès que le même
// décommenteur sert ailleurs. C'est la raison pour laquelle le ticket exigeait de durcir AVANT
// l'adoption large.

type Etat = 'code' | 'ligne' | 'bloc' | 'apostrophe' | 'guillemet' | 'gabarit' | 'regex';

/** Un `/` ouvre une REGEX (et non une division) si le dernier caractère significatif ne peut pas
 *  terminer une expression. Heuristique standard, suffisante ici : le pire cas d'une erreur de
 *  jugement est de traiter une division comme une regex sur une ligne, jamais d'avaler un fichier. */
const PEUT_TERMINER_UNE_EXPRESSION = /[\w$)\]]/;

/**
 * Retire les commentaires en préservant la GÉOMÉTRIE du fichier : chaque caractère de commentaire
 * devient une espace, chaque saut de ligne est conservé. Le résultat a donc exactement la même
 * longueur, le même nombre de lignes et les mêmes colonnes que la source.
 *
 * Ce qui est protégé, et que les six copies précédentes ne protégeaient pas : les littéraux de
 * chaîne (`'…'`, `"…"`), les gabarits (`` `…` ``, y compris leurs interpolations imbriquées) et les
 * littéraux d'expression régulière — dans lesquels `//` et `/*` sont du CONTENU, pas des marqueurs.
 */
export function stripComments(source: string): string {
    const out: string[] = [];
    let etat: Etat = 'code';
    // Pile des `${…}` d'un gabarit : on doit savoir qu'en refermant une accolade on retourne
    // dans le gabarit et pas dans du code ordinaire.
    const gabarits: number[] = [];
    let profondeurAccolades = 0;
    let dernierSignificatif = '';

    const blanchir = (c: string) => out.push(c === '\n' ? '\n' : ' ');
    const garder = (c: string) => { out.push(c); if (!/\s/.test(c)) dernierSignificatif = c; };

    for (let i = 0; i < source.length; i++) {
        const c = source[i];
        const suivant = source[i + 1] ?? '';

        switch (etat) {
            case 'ligne':
                if (c === '\n') { etat = 'code'; out.push('\n'); } else blanchir(c);
                break;
            case 'bloc':
                if (c === '*' && suivant === '/') { blanchir(c); blanchir(suivant); i++; etat = 'code'; }
                else blanchir(c);
                break;
            case 'apostrophe':
            case 'guillemet': {
                const fin = etat === 'apostrophe' ? "'" : '"';
                garder(c);
                if (c === '\\') { const n = source[++i]; if (n !== undefined) garder(n); }
                else if (c === fin || c === '\n') etat = 'code'; // `\n` : chaîne non terminée, on ne mange pas le reste
                break;
            }
            case 'gabarit':
                garder(c);
                if (c === '\\') { const n = source[++i]; if (n !== undefined) garder(n); }
                else if (c === '`') etat = 'code';
                else if (c === '$' && suivant === '{') { garder(suivant); i++; gabarits.push(profondeurAccolades); profondeurAccolades++; etat = 'code'; }
                break;
            case 'regex':
                garder(c);
                if (c === '\\') { const n = source[++i]; if (n !== undefined) garder(n); }
                else if (c === '[') { // classe de caractères : un `/` y est du contenu
                    while (i + 1 < source.length && source[i + 1] !== ']') {
                        const n = source[++i]; garder(n);
                        if (n === '\\' && i + 1 < source.length) garder(source[++i]);
                    }
                } else if (c === '/' || c === '\n') etat = 'code';
                break;
            case 'code':
            default:
                if (c === '/' && suivant === '/') { blanchir(c); blanchir(suivant); i++; etat = 'ligne'; }
                else if (c === '/' && suivant === '*') { blanchir(c); blanchir(suivant); i++; etat = 'bloc'; }
                else if (c === "'") { garder(c); etat = 'apostrophe'; }
                else if (c === '"') { garder(c); etat = 'guillemet'; }
                else if (c === '`') { garder(c); etat = 'gabarit'; }
                else if (c === '/' && !PEUT_TERMINER_UNE_EXPRESSION.test(dernierSignificatif)) { garder(c); etat = 'regex'; }
                else {
                    garder(c);
                    if (c === '{') profondeurAccolades++;
                    else if (c === '}') {
                        profondeurAccolades--;
                        if (gabarits.length > 0 && profondeurAccolades === gabarits[gabarits.length - 1]) {
                            gabarits.pop();
                            etat = 'gabarit';
                        }
                    }
                }
                break;
        }
    }
    return out.join('');
}

/**
 * Part de caractères NON BLANCS restants après décommentage — l'anti-vacuité d'une garde d'absence.
 *
 * ⚠️ Elle ne peut PAS se mesurer sur la longueur, contrairement à ce que faisait la première
 * version du lecteur : puisqu'on blanchit, la longueur est INCHANGÉE par construction, donc un
 * ratio de longueurs vaudrait toujours 1 et l'anti-vacuité serait elle-même vacueuse.
 */
export function partDeCodeRestante(brut: string, decommente: string): number {
    const denominateur = brut.replace(/\s/g, '').length;
    if (denominateur === 0) return 1;
    return decommente.replace(/\s/g, '').length / denominateur;
}
