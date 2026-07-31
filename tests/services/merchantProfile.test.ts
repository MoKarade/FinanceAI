// tests/services/merchantProfile.test.ts
//
// [TX-CATEGORIZE] Profil de récurrence + catégorisation contextuelle.
// Bug Marc 2026-07-31 : « ça met abonnement pour tout et n'importe quoi ».
//
// Discriminant central (ÉCHOUE sur le code d'avant) : un achat UNIQUE chez un marchand de
// plateforme (App Store, Google Play, Microsoft, Steam) tombait en « Abonnements » sur le seul
// libellé, parce que cette règle passait avant Santé/Loisirs/Magasinage.

import { describe, it, expect } from 'vitest';
import {
    buildMerchantProfiles,
    merchantKey,
    profileForPayee,
} from '../../services/transactions/merchantProfile';
import {
    contextualCategorize,
    explainCategorization,
} from '../../services/transactions/contextualCategorize';
import { ruleCategorize, ruleCategorizeDetailed } from '../../services/import/categoryRules';

/** Génère N dépenses mensuelles chez un marchand, à partir de `2026-01-05`. */
const monthly = (payee: string, amount: number, n: number, drift = 0) =>
    Array.from({ length: n }, (_, i) => ({
        payee,
        amount: -(amount + i * drift),
        date: `2026-${String(i + 1).padStart(2, '0')}-05`,
    }));

describe('merchantKey — identité robuste aux suffixes de relevé', () => {
    it('rapproche les variantes d\'un même marchand', () => {
        expect(merchantKey('NETFLIX.COM 866-579-7172')).toBe(merchantKey('NETFLIX.COM'));
        expect(merchantKey('AMZN MKTP CA*1A2B3')).toBe(merchantKey('AMZN MKTP CA*9Z8Y7'));
        expect(merchantKey('Tim Hortons #4521')).toBe(merchantKey('TIM HORTONS 883'));
    });

    it('ne confond pas deux marchands différents qui partagent un premier mot', () => {
        expect(merchantKey('TIM HORTONS')).not.toBe(merchantKey('TIM ROBERTS'));
    });

    it('rend une clé vide pour un libellé vide', () => {
        expect(merchantKey('')).toBe('');
        expect(merchantKey('   ')).toBe('');
    });
});

describe('buildMerchantProfiles', () => {
    it('reconnaît un abonnement mensuel stable (3 occurrences)', () => {
        const profiles = buildMerchantProfiles(monthly('NETFLIX.COM', 18.99, 3));
        const p = profileForPayee(profiles, 'NETFLIX.COM')!;
        expect(p.count).toBe(3);
        expect(p.cadence).toBe('monthly');
        expect(p.amountStable).toBe(true);
        expect(p.isRecurring).toBe(true);
    });

    it('ne déclare PAS récurrent un marchand vu 2 fois seulement', () => {
        const profiles = buildMerchantProfiles(monthly('NETFLIX.COM', 18.99, 2));
        expect(profileForPayee(profiles, 'NETFLIX.COM')!.isRecurring).toBe(false);
    });

    it('garde récurrent un abonnement dont le prix MONTE de 3 $ (l\'ancien seuil absolu de ±5 $ le perdait)', () => {
        // 9,99 → 12,99 sur 4 mois : l'écart absolu dépasse 3 $, l'écart RELATIF reste sous 15 %.
        const profiles = buildMerchantProfiles(monthly('SPOTIFY', 9.99, 4, 1));
        const p = profileForPayee(profiles, 'SPOTIFY')!;
        expect(p.amountStable).toBe(true);
        expect(p.isRecurring).toBe(true);
    });

    it('ne déclare PAS récurrent un marchand à montants erratiques (épicerie)', () => {
        const profiles = buildMerchantProfiles([
            { payee: 'IGA', amount: -42.1, date: '2026-01-05' },
            { payee: 'IGA', amount: -180.5, date: '2026-02-05' },
            { payee: 'IGA', amount: -12.75, date: '2026-03-05' },
        ]);
        expect(profileForPayee(profiles, 'IGA')!.isRecurring).toBe(false);
    });

    it('ne déclare PAS récurrent un marchand à cadence irrégulière', () => {
        const profiles = buildMerchantProfiles([
            { payee: 'STEAM', amount: -20, date: '2026-01-05' },
            { payee: 'STEAM', amount: -20, date: '2026-01-09' },
            { payee: 'STEAM', amount: -20, date: '2026-06-20' },
        ]);
        expect(profileForPayee(profiles, 'STEAM')!.cadence).toBe('irregular');
        expect(profileForPayee(profiles, 'STEAM')!.isRecurring).toBe(false);
    });

    it('reconnaît une cadence ANNUELLE', () => {
        const profiles = buildMerchantProfiles([
            { payee: 'AMAZON PRIME', amount: -99, date: '2024-03-01' },
            { payee: 'AMAZON PRIME', amount: -99, date: '2025-03-02' },
            { payee: 'AMAZON PRIME', amount: -102, date: '2026-03-01' },
        ]);
        const p = profileForPayee(profiles, 'AMAZON PRIME')!;
        expect(p.cadence).toBe('yearly');
        expect(p.isRecurring).toBe(true);
    });

    it('IGNORE les entrées d\'argent : un abonnement est une SORTIE', () => {
        const profiles = buildMerchantProfiles([
            { payee: 'SALAIRE ACME', amount: 2500, date: '2026-01-05' },
            { payee: 'SALAIRE ACME', amount: 2500, date: '2026-02-05' },
            { payee: 'SALAIRE ACME', amount: 2500, date: '2026-03-05' },
        ]);
        expect(profileForPayee(profiles, 'SALAIRE ACME')).toBeUndefined();
    });

    it('ignore les montants non finis et les dates invalides', () => {
        const profiles = buildMerchantProfiles([
            { payee: 'X', amount: Number.NaN, date: '2026-01-05' },
            { payee: 'Y', amount: -10, date: 'pas-une-date' },
        ]);
        expect(profiles.size).toBe(0);
    });
});

