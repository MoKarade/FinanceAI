// tests/confidentialitePortefeuille.test.ts
//
// [PTF-L05-GARDE-FUITE] Le dépôt est PUBLIC. Le Lot 0 de la refonte du portefeuille (2026-09-24)
// s'est appuyé sur un fichier de vérification fourni par Marc (relevés de courtier, quantités,
// soldes par compte, coûts, journal des opérations, origine des titres) dont le cahier des charges
// demandait la copie « dans les fixtures de tests ». Copié, il publiait le portefeuille entier.
//
// Et une fuite existait DÉJÀ : un code de sous-compte de courtier complet vivait dans un test de
// catégorisation depuis des semaines — rien ne le cherchait, donc rien ne rougissait
// (`UNE-REGLE-DE-TENUE-SANS-GARDE-DERIVE-SANS-QUE-RIEN-NE-ROUGISSE`, appliquée à la vie privée).
//
// Ce que la garde interdit, et pourquoi c'est ÇA et pas une liste de valeurs :
//   1. les CLÉS STRUCTURELLES du fichier de vérification. Elles n'ont aucun usage dans le code de
//      l'app ; les retrouver dans un fichier suivi veut dire qu'on y a recopié le fichier (ou un
//      morceau). Lister les VALEURS serait les publier, et une empreinte d'un total à 8 chiffres se
//      retrouve par force brute — l'interdit porte donc sur la FORME, jamais sur le contenu ;
//   2. un code de compte après le mot « Disnat » (lettres ET chiffres mêlés, 5 à 8 caractères) :
//      la forme exacte de la fuite trouvée. Un code purement numérique (`0000000`) reste permis :
//      c'est l'écriture qu'on utilise pour un exemple manifestement fictif.
// ⚠️ Ce fichier ne contient AUCUNE donnée réelle, et c'est une contrainte, pas un hasard : une garde
// qui énumérerait ce qu'elle protège serait elle-même la fuite.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** Clés du fichier de vérification du portefeuille. Aucune n'existe dans le code applicatif. */
export const CLES_INTERDITES = [
    'total_releve_cad',
    'total_recalcule_disnat_cad',
    'couts_disnat',
    'origine_des_titres',
    'receptions_disnat',
    'retenues_observees',
    'virements_internes',
    'valeur_independante_cad',
] as const;

/** « Disnat » suivi d'un code : le code doit mêler lettres et chiffres pour être signalé. */
const CODE_APRES_DISNAT = /disnat[^a-z0-9\n]{1,3}([a-z0-9]{5,8})\b/gi;

export interface Fuite {
    fichier: string;
    ligne: number;
    motif: string;
}

/** Le SCANNER, appelé tel quel par les tests de discrimination (jamais une copie de sa logique). */
export const chercherFuites = (fichier: string, contenu: string): Fuite[] => {
    const out: Fuite[] = [];
    contenu.split('\n').forEach((texte, i) => {
        for (const cle of CLES_INTERDITES) {
            if (texte.includes(cle)) out.push({ fichier, ligne: i + 1, motif: `clé « ${cle} »` });
        }
        for (const m of texte.matchAll(CODE_APRES_DISNAT)) {
            const code = m[1];
            if (/[a-z]/i.test(code) && /[0-9]/.test(code)) {
                // Le code n'est PAS recopié dans le message : le rapport d'échec s'imprime dans un
                // journal de CI public.
                out.push({ fichier, ligne: i + 1, motif: 'code de compte après « Disnat »' });
            }
        }
    });
    return out;
};

const CE_FICHIER = 'tests/confidentialitePortefeuille.test.ts';

/** Fichiers SUIVIS par git (texte) : `node_modules`, `dist` et le scratchpad sont exclus par
 *  construction. Ce fichier-ci porte les clés qu'il interdit, il est donc le seul exempté. */
const fichiersSuivis = (): string[] =>
    execFileSync('git', ['ls-files', '-z', '--', '*.md', '*.ts', '*.tsx', '*.js', '*.mjs', '*.cjs', '*.json', '*.yml', '*.yaml', '*.csv', '*.txt', '*.html'], {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
    })
        .split('\0')
        .filter(Boolean)
        .filter((f) => f !== CE_FICHIER);

describe('[PTF-L05-GARDE-FUITE] aucune donnée du portefeuille réel dans le dépôt public', () => {
    it('aucun fichier suivi ne porte une clé du fichier de vérification ni un code de compte', () => {
        const fichiers = fichiersSuivis();
        // Anti-vacuité : une garde qui ne balaie rien est verte par construction.
        expect(fichiers.length, 'git ls-files ne rend presque rien : la garde ne balaierait rien').toBeGreaterThan(500);
        const fuites: Fuite[] = [];
        for (const f of fichiers) {
            let contenu: string;
            try {
                contenu = readFileSync(f, 'utf8');
            } catch {
                continue; // dans l'index, absent du disque
            }
            fuites.push(...chercherFuites(f, contenu));
        }
        const rapport = fuites.map((x) => `${x.fichier}:${x.ligne} — ${x.motif}`).join('\n');
        expect(rapport, `Donnée du portefeuille réel dans un fichier suivi :\n${rapport}`).toBe('');
    });

    // PREUVE QUE LA GARDE DISCRIMINE, sur la fonction que le test ci-dessus appelle. Les chaînes sont
    // composées à l'exécution : écrites en clair, elles feraient rougir la garde sur son propre fichier
    // si l'exemption venait à sauter — et elles ne sont de toute façon PAS de vraies valeurs.
    it.each([
        ['une clé du fichier de vérification', `{ "${'couts' + '_disnat'}": {} }`],
        ['un code lettres+chiffres après « Disnat »', `Virement Disnat ${'AB12' + 'CD3'}`],
        ['la même chose en minuscules, après un séparateur', `virement disnat - ${'x9y8' + 'z7'}`],
    ])('elle VOIT %s', (_nom, texte) => {
        expect(chercherFuites('cas.md', texte)).toHaveLength(1);
    });

    it.each([
        ['un code purement numérique (exemple fictif)', 'Virement Disnat 0000000'],
        ['le mot « Disnat » seul, en prose', 'Relevé Disnat du mois — lecture du PDF'],
        ['une année après « Disnat »', 'Disnat 2026'],
    ])("elle IGNORE %s", (_nom, texte) => {
        expect(chercherFuites('cas.md', texte)).toEqual([]);
    });
});
