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

/**
 * Retire les balises en profondeur, jusqu'au point fixe.
 *
 * ⚠️ Une seule passe de `replace(/<[^>]*>/g, '')` est INCOMPLÈTE — c'est le motif que CodeQL
 * signale en « incomplete multi-character sanitization » (2 alertes HIGH sur la première version de
 * ce fichier) : sur `<scr<script>ipt>`, la passe unique retire la balise intérieure et RECOMPOSE la
 * balise extérieure. Ici le résultat n'est jamais rendu — on compte des boutons dans du source —
 * donc l'alerte n'est pas exploitable, mais elle a raison sur le fond : boucler jusqu'au point fixe
 * coûte trois lignes et retire à la fois le défaut et le signal. Une alerte qu'on fait taire par
 * exemption reviendra sur le prochain fichier qui copie ce motif.
 */
function sansBalises(texte: string): string {
    let courant = texte;
    for (let i = 0; i < 10; i++) {
        const suivant = courant.replace(/<[^<>]*>/g, '');
        if (suivant === courant) break;
        courant = suivant;
    }
    return courant;
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

/**
 * La cible réelle en px, **PAR AXE** : contenu + 2 × padding de cet axe, ou la dimension imposée.
 *
 * ⚠️ Le premier jet prenait le `Math.max` des paddings et l'appliquait aux DEUX axes. Une cible
 * n'est pas carrée : `px-1.5 py-1` autour d'une icône de 14 px fait **26 × 22**, et cette version
 * la mesurait 26 × 26 — donc verte. C'est exactement le bouton « Retirer cette position »
 * d'`Investments.tsx`, resté sous WCAG 2.5.8 malgré une garde écrite pour ça. Même faute côté
 * dimensions : un `w-8` seul rendait `true` quelle que soit la HAUTEUR.
 *
 * ⚠️ Les deux axes se rendent séparément, sans les fusionner : un appelant qui n'a qu'un booléen ne
 * peut pas dire QUEL côté manque, et c'est cette information qui désigne la classe à corriger
 * (`py-` plutôt que `px-`).
 */
function cibleParAxe(classes: string, tailleContenu: number): { largeur: number; hauteur: number } {
    if (classes.includes('touch-target')) return { largeur: 44, hauteur: 44 };
    let largeur = tailleContenu;
    let hauteur = tailleContenu;
    const impose = (axe: 'w' | 'h', px: number) => {
        if (axe === 'w') largeur = Math.max(largeur, px);
        else hauteur = Math.max(hauteur, px);
    };
    for (const m of classes.matchAll(/\b([wh])-(\d+)\b/g)) impose(m[1] as 'w' | 'h', Number(m[2]) * 4);
    // ⚠️ La syntaxe ARBITRAIRE de Tailwind (`min-w-[24px]`) est celle que le dépôt emploie déjà pour
    // dimensionner une cible tactile. Ne pas la reconnaître faisait rendre DEUX faux positifs par
    // cette garde — sur des boutons précisément corrigés pour ça. Une garde qui ignore la forme
    // employée par le code qu'elle surveille accuse le code sain.
    for (const m of classes.matchAll(/\bmin-([wh])-\[(\d+)px\]/g)) impose(m[1] as 'w' | 'h', Number(m[2]));
    // `p-N` porte sur les deux axes, `px-N` sur la largeur, `py-N` sur la hauteur.
    for (const m of classes.matchAll(/\bp([xy]?)-(\d+(?:\.\d+)?)\b/g)) {
        const px = Number(m[2]) * 4;
        if (m[1] !== 'y') largeur += 2 * px;
        if (m[1] !== 'x') hauteur += 2 * px;
    }
    return { largeur, hauteur };
}

const MINIMUM_WCAG_PX = 24;

/** Les DEUX axes doivent atteindre le minimum — pas le plus grand des deux. */
function cibleSuffisante(classes: string, tailleContenu: number): boolean {
    const { largeur, hauteur } = cibleParAxe(classes, tailleContenu);
    return largeur >= MINIMUM_WCAG_PX && hauteur >= MINIMUM_WCAG_PX;
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
            const texteDynamique = /\{[^{}]*\}/.test(sansBalises(contenu));
            const texte = sansBalises(sansAccolades(contenu)).trim();
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
            .map((b) => {
                const { largeur, hauteur } = cibleParAxe(b.classes, b.taille);
                return `${b.chemin}:${b.ligne} (cible ≈ ${largeur}×${hauteur} px, minimum ${MINIMUM_WCAG_PX})`;
            });

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

    it('les deux AXES sont mesurés séparément — une cible n\'est pas carrée', () => {
        // ⚠️ Ce que la garde affirmait AVANT ce lot : `Math.max` des paddings, appliqué aux deux
        // axes. Elle déclarait donc 26×26 un bouton qui fait 26×22, et laissait passer les QUATRE
        // sites que son élargissement a révélés (Budget ×2, Investments, AutoBackupPanel) — tous
        // trop courts en HAUTEUR uniquement, de 1 à 2 px. Un ticket qui en nommait trois, dont deux
        // déjà corrigés et un seul réel.
        expect(cibleParAxe('inline-flex px-1.5 py-1 rounded-lg', 14)).toEqual({ largeur: 26, hauteur: 22 });
        expect(cibleSuffisante('inline-flex px-1.5 py-1 rounded-lg', 14)).toBe(false);
        // Le cas symétrique : trop court en LARGEUR, la garde doit refuser aussi.
        expect(cibleSuffisante('px-0.5 py-2 rounded', 14)).toBe(false);
        // `p-N` porte les deux axes ; le patron du dépôt (`p-2 -m-2`) reste vert.
        expect(cibleParAxe('p-2 -m-2', 16)).toEqual({ largeur: 32, hauteur: 32 });
        // ⚠️ Une dimension IMPOSÉE ne vaut que pour SON axe : `w-8` seul laissait la garde verte
        // quelle que soit la hauteur.
        expect(cibleSuffisante('w-8', 14)).toBe(false);
        expect(cibleSuffisante('w-8 h-8', 14)).toBe(true);
        expect(cibleSuffisante('touch-target', 12)).toBe(true);
    });

    it('chaque exemption est RÉELLE — une exemption périmée se retire', () => {
        for (const e of EXCLUSIONS) {
            const trouve = boutonsIconeSeule().some((b) => b.chemin.endsWith(`/${e.fichier}`) && b.classes.includes(e.jeton));
            expect(trouve, `exemption périmée : ${e.fichier} / ${e.jeton}`).toBe(true);
        }
    });
});
