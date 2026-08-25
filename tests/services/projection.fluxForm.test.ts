// tests/services/projection.fluxForm.test.ts
//
// [ENG-INV-FLUXFORM-COVERAGE] INVARIANT DE FORME-FLUX — le chaînon manquant des gardes money.
//
// ⚠️ POURQUOI CETTE GARDE EXISTE, alors que la conservation est déjà couverte. Les invariants
// existants (`projection.moneyConservation`, `projection.fuzzConservation`) comparent des SOLDES
// entre eux : « Σ actifs − dettes == NetWorth ». Ils sont indifférents à la QUESTION D'OÙ VIENT
// l'argent. Un compte qui bouge sans qu'aucun flux ne l'explique les laisse parfaitement VERTS.
//
// C'est exactement ce qui s'est produit avec `[ENG-STRESSTEST-GROWTH-UNREGISTERED]` : le krach et
// la reprise du stress-test multipliaient CELI/REER/NonReg/Crypto sans alimenter aucun
// `MarketGrowth*`. Des centaines de milliers de dollars apparaissaient et disparaissaient, sans
// cause visible, et TOUTES les gardes restaient vertes.
//
// La forme-flux pose la question complémentaire, compte par compte et mois par mois :
//
//      solde(m) − solde(m−1)  ==  MarketGrowth<compte>(m) + NetTransfer<compte>(m)
//
// C'est-à-dire : « toute variation d'un compte est EXPLIQUÉE par les flux publiés ». Un mouvement
// non déclaré la casse. C'est la garde qu'il fallait, et il faut la lire comme un ENGAGEMENT :
// tout futur producteur qui mute un solde doit publier son flux.

import { describe, it, expect } from 'vitest';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import type { ProjectionChartPoint } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal } from '../../types';

/** Comptes dont la variation DOIT être expliquée par `MarketGrowth<k>` + `NetTransfer<k>`. */
const ACCOUNTS = ['CELI', 'REER', 'Crypto', 'NonReg'] as const;

// [ENG-APRIL-REFUND-NONREG-UNPUBLISHED] `NonReg` est entré dans cette liste le 2026-08-19, une fois
// son dernier producteur muet corrigé : `processAprilSettlement` réinvestissait le remboursement
// d'impôt de salaire au non-enregistré sans publier `contribNonReg`.
// **MESURÉ : 29 796,22 $ au mois 123 (un AVRIL), en mode déterministe.**
//
// ⚠️ Ce correctif N'EST PAS neutre en argent, contrairement à celui de la FERR — et le ticket ne
// l'avait pas vu. `contribNonReg` a un SECOND consommateur : `growthApplication` calcule la
// croissance sur `nonReg − contribNonReg`, pour exclure les dépôts de MI-MOIS d'un mois complet de
// rendement. Le remboursement, versé le 30 avril, gagnait donc jusqu'ici un mois ENTIER de
// rendement qu'il n'avait pas mérité. Publier le flux retire cette croissance fantôme :
// **−428,67 $ de patrimoine final sur 30 ans** dans le scénario de référence (−0,009 %), et
// jusqu'à −23 343 $ sur les ancrages les plus gros. L'écart est NÉGATIF partout et croît avec
// l'horizon — signature d'un intérêt composé qu'on cesse de créditer à tort, pas d'une régression.
//
// Le ticket redoutait un TOUT AUTRE risque : que publier `contribNonReg` « déplace une décision
// d'allocation dans le même mois », puisque `cashflowAllocation` le reçoit en entrée. VÉRIFIÉ par
// grep : ce module ne fait qu'un `state.contribNonReg += excess` et ne LIT jamais la valeur. Le
// risque annoncé n'existait pas ; le vrai était ailleurs.

