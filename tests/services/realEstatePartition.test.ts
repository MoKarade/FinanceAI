// [REFONTE-NAV-L3] Partition UI de `realEstateGoals` : biens ACTUELS (page Immobilier, Config)
// vs projets FUTURS (page Projets immo, Vie). La tranche de store reste UNE — ces tests
// verrouillent la sémantique de détention (alignée moteur : granularité MOIS, faits explicites
// prioritaires, isActive ignoré) et la stabilité (ordre préservé, union = entrée, zéro mutation).
import { describe, it, expect } from 'vitest';
import { partitionRealEstateGoals, isOwnedToday } from '../../services/realEstatePartition';
import type { RealEstateGoal } from '../../types';

// `now` FIGÉ : les tests ne dépendent jamais de l'horloge de la machine.
const NOW = new Date('2026-08-12T12:00:00');

const goal = (overrides: Partial<RealEstateGoal> = {}): RealEstateGoal => ({
    id: 'g1',
    isActive: true,
    purchaseDate: '2020-06-01',
    price: 400_000,
    downPayment: 80_000,
    mortgageRate: 4,
    amortization: 25,
    totalClosingCosts: 0,
    monthlyPayment: 0,
    unrecoverableMonthly: 0,
    isPrimaryResidence: true,
    ...overrides,
});

describe('isOwnedToday — sémantique de détention', () => {
    it('purchaseDate passée → détenu (bien actuel)', () => {
        expect(isOwnedToday(goal({ purchaseDate: '2020-06-01' }), NOW)).toBe(true);
    });

    it("purchaseDate aujourd'hui → détenu (achat en cours = fait, convention moteur)", () => {
        expect(isOwnedToday(goal({ purchaseDate: '2026-08-12' }), NOW)).toBe(true);
    });

    it('purchaseDate plus tard dans le MOIS courant → détenu (granularité mois, comme monthsSince)', () => {
        expect(isOwnedToday(goal({ purchaseDate: '2026-08-30' }), NOW)).toBe(true);
    });

    it('purchaseDate le mois prochain → projet futur', () => {
        expect(isOwnedToday(goal({ purchaseDate: '2026-09-01' }), NOW)).toBe(false);
    });

    it('purchaseDate lointaine dans le futur → projet futur', () => {
        expect(isOwnedToday(goal({ purchaseDate: '2035-01-15' }), NOW)).toBe(false);
    });

    it('sans purchaseDate ni currentValue → projet (le moteur le traite comme un achat à faire)', () => {
        expect(isOwnedToday(goal({ purchaseDate: '' }), NOW)).toBe(false);
    });

    it('sans purchaseDate mais currentValue explicite > 0 → détenu (fait utilisateur, comme presentEquityOfGoal)', () => {
        expect(isOwnedToday(goal({ purchaseDate: '', currentValue: 500_000 }), NOW)).toBe(true);
    });

    it('purchaseDate illisible → seul un currentValue explicite prouve la détention', () => {
        expect(isOwnedToday(goal({ purchaseDate: 'AAAA-MM-JJ' }), NOW)).toBe(false);
        expect(isOwnedToday(goal({ purchaseDate: 'AAAA-MM-JJ', currentValue: 500_000 }), NOW)).toBe(true);
    });

    it('currentValue non fini ne devient JAMAIS une détention par défaut', () => {
        expect(isOwnedToday(goal({ purchaseDate: '', currentValue: NaN as never }), NOW)).toBe(false);
    });

    it('isActive est IGNORÉ : un bien passé désactivé reste un bien détenu, pas un projet', () => {
        expect(isOwnedToday(goal({ purchaseDate: '2020-06-01', isActive: false }), NOW)).toBe(true);
        expect(isOwnedToday(goal({ purchaseDate: '2035-01-15', isActive: false }), NOW)).toBe(false);
    });
});

describe('partitionRealEstateGoals — stabilité', () => {
    const past = goal({ id: 'past', purchaseDate: '2019-03-01' });
    const pastInactive = goal({ id: 'pastInactive', purchaseDate: '2018-01-01', isActive: false });
    const future = goal({ id: 'future', purchaseDate: '2030-05-01' });
    const dateless = goal({ id: 'dateless', purchaseDate: '' });

    it('répartit sans perte : union = entrée, ordre du store préservé dans chaque moitié', () => {
        const input = [past, future, pastInactive, dateless];
        const { actual, future: fut } = partitionRealEstateGoals(input, NOW);
        expect(actual.map((g) => g.id)).toEqual(['past', 'pastInactive']);
        expect(fut.map((g) => g.id)).toEqual(['future', 'dateless']);
        expect(actual.length + fut.length).toBe(input.length);
    });

    it('ne mute ni le tableau ni les objets (les goals restent les MÊMES références)', () => {
        const input = [past, future];
        const snapshot = [...input];
        const { actual, future: fut } = partitionRealEstateGoals(input, NOW);
        expect(input).toEqual(snapshot);
        expect(actual[0]).toBe(past);
        expect(fut[0]).toBe(future);
    });

    it('liste vide → deux moitiés vides (pas de crash, pas de défaut inventé)', () => {
        expect(partitionRealEstateGoals([], NOW)).toEqual({ actual: [], future: [] });
    });
});
