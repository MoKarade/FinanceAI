// [A11Y-TABSTATE-TAXCENTER] Un état SÉLECTIONNÉ ne peut pas être porté par la seule couleur.
//
// ⚠️ WCAG 1.4.1 (« l'information ne passe pas par la couleur seule ») et 4.1.2 (« état d'un
// composant exposé par programmation »). Le défaut : une bascule dont l'option active se distingue
// par `bg-white text-black` — un lecteur d'écran annonce alors DEUX boutons identiques, et rien ne
// dit lequel est actif. La bascule Global/Conjoint de `TaxCenter` était dans ce cas.
//
// ⚠️ PÉRIMÈTRE RECENSÉ, PAS CITÉ. Le ticket nommait UN site ; le scan en a trouvé **12** dans trois
// fichiers (`ChildPlanning` ×5 — cinq groupes à sélection unique —, `LifeEvents` ×5, `TaxCenter` ×2).
// C'est la quatorzième fois d'affilée qu'un périmètre de ticket est faux, et le lot précédent l'a
// été DANS LES DEUX SENS : `UN-PERIMETRE-CITE-N-EST-PAS-UN-PERIMETRE-RECENSE`.
//
// ⚠️ ET DEUX CANDIDATS ONT ÉTÉ ÉCARTÉS APRÈS LECTURE — un scan heuristique se vérifie site par site.
// Voir `EXEMPTIONS` : dans les deux cas l'état est DÉJÀ annoncé, par le nom accessible du bouton.
// Les ajouter aurait dupliqué l'information, et pour `PropertyConfigurator` l'aurait rendue
// AMBIGUË (« pressé » voudrait dire quoi, sur un bouton dont le libellé est le mode courant ?).
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { stripCommentsJsx, partDeCodeRestante } from '../../utils/stripComments';

const racine = resolve(process.cwd(), 'components');

/** Ce que le scan NE compte PAS, avec sa raison — jamais une exemption muette. */
const EXEMPTIONS: ReadonlyArray<{ fichier: string; jeton: string; raison: string }> = [
    {
        fichier: 'SavedProfilesCard.tsx',
        jeton: 'profileToDelete',
        raison: 'le ternaire porte un état de CONFIRMATION, pas de sélection — et il est déjà annoncé : '
            + 'l\'`aria-label` bascule entre « Confirmer la suppression » et « Supprimer le profil X ». '
            + 'Le nom accessible change, donc l\'information ne passe pas par la couleur seule.',
    },
    {
        fichier: 'PropertyConfigurator.tsx',
        jeton: "mode === 'AUTO'",
        raison: 'le LIBELLÉ du bouton EST l\'état (« AUTO » / « MANUEL »), donc un lecteur d\'écran '
            + 'l\'annonce déjà. Ajouter `aria-pressed` y serait ambigu : « pressé » ne désigne aucun '
            + 'des deux modes en particulier.',
    },
];

function fichiersTsx(dir: string): string[] {
    return readdirSync(dir).flatMap((nom) => {
        const chemin = join(dir, nom);
        if (statSync(chemin).isDirectory()) return fichiersTsx(chemin);
        return chemin.endsWith('.tsx') ? [chemin] : [];
    });
}

