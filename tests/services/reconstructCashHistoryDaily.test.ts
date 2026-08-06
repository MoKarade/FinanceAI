/**
 * [FUTUR-DAILY] Solde de cash passé JOUR PAR JOUR.
 *
 * Le test qui compte n'est pas « ça rend des points » — c'est la RÉCONCILIATION avec la version
 * mensuelle. Deux granularités de la même courbe qui divergeraient donneraient deux soldes
 * différents pour la même date selon le niveau de zoom, ce qui est pire que de ne pas avoir le
 * quotidien du tout.
 */
import { describe, it, expect } from 'vitest';
import {
    reconstructCashHistory,
    reconstructCashHistoryDaily,
} from '../../services/history/reconstructCashHistory';

const tx = (date: string, amount: number, extra: { isDuplicate?: boolean; isTransfer?: boolean } = {}) =>
    ({ date, amount, ...extra });

describe('[FUTUR-DAILY] reconstructCashHistoryDaily', () => {
    it('remonte le solde JOUR par JOUR depuis le cash actuel', () => {
        // Cash aujourd'hui (2026-01-10) = 1 000. Le 2026-01-09 il est entré 200 → la veille : 800.
        const res = reconstructCashHistoryDaily(
            [tx('2026-01-08', -50), tx('2026-01-09', 200)],
            1_000,
            '2026-01-10',
        );
        const at = (d: string) => res.points.find((p) => p.date === d)?.cash;
        expect(res.firstDate).toBe('2026-01-08');
        expect(at('2026-01-09')).toBe(1_000);   // rien n'a bougé le 10
        expect(at('2026-01-08')).toBe(800);     // −200 du 9
    });

    it('INVARIANT — le dernier jour d’un mois vaut le point MENSUEL de ce mois', () => {
        // Sans cet invariant, zoomer changerait le solde affiché pour la même date.
        const transactions = [
            tx('2025-11-03', -1_600), tx('2025-11-15', 2_400), tx('2025-11-28', -320),
            tx('2025-12-01', -1_600), tx('2025-12-15', 2_400), tx('2025-12-24', -890),
            tx('2026-01-02', -1_600), tx('2026-01-15', 2_400),
        ];
        const mensuel = reconstructCashHistory(transactions, 5_000, '2026-02');
        const quotidien = reconstructCashHistoryDaily(transactions, 5_000, '2026-02-01');

        // `reconstructCashHistory` rend le solde à la FIN du mois ; côté quotidien c'est le point
        // du dernier jour de ce même mois.
        const dernierJourDe: Record<string, string> = {
            '2025-11': '2025-11-30', '2025-12': '2025-12-31', '2026-01': '2026-01-31',
        };
        expect(mensuel.points.length).toBeGreaterThan(0);
        for (const p of mensuel.points) {
            const jour = dernierJourDe[p.month];
            if (!jour) continue;
            const q = quotidien.points.find((x) => x.date === jour);
            expect(q?.cash, `fin de ${p.month}`).toBe(p.cash);
        }
    });

    it('EXCLUT doublons et virements — la MÊME base que computeStartingCash', () => {
        // Si les deux bouts de la courbe ne partagent pas leur base de flux, ils divergent
        // (classe PH4D « calculs voisins, même base »). C'est la contrainte la plus forte du module.
        const avec = reconstructCashHistoryDaily(
            [tx('2026-01-05', 500, { isTransfer: true }), tx('2026-01-06', -100)],
            1_000, '2026-01-08',
        );
        const sans = reconstructCashHistoryDaily([tx('2026-01-06', -100)], 1_000, '2026-01-08');
        const at = (r: typeof avec, d: string) => r.points.find((p) => p.date === d)?.cash;

        // ⚠️ Les deux séries ne DÉMARRENT pas au même jour, et c'est voulu : un virement compte comme
        // repère de DATE (il étend la fenêtre connue) sans compter comme FLUX. Mon premier jet
        // comparait le 05, absent de `sans` — il opposait deux fenêtres, pas deux soldes.
        // L'assertion juste porte sur les jours COMMUNS : le virement ne doit rien y changer.
        for (const d of ['2026-01-06', '2026-01-07']) {
            expect(at(avec, d), d).toBe(at(sans, d));
        }
        // Ce que le virement fait : ÉTENDRE la fenêtre d'un jour. Ce qu'il ne fait pas : bouger un solde.
        expect(sans.points.some((p) => p.date === '2026-01-05')).toBe(false);
        expect(at(avec, '2026-01-05')).toBe(1_100); // = 1 000 du 06, + les 100 $ dépensés le 06
    });

    it('un virement compte quand même comme REPÈRE DE DATE, comme dans la version mensuelle', () => {
        const res = reconstructCashHistoryDaily(
            [tx('2026-01-02', 900, { isDuplicate: true }), tx('2026-01-06', -100)],
            1_000, '2026-01-08',
        );
        expect(res.firstDate).toBe('2026-01-02');
    });

    it('marque les jours où quelque chose a VRAIMENT bougé', () => {
        // Un plateau dans une série quotidienne n'est pas une donnée manquante : c'est
        // l'information « rien n'a bougé ». L'écran doit pouvoir les distinguer.
        const res = reconstructCashHistoryDaily(
            [tx('2026-01-03', -40), tx('2026-01-06', -100)],
            1_000, '2026-01-08',
        );
        expect(res.points.filter((p) => p.isDated).map((p) => p.date)).toEqual(['2026-01-03', '2026-01-06']);
    });

    it('IGNORE une transaction datée au MOIS seul plutôt que de l’inventer un jour', () => {
        // La placer arbitrairement (le 1er ?) fabriquerait un mouvement à une date fausse.
        // Absente de la série quotidienne est le comportement honnête.
        const res = reconstructCashHistoryDaily([tx('2026-01', -500), tx('2026-01-06', -100)], 1_000, '2026-01-08');
        expect(res.firstDate).toBe('2026-01-06');
        expect(res.points.every((p) => Number.isFinite(p.cash))).toBe(true);
    });

    it('traverse un changement de mois ET d’année sans décalage', () => {
        const res = reconstructCashHistoryDaily(
            [tx('2025-12-30', -100), tx('2026-01-01', -200)],
            1_000, '2026-01-03',
        );
        expect(res.points.map((p) => p.date)).toEqual([
            '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02',
        ]);
        expect(res.points.find((p) => p.date === '2025-12-31')?.cash).toBe(1_200);
    });

    it('aucune transaction → série vide, pas une ligne à zéro', () => {
        expect(reconstructCashHistoryDaily([], 1_000, '2026-01-08')).toEqual({ points: [], firstDate: null });
    });

    it('un montant non fini est ignoré sans corrompre le reste de la série', () => {
        const res = reconstructCashHistoryDaily(
            [tx('2026-01-05', Number.NaN), tx('2026-01-06', -100)],
            1_000, '2026-01-08',
        );
        expect(res.points.every((p) => Number.isFinite(p.cash))).toBe(true);
    });
});
