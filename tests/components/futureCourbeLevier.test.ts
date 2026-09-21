// tests/components/futureCourbeLevier.test.ts
//
// [DETTE-LEVIER-EXPLICITE] La dette qui MONTE a enfin un nom, une courbe et une explication.
//
// Marc, 2026-09-21 : « Non la dette augmente à 150k alors que j'ai juste une dette auto qui fini en
// 2030 », puis, une fois la cause nommée : « Je veux que ce soit explicite et expliqué ».
//
// Il avait raison ET tort. Sa dette ORDINAIRE s'éteint bien en 2030 ; ce qui monte ensuite est le
// HELOC de la **Smith Manoeuvre**, que le réglage « Optimisations fiscales avancées » active en UN
// clic et dont le seul texte vivait dans un `title` (invisible au doigt et au lecteur d'écran).
// Deux dettes de NATURES OPPOSÉES — une qu'on rembourse, une qu'une stratégie CRÉE exprès pour
// investir — occupaient la même courbe et le même nombre : la seconde rendait la première
// illisible, et rien à l'écran ne disait laquelle montait.
//
// ⚠️ La garde ancre la RELATION, jamais des montants : `UN-RAPPORT-D-AGENT-N-EST-PAS-UNE-SOURCE`
// exige qu'un chiffre publié soit reproductible, et un golden se ferait re-baser au premier lot qui
// déplace de l'argent. Ce qui est ancré ici : le levier EXISTE sous Smith et vaut ZÉRO sans lui
// (contrôle négatif), il reste un SOUS-ENSEMBLE strict de la dette totale, et son effet sur le
// patrimoine CHANGE DE SIGNE avec le rendement — c'est ça, un levier.

import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';
import { FIELD_KIND, NET_WORTH_DAILY_ASSETS, buildDailyLedger } from '../../services/projection/dailyLedger';
import { FUTURE_LEGEND_ITEMS } from '../../components/future/seriesConfig';
import {
    detteLevierSousZero, phraseLevier, COULEUR_LEVIER, COULEUR_DETTE, LIBELLE_LEVIER,
    CHAMP_PAR_ACCESSEUR,
} from '../../components/future/detteSerie';
import { curveFieldsDuComposant, colonnesDeLaTable } from '../helpers/futureSource';
import { readCodeOnly } from '../helpers/source';
import { join } from 'node:path';

/* ───────────────────────────── ① Le moteur PUBLIE la part levier ───────────────────────────── */

