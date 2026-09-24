/**
 * [TX-DUPLICATES-BRUIT] — MESURÉ le 2026-09-15 sur les transactions RÉELLES de Marc
 * (01/07 → 14/09, re-dérivable par `npx tsx scripts/mesureDoublons.ts <extrait.tsv>`).
 *
 * Marc : « j'ai beaucoup trop de doublons que j'arrive pas à enlever […] c'est vraiment pas
 * efficace ». Mesuré, le détecteur groupait une dépense ronde chez un marchand avec un `Bill payment /Carte de
 * crédit −60 $` ET un virement Interac du même montant — trois dépenses sans aucun rapport
 * qui partagent un montant rond. **3 groupes sur 10** étaient de telles collisions à 3 jours de
 * tolérance. Un panneau dont un tiers des propositions est manifestement faux ne se trie pas : il
 * se fait ignorer en entier.
 *
 * Le libellé reste HORS du critère de REGROUPEMENT — c'est la décision d'origine, et elle vise un
 * vrai cas (un doublon né de deux sources d'import porte deux libellés). Ce qui change, c'est qu'il
 * CLASSE le résultat : `cleMarchandPourConfiance` normalise assez fort pour que `MCDONALD'S 00000` (relevé) et
 * `McDonald's` (Fintable) tombent tous deux sur `mcdonald`, donc la paire cross-source garde une
 * confiance élevée pendant que les collisions descendent en `faible`.
 *
 * ⚠️ Les fixtures ci-dessous reproduisent la FORME de ces collisions — c'est le seul
 * moyen que la garde échoue si la normalisation cesse de les distinguer.
 */
import { describe, it, expect } from 'vitest';
import {
    findDuplicateGroups,
    cleMarchandPourConfiance as cleMarchand,
} from '../../../services/transactions/duplicateDetection';
import type { Transaction } from '../../../types';

let prochainId = 1;
function tx(date: string, amount: number, payee: string): Transaction {
    return { id: prochainId++, date, payee, amount, category: 'Autre', status: 'processed' } as Transaction;
}

