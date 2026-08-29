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

/** Un `/` ouvre une REGEX (et non une division) si ce qui précède ne peut pas terminer une
 *  expression. Heuristique standard, suffisante ici : le pire cas d'une erreur de jugement est de
 *  traiter une division comme une regex sur UNE ligne, jamais d'avaler un fichier (l'état `regex`
 *  se referme sur le `\n`).
 *
 *  ⚠️ Elle reconnaît aussi `++`/`--` POSTFIXÉS, qui terminent une expression : avec le seul dernier
 *  caractère, `a++ / 2` se lisait comme une ouverture de regex — le dernier caractère est `+` — et
 *  le commentaire qui suivait survivait dans la sortie « décommentée ». C'est précisément le défaut
 *  que ce module existe pour empêcher : une garde d'absence se remettrait à matcher de la PROSE.
 *
 *  ⚠️⚠️ Et le premier correctif a introduit le défaut INVERSE, trouvé par la 2e passe du panel : en
 *  regardant « les deux derniers caractères SIGNIFICATIFS », il confondait le token `++` avec deux
 *  opérateurs `+` séparés par une espace. Or `a++ + /b…/.test(y)` (avec un vrai littéral de regex
 *  après le second `+`) est du JS valide : traité comme une division, l'automate restait collé en
 *  état `regex` et avalait le commentaire suivant. D'où l'exigence d'ADJACENCE dans la source — les
 *  deux caractères doivent se toucher, ce qui est la définition d'un token `++`. Mesuré dans les
 *  deux sens, avant et après correction.
 *
 *  ⚠️ Et l'exemple ne peut pas s'écrire littéralement ici : la séquence de fermeture d'un commentaire
 *  de bloc apparaît dans ce regex, et elle a refermé ce commentaire-ci au premier jet. Le module
 *  documente donc un piège de syntaxe dans lequel sa propre documentation est tombée.
 *
 *  ⚠️ La classe inclut `}`, `"`, `'` et `` ` `` — sans eux, **tout JSX auto-fermant** ouvrait un faux
 *  état regex : dans `<Icon className="a" />`, le caractère avant le `/` est un guillemet, et dans
 *  `<Icon n={1} />` c'est une accolade. Mesuré : 90 fichiers `.tsx` du dépôt portent la première
 *  forme. Aucun n'était suivi d'un commentaire de fin de ligne — donc rien n'était perdu
 *  aujourd'hui — mais c'était la forme la plus RÉPANDUE du défaut, pas la plus rare.
 *
 *  Borne assumée : une accolade fermante peut aussi terminer un BLOC (`if (…) { … }`), après quoi
 *  un `/` serait une regex. Le cas est rarissime en pratique et l'erreur reste bornée à la ligne
 *  (l'état `regex` se referme sur le `\n`) ; l'inverse — casser tout le JSX du dépôt — ne l'est pas. */
const PEUT_TERMINER_UNE_EXPRESSION = /[\w$)\]}"'`]/;
const SIGNES_D_INCREMENT = new Set(['+', '-']);

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
    let dernierSignificatifIndex = -1;

    const blanchir = (c: string) => out.push(c === '\n' ? '\n' : ' ');
    const garder = (c: string, index: number) => {
        out.push(c);
        if (!/\s/.test(c)) { dernierSignificatif = c; dernierSignificatifIndex = index; }
    };
    /**
     * Un `++`/`--` POSTFIXÉ termine une expression, donc le `/` qui suit est une DIVISION.
     *
     * Ce qui départage n'est pas l'adjacence de DEUX signes mais la PARITÉ du run de signes
     * identiques qui se touchent dans la source, parce que JS tokenise gloutonnement de gauche à
     * droite : `x++` est un run de 2 (pair) → le dernier signe appartient bien à un `++`, donc fin
     * d'expression ; `x+++` est un run de 3 (impair) → il se lit `x`, `++`, puis un `+` binaire
     * SEUL, et ce qui suit est un vrai littéral de regex.
     *
     * ⚠️ Les trois versions de cette fonction ont été fausses, chacune dans le sens inverse de la
     * précédente : un seul caractère (`a++ / 2` pris pour une regex), puis deux caractères
     * significatifs (`a++ + <regex>` pris pour une division), puis deux caractères adjacents
     * (`x+++<regex>` pris pour une division). Trois passes de panel, trois récoltes. La parité est
     * la première formulation qui décrit la RÈGLE de tokenisation au lieu d'en approcher un cas.
     */
    const suitUnIncrementPostfixe = () => {
        if (!SIGNES_D_INCREMENT.has(dernierSignificatif)) return false;
        let n = 0;
        for (let k = dernierSignificatifIndex; k >= 0 && source[k] === dernierSignificatif; k--) n++;
        return n % 2 === 0;
    };
    const finDExpression = () =>
        PEUT_TERMINER_UNE_EXPRESSION.test(dernierSignificatif) || suitUnIncrementPostfixe();

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
                garder(c, i);
                if (c === '\\') { const n = source[++i]; if (n !== undefined) garder(n, i); }
                else if (c === fin || c === '\n') etat = 'code'; // `\n` : chaîne non terminée, on ne mange pas le reste
                break;
            }
            case 'gabarit':
                garder(c, i);
                if (c === '\\') { const n = source[++i]; if (n !== undefined) garder(n, i); }
                else if (c === '`') etat = 'code';
                else if (c === '$' && suivant === '{') { garder(suivant, i + 1); i++; gabarits.push(profondeurAccolades); profondeurAccolades++; etat = 'code'; }
                break;
            case 'regex':
                garder(c, i);
                if (c === '\\') { const n = source[++i]; if (n !== undefined) garder(n, i); }
                else if (c === '[') { // classe de caractères : un `/` y est du contenu
                    while (i + 1 < source.length && source[i + 1] !== ']') {
                        const n = source[++i]; garder(n, i);
                        if (n === '\\' && i + 1 < source.length) garder(source[++i], i);
                    }
                } else if (c === '/' || c === '\n') etat = 'code';
                break;
            case 'code':
            default:
                if (c === '/' && suivant === '/') { blanchir(c); blanchir(suivant); i++; etat = 'ligne'; }
                else if (c === '/' && suivant === '*') { blanchir(c); blanchir(suivant); i++; etat = 'bloc'; }
                else if (c === "'") { garder(c, i); etat = 'apostrophe'; }
                else if (c === '"') { garder(c, i); etat = 'guillemet'; }
                else if (c === '`') { garder(c, i); etat = 'gabarit'; }
                else if (c === '/' && !finDExpression()) { garder(c, i); etat = 'regex'; }
                else {
                    garder(c, i);
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
