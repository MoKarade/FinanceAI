// tests/services/transactions/subscriptionAlerts.test.ts
//
// [TEST-GAP-SUBSCRIPTIONS] `subscriptionAlerts.ts` affiche des montants $ à l'utilisateur
// (hausse de prix, abo arrêté, coût annuel) et n'avait aucun test dédié. On verrouille les
// décisions de conception documentées dans le module :
//   - hausse comparée à la médiane des PRÉCÉDENTS (la médiane globale amortit la hausse) ;
//   - « arrêté » seulement après 2 cadences manquées (1 = retard banal) ;
//   - coût annuel total EXCLUANT les abos signalés arrêtés (no-fake-data).

import { describe, it, expect } from 'vitest';
import {
    detectSubscriptionAlerts,
    totalYearlyAtLatest,
    type SubscriptionAlertInput,
} from '../../../services/transactions/subscriptionAlerts';
import type { MerchantProfile } from '../../../services/transactions/merchantProfile';

const profile = (o: Partial<MerchantProfile>): MerchantProfile => ({
    key: 'netflix', label: 'Netflix', count: 6,
    firstDate: '2026-01-05', lastDate: '2026-07-05',
    medianIntervalDays: 30, typicalAmount: 20, amountStable: true,
    cadence: 'monthly', isRecurring: true,
    ...o,
});

const TODAY = '2026-07-31';

describe('[TEST-GAP-SUBSCRIPTIONS] detectSubscriptionAlerts', () => {
    it('hausse > 15 % vs médiane des PRÉCÉDENTS ⇒ price_rise (risePct + coût annuel au nouveau tarif)', () => {
        const inputs: SubscriptionAlertInput[] = [
            { profile: profile({}), amounts: [20, 20, 20, 26] }, // baseline 20, +30 %
        ];
        const alerts = detectSubscriptionAlerts(inputs, TODAY);
        const rise = alerts.find((a) => a.kind === 'price_rise');
        expect(rise).toBeDefined();
        expect(rise?.baselineAmount).toBe(20);
        expect(rise?.latestAmount).toBe(26);
        expect(rise?.risePct).toBeCloseTo(0.3, 6);
        expect(rise?.yearlyCostAtLatest).toBe(312); // 26 × 12
    });

    it('la baseline EXCLUT la dernière occurrence : une médiane globale amortirait la hausse détectée', () => {
        // 2 anciens prix + le nouveau : médiane GLOBALE de [10, 10, 14] = 10 aussi, mais avec
        // [10, 14, 14] la globale = 14 (hausse invisible) alors que la médiane des précédents
        // [10, 14] = 12 → +16,7 % détecté. C'est le cas discriminant de la leçon TX-SUBSCRIPTIONS.
        const inputs: SubscriptionAlertInput[] = [
            { profile: profile({}), amounts: [10, 14, 14] },
        ];
        const alerts = detectSubscriptionAlerts(inputs, TODAY);
        const rise = alerts.find((a) => a.kind === 'price_rise');
        expect(rise).toBeDefined();
        expect(rise?.baselineAmount).toBe(12); // médiane de [10, 14], PAS de [10, 14, 14]
    });

    it('hausse ≤ 15 % (bruit taxe/arrondi) ⇒ pas d\'alerte', () => {
        const inputs: SubscriptionAlertInput[] = [
            { profile: profile({}), amounts: [20, 20, 20, 22] }, // +10 %
        ];
        expect(detectSubscriptionAlerts(inputs, TODAY).filter((a) => a.kind === 'price_rise')).toHaveLength(0);
    });

    it('2 cadences manquées ⇒ stopped ; 1 seule ⇒ silence (retard banal)', () => {
        const stale = { profile: profile({ key: 'gym', label: 'Gym', lastDate: '2026-05-15' }), amounts: [45, 45, 45] };
        // 2026-05-15 → 2026-07-31 = 77 jours > 2 × 30 ⇒ stopped.
        const late = { profile: profile({ key: 'spotify', label: 'Spotify', lastDate: '2026-06-20' }), amounts: [12, 12, 12] };
        // 41 jours ≤ 60 ⇒ simple retard, pas d'alerte.
        const alerts = detectSubscriptionAlerts([stale, late], TODAY);
        expect(alerts.filter((a) => a.kind === 'stopped').map((a) => a.merchantKey)).toEqual(['gym']);
        const stopped = alerts.find((a) => a.kind === 'stopped');
        expect(stopped?.daysSinceLast).toBe(77);
    });

    it('marchand NON récurrent ⇒ ignoré même avec une grosse hausse (sans cadence, ça n\'a pas de sens)', () => {
        const inputs: SubscriptionAlertInput[] = [
            { profile: profile({ isRecurring: false }), amounts: [20, 20, 40] },
        ];
        expect(detectSubscriptionAlerts(inputs, TODAY)).toHaveLength(0);
    });

    it('montants non finis / ≤ 0 filtrés ; moins de 2 occurrences valides ⇒ skip', () => {
        const inputs: SubscriptionAlertInput[] = [
            { profile: profile({}), amounts: [NaN, 0, -5, 26] }, // une seule valeur valide
        ];
        expect(detectSubscriptionAlerts(inputs, TODAY).filter((a) => a.kind === 'price_rise')).toHaveLength(0);
    });

    it('tri : l\'alerte la plus coûteuse (coût annuel) d\'abord', () => {
        const cheap = { profile: profile({ key: 'a', label: 'A', lastDate: '2026-04-01' }), amounts: [5, 5] };      // stopped, 60 $/an
        const pricey = { profile: profile({ key: 'b', label: 'B', lastDate: '2026-04-01' }), amounts: [80, 80] };  // stopped, 960 $/an
        const alerts = detectSubscriptionAlerts([cheap, pricey], TODAY);
        expect(alerts.map((a) => a.merchantKey)).toEqual(['b', 'a']);
    });
});

describe('[TEST-GAP-SUBSCRIPTIONS] totalYearlyAtLatest', () => {
    it('somme les abos reconnus au DERNIER tarif, cadence annualisée', () => {
        const inputs: SubscriptionAlertInput[] = [
            { profile: profile({ key: 'm' }), amounts: [10, 12] },                          // 12 × 12 = 144
            { profile: profile({ key: 'y', cadence: 'yearly', medianIntervalDays: 365 }), amounts: [99] }, // 99
            { profile: profile({ key: 'nr', isRecurring: false }), amounts: [50, 50] },     // ignoré
        ];
        expect(totalYearlyAtLatest(inputs, [])).toBe(243);
    });

    it('un abo signalé « arrêté » est EXCLU du total (no-fake-data : ne pas annoncer une dépense éteinte)', () => {
        const inputs: SubscriptionAlertInput[] = [
            { profile: profile({ key: 'live' }), amounts: [10, 10] },                         // 120
            { profile: profile({ key: 'dead', lastDate: '2026-04-01' }), amounts: [30, 30] }, // stopped
        ];
        const alerts = detectSubscriptionAlerts(inputs, TODAY);
        expect(alerts.some((a) => a.kind === 'stopped' && a.merchantKey === 'dead')).toBe(true);
        expect(totalYearlyAtLatest(inputs, alerts)).toBe(120); // le mort ne compte plus
    });
});
