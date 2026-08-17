/**
 * [PASSE-REEL-RACCORD-CHUTE] D'où vient la marche à la frontière passé/aujourd'hui.
 *
 * Marc : « je vois une chute de 10k aujourd'hui, jsp pourquoi ». Ses données sont locales, donc
 * irreproductibles ici. Ce fichier MESURE donc le MÉCANISME sur des données construites, pour
 * établir la cause au lieu de la supposer.
 *
 * MÉCANIQUE. `reconstructCashHistoryDaily` remonte le temps À PARTIR du solde d'AUJOURD'HUI, en
 * DÉFAISANT les flux jour par jour. La série s'arrête à la VEILLE (aujourd'hui n'est pas
 * reconstruit : le présent vient de l'ancre du moteur). Il en découle, mécaniquement :
 *
 *     veille = solde_aujourd'hui − flux_du_jour
 *
 * Le dernier point du passé ANNULE donc les mouvements de la journée en cours, et la marche
 * veille→aujourd'hui vaut EXACTEMENT le flux net du jour.
 *
 * ⚠️ Ce n'est PAS un bug de calcul : l'argent est réellement sorti, les deux points sont justes.
 * C'est un défaut d'EXPLICATION — rien ne dit que la veille est un solde RECONSTRUIT qui a
 * volontairement défait la journée en cours. Une grosse dépense datée d'aujourd'hui (hypothèque,
 * transfert, facture) produit une chute de son montant exact, et revient à chaque échéance.
 */
import { describe, it, expect } from 'vitest';
import { reconstructCashHistoryDaily } from '../../services/history/reconstructCashHistory';
import type { MinimalPastTransaction } from '../../services/history/dailyPastLedger';

const AUJOURDHUI = '2026-08-17';
const VEILLE = '2026-08-16';

const txn = (o: Partial<MinimalPastTransaction>): MinimalPastTransaction =>
    ({ date: '2026-08-01', amount: 0, ...o }) as MinimalPastTransaction;

const veilleDe = (points: ReadonlyArray<{ date: string; cash: number }>): number => {
    const p = points.find((x) => x.date === VEILLE);
    if (!p) throw new Error('point de la veille absent');
    return p.cash;
};

describe('[PASSE-REEL-RACCORD-CHUTE] la marche vaut le flux du JOUR', () => {
    it('une grosse dépense datée AUJOURD’HUI crée une chute de son montant exact', () => {
        const soldeAujourdhui = 50_000;
        const res = reconstructCashHistoryDaily(
            [txn({ date: '2026-08-10', amount: -100 }), txn({ date: AUJOURDHUI, amount: -10_000 })],
            soldeAujourdhui,
            AUJOURDHUI,
        );
        // La veille a été reconstruite en DÉFAISANT la sortie du jour : elle est donc PLUS HAUTE.
        expect(veilleDe(res.points)).toBe(soldeAujourdhui + 10_000);
        // La marche veille → aujourd'hui = −10 000 $. C'est LA chute que Marc voit.
        expect(soldeAujourdhui - veilleDe(res.points)).toBe(-10_000);
    });

    it('sans mouvement aujourd’hui, il n’y a AUCUNE marche', () => {
        const res = reconstructCashHistoryDaily(
            [txn({ date: '2026-08-10', amount: -100 })],
            50_000,
            AUJOURDHUI,
        );
        // Garde DISCRIMINANTE : sans elle, le test précédent resterait compatible avec « la veille
        // est toujours décalée », ce qui accuserait la reconstruction au lieu du flux du jour.
        expect(50_000 - veilleDe(res.points)).toBe(0);
    });

    it('une ENTRÉE du jour produit la marche INVERSE (donc pas un biais à la baisse)', () => {
        const res = reconstructCashHistoryDaily(
            [txn({ date: '2026-08-01', amount: -1 }), txn({ date: AUJOURDHUI, amount: +10_000 })],
            50_000,
            AUJOURDHUI,
        );
        expect(50_000 - veilleDe(res.points)).toBe(+10_000);
    });

    it('un VIREMENT interne daté aujourd’hui ne crée AUCUNE marche (exclu comme dans l’ancre)', () => {
        const res = reconstructCashHistoryDaily(
            [txn({ date: '2026-08-01', amount: -1 }), txn({ date: AUJOURDHUI, amount: -10_000, isTransfer: true })],
            50_000,
            AUJOURDHUI,
        );
        expect(50_000 - veilleDe(res.points)).toBe(0);
    });
});

describe('[PASSE-REEL-RACCORD-CHUTE] la SECONDE cause, DISTINCTE : ce que l’ancre compte sans pouvoir le placer', () => {
    // Celle-ci décale TOUT le niveau passé au lieu de créer une marche d'un jour. Déjà exposée
    // (`undatedTotal`, `flowsAfterNowDate`) et affichée dans le bandeau « Courbe au jour ».
    it('une transaction datée au MOIS seul est comptée à part, jamais placée dans un jour', () => {
        const res = reconstructCashHistoryDaily(
            [txn({ date: '2026-08', amount: -2_000 }), txn({ date: '2026-08-10', amount: -100 })],
            50_000,
            AUJOURDHUI,
        );
        expect(res.undatedTotal).toBe(-2_000);
        expect(veilleDe(res.points)).toBe(50_000);
    });

    it('une transaction datée APRÈS aujourd’hui est signalée, et ne bouge pas le passé', () => {
        const res = reconstructCashHistoryDaily(
            [txn({ date: '2026-09-01', amount: -3_000 }), txn({ date: '2026-08-10', amount: -100 })],
            50_000,
            AUJOURDHUI,
        );
        expect(res.flowsAfterNowDate).toBe(-3_000);
        expect(veilleDe(res.points)).toBe(50_000);
    });
});
