// tests/services/modelAssumptions.test.ts
//
// [CONSTANTES-MOTEUR-NON-SOURCEES] — quatre nombres de modèle, désormais nommés dans
// `services/projection/modelAssumptions.ts`. Ce fichier ne garde PAS leurs valeurs : c'est déjà le
// rôle des tests de comportement existants (`realEstateMonth.test.ts` fige 0,05 par son littéral).
// Il garde les trois choses qu'aucun test ne voyait, et que le module AFFIRME dans sa
// documentation — donc trois affirmations qui pourraient devenir fausses en silence :
//
//   1. le taux de la marge Smith est FIGÉ (il ne suit pas le taux hypothécaire) — limite assumée ;
//   2. le multiple des 4 % est une source UNIQUE, plus deux copies anonymes ;
//   3. `CoastFIRE`/`BaristaFIRE` n'ont AUCUN consommateur — la justification écrite de « on ne
//      corrige pas leur incohérence » repose entièrement là-dessus.
//
// ⚠️ **Ce que chaque cas prouve, honnêtement.** Seul le cas 2 ÉCHOUE sur le code d'avant (les deux
// sites portaient un `* 25` nu). Les cas 1 et 3 passaient déjà : ce sont des gardes de LIMITE et
// d'INVENTAIRE, pas la preuve d'un correctif. Les annoncer autrement serait vendre une correction
// qui n'a pas eu lieu — c'est la leçon `UN-ECART-CHIFFRE-SANS-SA-CAUSE-INVITE-A-LE-CORRIGER` : ce
// qu'on protège ici, c'est la RAISON écrite, pas un nombre.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
    processRealEstate,
    type RealEstateState,
    type RealEstateCtx,
    type PropertyStateMutable,
} from '../../services/projection/realEstateMonth';
import { FIRE_TARGET_MULTIPLE, smithHelocAnnualRate } from '../../services/projection/modelAssumptions';
import type { RealEstateGoal } from '../../types';

const RACINE = resolve(__dirname, '../../');
const lire = (rel: string): string => readFileSync(resolve(RACINE, rel), 'utf8');

// ─── Fixture Smith ────────────────────────────────────────────────────────────

const makeState = (over: Partial<RealEstateState> = {}): RealEstateState => ({
    retraitReerMois: 0, rrspWithholdingMois: 0, accRetraitsReerYearAdd: 0, rapMissedRepaymentAdd: 0,
    liquid: 0, celi: 0, celiapp: 0, reer: 0, nonReg: 0, nonRegACB: 0, capitalLossBank: 0,
    monthlyIncome: 0, monthlyExpenses: 0, accRentesYear: 0, accCapitalGainsYear: 0,
    realEstateEquity: 0, mortgageBalance: 0, hasPurchasedPrimary: false,
    hasUsedRap: false, rapBorrowed: 0, rapRepaymentDueTotal: 0, rapRepaymentStartOffset: 0,
    smithManoeuvreDebt: 0, smithInterestDeductibleYear: 0, fhsaClosingYear: null,
    taxCurrentYearReer: 0, impotReerMois: 0,
    withdrawalLiquid: 0, withdrawalCELI: 0, withdrawalNonReg: 0, withdrawalREER: 0, contribLiquid: 0,
    celiWithdrawalsThisYear: 0, retraitCeliMois: 0,
    immoInterest: 0, immoPrincipal: 0, immoHypo: 0, immoCharges: 0, totalRentalIncome: 0,
    lifeEventLogs: [], flowEventLogs: [], ...over,
} as RealEstateState);

const makeCtx = (): RealEstateCtx => ({
    m: 12, loopYear: 2027, isRetired: false, activeUsersCount: 1,
    simInflation: 0, simSalaryGrowth: 0,
    grossMarcBaseAnnual: 80_000, grossAnnaBaseAnnual: 0, incomeRetirement: 0,
    useSmithManoeuvre: true, currentRentExpense: 0,
} as RealEstateCtx);

