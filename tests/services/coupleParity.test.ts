// [CPL-1] (Marc 2026-06-11) — caractérisation solo vs couple.
//
// Bug signalé : avec UN utilisateur réel, « passer en couple » changeait les courbes. Cause UX :
// « + Ajouter conjoint » créait un PLACEHOLDER silencieux (age 30, salaires 0) ; sa simple présence
// active les chemins couple du moteur (PSV/SRG du conjoint à ses 65 ans, imposition 2 têtes,
// fractionnement) → différence de projection SANS partenaire réel. Fix : création gatée sur une
// définition consciente (UsersCard). Ces tests verrouillent le CONTRAT moteur sous-jacent :
//   1. côté REVENU D'EMPLOI, un conjoint vide est strictement neutre (zéro revenu fantôme) ;
//   2. un conjoint sans revenu a TOUT DE MÊME un effet de projection (rentes d'État/fiscalité) —
//      effet LÉGITIME et VOULU pour un vrai conjoint, d'où le gate UX (pas de neutralisation moteur).
import { describe, it, expect } from 'vitest';
import { computeIncomeBaseline } from '../../services/projection/setupSimulation';

describe('[CPL-1] computeIncomeBaseline — conjoint vide = ZÉRO revenu fantôme', () => {
    const real = { useTheoretical: false };

    it('solo vs couple-placeholder (salaires 0) : revenus de base IDENTIQUES', () => {
        const solo = computeIncomeBaseline(real, [{ netSalary: 4000, grossSalary: 6000 }]);
        const couple = computeIncomeBaseline(real, [
            { netSalary: 4000, grossSalary: 6000 },
            { netSalary: 0, grossSalary: 0 }, // placeholder « + Ajouter conjoint » d'avant le gate
        ]);
        expect(couple.incomeMarcNetMonthly).toBe(solo.incomeMarcNetMonthly);
        expect(couple.grossMarcBaseAnnual).toBe(solo.grossMarcBaseAnnual);
        // Le conjoint vide ne fabrique AUCUN revenu (ni net, ni gross-up ×1.35 fantôme).
        expect(couple.incomeAnnaNetMonthly).toBe(0);
        expect(couple.grossAnnaBaseAnnual).toBe(0);
    });

    it('mode THÉORIQUE : le split 55/45 fabrique un revenu au 2e user MÊME absent — documenté', () => {
        // Connu/voulu : useTheoretical répartit le revenu théorique du MÉNAGE 55/45 sans regarder
        // users[]. C'est un mode d'exploration explicite, pas le mode réel — le gate CPL-1 ne le
        // change pas. Ce test documente le comportement pour qu'un futur refactor ne le découvre
        // pas « par surprise ».
        const theo = computeIncomeBaseline({ useTheoretical: true, theoreticalIncome: 8000 }, [
            { netSalary: 4000, grossSalary: 6000 },
        ]);
        expect(theo.incomeAnnaNetMonthly).toBeCloseTo(8000 * 0.45, 6);
    });
});
