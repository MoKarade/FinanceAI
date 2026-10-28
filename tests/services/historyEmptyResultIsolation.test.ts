// [HISTORY-OBJET-VIDE-PARTAGE] Le chemin « aucune donnée » ne doit rendre AUCUN objet partagé.
//
// Même classe que `[TEST-PERSONA-FIXTURE-PARTAGEE]` (lot 33), mais en PRODUCTION : les deux modules
// d'historique renvoyaient une constante de MODULE sur le chemin vide, donc deux appels rendaient
// le même objet — tableaux compris. Un `push` ou un `sort` posé par n'importe quel consommateur
// sur un résultat vide restait là pour la vie du processus, et tous les appels vides suivants
// voyaient des données qu'ils n'avaient jamais lues.
//
// ⚠️ Ce que ce fichier NE teste pas : le contenu du calcul (couvert par `dayTransactions.test.ts`
// et `monthCategories.test.ts`). Ici on ne teste QUE l'isolation entre deux appels.
//
// ⚠️ QUEL chemin exactement — le ticket disait « aucune transaction », c'est plus étroit que ça.
// Une LISTE VIDE est `truthy` : elle traverse la boucle et construit déjà un objet neuf, donc elle
// n'a jamais été concernée. Le retour partagé était celui des ENTRÉES INUTILISABLES — liste absente
// (`null`/`undefined`) ou date trop courte pour être découpée. Mesuré : avec `[]`, le test ci-dessous
// passe SUR LE CODE D'AVANT, ce qui en aurait fait une garde vacueuse.
//
// La garde a deux moitiés qui ne se remplacent pas :
//  - à l'ÉCRITURE, le type `readonly` refuse la mutation — vérifié par les `@ts-expect-error`
//    ci-dessous, qui deviennent eux-mêmes une erreur de compilation si le type redevient mutable
//    (c'est `npm run typecheck` qui l'attrape, pas Vitest) ;
//  - à l'EXÉCUTION, la fabrique rend la mutation inoffensive pour les appels suivants — vérifié
//    par les cas de contamination, qui contournent délibérément le type par un `as`.
import { describe, it, expect } from 'vitest';
import { transactionsOnDay } from '../../services/history/dayTransactions';
import { monthCategories } from '../../services/history/monthCategories';
import type { Transaction } from '../../types';

const txn = (over: Partial<Transaction> = {}): Transaction => ({
    id: 1, date: '2026-03-04', description: 'x', amount: -10, category: 'Loyer',
    ...over,
} as unknown as Transaction);

describe('[HISTORY-OBJET-VIDE-PARTAGE] isolation du résultat « aucune donnée »', () => {
    it('transactionsOnDay : deux appels vides rendent des objets et des tableaux DISTINCTS', () => {
        const a = transactionsOnDay(null, '2026-03-04');
        const b = transactionsOnDay(null, '2026-03-04');
        expect(a).not.toBe(b);
        expect(a.counted).not.toBe(b.counted);
        expect(a.excluded).not.toBe(b.excluded);
        // Anti-vacuité : les deux sont bien le résultat VIDE (sinon on comparerait deux calculs).
        expect(a).toEqual({ counted: [], excluded: [], netCounted: 0 });
        expect(b).toEqual({ counted: [], excluded: [], netCounted: 0 });
    });

    it('transactionsOnDay : muter un résultat vide ne contamine PAS l\'appel suivant', () => {
        const pollue = transactionsOnDay(null, '2026-03-04');
        (pollue.counted as Transaction[]).push(txn({ amount: -4242 }));
        // Anti-vacuité : la mutation a bien atteint quelque chose. Sans ça, une fabrique qui
        // rendrait un tableau gelé rendrait ce test vert pour la mauvaise raison.
        expect(pollue.counted).toHaveLength(1);

        const propre = transactionsOnDay(null, '2026-03-04');
        expect(propre.counted).toHaveLength(0);
        expect(propre.netCounted).toBe(0);
    });

    it('monthCategories : deux appels vides rendent des objets et des tableaux DISTINCTS', () => {
        const a = monthCategories(null, '2026-07');
        const b = monthCategories(null, '2026-07');
        expect(a).not.toBe(b);
        expect(a.depenses).not.toBe(b.depenses);
        expect(a).toEqual({ depenses: [], totalDepenses: 0, sansCategorie: 0, montantSansCategorie: 0 });
    });

    it('monthCategories : trier un résultat vide ne contamine PAS l\'appel suivant', () => {
        // Le geste le plus naturel sur ce module : `depenses` est DÉJÀ trié, donc un consommateur
        // qui veut un autre ordre appelle `.sort()` — en place, sur le tableau partagé.
        const pollue = monthCategories(null, '2026-07');
        const liste = pollue.depenses as Array<{ categorie: string; montant: number; nombre: number }>;
        liste.push({ categorie: 'Fantôme', montant: 999, nombre: 1 });
        liste.sort((x, y) => y.montant - x.montant);
        expect(pollue.depenses).toHaveLength(1);

        const propre = monthCategories(null, '2026-07');
        expect(propre.depenses).toHaveLength(0);
        expect(propre.totalDepenses).toBe(0);
    });

    it('le TYPE refuse la mutation sans `as` (garde à l\'écriture, vérifiée par tsc)', () => {
        const jour = transactionsOnDay(null, '2026-03-04');
        const mois = monthCategories(null, '2026-07');
        // ⚠️ Ces deux lignes s'exécutent normalement (le tableau réel a bien `push`/`sort`) : ce que
        // le test verrouille ici n'est pas leur effet mais leur REFUS par le compilateur. Si le
        // `readonly` disparaissait du type, `@ts-expect-error` deviendrait à son tour une erreur
        // (« unused '@ts-expect-error' directive ») et `npm run typecheck` rougirait — Vitest, lui,
        // ne typecheck rien et laisserait passer.
        // @ts-expect-error `counted` est en lecture seule — `push` n'y est pas exposé.
        jour.counted.push(txn());
        // @ts-expect-error `depenses` est en lecture seule — `sort` en place n'y est pas exposé.
        mois.depenses.sort();
        // Et la mutation reste LOCALE : c'est la moitié « fabrique » de la garde.
        expect(transactionsOnDay(null, '2026-03-04').counted).toHaveLength(0);
        expect(monthCategories(null, '2026-07').depenses).toHaveLength(0);
    });
});
