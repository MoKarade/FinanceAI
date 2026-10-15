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
    it('solo vs couple-placeholder (salaires 0) : revenus de base IDENTIQUES', () => {
        const solo = computeIncomeBaseline([{ netSalary: 4000, grossSalary: 6000 }]);
        const couple = computeIncomeBaseline([
            { netSalary: 4000, grossSalary: 6000 },
            { netSalary: 0, grossSalary: 0 }, // placeholder « + Ajouter conjoint » d'avant le gate
        ]);
        expect(couple.incomeMarcNetMonthly).toBe(solo.incomeMarcNetMonthly);
        expect(couple.grossMarcBaseAnnual).toBe(solo.grossMarcBaseAnnual);
        // Le conjoint vide ne fabrique AUCUN revenu (ni net, ni gross-up ×1.35 fantôme).
        expect(couple.incomeAnnaNetMonthly).toBe(0);
        expect(couple.grossAnnaBaseAnnual).toBe(0);
    });

    // [SANDBOX-CURSEURS-THEORIQUES-RETRAIT] L'ancien cas « mode THÉORIQUE : split 55/45 fabrique un
    // revenu au 2e user » a disparu avec le mode : `computeIncomeBaseline` ne lit plus que users[],
    // donc un conjoint absent ne reçoit plus AUCUN revenu, quel que soit l'état persisté.
});
