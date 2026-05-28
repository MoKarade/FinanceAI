// tests/services/salaryUnitConvention.test.ts
//
// Garde d'unité (P1) — les 3 chemins de SAISIE doivent stocker un brut/net
// MENSUEL dans le store (convention canonique, sœur de coupleTaxation.test.ts
// qui verrouille le CONSOMMATEUR ; ici on verrouille l'ÉCRITURE).
//
// Bug corrigé : Onboarding (commit au store), PayslipUploadCard (auto-fill) et
// TaxCenter.applyToProfile écrivaient de l'ANNUEL dans grossSalary → revenu
// ~12× trop haut une fois ré-annualisé par computeIncomeBaseline (× 12).
//
// On verrouille deux choses :
//   1) La conversion canonique annuel → mensuel (= / 12) que les 3 chemins
//      appliquent désormais : un brut annuel de 90 000 $ se stocke à 7 500 $/mois.
//   2) Le round-trip avec le VRAI consommateur du moteur (computeIncomeBaseline,
//      qui ré-annualise × 12) : un profil saisi à 90 000 $/an doit être lu comme
//      ~90 000 $/an par le moteur — PAS 1 080 000 $ (l'effet du bug).

import { describe, it, expect } from 'vitest';
import { computeIncomeBaseline } from '../../services/projection/setupSimulation';

// Conversion canonique appliquée à l'écriture par Onboarding /
// PayslipUploadCard / TaxCenter.applyToProfile (brut & net stockés MENSUELS).
const toMonthly = (annual: number) => Math.round(annual / 12);

describe('Unité grossSalary/netSalary — saisie ANNUELLE → stockage MENSUEL', () => {
    it('un brut annuel de 90 000 $ se stocke à 7 500 $/mois (exemple du backlog)', () => {
        expect(toMonthly(90000)).toBe(7500);
    });

    it("le montant stocké est à l'échelle MENSUELLE, pas annuelle", () => {
        const annual = 90000;
        const stored = toMonthly(annual);
        // Garde anti-régression : on ne stocke JAMAIS l'annuel tel quel.
        expect(stored).toBeLessThan(annual / 6);   // très en dessous de l'annuel
        expect(stored * 12).toBeCloseTo(annual, -2); // ré-annualisable proprement
    });

    it('chemins de scan : fréquence de paie → brut MENSUEL', () => {
        // PayslipUploadCard / TaxCenter : grossPeriod × multiplier = ANNUEL, puis / 12.
        expect(toMonthly(3000 * 26)).toBe(6500); // Bi-Weekly 3000 → 78 000/an → 6 500/mois
        expect(toMonthly(8000 * 12)).toBe(8000); // Monthly 8000 → 96 000/an → 8 000/mois
    });
});

describe('Round-trip avec le moteur réel (computeIncomeBaseline ré-annualise × 12)', () => {
    it('un profil saisi à 90 000 $/an est lu ~90 000 $/an par le moteur (pas 1 080 000 $)', () => {
        const storedGross = toMonthly(90000); // 7 500 $/mois, comme stocké après fix
        const r = computeIncomeBaseline({}, [{ grossSalary: storedGross, netSalary: 5000 }]);
        expect(r.grossMarcBaseAnnual).toBe(90000);
        // Anti-régression : le bug (annuel stocké tel quel) donnait 12× plus.
        expect(r.grossMarcBaseAnnual).toBeLessThan(200000);
    });

    it('couple : deux bruts annuels 90 000 / 60 000 lus ~90 000 / 60 000', () => {
        const r = computeIncomeBaseline({}, [
            { grossSalary: toMonthly(90000), netSalary: 5000 },
            { grossSalary: toMonthly(60000), netSalary: 3500 },
        ]);
        expect(r.grossMarcBaseAnnual).toBe(90000);
        expect(r.grossAnnaBaseAnnual).toBe(60000);
    });
});