/**
 * Index du `>` qui ferme la balise ouvrante `<button …>`.
 *
 * ⚠️ Un `indexOf('>')` naïf tombe sur la FLÈCHE d'une lambda (`onClick={() => …}`) et coupe la
 * balise en plein attribut — donc `aria-pressed`, écrit après le `onClick`, disparaît de la zone
 * examinée et la garde accuse du code sain. Même automate que `touchTargetGuard`, même raison.
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

/** Les quatre façons LÉGITIMES d'exposer un état sélectionné. */
const ETAT_ANNONCE = /aria-pressed|aria-current|aria-selected|role="tab"|role=\{?'tab'/;

interface Bascule { chemin: string; ligne: number; ouvrante: string }

/**
 * Un bouton dont le `className` compare un état (`x === y`) dans un ternaire : la sélection est
 * peinte. C'est le motif exact des douze sites corrigés par ce lot.
 */
function basculesPeintes(): Bascule[] {
    const out: Bascule[] = [];
    for (const chemin of fichiersTsx(racine)) {
        const brut = readFileSync(chemin, 'utf8');
        // ⚠️ Source DÉCOMMENTÉE : une assertion d'ABSENCE lue sur la source brute est satisfaite —
        // ou accusée — par la PROSE, y compris celle du commentaire qui explique le motif.
        const code = stripCommentsJsx(brut);
        if (brut.trim() !== '' && partDeCodeRestante(brut, code) < 0.05) {
            throw new Error(`${chemin} : décommentage suspect — une garde d'absence lue sur un fichier vidé serait vacueuse`);
        }
        for (const m of code.matchAll(/<button\b[\s\S]*?<\/button>/g)) {
            const bloc = m[0];
            const ouvrante = bloc.slice(0, finBaliseOuvrante(bloc) + 1);
            const classes = ouvrante.match(/className=\{`([\s\S]*?)`\}/);
            if (!classes) continue;
            if (!/\?/.test(classes[1]) || !/===|!==/.test(classes[1])) continue;
            out.push({ chemin: chemin.replace(`${process.cwd()}/`, ''), ligne: code.slice(0, m.index ?? 0).split('\n').length, ouvrante });
        }
    }
    return out;
}

describe('[A11Y-TABSTATE-TAXCENTER] l\'option active d\'une bascule est ANNONCÉE', () => {
    it('aucune sélection portée par la seule couleur, hors exemption déclarée', () => {
        const bascules = basculesPeintes();
        const offenders = bascules
            .filter((b) => !ETAT_ANNONCE.test(b.ouvrante))
            .filter((b) => !EXEMPTIONS.some((e) => b.chemin.endsWith(`/${e.fichier}`) && b.ouvrante.includes(e.jeton)))
            .map((b) => `${b.chemin}:${b.ligne}`);

        // ANTI-VACUITÉ : le scan doit trouver de quoi juger. Le dépôt porte 14 bascules peintes
        // (12 corrigées par ce lot + les 2 exemptions), mesuré ; un plancher plus bas laisserait un
        // « aucun offender » sans valeur si le motif cessait de reconnaître les boutons.
        expect(bascules.length, 'aucune bascule peinte reconnue → le scan ne lit pas ce qu\'il croit')
            .toBeGreaterThanOrEqual(10);
        expect(offenders, `Sélection non annoncée :\n${offenders.join('\n')}`).toEqual([]);
    });

    it('les trois écrans corrigés sont bien VUS par le scan — témoins nommés', () => {
        // ⚠️ Un « aucun offender » ne vaut rien si le scan ne voit pas les sites qu'il prétend
        // couvrir. Les trois fichiers écrivent leur bouton dans des FORMES différentes (attributs
        // sur une ligne, sur plusieurs, `key=` en tête) — c'est exactement ce qui a fait échouer la
        // garde du lot précédent, aveugle à la forme qu'elle n'avait pas croisée.
        const vus = basculesPeintes();
        for (const fichier of ['ChildPlanning.tsx', 'LifeEvents.tsx', 'TaxCenter.tsx']) {
            expect(vus.some((b) => b.chemin.endsWith(`/${fichier}`)), `témoin absent du scan : ${fichier}`).toBe(true);
        }
        // `ChildPlanning` en porte CINQ : un scan qui n'en verrait qu'un couvrirait un cinquième
        // du fichier en croyant l'avoir traité.
        expect(vus.filter((b) => b.chemin.endsWith('/ChildPlanning.tsx')).length).toBeGreaterThanOrEqual(5);
    });

    it('chaque exemption est RÉELLE — une exemption périmée se retire', () => {
        const vus = basculesPeintes();
        for (const e of EXEMPTIONS) {
            const trouve = vus.some((b) => b.chemin.endsWith(`/${e.fichier}`) && b.ouvrante.includes(e.jeton));
            expect(trouve, `exemption périmée : ${e.fichier} / ${e.jeton}`).toBe(true);
        }
    });
});
