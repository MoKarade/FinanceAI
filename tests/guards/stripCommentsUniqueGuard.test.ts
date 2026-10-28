// [GUARD-STRIPCOMMENTS-DUPLIQUE] Un seul décommenteur dans le dépôt : `utils/stripComments.ts`.
//
// ⚠️ POURQUOI CETTE GARDE. Une garde de scan ne vaut que par son décommenteur, et **le plus faible
// de tous fixe le niveau réel de protection du dépôt**. Avant ce lot il y en avait quinze, dans
// treize fichiers, et ils ne se comportaient pas pareil : certains blanchissaient, d'autres
// supprimaient ; un seul gérait `https://` ; deux employaient `/\/\/.*$/` SANS le drapeau `m`, donc
// ne traitaient que la première ligne du fichier.
//
// ⚠️ CE QUE ÇA COÛTAIT, MESURÉ. Sur les 458 fichiers `.ts`/`.tsx` de `components/ services/ utils/
// hooks/ store/ mcp/`, le décommenteur ad hoc le plus répandu et la source unique rendent un
// résultat DIFFÉRENT sur **154** d'entre eux (34 %) : **149** où l'ad hoc laissait passer de la
// prose (un `//` en fin de ligne de code lui échappe, donc toute garde d'absence était affaiblie)
// et **5** où il MANGEAIT du code — `const HUB_URL = … || 'https://hubperso.com'` coupé au `//` de
// l'URL, 163 caractères de vrai code perdus dans `components/Layout.tsx`. Un scan qui lit un
// fichier tronqué peut déclarer « rien ne référence X » à partir de « il n'y a plus rien ».
//
// ⚠️ CETTE GARDE LIT LA SOURCE DÉCOMMENTÉE, et ce n'est pas un détail : la meilleure façon
// d'expliquer un motif interdit est de l'écrire, donc les commentaires de migration que ce lot a
// semés dans treize fichiers contiennent tous le motif. Une garde d'absence contredit mécaniquement
// une bonne doc (`SCAN-QUI-MATCHE-LA-PROSE`, quatre récidives) — le remède est le LECTEUR.
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { stripComments, partDeCodeRestante } from '../../utils/stripComments';

const RACINE = resolve(process.cwd());
const DOSSIERS = ['tests', 'utils', 'scripts', 'services', 'components', 'hooks', 'store'];

/**
 * Les deux seuls fichiers autorisés à parler de commentaires en regex.
 *
 * `utils/stripComments.ts` EST la source unique — c'est un automate, pas une regex, mais son
 * en-tête et ses tests décrivent les motifs. Le ratchet, lui, existe pour comparer la source unique
 * à une version naïve : il a BESOIN de la version naïve pour mesurer l'écart.
 */
const AUTORISES: ReadonlyArray<{ fichier: string; raison: string }> = [
    { fichier: 'utils/stripComments.ts', raison: 'la source unique elle-même.' },
    { fichier: 'tests/utils/stripComments.test.ts', raison: 'ses cas de syntaxe : ils CONSTRUISENT des commentaires pour vérifier qu\'ils sont retirés.' },
    { fichier: 'tests/guards/stripCommentsRatchet.test.ts', raison: 'le canari : il compare la source unique à un décommenteur naïf, donc il doit l\'écrire.' },
    { fichier: 'tests/guards/stripCommentsUniqueGuard.test.ts', raison: 'cette garde : son propre motif de recherche est un motif de décommentage.' },
];

function fichiersSource(dir: string): string[] {
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
    return readdirSync(dir).flatMap((nom) => {
        if (nom === 'node_modules' || nom === 'dist') return [];
        const chemin = join(dir, nom);
        return statSync(chemin).isDirectory()
            ? fichiersSource(chemin)
            : (/\.(ts|tsx|mts)$/.test(chemin) ? [chemin] : []);
    });
}

