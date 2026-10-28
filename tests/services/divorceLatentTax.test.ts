// tests/services/divorceLatentTax.test.ts
//
// [ENG-DIVORCE-LATENTTAX] `computeLatentTax` recevait `activeUsersCount` inchangé après un divorce.
// Ce paramètre est un NOMBRE DE DÉCLARANTS : il divise le revenu pour calculer l'impôt d'UNE
// déclaration, puis le remultiplie. Passer 2 lisse la facture sur deux têtes fictives et sous-estime
// l'impôt latent, parce que les paliers sont PROGRESSIFS.
//
// ⚠️ CONSTAT MESURÉ, ET IL CHANGE LA PORTÉE DU TICKET : ce correctif est aujourd'hui **INERTE sur
// toute sortie observable**. `impotLatent` n'alimente QUE `ImpotLatent` du point mensuel
// (`projection.ts` → `monthlyOutput`), et sous `enableMonteCarlo` — le SEUL mode où le divorce
// existe — `buildMonthlyDataPoint` ne rend qu'un point ALLÉGÉ `{ NetWorth, monthIndex }`.
// Vérifié par perturbation : patrimoine final, succession et `ImpotLatent` sont bit-identiques
// avec et sans le correctif, sur déterministe, MC et divorce.
//
// Le corriger reste juste — un calcul faux qui n'est pas lu AUJOURD'HUI sera lu demain, et le
// panel l'a mesuré en instrumentant le moteur (53 126 $ d'écart). Mais la vérification passe par
// la FONCTION PURE, pas par un scénario : prétendre le contraire serait un test vacueux.
// → `[ENG-MC-OBSERVABILITY]` pour rendre ces grandeurs observables sous MC.

import { describe, it, expect } from 'vitest';
import { computeLatentTax } from '../../services/projection/latentTax';
import { calculateFiscalReport } from '../../utils/tax';

const ctx = (activeUsersCount: number, grossAnnaBaseAnnual: number) => ({
    m: 0, loopYear: 2026, simInflation: 0, simSalaryGrowth: 0, isRetired: false,
    activeUsersCount,
    grossMarcBaseAnnual: 98_400, grossAnnaBaseAnnual,
    accRentesYear: 0, incomeRetirement: 0,
    reer: 400_000, nonReg: 300_000, nonRegACB: 150_000,
    crypto: 0, cryptoACB: 0, realEstateLatentGain: 0,
    enableMonteCarlo: false,
});

describe('[ENG-DIVORCE-LATENTTAX] l\'impôt latent suit le nombre de DÉCLARANTS', () => {
    it('un seul déclarant paie PLUS sur le même patrimoine (paliers progressifs)', () => {
        // Le ménage divorcé : une seule déclaration, et le salaire de l'ex n'est plus dans
        // l'assiette (même motif qu'au dépôt de décembre et au meltdown REER).
        const solo = computeLatentTax(ctx(1, 0) as never, calculateFiscalReport);
        const couple = computeLatentTax(ctx(2, 85_200) as never, calculateFiscalReport);

        expect(solo, 'impôt latent nul : la fixture ne mesure rien').toBeLessThan(0);
        // Les deux sont NÉGATIFS (c'est une charge) : « plus d'impôt » = plus proche de −∞.
        expect(solo, 'le divorcé sous-estime encore son impôt latent').toBeLessThan(couple);
    });

    it('le partage sur 2 têtes est bien ce qui allège la facture', () => {
        // Même revenu total, même patrimoine : seul le nombre de déclarations change. C'est la
        // progressivité qui crée l'écart — rien d'autre ne bouge dans cette comparaison.
        const unDeclarant = computeLatentTax(ctx(1, 0) as never, calculateFiscalReport);
        const deuxDeclarants = computeLatentTax(ctx(2, 0) as never, calculateFiscalReport);
        expect(Math.abs(unDeclarant)).toBeGreaterThan(Math.abs(deuxDeclarants));
    });

    it('le salaire de l\'ex-conjoint pèse sur l\'assiette tant qu\'il y est', () => {
        const sansEx = computeLatentTax(ctx(1, 0) as never, calculateFiscalReport);
        const avecEx = computeLatentTax(ctx(1, 85_200) as never, calculateFiscalReport);
        expect(sansEx, 'le salaire de l\'ex ne change rien : vérifier le câblage').not.toBe(avecEx);
    });
});
