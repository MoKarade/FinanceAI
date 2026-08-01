// tests/services/downsamplePriceHistory.test.ts
//
// [HIST-STORE-SIZE] Le priceHistory PERSISTÉ passe à 1 point/semaine au-delà de 365 j (÷5 le
// stock ancien, mesuré ~116 Ko → borne la croissance du push Drive/localStorage), SANS toucher
// la dernière année (courbes 1M→1A quotidiennes intactes) et SANS perdre les points anciens
// non re-téléchargeables (fenêtre CoinGecko) : réduits, jamais supprimés.

import { describe, it, expect } from 'vitest';
import { downsamplePriceHistory, mergePriceHistories, DOWNSAMPLE_AFTER_DAYS } from '../../services/history/hydrateAssetHistories';

const DAY_MS = 86_400_000;
const NOW = Date.parse('2026-08-01T00:00:00Z');
const iso = (t: number): string => new Date(t).toISOString().slice(0, 10);

/** n jours avant NOW, en ISO. */
const daysAgo = (n: number): string => iso(NOW - n * DAY_MS);

const daily = (fromDaysAgo: number, toDaysAgo: number): Array<{ date: string; price: number }> => {
    const out: Array<{ date: string; price: number }> = [];
    for (let d = fromDaysAgo; d >= toDaysAgo; d--) out.push({ date: daysAgo(d), price: 100 + d });
    return out;
};

describe('[HIST-STORE-SIZE] downsamplePriceHistory', () => {
    it('la dernière année reste QUOTIDIENNE (courbes 1M/3M/6M/1A intactes)', () => {
        const h = daily(300, 0); // 301 points, tous < 365 j
        expect(downsamplePriceHistory(h, NOW)).toHaveLength(301);
    });

    it('au-delà de 365 j : 1 point/semaine (~÷7 du stock ancien), le récent intact', () => {
        const h = daily(730, 0); // 2 ans quotidiens
        const out = downsamplePriceHistory(h, NOW);
        const old = out.filter((p) => Date.parse(`${p.date}T00:00:00Z`) < NOW - DOWNSAMPLE_AFTER_DAYS * DAY_MS);
        const recent = out.filter((p) => Date.parse(`${p.date}T00:00:00Z`) >= NOW - DOWNSAMPLE_AFTER_DAYS * DAY_MS);
        expect(recent).toHaveLength(366); // ~1 an quotidien conservé
        expect(old.length).toBeGreaterThanOrEqual(51); // ~52 semaines
        expect(old.length).toBeLessThanOrEqual(54);
        // Ordre chronologique conservé (contrat des consommateurs de courbes).
        const dates = out.map((p) => p.date);
        expect([...dates].sort()).toEqual(dates);
    });

    it('IDEMPOTENT : re-downsampler ne perd plus rien (le point hebdo survit à chaque sync)', () => {
        const once = downsamplePriceHistory(daily(730, 0), NOW);
        const twice = downsamplePriceHistory(once, NOW);
        expect(twice).toEqual(once);
    });

    it('composition avec mergePriceHistories : les points crypto > 365 j survivent (hebdo), jamais supprimés', () => {
        // Le scénario CoinGecko : le provider ne rend QUE les 365 derniers jours ; les points
        // plus vieux ne peuvent PAS être re-téléchargés. merge les garde, downsample les réduit.
        const stored = daily(500, 400); // vieux points hors fenêtre provider
        const fresh = daily(365, 0);
        const out = downsamplePriceHistory(mergePriceHistories(stored, fresh), NOW);
        const oldest = out.filter((p) => p.date <= daysAgo(400));
        expect(oldest.length).toBeGreaterThanOrEqual(14); // ~101 jours → ~14 semaines, PAS 0
        expect(oldest.length).toBeLessThanOrEqual(16);
    });

    it('point corrompu (date illisible, prix NaN/≤ 0) : retiré ET tracé (jamais un drop muet)', async () => {
        // [Panel #553] un prix NaN/négatif qui deviendrait le point « retenu » d'une semaine
        // persisterait une valeur corrompue indéfiniment ; et un drop sans log est indiagnosticable.
        const { getErrors } = await import('../../services/errorLogger');
        const h = [
            { date: 'n/a', price: 5 },
            { date: daysAgo(400), price: NaN },
            { date: daysAgo(399), price: -3 },
            { date: daysAgo(2), price: 10 },
        ];
        expect(downsamplePriceHistory(h, NOW)).toEqual([{ date: daysAgo(2), price: 10 }]);
        const logged = getErrors().filter((e) => e.message.includes('downsamplePriceHistory'));
        expect(logged.length).toBeGreaterThanOrEqual(1); // tracé, pas avalé
    });
});
