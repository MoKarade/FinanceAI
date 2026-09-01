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

// ⚠️⚠️ CE MODULE EST UNE HEURISTIQUE, ET IL LE RESTERA — lire ceci avant d'y ajouter un cas.
//
// Cinq passes de panel ont trouvé cinq défauts réels, chacun dans le correctif de la précédente :
// `a++ / 2`, puis `a++ + <regex>`, puis `x+++<regex>`, puis tout le JSX auto-fermant, puis un run
// précédé d'un mot-clé et un identifiant accentué. Le flux ne tarit pas, et il n'y a aucune raison
// qu'il tarisse : décider si un `/` ouvre une regex ou une division exige, en toute rigueur, le
// contexte grammatical — donc un vrai analyseur.
//
// Ce module ne PEUT PAS en utiliser un : `utils/chartDataSumGuard.ts` l'importe et part dans le
// bundle du navigateur, et `typescript` est une devDependency. La contrainte même qui a fixé
// l'emplacement de ce fichier (pur, sans `node:fs`, atteignable depuis le bundle) interdit la
// solution structurelle. On ne poursuit donc pas l'approximation : on la BORNE et on la surveille.
//
// Le filet est `tests/guards/stripCommentsRatchet.test.ts`, dont le canari compare LIGNE PAR LIGNE
// ce que ce module garde à ce que garderait la version naïve. Il est la vraie garantie du lot ;
// l'heuristique n'en est que la meilleure approximation atteignable sous la contrainte. Un cas neuf
// se corrige ici SI le canari ou un test le montre — jamais par anticipation d'un cas exotique.

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
 *  Borne assumée : une accolade fermante — ou une parenthèse, `if (cond) /re/.exec(x)` — peut aussi
 *  terminer un BLOC plutôt qu'une expression, après quoi un `/` serait une vraie regex lue comme une
 *  division. Le cas est rarissime (aucune occurrence dans le dépôt, vérifié) et le compromis inverse
 *  — casser tout le JSX — serait bien pire.
 *
 *  ⚠️⚠️ MAIS l'erreur n'est PAS « bornée à la ligne », contrairement à ce que la première version de
 *  ce paragraphe affirmait. Cette borne ne vaut que dans l'AUTRE sens (une division prise pour une
 *  regex : l'état `regex` se referme bien sur le `\n`). Dans CE sens-ci, l'automate reste en `code`
 *  et lit le CONTENU de la regex comme du code — or une classe de caractères peut légalement porter
 *  la séquence d'ouverture d'un commentaire de bloc, qui n'est alors refermée que par le prochain
 *  marqueur littéral, éventuellement jamais. MESURÉ : le reste du fichier est blanchi, et une garde
 *  bâtie dessus devient aveugle SANS rien de rouge. C'est pourquoi le test canari de
 *  `tests/guards/stripCommentsRatchet.test.ts` mesure la part de code restante FICHIER PAR FICHIER :
 *  l'agrégat du dépôt ne bougerait pas d'un fichier avalé. Une garantie fausse écrite sur un outil
 *  qui sert de source unique est pire que pas de garantie (4e passe du panel). */
const PEUT_TERMINER_UNE_EXPRESSION = /[\p{L}\p{N}_$)\]}"'`]/u;

/** Un MOT-CLÉ se termine par une lettre, donc `PEUT_TERMINER_UNE_EXPRESSION` l'accepte — à tort :
 *  `return ++x` est un incrément PRÉFIXE, il n'y a rien à incrémenter à gauche. Sans cette liste,
 *  `return ++<regex>` faisait classer le `/` en division et engloutissait la suite du fichier
 *  (5e passe du panel, mesuré). */
const MOTS_CLES_AVANT_UNE_EXPRESSION = new Set([
    'return', 'typeof', 'void', 'delete', 'yield', 'throw', 'case', 'new', 'in', 'of', 'await',
    'else', 'do', 'instanceof',
]);
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
        let debut = dernierSignificatifIndex;
        while (debut > 0 && source[debut - 1] === dernierSignificatif) debut--;
        const longueurDuRun = dernierSignificatifIndex - debut + 1;
        if (longueurDuRun % 2 !== 0) return false;
        // ⚠️ La parité ne suffit pas : elle dit que le run SE TERMINE par un `++` complet, pas qu'il
        // est POSTFIXÉ. Dans `a + ++/re/…`, le run est préfixe — ce qui le précède est un opérateur,
        // donc il n'y a rien à incrémenter à gauche et le `/` ouvre une vraie regex. On exige donc
        // que le run touche quelque chose qui peut terminer une expression (4e passe du panel).
        let avant = debut - 1;
        while (avant >= 0 && /\s/.test(source[avant])) avant--;
        if (avant < 0 || !PEUT_TERMINER_UNE_EXPRESSION.test(source[avant])) return false;
        // Un mot-clé se termine aussi par une lettre : on remonte le mot entier pour le distinguer
        // d'un identifiant. `\p{L}` avec le drapeau `u` — `\w` seul laisserait passer un identifiant
        // ACCENTUÉ, plausible dans un dépôt qui écrit tout en français (5e passe du panel).
        let motDebut = avant;
        while (motDebut > 0 && /[\p{L}\p{N}_$]/u.test(source[motDebut - 1])) motDebut--;
        const mot = source.slice(motDebut, avant + 1);
        return !MOTS_CLES_AVANT_UNE_EXPRESSION.has(mot);
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

/**
 * Variante JSX : `stripComments` PLUS les accolades qui n'enveloppaient qu'un commentaire.
 *
 * ⚠️ Pourquoi elle existe (mesuré au lot 52). `stripComments` est un décommenteur JavaScript : dans
 * `{/* … *​/}`, il blanchit le bloc mais laisse `{` et `}` — en JS ce sont du code. Les décommenteurs
 * ad hoc qu'il remplace, eux, retiraient le motif JSX ENTIER, accolades comprises. Un scan qui
 * cherche `</label>\s*<input` voyait donc `</label>   {   }   <input` et perdait la paire : une
 * garde de `AdvancedProjectionParams` est passée de 40 à 39 champs vus, silencieusement, à la seule
 * migration. Un décommenteur plus correct peut casser un appelant qui dépendait de son ancienne
 * approximation — c'est le vrai risque de ce genre de consolidation, et il ne se voit qu'en
 * REJOUANT chaque garde.
 *
 * Contrat identique pour le reste : on BLANCHIT (mêmes lignes, mêmes colonnes, même longueur), et on
 * ne touche qu'aux accolades dont le contenu est devenu entièrement blanc — une accolade qui portait
 * du code reste intacte.
 */
export function stripCommentsJsx(source: string): string {
    const sansCommentaires = stripComments(source);
    // `{` suivi de blancs seulement, puis `}` : c'est exactement ce que devient `{/* … *​/}`.
    return sansCommentaires.replace(/\{(\s*)\}/g, (_m, blancs: string) => ` ${blancs} `);
}
