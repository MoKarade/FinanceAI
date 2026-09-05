// tests/services/revenuGagnePartage.test.ts
// [FISC-RRSP-RENTAL-EARNED] Clé d'attribution du revenu locatif au registre per-conjoint des droits
// REER. Ces tests fixent la CONVENTION (décision Marc 2026-09-05 : propriétaire optionnel, défaut
// 50/50) ; le câblage réel dans la boucle est prouvé par espion dans `rrspRentalEarnedWiring.test.ts`.
import { describe, it, expect } from 'vitest';
import {
    partsRevenuGagne, repartirRevenuGagne, ajouterParProprietaire, cleProprietaire,
    montantsParProprietaireVides, PART_CONJOINT_DEFAUT, type MenageRevenuGagne,
} from '../../services/projection/revenuGagnePartage';

const couple: MenageRevenuGagne = { activeUsersCount: 2, soloHousehold: false };

describe('[FISC-RRSP-RENTAL-EARNED] partsRevenuGagne — la clé d’attribution', () => {
    it('user1 → tout au conjoint 0, user2 → tout au conjoint 1', () => {
        expect(partsRevenuGagne('user1', couple)).toEqual([1, 0]);
        expect(partsRevenuGagne('user2', couple)).toEqual([0, 1]);
    });

    it('joint, absent ou valeur inconnue → 50/50 (décision Marc : défaut à parts égales)', () => {
        expect(PART_CONJOINT_DEFAUT).toBe(0.5);
        for (const owner of ['joint', undefined, null, 'ex-conjoint', 42]) {
            expect(partsRevenuGagne(owner, couple), String(owner)).toEqual([0.5, 0.5]);
        }
    });

    it('ménage solo (activeUsersCount 1) : tout à l’index 0, même si l’immeuble dit user2', () => {
        expect(partsRevenuGagne('user2', { activeUsersCount: 1, soloHousehold: false })).toEqual([1, 0]);
        expect(partsRevenuGagne('joint', { activeUsersCount: 1, soloHousehold: false })).toEqual([1, 0]);
    });

    it('ménage effondré (décès ou divorce, soloHousehold) : tout au déclarant restant, index 0', () => {
        expect(partsRevenuGagne('user2', { activeUsersCount: 2, soloHousehold: true })).toEqual([1, 0]);
        expect(partsRevenuGagne('joint', { activeUsersCount: 2, soloHousehold: true })).toEqual([1, 0]);
    });

    it('invariant : les deux parts somment à 1 dans tous les cas (rien ne se perd, rien ne se double)', () => {
        const menages = [couple, { activeUsersCount: 1, soloHousehold: false }, { activeUsersCount: 2, soloHousehold: true }];
        for (const menage of menages) for (const owner of ['user1', 'user2', 'joint', undefined]) {
            const [a, b] = partsRevenuGagne(owner, menage);
            expect(a + b).toBeCloseTo(1, 12);
        }
    });
});

describe('[FISC-RRSP-RENTAL-EARNED] repartirRevenuGagne — des seaux au tuple', () => {
    it('couple : user1 100 + user2 50 + joint 30 → [115, 65]', () => {
        expect(repartirRevenuGagne({ user1: 100, user2: 50, joint: 30 }, couple)).toEqual([115, 65]);
    });

    it('solo : les mêmes seaux s’effondrent sur l’index 0 → [180, 0]', () => {
        expect(repartirRevenuGagne({ user1: 100, user2: 50, joint: 30 }, { activeUsersCount: 1, soloHousehold: false })).toEqual([180, 0]);
    });

    it('un NOI NÉGATIF (perte locative) réduit le revenu gagné de SON propriétaire — T4040 : pertes déduites', () => {
        expect(repartirRevenuGagne({ user1: 0, user2: -400, joint: 0 }, couple)).toEqual([0, -400]);
    });

    it('un seau non fini est ignoré, les autres survivent', () => {
        expect(repartirRevenuGagne({ user1: NaN, user2: 10, joint: 0 }, couple)).toEqual([0, 10]);
    });
});

describe('[FISC-RRSP-RENTAL-EARNED] ajouterParProprietaire / cleProprietaire — entrées persistées', () => {
    it('une valeur inconnue va dans le seau conjoint, jamais dans une clé fantôme', () => {
        const s = montantsParProprietaireVides();
        ajouterParProprietaire(s, 'n-importe-quoi', 10);
        ajouterParProprietaire(s, undefined, 5);
        ajouterParProprietaire(s, 'user2', 7);
        expect(s).toEqual({ user1: 0, user2: 7, joint: 15 });
        expect(Object.keys(s)).toEqual(['user1', 'user2', 'joint']);
        expect(cleProprietaire('User1')).toBe('joint'); // casse stricte : le type est un littéral
    });

    it('un montant non fini est ignoré (jamais un NaN dans le registre)', () => {
        const s = montantsParProprietaireVides();
        ajouterParProprietaire(s, 'user1', NaN);
        ajouterParProprietaire(s, 'user1', Infinity);
        expect(s.user1).toBe(0);
    });
});
