// tests/services/reviewSample.test.ts
//
// [TX-REVIEW] + [TX-SUBSCRIPTIONS] — mesure du taux d'erreur (critère d'arrêt de Marc : « moins de
// 1 % mal classé sur 300 tirages ») et alertes d'abonnements fantômes.

import { describe, it, expect } from 'vitest';
import {
    drawReviewSample,
    eligibleForReview,
    computeErrorRate,
    samplesNeededForThreshold,
    RECOMMENDED_SAMPLE_SIZE,
} from '../../services/transactions/reviewSample';
import {
    detectSubscriptionAlerts,
    totalYearlyAtLatest,
    type SubscriptionAlertInput,
} from '../../services/transactions/subscriptionAlerts';
import { buildMerchantProfiles, profileForPayee } from '../../services/transactions/merchantProfile';
import type { Transaction } from '../../types';

const mkTx = (id: number, over: Partial<Transaction> = {}): Transaction => ({
    id,
    date: '2026-05-10',
    payee: `Marchand ${id}`,
    amount: -20,
    category: 'Autre',
    status: 'processed',
    ...over,
});

describe('drawReviewSample — tirage déterministe', () => {
    const pool = Array.from({ length: 500 }, (_, i) => mkTx(i + 1));

    it('rend exactement la taille demandée, sans doublon', () => {
        const s = drawReviewSample(pool, 300, 42);
        expect(s).toHaveLength(300);
        expect(new Set(s.map((t) => t.id)).size).toBe(300);
    });

    it('est REPRODUCTIBLE à graine égale — rouvrir l\'écran ne re-tire pas un autre échantillon', () => {
        expect(drawReviewSample(pool, 50, 7).map((t) => t.id))
            .toEqual(drawReviewSample(pool, 50, 7).map((t) => t.id));
    });

    it('change avec la graine (c\'est bien un tirage, pas les N premiers)', () => {
        const a = drawReviewSample(pool, 50, 1).map((t) => t.id);
        const b = drawReviewSample(pool, 50, 2).map((t) => t.id);
        expect(a).not.toEqual(b);
        // …et ce n'est pas simplement l'ordre d'entrée tronqué.
        expect(a).not.toEqual(pool.slice(0, 50).map((t) => t.id));
    });

    it('est insensible à l\'ORDRE du tableau d\'entrée (tri UI, ré-import)', () => {
        const shuffled = [...pool].reverse();
        expect(drawReviewSample(shuffled, 30, 9).map((t) => t.id))
            .toEqual(drawReviewSample(pool, 30, 9).map((t) => t.id));
    });

    it('rend tout l\'historique quand il est plus petit que la taille demandée', () => {
        expect(drawReviewSample(pool.slice(0, 12), 300, 3)).toHaveLength(12);
    });

    it('exclut les doublons marqués mais GARDE les transferts (un faux virement est une erreur à mesurer)', () => {
        const rows = [
            mkTx(1, { isDuplicate: true }),
            mkTx(2, { isTransfer: true, category: 'Transfert' }),
            mkTx(3),
        ];
        const ids = eligibleForReview(rows).map((t) => t.id);
        expect(ids).toContain(2);
        expect(ids).toContain(3);
        expect(ids).not.toContain(1);
    });
});

describe('computeErrorRate — un taux sans marge serait un faux chiffre sûr de lui', () => {
    it('sans jugement, ne conclut rien', () => {
        const r = computeErrorRate(0, 0);
        expect(r.conclusive).toBe(false);
        expect(r.verdict).toBe('indeterminé');
    });

    it('100 tirages sans erreur ne suffisent PAS à trancher 1 % (la borne haute reste au-dessus)', () => {
        const r = computeErrorRate(100, 0, 1);
        expect(r.ratePct).toBe(0);
        expect(r.highPct).toBeGreaterThan(1);
        expect(r.conclusive).toBe(false);
    });

    it('300 tirages sans erreur NE tranchent PAS 1 % — le chiffre du cadrage était intenable', () => {
        // MESURE : la borne haute de Wilson monte encore à ~1,26 % avec zéro erreur sur 300.
        // C'est ce qui a fait relever la taille recommandée à 390 (dérivée, pas devinée).
        const r300 = computeErrorRate(300, 0, 1);
        expect(r300.highPct).toBeGreaterThan(1);
        expect(r300.conclusive).toBe(false);
    });

    it('la taille RECOMMANDÉE, elle, tranche : sous le seuil de 1 %', () => {
        const r = computeErrorRate(RECOMMENDED_SAMPLE_SIZE, 0, 1);
        expect(r.highPct).toBeLessThan(1);
        expect(r.verdict).toBe('sous-seuil');
        expect(r.conclusive).toBe(true);
    });

    it('un taux franchement élevé est déclaré AU-DESSUS, pas « indéterminé »', () => {
        const r = computeErrorRate(300, 30, 1); // 10 % observé
        expect(r.lowPct).toBeGreaterThan(1);
        expect(r.verdict).toBe('au-dessus');
    });

    it('reste indéterminé quand l\'intervalle chevauche le seuil', () => {
        const r = computeErrorRate(300, 3, 1); // 1 % pile
        expect(r.verdict).toBe('indeterminé');
        expect(r.conclusive).toBe(false);
    });

    it('ne rend jamais un intervalle hors de [0, 100]', () => {
        for (const [n, k] of [[10, 0], [10, 10], [1, 1], [1, 0]] as const) {
            const r = computeErrorRate(n, k);
            expect(r.lowPct).toBeGreaterThanOrEqual(0);
            expect(r.highPct).toBeLessThanOrEqual(100);
        }
    });

    it('borne les entrées incohérentes (plus d\'erreurs que de jugements)', () => {
        expect(computeErrorRate(10, 99).errors).toBe(10);
        expect(computeErrorRate(-5, -5).reviewed).toBe(0);
    });

    it('annonce l\'effort requis pour trancher 1 % — cohérent avec la taille recommandée', () => {
        const needed = samplesNeededForThreshold(1);
        expect(needed).not.toBeNull();
        // La constante EST le résultat du calcul (source unique) — pas un nombre re-tapé à côté.
        expect(needed).toBe(RECOMMENDED_SAMPLE_SIZE);
        expect(needed!).toBeGreaterThan(300); // 300 ne suffit pas, mesuré ci-dessus
    });
});

