import { describe, it, expect } from 'vitest';
import {
    computePortfolioSessionMetrics,
    libelleSeance,
    MAX_STALE_DAYS,
} from '../../services/history/portfolioSessionMetrics';
import type { Asset } from '../../types';

/**
 * [HUB-PLACEMENTS-SEANCE] — demande Marc 2026-08-19 (carte FinanceAI du hub).
 *
 * L'essentiel de ce fichier porte sur les REFUS. Le calcul lui-même est déjà couvert
 * (`buildMarketData.test.ts`, `periodReturn.test.ts`) et n'est pas réimplémenté ici. Ce qui est
 * NEUF, et ce qui peut faire mentir la carte, c'est de savoir QUAND ne rien publier :
 *
 *   1. série absente ou trop courte ;
 *   2. séance de référence PÉRIMÉE (l'historique daté n'avance que quand l'app navigateur s'ouvre —
 *      le cron serveur ne rafraîchit que `currentPrice`) ;
 *   3. bornes SYNTHÉTIQUES (prix figé raccordé faute de chandelles ≠ marché plat).
 *
 * Plus un quatrième, invisible et sournois : la DÉCIMATION de `buildMarketData` (500 points par
 * défaut, pour Recharts) ferait de « 7 jours » un « 7 + step jours » en silence.
 */

const FX = { USD: 1.35, EUR: 1.45 };

/** Horloge FIXE : sans elle, « périmé » dépendrait du jour où la CI tourne. */
const MAINTENANT = Date.parse('2026-08-19T18:00:00Z');
const jour = (iso: string): string => iso;

/** Un titre CAD à 1 unité : la valeur du portefeuille vaut alors EXACTEMENT le prix — les montants
 *  attendus se lisent à l'œil, et un écart n'est jamais un doute d'arrondi. */
const titre = (history: Array<{ date: string; price: number }>, over: Partial<Asset> = {}): Asset => ({
    symbol: 'XEQT.TO', quantity: 1, currency: 'CAD', currentPrice: history[history.length - 1]?.price ?? 100,
    name: 'XEQT', performance: 0, dateBought: history[0]?.date ?? '2026-01-01',
    purchases: [{ date: history[0]?.date ?? '2026-01-01', quantity: 1, price: history[0]?.price ?? 100 }],
    priceHistory: history,
    accountType: 'NON-ENREG',
    ...over,
} as Asset);

/** Série quotidienne SANS trou du 2026-08-05 au 2026-08-18 (14 points), prix linéaire 100 → 113. */
const SERIE_QUOTIDIENNE = Array.from({ length: 14 }, (_, i) => ({
    date: `2026-08-${String(5 + i).padStart(2, '0')}`,
    price: 100 + i,
}));

describe('[HUB-PLACEMENTS-SEANCE] ce qui est publiable', () => {
    it('séance et semaine : montant $ et % viennent des MÊMES deux bornes', () => {
        const m = computePortfolioSessionMetrics([titre(SERIE_QUOTIDIENNE)], FX, { nowMs: MAINTENANT });
        expect(m).not.toBeNull();

        expect(m!.dateSeance).toBe('2026-08-18');
        expect(m!.valeurCad).toBe(113);

        // Séance : 113 vs 112 (la veille) → +1 $, +0,89 %.
        expect(m!.seance).not.toBeNull();
        expect(m!.seance!.montantCad).toBe(1);
        expect(m!.seance!.depuis).toBe('2026-08-17');
        expect(m!.seance!.pct).toBeCloseTo((1 / 112) * 100, 2);

        // Semaine : borne = dernier point ≤ 2026-08-11 → le 11 lui-même (106) → +7 $.
        expect(m!.semaine).not.toBeNull();
        expect(m!.semaine!.depuis).toBe('2026-08-11');
        expect(m!.semaine!.montantCad).toBe(7);
        expect(m!.semaine!.pct).toBeCloseTo((7 / 106) * 100, 2);

        // Cohérence de SIGNE entre les deux registres : un montant positif ne peut pas coexister
        // avec un pourcentage négatif — ce serait la signature de deux bornes différentes.
        for (const v of [m!.seance!, m!.semaine!]) {
            expect(Math.sign(v.montantCad)).toBe(Math.sign(v.pct));
        }
    });

    it('une baisse est rendue NÉGATIVE des deux côtés (pas de valeur absolue)', () => {
        const baisse = SERIE_QUOTIDIENNE.map((p, i) => ({ ...p, price: 120 - i }));
        const m = computePortfolioSessionMetrics([titre(baisse)], FX, { nowMs: MAINTENANT });
        expect(m!.seance!.montantCad).toBeLessThan(0);
        expect(m!.seance!.pct).toBeLessThan(0);
        expect(m!.semaine!.montantCad).toBeLessThan(0);
    });

    it('le libellé porte la DATE, jamais « aujourd’hui »', () => {
        expect(libelleSeance('2026-08-18')).toBe('séance du 18 août');
        expect(libelleSeance('2026-01-02')).toBe('séance du 2 janvier');
        // Une date illisible ne fabrique pas un libellé faux.
        expect(libelleSeance('pas-une-date')).toBe('dernière séance');
    });
});

