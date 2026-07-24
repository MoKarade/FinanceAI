// [INVEST-PERF-PERIOD] Tests du helper de variations/performances par période (24h/7j/1M/3M/6M/YTD/1A).
// Deux sémantiques : seriesReturnPct (valeur d'une série marketData, lignes ÉPARSES) et
// priceReturnPct (prix natif d'un titre via priceHistory). no-fake-data : pas de baseline → null.
import { describe, it, expect } from 'vitest';
import {
    PERF_PERIODS,
    PERF_PERIOD_LABELS,
    periodStartDate,
    seriesReturnPct,
    priceReturnPct,
    isBenchmarkCandidate,
} from '../../services/history/periodReturn';
import type { MarketDataPoint } from '../../services/finance';

const row = (date: string, vals: Record<string, number>): MarketDataPoint => ({ date, ...vals });

describe('periodStartDate', () => {
    it('calcule les bornes 7D/1M/1Y en UTC depuis la date de référence', () => {
        expect(periodStartDate('2026-07-23', '7D')).toBe('2026-07-16');
        expect(periodStartDate('2026-07-23', '1M')).toBe('2026-06-23');
        expect(periodStartDate('2026-07-23', '3M')).toBe('2026-04-23');
        expect(periodStartDate('2026-07-23', '6M')).toBe('2026-01-23');
        expect(periodStartDate('2026-07-23', '1Y')).toBe('2025-07-23');
    });

    it('YTD = 1er janvier de l\'année de la référence', () => {
        expect(periodStartDate('2026-07-23', 'YTD')).toBe('2026-01-01');
        expect(periodStartDate('2026-01-02', 'YTD')).toBe('2026-01-01');
    });

    it('borne fin-de-mois : 31 mars − 1 mois ne déborde pas (comportement Date UTC documenté)', () => {
        // setUTCMonth(2−1) sur le 31 → 31 février inexistant → normalisé début mars.
        // On fige le comportement (déterministe) : la baseline reste « ≤ start », donc sûre.
        expect(periodStartDate('2026-03-31', '1M')).toBe('2026-03-03');
    });

    it('les 7 périodes ont un libellé', () => {
        expect(PERF_PERIODS).toHaveLength(7);
        for (const p of PERF_PERIODS) expect(PERF_PERIOD_LABELS[p].length).toBeGreaterThan(0);
    });
});

