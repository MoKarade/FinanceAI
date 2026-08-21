/**
 * [FUTUR-INFOBULLE-MONTANTS] Les montants des mouvements du jour, jusqu'à l'infobulle.
 *
 * Demande de Marc (2026-08-17), périmètre confirmé par lui : **le passé**. Un jour futur n'itemise
 * pas ses dépenses — le moteur répartit — donc il n'y a aucun montant par mouvement à montrer.
 *
 * ⚠️ CE QUE CE FICHIER VERROUILLE :
 *   1. `labels` est DÉRIVÉ de `movements`, pas accumulé en parallèle. Deux listes remplies
 *      séparément finissent par diverger, et l'infobulle afficherait des noms sans leurs montants.
 *   2. Le plafond d'affichage (6) devient VISIBLE via `movementsTotal`. Il était silencieux : tant
 *      qu'on n'affichait que des noms c'était un détail, mais avec des MONTANTS Marc lirait six
 *      dépenses en croyant les avoir toutes (même classe que `truncatedFrom`).
 */
import { describe, it, expect } from 'vitest';
import { buildDailyPastLedger } from '../../services/history/dailyPastLedger';
import type { MinimalPastTransaction } from '../../services/history/dailyPastLedger';

const JOUR = '2026-08-10';

const txn = (o: Partial<MinimalPastTransaction>): MinimalPastTransaction =>
    ({ date: JOUR, amount: -10, payee: 'Marchand', ...o }) as MinimalPastTransaction;

/** Un actif minimal, pour que la reconstruction produise des journées (cash ET placements requis). */
const actif = {
    id: 'a1', symbol: 'TEST', currency: 'CAD', accountType: 'CELI',
    quantity: 10, currentPrice: 10, buyPrice: 10,
    priceHistory: [
        { date: '2026-08-08', price: 10 }, { date: '2026-08-09', price: 10 },
        { date: '2026-08-10', price: 10 }, { date: '2026-08-11', price: 10 },
    ],
    purchases: [{ date: '2026-08-01', quantity: 10, price: 10 }],
} as never;

const construire = (transactions: MinimalPastTransaction[]) =>
    buildDailyPastLedger({
        from: '2026-08-08', to: '2026-08-11', today: '2026-08-12',
        transactions, currentCash: 10_000, assets: [actif],
        // ⚠️ Noms EXACTS de `BuildDailyPastInput` : `fx` et `equityByYear` (une Map), pas
        // `fxRates`/`realEstateGoals`. Mon premier jet les avait inventés et les 7 tests
        // plantaient en accusant le code — deuxième fois aujourd'hui qu'une fixture inventée
        // mesure autre chose que ce qu'elle croit.
        fx: {}, equityByYear: new Map<number, number>(), currentDebtNonImmo: 0, debts: [],
    } as never);

const ligneDu = (res: { rows: Array<{ date: string }> }, date: string) =>
    res.rows.find((r) => r.date === date) as never as {
        movements: Array<{ payee: string; amount: number }>; movementsTotal: number; labels: string[];
    };

describe('[FUTUR-INFOBULLE-MONTANTS] les mouvements portent leur montant', () => {
    it('chaque mouvement expose son marchand ET son montant', () => {
        const r = construire([txn({ payee: 'Épicerie Metro', amount: -137.41 })]);
        const jour = ligneDu(r, JOUR);
        expect(jour.movements).toHaveLength(1);
        expect(jour.movements[0]).toMatchObject({ payee: 'Épicerie Metro', amount: -137.41 });
    });

    // ⚠️ L'invariant qui empêche noms et montants de diverger.
    it('`labels` est DÉRIVÉ de `movements` — jamais une seconde liste', () => {
        const r = construire([
            txn({ payee: 'A', amount: -1 }), txn({ payee: 'B', amount: -2 }),
        ]);
        const jour = ligneDu(r, JOUR);
        expect(jour.labels).toEqual(jour.movements.map((m) => m.payee));
    });

    it('les ENTRÉES gardent leur signe (une paie n’est pas une dépense)', () => {
        const r = construire([txn({ payee: 'Paie', amount: 2_000 })]);
        expect(ligneDu(r, JOUR).movements[0].amount).toBe(2_000);
    });
});

describe('[FUTUR-INFOBULLE-MONTANTS] la troncature devient VISIBLE', () => {
    it('au-delà de 6 mouvements, le TOTAL reste connu', () => {
        const r = construire(
            Array.from({ length: 9 }, (_, i) => txn({ payee: `M${i}`, amount: -(i + 1) })),
        );
        const jour = ligneDu(r, JOUR);
        // Affichage plafonné…
        expect(jour.movements).toHaveLength(6);
        // …mais le compte réel est exposé, pour dire « +3 autres » au lieu de mentir par omission.
        expect(jour.movementsTotal).toBe(9);
    });

    it('sous le plafond, total === nombre affiché (pas de « +0 autres »)', () => {
        const r = construire([txn({ payee: 'A' }), txn({ payee: 'B' })]);
        const jour = ligneDu(r, JOUR);
        expect(jour.movementsTotal).toBe(jour.movements.length);
    });

    /**
     * ⚠️ [finding silent-failure #644] Une transaction SANS description comptait pour ZÉRO.
     *
     * Le total et la liste affichée vivaient sous le même `if (t.payee)`. Une transaction sans
     * description entrait bien dans l'`Income`/`Expenses` du jour — elle a bougé le solde — mais
     * pas dans `movementsTotal` : le total valait donc le nombre de lignes AFFICHÉES, « +N autres »
     * ne s'affichait jamais, et Marc lisait la liste en croyant l'avoir toute. Exactement la
     * troncature silencieuse que ce champ existe pour supprimer, réintroduite par un autre
     * déclencheur. Cas réel : `mcp/ingest/applyDocument.ts` écrit `payee: tx.payee || ''`.
     */
    it('une transaction SANS description compte dans le total (mais pas dans la liste)', () => {
        const r = construire([
            txn({ payee: 'Metro', amount: -40 }),
            txn({ payee: '', amount: -60 }),
            txn({ payee: '', amount: -25 }),
        ]);
        const jour = ligneDu(r, JOUR);
        expect(jour.movements.map((m) => m.payee)).toEqual(['Metro']);
        // Sur le code d'avant : 1. Trois transactions ont bougé le solde, le total doit le dire.
        expect(jour.movementsTotal).toBe(3);
    });

    it('un jour dont AUCUNE transaction n’est décrite garde son compte', () => {
        // Le cas le plus traître : la liste affichée est VIDE, donc le compte est le SEUL indice
        // que des mouvements existent ce jour-là.
        const r = construire([txn({ payee: '', amount: -10 }), txn({ payee: '', amount: -20 })]);
        const jour = ligneDu(r, JOUR);
        expect(jour.movements).toEqual([]);
        expect(jour.movementsTotal).toBe(2);
    });

    // Même base d'exclusion que la courbe : un doublon ou un virement n'entre pas dans la liste.
    it.each([
        ['un doublon', { isDuplicate: true }],
        ['un virement interne', { isTransfer: true }],
    ])('%s n’apparaît pas dans les mouvements', (_nom, flag) => {
        const r = construire([txn({ payee: 'Exclu', ...flag }), txn({ payee: 'Gardé' })]);
        const jour = ligneDu(r, JOUR);
        expect(jour.movements.map((m) => m.payee)).toEqual(['Gardé']);
        expect(jour.movementsTotal).toBe(1);
    });
});
