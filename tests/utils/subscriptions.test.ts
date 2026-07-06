import { describe, it, expect } from 'vitest';
import { subscriptionKey, isPinned, mergeSubscriptions, addSubscription, removeSubscription, monthlyEquivalent, totalMonthlyCost, totalYearlyCost } from '../../utils/subscriptions';
import type { RecurringItem } from '../../types';

const sub = (payee: string, over: Partial<RecurringItem> = {}): RecurringItem =>
    ({ payee, averageAmount: 10, dayOfMonth: 1, category: 'Abos', lastDate: '2026-06-01', yearlyCost: 120, ...over });

describe('subscriptionKey — [PH4-F] identité par marchand normalisé', () => {
    it('trim + minuscule', () => {
        expect(subscriptionKey({ payee: '  Netflix ' })).toBe('netflix');
        expect(subscriptionKey({ payee: 'NETFLIX' })).toBe('netflix');
    });
    it('payee absent → chaîne vide (pas de crash)', () => {
        expect(subscriptionKey({ payee: undefined as unknown as string })).toBe('');
    });
});

describe('isPinned — [PH4-F]', () => {
    it('vrai si le marchand est déjà dans la liste (insensible casse/espaces)', () => {
        const pinned = [sub('Netflix')];
        expect(isPinned(pinned, { payee: 'netflix' })).toBe(true);
        expect(isPinned(pinned, { payee: 'Spotify' })).toBe(false);
    });
});

describe('mergeSubscriptions — [PH4-F] épinglés + détectés non-dupliqués', () => {
    it('garde les épinglés et AJOUTE les détectés inconnus (dédup par marchand)', () => {
        const pinned = [sub('Netflix', { averageAmount: 17 })];
        const detected = [sub('Netflix', { averageAmount: 99 }), sub('Spotify', { averageAmount: 11 })];
        const merged = mergeSubscriptions(pinned, detected);
        // Netflix épinglé GAGNE (montant confirmé 17, pas la re-détection 99) ; Spotify ajouté.
        expect(merged).toHaveLength(2);
        expect(merged.find((s) => s.payee === 'Netflix')?.averageAmount).toBe(17);
        expect(merged.find((s) => s.payee === 'Spotify')?.averageAmount).toBe(11);
    });
    it('listes vides → liste vide', () => {
        expect(mergeSubscriptions([], [])).toEqual([]);
    });
});

describe('addSubscription — [PH4-F] épingler (idempotent)', () => {
    it('ajoute un nouvel abo', () => {
        expect(addSubscription([], sub('Netflix'))).toHaveLength(1);
    });
    it('idempotent : ré-épingler le même marchand ne duplique pas', () => {
        const pinned = [sub('Netflix')];
        expect(addSubscription(pinned, sub('netflix', { averageAmount: 99 }))).toHaveLength(1);
    });
    it('ne mute pas la liste d\'origine (immuable)', () => {
        const pinned = [sub('Netflix')];
        const next = addSubscription(pinned, sub('Spotify'));
        expect(pinned).toHaveLength(1);
        expect(next).toHaveLength(2);
        expect(next).not.toBe(pinned);
    });
});

describe('removeSubscription — [PH4-F] désépingler par marchand', () => {
    it('retire l\'abo par clé normalisée', () => {
        const pinned = [sub('Netflix'), sub('Spotify')];
        expect(removeSubscription(pinned, 'netflix').map((s) => s.payee)).toEqual(['Spotify']);
    });
    it('clé inconnue → liste inchangée', () => {
        const pinned = [sub('Netflix')];
        expect(removeSubscription(pinned, 'disney')).toHaveLength(1);
    });
});

describe('monthlyEquivalent / totaux — [PLANNING-ANNUAL-SUB-12X] un abo ANNUEL ne compte plus ×12', () => {
    // Abo MENSUEL : 10 $/mois → yearlyCost 120. Abo ANNUEL : 120 $/an → averageAmount 120, yearlyCost 120.
    const monthly = sub('Spotify', { averageAmount: 10, yearlyCost: 120 });
    const annual = sub('Amazon Prime', { averageAmount: 120, yearlyCost: 120 });

    it('monthlyEquivalent dérive de yearlyCost (annuel → /12), pas de averageAmount brut', () => {
        expect(monthlyEquivalent(monthly)).toBeCloseTo(10, 6);   // 120/12
        expect(monthlyEquivalent(annual)).toBeCloseTo(10, 6);    // 120/12 (PAS 120 = averageAmount de l'annuel)
        // Preuve STRUCTURELLE que seul yearlyCost compte : la signature `Pick<…,'yearlyCost'>` ne donne
        // même pas accès à averageAmount → un abo annuel réaliste 130 $/an rend 130/12, jamais 130.
        expect(monthlyEquivalent({ yearlyCost: 130 })).toBeCloseTo(10.8333, 3);
    });

    it('NaN/Infinity yearlyCost → 0 (pas de contamination du total)', () => {
        expect(monthlyEquivalent({ yearlyCost: NaN })).toBe(0);
        expect(monthlyEquivalent({ yearlyCost: Infinity })).toBe(0);
    });

    it('totalYearlyCost = Σ yearlyCost ; totalMonthlyCost = total/12', () => {
        const subs = [monthly, annual];
        expect(totalYearlyCost(subs)).toBeCloseTo(240, 6);       // 120 + 120
        expect(totalMonthlyCost(subs)).toBeCloseTo(20, 6);       // 240/12
    });

    it('DISCRIMINANT : l\'ancien calcul (Σ averageAmount) sur-comptait l\'annuel ×12', () => {
        const subs = [monthly, annual];
        const oldMonthly = subs.reduce((a, s) => a + s.averageAmount, 0); // ancien bug = 10 + 120 = 130
        expect(oldMonthly).toBe(130);
        expect(totalMonthlyCost(subs)).toBeCloseTo(20, 6);       // nouveau = 20, écart franc vs 130
        expect(totalMonthlyCost(subs)).toBeLessThan(oldMonthly);
    });

    it('liste vide → 0', () => {
        expect(totalYearlyCost([])).toBe(0);
        expect(totalMonthlyCost([])).toBe(0);
    });
});
