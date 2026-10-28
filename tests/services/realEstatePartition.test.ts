// [REFONTE-NAV-L3] Partition UI de `realEstateGoals` : biens ACTUELS (page Immobilier, Config)
// vs projets FUTURS (page Projets immo, Vie). La tranche de store reste UNE — ces tests
// verrouillent la sémantique de détention (alignée moteur : granularité MOIS, faits explicites
// prioritaires, isActive ignoré) et la stabilité (ordre préservé, union = entrée, zéro mutation).
//
// FRONTIÈRE STRICTE (correctif panel) : le moteur exige `getMonthOffset(purchaseDate) < 0`
// (`projection.ts:182`) et `presentEquityOfGoal` exige `monthsSincePurchase > 0`
// (`projection/pastPurchaseInit.ts`). Un achat du MOIS COURANT ne satisfait NI l'un NI l'autre.
// Ces tests interrogent `monthsSince` — la fonction RÉELLE du moteur, pas une réimplémentation —
// pour prouver l'alignement de signe (`getMonthOffset === -monthsSince`, même origine : la
// projection démarre au mois courant, cf. `hooks/useSimulationParams.ts`).
import { describe, it, expect } from 'vitest';
import { partitionRealEstateGoals, isOwnedToday } from '../../services/realEstatePartition';
import { monthsSince, presentEquityOfGoal } from '../../services/projection/pastPurchaseInit';
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

    // ── Test discriminant (a) : la frontière STRICTE du moteur. Sur le code d'avant
    // (`monthsSince(...) >= 0`), ces deux cas retournaient `true` et la page « biens détenus »
    // affichait une équité présente sur un bien que le moteur n'achetait JAMAIS.
    it("purchaseDate = aujourd'hui → PROJET (le moteur exige purchaseOffset < 0 STRICT)", () => {
        const g = goal({ purchaseDate: '2026-08-12' });
        expect(isOwnedToday(g, NOW)).toBe(false);
        // Preuve contre le moteur lui-même : offset moteur = -monthsSince = 0 → `< 0` est FAUX.
        expect(monthsSince(g.purchaseDate, NOW)).toBe(0);
        expect(-monthsSince(g.purchaseDate, NOW) < 0).toBe(false);
        // …et le calcul d'équité présente du moteur rend 0 : rien à afficher comme « détenu ».
        expect(presentEquityOfGoal(g, monthsSince(g.purchaseDate, NOW))).toBe(0);
    });

    it('purchaseDate plus tard dans le MOIS courant → PROJET (granularité mois, frontière stricte)', () => {
        const g = goal({ purchaseDate: '2026-08-30' });
        expect(isOwnedToday(g, NOW)).toBe(false);
        expect(presentEquityOfGoal(g, monthsSince(g.purchaseDate, NOW))).toBe(0);
    });

    it('purchaseDate du mois PRÉCÉDENT → détenu (premier mois où le moteur a acheté)', () => {
        const g = goal({ purchaseDate: '2026-07-01' });
        expect(isOwnedToday(g, NOW)).toBe(true);
        expect(-monthsSince(g.purchaseDate, NOW) < 0).toBe(true);
        expect(presentEquityOfGoal(g, monthsSince(g.purchaseDate, NOW))).toBeGreaterThan(0);
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

    it('élément NUL dans la tranche → écarté, jamais un crash (le moteur se défend pareil)', () => {
        // Tranche persistée corrompue : avant la garde, `goal.purchaseDate` sur `null` levait
        // et les DEUX pages immo rendaient une page blanche — alors que la projection, elle,
        // continuait de tourner (`projection.ts` : `filter(g => !!g)`).
        const input = [past, null as unknown as RealEstateGoal, future, undefined as unknown as RealEstateGoal];
        const { actual, future: fut } = partitionRealEstateGoals(input, NOW);
        expect(actual.map((g) => g.id)).toEqual(['past']);
        expect(fut.map((g) => g.id)).toEqual(['future']);
        expect(actual.concat(fut).every(Boolean)).toBe(true);
    });

    it('isOwnedToday sur un goal nul → false (jamais une détention par défaut)', () => {
        expect(isOwnedToday(null as unknown as RealEstateGoal, NOW)).toBe(false);
    });
});

/**
 * Garde de FRONTIÈRE : pour toute date, la classification UI et la condition du moteur
 * doivent dire la MÊME chose. L'assertion ne consulte pas `isOwnedToday` pour décider quoi
 * vérifier — elle confronte deux calculs indépendants (partition UI vs helper moteur), donc
 * elle n'est pas circulaire. Le mois courant est le cas qui séparait les deux avant le fix.
 */
describe('isOwnedToday ↔ moteur — même frontière, mois par mois', () => {
    const MOIS = ['2024-08-15', '2026-06-30', '2026-07-01', '2026-07-31', '2026-08-01', '2026-08-12', '2026-08-31', '2026-09-01', '2030-01-01'];

    it.each(MOIS)('%s : détenu côté UI ⟺ purchaseOffset < 0 côté moteur', (purchaseDate) => {
        const moteurAchete = -monthsSince(purchaseDate, NOW) < 0; // condition EXACTE de projection.ts:182
        expect(isOwnedToday(goal({ purchaseDate }), NOW)).toBe(moteurAchete);
    });
});
