// [DONNEES-PERSO-GARDE] FinanceAI#1238 — le dépôt est PUBLIC : aucune donnée personnelle de Marc dans un
// fichier versionné (positions, montants réels, dates qui permettent de les reconnaître, coordonnées).
// Même modèle que la garde de DriveAI (#628) : on garde l'EMPREINTE des formulations retirées, jamais leur
// texte, et un CLIQUET par fichier pour ce qui reste à nettoyer.
//
//   - `donneesPerso/empreintes.json` : séquences de mots réelles retirées (hachées, pas en clair) ;
//   - `donneesPerso/baseline.json`   : nombre de trouvailles TOLÉRÉES par fichier (l'existant non encore
//     nettoyé : HANDOVER, archives, leçons). Un fichier ne peut qu'en perdre, jamais en gagner ;
//   - sortie : « fichier:ligne [catégorie] » — JAMAIS le texte trouvé (le journal CI est public aussi).
//
// ⚠️ Ce verrou ne PROUVE pas l'absence de donnée perso : il empêche de ré-introduire ce qu'on a déjà reconnu
// et les formes évidentes. Un fait nouveau (un autre montant, un autre titre détenu) échappe tant qu'on ne
// l'a pas empreinté. Ajouter une empreinte : `PII_HACHER="la phrase" npx vitest run tests/guards/donneesPerso.test.ts`
// (affiche l'empreinte et sa longueur en mots, pas la phrase), puis l'ajouter à `empreintes.json`
// (`longueurs` comprise). Recalculer le cliquet : `PII_ECRIRE_BASE=1`. Ne se relève jamais sans décision de Marc.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyser, empreinte, mots, trouverEmpreintes, trouverFormes, type Empreintes } from '../helpers/donneesPerso';

const racine = process.cwd();
const dossier = resolve(racine, 'tests/guards/donneesPerso');
const liste: Empreintes = JSON.parse(readFileSync(resolve(dossier, 'empreintes.json'), 'utf8'));
const cheminBase = resolve(dossier, 'baseline.json');

const BINAIRES = /\.(png|jpe?g|gif|webp|ico|svg|pdf|woff2?|ttf|otf|eot|zip|gz|mp4|webm|lock|map)$/i;
/** Fichiers qui contiennent légitimement les formes à chercher : la garde elle-même et ses données. */
const EXCLUS = new Set([
    'tests/guards/donneesPerso.test.ts',
    'tests/helpers/donneesPerso.ts',
    'tests/guards/donneesPerso/empreintes.json',
    'tests/guards/donneesPerso/baseline.json',
    'package-lock.json',
]);