describe('detectSubscriptionAlerts — abonnements fantômes', () => {
    /** 6 mois d'un abonnement mensuel se terminant à `lastMonth`. */
    const monthlySub = (payee: string, amounts: number[], startMonth = 1) =>
        amounts.map((a, i) => ({
            payee,
            amount: -a,
            date: `2026-${String(startMonth + i).padStart(2, '0')}-05`,
        }));

    const inputFor = (payee: string, amounts: number[], startMonth = 1): SubscriptionAlertInput => {
        const obs = monthlySub(payee, amounts, startMonth);
        const profile = profileForPayee(buildMerchantProfiles(obs), payee)!;
        return { profile, amounts };
    };

    it('signale une hausse de prix silencieuse', () => {
        const input = inputFor('NETFLIX', [18.99, 18.99, 18.99, 24.99]);
        const alerts = detectSubscriptionAlerts([input], '2026-04-20');
        const rise = alerts.find((a) => a.kind === 'price_rise');
        expect(rise).toBeDefined();
        expect(rise!.baselineAmount).toBeCloseTo(18.99, 2);
        expect(rise!.latestAmount).toBeCloseTo(24.99, 2);
        expect(rise!.risePct).toBeGreaterThan(0.15);
    });

    it('ne crie PAS sur une variation minime (arrondi, taxe)', () => {
        const input = inputFor('SPOTIFY', [10.99, 10.99, 10.99, 11.49]);
        expect(detectSubscriptionAlerts([input], '2026-04-20')
            .some((a) => a.kind === 'price_rise')).toBe(false);
    });

    it('compare au prix D\'AVANT, pas à la médiane globale (qui amortirait la hausse)', () => {
        // Médiane globale = 20 ; médiane des précédents = 18,99 → la hausse doit rester visible.
        const input = inputFor('NETFLIX', [18.99, 18.99, 18.99, 25.99]);
        const rise = detectSubscriptionAlerts([input], '2026-04-20').find((a) => a.kind === 'price_rise');
        expect(rise!.baselineAmount).toBeCloseTo(18.99, 2);
    });

    it('signale un abonnement qui a CESSÉ d\'être débité (2 cadences manquées)', () => {
        const input = inputFor('CRUNCHYROLL', [9.99, 9.99, 9.99]);  // dernier = 2026-03-05
        const alerts = detectSubscriptionAlerts([input], '2026-06-01');
        const stopped = alerts.find((a) => a.kind === 'stopped');
        expect(stopped).toBeDefined();
        expect(stopped!.daysSinceLast).toBeGreaterThan(60);
    });

    it('ne signale PAS un simple retard d\'un cycle', () => {
        const input = inputFor('CRUNCHYROLL', [9.99, 9.99, 9.99]);  // dernier = 2026-03-05
        expect(detectSubscriptionAlerts([input], '2026-04-15')
            .some((a) => a.kind === 'stopped')).toBe(false);
    });

    it('ignore un marchand NON récurrent (sans cadence, « arrêté » n\'a pas de sens)', () => {
        const obs = [
            { payee: 'STEAM', amount: -59.99, date: '2026-01-05' },
            { payee: 'STEAM', amount: -12.00, date: '2026-01-09' },
        ];
        const profile = profileForPayee(buildMerchantProfiles(obs), 'STEAM')!;
        expect(detectSubscriptionAlerts([{ profile, amounts: [59.99, 12] }], '2026-09-01')).toEqual([]);
    });

    it('classe les alertes du plus coûteux au moins coûteux', () => {
        const cher = inputFor('NETFLIX', [10, 10, 10, 30]);
        const petit = inputFor('CAPCUT', [2, 2, 2, 5]);
        const alerts = detectSubscriptionAlerts([petit, cher], '2026-04-20');
        expect(alerts[0].yearlyCostAtLatest).toBeGreaterThanOrEqual(alerts[1].yearlyCostAtLatest);
    });

    it('le coût annuel total EXCLUT les abonnements signalés arrêtés (ne pas annoncer une dépense éteinte)', () => {
        const actif = inputFor('NETFLIX', [20, 20, 20, 20]);            // dernier 2026-04-05
        const arrete = inputFor('CRUNCHYROLL', [10, 10, 10]);           // dernier 2026-03-05
        const today = '2026-06-01';
        const alerts = detectSubscriptionAlerts([actif, arrete], today);
        expect(alerts.some((a) => a.kind === 'stopped' && a.label === 'CRUNCHYROLL')).toBe(true);
        // 20 $/mois × 12 = 240 ; le 10 $/mois arrêté n'est PAS ajouté.
        expect(totalYearlyAtLatest([actif, arrete], alerts)).toBe(240);
    });
});
