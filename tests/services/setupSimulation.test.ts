/**
 * Lot 2 — setupSimulation.ts : 6 helpers purs au cœur du setup de runScenario,
 * sans test direct jusqu'ici. C'est ici qu'ont vécu DEUX des bugs silencieux de
 * la semaine : le revenu brut lu ×12 trop bas, et les sliders de rendement sans
 * effet (lecture de `projection.rates` inexistant au lieu de `returnRates`).
 * Ces tests verrouillent le comportement corrigé.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculateFiscalReport } from '../../utils/tax';
import { computeBaseGrossAnnual } from '../../services/projection/buildSimulationParams';
import {
    buildSeededRng,
    computeIncomeBaseline,
    computeRrqAdjustment,
    computeScenarioOverrides,
    computeHistoricalContributionRoom,
    makeSmileLifestyleFactor,
} from '../../services/projection/setupSimulation';
import type { FutureScenarioType } from '../../services/projection';

describe('computeIncomeBaseline — régression bug « revenu ×12 »', () => {
    it('mode réel : grossSalary MENSUEL est annualisé ×12 (et non lu tel quel)', () => {
        const r = computeIncomeBaseline({}, [{ netSalary: 6000, grossSalary: 8000 }, undefined]);
        // 8000 $/mois → 96 000 $/an. Le bug lisait 8000 comme un brut ANNUEL → impôt ~0.
        expect(r.grossMarcBaseAnnual).toBe(96000);
        expect(r.incomeMarcNetMonthly).toBe(6000);
        expect(r.incomeAnnaNetMonthly).toBe(0);
        expect(r.grossAnnaBaseAnnual).toBe(0);
    });

    it('mode réel sans grossSalary : brut DÉDUIT par inversion exacte du calcul fiscal', () => {
        // [MIGRATE-GROSS-135] — RE-BASÉ le 2026-08-20. Ancre AVANT : 81 000 $ (= 5 000 × 12 × 1,35).
        // Ancre APRÈS : 86 967,77 $. Δ = +5 968 $ de brut annuel, à 60 000 $ de net.
        // Le facteur plat sous-estimait donc l'assiette d'impôt — et l'écart s'aggrave avec le
        // revenu (mesuré : −22 028 $ à 100 k$ de net, −132 196 $ à 250 k$).
        const r = computeIncomeBaseline({}, [{ netSalary: 5000 }, undefined]);
        // L'assertion vise la PROPRIÉTÉ, pas le nombre : le brut déduit doit redonner le net visé.
        // ⚠️ Tolérance alignée sur la GARANTIE de `calculateGrossFromNet` (`< 1 $`), pas plus
        // serrée : `toBeCloseTo(x, 0)` exige `< 0,5 $`, et sur 2 951 cibles mesurées 43 %
        // dépassent ce seuil (résidu max 0,998 $). Cette ancre-ci passait par CHANCE.
        expect(Math.abs(calculateFiscalReport(r.grossMarcBaseAnnual, 0, 0).netIncome - 60000)).toBeLessThan(1);
        // Et il n'est PLUS le produit d'un facteur plat — c'est le discriminant du lot.
        expect(r.grossMarcBaseAnnual).not.toBeCloseTo(5000 * 12 * 1.35, 0);
    });

    it('mode théorique : split 55/45 du theoreticalIncome', () => {
        const r = computeIncomeBaseline({ useTheoretical: true, theoreticalIncome: 10000 }, []);
        expect(r.incomeMarcNetMonthly).toBe(5500);
        expect(r.incomeAnnaNetMonthly).toBe(4500);
        // [MIGRATE-GROSS-135] — RE-BASÉ. Ancre AVANT : 89 100 $ (= 5 500 × 12 × 1,35).
        // Ancre APRÈS : 96 423,89 $. Δ = +7 324 $. Même propriété : le brut déduit redonne le net
        // visé, ce que le facteur plat ne faisait pour AUCUN revenu.
        // ⚠️ Tolérance alignée sur la GARANTIE de `calculateGrossFromNet` (`< 1 $`), pas plus
        // serrée : `toBeCloseTo(x, 0)` exige `< 0,5 $`, et sur 2 951 cibles mesurées 43 %
        // dépassent ce seuil (résidu max 0,998 $). Cette ancre-ci passait par CHANCE.
        expect(Math.abs(calculateFiscalReport(r.grossMarcBaseAnnual, 0, 0).netIncome - 66000)).toBeLessThan(1);
    });

    it('[GROSSFROMNET-ANNEE-FIGEE] le CÂBLAGE de startYear est effectif, pas seulement la feuille', () => {
        // ⚠️ Trou relevé en revue : les 3 tests du lot visaient `calculateGrossFromNet` en direct.
        // Retirer `startYear` de l'appel dans `projection.ts` n'aurait fait rougir AUCUN test — le
        // no-op est exact tant que l'année courante vaut 2026. C'est la LIVRAISON du lot qui n'était
        // pas couverte, pas la fonction.
        const a2026 = computeIncomeBaseline({}, [{ netSalary: 5000 }, undefined], 2026);
        const a2030 = computeIncomeBaseline({}, [{ netSalary: 5000 }, undefined], 2030);
        // Indexer les paliers allège l'impôt → il faut MOINS de brut pour le même net.
        expect(a2030.grossMarcBaseAnnual).toBeLessThan(a2026.grossMarcBaseAnnual);
        expect(a2026.grossMarcBaseAnnual - a2030.grossMarcBaseAnnual).toBeGreaterThan(1000);
        // Et le défaut reste NEUTRE (rétrocompat bit-identique).
        expect(computeIncomeBaseline({}, [{ netSalary: 5000 }, undefined]).grossMarcBaseAnnual)
            .toBe(a2026.grossMarcBaseAnnual);
    });

    it('[GROSSFROMNET-ANNEE-FIGEE] idem pour computeBaseGrossAnnual (l’autre site câblé)', () => {
        const users = [{ netSalary: 5000 }] as never;
        const b2026 = computeBaseGrossAnnual(users, 2026);
        const b2030 = computeBaseGrossAnnual(users, 2030);
        expect(b2030).toBeLessThan(b2026);
        expect(computeBaseGrossAnnual(users)).toBe(b2026);
    });

    it('[GROSSFROMNET-ANNEE-FIGEE] les APPELANTS passent bien l’année (scan de source)', () => {
        // ⚠️ Les deux tests ci-dessus prouvent que les FONCTIONS honorent l'année. Ils ne prouvent
        // RIEN sur leurs appelants : mesuré, retirer `startYear` de `projection.ts` les laisse tous
        // VERTS, parce que le no-op est exact tant que l'année courante vaut 2026. C'est
        // `TEST-AU-CONTRAT-NE-VOIT-PAS-L-APPELANT` — et le site d'appel vit au milieu d'une boucle
        // moteur de 1 500 lignes, non instanciable isolément. Le patron du dépôt pour ce cas est le
        // scan de SOURCE (`chartPrivacyScan`, `curveFields`, `silencesXs`).
        const lire = (rel: string): string => {
            const src = readFileSync(join(__dirname, '../..', rel), 'utf-8');
            expect(src.length, `${rel} : fichier vide ou mal résolu`).toBeGreaterThan(500);
            return src;
        };
        expect(lire('services/projection.ts'),
            'projection.ts ne passe plus startYear à computeIncomeBaseline')
            .toMatch(/computeIncomeBaseline\(\s*projection,\s*config\.users,\s*startYear\s*\)/);
        expect(lire('services/projection/buildSimulationParams.ts'),
            'buildSimulationParams ne passe plus l’année à computeBaseGrossAnnual')
            .toMatch(/computeBaseGrossAnnual\(\s*users,\s*inputs\.startYear\s*\)/);
        // Les deux sites MCP, oubliés au premier jet et trouvés en revue.
        expect(lire('mcp/financialSignals.ts')).toMatch(/computeBaseGrossAnnual\(\s*users,\s*year\s*\)/);
        expect(lire('mcp/tools/getTaxSituation.spec.ts')).toMatch(/computeBaseGrossAnnual\(\s*users,\s*year\s*\)/);
    });

    it('mode théorique : theoreticalIncome par défaut = 8000', () => {
        const r = computeIncomeBaseline({ useTheoretical: true }, []);
        expect(r.incomeMarcNetMonthly).toBeCloseTo(8000 * 0.55, 5);
    });

    it('aucun user : tout à zéro (pas de NaN)', () => {
        expect(computeIncomeBaseline({}, [undefined, undefined])).toEqual({
            incomeMarcNetMonthly: 0,
            incomeAnnaNetMonthly: 0,
            grossMarcBaseAnnual: 0,
            grossAnnaBaseAnnual: 0,
        });
    });
});

describe('computeRrqAdjustment', () => {
    const goal = { governmentPension: 1000 };

    it('sans report : âge 65, facteur 1.0, RRQ=65 %, PSV=35 %', () => {
        const r = computeRrqAdjustment(false, goal);
        expect(r.effectivePensionStartAge).toBe(65);
        expect(r.rrqAdjustmentFactor).toBe(1.0);
        expect(r.rrqBasePension).toBeCloseTo(650, 5);
        expect(r.psvBasePension).toBeCloseTo(350, 5);
    });

    it('report à 72 : +0.7 %/mois × 84 = +58,8 % sur la part RRQ (report étendu à 72 depuis 2024)', () => {
        const r = computeRrqAdjustment(true, goal);
        expect(r.effectivePensionStartAge).toBe(72);
        expect(r.rrqAdjustmentFactor).toBeCloseTo(1.588, 5);
        expect(r.rrqBasePension).toBeCloseTo(1000 * 0.65 * 1.588, 5);
        expect(r.psvBasePension).toBeCloseTo(350, 5);
    });
});

describe('computeScenarioOverrides — régression « sliders sans effet »', () => {
    const proj = { inflationRate: 2.1, returnRates: { celi: 7, reer: 6.5, nonReg: 6.5, crypto: 10, cash: 3 } };

    it('BASE : utilise projection.returnRates (les sliders de l\'UI ont un effet)', () => {
        const r = computeScenarioOverrides(proj, 'BASE');
        expect(r.simInflation).toBe(2.1);
        expect(r.baseRates).toEqual(proj.returnRates);
    });

    it('HYPER_INFLATION : inflation forcée à 5.5 %', () => {
        expect(computeScenarioOverrides(proj, 'HYPER_INFLATION' as FutureScenarioType).simInflation).toBe(5.5);
    });

    it('ECONOMIC_WINTER : rendements compressés', () => {
        const r = computeScenarioOverrides(proj, 'ECONOMIC_WINTER' as FutureScenarioType);
        expect(r.baseRates).toEqual({ celi: 3.0, reer: 3.0, nonReg: 2.0, crypto: 5.0, cash: 1.0 });
    });

    it('COMPOUND_STRESS : inflation 5.0 % + rendements compressés', () => {
        const r = computeScenarioOverrides(proj, 'COMPOUND_STRESS' as FutureScenarioType);
        expect(r.simInflation).toBe(5.0);
        expect(r.baseRates.celi).toBe(3.0);
    });

    it('fallback rendements par défaut si returnRates absent', () => {
        const r = computeScenarioOverrides({ inflationRate: 2 }, 'BASE');
        expect(r.baseRates).toEqual({ celi: 7, reer: 6.5, nonReg: 6.5, crypto: 10, cash: 3 });
    });

    // FA-8 reste — `?? 2.0` (pas `|| 2.0`) : une inflation de 0 % saisie est LÉGITIME et
    // ne doit plus être écrasée à 2 %. `undefined` (champ jamais renseigné) défaut bien à 2 %.
    it('inflation 0 % RESPECTÉE (n\'est plus écrasée à 2 %)', () => {
        expect(computeScenarioOverrides({ inflationRate: 0 }, 'BASE').simInflation).toBe(0);
    });

    it('inflation absente (undefined) → défaut 2 %', () => {
        expect(computeScenarioOverrides({}, 'BASE').simInflation).toBe(2.0);
    });

    it('inflation 0 % + scénario HYPER_INFLATION → l\'override macro prime (5.5 %)', () => {
        expect(computeScenarioOverrides({ inflationRate: 0 }, 'HYPER_INFLATION' as FutureScenarioType).simInflation).toBe(5.5);
    });
});

describe('buildSeededRng — déterminisme Monte Carlo', () => {
    it('mêmes dimensions → même séquence (reproductible)', () => {
        const a = buildSeededRng('BASE', 'AGGRESSIVE', 0);
        const b = buildSeededRng('BASE', 'AGGRESSIVE', 0);
        expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    });

    it('itération différente → séquence différente', () => {
        const a = buildSeededRng('BASE', 'AGGRESSIVE', 0);
        const b = buildSeededRng('BASE', 'AGGRESSIVE', 1);
        expect(a()).not.toBe(b());
    });

    it('produit des nombres dans [0, 1)', () => {
        const rng = buildSeededRng('X', 'Y', 3);
        for (let i = 0; i < 50; i++) {
            const v = rng();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });
});

describe('makeSmileLifestyleFactor', () => {
    it('désactivé → toujours 1', () => {
        const f = makeSmileLifestyleFactor(false);
        expect(f(70)).toBe(1);
        expect(f(90)).toBe(1);
    });

    it('activé : go-go 1.15 (<75), slow-go 1.00 (75–85), no-go 0.90 (85+)', () => {
        const f = makeSmileLifestyleFactor(true);
        expect(f(74)).toBe(1.15);
        expect(f(75)).toBe(1.0); // borne basse slow-go
        expect(f(84)).toBe(1.0);
        expect(f(85)).toBe(0.9); // borne basse no-go
        expect(f(95)).toBe(0.9);
    });
});

describe('computeHistoricalContributionRoom', () => {
    it('aucun user actif → count ramené à 1, rooms à 0', () => {
        const r = computeHistoricalContributionRoom([undefined, undefined], 0, 2026);
        expect(r.activeUsersCount).toBe(1);
        expect(r.totalHistoricalCeliRoom).toBe(0);
        expect(r.totalHistoricalRrspRoom).toBe(0);
    });

    it('adulte né en 1990 (non-immigrant) : droits CELI et REER positifs en 2026', () => {
        const r = computeHistoricalContributionRoom([{ birthYear: 1990 }], 80000, 2026);
        expect(r.activeUsersCount).toBe(1);
        expect(r.totalHistoricalCeliRoom).toBeGreaterThan(0);
        expect(r.totalHistoricalRrspRoom).toBeGreaterThan(0);
    });

    it('immigrant arrivé récemment : MOINS de droit CELI qu\'un natif du même âge', () => {
        const native = computeHistoricalContributionRoom([{ birthYear: 1985 }], 80000, 2026);
        const immigrant = computeHistoricalContributionRoom(
            [{ birthYear: 1985, isImmigrant: true, canadaArrivalYear: 2022 }],
            80000,
            2026,
        );
        expect(immigrant.totalHistoricalCeliRoom).toBeLessThan(native.totalHistoricalCeliRoom);
    });
});