/** Un mois de levier Smith sur une dette de marge PRÉEXISTANTE de 120 000 $, hypothèque au taux
 *  demandé. La mensualité est recalculée pour CHAQUE taux : sans ça, on comparerait des prêts
 *  différemment amortis et l'écart mesuré ne parlerait plus du taux de la marge. */
function interetMargeSelonTauxHypo(tauxHypo: number): { interet: number; dette: number } {
    const goal = {
        id: 'p1', name: 'Maison', isActive: true, purchaseDate: '2026-01-01',
        price: 500_000, downPayment: 100_000, mortgageRate: tauxHypo, amortization: 25,
        totalClosingCosts: 0, monthlyPayment: 0, unrecoverableMonthly: 0, isPrimaryResidence: true,
    } as RealEstateGoal;
    const state = makeState({ smithManoeuvreDebt: 120_000 });
    const tauxMensuel = tauxHypo / 100 / 12;
    const pmt = 400_000 * tauxMensuel / (1 - Math.pow(1 + tauxMensuel, -300));
    const prop = {
        id: 'p1', isBought: true, mortgage: 400_000, currentValue: 900_000, calculatedPmt: pmt,
    } as PropertyStateMutable;
    processRealEstate(state, makeCtx(), [goal], [prop], (() => 0) as never, (() => 0) as never);
    return { interet: state.smithInterestDeductibleYear, dette: state.smithManoeuvreDebt };
}

describe('[CONSTANTES-MOTEUR-NON-SOURCEES] 1 — le taux de la marge Smith SUIT le prêt (limite LEVÉE)', () => {
    // ⚠️ CETTE GARDE A ÉTÉ INVERSÉE le 2026-08-24, et c'est le comportement attendu d'un test de
    // LIMITE. Elle affirmait « l'intérêt de marge ne suit PAS le taux hypothécaire » — c'était vrai,
    // documenté, et assumé tant que personne n'avait tranché. Marc a tranché
    // (`[SMITH-HELOC-TAUX-FIGE]` : « la marge suit l'hypothèque ») : la garde devient donc l'exact
    // opposé, au même endroit, plutôt que d'être supprimée. Un test de limite qui disparaît laisse
    // croire que la limite n'a jamais existé ; inversé, il raconte la décision.
    it('l’intérêt de marge SUIT le taux hypothécaire, de 3 % à 12 %', () => {
        const bas = interetMargeSelonTauxHypo(3);
        const haut = interetMargeSelonTauxHypo(12);

        // Anti-vacuité : sans ces deux gardes, un moteur qui ne ferait RIEN passerait le test —
        // deux zéros sont parfaitement « indépendants du taux » (`GARDE-AU-PRODUCTEUR-NE-PROUVE-PAS-LA-CHAINE`).
        expect(bas.interet, 'le levier doit produire un intérêt non nul').toBeGreaterThan(100);
        expect(bas.dette, 'la dette de marge doit avoir crû au-delà des 120 000 $ de départ')
            .toBeGreaterThan(120_000);

        // AVANT ce lot, la borne était `< 1 %` : l'intérêt ne bougeait quasiment pas entre 3 % et
        // 12 % d'hypothèque (503,74 $ contre 500,89 $), et le résidu ne venait même pas du taux mais
        // du capital remboursé du mois. C'était la PREUVE du gel.
        // MAINTENANT, la marge vaut hypothèque + 2 points : elle passe de 5 % à 14 % sur ce balayage,
        // soit un rapport de 2,8× sur l'intérêt. La borne s'inverse et devient un PLANCHER.
        const rapport = haut.interet / bas.interet;
        expect(rapport, `la marge ne suit pas : ${bas.interet.toFixed(2)} $ à 3 % contre ${haut.interet.toFixed(2)} $ à 12 %`)
            .toBeGreaterThan(2);

        // Contre-épreuve chiffrée : le rapport observé doit rester COHÉRENT avec le modèle de taux
        // (5 % → 14 %), pas seulement « grand ». Une borne haute large empêche ce test de devenir
        // une bombe si l'écart de 2 points est un jour réglé autrement, tout en refusant l'absurde.
        expect(rapport).toBeLessThan(4);
    });

    it('l’ambiguïté de la fixture voisine a DISPARU avec le gel — et c’est mesurable', () => {
        // ⚠️ HISTOIRE DE CE CAS, gardée parce qu'elle illustre `UN-STUB-QUI-A-LA-FORME-DU-DEFAUT-NE-
        // PEUT-PAS-LE-VOIR`. Le `makeGoal` de `realEstateMonth.test.ts` pose `mortgageRate: 5` —
        // exactement la valeur qu'avait la constante de marge figée. Sous cette fixture, « taux figé
        // à 5 % » et « taux qui suit l'hypothèque » étaient STRICTEMENT indiscernables : le fichier
        // voisin ne pouvait pas voir le gel, quoi qu'il teste.
        //
        // Depuis `[SMITH-HELOC-TAUX-FIGE]`, la coïncidence est rompue : à 5 % d'hypothèque la marge
        // vaut 7 %. La fixture voisine DISCRIMINE donc désormais — et c'est justement elle qui a
        // rougi au moment du changement, comme elle devait.
        const voisin = lire('tests/services/realEstateMonth.test.ts');
        expect(voisin, 'la fixture voisine porte toujours le taux de 5 %').toMatch(/mortgageRate:\s*5\b/);
        expect(smithHelocAnnualRate(5), 'la marge ne coïncide PLUS avec le taux du prêt')
            .not.toBeCloseTo(0.05, 10);
    });
});