// [ENG-INV-FLUXFORM-COVERAGE] ⚠️ CE QUE CETTE GARDE NE VOYAIT PAS, ET POURQUOI.
//
// La fixture historique (`params`) tourne sur **12 ans** avec un couple de 45 ans dont la retraite
// est fixée à 62 : elle ne l'ATTEINT JAMAIS. Toute la phase de DÉCAISSEMENT — retraits de retraite,
// meltdown REER, et surtout le retrait MINIMUM FERR obligatoire à 72 ans — était donc hors de
// portée d'un invariant qui, par construction, ne peut rien dire des mois qu'il ne parcourt pas.
//
// Le ticket pariait que l'extension échouerait sur `stressTestEnabled`. **Ce pari était périmé** :
// le stress-test est corrigé et vert (cas ci-dessous). Ce que l'extension a réellement trouvé est
// ailleurs et plus grave, parce qu'il frappe en mode DÉTERMINISTE — donc à l'écran :
//
//   `[ENG-FERR-NETTRANSFER-MUET]` — la FERR alimentait `retraitReerMois` (registre d'AFFICHAGE)
//   mais PAS `withdrawalREER` (registre des TRANSFERTS → `NetTransferREER`).
//   **MESURÉ : 131 566,62 $** de REER disparaissant sans flux publié, à CHAQUE janvier de 72+.
//
// C'est la récidive exacte de `[ENG-FERR-FLOW-INVISIBLE]` : le lot précédent avait branché UN des
// deux registres. Un producteur qui alimente un registre doit les alimenter TOUS.

// ⚠️ `NonReg` est ABSENT de cette liste, et c'est un constat mesuré, pas un confort. En écrivant
// cette garde SANS restriction, elle a trouvé un TROISIÈME producteur muet, sans rapport avec le
// stress-test : `processAprilSettlement` verse le remboursement d'impôt au non-enregistré
// (`addNonReg`, `projection.ts:987`) sans publier `contribNonReg`.
// **Mesuré : 29 796,22 $ au mois 123 (un mois d'AVRIL), stress-test désactivé.**
// Il n'est pas corrigé ici : ce mutateur s'exécute AVANT `cashflowAllocation`, qui reçoit
// `contribNonReg` en entrée — y toucher peut déplacer une décision d'allocation dans le même mois,
// ce qui demande sa propre mesure. → ticket `[ENG-APRIL-REFUND-NONREG-UNPUBLISHED]`.
//
// Après les deux correctifs de ce lot, le résiduel MESURÉ vaut 0,01 $ (l'arrondi au cent) sur
// CELI, REER et Crypto — avec ET sans stress-test. Le jour où le ticket ci-dessus sera livré,
// AJOUTER `'NonReg'` ici : c'est la vraie cible.