describe('[HUB-PLACEMENTS-SEANCE] les REFUS — c’est là que se joue le no-fake-data', () => {
    it('REFUS 1 — aucun actif, ou un seul point daté : null, jamais 0', () => {
        expect(computePortfolioSessionMetrics([], FX, { nowMs: MAINTENANT })).toBeNull();
        expect(computePortfolioSessionMetrics(undefined, FX, { nowMs: MAINTENANT })).toBeNull();

        // Un seul point : il y a une VALEUR, il n'y a pas de variation. Publier « 0 % » dirait
        // « journée stable » alors qu'on n'a simplement rien à comparer.
        const unSeulPoint = computePortfolioSessionMetrics(
            [titre([{ date: jour('2026-08-18'), price: 100 }])], FX, { nowMs: MAINTENANT },
        );
        expect(unSeulPoint).toBeNull();
    });

    it('REFUS 2 — séance de référence PÉRIMÉE : rien n’est publié', () => {
        // ⚠️ Le cas réel : Marc n'a pas ouvert l'app depuis plusieurs jours. `priceHistory` n'avance
        // QUE depuis le navigateur ; le cron serveur ne touche que `currentPrice`. Un « rendement du
        // jour » calculé sur la clôture d'il y a une semaine serait exactement le mensonge à éviter.
        const vieille = Array.from({ length: 5 }, (_, i) => ({
            date: `2026-08-${String(4 + i).padStart(2, '0')}`, price: 100 + i,
        })); // dernier point : 2026-08-08, soit 11 jours avant le 19
        expect(computePortfolioSessionMetrics([titre(vieille)], FX, { nowMs: MAINTENANT })).toBeNull();

        // La FRONTIÈRE, des deux côtés — sans ça, le seuil pourrait être décalé d'un jour sans
        // qu'aucun test ne bronche. `MAX_STALE_DAYS` = 3 jours civils.
        const serieFinissantLe = (fin: string) => {
            const t = Date.parse(`${fin}T00:00:00Z`);
            return Array.from({ length: 10 }, (_, i) => ({
                date: new Date(t - (9 - i) * 86_400_000).toISOString().slice(0, 10),
                price: 100 + i,
            }));
        };
        // 2026-08-16 → 3 jours civils avant le 19 : ACCEPTÉ (pile au seuil).
        expect(computePortfolioSessionMetrics([titre(serieFinissantLe('2026-08-16'))], FX, { nowMs: MAINTENANT }))
            .not.toBeNull();
        // 2026-08-15 → 4 jours : REFUSÉ.
        expect(computePortfolioSessionMetrics([titre(serieFinissantLe('2026-08-15'))], FX, { nowMs: MAINTENANT }))
            .toBeNull();
        expect(MAX_STALE_DAYS).toBe(3);
    });

    it('REFUS 3 — bornes SYNTHÉTIQUES : un prix figé n’est pas un marché plat', () => {
        // Chandelles de FIGE arrêtées le 2026-08-10, mais quote live fraîche (`priceUpdatedAt`
        // récent) : `buildMarketData` raccorde ses derniers jours au `currentPrice` et TRACE le
        // raccord dans `syntheticTailKeys`. Deux bornes ainsi figées donneraient un 0,00 %
        // techniquement exact et trompeur.
        //
        // ⚠️ Monter ce cas demande un second titre : l'axe des dates est l'UNION des historiques,
        // donc sans lui la série s'arrêterait au 10 août et le refus n°2 (périmé) frapperait AVANT
        // celui-ci — on ne testerait pas ce qu'on croit. `AXE` fournit les dates jusqu'au 18 mais
        // n'est acheté qu'en SEPTEMBRE : `holdingsAt` vaut 0 sur toute la fenêtre, il ne porte donc
        // AUCUNE colonne et ne rend aucune date « réelle ».
        const FIGE = titre(
            [{ date: '2026-08-03', price: 100 }, { date: '2026-08-10', price: 105 }],
            { symbol: 'FIGE', currentPrice: 105, priceUpdatedAt: MAINTENANT },
        );
        const AXE = titre(SERIE_QUOTIDIENNE, {
            symbol: 'AXE',
            quantity: 0,
            purchases: [{ date: '2026-09-15', quantity: 1, price: 100 }],
            dateBought: '2026-09-15',
        });

        const m = computePortfolioSessionMetrics([FIGE, AXE], FX, { nowMs: MAINTENANT });

        // Non-vacuité en trois temps : la série va bien jusqu'au 18 (donc le refus « périmé » n'a
        // pas frappé), le total est non nul (FIGE compte vraiment), et AXE ne porte pas de colonne.
        expect(m).not.toBeNull();
        expect(m!.dateSeance).toBe('2026-08-18');
        expect(m!.valeurCad).toBe(105);

        // Le vrai discriminant : sans la règle d'agrégat, la variation vaudrait 0 $ / 0,00 % et
        // serait publiée comme « journée stable ».
        expect(m!.seance, 'deux bornes entièrement figées : rien ne doit être publié').toBeNull();
    });

    it('REFUS 3 ne mord PAS quand un seul titre est figé (le mouvement reste réel)', () => {
        // Symétrique du cas précédent, et il compte autant : une garde qui refuse trop est aussi
        // fausse qu'une garde qui ne refuse pas assez. Ici REEL bouge vraiment ; le fait que FIGE
        // soit raccordé à son prix courant n'enlève rien à ce mouvement.
        const FIGE = titre(
            [{ date: '2026-08-03', price: 100 }, { date: '2026-08-10', price: 105 }],
            { symbol: 'FIGE', currentPrice: 105, priceUpdatedAt: MAINTENANT },
        );
        const REEL = titre(SERIE_QUOTIDIENNE, { symbol: 'REEL' });

        const m = computePortfolioSessionMetrics([FIGE, REEL], FX, { nowMs: MAINTENANT });
        expect(m).not.toBeNull();
        expect(m!.seance).not.toBeNull();
        expect(m!.seance!.montantCad).toBe(1);   // REEL : 113 − 112 ; FIGE est plat des deux côtés
    });

    it('un refus est INDÉPENDANT : la semaine peut tomber sans emporter la séance', () => {
        // Série de 3 jours consécutifs : la séance est calculable, la fenêtre 7 jours n'a pas de
        // baseline. Publier une « variation 7 jours » ici reviendrait à appeler « semaine » un
        // intervalle de deux jours.
        const courte = [
            { date: '2026-08-17', price: 100 },
            { date: '2026-08-18', price: 104 },
        ];
        const m = computePortfolioSessionMetrics([titre(courte)], FX, { nowMs: MAINTENANT });
        expect(m).not.toBeNull();
        expect(m!.seance).not.toBeNull();
        expect(m!.seance!.montantCad).toBe(4);
        expect(m!.semaine).toBeNull();
    });
});

