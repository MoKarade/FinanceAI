// tests/mcp/vehiculeBail.test.ts
// [VEHICULE-BAIL] — sélection de la dette du véhicule et mise en forme publiée à CarAI.
//
// Ce que ces tests DÉFENDENT, et pourquoi chacun peut rougir :
//  - la sélection marche sans `kind` (le chemin RÉEL : aucun producteur ne l'écrit) ;
//  - l'ambiguïté REFUSE au lieu de choisir au hasard — publier la mauvaise dette met un
//    montant faux et crédible sur l'écran d'accueil de CarAI ;
//  - un champ que l'état ne porte pas est `null` ET nommé : le consommateur s'abstient.

import { describe, it, expect } from 'vitest';
import { bailVehicule } from '../../mcp/vehiculeBail';
import { buildDefaultAppState } from '../../mcp/state/loadAppState';
import type { AppState, Debt } from '../../types';

const dette = (over: Partial<Debt> = {}): Debt => ({
    id: over.id ?? 'debt_1789480000000',
    name: over.name ?? 'bZ',
    balance: over.balance ?? 31200,
    interestRate: over.interestRate ?? 0,
    minimumPayment: over.minimumPayment ?? 640,
    category: over.category ?? 'Car',
    ...over,
});

const etat = (debts: Debt[]): AppState => ({ ...buildDefaultAppState(), debts });

describe('bailVehicule — sélection', () => {
    it('trouve la dette par CATÉGORIE quand `kind` est absent (le chemin réel)', () => {
        const r = bailVehicule(etat([dette()]));
        expect(r.statut).toBe('trouve');
        if (r.statut !== 'trouve') return;
        expect(r.bail.nom).toBe('bZ');
        expect(r.bail.solde).toBe(31200);
        expect(r.bail.mensualite).toBe(640);
    });

    it('un `kind: auto-lease` PRIME sur une autre dette de catégorie Car', () => {
        const r = bailVehicule(etat([
            dette({ id: 'a', name: 'Vieille auto', category: 'Car' }),
            dette({ id: 'b', name: 'bZ', kind: 'auto-lease', category: 'Other' }),
        ]));
        expect(r.statut).toBe('trouve');
        if (r.statut !== 'trouve') return;
        expect(r.bail.nom).toBe('bZ');
    });

    it('le nom voulu PRIME, même sur une dette d’une autre catégorie', () => {
        const r = bailVehicule(
            etat([dette({ id: 'a', name: 'bZ' }), dette({ id: 'b', name: 'Marge', category: 'Personal' })]),
            { nomVoulu: 'Marge' },
        );
        expect(r.statut).toBe('trouve');
        if (r.statut !== 'trouve') return;
        expect(r.bail.nom).toBe('Marge');
    });

    it('le nom voulu est comparé sans la casse ni les espaces de bord', () => {
        const r = bailVehicule(etat([dette({ name: 'bZ' })]), { nomVoulu: '  BZ ' });
        expect(r.statut).toBe('trouve');
    });

    it('REFUSE (ambigu) quand deux véhicules coexistent, et nomme les candidates', () => {
        const r = bailVehicule(etat([
            dette({ id: 'a', name: 'bZ' }),
            dette({ id: 'b', name: 'Corolla' }),
        ]));
        expect(r.statut).toBe('ambigu');
        if (r.statut !== 'ambigu') return;
        expect(r.candidates).toEqual(['bZ', 'Corolla']);
    });

    it('« introuvable » quand aucune dette n’est un véhicule', () => {
        const r = bailVehicule(etat([dette({ name: 'Carte', category: 'CreditCard' })]));
        expect(r.statut).toBe('introuvable');
    });

    it('« introuvable » quand le nom voulu ne correspond à rien', () => {
        const r = bailVehicule(etat([dette()]), { nomVoulu: 'Absente' });
        expect(r.statut).toBe('introuvable');
        if (r.statut !== 'introuvable') return;
        expect(r.raison).toContain('Absente');
    });

    it('un état SANS dette du tout ne lève pas', () => {
        expect(bailVehicule(etat([])).statut).toBe('introuvable');
    });
});

describe('bailVehicule — ce qui est publié', () => {
    it('ne nomme AUCUN champ absent quand l’état les porte tous (anti-vacuité)', () => {
        const r = bailVehicule(etat([dette({
            originalBalance: 33600, startDate: '2025-03-01', termEndDate: '2029-03-01',
        })]));
        expect(r.statut).toBe('trouve');
        if (r.statut !== 'trouve') return;
        expect(r.bail.champsAbsents).toEqual([]);
        expect(r.bail.montantOrigine).toBe(33600);
        expect(r.bail.debut).toBe('2025-03-01');
        expect(r.bail.finTerme).toBe('2029-03-01');
    });

    it('NOMME les champs que l’état ne porte pas — le cas réel d’une dette saisie par le MCP', () => {
        const r = bailVehicule(etat([dette()]));
        expect(r.statut).toBe('trouve');
        if (r.statut !== 'trouve') return;
        expect(r.bail.montantOrigine).toBeNull();
        expect(r.bail.debut).toBeNull();
        expect(r.bail.finTerme).toBeNull();
        expect(r.bail.champsAbsents).toEqual(['montantOrigine', 'debut', 'finTerme']);
    });

    it('une mensualité de ZÉRO est traitée comme ABSENTE, jamais comme un versement', () => {
        const r = bailVehicule(etat([dette({ minimumPayment: 0 })]));
        expect(r.statut).toBe('trouve');
        if (r.statut !== 'trouve') return;
        expect(r.bail.mensualite).toBeNull();
        expect(r.bail.champsAbsents).toContain('mensualite');
    });

    it('un montant NON FINI ne traverse pas — il devient absent', () => {
        const r = bailVehicule(etat([dette({ minimumPayment: Number.NaN, originalBalance: Number.POSITIVE_INFINITY })]));
        expect(r.statut).toBe('trouve');
        if (r.statut !== 'trouve') return;
        expect(r.bail.mensualite).toBeNull();
        expect(r.bail.montantOrigine).toBeNull();
        expect(r.bail.champsAbsents).toContain('mensualite');
        expect(r.bail.champsAbsents).toContain('montantOrigine');
    });

    it('publie la fraîcheur en ISO, et `null` quand la source ne date rien', () => {
        const t = Date.parse('2026-09-14T21:42:22.639Z');
        const avec = bailVehicule(etat([dette()]), { dataAsOf: t });
        const sans = bailVehicule(etat([dette()]));
        expect(avec.statut === 'trouve' && avec.bail.dataAsOf).toBe('2026-09-14T21:42:22.639Z');
        expect(sans.statut === 'trouve' && sans.bail.dataAsOf).toBeNull();
    });

    it('le taux est publié tel quel — 0 est une VALEUR (bail sans intérêt), pas une absence', () => {
        const r = bailVehicule(etat([dette({ interestRate: 0 })]));
        expect(r.statut === 'trouve' && r.bail.tauxAnnuelPourcent).toBe(0);
        expect(r.statut === 'trouve' && r.bail.champsAbsents).not.toContain('tauxAnnuelPourcent');
    });
});
