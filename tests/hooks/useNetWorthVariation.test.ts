/**
 * [REFONTE-NAV-L2a] `computeNetWorthVariation` — Δ(cash + buckets TOTAL_*) sur une fenêtre
 * glissante, pour la tuile « Variation 30 j » du Futur.
 *
 * Ce qu'on verrouille (itération panel #601) :
 *  - le PÉRIMÈTRE PAR CONSTRUCTION : liquide + placements SEULEMENT — plus aucun terme
 *    immo/dettes dans la série (l'équité annuelle promue dans une fenêtre glissante fabriquait
 *    +14 396 $ fictifs à chaque 31 décembre ; les remboursements de capital s'affichaient en
 *    pertes sèches). Test sentinelle : une fenêtre qui CHEVAUCHE le 31 décembre, à cash et
 *    buckets constants, donne diff = 0 ;
 *  - [MED] les transactions SANS compte (accountName absent ou 'Unknown') sont INCLUSES via
 *    le bucket synthétique UNKNOWN_ACCOUNT_BUCKET (l'ex-exclusion créait 1 000 $ d'écart avec
 *    la tuile voisine qui les compte) ;
 *  - [MED] `spanDays` = étendue RÉELLE des données utilisées (l'UI dit « sur N j de données »
 *    quand c'est < fenêtre demandée, au lieu de laisser croire à 30 j) ;
 *  - le no-fake-data : < 2 points dans la fenêtre → `null` SILENCIEUX (état normal) ; borne
 *    non finie (donnée corrompue) → `null` + logErrorThrottled ; t.amount non fini → loggué
 *    et ignoré (le `|| 0` d'avant ne gardait que la valeur précédente, pas le montant) ;
 *  - la classe #544 : un compte découvert via TRANSACTION (absent d'initialBalances) est
 *    amorcé à 0 — sans amorçage, la borne de départ serait NaN et la variation muette ;
 *  - `pct: null` quand le point de départ est ≤ 0 (l'ex-Accueil affichait un « 0 % » trompeur).
 *
 * Note discriminance : la signature a changé au panel #601 (`git stash` = échec de compilation,
 * preuve vide). La discriminance réelle est portée par les cas qui tuent chacun une
 * implémentation plausible fausse : bucket inconnu exclu → diff 0 au lieu de 1 000 ; log absent
 * sur donnée corrompue → spy à 0 appel ; `spanDays` = fenêtre demandée au lieu du réel.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeNetWorthVariation, UNKNOWN_ACCOUNT_BUCKET } from '../../hooks/useNetWorthVariation';
import { logErrorThrottled } from '../../services/errorLogger';
import type { MarketDataPoint } from '../../services/finance';
import type { Transaction } from '../../types';

// Spy PARTIEL : seul logErrorThrottled est remplacé (le reste du module réel est conservé —
// le hook wrapper importe le store, qui peut consommer d'autres exports du logger).
vi.mock('../../services/errorLogger', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../services/errorLogger')>();
    return { ...actual, logErrorThrottled: vi.fn() };
});
const logSpy = vi.mocked(logErrorThrottled);

const NOW = new Date('2026-08-12T12:00:00');
const iso = (daysAgo: number, from: Date = NOW): string => {
    const d = new Date(from);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().slice(0, 10);
};

const row = (daysAgo: number, buckets: Record<string, number> = {}): MarketDataPoint =>
    ({ date: iso(daysAgo), ...buckets });

const tx = (daysAgo: number, amount: number, accountName: string | undefined, over: Partial<Transaction> = {}): Transaction =>
    ({ id: daysAgo * 1000 + Math.round(Number.isFinite(amount) ? amount : 0), date: iso(daysAgo), payee: 'Test', amount, category: 'Autre', status: 'processed', accountName, ...over } as Transaction);

const compute = (
    rows: MarketDataPoint[],
    transactions: Transaction[] = [],
    initialBalances: Record<string, number> = {},
) => computeNetWorthVariation(rows, transactions, initialBalances, 30, NOW);

beforeEach(() => {
    logSpy.mockClear();
});

describe('computeNetWorthVariation — calcul (liquide + placements)', () => {
    it('2 points dans la fenêtre → diff et pct exacts (cash + buckets TOTAL_*)', () => {
        const res = compute(
            [row(10, { TOTAL_CELI: 100 }), row(1, { TOTAL_CELI: 150 })],
            [], { Compte: 1000 },
        );
        // Totaux : 1000+100 = 1100 → 1000+150 = 1150.
        expect(res).not.toBeNull();
        expect(res!.diff).toBeCloseTo(50, 6);
        expect(res!.pct).toBeCloseTo((50 / 1100) * 100, 6);
    });

    it('les transactions font bouger le cash entre les deux bornes', () => {
        const res = compute(
            [row(10), row(1)],
            [tx(5, 200, 'Compte')],
            { Compte: 1000 },
        );
        expect(res!.diff).toBeCloseTo(200, 6);
    });

    it('doublons et virements sont EXCLUS du cash (mêmes règles que l\'ex-Accueil)', () => {
        const res = compute(
            [row(10), row(1)],
            [tx(5, 500, 'Compte', { isDuplicate: true }), tx(4, 300, 'Compte', { isTransfer: true })],
            { Compte: 1000 },
        );
        expect(res!.diff).toBeCloseTo(0, 6);
    });

    it('un point HORS fenêtre ne sert pas de borne, mais son cash s\'accumule quand même', () => {
        const res = compute(
            [row(40, { TOTAL_CELI: 1000 }), row(10, { TOTAL_CELI: 100 }), row(1, { TOTAL_CELI: 150 })],
            [tx(35, 400, 'Compte')], // AVANT la fenêtre : doit être dans les DEUX bornes.
            { Compte: 1000 },
        );
        // Bornes : (1000+400)+100 = 1500 → (1000+400)+150 = 1550 — jamais le point à 40 j.
        expect(res!.diff).toBeCloseTo(50, 6);
        expect(res!.pct).toBeCloseTo((50 / 1500) * 100, 6);
    });

    it('[MED #601] transactions sans compte (absent ou « Unknown ») INCLUSES via le bucket synthétique', () => {
        const res = compute(
            [row(10), row(1)],
            [tx(5, 600, undefined), tx(4, 400, 'Unknown')],
            { Compte: 1000 },
        );
        // L'ancienne exclusion donnait diff = 0 : 1 000 $ de flux disparaissaient de la tuile
        // alors que la voisine les compte (divergence mesurée).
        expect(res!.diff).toBeCloseTo(1000, 6);
        expect(UNKNOWN_ACCOUNT_BUCKET).toBe('(compte inconnu)');
    });

    it('[HIGH #601] périmètre PAR CONSTRUCTION : fenêtre chevauchant le 31 décembre, cash et buckets constants → diff 0', () => {
        // Ancien comportement : l'équité immo à granularité ANNUELLE changeait de valeur au
        // passage d'année → +14 396 $ fictifs mesurés au jour de l'An. La série n'ayant plus
        // AUCUN terme annuel/constant, aucune fenêtre ne peut fabriquer d'événement calendaire.
        const jan = new Date('2027-01-10T12:00:00');
        const res = computeNetWorthVariation(
            [
                { date: iso(25, jan), TOTAL_CELI: 500 }, // 16 décembre 2026
                { date: iso(2, jan), TOTAL_CELI: 500 },  // 8 janvier 2027
            ],
            [], { Compte: 1000 }, 30, jan,
        );
        expect(res).not.toBeNull();
        expect(res!.diff).toBeCloseTo(0, 6);
    });
});

describe('computeNetWorthVariation — spanDays (étendue réelle des données)', () => {
    it('données plus jeunes que la fenêtre → spanDays = jours entre premières/dernières bornes UTILISÉES', () => {
        const res = compute([row(12), row(5)], [], { Compte: 1000 });
        expect(res!.spanDays).toBe(7);
    });

    it('fenêtre pleine → spanDays = fenêtre demandée (points aux deux extrémités)', () => {
        // NOW à minuit UTC : les dates de `MarketDataPoint` (YYYY-MM-DD) se parsent à minuit
        // UTC — un NOW à midi exclurait le point à J-30 (avant le début de fenêtre).
        const midnight = new Date('2026-08-12T00:00:00Z');
        const res = computeNetWorthVariation(
            [
                { date: iso(30, midnight), TOTAL_CELI: 100 },
                { date: iso(15, midnight), TOTAL_CELI: 120 },
                { date: iso(0, midnight), TOTAL_CELI: 150 },
            ],
            [], { Compte: 1000 }, 30, midnight,
        );
        expect(res!.spanDays).toBe(30);
    });
});

describe('computeNetWorthVariation — no-fake-data et silent-failure (#601)', () => {
    it('aucune ligne de marché → null (jamais 0), SANS log (état normal)', () => {
        expect(compute([])).toBeNull();
        expect(logSpy).not.toHaveBeenCalled();
    });

    it('un seul point dans la fenêtre → null SILENCIEUX (couverture courte = normal, pas corrompu)', () => {
        expect(compute([row(40, { TOTAL_CELI: 100 }), row(1, { TOTAL_CELI: 150 })])).toBeNull();
        expect(logSpy).not.toHaveBeenCalled();
    });

    it('solde initial non fini → null ET logErrorThrottled (ui/warning) — une donnée corrompue ne se tait pas', () => {
        expect(compute([row(10), row(1)], [], { Compte: Number.NaN })).toBeNull();
        expect(logSpy).toHaveBeenCalledTimes(1);
        expect(logSpy.mock.calls[0][1]).toMatchObject({ source: 'ui', severity: 'warning' });
    });

    it('t.amount non fini → loggué et IGNORÉ (le `|| 0` d\'avant laissait NaN empoisonner le solde)', () => {
        const res = compute(
            [row(10), row(1)],
            [tx(5, Number.NaN, 'Compte'), tx(4, 200, 'Compte')],
            { Compte: 1000 },
        );
        // Le montant corrompu est écarté : la variation reste calculée sur le reste, et logguée.
        expect(res).not.toBeNull();
        expect(res!.diff).toBeCloseTo(200, 6);
        expect(logSpy).toHaveBeenCalledTimes(1);
        expect(logSpy.mock.calls[0][1]).toMatchObject({ source: 'ui', severity: 'warning' });
    });

    it('point de départ ≤ 0 → pct null (l\'ex-Accueil affichait un 0 % trompeur), diff conservé', () => {
        const res = compute([row(10), row(1)], [tx(5, 100, 'Compte')], { Compte: -500 });
        expect(res).not.toBeNull();
        expect(res!.diff).toBeCloseTo(100, 6);
        expect(res!.pct).toBeNull();
    });

    it('classe #544 : compte découvert via transaction (hors initialBalances) amorcé à 0 — pas de NaN muet', () => {
        const res = compute(
            [row(25), row(1)],
            [tx(20, 500, 'NouveauCompte')], // 1re borne AVANT la 1re transaction du compte.
            {},
        );
        // Sans amorçage : rc[NouveauCompte] undefined à la 1re borne → NaN → null. Ici : 0 → 500.
        expect(res).not.toBeNull();
        expect(res!.diff).toBeCloseTo(500, 6);
    });
});
