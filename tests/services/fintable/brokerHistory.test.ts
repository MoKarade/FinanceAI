// tests/services/fintable/brokerHistory.test.ts
//
// [FINTABLE-HISTORIQUE-COURTIER] L'historique DATÉ des lectures du courtier.
//
// ⚠️ Ce lot ne change RIEN aujourd'hui : il fait exister une donnée qui n'était jamais conservée
// (`fintableBrokerBalances` est un instantané ÉCRASÉ à chaque passe). Ce fichier défend donc surtout
// ce qu'on refuse d'inventer — une lecture qu'on ne sait pas dater n'entre pas dans un historique.

import { describe, it, expect } from 'vitest';
import {
    accumulerHistoriqueCourtier, profondeurEnJours, jourUtc,
    RETENTION_HISTORIQUE_JOURS, PLAFOND_ENTREES_HISTORIQUE,
} from '../../../services/fintable/brokerHistory';
import type { FintableBrokerBalance } from '../../../types';

const JOUR = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 8, 16, 12, 0, 0); // 2026-09-16 12:00 UTC

const lig = (p: Partial<FintableBrokerBalance> = {}): FintableBrokerBalance => ({
    accountId: 'acc_1', label: 'Disnat (L7B1)', balanceCad: 100_000, at: T0, ...p,
});

describe('jourUtc', () => {
    it('rend le jour UTC, et REFUSE ce qui ne peut pas être daté', () => {
        expect(jourUtc(T0)).toBe('2026-09-16');
        expect(jourUtc(0)).toBeNull();
        expect(jourUtc(-1)).toBeNull();
        expect(jourUtc(Number.NaN)).toBeNull();
        expect(jourUtc(undefined)).toBeNull();
        expect(jourUtc('hier')).toBeNull();
    });
});

describe('accumulation', () => {
    it('conserve la lecture d\'hier ET celle d\'aujourd\'hui — c\'est tout l\'objet du lot', () => {
        const hier = [lig({ at: T0 - JOUR, balanceCad: 98_000 })];
        const out = accumulerHistoriqueCourtier(hier, [lig({ balanceCad: 100_000 })], T0);
        expect(out).toHaveLength(2);
        expect(out.map((e) => e.balanceCad)).toEqual([98_000, 100_000]); // trié par date croissante
    });

    it('UNE entrée par compte et par jour — la DERNIÈRE lecture du jour gagne', () => {
        // Le cron passe une fois par jour, mais Marc peut lancer une synchro manuelle : sans cette
        // clé, un après-midi actif écrirait cinq points pour la même journée.
        const matin = [lig({ at: T0 - 3 * 60 * 60 * 1000, balanceCad: 99_000 })];
        const out = accumulerHistoriqueCourtier(matin, [lig({ balanceCad: 100_000 })], T0);
        expect(out).toHaveLength(1);
        expect(out[0].balanceCad).toBe(100_000);
    });

    it('sépare les COMPTES du même jour', () => {
        const out = accumulerHistoriqueCourtier([], [
            lig({ accountId: 'acc_1', balanceCad: 100_000 }),
            lig({ accountId: 'acc_2', balanceCad: 42_000 }),
        ], T0);
        expect(out).toHaveLength(2);
    });

    it('⚠️ REFUSE une lecture qu\'on ne sait pas dater — jamais rabattue sur maintenant', () => {
        // Dater « aujourd'hui » une lecture d'instant inconnu fabriquerait un point d'historique.
        const out = accumulerHistoriqueCourtier([], [
            lig({ at: Number.NaN }), lig({ accountId: 'acc_2', at: 0 }),
        ], T0);
        expect(out).toEqual([]);
    });

    it('REFUSE une entrée sans identifiant de compte (elle n\'a pas de clé)', () => {
        expect(accumulerHistoriqueCourtier([], [lig({ accountId: '' })], T0)).toEqual([]);
    });

    it('CONSERVE une entrée `missingRate` — la trace de la panne EST l\'information', () => {
        // Son `balanceCad` ne signifie rien, et c'est justement ce qu'on veut savoir plus tard :
        // « ce compte existait ce jour-là et on ne savait pas le convertir ».
        const out = accumulerHistoriqueCourtier([], [lig({ missingRate: 'USD', balanceCad: 0 })], T0);
        expect(out).toHaveLength(1);
        expect(out[0].missingRate).toBe('USD');
    });

    it('purge au-delà de la rétention', () => {
        const vieux = lig({ at: T0 - (RETENTION_HISTORIQUE_JOURS + 5) * JOUR });
        const recent = lig({ at: T0 - 10 * JOUR });
        const out = accumulerHistoriqueCourtier([vieux, recent], [], T0);
        expect(out).toHaveLength(1);
        expect(out[0].at).toBe(recent.at);
    });

    it('⚠️ le PLAFOND coupe par le début — une horloge décalée ne fait pas grossir l\'état sans fin', () => {
        // Il ne fait pas doublon avec la rétention : celle-ci se fie aux horodatages, qui viennent
        // d'une source externe. Deux limites de NATURES différentes.
        const trop = Array.from({ length: PLAFOND_ENTREES_HISTORIQUE + 50 }, (_, i) =>
            lig({ accountId: `acc_${i}`, at: T0 - i * 1000, balanceCad: i }));
        const out = accumulerHistoriqueCourtier(trop, [], T0);
        expect(out).toHaveLength(PLAFOND_ENTREES_HISTORIQUE);
        // Le plus RÉCENT survit toujours : c'est la lecture qui fait autorité aujourd'hui.
        expect(out[out.length - 1].at).toBe(T0);
    });

    it('ordre DÉTERMINISTE — sinon chaque passe produit un diff Drive pour rien', () => {
        const a = accumulerHistoriqueCourtier([
            lig({ accountId: 'b', at: T0 }), lig({ accountId: 'a', at: T0 }),
        ], [], T0);
        const b = accumulerHistoriqueCourtier([
            lig({ accountId: 'a', at: T0 }), lig({ accountId: 'b', at: T0 }),
        ], [], T0);
        expect(a.map((e) => e.accountId)).toEqual(b.map((e) => e.accountId));
        expect(a.map((e) => e.accountId)).toEqual(['a', 'b']);
    });

    it('tolère un historique absent ou une lecture vide', () => {
        expect(accumulerHistoriqueCourtier(undefined, undefined, T0)).toEqual([]);
        expect(accumulerHistoriqueCourtier(undefined, [lig()], T0)).toHaveLength(1);
    });
});

describe('profondeurEnJours', () => {
    it('compte les JOURS distincts, pas les entrées', () => {
        // Deux comptes lus le même jour ne font pas deux jours d'historique : la profondeur est la
        // seule mesure honnête de « est-ce que ça sert déjà ? ».
        expect(profondeurEnJours([
            lig({ accountId: 'a', at: T0 }),
            lig({ accountId: 'b', at: T0 }),
            lig({ accountId: 'a', at: T0 - JOUR }),
        ])).toBe(2);
        expect(profondeurEnJours([])).toBe(0);
        expect(profondeurEnJours(undefined)).toBe(0);
        expect(profondeurEnJours([lig({ at: Number.NaN })])).toBe(0);
    });
});