/** Un `.replace(…)` dont la regex vise un marqueur de commentaire — la forme d'un décommenteur. */
const DECOMMENTEUR = /replace\(\s*\/[^\n]*\\\/\\[*/]/;

function copies(): string[] {
    const autorises = new Set(AUTORISES.map((a) => a.fichier));
    const out: string[] = [];
    for (const dir of DOSSIERS) {
        for (const chemin of fichiersSource(resolve(RACINE, dir))) {
            const rel = relative(RACINE, chemin).replace(/\\/g, '/');
            if (autorises.has(rel)) continue;
            const brut = readFileSync(chemin, 'utf8');
            const code = stripComments(brut);
            if (brut.trim() !== '' && partDeCodeRestante(brut, code) < 0.05) {
                throw new Error(`${rel} : décommentage suspect — une garde d'absence lue sur un fichier vidé serait vacueuse`);
            }
            code.split('\n').forEach((ligne, i) => {
                if (DECOMMENTEUR.test(ligne)) out.push(`${rel}:${i + 1} — ${ligne.trim().slice(0, 80)}`);
            });
        }
    }
    return out;
}

describe('[GUARD-STRIPCOMMENTS-DUPLIQUE] la source unique du décommentage', () => {
    it('anti-vacuité : le scan lit bien du code, et son motif RECONNAÎT un décommenteur', () => {
        const fichiers = DOSSIERS.flatMap((d) => fichiersSource(resolve(RACINE, d)));
        expect(fichiers.length, 'aucun fichier balayé').toBeGreaterThan(400);
        // Le motif doit matcher les deux formes historiques, sinon la garde est décorative.
        expect(DECOMMENTEUR.test(String.raw`src.replace(/\/\*[\s\S]*?\*\//g, '')`)).toBe(true);
        expect(DECOMMENTEUR.test(String.raw`l.replace(/\/\/.*$/, '')`)).toBe(true);
        expect(DECOMMENTEUR.test(String.raw`s.replace(/\s+/g, ' ')`)).toBe(false);
    });

    it('aucune copie du décommenteur hors de la source unique', () => {
        const trouvees = copies();
        expect(trouvees, `Décommenteur(s) recopié(s) — importer \`utils/stripComments\` :\n${trouvees.join('\n')}`)
            .toEqual([]);
    });

    it('chaque fichier autorisé existe encore et contient bien un motif de décommentage', () => {
        // Une exemption fantôme compte comme protection dans tout inventaire futur
        // (`ENTREE-D-INVENTAIRE-FANTOME`) : elle se prouve, ou elle se retire.
        for (const { fichier } of AUTORISES) {
            const chemin = resolve(RACINE, fichier);
            expect(statSync(chemin, { throwIfNoEntry: false })?.isFile(), `exemption fantôme : ${fichier} n'existe plus`).toBe(true);
        }
    });

    it('les treize fichiers migrés consomment bien la source unique', () => {
        // Le contrôle symétrique du précédent : « plus aucune copie » serait aussi vrai si les
        // gardes avaient cessé de décommenter du tout — ce qui les rendrait toutes vacueuses.
        const MIGRES = [
            'tests/a11y/chartHintEquivalents.test.tsx', 'tests/a11y/focusTrap.test.tsx',
            'tests/aiTools/specFiniteGuard.test.ts', 'tests/components/PatrimoineExtended.privacy.test.tsx',
            'tests/components/TaxCenter.applyGate.test.ts', 'tests/components/chartTooltipTheme.test.ts',
            'tests/components/subTabsAria.test.tsx', 'tests/components/taxBracketVizAnnee.test.tsx',
            'tests/gateTestsHomonymes.test.ts', 'tests/services/assetFxGuard.test.ts',
            'tests/services/divorceScaleUnbought.test.ts', 'tests/services/estateCalculation.test.ts',
            'tests/services/mcLabelFrozen.test.ts', 'tests/services/silencesXs.test.ts',
            'tests/services/w5TaxProxyAnchor.test.ts',
        ];
        const sans = MIGRES.filter((f) => !readFileSync(resolve(RACINE, f), 'utf8').includes("from '../../utils/stripComments'")
            && !readFileSync(resolve(RACINE, f), 'utf8').includes("from '../utils/stripComments'"));
        expect(sans, `ces gardes ne décommentent plus RIEN :\n${sans.join('\n')}`).toEqual([]);
    });
});
