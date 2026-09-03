/**
 * [IMMO-3-FORMULES] La prime SCHL manquait au principal de `runAmortization`.
 *
 * Deux formules décrivaient le MÊME prêt sur le MÊME écran : `initPastPurchase` (le présent du
 * moteur) ajoutait la prime d'assurance prêt au principal emprunté, `runAmortization` (l'historique,
 * via `reconstructRealEstateEquityByYear`) non. L'historique amortissait donc une dette trop petite
 * et SURESTIMAIT l'équité — une marche au raccord passé↔présent de la courbe Futur.
 *
 * ⚠️ MESURÉ AVANT D'ÉCRIRE (taux 5 %, 25 ans, croissance 3 %/an) — la surestimation DÉCROÎT avec le
 * temps, la prime finissant par s'amortir :
 *   · 420 000 $ / 21 000 $ (5 %)  → prime 15 960 $ : 15 631 $ à 1 an, 14 137 $ à 5 ans, 11 798 $ à 10 ans
 *   · 500 000 $ / 50 000 $ (10 %) → prime 13 950 $ : 13 663 $ / 12 357 $ / 10 312 $
 *   · 300 000 $ / 15 000 $ (5 %)  → prime 11 400 $ : 11 165 $ / 10 098 $ /  8 427 $
 *   · 420 000 $ / 84 000 $ (20 %) → AUCUNE prime  :      0 $ /      0 $ /      0 $  (contrôle négatif)
 *
 * ⚠️ POURQUOI AUCUN TEST EXISTANT N'A ROUGI, alors que deux d'entre eux portent une mise de fonds
 * assurable (10 % et 12,5 %) — c'est un résultat à EXPLIQUER, pas un feu vert
 * (`« Aucun golden n'a bougé » sur du money-critical est un résultat à EXPLIQUER`) :
 *   · `pastOwnedVsPlanned.test.ts` n'asserte que des SIGNES (`toBeGreaterThan(0)`, `toBe(0)`) —
 *     aucun montant, donc aucun déplacement ne peut le faire rougir ;
 *   · `reconstructCashHistory.test.ts` épingle l'ANNÉE D'ACHAT, dont l'équité est posée à la mise
 *     de fonds par une ligne dédiée, sans passer par `runAmortization`.
 * Ils mesuraient l'absence de couverture au montant, pas l'absence d'effet. D'où ce fichier.
 *
 * ⚠️ PIÈGE PAYÉ DANS LA MESURE, et c'est lui que garde le troisième cas : « financer la prime » en
 * passant `price + prime` à la fonction gonfle AUSSI la valeur du bien (`propertyValue` part de
 * `price`), ce qui INVERSE le signe de l'écart — l'équité montait au lieu de baisser. La prime est
 * une DETTE, jamais de la valeur.
 */
import { describe, it, expect } from 'vitest';
import { runAmortization, calculateSchlPremium } from '../../services/realEstate';
import { reconstructRealEstateEquityByYear } from '../../services/history/reconstructRealEstateEquity';
import { initPastPurchase } from '../../services/projection/pastPurchaseInit';
import type { RealEstateGoal } from '../../types';

const amort = (price: number, downPayment: number) => runAmortization({
    price, downPayment, rate: 5, amortization: 25, propertyGrowthRate: 3, startYear: 2021,
});

describe('[IMMO-3-FORMULES] la prime SCHL est financée par le prêt', () => {
    it('anti-vacuité : les fixtures sont bien de part et d\'autre du seuil d\'assurance', () => {
        // Sans ça, « assurable » et « conventionnel » pourraient être le même cas et les deux
        // assertions suivantes mesureraient la même chose.
        expect(calculateSchlPremium({ price: 420_000, downPayment: 21_000 }).required).toBe(true);
        expect(calculateSchlPremium({ price: 420_000, downPayment: 84_000 }).required).toBe(false);
    });

    it('mise de fonds ASSURABLE : le solde initial porte la prime', () => {
        const prime = calculateSchlPremium({ price: 420_000, downPayment: 21_000 }).premium;
        expect(prime).toBeGreaterThan(10_000); // la mesure serait vide sur une prime nulle
        const an1 = amort(420_000, 21_000).data[0];
        // Discriminant : AVANT ce lot, le solde partait de 399 000 $ (prix − mise) et l'an 1
        // affichait 390 773 $. Le principal vaut désormais 399 000 + 15 960.
        expect(Number(an1?.Solde)).toBeGreaterThan(400_000);
    });

    it('mise de fonds CONVENTIONNELLE (≥ 20 %) : bit-identique, aucune prime inventée', () => {
        const d = amort(420_000, 84_000).data;
        // Valeurs de la version d'AVANT le correctif, relevées avant de coder.
        expect(Number(d[0]?.Solde)).toBe(329_072);
        expect(Number(d[4]?.Solde)).toBe(297_629);
        expect(Number(d[9]?.Solde)).toBe(248_386);
    });

    it('la prime n\'ajoute AUCUNE valeur au bien — elle ne fait que gonfler la dette', () => {
        const d = amort(420_000, 21_000).data;
        // La valeur suit le prix, pas le prix + prime : 420 000 × 1,03 = 432 600.
        expect(Number(d[0]?.ValeurPropriete)).toBe(432_600);
        // Et l'équité BAISSE par rapport à l'avant-correctif (41 827 $), elle ne monte pas.
        expect(Number(d[0]?.Equite)).toBeLessThan(41_827);
    });
});

describe('[IMMO-3-FORMULES] chaîne : les deux formules du même écran concordent', () => {
    const bien: RealEstateGoal = {
        id: 'p1', name: 'Condo', isActive: true, isOwned: true, purchaseDate: '2021-01-01',
        price: 420_000, downPayment: 21_000, mortgageRate: 5, amortization: 25,
        propertyGrowthRate: 3, isPrimaryResidence: true, totalClosingCosts: 6_000,
    } as unknown as RealEstateGoal;

    it('le solde de l\'historique rejoint celui du présent du moteur', () => {
        // `initPastPurchase` = le PRÉSENT (formule fermée, mensuelle) ; `runAmortization` =
        // l'HISTORIQUE (boucle mensuelle). Cinq ans après l'achat, ils doivent décrire la même
        // dette. Avant ce lot ils divergeaient de la prime entière.
        const present = initPastPurchase(bien, 60);
        const historique = Number(amort(420_000, 21_000).data[4]?.Solde);
        expect(historique).toBeGreaterThan(0);
        // Tolérance : l'un arrondit au dollar, l'autre non. 1 $ suffit et discrimine largement —
        // l'écart d'avant était de 14 137 $.
        expect(Math.abs(historique - present.mortgage)).toBeLessThan(1);
    });

    it('l\'équité publiée par l\'historique reflète le correctif', () => {
        const m = reconstructRealEstateEquityByYear([bien], 2026);
        const eq2022 = m.get(2022);
        expect(eq2022).toBeGreaterThan(0); // anti-vacuité : la chaîne produit bien un point
        // Avant le correctif, 2022 (an 1) publiait 41 827 $.
        expect(Number(eq2022)).toBeLessThan(41_827);
    });
});