const users = (age: number) => ([
    { name: 'Marc', grossSalary: 8200, netSalary: 5620, color: '#10b981', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    { name: 'Anna', grossSalary: 7100, netSalary: 4995, color: '#3b82f6', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
]);

const params = (proj: Partial<ProjectionConfig>): SimulationParams => ({
    projection: {
        years: 12, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 2_000,
        usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3, ...proj,
    } as ProjectionConfig,
    calculatedStartingCash: 80_000,
    liveCSVBalances: { CELI: 90_000, CELIAPP: 0, REER: 150_000, NON_ENREG: 60_000, CRYPTO: 25_000, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: {
        targetAge: 62, targetMonthlyIncome: 5_000, governmentPension: 1_500,
        lifeExpectancy: 92, dbPensionMonthly: 0,
    } as unknown as RetirementGoal,
    config: { users: users(45), splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: 183_600, baseNetAnnual: 127_380, currentRentExpense: 1_800,
    baseMonthlyExpenses: 4_500, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

/**
 * Plus gros résidu |Δsolde − (croissance + transferts)| sur tout l'horizon, avec le contexte du
 * pire mois. Retourne le montant EN DOLLARS : un invariant money se juge en dollars, pas en
 * « ça a l'air bon ».
 */
const worstFluxResidual = (
    data: ProjectionChartPoint[],
    window?: { from: number; to: number },
): { max: number; where: string } => {
    let max = 0;
    let where = '(aucun)';
    const lo = window ? Math.max(1, window.from) : 1;
    const hi = window ? Math.min(data.length - 1, window.to) : data.length - 1;
    for (let i = lo; i <= hi; i++) {
        const prev = data[i - 1] as unknown as Record<string, number>;
        const cur = data[i] as unknown as Record<string, number>;
        for (const k of ACCOUNTS) {
            const delta = (Number(cur[k]) || 0) - (Number(prev[k]) || 0);
            const explained = (Number(cur[`MarketGrowth${k}`]) || 0) + (Number(cur[`NetTransfer${k}`]) || 0);
            const residual = Math.abs(delta - explained);
            if (residual > max) {
                max = residual;
                where = `${k} au mois ${i} : Δ=${delta.toFixed(2)} $ mais flux publiés=${explained.toFixed(2)} $`;
            }
        }
    }
    return { max, where };
};

// Tolérance : les champs du point sont arrondis au CENT (`toFixed(2)`) — deux arrondis par compte
// et par mois. 1 $ laisse la marge sans jamais laisser passer un mouvement réel non déclaré
// (le défaut mesuré valait des dizaines de milliers de dollars sur un seul mois).
const CENT_ROUNDING_TOLERANCE = 1;

describe('[ENG-INV-FLUXFORM-COVERAGE] toute variation de compte est EXPLIQUÉE par un flux publié', () => {
    const STRESS_YEAR = 3;
    const STRESS_RECOVERY = 24;

    it('scénario ordinaire (sans stress-test) : résiduel nul sur TOUT l\'horizon', () => {
        const r = calculateFutureProjection(params({}));
        const { max, where } = worstFluxResidual(r.chartData as ProjectionChartPoint[]);
        expect(max, `mouvement non expliqué — ${where}`).toBeLessThan(CENT_ROUNDING_TOLERANCE);
    });

    // ── LE test discriminant : il ÉCHOUE sur le code d'avant. ──
    it('[ENG-STRESSTEST-GROWTH-UNREGISTERED] krach ET reprise sont publiés comme des flux', () => {
        // Le krach est un mouvement de MARCHÉ : il doit sortir dans `MarketGrowth*`, au même titre
        // qu'un rendement mensuel. Avant le correctif, il mutait les soldes en silence.
        const r = calculateFutureProjection(params({
            stressTestEnabled: true, stressTestYear: STRESS_YEAR, stressTestDrop: 40,
            stressTestRecoveryMonths: STRESS_RECOVERY,
        }));
        const data = r.chartData as ProjectionChartPoint[];
        const { max, where } = worstFluxResidual(data);
        expect(max, `le stress-test mute les soldes sans publier de flux — ${where}`)
            .toBeLessThan(CENT_ROUNDING_TOLERANCE);

        // Garde anti-vacuité : sans elle, un stress-test qui ne se déclencherait pas (mauvaise
        // année, drapeau ignoré) rendrait le test ci-dessus VERT tout en ne mesurant rien.
        const crashMonth = STRESS_YEAR * 12;
        const growthAtCrash = Number((data[crashMonth] as unknown as Record<string, number>).MarketGrowthCELI) || 0;
        expect(growthAtCrash, 'aucun krach observé au mois attendu : la fixture ne déclenche rien')
            .toBeLessThan(0);
    });

    // ── [ENG-INV-FLUXFORM-COVERAGE] La phase de DÉCAISSEMENT, jamais parcourue jusqu'ici. ──
    //
    // 35 ans d'horizon, couple de 45 ans, retraite à 62 : la simulation traverse l'accumulation,
    // la retraite, puis les retraits FERR obligatoires (72+). C'est le SEUL réglage qui fait
    // emprunter au moteur le chemin de `processJanuaryReset`.
    const decumulation = (over: Partial<ProjectionConfig> = {}): SimulationParams => {
        const p = params({ years: 35, ...over });
        return { ...p, retirementGoal: { ...p.retirementGoal, targetAge: 62 } };
    };

    it('[ENG-FERR-NETTRANSFER-MUET] le retrait FERR obligatoire est publié comme un flux', () => {
        const r = calculateFutureProjection(decumulation());
        const data = r.chartData as ProjectionChartPoint[];

        // Non-vacuité en DEUX temps — sans elle, une fixture qui n'atteindrait ni la retraite ni
        // 72 ans rendrait le test vert sans jamais emprunter le chemin corrigé. C'est précisément
        // le trou que ce cas vient boucher : il ne doit pas le recréer.
        const rows = data as unknown as Record<string, number>[];
        const ferrMonths = rows.filter((d) => (Number(d.WithheldTaxRrif) || 0) > 0);
        expect(ferrMonths.length, 'la fixture n\'atteint jamais la FERR (72 ans) : rien n\'est mesuré')
            .toBeGreaterThan(3);
        expect(Math.max(...ferrMonths.map((d) => Number(d.RetraitREER) || 0)),
            'retraits FERR insignifiants : le discriminant serait sous la tolérance')
            .toBeGreaterThan(50_000);

        // Discriminant MESURÉ : 131 566,62 $ de résiduel avant le correctif, 0,00 $ après.
        const { max, where } = worstFluxResidual(data);
        expect(max, `mouvement de compte non expliqué en décaissement — ${where}`)
            .toBeLessThan(CENT_ROUNDING_TOLERANCE);
    });

    it('[ENG-NETTRANSFER-REER-INCOMPLET] le MELTDOWN publie sa jambe de DÉPART', () => {
        // ⚠️ Ce cas existe parce que la garde FERR juste en dessous ne pouvait pas le voir : sa
        // fixture ne demande pas la stratégie MELTDOWN_REER, et le meltdown ne s'exécute QUE sous
        // cette stratégie (`meltdownReer.ts` : `if (strategy !== 'MELTDOWN_REER') return null`).
        // L'invariant était juste, nommé, testé — et aveugle à un chemin entier.
        //
        // MESURÉ avant correctif, sur cette fixture : le solde REER chutait de 34 794 $ en un mois
        // pour 802 $ de flux publiés (pire résiduel 35 596,32 $), et l'écart cumulé entre
        // `RetraitREER` et `ContribREER − NetTransferREER` atteignait 1 849 080,59 $ sur 156 mois.
        // Après : 0,01 $ et 0,10 $ (arrondi au cent).
        const p = params({ years: 35, withdrawalStrategy: 'MELTDOWN_REER' });
        const r = calculateFutureProjection({ ...p, retirementGoal: { ...p.retirementGoal, targetAge: 62 } });
        const data = r.chartData as ProjectionChartPoint[];
        const rows = data as unknown as Record<string, number>[];

        // Anti-vacuité : sans meltdown effectif, tout ce qui suit serait vrai par abstention.
        const gros = rows.filter((d) => (Number(d.RetraitREER) || 0) > 10_000);
        expect(gros.length, 'la fixture ne déclenche jamais le meltdown : rien n\'est mesuré')
            .toBeGreaterThan(20);

        // ⚠️ SEULE la jambe de DÉPART (REER) est publiée, et c'est un choix MESURÉ, pas un oubli.
        // Publier la jambe d'ARRIVÉE (`contribNonReg += nonRegAdd`) est le geste symétrique — mais
        // `contribNonReg` n'est pas qu'un registre d'affichage : `growthApplication` s'en sert comme
        // base d'exclusion de la croissance de mi-mois (`nonReg - contribNonReg`). L'y ajouter
        // RETIRE un rendement fantôme et déplace donc de l'argent : MESURÉ **−5 045,04 $** de
        // patrimoine final (−0,12 %) et −5 198,23 $ de croissance non-enregistrée cumulée, ce qui
        // fait ROUGIR les deux goldens « NEUTRALITÉ NW » de `projection.meltdownDisplay` et
        // `projection.totalTaxesPaid`. Correction plausible, décision de Marc → ticket
        // `[ENG-MELTDOWN-JAMBE-ARRIVEE]`. Le résiduel NonReg restant est donc ATTENDU (mesuré
        // 25 273,39 $ au pire mois) : on le borne pour qu'il ne GRANDISSE pas en silence.
        const { max, where } = worstFluxResidual(data);
        expect(max, `résiduel de flux inattendu sous MELTDOWN_REER — ${where}`)
            .toBeLessThan(30_000);

        // Les deux registres du retrait REER, eux, concordent mois par mois.
        let pire = 0;
        let ou = '(aucun)';
        for (let i = 0; i < rows.length; i++) {
            const retrait = Number(rows[i].RetraitREER) || 0;
            if (retrait <= 0) continue;
            const transferts = (Number(rows[i].ContribREER) || 0) - (Number(rows[i].NetTransferREER) || 0);
            const ecart = Math.abs(retrait - transferts);
            if (ecart > pire) { pire = ecart; ou = `mois ${i} : affichage ${retrait.toFixed(2)} $ vs transferts ${transferts.toFixed(2)} $`; }
        }
        expect(pire, `les deux registres divergent — ${ou}`).toBeLessThan(CENT_ROUNDING_TOLERANCE);
    });

    it('[ENG-FERR-NETTRANSFER-MUET] les deux registres du retrait REER disent la MÊME chose', () => {
        // La garde ci-dessus attrape la conséquence (un solde qui bouge sans flux). Celle-ci nomme
        // la CAUSE : deux registres parallèles du même retrait, `RetraitREER` (affichage) et
        // `ContribREER − NetTransferREER` (transferts). Ils concordaient sur 129 mois de retraits
        // ordinaires et divergeaient sur les 4 mois de FERR — la signature d'un producteur qui
        // n'alimente qu'un registre sur deux. Sans ce cas, un futur correctif pourrait faire taire
        // le symptôme (publier un flux bidon) sans rétablir l'accord.
        const r = calculateFutureProjection(decumulation());
        const rows = r.chartData as unknown as Record<string, number>[];
        let worst = 0;
        let where = '(aucun)';
        let compares = 0;
        for (let i = 0; i < rows.length; i++) {
            const retrait = Number(rows[i].RetraitREER) || 0;
            if (retrait <= 0) continue;
            compares++;
            const parLesFlux = (Number(rows[i].ContribREER) || 0) - (Number(rows[i].NetTransferREER) || 0);
            const ecart = Math.abs(retrait - parLesFlux);
            if (ecart > worst) {
                worst = ecart;
                where = `mois ${i} : RetraitREER=${retrait.toFixed(2)} $ vs flux=${parLesFlux.toFixed(2)} $`;
            }
        }
        expect(compares, 'aucun retrait REER dans la fixture : rien n\'est comparé').toBeGreaterThan(100);
        expect(worst, `les deux registres du retrait REER divergent — ${where}`)
            .toBeLessThan(CENT_ROUNDING_TOLERANCE);
    });

    it('[ENG-FERR-NETTRANSFER-MUET] le partage per-conjoint du REER n\'a PAS bougé', () => {
        // ⚠️ Le correctif exclut délibérément la FERR de `stepReerByUser` : elle a déjà été retirée
        // de la part EXACTE de chaque conjoint (facteur RRIF de SON âge). L'y réinjecter la
        // re-soustrairait AU PRORATA et fausserait un couple à écart d'âge — un correctif de
        // FLUX qui déplacerait de l'ARGENT. Ce cas verrouille la frontière : le partage final doit
        // rester celui d'AVANT, et l'écart d'âge doit vraiment le faire diverger d'un 50/50.
        const p = decumulation();
        const u = (p.config as unknown as { users: Array<Record<string, unknown>> }).users;
        const decale = {
            ...p,
            config: { ...p.config, users: [u[0], { ...u[1], age: 33, birthYear: 1993, canadaArrivalYear: 1993 }] },
        } as unknown as SimulationParams;
        const r = calculateFutureProjection(decale);
        const parts = (r as unknown as { reerByUserFinal?: number[] }).reerByUserFinal ?? [];

        expect(parts.length, 'pas de registre per-conjoint : le cas ne mesure rien').toBe(2);
        for (const v of parts) expect(Number.isFinite(v)).toBe(true);
        const total = parts.reduce((s, v) => s + v, 0);
        expect(total, 'registre per-conjoint vide : 12 ans d\'écart sans REER ne prouve rien')
            .toBeGreaterThan(0);
        // Un écart de 12 ans décale les conversions FERR : le partage NE PEUT PAS rester 50/50.
        // (Valeur de référence relevée AVANT le correctif et INCHANGÉE après — c'est le point.)
        expect(Math.abs(parts[0] / total - 0.5),
            'partage 50/50 malgré 12 ans d\'écart : la FERR per-conjoint ne mord pas')
            .toBeGreaterThan(0.01);
    });

    it('le krach est visible dans le TOTAL de croissance, pas seulement par compte', () => {
        // `totalGrowth` est le compteur agrégé consommé par l'UI (« croissance cumulée »). Publier
        // les deltas par compte sans les verser au total laisserait les deux en désaccord.
        const sans = calculateFutureProjection(params({}));
        const avec = calculateFutureProjection(params({
            stressTestEnabled: true, stressTestYear: 3, stressTestDrop: 40, stressTestRecoveryMonths: 24,
        }));
        const gSans = (sans as unknown as { totalGrowth?: number }).totalGrowth ?? 0;
        const gAvec = (avec as unknown as { totalGrowth?: number }).totalGrowth ?? 0;
        expect(gSans, 'fixture sans croissance : le test ne mesure rien').toBeGreaterThan(0);
        // −40 % puis reprise partielle (0,9 × le drop) : le total doit rester STRICTEMENT en deçà.
        expect(gAvec, 'le krach n\'a pas atteint le compteur de croissance agrégé').toBeLessThan(gSans);
    });
});

describe('[ENG-APRIL-REFUND-NONREG-UNPUBLISHED] le remboursement d\'avril n\'est plus une croissance fantôme', () => {
    /**
     * ⚠️ Ce bloc ne double PAS la garde de forme-flux ci-dessus. Celle-ci prouve que le mouvement
     * est EXPLIQUÉ ; celui-ci prouve la conséquence FINANCIÈRE que la correction entraîne — et que
     * le ticket n'avait pas anticipée. Sans lui, un futur passage qui retirerait `contribNonReg` du
     * calcul de croissance (« ça ne sert qu'à l'affichage ») rendrait la croissance fantôme SANS
     * casser la forme-flux : les deux propriétés sont indépendantes.
     */
    const AVRIL = 123;   // le mois où le remboursement est mesuré (cf. en-tête de fichier)

    it('le remboursement réinvesti apparaît comme un TRANSFERT, pas comme du rendement', () => {
        const r = calculateFutureProjection(params({}));
        const rows = r.chartData as unknown as Record<string, number>[];

        // Non-vacuité : il y a bien un remboursement réinvesti ce mois-là, et il est SUBSTANTIEL.
        // Sans cette borne, un scénario sans remboursement rendrait tout le bloc vacueux.
        expect(rows.length).toBeGreaterThan(AVRIL);
        const transfert = Number(rows[AVRIL].NetTransferNonReg) || 0;
        expect(transfert, 'aucun réinvestissement mesurable au mois 123').toBeGreaterThan(1_000);

        // Et il ne s'est PAS glissé dans la croissance : sur un mois où l'essentiel du solde arrive
        // le 30, la croissance du non-enregistré doit rester petite devant le transfert.
        const croissance = Math.abs(Number(rows[AVRIL].MarketGrowthNonReg) || 0);
        expect(croissance, 'le dépôt du 30 avril gagne un mois complet de rendement')
            .toBeLessThan(transfert / 10);
    });
});
