// [GUARD-STRIPCOMMENTS-CONSOLIDER] Ratchet : le nombre de décommenteurs PRIVÉS ne peut que baisser.
//
// Le dépôt a payé DEUX fois la leçon `GUARD-STRIPCOMMENTS-DUPLIQUE` — dont une fois en écrivant la
// leçon dans le commentaire d'une copie qu'il venait de créer. Une consigne ne suffit donc pas : il
// faut un compteur qui refuse de monter.
//
// ⚠️ Cette garde naît VOLONTAIREMENT non bloquante sur les copies restantes : elle les COMPTE au
// lieu de les interdire, parce que leur migration change le CONTRAT de leurs appelants (certaines
// rendent `string[]`, d'autres `string`, et l'une d'elles préserve les numéros de ligne). Le
// basculement en interdiction sera la dernière étape du ticket de migration, pas celle-ci.
//
// ⚠️ Et elle lit la source DÉCOMMENTÉE — par la source unique elle-même. Une garde de comptage lue
// sur la source brute compterait la PROSE : c'est `SCAN-QUI-MATCHE-LA-PROSE`, quatre récidives dans
// ce dépôt, dont une le jour même où ce lot a été écrit.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments, partDeCodeRestante } from '../../utils/stripComments';

const RACINE = join(__dirname, '..', '..');
const IGNORES = new Set(['node_modules', '.git', 'dist', 'coverage', '.vercel', 'e2e-results', 'playwright-report']);

/**
 * Les seuls fichiers autorisés à contenir un décommenteur, chacun avec sa raison — un filtre se
 * déclare et se motive, sinon un périmètre borné en silence se lit comme « tout est couvert »
 * (`AUDITER-LE-FILTRE-AUTANT-QUE-LA-LISTE`).
 *
 * ⚠️ Le second est ce fichier-ci, et il ne s'exempte pas par confort : le canari ci-dessus a BESOIN
 * de la version naïve comme point de COMPARAISON. Sans cette entrée, la garde se détecte elle-même
 * — ce qu'elle a fait au premier jet, et c'était le bon comportement.
 */
const DECOMMENTEURS_AUTORISES = new Set([
    'utils/stripComments.ts',                        // la source unique
    'tests/guards/stripCommentsRatchet.test.ts',     // le point de comparaison du canari
]);

/** Ce qui trahit un décommenteur, quelle que soit sa signature : un `replace` dont le motif décrit
 *  un commentaire. Les trois formes couvrent bloc et ligne ; aucune n'apparaît ailleurs. */
