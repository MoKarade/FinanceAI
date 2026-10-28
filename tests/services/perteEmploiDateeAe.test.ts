// [CHOMAGE-DEUX-MODELES] L'événement daté PERTE_EMPLOI verse désormais la prestation
// d'assurance-emploi — la même formule que le chômage STOCHASTIQUE (source unique
// `prestationAeNetteMensuelle` : 55 % du brut assurable PLAFONNÉ, imposée à assiette de
// cotisation nulle). Avant ce lot, la perte datée coupait le revenu SANS prestation : deux
// réponses différentes au même événement de vie, et l'écart se creusait à chaque amélioration
// du modèle stochastique (revue #675).
//
// Les gardes observent les grandeurs PUBLIÉES (`chartData[].Income`), jamais une reconstruction
// de la formule (un test qui contient l'expression du code testé teste sa copie). Le PLAFOND est
// prouvé par la RELATION : deux bruts très différents mais tous deux au-dessus du plafond AE
// donnent le MÊME revenu pendant la perte — pendant qu'ils diffèrent hors perte (anti-vacuité).
import { describe, it, expect } from 'vitest';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import type { User, LifeEvent } from '../../types';

const EVENEMENT_MOIS = '2027-03'; // mois 14 de la projection (départ 2026-01)

function params(brutMensuel: number, evenement: Partial<LifeEvent> | null): SimulationParams {
    return {
        projection: {
            years: 6, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
            usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
            emergencyFundMonths: 6, salaryGrowth: 0, propertyGrowthRate: 3,
        },
        calculatedStartingCash: 60_000,
        liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 0, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
        realEstateGoals: [], debts: [], childGoals: [], travelGoals: [],
        lifeEvents: evenement ? [{
            id: 'ev1', type: 'PERTE_EMPLOI', name: 'Mise à pied', date: `${EVENEMENT_MOIS}-01`,
            durationMonths: 6, incomeLossPercent: 100, ...evenement,
        } as LifeEvent] : [],
        retirementGoal: { targetAge: 65, targetMonthlyIncome: 4000, governmentPension: 1500 },
        config: { users: [{ name: 'Marc', grossSalary: brutMensuel, netSalary: brutMensuel * 0.65 } as unknown as User, { name: '' } as unknown as User], splitMode: 'prorata' },
        baseGrossAnnual: brutMensuel * 12, baseNetAnnual: brutMensuel * 0.65 * 12,
        currentRentExpense: 1_500, baseMonthlyExpenses: 3_500, startYear: 2026, startMonth: 0,
    } as unknown as SimulationParams;
}

const incomes = (brutMensuel: number, ev: Partial<LifeEvent> | null) => {
    const r = calculateFutureProjection(params(brutMensuel, ev)) as unknown as {
        chartData: Array<{ Income?: number }>;
    };
    const cd = r.chartData ?? [];
    expect(cd.length).toBeGreaterThan(30);
    // Mois 14 → index 14 (mars 2027) ; on lit le CŒUR de la perte (mois 15-17) pour éviter les
    // effets de bord du mois de déclenchement.
    const pendant = (cd[16]?.Income ?? NaN);
    const avant = (cd[10]?.Income ?? NaN);
    return { pendant, avant };
};

describe('[CHOMAGE-DEUX-MODELES] la perte d\'emploi DATÉE verse l\'assurance-emploi', () => {
    it('à 100 % de perte, le revenu du mois ne tombe PLUS à zéro : la prestation AE est versée', () => {
        const { pendant, avant } = incomes(8_000, {});
        expect(avant).toBeGreaterThan(4_000); // anti-vacuité : le salaire coule hors perte
        // Avant ce lot : pendant === 0 (coupe sèche). Désormais : une prestation strictement
        // positive, et strictement inférieure au salaire (l'AE remplace 55 % d'un brut plafonné).
        expect(pendant).toBeGreaterThan(1_000);
        expect(pendant).toBeLessThan(avant);
    });

    it('le PLAFOND assurable tient : deux hauts bruts au-dessus du plafond touchent la MÊME prestation', () => {
        const haut = incomes(12_000, {});   // 144 k$/an — au-dessus du plafond AE
        const tresHaut = incomes(20_000, {}); // 240 k$/an — encore plus haut
        // Hors perte, les deux revenus diffèrent largement (anti-vacuité de la comparaison)…
        expect(tresHaut.avant - haut.avant).toBeGreaterThan(3_000);
        // …pendant la perte, la prestation est IDENTIQUE au dollar près : le plafond écrête les deux.
        expect(Math.abs(tresHaut.pendant - haut.pendant)).toBeLessThan(1);
        expect(haut.pendant).toBeGreaterThan(1_000);
    });

    it('une SABBATIQUE à 100 % ne touche RIEN : départ volontaire, pas d\'AE (la distinction du lot)', () => {
        const { pendant, avant } = incomes(8_000, { type: 'SABBATIQUE' } as Partial<LifeEvent>);
        expect(avant).toBeGreaterThan(4_000);
        expect(pendant).toBe(0);
    });

    it('perte PARTIELLE (40 %) : prestation proportionnelle — le revenu reste entre la coupe sèche et le plein salaire', () => {
        const plein = incomes(8_000, null);
        const partiel = incomes(8_000, { incomeLossPercent: 40 });
        const coupeSeche = plein.pendant * 0.6; // ce que l'ancien code aurait laissé
        expect(partiel.pendant).toBeGreaterThan(coupeSeche + 100); // l'AE ajoute réellement
        expect(partiel.pendant).toBeLessThan(plein.pendant);       // mais ne compense pas tout
    });
});
