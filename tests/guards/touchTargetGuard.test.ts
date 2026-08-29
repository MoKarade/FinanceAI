// [A11Y-TOUCH-TARGET-TINY] Une action ne peut pas avoir une cible de 16 px.
//
// ⚠️ WCAG 2.5.8 (AA) exige 24×24 px ; le dépôt vise 44×44 (`.touch-target`, `index.css`). Le défaut
// mesuré : des boutons de suppression réduits à leur glyphe — un « × » de ~16 px, sans le moindre
// padding — donc un risque de mis-tap sur une action DESTRUCTIVE.
//
// ⚠️ Le patron de correctif est `p-2 -m-2` et PAS `touch-target` partout : il agrandit la zone
// cliquable de 8 px sur chaque bord et annule le décalage visuel par la marge négative, donc la mise
// en page ne bouge pas. Il ne vaut que pour un contrôle SANS fond ni bordure — sur un bouton bordé,
// le padding grossirait le visuel lui-même (cf. l'exemption `KPIStat` plus bas).
//
// ⚠️ Cette garde est née d'un RECENSEMENT, pas de la liste du ticket : celui-ci citait 6 sites, dont
// 2 faux (un halo décoratif, un paragraphe de texte) et avec des numéros de ligne périmés. Le scan
// en a trouvé 10, dont 4 boutons SANS nom accessible là où le ticket n'en signalait qu'un. Et le
// premier recenseur en manquait 4 : son retrait des accolades JSX n'était pas itératif, donc le
// « texte » d'un bouton à `onClick` multi-lignes contenait du code. Un recenseur se vérifie comme le
// reste (`UN-PERIMETRE-CITE-N-EST-PAS-UN-PERIMETRE-RECENSE`).
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { stripComments, partDeCodeRestante } from '../../utils/stripComments';

const racine = resolve(process.cwd(), 'components');

/** Ce que le scan NE compte PAS, avec sa raison — jamais une exemption muette. */
const EXCLUSIONS: ReadonlyArray<{ fichier: string; jeton: string; raison: string }> = [
    {
        fichier: 'KPIStat.tsx',
        jeton: 'cursor-help',
        raison: 'pastille d\'aide EN LIGNE à côté d\'un libellé : WCAG 2.5.8 exempte explicitement une '
            + 'cible inline dans un bloc de texte. Et le patron `p-2 -m-2` ne s\'y applique pas — le '
            + 'bouton porte une bordure visible, donc le padding grossirait le cercle (32 px) au lieu '
            + 'de la seule zone cliquable.',
    },
];

function fichiersTsx(dir: string): string[] {
    return readdirSync(dir).flatMap((nom) => {
        const chemin = join(dir, nom);
        if (statSync(chemin).isDirectory()) return fichiersTsx(chemin);
        return chemin.endsWith('.tsx') ? [chemin] : [];
    });
}

function lireCode(chemin: string): string {
    const brut = readFileSync(chemin, 'utf8');
    const code = stripComments(brut);
    if (brut.trim() !== '' && partDeCodeRestante(brut, code) < 0.05) {
        throw new Error(`${chemin} : décommentage suspect — une garde d'absence lue sur un fichier vidé serait vacueuse`);
    }
    return code;
}

/** Retire les accolades JSX en profondeur — une seule passe laisse le code des `onClick`. */
function sansAccolades(bloc: string): string {
    let courant = bloc;
    for (let i = 0; i < 10; i++) {
        const suivant = courant.replace(/\{[^{}]*\}/g, '');
        if (suivant === courant) break;
        courant = suivant;
    }
    return courant;
}

/**
 * Index du `>` qui ferme la balise `<button …>`, en ignorant ceux qui vivent dans une accolade JSX
 * ou une chaîne.
 *
 * ⚠️ Un `indexOf('>')` naïf tombe sur la FLÈCHE d'une lambda (`onKeyDown={(e) => …}`) et coupe le
 * bouton en plein attribut : le « contenu » devenait alors du code, et le bouton d'aide de `KPIStat`
 * — le seul cas exempté de cette garde — disparaissait du scan, faisant échouer le contrôle
 * d'exemption. Quatrième faux pas de ce recenseur, et le plus instructif : à ce stade, ce n'est plus
 * une regex qu'il faut, c'est un petit automate.
 */
function finBaliseOuvrante(bloc: string): number {
    let accolades = 0;
    let guillemet: string | null = null;
    for (let i = bloc.indexOf('<button'); i < bloc.length; i++) {
        const c = bloc[i];
        if (guillemet) { if (c === guillemet) guillemet = null; continue; }
        if (c === '"' || c === "'" || c === '`') { guillemet = c; continue; }
        if (c === '{') accolades++;
        else if (c === '}') accolades--;
        else if (c === '>' && accolades === 0) return i;
    }
    return bloc.indexOf('>');
}