describe('seriesReturnPct', () => {
    const rows: MarketDataPoint[] = [
        row('2026-01-02', { TOTAL: 100_000, 'CW8.PA': 500 }),
        row('2026-06-22', { TOTAL: 110_000, 'CW8.PA': 550 }),
        row('2026-07-21', { TOTAL: 118_800, 'CW8.PA': 594 }),
        row('2026-07-22', { TOTAL: 120_000, 'CW8.PA': 600 }),
    ];

    it('24H = variation entre les 2 dernières lignes portant la clé', () => {
        expect(seriesReturnPct(rows, 'TOTAL', '24H')).toBeCloseTo(((120_000 - 118_800) / 118_800) * 100, 10);
    });

    it('24H saute les lignes éparses qui ne portent pas la clé', () => {
        const sparse = [
            row('2026-07-20', { TOTAL: 100, X: 50 }),
            row('2026-07-21', { TOTAL: 101 }), // X absent ce jour-là
            row('2026-07-22', { TOTAL: 102, X: 55 }),
        ];
        expect(seriesReturnPct(sparse, 'X', '24H')).toBeCloseTo(10, 10);
    });

    it('1M = baseline à la dernière ligne ≤ (dernière date − 1 mois)', () => {
        // start = 2026-06-22 → la ligne du 2026-06-22 est la baseline (≤ start).
        expect(seriesReturnPct(rows, 'TOTAL', '1M')).toBeCloseTo(((120_000 - 110_000) / 110_000) * 100, 10);
    });

    it('YTD = baseline au dernier point de l\'année précédente ou du 1er janvier', () => {
        const withPrevYear = [row('2025-12-31', { TOTAL: 90_000 }), ...rows];
        expect(seriesReturnPct(withPrevYear, 'TOTAL', 'YTD')).toBeCloseTo(((120_000 - 90_000) / 90_000) * 100, 10);
    });

    it('null quand la série est plus récente que la période (no-fake-data)', () => {
        // Série démarrée en janvier 2026 → aucun point ≤ 2025-07-22 pour 1Y.
        expect(seriesReturnPct(rows, 'TOTAL', '1Y')).toBeNull();
    });

    it('null quand la clé est absente ou les lignes vides', () => {
        expect(seriesReturnPct(rows, 'INEXISTANT', '24H')).toBeNull();
        expect(seriesReturnPct([], 'TOTAL', '1M')).toBeNull();
        expect(seriesReturnPct(rows, 'TOTAL', '24H')).not.toBeNull(); // volume du test prouvé
    });

    it('null pour 24H quand la série n\'a qu\'un seul point', () => {
        expect(seriesReturnPct([row('2026-07-22', { TOTAL: 100 })], 'TOTAL', '24H')).toBeNull();
    });

    // [PERF-STALE-TAIL-ZERO] Deux jours consécutifs raccordés au prix courant (candles KO, quote
    // fraîche — cas GBS.PA) → 0 % techniquement exact mais TROMPEUR (donnée figée ≠ marché plat).
    describe('[PERF-STALE-TAIL-ZERO] endpoints synthétiques', () => {
        const gbs = [
            row('2026-07-10', { 'GBS.PA': 48 }),   // close RÉEL, ≤ borne 7D (2026-07-15)
            row('2026-07-21', { 'GBS.PA': 50 }),   // raccordé au prix courant (synthétique)
            row('2026-07-22', { 'GBS.PA': 50 }),   // raccordé au prix courant (synthétique) — même valeur
        ];
        const isSynth = (date: string, key: string) =>
            new Set([
                JSON.stringify(['2026-07-21', 'GBS.PA']),
                JSON.stringify(['2026-07-22', 'GBS.PA']),
            ]).has(JSON.stringify([date, key]));

        it('24H : latest ET baseline synthétiques → null (« — » plutôt qu\'un faux 0 %)', () => {
            // Sans le prédicat : 0 % trompeur (50→50). Avec : null.
            expect(seriesReturnPct(gbs, 'GBS.PA', '24H')).toBe(0); // comportement d'avant (discriminant)
            expect(seriesReturnPct(gbs, 'GBS.PA', '24H', isSynth)).toBeNull();
        });

        it('un SEUL endpoint synthétique → mouvement RÉEL conservé (prix figé vs prix réel)', () => {
            // 7D : latest (22, synthétique 50) vs baseline (18, réel 48) → +4,17 %, PAS null.
            const r = seriesReturnPct(gbs, 'GBS.PA', '7D', isSynth);
            expect(r).toBeCloseTo(((50 - 48) / 48) * 100, 6);
        });

        it('sans prédicat isSynthetic : comportement inchangé (rétrocompat)', () => {
            expect(seriesReturnPct(gbs, 'GBS.PA', '24H')).toBe(0);
        });
    });

    it('ignore les valeurs non finies ou ≤ 0 (jamais un % fabriqué)', () => {
        const dirty = [
            row('2026-07-20', { X: 100 }),
            row('2026-07-21', { X: NaN }),
            row('2026-07-22', { X: 0 }),
            row('2026-07-23', { X: 110 }),
        ];
        // latest = 110 (23) ; 0 et NaN sautés ; baseline 24H = 100 (20).
        expect(seriesReturnPct(dirty, 'X', '24H')).toBeCloseTo(10, 10);
    });
});

