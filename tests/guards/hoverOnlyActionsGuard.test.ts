// [A11Y-HOVER-ONLY-ACTIONS] Une action révélée au SURVOL doit rester visible sur écran tactile.
//
// ⚠️ Le défaut : `opacity-0 group-hover:opacity-100` sans variante `md:`. Sur un écran tactile il
// n'y a pas de `:hover`, donc l'action est invisible ET non découvrable — le seul rattrapage étant
// `focus:`, c'est-à-dire le clavier, que personne n'a sur un téléphone. Le pattern correct existe
// dans le dépôt depuis longtemps (`components/Transactions.tsx`) :
// `md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100` — masqué au survol en desktop
// SEULEMENT, visible en permanence sur mobile.
//
// ⚠️ Cette garde est un SCAN DE SOURCE, et elle en porte les précautions : lecture décommentée (une
// garde d'absence qui lit les commentaires rougit sur sa propre documentation — `SCAN-QUI-MATCHE-LA-PROSE`,
// trois récidives dans ce dépôt) et preuve de volume (un scan qui ne trouve plus rien à vérifier ne
// protège rien).
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { stripComments, partDeCodeRestante } from '../../utils/stripComments';

/**
 * ⚠️ Lecture décommentée FICHIER PAR FICHIER, sans le témoin par fichier de `readCodeOnly` : sur un
 * balayage de tout `components/`, aucun jeton n'est présent dans les ~200 fichiers (certains n'ont
 * pas une seule `className`), et exiger un témoin universel ferait échouer la garde sur sa propre
 * mécanique. L'anti-vacuité est donc portée AUTREMENT, et plus solidement : la part de code non
 * blanc restante est contrôlée ici, et le test exige plus bas de retrouver un nombre plancher
 * d'occurrences SAINES — un décommentage qui aurait tout mangé les ferait disparaître.
 */
function lireCode(chemin: string): string {
    const brut = readFileSync(chemin, 'utf8');
    const code = stripComments(brut);
    if (brut.trim() !== '' && partDeCodeRestante(brut, code) < 0.05) {
        throw new Error(`${chemin} : décommentage suspect — une garde d'absence lue sur un fichier vidé serait vacueuse`);
    }
    return code;
}

const racine = resolve(process.cwd(), 'components');

/**
 * Ce que le scan NE compte PAS, avec sa raison — jamais une exemption muette
 * (`AUDITER-LE-FILTRE-AUTANT-QUE-LA-LISTE`).
 */
const EXCLUSIONS: ReadonlyArray<{ fichier: string; jeton: string; raison: string }> = [
    {
        fichier: 'Investments.tsx',
        jeton: 'blur-3xl',
        raison: 'halo DÉCORATIF (dégradé flouté), pas une action : le rendre permanent sur mobile '
            + 'ajouterait un voile au lieu de révéler une commande. Trouvé en recensant le vrai '
            + 'périmètre — le ticket annonçait 5 sites, le scan en a montré 8, dont celui-ci qu\'il '
            + 'ne fallait justement pas corriger.',
    },
];

function fichiersTsx(dir: string): string[] {
    return readdirSync(dir).flatMap((nom) => {
        const chemin = join(dir, nom);
        if (statSync(chemin).isDirectory()) return fichiersTsx(chemin);
        return chemin.endsWith('.tsx') ? [chemin] : [];
    });
}

describe('[A11Y-HOVER-ONLY-ACTIONS] pas d\'action masquée au doigt', () => {
    it('aucune occurrence de `opacity-0 group-hover:` sans variante `md:`, hors décoratif déclaré', () => {
        const offenders: string[] = [];
        let occurrencesSaines = 0;

        for (const chemin of fichiersTsx(racine)) {
            const code = lireCode(chemin);
            const lignes = code.split('\n');
            lignes.forEach((ligne, i) => {
                if (/\bmd:opacity-0\b/.test(ligne)) { occurrencesSaines++; return; }
                if (!/(?<!md:)\bopacity-0 group-hover:opacity-100/.test(ligne)) return;
                const nomFichier = chemin.split('/').pop() ?? '';
                const exclu = EXCLUSIONS.some((e) => e.fichier === nomFichier && ligne.includes(e.jeton));
                if (!exclu) offenders.push(`${chemin.replace(process.cwd() + '/', '')}:${i + 1}`);
            });
        }

        // ANTI-VACUITÉ : le pattern SAIN doit exister, sinon le scan ne lit rien d'utile — un
        // « aucun offender » sur un scan qui ne matche jamais rien ne prouve strictement rien.
        expect(occurrencesSaines, 'aucune occurrence saine trouvée → le scan ne lit pas ce qu\'il croit')
            .toBeGreaterThanOrEqual(5);
        expect(offenders, `Action(s) masquée(s) au doigt :\n${offenders.join('\n')}`).toEqual([]);
    });

    it('chaque exclusion est RÉELLE — une exemption périmée se retire', () => {
        // Une exclusion qui ne correspond plus à rien laisse croire qu'un cas est traité alors que
        // le code a changé sous elle (`Entrée(s) sans littéral correspondant`, patron repris de
        // `[FISC-CONST-GUARD-V2]`).
        for (const e of EXCLUSIONS) {
            const chemins = fichiersTsx(racine).filter((c) => c.endsWith(`/${e.fichier}`));
            expect(chemins.length, `${e.fichier} introuvable`).toBeGreaterThan(0);
            const trouve = chemins.some((c) => lireCode(c)
                .split('\n')
                .some((l) => l.includes(e.jeton) && /opacity-0 group-hover:opacity-100/.test(l)));
            expect(trouve, `exclusion périmée : ${e.fichier} / ${e.jeton}`).toBe(true);
        }
    });
});
