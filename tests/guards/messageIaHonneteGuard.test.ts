// [AI-BUDGETMODAL-ERROR-COLLAPSE] Aucune surface IA ne doit accuser la clé sans savoir.
//
// ⚠️ Le défaut était réparti sur QUATRE écrans, tous écrivant la même phrase en dur. La corriger
// quatre fois aurait garanti qu'elles divergent — et surtout, rien n'aurait empêché la CINQUIÈME
// surface IA de recopier celle qu'elle avait sous les yeux. La garde vise donc la phrase EN DUR,
// pas la valeur d'un message : c'est la duplication qui est le défaut durable.
//
// ⚠️ Une exemption est déclarée, et elle dit une vraie limite plutôt que de la masquer — voir
// `EXEMPTIONS`.
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { stripCommentsJsx, partDeCodeRestante } from '../../utils/stripComments';

const racine = resolve(process.cwd(), 'components');
/** Les fichiers qui ont le DROIT d'écrire ces phrases : le module qui les définit, et ses tests. */
const SOURCE_DES_MESSAGES = 'services/messageErreurIa.ts';

/**
 * Une surface qui affiche « clé » à propos d'une erreur SANS pouvoir savoir que la clé est en cause.
 * On cherche la mention de la clé dans un texte de rendu, pas dans un appel au module.
 */
// ⚠️ PAS de `\b` après `cl[ée]` : `\b` est ASCII en JavaScript, et `é` n'est PAS un caractère de
// mot — il n'y a donc AUCUNE frontière entre `é` et l'espace qui suit, et `\bclé\b` ne matche
// jamais. Mesuré : la garde rendait « aucun offender » sur un fichier qui portait la phrase.
// ⚠️ PORTÉE : les messages qui parlent de la clé ANTHROPIC. Finnhub est un autre service, avec ses
// propres échecs (`AddStockForm`, `FutureHistorySection`) — `messageErreurIa` ne les couvre pas, et
// élargir la garde à eux la ferait rougir sur du code qu'elle n'a rien à proposer pour réparer.
// Consigné au BACKLOG (`[AI-FINNHUB-CAUSE-COLLAPSE]`) plutôt qu'étendu à la va-vite.
const ACCUSE_LA_CLE = /(Vérifie|vérifie|Configure|configure)[^<>{}\n]{0,60}cl[ée][^<>{}\n]{0,20}Anthropic/;

const EXEMPTIONS: ReadonlyArray<{ fichier: string; jeton: string; raison: string }> = [
    {
        fichier: 'CoupleOptimizationCard.tsx',
        jeton: 'Configure ta clé Anthropic dans Configuration pour activer l\'IA',
        raison: 'ce n\'est PAS un message d\'erreur : c\'est l\'état « aucune clé configurée », affiché '
            + 'À LA PLACE du bouton, avant tout appel. Il ne peut donc rien accuser à tort — la clé '
            + 'est réellement absente, l\'app le sait sans avoir rien tenté.',
    },
];

function fichiersTsx(dir: string): string[] {
    return readdirSync(dir).flatMap((nom) => {
        const chemin = join(dir, nom);
        if (statSync(chemin).isDirectory()) return fichiersTsx(chemin);
        return chemin.endsWith('.tsx') ? [chemin] : [];
    });
}

interface Ligne { chemin: string; ligne: number; texte: string }

function mentionsDeLaCle(): Ligne[] {
    const out: Ligne[] = [];
    for (const chemin of fichiersTsx(racine)) {
        const brut = readFileSync(chemin, 'utf8');
        // ⚠️ Source DÉCOMMENTÉE : les commentaires de ce lot CITENT la phrase fautive pour raconter
        // le défaut. Lue brute, la garde rougirait sur son propre récit — troisième fois que ce
        // piège se présente, et c'est toujours le commentaire explicatif qui le tend.
        const code = stripCommentsJsx(brut);
        if (brut.trim() !== '' && partDeCodeRestante(brut, code) < 0.05) {
            throw new Error(`${chemin} : décommentage suspect — la garde lirait un fichier vidé`);
        }
        code.split('\n').forEach((texte, i) => {
            if (ACCUSE_LA_CLE.test(texte)) out.push({ chemin: chemin.replace(`${process.cwd()}/`, ''), ligne: i + 1, texte: texte.trim() });
        });
    }
    return out;
}

describe('[AI-BUDGETMODAL-ERROR-COLLAPSE] la clé n\'est accusée que quand elle est en cause', () => {
    it('le module de messages EST la source — il porte bien les phrases', () => {
        // Anti-vacuité inversée : si les messages n'existaient nulle part, « aucun composant ne les
        // écrit » serait vrai et ne prouverait rien.
        const module = readFileSync(resolve(process.cwd(), SOURCE_DES_MESSAGES), 'utf8');
        expect(module).toMatch(/Clé Anthropic refusée/);
        expect(module).toMatch(/Aucune clé Anthropic configurée/);
    });

    it('aucun composant n\'écrit « vérifie ta clé » en dur, hors exemption déclarée', () => {
        const offenders = mentionsDeLaCle()
            .filter((l) => !EXEMPTIONS.some((e) => l.chemin.endsWith(`/${e.fichier}`) && l.texte.includes(e.jeton)))
            .map((l) => `${l.chemin}:${l.ligne} — ${l.texte.slice(0, 90)}`);
        expect(offenders, `Phrase qui accuse la clé, écrite en dur :\n${offenders.join('\n')}`).toEqual([]);
    });

    it('les quatre surfaces IA passent par le module partagé — ou disent qu\'elles ne savent pas', () => {
        // ⚠️ Témoins NOMMÉS. Trois surfaces reçoivent leur erreur et nomment la cause ; la
        // quatrième (`Investments`) ne le peut pas — `getRebalanceJustifications` avale l'erreur et
        // rend `[]`. Elle dit donc ce qu'elle SAIT (« n'a rien rendu »), ce qui est le comportement
        // attendu tant que `[AI-REBALANCE-CAUSE-PERDUE]` n'est pas livré. L'écrire ici empêche que
        // quelqu'un « améliore » ce message en réinventant une cause.
        for (const f of ['components/budget/BudgetAiModal.tsx', 'components/tax/CoupleOptimizationCard.tsx', 'components/realestate/RealEstateAdviceCard.tsx']) {
            const code = readFileSync(resolve(process.cwd(), f), 'utf8');
            expect(/messageErreurIa/.test(code), `${f} ne passe pas par le module partagé`).toBe(true);
        }
        const invest = stripCommentsJsx(readFileSync(resolve(process.cwd(), 'components/Investments.tsx'), 'utf8'));
        expect(invest, 'Investments accuse de nouveau la clé alors qu\'il ne connaît pas la cause').not.toMatch(ACCUSE_LA_CLE);
        expect(invest).toMatch(/n'a rien rendu/);
    });

    it('chaque exemption est RÉELLE — une exemption périmée se retire', () => {
        const brutes = mentionsDeLaCle();
        for (const e of EXEMPTIONS) {
            const trouve = brutes.some((l) => l.chemin.endsWith(`/${e.fichier}`) && l.texte.includes(e.jeton));
            expect(trouve, `exemption périmée : ${e.fichier}`).toBe(true);
        }
    });
});
