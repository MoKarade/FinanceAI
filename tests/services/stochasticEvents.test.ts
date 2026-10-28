/**
 * Lot 2 — stochasticEvents : événements aléatoires de la simulation (maladie
 * grave, héritage, mortalité, LTC, perte d'emploi, divorce, LTD). Toutes les
 * fonctions reçoivent `rng` INJECTÉ → on force rng() = 0 (déclenche) ou 0.99
 * (jamais), ce qui rend chaque trigger et chaque garde déterministe.
 */
import { describe, it, expect, vi } from 'vitest';
import {
    tryCriticalIllness,
    tryInheritance,
    tryMortality,
    tryLtcTrigger,
    ltcMonthlyCost,
    tickJobLoss,
    tickLtd,
    tryDivorce,
} from '../../services/projection/stochasticEvents';
import type { ProjectionConfig } from '../../types';

const proj = (o: Record<string, unknown>): ProjectionConfig => o as unknown as ProjectionConfig;
const mutator = () => ({ addLiquid: vi.fn(), addExpense: vi.fn(), logLife: vi.fn() });
const ctx = (rngVal: number, o: Record<string, unknown> = {}) => ({
    m: 12, currentMonthIndex: 0, age: 50, currentAge: 50,
    expenseMultiplier: 1, enableMonteCarlo: true, rng: () => rngVal, ...o,
});

describe('tryCriticalIllness', () => {
    const enabled = proj({ criticalIllnessEnabled: true, ciAnnualProbability: 0.5, ciPayoutAmount: 100000, ciExtraMonthlyExpense: 500 });

    it('déclenche (rng < p) : payout + dépense + log', () => {
        const mut = mutator();
        expect(tryCriticalIllness(ctx(0), enabled, false, mut)).toBe(true);
        expect(mut.addLiquid).toHaveBeenCalledWith(100000);
        expect(mut.addExpense).toHaveBeenCalledWith(500);
        expect(mut.logLife).toHaveBeenCalled();
    });

    it('ne déclenche pas si rng ≥ p', () => {
        expect(tryCriticalIllness(ctx(0.99), enabled, false, mutator())).toBe(false);
    });

    it('gardes : désactivé / hors-MC / déjà déclenché / hors-janvier → false', () => {
        expect(tryCriticalIllness(ctx(0), proj({ criticalIllnessEnabled: false }), false, mutator())).toBe(false);
        expect(tryCriticalIllness(ctx(0, { enableMonteCarlo: false }), enabled, false, mutator())).toBe(false);
        expect(tryCriticalIllness(ctx(0), enabled, true, mutator())).toBe(false);
        expect(tryCriticalIllness(ctx(0, { currentMonthIndex: 5 }), enabled, false, mutator())).toBe(false);
        expect(tryCriticalIllness(ctx(0, { m: 0 }), enabled, false, mutator())).toBe(false);
    });
});

describe('tryInheritance', () => {
    it('événement ponctuel (uncertainty 0) à l\'âge attendu : reçoit le montant', () => {
        const mut = mutator();
        const p = proj({ inheritanceEnabled: true, inheritanceExpectedAtAge: 50, inheritanceUncertaintyYears: 0, inheritanceProbability: 1, inheritanceExpectedAmount: 200000 });
        expect(tryInheritance(ctx(0, { age: 50 }), p, false, mut)).toBe(true);
        expect(mut.addLiquid).toHaveBeenCalledWith(200000);
    });

    it('montant ≤ 0 → jamais', () => {
        const p = proj({ inheritanceEnabled: true, inheritanceExpectedAmount: 0 });
        expect(tryInheritance(ctx(0), p, false, mutator())).toBe(false);
    });
});

describe('tryMortality', () => {
    const p = proj({ useStochasticMortality: true });
    it('rng < probabilité annuelle → décès', () => {
        expect(tryMortality(ctx(0, { age: 90 }), p, false)).toBe(true);
    });
    it('rng = 0.999 → survit (proba annuelle < 1)', () => {
        expect(tryMortality(ctx(0.999, { age: 50 }), p, false)).toBe(false);
    });
    it('désactivé ou déjà décédé → false', () => {
        expect(tryMortality(ctx(0), proj({ useStochasticMortality: false }), false)).toBe(false);
        expect(tryMortality(ctx(0), p, true)).toBe(false);
    });
});

describe('tryLtcTrigger', () => {
    const p = proj({ ltcEnabled: true });
    it('avant 65 ans → jamais', () => {
        expect(tryLtcTrigger({ age: 60, enableMonteCarlo: true, rng: () => 0 }, p, false)).toBe(false);
    });
    it('65+ et rng faible → déclenche', () => {
        expect(tryLtcTrigger({ age: 85, enableMonteCarlo: true, rng: () => 0 }, p, false)).toBe(true);
    });
    it('déjà actif → false', () => {
        expect(tryLtcTrigger({ age: 85, enableMonteCarlo: true, rng: () => 0 }, p, true)).toBe(false);
    });
});

describe('ltcMonthlyCost', () => {
    it('coût par défaut 5000 × multiplicateur d\'inflation', () => {
        expect(ltcMonthlyCost(proj({}), 1.5)).toBe(7500);
        expect(ltcMonthlyCost(proj({ ltcMonthlyCost: 8000 }), 1)).toBe(8000);
    });
});