describe('[HUB-PLACEMENTS-SEANCE] le piège de couplage : la décimation', () => {
    it('« 7 jours » vaut 7 jours même sur une série longue (série ENTIÈRE demandée)', () => {
        // `buildMarketData` décime à 500 points par défaut. La décimation préserve délibérément les
        // DEUX derniers points — donc « séance » survivrait — mais pas la densité au-delà : la
        // baseline « 7 jours » serait choisie parmi des points espacés de `step` jours, et la
        // métrique vaudrait 7 + step jours EN SILENCE.
        //
        // ⚠️ LA LONGUEUR N'EST PAS ARBITRAIRE, et mon premier choix (900) ne prouvait RIEN.
        // `downsample` garde les indices 0, s, 2s… plus les deux derniers. L'indice de la borne
        // 7 jours est `N−8` : il survit à la décimation quand `(N−8) % s === 0`, et avec N = 900
        // (s = 2) c'était le cas — le test passait AUSSI avec la décimation active. Vérifié par
        // perturbation, pas déduit.
        // N = 1500 ⇒ s = 3 et 1492 % 3 = 1 : la borne exacte DISPARAÎT si l'on décime, et la
        // baseline recule au 10 août. C'est ce décalage d'un jour, invisible à l'œil, qui ferait
        // valoir « 8 jours » à une métrique intitulée « 7 jours ».
        const NB_JOURS = 1500;
        const t0 = Date.parse('2026-08-18T00:00:00Z');
        const longue = Array.from({ length: NB_JOURS }, (_, i) => ({
            date: new Date(t0 - (NB_JOURS - 1 - i) * 86_400_000).toISOString().slice(0, 10),
            price: 100 + i * 0.01,
        }));
        const m = computePortfolioSessionMetrics([titre(longue)], FX, { nowMs: MAINTENANT });

        expect(m).not.toBeNull();
        expect(m!.dateSeance).toBe('2026-08-18');
        expect(m!.semaine).not.toBeNull();
        // Non-vacuité de la construction elle-même : la décimation MORD (1500 > 500) et l'indice de
        // la borne n'est pas un multiple du pas — sans quoi le cas redeviendrait silencieusement
        // satisfait par la parité, comme la première version.
        const pas = Math.ceil(NB_JOURS / 500);
        expect(NB_JOURS).toBeGreaterThan(500);
        expect((NB_JOURS - 8) % pas, 'la borne survivrait à la décimation : le cas ne prouve rien')
            .not.toBe(0);
        expect(m!.semaine!.depuis, 'la borne 7 j n’est pas à 7 jours : la série a été décimée')
            .toBe('2026-08-11');
    });
});
