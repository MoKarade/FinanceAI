// tests/services/taxResidual.test.ts
//
// [ENG-NET-MODEL-RESIDUAL] Diagnostic « net déclaré vs net du modèle ». Les tests visent des
// RELATIONS, jamais une reconstruction du calcul fiscal (un test qui recopie l'expression teste
// sa copie) : l'oracle indépendant est l'ALLER-RETOUR par `calculateGrossFromNet` (la fonction
// inverse), et les autres cas s'appuient sur la linéarité en netDeclare + la sortie de la
// fonction elle-même comme ancre.

import { describe, it, expect } from 'vitest';
import { netModelResidual } from '../../services/taxResidual';
import { ageOptsForSalaryInversion, calculateGrossFromNet } from '../../services/tax';

const ANNEE = 2026; // année FIXE : un test qui lit l'horloge est une bombe (rouge au 1er janvier)
const ageOpts = ageOptsForSalaryInversion(
    { age: 35, birthYear: 1991 } as never, ANNEE, 1,
);

describe('[ENG-NET-MODEL-RESIDUAL] netModelResidual', () => {
    it('brut NON saisi (population « brut déduit ») ou net absent → null, jamais un 0 $ décoratif', () => {
        expect(netModelResidual({ netSalary: 5000 }, ANNEE, ageOpts)).toBeNull();
        expect(netModelResidual({ grossSalary: 0, netSalary: 5000 }, ANNEE, ageOpts)).toBeNull();
        expect(netModelResidual({ grossSalary: 7000 }, ANNEE, ageOpts)).toBeNull();
        expect(netModelResidual({ grossSalary: 7000, netSalary: 0 }, ANNEE, ageOpts)).toBeNull();
        expect(netModelResidual({ grossSalary: NaN, netSalary: 5000 }, ANNEE, ageOpts)).toBeNull();
        expect(netModelResidual({ grossSalary: 7000, netSalary: Infinity }, ANNEE, ageOpts)).toBeNull();
    });

    it('ALLER-RETOUR (oracle inverse) : un brut obtenu par calculateGrossFromNet redonne un résiduel ≈ 0', () => {
        // C'est exactement la propriété « biais (a) annulé » de FISCAL_REFERENCE §9, mesurée
        // 2026-09-04 : −0,29 $ à 60 k$ de net, +0,77 $ à 120 k$. Tolérance = la garantie de la
        // dichotomie (< 1 $), pas le confort.
        for (const netAnnuel of [60_000, 120_000]) {
            const gross = calculateGrossFromNet(netAnnuel, ANNEE, ageOpts);
            const r = netModelResidual(
                { grossSalary: gross / 12, netSalary: netAnnuel / 12 }, ANNEE, ageOpts,
            );
            expect(r).not.toBeNull();
            expect(Math.abs(r!.residuel)).toBeLessThan(1);
            expect(r!.significatif).toBe(false);
        }
    });

    it('LINÉARITÉ en netDeclare : baisser le net déclaré de 100 $/mois monte le résiduel de 1 200 $/an, netModele inchangé', () => {
        const a = netModelResidual({ grossSalary: 8_200, netSalary: 5_600 }, ANNEE, ageOpts)!;
        const b = netModelResidual({ grossSalary: 8_200, netSalary: 5_500 }, ANNEE, ageOpts)!;
        expect(b.netModele).toBe(a.netModele); // le modèle ne dépend que du brut
        expect(b.residuel - a.residuel).toBeCloseTo(1_200, 6);
        expect(b.netDeclare).toBe(66_000);
    });

    it('SEUIL 1 % : écart de 0,5 % → non significatif ; 5 % → significatif, avec le bon SIGNE', () => {
        // Ancre : la propre sortie de la fonction (netModele au brut choisi), jamais une
        // reconstruction du barème. brut 98 400 $/an = la fixture du ticket.
        const base = netModelResidual({ grossSalary: 8_200, netSalary: 5_000 }, ANNEE, ageOpts)!;
        const netModeleMensuel = base.netModele / 12;

        const bruit = netModelResidual(
            { grossSalary: 8_200, netSalary: netModeleMensuel * 1.005 }, ANNEE, ageOpts,
        )!;
        expect(bruit.significatif).toBe(false);

        const declareTropHaut = netModelResidual(
            { grossSalary: 8_200, netSalary: netModeleMensuel * 1.05 }, ANNEE, ageOpts,
        )!;
        expect(declareTropHaut.significatif).toBe(true);
        expect(declareTropHaut.residuel).toBeLessThan(0); // le modèle rend MOINS que la paie déclarée

        const declareTropBas = netModelResidual(
            { grossSalary: 8_200, netSalary: netModeleMensuel * 0.95 }, ANNEE, ageOpts,
        )!;
        expect(declareTropBas.significatif).toBe(true);
        expect(declareTropBas.residuel).toBeGreaterThan(0);
        // Identité publiée du triple (contrat, pas reconstruction du moteur) :
        expect(declareTropBas.residuel).toBeCloseTo(declareTropBas.netModele - declareTropBas.netDeclare, 8);
    });
});