describe('tickJobLoss', () => {
    it('chômage en cours → décrémente, pas de nouveau trigger', () => {
        const r = tickJobLoss(ctx(0), proj({ jobLossEnabled: true }), 4);
        expect(r.newMonthsRemaining).toBe(3);
        expect(r.triggered).toBe(false);
    });
    it('déclenche un nouveau chômage (rng < p) : le compteur RESTANT vaut durée − 1', () => {
        const r = tickJobLoss(ctx(0), proj({ jobLossEnabled: true, jobLossAnnualProbability: 0.5, jobLossDurationMonths: 8 }), 0);
        expect(r.triggered).toBe(true);
        // [JOBLOSS-DUREE-N-PLUS-1] Cette assertion attendait `8` et FIGEAIT le défaut : le mois du
        // déclenchement est déjà un mois de chômage (l'appelant réduit le revenu sur `triggered`),
        // donc il reste 7 mois APRÈS lui pour une durée de 8. La durée ANNONCÉE, elle, ne change
        // pas — c'est ce que vérifie la ligne suivante.
        expect(r.newMonthsRemaining).toBe(7);
        expect(r.duration).toBe(8); // la durée annoncée au log reste la durée demandée
    });
    it('désactivé → aucun trigger', () => {
        expect(tickJobLoss(ctx(0), proj({ jobLossEnabled: false }), 0).triggered).toBe(false);
    });
});

// [JOBLOSS-DUREE-N-PLUS-1] Le vrai discriminant : COMPTER LES MOIS VÉCUS, pas lire le compteur.
//
// ⚠️ Les trois tests ci-dessus interrogent la fonction à son CONTRAT (« que rend-elle pour un
// appel ? »). Aucun ne pouvait voir le défaut, parce que le défaut n'est pas dans un appel : il est
// dans la SOMME des appels. `newMonthsRemaining = 8` est parfaitement défendable en isolation — il
// ne devient faux qu'une fois qu'on sait que l'appelant a DÉJÀ réduit le revenu du mois courant.
// Classe `GARDE-AU-PRODUCTEUR-NE-PROUVE-PAS-LA-CHAINE` : viser la grandeur qui compte pour
// l'utilisateur (combien de mois est-il payé 55 % ?), pas la valeur intermédiaire.
//
// La boucle ci-dessous REJOUE la condition exacte d'`activeIncome.ts` (`wasUnemployed || triggered`
// pour le chômage, `wasLtd || duration > 0` pour l'invalidité). Elle ne reconstruit PAS le calcul
// testé — elle rejoue son CONSOMMATEUR, qui est ce qu'on veut vérifier.
describe('[JOBLOSS-DUREE-N-PLUS-1] la durée configurée est la durée VÉCUE', () => {
    /** Nombre de mois où le revenu est réduit, condition d'`activeIncome.ts` reproduite. */
    const moisDeChomage = (duree: number): number => {
        const p = proj({ jobLossEnabled: true, jobLossDurationMonths: duree, jobLossAnnualProbability: 1 });
        let restant = 0, vecus = 0;
        for (let m = 1; m <= 60; m++) {
            const etait = restant > 0;
            // Déclenchement possible au 1er tour seulement (`currentMonthIndex: 0`), comme en janvier.
            const r = tickJobLoss(ctx(0, { m, currentMonthIndex: m === 1 ? 0 : 5 }), p, restant);
            if (etait || r.triggered) vecus++;
            restant = r.newMonthsRemaining;
        }
        return vecus;
    };

    const moisInvalidite = (duree: number): number => {
        const p = proj({ ltdEnabled: true, ltdDurationMonths: duree, ltdAnnualProbability: 1 });
        let restant = 0, vecus = 0;
        for (let m = 1; m <= 80; m++) {
            const etait = restant > 0;
            const r = tickLtd(ctx(0, { m, currentMonthIndex: m === 1 ? 0 : 5 }), p, restant, false);
            if (etait || r.duration > 0) vecus++;
            restant = r.newMonthsRemaining;
        }
        return vecus;
    };

    it('chômage : N mois configurés → N mois vécus (avant : N+1)', () => {
        expect(moisDeChomage(6)).toBe(6);    // mesuré à 7 avant le correctif
        expect(moisDeChomage(12)).toBe(12);  // mesuré à 13
    });

    it('chômage d’UN mois : le cas où l’erreur valait +100 %', () => {
        // Le pire ratio, et celui qu'un test « durée moyenne » ne montre pas : 1 → 2 mois.
        expect(moisDeChomage(1)).toBe(1);
    });

    it('invalidité longue durée : même défaut, même correctif (le ticket ne la mentionnait pas)', () => {
        expect(moisInvalidite(24)).toBe(24); // mesuré à 25 avant le correctif
        expect(moisInvalidite(1)).toBe(1);   // mesuré à 2
    });
});

describe('tryDivorce', () => {
    it('déclenche et applique le split (keep = 1 − splitPct)', () => {
        const applySplit = vi.fn();
        const p = proj({ divorceEnabled: true, divorceAnnualProbability: 0.5, divorceSplitPct: 40 });
        expect(tryDivorce(ctx(0), p, false, applySplit)).toBe(true);
        expect(applySplit).toHaveBeenCalledWith(0.6); // garde 60 %
    });
    it('déjà divorcé → false, pas de split', () => {
        const applySplit = vi.fn();
        expect(tryDivorce(ctx(0), proj({ divorceEnabled: true }), true, applySplit)).toBe(false);
        expect(applySplit).not.toHaveBeenCalled();
    });
});
