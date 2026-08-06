/**
 * [FUTUR-DAILY] Les mouvements du futur dont l'app connaît la DATE.
 *
 * Deux pièges portent tout le risque ici, et un graphe les rend tous les deux INVISIBLES :
 *  1. le SIGNE — une dépense doit faire descendre le solde ; s'en tromper produit une courbe qui
 *     monte à chaque prélèvement et qui « a l'air » plausible ;
 *  2. l'ANNUEL compté douze fois — un poste à 200 $/an qui apparaît chaque mois.
 */
import { describe, it, expect } from 'vitest';
import {
    datedDeltasForMonth,
    datedCoverageForMonth,
    weeklyOccurrencesInMonth,
    weeklyDeltasForMonth,
    DEFAULT_PAY_DAY_OF_WEEK,
} from '../../services/projection/datedMonthEvents';

const mensuel = (payee: string, montant: number, jour: number) =>
    ({ payee, averageAmount: montant, dayOfMonth: jour, lastDate: '2026-01-15', yearlyCost: montant * 12 });

const annuel = (payee: string, montant: number, jour: number, lastDate: string) =>
    ({ payee, averageAmount: montant, dayOfMonth: jour, lastDate, yearlyCost: montant });

describe('[FUTUR-DAILY] datedDeltasForMonth', () => {
    it('une dépense fait DESCENDRE le solde — le signe est inversé', () => {
        // `averageAmount` est un COÛT positif (convention utils/subscriptions). Dans une série de
        // solde, il doit être négatif. C'est le bug qu'un graphe ne montre pas.
        const d = datedDeltasForMonth([mensuel('Loyer', 1_600, 1)], 0);
        expect(d).toEqual([{ day: 1, amount: -1_600, label: 'Loyer' }]);
    });

    it('un poste ANNUEL n’apparaît QUE dans son mois d’échéance', () => {
        const janvier = datedDeltasForMonth([annuel('Assurance', 900, 12, '2026-03-12')], 0);
        const mars = datedDeltasForMonth([annuel('Assurance', 900, 12, '2026-03-12')], 2);
        expect(janvier).toEqual([]);
        expect(mars).toHaveLength(1);
        expect(mars[0].amount).toBe(-900);
    });

    it('un poste MENSUEL apparaît TOUS les mois', () => {
        const items = [mensuel('Netflix', 20, 8)];
        for (const m of [0, 5, 11]) {
            expect(datedDeltasForMonth(items, m), `mois ${m}`).toHaveLength(1);
        }
    });

    it('une lastDate ILLISIBLE ne fait pas disparaître la facture', () => {
        // Direction de risque : sur-afficher plutôt que MASQUER un prélèvement réel. Même convention
        // que `isAnnualSubscription`, qui retombe sur « mensuel » dans le doute.
        const d = datedDeltasForMonth([annuel('Mystère', 500, 3, 'pas-une-date')], 7);
        expect(d).toHaveLength(1);
    });

    it('IGNORE un montant nul ou non fini plutôt que de poser une marche à 0', () => {
        expect(datedDeltasForMonth([mensuel('Zéro', 0, 5)], 0)).toEqual([]);
        expect(datedDeltasForMonth([mensuel('NaN', Number.NaN, 5)], 0)).toEqual([]);
    });

    it('IGNORE un jour non fini — sans jour, il n’y a rien à dater', () => {
        expect(datedDeltasForMonth([mensuel('SansJour', 50, Number.NaN)], 0)).toEqual([]);
    });

    it('un payee vide reçoit un libellé de repli plutôt qu’une étiquette vide', () => {
        expect(datedDeltasForMonth([mensuel('', 50, 5)], 0)[0].label).toBe('Récurrent');
    });
});