describe('[TX-DUPLICATES-BRUIT] la confiance sépare les vrais doublons des collisions de montant', () => {
    it('COLLISION MESURÉE : trois dépenses sans rapport à −60 $ ne sont plus proposées d\'office', () => {
        const txs = [
            tx('2026-03-10', -60, 'Club Video Plus'),
            tx('2026-03-10', -60, 'Bill payment - AccèsD - Internet /Carte de crédit'),
            tx('2026-03-13', -60, 'Interac e-Transfer to /Alex /'),
        ];
        const groupes = findDuplicateGroups(txs, { dayToleranceDays: 3 });

        // Le groupe existe toujours — on ne PERD rien, la décision d'origine est intacte…
        expect(groupes).toHaveLength(1);
        expect(groupes[0].members).toHaveLength(3);
        // …mais il est marqué `faible`, donc l'UI ne le pré-coche pas.
        expect(groupes[0].confiance).toBe('faible');
    });

    it('VRAI DOUBLON (cas type) : 7× le même marchand au même montant le même jour reste en confiance HAUTE', () => {
        // Cas type, de la forme mesurée le 2026-09-15 : l'utilisateur a confirmé qu'une telle
        // répétition identique du même jour EST bien de la duplication — la garde verrouille
        // que ce groupe ne se fasse pas déclasser au passage.
        const txs = Array.from({ length: 7 }, () => tx('2026-05-20', -4.35, 'Transit Billet Unique'));
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
            tx('2026-03-06', -12.65, "MCDONALD'S 00123"),
            tx('2026-03-09', -12.65, "McDonald's"),
        ];
        const groupes = findDuplicateGroups(txs, { dayToleranceDays: 3 });

        expect(cleMarchand("MCDONALD'S 00123")).toBe(cleMarchand("McDonald's"));
        // ⚠️ Le témoin ci-dessus est REDONDANT et c'est mesuré : retirer la règle qui efface les
        // n° de succursale le laisse VERT, parce que `slice(0, 2)` coupe déjà après « mcdonald ».
        // Le témoin qui DISCRIMINE vraiment est un marchand dont le numéro tombe dans les deux
        // premiers jetons — `MAXI 0000` (relevé) contre `Maxi` (Fintable), deux libellés de
        // cette forme. Sans la règle, `maxi 0000` ≠ `maxi` et le rapprochement est perdu.
        expect(cleMarchand('MAXI 0000')).toBe(cleMarchand('Maxi'));
        expect(groupes).toHaveLength(1);
        expect(groupes[0].confiance).toBe('moyenne'); // même marchand, dates différentes
    });

    it('le TRI met la confiance avant le montant — la première ligne décide si le panneau est cru', () => {
        // Sans ce tri, la collision à 60 $ passait DEVANT le vrai doublon de quelques dollars.
        const txs = [
            tx('2026-03-10', -60, 'Club Video Plus'),
            tx('2026-03-10', -60, 'Bill payment - AccèsD - Internet /Carte de crédit'),
            tx('2026-05-20', -4.35, 'Transit Billet Unique'),
            tx('2026-05-20', -4.35, 'Transit Billet Unique'),
        ];
        const groupes = findDuplicateGroups(txs, { dayToleranceDays: 0 });

        expect(groupes.map((g) => g.confiance)).toEqual(['haute', 'faible']);
        expect(Math.abs(groupes[0].amount)).toBe(4.35);
    });

    it('la clé marchand est DÉLIBÉRÉMENT imparfaite, et ses trous sont écrits', () => {
        // ⚠️ Ce test ne défend pas une qualité : il EMPÊCHE de croire que la clé apparie tout.
        // Elle CLASSE, elle ne regroupe pas (cf. son JSDoc) — un trou coûte une
        // confiance `faible`, jamais un doublon perdu, puisque le groupe reste listé.
        // Mesuré sur des libellés de cette forme :
        expect(cleMarchand('Maxi 0000 Ville')).toBe('maxi ville');   // la VILLE reste dans les 2 jetons
        expect(cleMarchand('Maxi')).toBe('maxi');                  // donc ces deux-là ne s'apparient PAS
        expect(cleMarchand('UBER CANADA/UBEREATS')).toBe('uber ubereats');
        expect(cleMarchand('Uber Eats')).toBe('uber eats');        // ni ceux-là

        // Et ce qu'elle apparie bien, elle l'apparie pour de vrai — sinon le test ci-dessus
        // serait satisfait par une clé qui ne rapproche JAMAIS rien.
        expect(cleMarchand('COUCHE-TARD 0000 QUEBEC QC')).toBe(cleMarchand('COUCHE-TARD 0000'));
        expect(cleMarchand('METRO CENTRE VILLE')).toBe(cleMarchand('Metro Centre Ville'));
        expect(cleMarchand('GOOGLE *Jeu Puzzle')).toBe(cleMarchand('Jeu Puzzle Halifax Ns'));
    });

    it('CANAL ≠ MARCHAND : deux virements/chèques distincts au même montant restent `faible`', () => {
        // ⚠️ Trouvé par le panel de revue APRÈS le 1er jet de ce lot, et mesuré sur le vrai code :
        // `slice(0, 2)` ne gardait que les deux premiers jetons, donc pour les deux formats de
        // libellé les plus courants d'un relevé québécois — « Interac e-Transfer to /<personne> »
        // et « Bill payment - <fournisseur> » — le BÉNÉFICIAIRE (3ᵉ jeton) était systématiquement
        // coupé : `interac e` et `bill payment` pour tout le monde. Deux virements RÉELS et
        // DISTINCTS au même montant le même jour sortaient donc en `haute`, PRÉ-COCHÉS — soit
        // exactement la régression money-critical que ce lot prétend corriger, réintroduite une
        // marche plus bas (`isDuplicate` retire la ligne du solde, du budget ET des revenus).
        const virements = [
            tx('2026-07-10', -100, 'Interac e-Transfer to /Alex /'),
            tx('2026-07-10', -100, 'Interac e-Transfer to /Sam /'),
        ];
        expect(findDuplicateGroups(virements, { dayToleranceDays: 0 })[0].confiance).toBe('faible');

        const factures = [
            tx('2026-07-10', -250, 'Bill payment - Hydro Quebec'),
            tx('2026-07-10', -250, 'Bill payment - Bell Canada'),
        ];
        expect(findDuplicateGroups(factures, { dayToleranceDays: 0 })[0].confiance).toBe('faible');

        // Un CHÈQUE ne porte aucun marchand du tout : la clé est VIDE, ce qui vaut « je ne sais
        // pas » et descend aussi en `faible` — jamais en `haute` par un « ch » partagé.
        expect(cleMarchand('Ch 4521')).toBe('');
        expect(cleMarchand('CHQ 5678')).toBe('');
        const cheques = [
            tx('2026-07-10', -300, 'Ch 4521'),
            tx('2026-07-10', -300, 'Ch 9981'),
        ];
        expect(findDuplicateGroups(cheques, { dayToleranceDays: 0 })[0].confiance).toBe('faible');

        // ANTI-VACUITÉ du retrait de canal : il doit RÉVÉLER le bénéficiaire, pas tout effacer —
        // sinon « tout devient faible » passerait les trois assertions ci-dessus sans rien prouver.
        expect(cleMarchand('Interac e-Transfer to /Alex /')).toBe('alex');
        expect(cleMarchand('Bill payment - Hydro Quebec')).toBe('hydro');
        const memeBeneficiaire = [
            tx('2026-07-10', -100, 'Interac e-Transfer to /Alex /'),
            tx('2026-07-10', -100, 'VIREMENT INTERAC Alex'),
        ];
        expect(findDuplicateGroups(memeBeneficiaire, { dayToleranceDays: 0 })[0].confiance).toBe('haute');
    });

    it('ANTI-VACUITÉ : sans collision, aucun groupe n\'est déclassé', () => {
        // Sans ce cas, une normalisation qui rendrait TOUJOURS la même clé (ou toujours des clés
        // différentes) passerait l'un des deux tests ci-dessus sans qu'on le voie.
        const txs = [
            tx('2026-04-14', -6.75, 'Cafe Central'),
            tx('2026-04-14', -6.75, 'Cafe Central'),
        ];
        const groupes = findDuplicateGroups(txs, { dayToleranceDays: 0 });
        expect(groupes[0].confiance).toBe('haute');
        expect(cleMarchand('Cafe Central')).not.toBe(cleMarchand('Uber'));
    });
});
