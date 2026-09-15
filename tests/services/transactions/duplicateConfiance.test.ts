/**
 * [TX-DUPLICATES-BRUIT] — MESURÉ le 2026-09-15 sur 321 transactions RÉELLES de Marc
 * (01/07 → 14/09, re-dérivable par `npx tsx scripts/mesureDoublons.ts <extrait.tsv>`).
 *
 * Marc : « j'ai beaucoup trop de doublons que j'arrive pas à enlever […] c'est vraiment pas
 * efficace ». Mesuré, le détecteur groupait `OnlyFans −100 $` avec un `Bill payment /Carte de
 * crédit −100 $` ET un `Interac e-Transfer to /Maxime −100 $` — trois dépenses sans aucun rapport
 * qui partagent un montant rond. **3 groupes sur 10** étaient de telles collisions à 3 jours de
 * tolérance. Un panneau dont un tiers des propositions est manifestement faux ne se trie pas : il
 * se fait ignorer en entier.
 *
 * Le libellé reste HORS du critère de REGROUPEMENT — c'est la décision d'origine, et elle vise un
 * vrai cas (un doublon né de deux sources d'import porte deux libellés). Ce qui change, c'est qu'il
 * CLASSE le résultat : `merchantKey` normalise assez fort pour que `MCDONALD'S 40044` (relevé) et
 * `McDonald's` (Fintable) tombent tous deux sur `mcdonald s`, donc la paire cross-source garde une
 * confiance élevée pendant que les collisions descendent en `faible`.
 *
 * ⚠️ Les fixtures ci-dessous sont les VRAIS libellés et montants de ces collisions — c'est le seul
 * moyen que la garde échoue si la normalisation cesse de les distinguer.
 */
import { describe, it, expect } from 'vitest';
import { findDuplicateGroups, merchantKey } from '../../../services/transactions/duplicateDetection';
import type { Transaction } from '../../../types';

let prochainId = 1;
function tx(date: string, amount: number, payee: string): Transaction {
    return { id: prochainId++, date, payee, amount, category: 'Autre', status: 'processed' } as Transaction;
}

