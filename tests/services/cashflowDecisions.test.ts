// tests/services/cashflowDecisions.test.ts
//
// [DETTE-GODFN-CASHFLOW] Les deux DÉCISIONS pures extraites de la cascade de décaissement,
// testées séparément — c'était le but du découpage : la god-fonction de 296 lignes mêlait ces
// décisions aux mutations, elles n'étaient observables que par projection entière.
// ⚠️ L'ÉQUIVALENCE du découpage, elle, n'est pas jugée ici : elle l'est par l'empreinte des
// grandeurs publiées (`scripts/mesureOrdreBoucle.ts`, identique à l'octet avant/après le
// 2026-09-04) + les 64 tests d'intégration du module + le gate complet.

import { describe, it, expect } from 'vitest';
import { ordreDesBuckets, reerDAbordEnCotisation } from '../../services/projection/cashflowAllocation';
import type { AllocationStrategy } from '../../services/projection/types';

describe('[DETTE-GODFN-CASHFLOW] ordreDesBuckets — ordre de la cascade de retrait', () => {
    it('les ordres de base par stratégie (le contrat historique, à l\'identique)', () => {
        expect(ordreDesBuckets('PRIO_REER' as AllocationStrategy, 0, 0)).toEqual(['REER', 'CELI', 'NONREG', 'CRYPTO']);
        expect(ordreDesBuckets('PRIO_CELI' as AllocationStrategy, 0, 0)).toEqual(['CELI', 'NONREG', 'REER', 'CRYPTO']);
        expect(ordreDesBuckets('PRIO_CELI_NO_RAP' as AllocationStrategy, 0, 0)).toEqual(['CELI', 'NONREG', 'REER', 'CRYPTO']);
        expect(ordreDesBuckets('AUTO_MARGINAL' as AllocationStrategy, 0, 0)).toEqual(['CELI', 'REER', 'NONREG', 'CRYPTO']);
        expect(ordreDesBuckets('MELTDOWN_REER' as AllocationStrategy, 0, 0)).toEqual(['CELI', 'REER', 'NONREG', 'CRYPTO']);
    });

    it('banque de pertes > 1 000 $ ET NonReg > 0 : NONREG passe devant REER — là où REER était devant', () => {
        // Défaut (CELI, REER, NONREG, …) : REER en 2e, NONREG en 3e → swap.
        expect(ordreDesBuckets('AUTO_MARGINAL' as AllocationStrategy, 5_000, 10_000)).toEqual(['CELI', 'NONREG', 'REER', 'CRYPTO']);
        expect(ordreDesBuckets('PRIO_REER' as AllocationStrategy, 5_000, 10_000)).toEqual(['NONREG', 'CELI', 'REER', 'CRYPTO']);
        // PRIO_CELI : NONREG est DÉJÀ devant REER → le swap ne s'applique pas (garde nonRegIdx > reerIdx).
        expect(ordreDesBuckets('PRIO_CELI' as AllocationStrategy, 5_000, 10_000)).toEqual(['CELI', 'NONREG', 'REER', 'CRYPTO']);
    });

    it('les DEUX conditions du swap sont nécessaires : banque ≤ 1 000 $ OU NonReg vide → ordre inchangé', () => {
        expect(ordreDesBuckets('AUTO_MARGINAL' as AllocationStrategy, 1_000, 10_000)).toEqual(['CELI', 'REER', 'NONREG', 'CRYPTO']);
        expect(ordreDesBuckets('AUTO_MARGINAL' as AllocationStrategy, 5_000, 0)).toEqual(['CELI', 'REER', 'NONREG', 'CRYPTO']);
    });
});

describe('[DETTE-GODFN-CASHFLOW] reerDAbordEnCotisation — ordre de cotisation en accumulation', () => {
    it('l\'override G21 C5 gagne toujours sur l\'enum', () => {
        expect(reerDAbordEnCotisation('PRIO_CELI' as AllocationStrategy, 'REER_FIRST', 0)).toBe(true);
        expect(reerDAbordEnCotisation('PRIO_REER' as AllocationStrategy, 'CELI_FIRST', 1)).toBe(false);
    });

    it('sans override : PRIO_REER → REER d\'abord ; AUTO_MARGINAL bascule à 40 % EXACTEMENT (décimal, pas pourcentage)', () => {
        expect(reerDAbordEnCotisation('PRIO_REER' as AllocationStrategy, undefined, 0)).toBe(true);
        // CF-3 : le seuil se compare à un DÉCIMAL. L'ancien bug (`>= 40`) rendait la bascule
        // inatteignable — 0,40 doit passer, 0,399 non. C'est la frontière qui porte l'histoire.
        expect(reerDAbordEnCotisation('AUTO_MARGINAL' as AllocationStrategy, undefined, 0.40)).toBe(true);
        expect(reerDAbordEnCotisation('AUTO_MARGINAL' as AllocationStrategy, undefined, 0.399)).toBe(false);
        expect(reerDAbordEnCotisation('PRIO_CELI' as AllocationStrategy, undefined, 0.53)).toBe(false);
        expect(reerDAbordEnCotisation('MELTDOWN_REER' as AllocationStrategy, undefined, 0.53)).toBe(false);
    });
});