describe('[CONSTANTES-MOTEUR-NON-SOURCEES] 2 — le multiple des 4 % est une source UNIQUE', () => {
    // ⚠️ SEUL cas de ce fichier qui échoue sur le code d'avant : les deux sites portaient chacun un
    // `* 25` anonyme, et un seul des deux expliquait pourquoi.
    const SITES = ['services/projection.ts', 'services/projection/monthlyOutput.ts'] as const;

    it('les deux sites CONSOMMENT la constante (usage, pas déclaration)', () => {
        for (const site of SITES) {
            const src = lire(site);
            // `SCAN-QUI-MATCHE-LA-DECLARATION-AU-LIEU-DE-L-USAGE` : on ancre sur `* FIRE_…`,
            // c'est-à-dire l'ARITHMÉTIQUE, jamais sur l'import ni sur le nom seul.
            expect(src, `${site} doit multiplier PAR la constante`).toMatch(/\*\s*FIRE_TARGET_MULTIPLE/);
        }
    });

    it('plus aucun `* 25` nu ne subsiste à ces deux sites', () => {
        for (const site of SITES) {
            const src = lire(site);
            expect(src, `${site} porte encore un multiple anonyme`).not.toMatch(/\*\s*25\b/);
        }
    });

    it('la constante vaut bien le multiple de la règle des 4 %', () => {
        // Circulaire par nature (elle lit ce qu'elle vérifie) — mais c'est le RATCHET : une valeur
        // changée en silence devient un test rouge. Sa justification, elle, vit dans le module.
        expect(FIRE_TARGET_MULTIPLE).toBe(25);
        expect(1 / FIRE_TARGET_MULTIPLE).toBeCloseTo(0.04, 10);
    });
});