describe('contextualCategorize — le libellé seul ne décide plus « Abonnements »', () => {
    it('un achat UNIQUE sur Steam va dans Loisirs, pas dans Abonnements', () => {
        const profiles = buildMerchantProfiles([
            { payee: 'STEAM GAMES', amount: -59.99, date: '2026-03-14' },
        ]);
        const r = contextualCategorize('STEAM GAMES', profiles);
        expect(r.category).toBe('Loisirs');
        expect(r.source).toBe('rule');
    });

    it('un abonnement mensuel Steam est promu Abonnements', () => {
        const profiles = buildMerchantProfiles(monthly('STEAM GAMES', 12.99, 4));
        const r = contextualCategorize('STEAM GAMES', profiles);
        expect(r.category).toBe('Abonnements');
        expect(r.source).toBe('recurrence');
        expect(explainCategorization(r)).toContain('4 fois');
        expect(explainCategorization(r)).toContain('tous les mois');
    });

    it('un accessoire acheté une fois chez Apple ne devient PAS un abonnement', () => {
        const profiles = buildMerchantProfiles([
            { payee: 'APPLE.COM/BILL', amount: -249, date: '2026-05-02' },
        ]);
        expect(contextualCategorize('APPLE.COM/BILL', profiles).category).toBe('Loisirs');
    });

    it('un jeu Xbox acheté une fois ne devient PAS un abonnement', () => {
        const profiles = buildMerchantProfiles([
            { payee: 'MICROSOFT*XBOX', amount: -79.99, date: '2026-04-11' },
        ]);
        expect(contextualCategorize('MICROSOFT*XBOX', profiles).category).toBe('Loisirs');
    });

    it('un vrai abonnement non ambigu reste Abonnements SANS aucun historique', () => {
        const empty = buildMerchantProfiles([]);
        expect(contextualCategorize('VIDEOTRON', empty).category).toBe('Abonnements');
        expect(contextualCategorize('NETFLIX.COM', empty).category).toBe('Abonnements');
    });

    it('ne promeut JAMAIS un marchand sans règle, même parfaitement régulier', () => {
        // Un loyer, une prime d'assurance et un prêt auto ont exactement cette forme.
        const profiles = buildMerchantProfiles(monthly('PLACEMENT XYZ INC', 400, 6));
        const r = contextualCategorize('PLACEMENT XYZ INC', profiles);
        expect(r.category).not.toBe('Abonnements');
        expect(r.source).toBe('rule');
    });

    it('ne touche pas aux catégories non ambiguës (épicerie récurrente reste Épicerie)', () => {
        const profiles = buildMerchantProfiles(monthly('IGA ST-ROCH', 120, 6));
        expect(contextualCategorize('IGA ST-ROCH', profiles).category).toBe('Épicerie');
    });
});

describe('ruleCategorize — contrat public préservé', () => {
    it('rend la catégorie par DÉFAUT chez un marchand ambigu (plus jamais « Abonnements » à l\'aveugle)', () => {
        expect(ruleCategorize('GOOGLE *PLAY')).toBe('Loisirs');
        expect(ruleCategorize('APPLE.COM/BILL')).toBe('Loisirs');
        expect(ruleCategorize('MICROSOFT*XBOX')).toBe('Loisirs');
        expect(ruleCategorizeDetailed('GOOGLE *PLAY').subscriptionCandidate).toBe(true);
    });

    it('laisse intactes les règles non ambiguës', () => {
        expect(ruleCategorize('VIDEOTRON')).toBe('Abonnements');
        expect(ruleCategorize('IGA ST-ROCH')).toBe('Épicerie');
        expect(ruleCategorize('PETRO-CANADA')).toBe('Transport');
        expect(ruleCategorizeDetailed('VIDEOTRON').subscriptionCandidate).toBe(false);
    });

    it('rend null quand aucune règle ne matche', () => {
        expect(ruleCategorize('MARCHAND INCONNU 123')).toBeNull();
    });
});