describe('[TX-DUPLICATES-BRUIT] la confiance sépare les vrais doublons des collisions de montant', () => {
    it('COLLISION MESURÉE : trois dépenses sans rapport à −100 $ ne sont plus proposées d\'office', () => {
        const txs = [
            tx('2026-07-10', -100, 'OnlyFans'),
            tx('2026-07-10', -100, 'Bill payment - AccèsD - Internet /Carte de crédit'),
            tx('2026-07-13', -100, 'Interac e-Transfer to /Maxime /'),
        ];
        const groupes = findDuplicateGroups(txs, { dayToleranceDays: 3 });

        // Le groupe existe toujours — on ne PERD rien, la décision d'origine est intacte…
        expect(groupes).toHaveLength(1);
        expect(groupes[0].members).toHaveLength(3);
        // …mais il est marqué `faible`, donc l'UI ne le pré-coche pas.
        expect(groupes[0].confiance).toBe('faible');
    });

    it('VRAI DOUBLON MESURÉ : 7× « Metro Rj Rio De » −7,90 le même jour reste en confiance HAUTE', () => {
        // Marc, interrogé le 2026-09-15 sur ces sept lignes : « 2 vrais achetés ». Donc la
        // répétition identique du même jour EST bien de la duplication chez lui — la garde
        // verrouille que ce groupe ne se fasse pas déclasser au passage.
        const txs = Array.from({ length: 7 }, () => tx('2026-08-31', -7.9, 'Metro Rj Rio De'));
        const groupes = findDuplicateGroups(txs, { dayToleranceDays: 0 });

        expect(groupes).toHaveLength(1);
        expect(groupes[0].confiance).toBe('haute');
        expect(groupes[0].members).toHaveLength(7);
    });

    it('CROSS-SOURCE MESURÉ : le relevé en capitales et le libellé Fintable restent appariés', () => {
        // C'est l'intention d'ORIGINE de la décision « le libellé n'entre pas dans le critère ».
        // Si la normalisation devenait trop stricte, ce cas retomberait en `faible` et le doublon
        // à deux sources — le seul que la dédup par clé `date|montant|payee` ne peut pas voir —
        // cesserait d'être proposé. C'est ce que cette garde interdit.
        const txs = [
            tx('2026-07-06', -18.84, "MCDONALD'S 40044"),
            tx('2026-07-09', -18.84, "McDonald's"),
        ];
        const groupes = findDuplicateGroups(txs, { dayToleranceDays: 3 });

        expect(merchantKey("MCDONALD'S 40044")).toBe(merchantKey("McDonald's"));
        // ⚠️ Le témoin ci-dessus est REDONDANT et c'est mesuré : retirer la règle qui efface les
        // n° de succursale le laisse VERT, parce que `slice(0, 2)` coupe déjà après « mcdonald s ».
        // Le témoin qui DISCRIMINE vraiment est un marchand dont le numéro tombe dans les deux
        // premiers jetons — `MAXI 8676` (relevé) contre `Maxi` (Fintable), deux vrais libellés de
        // l'état de Marc. Sans la règle, `maxi 8676` ≠ `maxi` et le rapprochement est perdu.
        expect(merchantKey('MAXI 8676')).toBe(merchantKey('Maxi'));
        expect(groupes).toHaveLength(1);
        expect(groupes[0].confiance).toBe('moyenne'); // même marchand, dates différentes
    });

    it('le TRI met la confiance avant le montant — la première ligne décide si le panneau est cru', () => {
        // Sans ce tri, la collision à 100 $ passait DEVANT le vrai doublon à 7,90 $.
        const txs = [
            tx('2026-07-10', -100, 'OnlyFans'),
            tx('2026-07-10', -100, 'Bill payment - AccèsD - Internet /Carte de crédit'),
            tx('2026-08-31', -7.9, 'Metro Rj Rio De'),
            tx('2026-08-31', -7.9, 'Metro Rj Rio De'),
        ];
        const groupes = findDuplicateGroups(txs, { dayToleranceDays: 0 });

        expect(groupes.map((g) => g.confiance)).toEqual(['haute', 'faible']);
        expect(Math.abs(groupes[0].amount)).toBe(7.9);
    });

    it('la clé marchand est DÉLIBÉRÉMENT imparfaite, et ses trous sont écrits', () => {
        // ⚠️ Ce test ne défend pas une qualité : il EMPÊCHE de croire que la clé apparie tout.
        // Elle CLASSE, elle ne regroupe pas (cf. le JSDoc de `merchantKey`) — un trou coûte une
        // confiance `faible`, jamais un doublon perdu, puisque le groupe reste listé.
        // Mesuré sur les vrais libellés de Marc :
        expect(merchantKey('Maxi 8664 Baie')).toBe('maxi baie');   // la VILLE reste dans les 2 jetons
        expect(merchantKey('Maxi')).toBe('maxi');                  // donc ces deux-là ne s'apparient PAS
        expect(merchantKey('UBER CANADA/UBEREATS')).toBe('uber ubereats');
        expect(merchantKey('Uber Eats')).toBe('uber eats');        // ni ceux-là

        // Et ce qu'elle apparie bien, elle l'apparie pour de vrai — sinon le test ci-dessus
        // serait satisfait par une clé qui ne rapproche JAMAIS rien.
        expect(merchantKey('COUCHE-TARD 1141 QUEBEC QC')).toBe(merchantKey('COUCHE-TARD 1141'));
        expect(merchantKey('METRO FERLAND DU MARAI')).toBe(merchantKey('Metro Ferland Du Marai'));
        expect(merchantKey('GOOGLE *Cell to Singul')).toBe(merchantKey('Cell To Singul Halifax Ns'));
    });

    it('ANTI-VACUITÉ : sans collision, aucun groupe n\'est déclassé', () => {
        // Sans ce cas, une normalisation qui rendrait TOUJOURS la même clé (ou toujours des clés
        // différentes) passerait l'un des deux tests ci-dessus sans qu'on le voie.
        const txs = [
            tx('2026-09-09', -13.5, 'Sodexo'),
            tx('2026-09-09', -13.5, 'Sodexo'),
        ];
        const groupes = findDuplicateGroups(txs, { dayToleranceDays: 0 });
        expect(groupes[0].confiance).toBe('haute');
        expect(merchantKey('Sodexo')).not.toBe(merchantKey('Uber'));
    });
});