describe('[CONSTANTES-MOTEUR-NON-SOURCEES] 3 — `CoastFIRE`/`BaristaFIRE` restent SANS consommateur', () => {
    // Garde d'INVENTAIRE, pas de correctif (`ENTREE-D-INVENTAIRE-FANTOME`). Le module écrit noir sur
    // blanc « portée nulle » pour justifier de NE PAS corriger leur incohérence de croissance. Le
    // jour où quelqu'un branche l'un de ces champs sur un écran, cette justification devient fausse
    // — et sans cette garde, elle resterait écrite au présent dans le dépôt.
    const DOSSIERS = ['components', 'hooks', 'utils', 'mcp', 'services/aiChat'] as const;

    const fichiers = (dossier: string): string[] => {
        const base = resolve(RACINE, dossier);
        try { statSync(base); } catch { return []; }
        return readdirSync(base, { recursive: true })
            .map(String)
            .filter(f => /\.(ts|tsx)$/.test(f))
            .map(f => join(base, f))
            .filter(f => statSync(f).isFile());
    };

    const compter = (motif: RegExp): { hits: number; balayes: number } => {
        let hits = 0, balayes = 0;
        for (const d of DOSSIERS) {
            for (const f of fichiers(d)) {
                balayes++;
                if (motif.test(readFileSync(f, 'utf8'))) hits++;
            }
        }
        return { hits, balayes };
    };

    /** Motif ancré sur l'USAGE d'un champ — accès (`p.CoastFIRE`, `?.CoastFIRE`), déstructuration
     *  ou déclaration de type (`CoastFIRE?: number`). ⚠️ Un `\bCoastFIRE\b` nu ne marche PAS : il
     *  matche la PROSE (`SCAN-QUI-MATCHE-LA-PROSE`) — mon propre inventaire fiscal explique en
     *  français, dans une CHAÎNE de `utils/`, à quoi sert cette constante, et la garde a rougi
     *  dessus. Décommenter n'aurait rien réglé : ce n'était pas un commentaire mais un littéral de
     *  texte. Seul l'ancrage sur la forme d'un accès distingue « on en parle » de « on le lit ». */
    const usage = (champ: string): RegExp =>
        new RegExp(`[.?]\\s*\\b${champ}\\b|\\b${champ}\\b\\s*[?:]|\\{[^}]*\\b${champ}\\b[^}]*\\}\\s*=`);

    it('aucune surface ne lit ces deux champs — et le balayage PEUT trouver (contre-épreuve)', () => {
        const coast = compter(usage('CoastFIRE'));
        const barista = compter(usage('BaristaFIRE'));
        // Contre-épreuve indispensable : `FireTarget` est le champ VOISIN du même producteur, et il
        // est bel et bien consommé. Même balayage, mêmes dossiers, mêmes fichiers — s'il ne le
        // trouvait pas, le « zéro » des deux autres ne prouverait que la panne du scanner
        // (`UN-INVARIANT-QUI-NE-TROUVE-RIEN-DOIT-PROUVER-QU-IL-POURRAIT`).
        const temoin = compter(usage('FireTarget'));

        expect(coast.balayes, 'le balayage doit voir un nombre plausible de fichiers').toBeGreaterThan(200);
        expect(temoin.hits, 'contre-épreuve : `FireTarget` DOIT être trouvé').toBeGreaterThan(0);
        expect(coast.hits, '`CoastFIRE` a désormais un consommateur → mettre à jour modelAssumptions.ts').toBe(0);
        expect(barista.hits, '`BaristaFIRE` a désormais un consommateur → mettre à jour modelAssumptions.ts').toBe(0);
    });

    it('la seule garde existante de `CoastFIRE` n’exerce PAS la croissance figée', () => {
        // Elle vise `m >= retirementMonthIndex`, branche qui rend `futureFireTarget` tel quel : la
        // croissance de 5 % n'y intervient jamais. C'est pour ça que « aucun test n'a bougé » ne
        // dirait rien d'un correctif de cette constante.
        const src = lire('tests/services/monthlyOutput.test.ts');
        expect(src).toMatch(/m:\s*300,\s*retirementMonthIndex:\s*240/);
        expect(src).not.toMatch(/COAST_FIRE_ASSUMED_ANNUAL_GROWTH/);
    });
});