const users = (): User[] => ([
    { name: 'Marc', grossSalary: 8_200, netSalary: 5_620, color: '#10b981', age: 30, birthYear: 1996, canadaArrivalYear: 1996, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[]);

/**
 * ⚠️ La fixture porte une maison EN RÉSIDENCE PRINCIPALE **et** un prêt auto. Les deux sont
 * indispensables, et pour des raisons différentes :
 *   • sans résidence principale, le levier n'ouvre JAMAIS (`goal.isPrimaryResidence` gate le bloc) —
 *     « aucun levier » serait vrai pour la mauvaise raison ;
 *   • sans une SECONDE dette, `DetteLevierSmith` vaudrait exactement `DettesNonImmo` partout, et
 *     « le levier est un sous-ensemble » serait satisfait par un câblage qui renvoie simplement la
 *     dette totale. MESURÉ : avec le prêt auto, **180 points** portent un levier STRICTEMENT
 *     inférieur à la dette totale.
 */
const params = (smith: boolean, rate: number): SimulationParams => ({
    projection: {
        years: 20, returnRate: rate, inflationRate: 2, savingsMode: 'manual', manualContribution: 1_000,
        usePortfolioRate: false, returnRates: { celi: rate, reer: rate, nonReg: rate, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
        useSmithManoeuvre: smith,
    } as unknown as ProjectionConfig,
    calculatedStartingCash: 150_000,
    liveCSVBalances: { CELI: 20_000, CELIAPP: 0, REER: 20_000, NON_ENREG: 120_000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [{
        id: 'p1', name: 'Maison', isActive: true, purchaseDate: '2027-03-01',
        price: 480_000, downPayment: 96_000, mortgageRate: 5, amortization: 25,
        totalClosingCosts: 0, monthlyPayment: 0, unrecoverableMonthly: 0, isPrimaryResidence: true,
    }] as unknown as SimulationParams['realEstateGoals'],
    debts: [{ id: 'd1', name: 'Auto', balance: 22_000, rate: 7, monthlyPayment: 450, isActive: true }] as unknown as SimulationParams['debts'],
    childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 62, targetMonthlyIncome: 4_000, governmentPension: 1_200, lifeExpectancy: 92, dbPensionMonthly: 0 } as unknown as RetirementGoal,
    config: { users: users(), splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: 98_400, baseNetAnnual: 67_440, currentRentExpense: 1_500,
    baseMonthlyExpenses: 3_000, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

/**
 * ⚠️ 3ᵉ argument positionnel = `enableMonteCarlo`, DÉFAUT `false` : c'est le chemin DÉTERMINISTE
 * que `calculateFutureProjection` publie, donc celui que Marc voit. Une garde posée sur l'autre
 * chemin protégerait quelqu'un qui n'existe pas (trou payé par `[SMITH-MARGE-SANS-DETTE]`).
 */
const run = (smith: boolean, rate = 6) => __runScenarioForTests(
    params(smith, rate), 'AUTO_MARGINAL' as AllocationStrategy, false, false, 0, 'BASE', {},
    { verboseMonthlyPoints: true },
) as unknown as { chartData: Array<Record<string, number>>; finalNetWorth: number };

describe('[DETTE-LEVIER-EXPLICITE] le moteur publie la part LEVIER à part', () => {
    it('Smith ON : la part levier existe · Smith OFF : elle vaut ZÉRO (contrôle négatif)', () => {
        const on = run(true).chartData.map((p) => Number(p.DetteLevierSmith));
        const off = run(false).chartData.map((p) => Number(p.DetteLevierSmith));

        // Anti-vacuité : le champ doit être PUBLIÉ sur tous les points des deux côtés — sinon
        // « zéro partout » serait vrai d'un champ jamais écrit, et la courbe serait muette.
        expect(on.length).toBeGreaterThan(200);
        expect(on.every(Number.isFinite), 'DetteLevierSmith non publié sur certains points').toBe(true);
        expect(off.every(Number.isFinite), 'DetteLevierSmith doit être publié même à zéro').toBe(true);

        // Le FAIT : sous Smith, une dette de levier naît et grossit (MESURÉ sur cette fixture :
        // 241 points non nuls, plafond 347 875 $ — non ancrés, ils bougeront au prochain lot).
        expect(on.filter((v) => v > 0).length).toBeGreaterThan(100);
        // Le CONTRÔLE NÉGATIF, qui est la moitié qui prouve : sans le réglage, pas un dollar.
        expect(off.every((v) => v === 0), 'sans Smith Manoeuvre, aucune dette de levier ne peut exister').toBe(true);
    });

    it('c’est un SOUS-ENSEMBLE de la dette, jamais un terme de plus', () => {
        const cd = run(true).chartData;
        // ⚠️ Ce que cette assertion empêche : publier le levier comme une dette SUPPLÉMENTAIRE le
        // ferait compter deux fois dans le patrimoine net (`NetWorth = Σ actifs − DettesNonImmo`).
        for (const p of cd) {
            const lev = Number(p.DetteLevierSmith);
            const tot = Number(p.DettesNonImmo);
            if (!Number.isFinite(lev) || !Number.isFinite(tot)) continue;
            expect(lev).toBeGreaterThanOrEqual(0);
            expect(lev).toBeLessThanOrEqual(tot + 0.01);
        }
        // …et STRICTEMENT inférieur là où une AUTRE dette coexiste : sans ce contrôle, un câblage
        // qui renverrait bêtement `DettesNonImmo` passerait le test ci-dessus. MESURÉ : 180 points.
        const strict = cd.filter((p) => Number(p.DetteLevierSmith) > 0
            && Number(p.DetteLevierSmith) < Number(p.DettesNonImmo) - 0.01).length;
        expect(strict, 'le levier vaut la dette totale partout — le champ recopie-t-il son conteneur ?').toBeGreaterThan(50);
    });

    it('c’est un LEVIER : son effet sur le patrimoine CHANGE DE SIGNE avec le rendement', () => {
        // ⚠️ C'est LA raison pour laquelle on ne retire pas le réglage et pour laquelle la phrase
        // affichée ne promet aucun gain. MESURÉ le 2026-09-21 sur cette fixture (marge au taux
        // `max(3 %, hypothèque + 2 pts)` = 7 %), écart de patrimoine final ON − OFF à 20 ans :
        //   3 % → **−51 794 $** · 4 % → −32 855 · 5 % → −12 344 · 6 % → **+9 829** · 8 % → +58 824
        // Reproduire : `run(true, r).finalNetWorth - run(false, r).finalNetWorth`.
        // Les BORNES seules sont ancrées (le signe), pas les montants : ils bougent à chaque lot.
        const delta = (r: number) => run(true, r).finalNetWorth - run(false, r).finalNetWorth;
        expect(delta(3), 'à 3 % de rendement, emprunter à ~7 % pour investir doit COÛTER').toBeLessThan(0);
        expect(delta(8), 'à 8 % de rendement, le levier doit RAPPORTER').toBeGreaterThan(0);
    });

    it('raccord au JOUR : le dernier jour du mois vaut EXACTEMENT la valeur du moteur', () => {
        // ⚠️ POURQUOI CE CAS VIT ICI et pas dans `tests/services/dailyLedger.test.ts`, où habite le
        // balayage des soldes : sa fixture « riche » n'active PAS `useSmithManoeuvre`, donc
        // `DetteLevierSmith` y vaut **0,00 $ sur les 6 mois** (mesuré le 2026-09-21). L'y inscrire
        // aurait ajouté une entrée à une liste sans rien protéger — `UNE-GARDE-NE-COUVRE-QUE-CE-QUE-
        // SA-FIXTURE-REND-NON-NUL`. Le champ y est donc déclaré HORS PÉRIMÈTRE **avec un renvoi
        // vers ce cas-ci**, et ce cas existe pour que ce renvoi ne soit pas un mensonge.
        const months = run(true).chartData as unknown as Array<Record<string, number>>;
        const days = buildDailyLedger({
            months: months as never, startYear: 2026, startMonth: 0,
            dated: { recurring: [], monthlyNetSalary: 5_620, monthlyDebtPayment: 450 },
        }) as unknown as Array<Record<string, number>>;

        expect(days.length).toBeGreaterThan(1_000);
        // Anti-vacuité : la ventilation porte VRAIMENT un levier non nul — sans ça, « le raccord
        // tient » serait vrai d'une série de zéros.
        expect(days.filter((d) => Number(d.DetteLevierSmith) > 0).length).toBeGreaterThan(500);

        // Le raccord : le DERNIER jour de chaque mois est la valeur du moteur, au cent près.
        let raccords = 0;
        for (let i = 0; i < days.length; i++) {
            const finDeMois = i + 1 >= days.length || days[i + 1].dayOfMonth === 1;
            if (!finDeMois) continue;
            const mois = months.find((m) => Number(m.monthIndex) === Number(days[i].hostMonthIndex));
            if (!mois || !Number.isFinite(Number(mois.DetteLevierSmith))) continue;
            raccords++;
            expect(Number(days[i].DetteLevierSmith), `raccord au ${days[i].dayIso}`)
                .toBeCloseTo(Number(mois.DetteLevierSmith), 2);
        }
        expect(raccords, 'aucun raccord mesuré — le balayage ne prouve rien').toBeGreaterThan(200);
    });

    it('le champ est classé au grand livre, et JAMAIS dans la recomposition du patrimoine', () => {
        expect(FIELD_KIND.DetteLevierSmith, 'un solde de marge est un STOCK, pas un flux').toBe('stock');
        // ⚠️ L'ajouter à `NET_WORTH_DAILY_ASSETS` le compterait en ACTIF ; l'y soustraire une
        // seconde fois doublerait la dette. Il n'a rien à y faire : son conteneur y est déjà.
        expect(NET_WORTH_DAILY_ASSETS).not.toContain('DetteLevierSmith');
    });
});

/* ──────────────────── ② La série existe PARTOUT où le graphe est représenté ──────────────────── */

describe('[DETTE-LEVIER-EXPLICITE] une série n’est pas un `<Line>`', () => {
    // `UN-LOT-QUI-AJOUTE-UNE-SERIE-DOIT-L-AJOUTER-PARTOUT-OU-LE-GRAPHE-EST-REPRESENTE` (2026-09-18) :
    // le lot précédent avait livré la courbe de dette SANS sa colonne de table ni son champ chez un
    // producteur. On énumère donc les représentations, au lieu de vérifier celle qu'on vient d'écrire.

    it('ventilation au JOUR : le champ est dans CURVE_FIELDS', () => {
        // Sans lui, la courbe serait tracée sur un champ que la ventilation allégée n'émet pas :
        // VERTE en test (qui ventile tout), MUETTE en prod (`CORRECTIF-VERT-EN-TEST-INERTE-EN-PROD`).
        expect(curveFieldsDuComposant().has('DetteLevierSmith')).toBe(true);
    });

    it('table `sr-only` : le champ a sa colonne', () => {
        // L'`aria-label` du graphe promet « les mêmes données ». Sans cette colonne, un lecteur
        // d'écran voit une dette qui monte sans pouvoir savoir POURQUOI.
        expect(colonnesDeLaTable()).toContain('DetteLevierSmith');
    });

    it('légende : présente, et impossible à confondre avec la dette qui la CONTIENT', () => {
        const levier = FUTURE_LEGEND_ITEMS.find((i) => i.key === 'DetteLevierSmith');
        expect(levier, 'série absente de la légende : elle serait intraçable ET non masquable').toBeTruthy();
        expect(levier!.label).toBe(LIBELLE_LEVIER);
        expect(levier!.color).toBe(COULEUR_LEVIER);

        // ⚠️ COULEUR **ET** FORME, les deux ancrées : n'en ancrer qu'une laisse un lot futur les
        // refondre par l'autre, et on retombe sur le défaut d'origine — deux grandeurs de sens
        // opposé dans la même case visuelle
        // (`UNE-PREMISSE-VISUELLE-DE-L-UTILISATEUR-SE-MESURE-AVANT-D-ETRE-SUIVIE`).
        const dette = FUTURE_LEGEND_ITEMS.find((i) => i.key === 'DettesNonImmo')!;
        expect(levier!.color).not.toBe(dette.color);
        expect(levier!.shape).not.toBe(dette.shape);
        // …ni avec l'impôt latent, l'autre série POINTILLÉE sous zéro (le piège de 2026-09-18).
        const latent = FUTURE_LEGEND_ITEMS.find((i) => i.key === 'ImpotLatent')!;
        expect(levier!.color).not.toBe(latent.color);
        // Anti-vacuité : la légende porte bien les autres séries.
        expect(FUTURE_LEGEND_ITEMS.length).toBeGreaterThan(10);
        expect(dette.color).toBe(COULEUR_DETTE);
    });

    it('le LIBELLÉ dit « dont » — c’est le mot qui empêche d’additionner', () => {
        // Un libellé qui dirait seulement « levier Smith » ferait lire deux dettes là où il n'y en
        // a qu'une : la source unique existe pour que les cinq surfaces ne divergent pas là-dessus.
        expect(LIBELLE_LEVIER.toLowerCase()).toContain('dont');
    });
});

/* ────────────────────────────── ③ La valeur tracée, et la phrase ────────────────────────────── */

describe('[DETTE-LEVIER-EXPLICITE] la valeur tracée', () => {
    it('un levier de 347 875 $ se trace à −347 875 : SOUS zéro, comme la dette qui le contient', () => {
        expect(detteLevierSousZero({ DetteLevierSmith: 347_875 })).toBe(-347_875);
    });

    it('zéro se trace à zéro (et jamais `-0`)', () => {
        expect(Object.is(detteLevierSousZero({ DetteLevierSmith: 0 }), 0)).toBe(true);
    });

    it('un champ ABSENT ou non fini rend `null`, JAMAIS zéro', () => {
        // ⚠️ Le levier n'existe pas dans le PASSÉ ni avant l'achat de la résidence. Tracer 0
        // AFFIRMERAIT « aucun levier » ; l'absence ne dit que « cette grandeur n'existe pas ».
        expect(detteLevierSousZero({})).toBeNull();
        expect(detteLevierSousZero({ DetteLevierSmith: NaN })).toBeNull();
        expect(detteLevierSousZero({ DetteLevierSmith: Infinity })).toBeNull();
        expect(detteLevierSousZero({ DetteLevierSmith: '347875' })).toBeNull();
        expect(detteLevierSousZero(null)).toBeNull();
        expect(detteLevierSousZero(undefined)).toBeNull();
    });
});

describe('[DETTE-LEVIER-EXPLICITE] la phrase qui explique', () => {
    it('elle ne parle QUE là où il y a un levier', () => {
        expect(phraseLevier({ DetteLevierSmith: 200_000 })).toBeTruthy();
        // Une explication permanente devient du décor qu'on cesse de lire.
        expect(phraseLevier({ DetteLevierSmith: 0 })).toBeNull();
        expect(phraseLevier({})).toBeNull();
    });

    it('elle ne porte AUCUN montant — sinon elle ne serait plus masquable', () => {
        // ⚠️ `UN-MONTANT-INTERPOLE-DANS-UNE-CHAINE-N-EST-PLUS-UN-NOEUD` : une fois dans la phrase,
        // aucun `<PrivateAmount>` ne peut l'envelopper, donc le mode discret le laisserait en clair.
        const p = phraseLevier({ DetteLevierSmith: 200_000 })!;
        expect(p).not.toMatch(/\d/);
        // Anti-vacuité de l'assertion ci-dessus : la phrase EXISTE et dit bien le mécanisme.
        expect(p.length).toBeGreaterThan(80);
        expect(p.toLowerCase()).toContain('smith');
    });
});

/* ─────────────────── ④ La table accesseur → champ ne peut pas MENTIR ─────────────────── */

describe('[DETTE-LEVIER-EXPLICITE] CHAMP_PAR_ACCESSEUR dit la vérité', () => {
    it('chaque accesseur lit bien le champ que la table lui prête', () => {
        // ⚠️ Cette table est ce qui rend vérifiable une série tracée par `dataKey={fonction}` —
        // forme totalement invisible à la garde `[FUTUR-DAILY-NATIVE]`, qui ne lisait que
        // `dataKey="…"`. Une entrée FAUSSE serait pire qu'aucune : elle certifierait « couvert » un
        // champ qui ne l'est pas. On relit donc le corps de chaque accesseur, source DÉCOMMENTÉE
        // (un champ cité dans un commentaire ne prouve rien — `SCAN-QUI-MATCHE-LA-PROSE`).
        // ⚠️ Seuil 0,12, ni le 0,2 par défaut ni le 0,35 de `FutureProjection.tsx` : MESURÉ le
        // 2026-09-21, `detteSerie.ts` est à **0,159** de code non blanc — c'est un module de ~30
        // lignes de code sous ~80 lignes d'explication, par conception (c'est LUI qui porte
        // l'histoire des deux dettes). Un seuil recopié d'une autre portée aurait fait échouer une
        // garde saine (`UN-SEUIL-D-ANTI-VACUITE-APPARTIENT-A-LA-PORTEE-QU-IL-MESURE`, 2ᵉ fois pour
        // cette classe). Re-mesurer : l'échec IMPRIME la part réelle, il n'y a rien à calculer.
        const src = readCodeOnly(join(__dirname, '../../components/future/detteSerie.ts'), 'COULEUR_DETTE', 0.12);
        expect(src).not.toContain('impôt HYPOTHÉTIQUE'); // témoin de prose : le décommentage a eu lieu

        const noms = Object.keys(CHAMP_PAR_ACCESSEUR);
        expect(noms.length).toBeGreaterThanOrEqual(2); // anti-vacuité : la table n'est pas vide
        for (const nom of noms) {
            const corps = src.match(new RegExp(`export function ${nom}\\([\\s\\S]*?\\n\\}`));
            expect(corps, `accesseur ${nom} introuvable dans detteSerie.ts`).toBeTruthy();
            expect(corps![0], `${nom} ne lit PAS ${CHAMP_PAR_ACCESSEUR[nom]} : la table ment`)
                .toContain(CHAMP_PAR_ACCESSEUR[nom]);
        }
    });
});
