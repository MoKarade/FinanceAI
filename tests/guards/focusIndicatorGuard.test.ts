// [A11Y-FOCUS-INDICATOR-MISSING] `outline-none` ne se pose jamais sans remplacement visible.
//
// ⚠️ WCAG 2.4.7 : un élément qui reçoit le focus doit le MONTRER. Retirer l'outline natif est
// courant — le dépôt le fait partout via `.focus-ring` (`index.css`), qui l'échange contre un anneau
// `focus-visible`. Le défaut est de le retirer et de ne rien mettre à la place : le champ reçoit le
// focus sans que rien ne l'indique, et la navigation au clavier devient aveugle.
//
// ⚠️ CE QUE CETTE GARDE NE PEUT PAS FAIRE, et c'est pour ça qu'elle est bâtie sur une LISTE. Le
// remplacement visuel est souvent porté par le PARENT (`focus-within:border-primary/50`) — c'est le
// patron du dépôt, employé par `PageSetupGate` et la barre du chat, et celui retenu pour corriger
// `Budget` et `CommandPalette` : un seul conteneur couvre deux champs et l'anneau ne déborde pas
// d'une cellule serrée. Un scan LIGNE À LIGNE ne voit pas le parent ; remonter aux ancêtres par
// regex sur du JSX est exactement ce qui a coûté quatre itérations au recenseur du lot 43. On
// déclare donc nominativement les cas légitimes, avec leur raison — l'oubli d'un cas NOUVEAU est
// alors bruyant, et sa lecture manuelle est un geste de quelques secondes.
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { stripComments, partDeCodeRestante } from '../../utils/stripComments';

const racine = resolve(process.cwd(), 'components');

/** Toute compensation acceptée sur la ligne elle-même. */
const COMPENSE = /focus:(ring|border|bg|text|shadow|outline)|focus-ring|focus-visible:|focus-within:/;

/**
 * Les `outline-none` LÉGITIMES, un par un, avec ce qui les justifie. Vérifié à la main, et chaque
 * entrée est contrôlée plus bas : une exemption qui ne correspond plus à rien se retire.
 */
const EXEMPTIONS: ReadonlyArray<{ fichier: string; jeton: string; raison: string }> = [
    {
        fichier: 'Budget.tsx', jeton: 'type="date"',
        raison: 'les deux champs de période vivent dans une pilule qui porte `focus-within:border-primary/50` '
            + '— un seul conteneur, deux champs couverts, et pas d\'anneau qui déborde de la pilule.',
    },
    {
        fichier: 'CommandPalette.tsx', jeton: 'placeholder-ink-400',
        raison: 'le champ de recherche est couvert par le `focus-within:border-primary/50` de sa barre.',
    },
    {
        fichier: 'AiChatView.tsx', jeton: 'flex-1 bg-transparent px-4',
        raison: 'la barre de saisie du chat porte déjà `focus-within:border-primary/50` (préexistant).',
    },
    {
        fichier: 'PageSetupGate.tsx', jeton: 'flex-1 min-w-0 bg-transparent',
        raison: 'le conteneur du champ porte déjà `focus-within:border-primary/4x` (préexistant).',
    },
    {
        fichier: 'FutureProjection.tsx', jeton: 'tabIndex={-1}',
        raison: 'conteneur de RÉGION ciblé par un focus PROGRAMMATIQUE (annonce au lecteur d\'écran), '
            + 'jamais atteint par tabulation : un anneau y serait du bruit visuel sans utilisateur.',
    },
    {
        fichier: 'AiConversationList.tsx', jeton: 'overflow-y-auto p-2',
        raison: 'même cas : conteneur de liste focalisé par programme, hors ordre de tabulation.',
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

interface Ligne { chemin: string; ligne: number; texte: string; nomFichier: string }

function outlineNoneNonCompenses(): Ligne[] {
    const out: Ligne[] = [];
    for (const chemin of fichiersTsx(racine)) {
        lireCode(chemin).split('\n').forEach((texte, i) => {
            if (!texte.includes('outline-none') || COMPENSE.test(texte)) return;
            out.push({
                chemin: chemin.replace(`${process.cwd()}/`, ''),
                ligne: i + 1,
                texte,
                nomFichier: chemin.split('/').pop() ?? '',
            });
        });
    }
    return out;
}

const estExempte = (l: Ligne) =>
    EXEMPTIONS.some((e) => l.nomFichier === e.fichier && l.texte.includes(e.jeton));

describe('[A11Y-FOCUS-INDICATOR-MISSING] un focus retiré est un focus remplacé', () => {
    it('aucun `outline-none` sans remplacement, hors exemptions déclarées', () => {
        const toutes = outlineNoneNonCompenses();
        const offenders = toutes.filter((l) => !estExempte(l)).map((l) => `${l.chemin}:${l.ligne}`);

        // ANTI-VACUITÉ : le dépôt emploie `outline-none` massivement (via `.focus-ring`), donc un
        // scan qui n'en trouve plus une seule occurrence ne lit pas ce qu'il croit.
        const total = fichiersTsx(racine)
            .reduce((n, c) => n + (lireCode(c).match(/outline-none/g)?.length ?? 0), 0);
        expect(total, 'plus aucun `outline-none` trouvé → le scan ne lit pas ce qu\'il croit')
            .toBeGreaterThanOrEqual(20);

        expect(offenders, `Focus retiré sans remplacement :\n${offenders.join('\n')}`).toEqual([]);
    });

    it('chaque exemption est RÉELLE — une exemption périmée se retire', () => {
        const toutes = outlineNoneNonCompenses();
        for (const e of EXEMPTIONS) {
            const trouve = toutes.some((l) => l.nomFichier === e.fichier && l.texte.includes(e.jeton));
            expect(trouve, `exemption périmée : ${e.fichier} / ${e.jeton}`).toBe(true);
        }
    });
});