describe('[FUTUR-DAILY] cadence HEBDOMADAIRE (paie et dettes, réponse A13 de Marc)', () => {
    it('trouve TOUS les jeudis du mois — 4 ou 5 selon le calendrier', () => {
        // Janvier 2026 commence un jeudi → 5 jeudis (1, 8, 15, 22, 29).
        expect(weeklyOccurrencesInMonth(2026, 0, DEFAULT_PAY_DAY_OF_WEEK)).toEqual([1, 8, 15, 22, 29]);
        // Février 2026 (28 jours, commence un dimanche) → 4 jeudis.
        expect(weeklyOccurrencesInMonth(2026, 1, DEFAULT_PAY_DAY_OF_WEEK)).toEqual([5, 12, 19, 26]);
    });

    it('convertit un montant MENSUEL du store en versement HEBDOMADAIRE (×12/52)', () => {
        // Le store porte du mensuel (règle « unités argent ») ; se tromper ici donnerait une paie
        // 4,33× trop grosse — le genre d'erreur d'échelle que le dépôt a déjà vécue.
        const d = weeklyDeltasForMonth(2026, 1, 4_333, 'Paie', 1);
        expect(d).toHaveLength(4);
        expect(d[0].amount).toBeCloseTo((4_333 * 12) / 52, 6);
        expect(d[0].label).toBe('Paie');
    });

    it('une PAIE fait monter le solde, un paiement de DETTE le fait descendre', () => {
        expect(weeklyDeltasForMonth(2026, 1, 4_000, 'Paie', 1)[0].amount).toBeGreaterThan(0);
        expect(weeklyDeltasForMonth(2026, 1, 400, 'Dette', -1)[0].amount).toBeLessThan(0);
    });

    it('le signe est imposé même si le montant mensuel arrive NÉGATIF', () => {
        // Un `minimumPayment` saisi en négatif ne doit pas faire MONTER le solde à chaque échéance.
        expect(weeklyDeltasForMonth(2026, 1, -400, 'Dette', -1)[0].amount).toBeLessThan(0);
    });

    it('un mois à 5 jeudis reçoit bien 5 versements — c’est la RÉALITÉ, pas un bug', () => {
        // Un salaire hebdomadaire donne des « mois à 5 paies ». La somme du mois dépasse alors le
        // montant mensuel du store ; `dailyRefine` l'absorbe dans son résidu et la fin de mois
        // retombe EXACTEMENT sur la valeur du moteur.
        const cinq = weeklyDeltasForMonth(2026, 0, 4_333, 'Paie', 1);
        const quatre = weeklyDeltasForMonth(2026, 1, 4_333, 'Paie', 1);
        expect(cinq).toHaveLength(5);
        expect(quatre).toHaveLength(4);
        expect(cinq.reduce((s, d) => s + d.amount, 0)).toBeGreaterThan(4_333);
    });

    it('un montant nul ou non fini ne produit AUCUN versement fantôme', () => {
        expect(weeklyDeltasForMonth(2026, 1, 0, 'Paie', 1)).toEqual([]);
        expect(weeklyDeltasForMonth(2026, 1, Number.NaN, 'Paie', 1)).toEqual([]);
    });

    it('le jour de la semaine est un ARGUMENT, pas un `if` en dur', () => {
        // Marc est payé le jeudi ; un autre profil ne le serait pas. Le défaut ne doit pas devenir
        // une règle codée en dur qu'il faudrait défaire plus tard.
        const lundis = weeklyDeltasForMonth(2026, 1, 1_000, 'Paie', 1, 1);
        expect(lundis.map((d) => d.day)).toEqual([2, 9, 16, 23]);
    });
});

describe('[FUTUR-DAILY] datedCoverageForMonth', () => {
    it('compte ce que l’app sait DATER — pour pouvoir le dire honnêtement à l’écran', () => {
        // Sans ce compte, l'écran laisserait croire que TOUS les flux du mois sont à la bonne date,
        // alors que la paie et l'hypothèque n'ont aucun jour dans le modèle (mesuré 2026-08-06).
        const c = datedCoverageForMonth([mensuel('Loyer', 1_600, 1), mensuel('Netflix', 20, 8)], 0);
        expect(c.datedCount).toBe(2);
        expect(c.datedAmount).toBe(1_620);
    });

    it('rend un compte NUL quand rien n’est datable, pas une couverture implicite', () => {
        expect(datedCoverageForMonth([], 0)).toEqual({ datedCount: 0, datedAmount: 0 });
    });
});