const MOTIFS_DE_DECOMMENTEUR = [
    /replace\(\s*\/\\\/\\\*/,
    /replace\(\s*\/\\\/\\\/\[\^\\n\]/,
    /replace\(\s*\/\\\/\\\/\.\*\$\//,
];

function fichiersSource(dir: string, acc: string[] = []): string[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) { if (!IGNORES.has(e.name)) fichiersSource(join(dir, e.name), acc); }
        else if (/\.(ts|tsx)$/.test(e.name)) acc.push(join(dir, e.name));
    }
    return acc;
}

function decommenteursPrives(): string[] {
    const trouves: string[] = [];
    let brutTotal = 0, codeTotal = 0;
    for (const f of fichiersSource(RACINE)) {
        const relatif = f.slice(RACINE.length + 1);
        const raw = readFileSync(f, 'utf8');
        const code = stripComments(raw);
        brutTotal += raw.replace(/\s/g, '').length;
        codeTotal += code.replace(/\s/g, '').length;
        if (DECOMMENTEURS_AUTORISES.has(relatif)) continue;
        if (MOTIFS_DE_DECOMMENTEUR.some((m) => m.test(code))) trouves.push(relatif);
    }
    // Anti-vacuité AGRÉGÉE (par fichier elle serait fausse dès qu'un fichier est surtout de la
    // prose) : si le décommentage avait mangé le dépôt, « aucun décommenteur trouvé » ne prouverait
    // rien du tout.
    expect(codeTotal / brutTotal).toBeGreaterThan(0.5);
    return trouves.sort();
}

/** La version NAÏVE, uniquement comme POINT DE COMPARAISON du canari ci-dessous. */
const naif = (src: string): string => src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

describe('[GUARD-STRIPCOMMENTS-CONSOLIDER] canari : aucun fichier n\'est ENGLOUTI', () => {
    // ⚠️ Pourquoi FICHIER PAR FICHIER. Quand l'automate classe une vraie regex comme une division,
    // il lit son CONTENU comme du code — et une classe de caractères peut légalement porter la
    // séquence d'ouverture d'un commentaire de bloc. Il ouvre alors un faux commentaire que seul un
    // marqueur littéral referme, éventuellement jamais : tout le reste du fichier est blanchi, et la
    // garde bâtie dessus devient aveugle SANS rien de rouge (`UN-INVARIANT-NE-VOIT-PAS-CE-QUI-EST-ABSENT`).
    // L'anti-vacuité AGRÉGÉE du ratchet ne peut pas le voir : un fichier avalé ne déplace pas le
    // ratio d'un dépôt de plusieurs millions de caractères.
    //
    // ⚠️ Et pourquoi pas un SEUIL. Mon premier jet exigeait « au moins 15 % de code restant », choisi
    // au jugé — or `services/projection/modelAssumptions.ts` est légitimement à 6,6 % (c'est de la
    // documentation exécutable). Un seuil arbitraire sur une grandeur dont la distribution n'a pas
    // été mesurée naît faux, exactement comme le plafond du ratchet plus bas.
    //
    // L'invariant JUSTE ne demande aucun seuil : le décommenteur durci protège des littéraux, donc
    // il garde TOUJOURS au moins autant de code que le naïf — sauf s'il engloutit. La comparaison
    // est donc son propre étalon, et elle reste vraie quelle que soit la prose du fichier.
    // ⚠️ La comparaison se fait LIGNE PAR LIGNE, pas sur le ratio du fichier. La 5e passe du panel a
    // démontré l'angle mort de la version globale : deux défauts INDÉPENDANTS dans le même fichier
    // se compensent — le naïf perdait beaucoup sur un gabarit portant des `//`, le durci engloutissait
    // ailleurs, et comme le durci gardait quand même plus AU TOTAL, le canari restait vert sur un
    // fichier bel et bien avalé. Deux pertes qui n'ont aucun rapport ne se comparent pas en agrégat.
    // Par ligne, elles ne peuvent plus se masquer l'une l'autre.
    it('le durci ne blanchit JAMAIS une ligne que le naïf gardait', () => {
        const nonBlancs = (t: string) => t.replace(/\s/g, '').length;
        const suspects: string[] = [];
        for (const f of fichiersSource(RACINE)) {
            const raw = readFileSync(f, 'utf8');
            const lignesDurci = stripComments(raw).split('\n');
            const lignesNaif = naif(raw).split('\n');
            for (let i = 0; i < lignesNaif.length; i++) {
                if (nonBlancs(lignesDurci[i] ?? '') < nonBlancs(lignesNaif[i])) {
                    suspects.push(`${f.slice(RACINE.length + 1)}:${i + 1}`);
                    break; // une ligne suffit à condamner le fichier : pas de liste à rallonge
                }
            }
        }
        expect(suspects, `fichiers où le durci perd du code que le naïf gardait :\n${suspects.join('\n')}`).toEqual([]);
    });
});

describe('[GUARD-STRIPCOMMENTS-CONSOLIDER] ratchet des décommenteurs privés', () => {
    // MESURÉ le 2026-08-29, APRÈS la migration des trois gardes d'`utils/` (celles qui devaient
    // absolument passer à la source unique : `chartDataSumGuard` part dans le bundle du navigateur,
    // donc il ne peut rien importer de `tests/`). Ce nombre ne doit JAMAIS monter.
    //
    // ⚠️ Le ticket annonçait SIX copies. Le compte réel, à l'échelle du dépôt, est celui-ci — encore
    // un périmètre de ticket qui était une borne INFÉRIEURE. Et je l'ai d'abord écrit au jugé (12)
    // avant de le mesurer : un plafond de ratchet se COMPTE, il ne s'estime pas, sinon il naît faux.
    // La liste complète n'est pas recopiée ici — elle pourrirait ; le message d'échec l'imprime.
    const PLAFOND = 15;

    it('aucun décommenteur privé NEUF — le compteur ne monte pas', () => {
        const trouves = decommenteursPrives();
        expect(trouves.length, `decommenteurs prives trouves :\n${trouves.join('\n')}`).toBeLessThanOrEqual(PLAFOND);
    });

    it('la source unique est le SEUL décommenteur hors fichiers de test', () => {
        // Le vrai enjeu est la production : une copie dans `utils/` ou `services/` reviendrait dans
        // le bundle, et surtout diviserait à nouveau le contrat que ce lot vient d'unifier.
        const horsTests = decommenteursPrives().filter((f) => !f.startsWith('tests/'));
        expect(horsTests).toEqual([]);
    });

    it('les trois gardes utils consomment bien la source unique', () => {
        // Assertion de PRÉSENCE ancrée sur l'IMPORT, pas sur le nom : citer `stripComments` dans un
        // commentaire ne doit pas satisfaire la garde.
        for (const f of ['utils/fiscalConstGuardV2.ts', 'utils/chartDataSumGuard.ts', 'utils/fiscalConstantsGuard.ts']) {
            const raw = readFileSync(join(RACINE, f), 'utf8');
            const code = stripComments(raw);
            expect(partDeCodeRestante(raw, code)).toBeGreaterThan(0.2);
            expect(code, f).toMatch(/import\s*\{[^}]*stripComments[^}]*\}\s*from\s*'\.\/stripComments'/);
        }
    });
});