function fichiersVersionnes(): string[] {
    const sortie = execFileSync('git', ['ls-files', '-z'], { cwd: racine, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return sortie.split('\0').filter(f => f && !BINAIRES.test(f) && !EXCLUS.has(f));
}

function scanner(): Map<string, { ligne: number; categorie: string }[]> {
    const resultat = new Map<string, { ligne: number; categorie: string }[]>();
    for (const f of fichiersVersionnes()) {
        let texte: string;
        try {
            if (statSync(resolve(racine, f)).size > 5 * 1024 * 1024) continue;
            texte = readFileSync(resolve(racine, f), 'utf8');
        } catch {
            continue; // fichier supprimé dans l'arbre de travail : rien à scanner
        }
        const t = analyser(texte, liste);
        if (t.length) resultat.set(f, t);
    }
    return resultat;
}

describe('[DONNEES-PERSO-GARDE] aucune donnée personnelle de plus dans un fichier versionné', () => {
    if (process.env.PII_HACHER) {
        it('affiche l’empreinte demandée (aide, pas une vérification)', () => {
            const m = mots(process.env.PII_HACHER as string);
            // eslint-disable-next-line no-console
            console.log(`longueur=${m.length} empreinte=${empreinte(m.join(' '))}`);
            expect(m.length).toBeGreaterThan(0);
        });
    }

    it('le cliquet par fichier ne monte pas (et se resserre quand un fichier est nettoyé)', () => {
        const trouve = scanner();
        const compte: Record<string, number> = {};
        for (const [f, t] of trouve) compte[f] = t.length;

        if (process.env.PII_ECRIRE_BASE === '1') {
            const trie = Object.fromEntries(Object.entries(compte).sort(([a], [b]) => a.localeCompare(b)));
            writeFileSync(cheminBase, JSON.stringify(trie, null, 2) + '\n');
            return;
        }

        const base: Record<string, number> = JSON.parse(readFileSync(cheminBase, 'utf8'));
        const hausses: string[] = [];
        for (const [f, n] of Object.entries(compte)) {
            if (n > (base[f] ?? 0)) {
                const lignes = (trouve.get(f) ?? []).map(t => `${f}:${t.ligne} [${t.categorie}]`);
                hausses.push(`${f} : ${n} trouvaille(s) pour ${base[f] ?? 0} tolérée(s) — ${lignes.join(' ; ')}`);
            }
        }
        expect(hausses, 'Donnée personnelle détectée (le texte n’est pas affiché). Retirer la donnée, ne pas relever le plafond.').toEqual([]);

        const baisses = Object.entries(base).filter(([f, n]) => (compte[f] ?? 0) < n).map(([f]) => f);
        expect(baisses, 'Un fichier a été nettoyé : resserrer `baseline.json` (PII_ECRIRE_BASE=1) pour verrouiller le gain.').toEqual([]);
    }, 120_000);
});

describe('[DONNEES-PERSO-GARDE] la garde elle-même détecte (contrôle négatif)', () => {
    // Les phrases d'épreuve sont assemblées à l'exécution : le fichier de test ne contient pas la forme qu'il cherche.
    const marc = ['Ma', 'rc'].join('');

    it('une forme « objet financier de Marc » est détectée, sans rien afficher', () => {
        expect(trouverFormes(`// la position de ${marc} en euros`).map(t => t.categorie)).toContain('bien-de-marc');
        expect(trouverFormes(`// l'état RÉEL de ${marc} lu par un outil`).map(t => t.categorie)).toContain('reel-de-marc');
        expect(trouverFormes(`// mesuré sur ses vraies transactions`).map(t => t.categorie)).toContain('ses-vraies');
    });

    it('les coordonnées évidentes sont détectées', () => {
        expect(trouverFormes(`contact: nom@${['gma', 'il'].join('')}.com`).map(t => t.categorie)).toContain('courriel-webmail');
        expect(trouverFormes(`appel ${['418', '555', '9876'].join(' ')}`).map(t => t.categorie)).toContain('telephone');
        expect(trouverFormes(`exemple ${['866', '555', '0100'].join('-')}`)).toEqual([]);
        expect(trouverFormes(`code ${['G1R', '2B3'].join(' ')}`).map(t => t.categorie)).toContain('code-postal-ca');
    });

    it('un texte neutre ne déclenche rien', () => {
        expect(analyser('// décision de Marc du 15/10/2026 : on fusionne en squash', liste)).toEqual([]);
        expect(analyser('// le marché de ABC.PA est coté en euros', liste)).toEqual([]);
    });

    it('une empreinte retrouve sa séquence malgré la casse, les accents et la ponctuation, sur plusieurs lignes', () => {
        const courte: Empreintes = { longueurs: [3], hachages: [empreinte('chute de zzz')] };
        expect(trouverEmpreintes('// Chute,\n// de ZZZ !', courte)).toEqual([{ ligne: 1, categorie: 'empreinte' }]);
        expect(trouverEmpreintes('// chute de yyy', courte)).toEqual([]);
    });

    it('l’empreinte est stable (toute modification de l’algorithme invaliderait la liste)', () => {
        expect(empreinte('abc')).toBe(empreinte('abc'));
        expect(empreinte('abc')).not.toBe(empreinte('abd'));
        expect(liste.hachages.length).toBeGreaterThan(0);
    });
});
