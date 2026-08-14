// tests/noConflictMarkers.test.ts
//
// [MERGE-MARKERS-IN-MAIN 2026-08-14] Garde née d'un incident RÉEL, pas d'une précaution.
//
// La PR #622 a livré sur `main` des MARQUEURS DE CONFLIT non résolus, committés tels quels dans
// `CHANGELOG.md` (2 blocs) et `docs/BACKLOG.md` (1 bloc, déséquilibré : deux `<<<<<<<` pour un seul
// `>>>>>>>`). Ils y sont restés plus d'une journée et n'ont été découverts que parce qu'une PR
// suivante a dû fusionner ces mêmes fichiers et a produit un conflit imbriqué illisible.
//
// ⚠️ POURQUOI RIEN NE L'A ATTRAPÉ. Les marqueurs vivaient dans des `.md` : ils ne cassent ni le
// typecheck, ni le lint, ni le build, ni un test — aucune de nos barrières ne LIT ces fichiers.
// Le gate était donc VERT sur un dépôt qui contenait, en clair, deux versions contradictoires du
// même item de backlog. C'est exactement le motif « un défaut qu'aucune barrière ne regarde » :
// le seul correctif est une barrière qui, elle, regarde.
//
// Conséquence concrète, et c'est la raison d'être de cette garde : le BACKLOG et le CHANGELOG sont
// LUS PAR LA PROCHAINE SESSION pour décider quoi faire. Un item y figurait à la fois coché LIVRÉ et
// décoché À FAIRE. Une session qui lit la mauvaise moitié re-livre du travail déjà fait, ou croit
// fait ce qui ne l'est pas (classe `PM-STALE-BACKLOG`, déjà au dossier).
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** `<<<<<<< ` et `>>>>>>> ` sont NON AMBIGUS : 7 chevrons + espace en début de ligne n'a aucun autre
 *  sens en Markdown ni en TS. `=======` seul, LUI, est ambigu — c'est aussi le soulignement d'un
 *  titre setext en Markdown (`Titre\n=======`). On ne le signale donc QUE dans un fichier qui porte
 *  déjà l'un des deux autres, sinon la garde produirait des faux positifs sur de la doc légitime. */
const estOuvrant = (l: string): boolean => l.startsWith('<<<<<<< ');
const estFermant = (l: string): boolean => l.startsWith('>>>>>>> ');
const estMilieu = (l: string): boolean => l === '=======';

export interface Trouvaille {
    fichier: string;
    ligne: number;
    texte: string;
}

/** Le SCANNER, isolé pour que les tests de discrimination l'appellent LUI, et non une copie de sa
 *  logique. Un test qui re-code la détection prouve seulement que la copie fonctionne — le vrai
 *  scanner pourrait être cassé sans que rien ne rougisse. */
export const scannerFichiers = (fichiers: string[]): Trouvaille[] => {
    const out: Trouvaille[] = [];
    for (const f of fichiers) {
        let contenu: string;
        try {
            contenu = readFileSync(f, 'utf8');
        } catch {
            continue; // présent dans l'index, absent du disque : hors sujet ici
        }
        const lignes = contenu.split('\n');
        const aUnChevron = lignes.some((l) => estOuvrant(l) || estFermant(l));
        if (!aUnChevron) continue; // pas de chevron → on ne regarde même pas `=======`
        lignes.forEach((l, i) => {
            if (estOuvrant(l) || estFermant(l) || estMilieu(l)) {
                out.push({ fichier: f, ligne: i + 1, texte: l.slice(0, 40) });
            }
        });
    }
    return out;
};

/** Fichiers SUIVIS par git, filtrés aux types où un marqueur peut se cacher. On interroge git
 *  plutôt que de balayer le disque : `node_modules`, `dist` et les artefacts locaux sont ainsi
 *  exclus par construction, sans liste noire à maintenir. */
const fichiersSuivis = (): string[] =>
    execFileSync('git', ['ls-files', '-z', '--', '*.md', '*.ts', '*.tsx', '*.json', '*.yml', '*.yaml', '*.css'], {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
    })
        .split('\0')
        .filter(Boolean)
        // Ce fichier-ci porte les motifs dans ses propres fixtures et ses commentaires.
        .filter((f) => f !== 'tests/noConflictMarkers.test.ts');

const ecrireFixture = (nom: string, contenu: string): string => {
    const dir = mkdtempSync(join(tmpdir(), 'conflict-guard-'));
    const chemin = join(dir, nom);
    writeFileSync(chemin, contenu, 'utf8');
    return chemin;
};

describe('[MERGE-MARKERS-IN-MAIN] aucun marqueur de conflit ne survit dans un fichier suivi', () => {
    it('le dépôt est propre', () => {
        const trouvailles = scannerFichiers(fichiersSuivis());
        const rapport = trouvailles.map((t) => `${t.fichier}:${t.ligne} — ${t.texte}`).join('\n');
        expect(rapport, `Marqueurs de conflit committés :\n${rapport}`).toBe('');
    });

    // ⚠️ PREUVE QUE LA GARDE DISCRIMINE. Sans ça, « rien trouvé » sur un dépôt propre est
    // indistinguable d'un scanner qui ne cherche rien. On lui donne donc de VRAIS fichiers portant
    // le contenu exact livré sur `main` — bloc déséquilibré inclus, qui EST le cas réel du BACKLOG —
    // et on exige que `scannerFichiers`, la fonction utilisée par le test ci-dessus, les voie.
    it.each([
        ['bloc complet', ['a', '<<<<<<< HEAD', 'x', '=======', 'y', '>>>>>>> origin/main', 'b'].join('\n'), 3],
        ['bloc déséquilibré (le cas réel du BACKLOG)', ['<<<<<<< HEAD', 'x', '<<<<<<< HEAD', 'y', '>>>>>>> origin/main'].join('\n'), 3],
        ['fermant seul', ['texte', '>>>>>>> origin/main'].join('\n'), 1],
    ])('elle VOIT le cas « %s »', (_nom, contenu, attendus) => {
        const trouvailles = scannerFichiers([ecrireFixture('cas.md', contenu)]);
        expect(trouvailles).toHaveLength(attendus as number);
    });

    // Le pendant du test précédent : la garde ne doit PAS crier sur un `=======` légitime. Un titre
    // setext en Markdown s'écrit exactement comme la ligne du milieu d'un conflit — d'où la règle
    // « on ne regarde `=======` que dans un fichier qui porte déjà un chevron ». Sans ce test, on
    // pourrait durcir la garde jusqu'à la rendre inutilisable sans s'en apercevoir.
    it("elle IGNORE un `=======` isolé, qui est un titre setext valide en Markdown", () => {
        const chemin = ecrireFixture('titre.md', ['Mon titre', '=======', '', 'du texte'].join('\n'));
        expect(scannerFichiers([chemin])).toEqual([]);
    });
});
