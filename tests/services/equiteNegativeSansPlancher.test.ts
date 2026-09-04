// [IMMO-CLAMP-EQUITE-NEGATIVE] L'équité immobilière peut être NÉGATIVE (décision de Marc,
// 2026-09-03) : un bien underwater (valeur < hypothèque) est un DÉFICIT au bilan, pas un zéro.
//
// Avant ce lot, le plancher vivait en DEUX endroits — le producteur (`runAmortization`) ET le
// consommateur (`addEquity` de `reconstructRealEstateEquityByYear`) — et retirer un seul des deux
// ne changeait rien à l'écran. Mesuré le 2026-09-04 sur la fixture ci-dessous (420 000 $, mise de
// fonds 5 % + prime SCHL financée, marché à −5 %/an) : cinq années passées publiaient 0 $ au lieu
// de −7 404 $ à −42 584 $ — le patrimoine passé était surévalué d'autant, exactement dans le
// scénario où l'information compte (`no-fake-data` : un zéro crédible est pire qu'un chiffre juste
// qui dérange).
//
// ⚠️ La garde s'ancre sur la RELATION (Equite = ValeurPropriete − Solde), jamais sur des montants
// de fixture (`UNE-GARDE-DE-CHAINE-SE-POSE-SUR-UNE-PENTE-PAS-SUR-UN-MONTANT`, adapté : la relation
// survit à tout changement de barème hypothécaire ; les montants ci-dessus ne sont que des
// commentaires datés).
import { describe, it, expect } from 'vitest';
import { runAmortization } from '../../services/realEstate';
import { reconstructRealEstateEquityByYear } from '../../services/history/reconstructRealEstateEquity';
import type { RealEstateGoal } from '../../types';

// Mise de fonds minimale (5 %) + prime SCHL financée + marché en baisse : le cocktail underwater
// réel. Le solde ne dépend pas de la croissance ; seule la valeur chute.
const UNDERWATER = {
    price: 420_000, downPayment: 21_000, rate: 5, amortization: 25,
    renewalRate: 5, propertyGrowthRate: -5, startYear: 2021,
};
// Contrôle négatif : 20 % de mise (aucune prime), marché à +3 % — jamais underwater.
const SAIN = {
    price: 400_000, downPayment: 80_000, rate: 5, amortization: 25,
    renewalRate: 5, propertyGrowthRate: 3, startYear: 2021,
};

const bien = (over: Record<string, unknown>): RealEstateGoal => ({
    id: 'p1', name: 'Bien', isActive: true, isOwned: true, purchaseDate: '2021-01-01',
    mortgageRate: 5, amortization: 25, isPrimaryResidence: true, totalClosingCosts: 6_000,
    monthlyPayment: 0, unrecoverableMonthly: 0, ...over,
} as unknown as RealEstateGoal);

const BIEN_UNDERWATER = bien({
    price: 420_000, downPayment: 21_000, propertyGrowthRate: -5,
});
const BIEN_SAIN = bien({
    id: 'p2', price: 400_000, downPayment: 80_000, propertyGrowthRate: 3,
});

describe('[IMMO-CLAMP-EQUITE-NEGATIVE] producteur : runAmortization publie le déficit', () => {
    it('un bien underwater publie une équité NÉGATIVE, égale à valeur − solde', () => {
        const { data } = runAmortization(UNDERWATER);
        // Anti-vacuité de la fixture : elle DOIT passer underwater, sinon le test ne parle pas du
        // clamp (une fixture toujours positive laisse l'ancien code bit-identique au nouveau).
        const negatifs = data.filter((p) => p.Equite < 0);
        expect(negatifs.length).toBeGreaterThan(0);
        // La RELATION, sur chaque point : l'ancien code la violait exactement sur les points
        // underwater (il publiait max(0, valeur − solde)).
        // Tolérance 1 $ : les trois champs sont arrondis INDÉPENDAMMENT au dollar
        // (|round(a−b) − (round(a)−round(b))| ≤ 1) — la tolérance vient de la fonction, pas du
        // confort. L'ancien clamp, lui, divergeait de MILLIERS de dollars sur les points underwater.
        for (const p of data) {
            expect(Math.abs(p.Equite - (p.ValeurPropriete - p.Solde)), `an ${p.year}`).toBeLessThanOrEqual(1);
        }
    });

    it('le clamp INTERNE sur le solde reste : jamais de solde négatif publié', () => {
        // Un solde négatif est un artefact de sur-remboursement du dernier mois (le paiement
        // dépasse le restant dû), pas une créance — ce clamp-là est une décision distincte, gardée.
        const { data } = runAmortization(UNDERWATER);
        for (const p of data) expect(p.Solde, `an ${p.year}`).toBeGreaterThanOrEqual(0);
    });

    it('contrôle négatif : un bien sain ne publie que du positif — le retrait du plancher est un no-op pour lui', () => {
        // Arithmétique : ancien = max(0, nouveau). Si tout est ≥ 0, ancien == nouveau — le
        // correctif ne touche AUCUN profil sain, seulement les biens underwater.
        const { data } = runAmortization(SAIN);
        for (const p of data) expect(p.Equite, `an ${p.year}`).toBeGreaterThan(0);
    });
});

describe('[IMMO-CLAMP-EQUITE-NEGATIVE] chaîne : la reconstruction passée propage le déficit', () => {
    it('une année underwater du passé arrive NÉGATIVE dans la map — pas re-planchérisée en chemin', () => {
        const m = reconstructRealEstateEquityByYear([BIEN_UNDERWATER], 2026);
        const { data } = runAmortization(UNDERWATER);
        const an2023 = data.find((p) => p.calendarYear === 2023)!;
        // Anti-vacuité : le point source est bien négatif…
        expect(an2023.Equite).toBeLessThan(0);
        // …et le consommateur le publie TEL QUEL. Si `addEquity` re-clampait (le 2e site du
        // double plancher), la map porterait 0 ici et l'égalité rougirait.
        expect(m.get(2023)).toBe(an2023.Equite);
    });

    it('somme par année : underwater + sain = déficit DÉDUIT du positif (décision de Marc)', () => {
        const seul = reconstructRealEstateEquityByYear([BIEN_SAIN], 2026);
        const deux = reconstructRealEstateEquityByYear([BIEN_SAIN, BIEN_UNDERWATER], 2026);
        const eqUnder = runAmortization(UNDERWATER).data.find((p) => p.calendarYear === 2024)!.Equite;
        expect(eqUnder).toBeLessThan(0); // anti-vacuité
        // Le double clamp d'avant aurait rendu deux(2024) == seul(2024) : le déficit disparaissait
        // de la somme. Désormais il la RÉDUIT, au dollar près.
        expect(deux.get(2024)).toBe(seul.get(2024)! + eqUnder);
        expect(deux.get(2024)!).toBeLessThan(seul.get(2024)!);
    });

    it('le garde-fou d\'ENTRÉE reste : une mise de fonds négative (donnée corrompue) ne crée pas de déficit fantôme', () => {
        // Distinct du clamp retiré : l'année d'achat approxime l'équité par la mise de fonds, et
        // une mise NÉGATIVE est une corruption de saisie, pas un bien underwater.
        const m = reconstructRealEstateEquityByYear([bien({ price: 400_000, downPayment: -5_000, propertyGrowthRate: 3 })], 2026);
        expect(m.get(2021)).toBe(0);
    });
});
