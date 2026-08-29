// [GUARD-STRIPCOMMENTS-CONSOLIDER] L'extracteur se teste sur des CAS DE SYNTAXE, pas sur son
// intention — leçon `GARDE-BORNEE-PAR-CLASSE-NEGATIVE` du dépôt. Un décommenteur qui se trompe ne
// crie pas : il rend un fichier plausible, amputé, et toutes les gardes bâties dessus deviennent
// silencieusement aveugles à ce qu'il a mangé.
import { describe, it, expect } from 'vitest';
import { stripComments, partDeCodeRestante } from '../../utils/stripComments';

// Le contrat de GÉOMÉTRIE, que les gardes fiscales et `chartDataSumGuard` exigent (elles reportent
// des numéros de ligne et travaillent ligne à ligne).
const memeGeometrie = (src: string) => {
    const out = stripComments(src);
    expect(out).toHaveLength(src.length);
    expect(out.split('\n')).toHaveLength(src.split('\n').length);
    return out;
};

describe('[GUARD-STRIPCOMMENTS-CONSOLIDER] stripComments', () => {
    it('retire les commentaires de ligne et de bloc en préservant lignes et colonnes', () => {
        const out = memeGeometrie('const a = 1; // deux\nconst b = /* trois */ 2;\n');
        expect(out).toContain('const a = 1;');
        expect(out).not.toContain('deux');
        expect(out).not.toContain('trois');
        // La colonne de `2` est intacte : c'est ce qui permet à une garde de pointer une position.
        expect(out.split('\n')[1].indexOf('2')).toBe('const b = /* trois */ '.length);
    });

    it('NE mange PAS une URL dans un littéral de chaîne — le défaut qui motive ce module', () => {
        const src = `const u = 'https://api.exemple.com/v1'; const seuil = 103000;`;
        const out = stripComments(src);
        expect(out).toContain("'https://api.exemple.com/v1'");
        // ⚠️ L'assertion qui compte vraiment : ce qui SUIT l'URL sur la même ligne survit. Un
        // décommenteur naïf ampute à partir du `//` et fait disparaître la constante — un faux
        // NÉGATIF silencieux pour toute garde fiscale.
        expect(out).toContain('103000');
    });

    it('protège les trois formes de littéral, et les gabarits imbriqués', () => {
        const src = [
            `const a = "x // pas un commentaire";`,
            'const b = `y /* pas un bloc */ z`;',
            'const c = `debut ${ obj.f("http://h") } fin`;',
        ].join('\n');
        const out = memeGeometrie(src);
        expect(out).toContain('x // pas un commentaire');
        expect(out).toContain('y /* pas un bloc */ z');
        // L'interpolation revient bien DANS le gabarit après `}` : sans la pile, la suite du
        // gabarit serait traitée comme du code et `fin` pourrait être perdu.
        expect(out).toContain('${ obj.f("http://h") } fin');
    });

    it('protège un littéral de REGEX, y compris ses classes de caractères', () => {
        // Le cas le plus vicieux du dépôt : une regex QUI DÉCRIT un commentaire.
        const src = 'const re = /\\/\\*[\\s\\S]*?\\*\\//g; const apres = 42;';
        const out = stripComments(src);
        expect(out).toContain('const apres = 42;');
        const src2 = 'const cls = /[/*]+/; const apres = 7;';
        expect(stripComments(src2)).toContain('const apres = 7;');
    });

    it('distingue une DIVISION d\'une ouverture de regex', () => {
        const out = stripComments('const r = total / 2; const s = (a) / b; const t = 3;');
        // Si `/` après `total` avait été lu comme une regex, tout le reste de la ligne serait avalé.
        expect(out).toContain('const t = 3;');
    });

    it('traite `a++ / 2` comme une DIVISION, pas comme une ouverture de regex', () => {
        // Trouvé par le panel (PR #763). Avec une heuristique à UN seul caractère, le `+` de `a++`
        // ne pouvant pas terminer une expression, le `/` ouvrait un faux état regex — et le
        // commentaire qui suivait survivait dans la sortie « décommentée ». C'est exactement le
        // défaut que ce module existe pour empêcher : une garde d'absence se remettrait à matcher
        // de la PROSE. Aucun code n'était perdu (l'état se referme sur le saut de ligne), mais
        // l'inverse de la promesse se produisait.
        expect(stripComments('a++ / 2; // note')).toBe('a++ / 2;        ');
        expect(stripComments('a-- / 2; // note')).toBe('a-- / 2;        ');
        // ⚠️ Le défaut INVERSE, introduit par le premier correctif et trouvé par la 2e passe du
        // panel : deux opérateurs `+` séparés par une espace ne forment PAS un `++`, et ce qui suit
        // est un VRAI littéral de regex. Lu comme une division, l'automate restait collé en état
        // `regex` et avalait le commentaire. C'est l'ADJACENCE des deux signes dans la source qui
        // départage — et c'est le seul cas qui distingue les deux versions du correctif.
        expect(stripComments('a++ + /b*/.test(y); // note')).toBe('a++ + /b*/.test(y);        ');
        // Contre-épreuve : le cas voisin qui marchait déjà, et une vraie regex en tête d'expression.
        expect(stripComments('a() / 2; // note')).toBe('a() / 2;        ');
        expect(stripComments('const re = /a\\/b/; // note')).toBe('const re = /a\\/b/;        ');
    });

    it('lit la PARITÉ du run de signes, pas seulement deux caractères adjacents', () => {
        // 3e passe du panel. JS tokenise gloutonnement de gauche à droite : `x+++` se lit `x`, `++`,
        // puis un `+` binaire SEUL — donc ce qui suit est un vrai littéral de regex. Un run PAIR
        // termine une expression (`x++`), un run IMPAIR non. Vérifié contre le vrai parseur : le
        // commentaire de ces lignes est bien un commentaire en JS réel.
        expect(stripComments('const r = x+++/b*/.test(x); // note')).toBe('const r = x+++/b*/.test(x);        ');
        expect(stripComments('const r = x---/b*/.test(x); // note')).toBe('const r = x---/b*/.test(x);        ');
    });

    it('ne casse pas le JSX auto-fermant — la forme la PLUS répandue du défaut', () => {
        // Dans `<Icon className="a" />`, le caractère avant le `/` est un guillemet ; dans
        // `<Icon n={1} />`, une accolade. Ni l'un ni l'autre ne terminait « une expression » selon
        // la première classe, donc le `/` ouvrait un faux état regex et tout commentaire de fin de
        // ligne survivait. Mesuré : 90 fichiers `.tsx` du dépôt portent la première forme — le
        // défaut était le plus répandu des trois, pas le plus exotique.
        expect(stripComments('const el = <Icon className="a" />; // note')).toBe('const el = <Icon className="a" />;        ');
        expect(stripComments('const el = <Icon n={1} />; // note')).toBe('const el = <Icon n={1} />;        ');
        expect(stripComments('const s = `x`; // note')).toBe('const s = `x`;        ');
    });

    it('un run précédé d\'un MOT-CLÉ est préfixe, pas postfixe', () => {
        // 5e passe. Un mot-clé se termine par une lettre, donc la classe « peut terminer une
        // expression » l'acceptait — à tort : `return ++x` est un incrément PRÉFIXE. Combiné à une
        // classe de caractères portant la séquence d'ouverture d'un bloc, le `/` mal classé faisait
        // ENGLOUTIR tout le reste du fichier.
        const src = "function t(x: string) {\n    return ++/[/*]/.test(x);\n}\nconst APRES = 'survivre';\n";
        expect(stripComments(src)).toContain("const APRES = 'survivre';");
    });

    it('reconnaît un identifiant ACCENTUÉ comme fin d\'expression', () => {
        // 5e passe, l'autre sens : `\w` ne matche pas les lettres accentuées sans le drapeau `u`.
        // Dans un dépôt qui écrit tout en français, un identifiant accentué est plausible — et il
        // faisait survivre le commentaire de fin de ligne dans la sortie « décommentée ».
        expect(stripComments('const r = café++ / 2; // note')).toBe('const r = café++ / 2;        ');
    });

    it('ne mange pas le reste du fichier sur une chaîne non terminée', () => {
        // Une apostrophe orpheline (français dans un commentaire mal formé, fichier tronqué…) ne
        // doit pas transformer le reste du fichier en littéral.
        const out = stripComments("const a = 'oups\nconst b = 99;");
        expect(out).toContain('const b = 99;');
    });

    it('laisse un fichier sans commentaire stricement identique', () => {
        const src = 'const a = 1;\nconst b = 2;\n';
        expect(stripComments(src)).toBe(src);
    });
});

describe('[GUARD-STRIPCOMMENTS-CONSOLIDER] partDeCodeRestante', () => {
    it('mesure les caractères NON BLANCS, jamais la longueur', () => {
        const brut = '// '.repeat(30) + '\nconst a = 1;';
        const decommente = stripComments(brut);
        // ⚠️ La longueur est INCHANGÉE par construction (on blanchit) : une anti-vacuité fondée sur
        // elle vaudrait toujours 1 et ne protégerait de rien. C'est exactement le piège que cette
        // fonction existe pour éviter.
        expect(decommente).toHaveLength(brut.length);
        expect(partDeCodeRestante(brut, decommente)).toBeLessThan(0.2);
    });

    it('rend 1 sur un fichier sans commentaire, et 1 sur un fichier vide', () => {
        const src = 'const a = 1;';
        expect(partDeCodeRestante(src, stripComments(src))).toBe(1);
        expect(partDeCodeRestante('', '')).toBe(1);
    });
});
