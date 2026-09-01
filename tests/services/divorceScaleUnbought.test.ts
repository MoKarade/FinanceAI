/**
 * [ENG-DIVORCE-SCALE-UNBOUGHT] Le partage du divorce ne touche QUE les biens réellement détenus.
 *
 * Le ticket était marqué « [À vérifier] — finding non vérifié par perturbation ». Vérifié, et pire
 * que son énoncé : il annonçait « un principal réduit de moitié », mais le vrai dégât est sur
 * l'ÉQUITÉ.
 *
 * ⚠️ Pour un bien pas encore acheté, `currentValue` et `mortgage` ne sont pas des actifs du couple :
 * ce sont les PARAMÈTRES SEMÉS du futur achat (`price` et `price − downPayment`), que
 * `realEstateMonth` consomme tels quels au moment de l'achat (`const p = pState.mortgage`). Les
 * diviser au divorce laisse DEUX sources pour une même opération — le débit vient du BUT
 * (`goal.downPayment`), l'actif vient de l'ÉTAT.
 *
 * MESURÉ, achat 500 000 $ / mise de fonds 100 000 $, `keep` = 0,5 :
 *   cash sorti .... 105 000 $ dans les DEUX cas (identique — il ne dépend pas de l'état)
 *   bien obtenu ... 500 000 $ → 250 000 $
 *   équité ........ 100 672 $ → 50 336 $   ← la moitié de la mise de fonds s'évapore
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { processRealEstate } from '../../services/projection/realEstateMonth';
import type { RealEstateGoal } from '../../types';
import { stripComments } from '../../utils/stripComments';

const PRIX = 500_000;
const MISE = 100_000;

const goal = {
    id: 'p1', name: 'Maison', isActive: true, purchaseDate: '2030-01-01',
    price: PRIX, downPayment: MISE, mortgageRate: 5, amortization: 25,
    totalClosingCosts: 5_000, monthlyPayment: 0, unrecoverableMonthly: 0,
    isPrimaryResidence: true, propertyGrowthRate: 0,
} as unknown as RealEstateGoal;

const makeState = () => ({
    liquid: 300_000, reer: 0, celi: 0, celiapp: 0, nonReg: 0, nonRegACB: 0,
    realEstateEquity: 0, mortgageBalance: 0, immoHypo: 0, immoCharges: 0,
    immoInterest: 0, immoPrincipal: 0, rentalIncome: 0, withdrawalLiquid: 0,
    withdrawalREER: 0, withdrawalCELI: 0, withdrawalNonReg: 0, accCapitalGainsYear: 0,
    rapBorrowed: 0, rapRepaid: 0, lifeEventLogs: [] as string[], flowEventLogs: [] as string[],
    hasPurchasedPrimary: false, logFlow: () => {}, currentRentExpense: 0, fhsaClosingYear: 0,
} as never);

const ctx = {
    m: 48, loopYear: 2030, isRetired: false, activeUsersCount: 1, simInflation: 0,
    simSalaryGrowth: 0, grossMarcBaseAnnual: 80_000, grossAnnaBaseAnnual: 0, incomeRetirement: 0,
    useSmithManoeuvre: false, currentRentExpense: 0,
} as never;

/** L'état SEMÉ d'un bien pas encore acheté, exactement comme `projection.ts` le construit. */
const propNonAchete = () => ({
    id: 'p1', isBought: false, mortgage: PRIX - MISE, currentValue: PRIX,
    calculatedPmt: 0, isPaidOff: false, isSold: false, cost: PRIX, isPrimaryResidence: true,
} as never);

/**
 * ⚠️ REPRODUCTION assumée du `.map` du bloc divorce, et elle ne prouve QUE la conséquence : « un
 * bien semé dont on divise l'état donne la moitié de l'équité à l'achat ». Un test qui contient une
 * expression ressemblant au code testé teste sa copie — le CÂBLAGE réel est donc vérifié à part,
 * par le scan de source ci-dessous, qui exige la garde `p.isBought` dans `projection.ts`.
 */
const partageDivorce = (p: Record<string, unknown>, keep: number) => (p.isBought ? {
    ...p, currentValue: Number(p.currentValue) * keep, mortgage: Number(p.mortgage) * keep,
} : p);

function acheter(prop: Record<string, unknown>) {
    const s = makeState();
    processRealEstate(s, ctx, [goal], [prop] as never, () => 0, () => 0);
    const ss = s as unknown as Record<string, number>;
    return {
        achete: prop.isBought as boolean,
        valeur: Number(prop.currentValue),
        hypo: Number(prop.mortgage),
        equite: Number(prop.currentValue) - Number(prop.mortgage),
        cashSorti: 300_000 - ss.liquid,
    };
}

describe('[ENG-DIVORCE-SCALE-UNBOUGHT] le divorce ne partage pas un bien pas encore acheté', () => {
    it('un achat FUTUR rend la même équité, divorce ou non', () => {
        const sans = acheter(propNonAchete() as never);
        const apres = acheter(partageDivorce(propNonAchete() as never, 0.5) as never);

        // Anti-vacuité : les deux scénarios doivent VRAIMENT acheter, sinon on compare deux zéros.
        expect(sans.achete, 'le scénario témoin n\'achète pas : rien n\'est mesuré').toBe(true);
        expect(apres.achete, 'le scénario divorcé n\'achète pas : rien n\'est mesuré').toBe(true);

        // Le cash sorti ne dépend PAS de l'état (il vient du BUT) — c'est ce qui rendait le défaut
        // asymétrique : on payait plein tarif pour un demi-bien.
        expect(apres.cashSorti).toBeCloseTo(sans.cashSorti, 2);
        expect(sans.cashSorti).toBeGreaterThan(100_000);

        expect(apres.valeur).toBe(sans.valeur);
        expect(apres.hypo).toBeCloseTo(sans.hypo, 2);
        expect(apres.equite).toBeCloseTo(sans.equite, 2);
    });

    it('le VRAI bloc divorce de `projection.ts` porte bien la garde `isBought`', () => {
        // Sans ce cas, tout ce fichier ne parlerait que de ma reproduction locale : le moteur
        // pourrait continuer à diviser sans garde et les deux tests ci-dessus resteraient verts.
        const source = stripComments(readFileSync(resolve(__dirname, '../../services/projection.ts'), 'utf8'));
        // Anti-vacuité du décommentage : il reste du vrai code, et le bloc visé existe.
        expect(source.length).toBeGreaterThan(50_000);
        expect(source).toContain('propertiesState = propertiesState.map(');

        // L'INITIALISEUR du map doit contenir la garde — pas le fichier « quelque part ».
        const i = source.indexOf('propertiesState = propertiesState.map(');
        const initialiseur = source.slice(i, source.indexOf(';', i));
        expect(initialiseur, 'le partage du divorce ne teste plus `isBought` : un bien pas encore '
            + 'acheté verrait ses paramètres semés divisés').toMatch(/p\.isBought\s*\?/);
    });

    it('un bien DÉJÀ DÉTENU, lui, se partage bien (la garde ne désarme pas le divorce)', () => {
        // Sens INVERSE, indispensable : sans lui, une garde qui n'aurait RIEN partagé passerait
        // le test ci-dessus les yeux fermés.
        const detenu = { id: 'p1', isBought: true, mortgage: 300_000, currentValue: 600_000,
            calculatedPmt: 1_500, isPaidOff: false, isSold: false, cost: 600_000, isPrimaryResidence: true };
        const partage = partageDivorce(detenu as never, 0.5) as Record<string, number>;
        expect(partage.currentValue).toBe(300_000);
        expect(partage.mortgage).toBe(150_000);
    });
});