describe('priceReturnPct', () => {
    const hist = [
        { date: '2025-07-01', price: 80 },
        { date: '2026-06-20', price: 100 },
        { date: '2026-07-21', price: 105 },
        { date: '2026-07-22', price: 110 },
    ];

    it('24H = avant-dernier close vs dernier close', () => {
        expect(priceReturnPct(hist, '24H')).toBeCloseTo(((110 - 105) / 105) * 100, 10);
    });

    it('1M = dernier close ≤ (dernier close − 1 mois) vs dernier', () => {
        // start = 2026-06-22 → baseline 2026-06-20 (100).
        expect(priceReturnPct(hist, '1M')).toBeCloseTo(10, 10);
    });

    it('1Y disponible quand l\'historique couvre la fenêtre', () => {
        expect(priceReturnPct(hist, '1Y')).toBeCloseTo(((110 - 80) / 80) * 100, 10);
    });

    it('insensible à l\'ordre du tableau (tri interne par date)', () => {
        const shuffled = [hist[2], hist[0], hist[3], hist[1]];
        expect(priceReturnPct(shuffled, '24H')).toBeCloseTo(priceReturnPct(hist, '24H')!, 10);
    });

    it('null sans baseline : titre plus récent que la période, historique vide/undefined, un seul point', () => {
        expect(priceReturnPct([{ date: '2026-07-01', price: 100 }, { date: '2026-07-22', price: 110 }], '1Y')).toBeNull();
        expect(priceReturnPct([], '1M')).toBeNull();
        expect(priceReturnPct(undefined, '1M')).toBeNull();
        expect(priceReturnPct([{ date: '2026-07-22', price: 100 }], '24H')).toBeNull();
    });

    it('dates DUPLIQUÉES : ordre déterministe (tri stable — la dernière entrée insérée gagne)', () => {
        // Finding silent-failure #498 : l'ancien comparateur (jamais 0) rendait `last` dépendant
        // de l'ordre d'arrivée. Avec le comparateur strict + tri stable, à dates égales l'ordre
        // d'insertion est préservé → résultat identique quel que soit le placement du doublon.
        const dup1 = [
            { date: '2026-07-21', price: 100 },
            { date: '2026-07-22', price: 200 },
            { date: '2026-07-22', price: 150 },
        ];
        const dup2 = [
            { date: '2026-07-22', price: 200 },
            { date: '2026-07-21', price: 100 },
            { date: '2026-07-22', price: 150 },
        ];
        // Dans les deux cas, la DERNIÈRE entrée insérée pour le 22 (150) est `last`.
        expect(priceReturnPct(dup1, '24H')).toBeCloseTo(priceReturnPct(dup2, '24H')!, 10);
        expect(priceReturnPct(dup1, '24H')).toBeCloseTo(((150 - 200) / 200) * 100, 10);
    });

    it('filtre les prix non finis ou ≤ 0', () => {
        const dirty = [
            { date: '2026-07-20', price: 100 },
            { date: '2026-07-21', price: Infinity },
            { date: '2026-07-22', price: -5 },
            { date: '2026-07-23', price: 110 },
        ];
        expect(priceReturnPct(dirty, '24H')).toBeCloseTo(10, 10);
    });
});

describe('isBenchmarkCandidate', () => {
    it('matche le CW8 par symbole (tous formats) et le MSCI World par nom', () => {
        expect(isBenchmarkCandidate('CW8.PA', 'Amundi MSCI World')).toBe(true);
        expect(isBenchmarkCandidate('EPA:CW8')).toBe(true);
        expect(isBenchmarkCandidate('LU1681043599', 'MSCI World UCITS')).toBe(true);
    });

    it('NE matche PAS un autre fonds MSCI (finding ÉLEVÉ panel #498 : « Amundi MSCI Em Asia »)', () => {
        // Titre réel du portefeuille : l'ancien `name.includes('MSCI')` le prenait pour le
        // benchmark mondial selon l'ordre des actifs.
        expect(isBenchmarkCandidate('AASI.PA', 'Amundi MSCI Em Asia')).toBe(false);
        expect(isBenchmarkCandidate('PAASI.PA', 'Emerging Asia')).toBe(false);
        expect(isBenchmarkCandidate('NVDA', 'Nvidia')).toBe(false);
        expect(isBenchmarkCandidate('', '')).toBe(false);
    });
});