/** La cible réelle en px : contenu + 2 × padding, ou la dimension imposée. */
function cibleSuffisante(classes: string, tailleContenu: number): boolean {
    if (classes.includes('touch-target')) return true;
    for (const m of classes.matchAll(/\b[wh]-(\d+)\b/g)) {
        if (Number(m[1]) * 4 >= 24) return true;
    }
    // ⚠️ La syntaxe ARBITRAIRE de Tailwind (`min-w-[24px]`) est celle que le dépôt emploie déjà pour
    // dimensionner une cible tactile. Ne pas la reconnaître faisait rendre DEUX faux positifs par
    // cette garde — sur des boutons précisément corrigés pour ça. Une garde qui ignore la forme
    // employée par le code qu'elle surveille accuse le code sain.
    for (const m of classes.matchAll(/\bmin-[wh]-\[(\d+)px\]/g)) {
        if (Number(m[1]) >= 24) return true;
    }
    const paddings = [...classes.matchAll(/\bp[xy]?-(\d+(?:\.\d+)?)\b/g)].map((m) => Number(m[1]) * 4);
    const padding = paddings.length > 0 ? Math.max(...paddings) : 0;
    return tailleContenu + 2 * padding >= 24;
}

interface Bouton { chemin: string; ligne: number; classes: string; nomme: boolean; taille: number }

function boutonsIconeSeule(): Bouton[] {
    const out: Bouton[] = [];
    for (const chemin of fichiersTsx(racine)) {
        const code = lireCode(chemin);
        for (const m of code.matchAll(/<button\b[\s\S]*?<\/button>/g)) {
            const bloc = m[0];
            const ligne = code.slice(0, m.index ?? 0).split('\n').length;
            const icones = [...bloc.matchAll(/<Icon\s+name="[^"]+"\s+size=\{(\d+)\}/g)].map((i) => Number(i[1]));

            // ⚠️ Le CONTENU du bouton, pas le bloc entier : les attributs portent des accolades
            // (`onClick={…}`, `className={…}`) qui n'ont rien à voir avec ce qui est AFFICHÉ.
            const contenu = bloc.slice(finBaliseOuvrante(bloc) + 1, bloc.lastIndexOf('</button>'));

            // ⚠️ Un libellé DYNAMIQUE (`{title}`, `{item.name}`) rend un bouton parfaitement nommé —
            // par son texte. Le compter comme « icône seule » produisait SEPT faux positifs, tous
            // des boutons à libellé interpolé : `sansAccolades` effaçait le libellé, et il ne restait
            // qu'une flèche ou rien. Troisième faux positif de ce recenseur en trois itérations, ce
            // qui dit quelque chose sur les scans heuristiques de JSX : chacun se paie d'une
            // vérification à la main des cas qu'il sort.
            const texteDynamique = /\{[^{}]*\}/.test(contenu.replace(/<[^>]*>/g, ''));
            const texte = sansAccolades(contenu).replace(/<[^>]+>/g, '').trim();
            const iconeSeule = icones.length > 0 && texte === '' && !texteDynamique && Math.min(...icones) <= 18;
            const glyphe = icones.length === 0 && !texteDynamique && texte.length > 0 && texte.length <= 2;
            if (!iconeSeule && !glyphe) continue;
            const cls = bloc.match(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/);
            const classes = cls ? (cls[1] ?? cls[2] ?? cls[3] ?? '') : '';
            out.push({
                chemin: chemin.replace(`${process.cwd()}/`, ''),
                ligne,
                classes,
                nomme: /aria-label|title=/.test(bloc),
                taille: iconeSeule ? Math.min(...icones) : 16,   // le glyphe « × » fait ~16 px
            });
        }
    }
    return out;
}

describe('[A11Y-TOUCH-TARGET-TINY] cibles tactiles des actions icône-seule', () => {
    it('aucune cible sous 24×24, hors exemption déclarée', () => {
        const boutons = boutonsIconeSeule();
        const offenders = boutons
            .filter((b) => !cibleSuffisante(b.classes, b.taille))
            .filter((b) => !EXCLUSIONS.some((e) => b.chemin.endsWith(`/${e.fichier}`) && b.classes.includes(e.jeton)))
            .map((b) => `${b.chemin}:${b.ligne} (cible ≈ ${b.taille} px)`);

        // ANTI-VACUITÉ : le scan doit trouver de quoi juger. Un « aucun offender » sur un scan qui
        // ne reconnaît plus un seul bouton icône-seule ne prouverait rien.
        expect(boutons.length, 'aucun bouton icône-seule reconnu → le scan ne lit pas ce qu\'il croit')
            .toBeGreaterThanOrEqual(6);
        expect(offenders, `Cible(s) tactile(s) trop petite(s) :\n${offenders.join('\n')}`).toEqual([]);
    });

    it('tout bouton icône-seule porte un NOM ACCESSIBLE', () => {
        // Quatre `×` de `PatrimoineExtended` n'en avaient aucun : leur nom accessible était le glyphe
        // seul, donc un lecteur d'écran annonçait « × bouton » sur une action destructive.
        const anonymes = boutonsIconeSeule().filter((b) => !b.nomme).map((b) => `${b.chemin}:${b.ligne}`);
        expect(anonymes, `Bouton(s) sans aria-label ni title :\n${anonymes.join('\n')}`).toEqual([]);
    });

    it('chaque exemption est RÉELLE — une exemption périmée se retire', () => {
        for (const e of EXCLUSIONS) {
            const trouve = boutonsIconeSeule().some((b) => b.chemin.endsWith(`/${e.fichier}`) && b.classes.includes(e.jeton));
            expect(trouve, `exemption périmée : ${e.fichier} / ${e.jeton}`).toBe(true);
        }
    });
});
