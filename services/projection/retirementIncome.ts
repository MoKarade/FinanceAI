// services/projection/retirementIncome.ts
// Cycle 13: calcul du revenu de retraite mensuel (RRQ + PSV + DB).
// Pure function: aucun side effect. Retourne RetirementIncomeBreakdown
// avec le total ET le split par source (Phase 3 Tier 3 — split pensions).

import type { RetirementGoal, User } from '../../types';
import { RRQ_MPE, calculateGISBenefit, rrqAdjustmentFactor, psvDeferralFactor, PSV_BONUS_75_PLUS, CAPITAL_GAINS_INCLUSION_STANDARD, GOV_PENSION_RRQ_SHARE, GOV_PENSION_PSV_SHARE, getResidencyStartYear } from '../../utils/tax';

// Constantes RRQ/PSV 2026 (Retraite Québec + Service Canada) — règles documentées
// FISCAL_REFERENCE §6 « Prorata RRQ / résidence PSV » (FA-8, 2026-06-11).
// RRQ — approximation de MODÈLE « 39 meilleures années » : la rente officielle = moyenne des
// gains ajustés sur la période cotisable (18 ans → début de rente, ≈ 47 ans à 65 ans) avec
// retranchement de 15 % des mois les plus faibles (Retraite Québec) ≈ conserver 39 années
// (8/47 retirées). Le moteur fait : prorata = min(1, années au Canada 18→targetAge / 39)
// × min(1, salaire/MGA) (salaire et MGA projetés au même facteur, cf B-AUDIT-4 plus bas).
const RRQ_DENOMINATOR_YEARS = 39;
// PSV — règle OFFICIELLE de résidence (Service Canada) : admissible dès 10 ans de résidence au
// Canada après 18 ans (versement au Canada) ; pension PLEINE à 40 ans ; entre les deux, prorata
// en 40es. < 10 ans → 0 $.
const PSV_MIN_RESIDENCY_YEARS = 10;
const PSV_FULL_RESIDENCY_YEARS = 40;
// (facteurs de report/anticipation RRQ/PSV + bonus 75+ : source unique utils/tax.ts)

export interface RetirementIncomeCtx {
    m: number;
    age: number;
    simInflation: number;
    activeUsersCount: number;
    baseGrossAnnual: number;
    delayPensions: boolean;
    survivorMode: boolean;
    monthlyOasReduction: number;
    dbSurvivorPct: number;
    rrqSurvivorPct: number;
    psvResidencyYears: number[];
    startYear: number;  // pour calcul arrivalAge depuis canadaArrivalYear
    /**
     * [ENG-DIVORCE, panel #613 — ÉLEVÉ-1] Part du ménage qui reste au déclarant, pour les rentes
     * exprimées comme un montant MÉNAGE non ventilé — aujourd'hui la seule concernée est la DB
     * (`dbPensionMonthly`, documentée « cumulée pour le couple », cf. l. ~108). Défaut `1`.
     *
     * ⚠️ Pourquoi ce champ EXISTE alors qu'on pourrait croire qu'il suffit de réduire
     * `activeUsersCount` : RRQ et PSV se réduisent, eux, en passant simplement une liste d'users
     * plus courte, parce qu'ils sont calculés en `(base_ménage / activeUsersCount) × poids_i`
     * sommé sur les users. Toucher AUSSI `activeUsersCount` ANNULE la réduction — le `/N` est un
     * diviseur de l'agrégat ménage, pas un compteur de bénéficiaires. C'est l'erreur exacte du
     * premier correctif : `activeUsersCount: 1` + 1 seul user ⇒ Δ rentes mesuré = 0,00 $/mois, et
     * même +398 $/mois avec des salaires inégaux (le divorce ENRICHISSAIT).
     * La DB, elle, n'est divisée par RIEN dans `dbMonthly` : il lui faut ce facteur explicite.
     */
    householdPensionShare?: number;
    /**
     * [ENG-DIVORCE, panel re-revue] Nombre d'ADULTES vivant dans le ménage — pour le SRG
     * UNIQUEMENT. Défaut : `activeUsersCount` (donc aucun changement pour tous les appelants
     * existants ; la rétrocompat est bit-identique).
     *
     * ⚠️ Troisième compteur du fichier, et c'est VOULU : `activeUsersCount` est un DIVISEUR
     * d'agrégat, `householdPensionShare` une part de montant ménage, et celui-ci un vrai NOMBRE DE
     * TÊTES. Le SRG est la seule prestation dont le barème dépend de la composition du ménage
     * (célibataire vs couple), et il la lit deux fois : le barème appliqué, et le nombre de
     * prestations versées. Le divorce n'y arrivait par aucune des deux autres voies — la liste
     * d'users raccourcie ne l'atteint pas non plus, puisque ces lignes ne bouclent pas sur `users`.
     *
     * ⚠️ Distinct de `survivorMode`, qui reste réservé au DÉCÈS : un divorcé n'a droit à aucune
     * prestation de survivant (RRQ réversible, PSV, DB du conjoint). Ce champ ne touche QUE les
     * têtes du SRG.
     *
     * Mesuré avant correctif : un divorcé était testé au barème COUPLE sur le revenu FAMILIAL puis
     * la prestation était versée ×2 têtes → 1 219,28 $/mois rendus contre 1 052,64 $ corrects, une
     * valeur qui DÉPASSE le maximum légal célibataire. Sur 25 ans, le ménage à UNE tête encaissait
     * 50 346 $ de SRG de plus que le couple intact : le divorce enrichissait, dans la fonction même
     * que le lot prétendait corriger.
     */
    householdAdults?: number;
    /**
     * FA-3b (audit fiscal 2026-06-09) — revenu imposable AUTRE de l'ANNÉE PRÉCÉDENTE
     * (retraits REER/FERR + revenus locatifs), en dollars NOMINAUX. Le vrai SRG est calculé
     * sur le revenu de l'année d'imposition précédente : l'ignorer affichait un SRG fictif
     * (jusqu'à ~13 k$/an) pour les profils FIRE/meltdown qui vivent de retraits REER.
     * Optionnel (absent → comportement RRQ+DB seul, rétro-compat).
     */
    otherIncomeAnnualLaggedNominal?: number;
    /**
     * PV-9 (2026-06-10) — gains en capital RÉALISÉS de l'année PRÉCÉDENTE, en dollars NOMINAUX
     * et BRUTS (avant inclusion 50 %). À l'ARC, le gain imposable (×0,5) entre dans le revenu net
     * (ligne 23400) qui sert au test SRG : l'omettre surévalue le SRG d'un 65+ bas revenu qui a
     * réalisé des gains (NonReg/crypto, levier `gainHarvesting`). L'inclusion 50 % est appliquée ici.
     * Optionnel (absent → 0, rétro-compat).
     */
    prevYearCapitalGainsForGisNominal?: number;
}

/**
 * Détail du revenu de retraite par source. Le `total` est le montant
 * mensuel net (après écrêtement PSV) qui était retourné historiquement.
 * Les composantes individuelles sont exposées pour permettre aux onglets
 * (Retirement.tsx, TaxCenter.tsx) d'afficher le split sans recalculer.
 *
 * Phase 3 Tier 3 (2026-05-21) : avant ce refactor, computeRetirementIncome
 * retournait `number` (juste le total). Les onglets ne pouvaient pas afficher
 * "RRQ : 1200\$ / PSV : 700\$ / DB : 500\$" sans dupliquer le calcul.
 */
/**
 * Revenu de retraite mensuel ATTRIBUABLE à un conjoint donné (avant clamp).
 * A1 (impôt par conjoint) : la RRQ et la PSV dépendent de l'historique de salaire
 * et de la résidence de CHAQUE personne — donc elles sont attribuables par conjoint.
 * Les composantes non attribuables au modèle actuel (pension privée DB « cumulée
 * pour le couple », SRG calculé au niveau familial) sont réparties également.
 */
export interface RetirementIncomePerUser {
    /** Revenu de retraite total de ce conjoint (rrq + psv + privée − part écrêtement). */
    total: number;
    /** RRQ attribuable à ce conjoint (selon SON ratio salaire/MGA et SA résidence). */
    rrq: number;
    /** PSV + part du SRG (le SRG est familial → réparti également). */
    psv: number;
    /** Part de la pension privée DB (household → réparti également, faute de donnée par conjoint). */
    privee: number;
}

export interface RetirementIncomeBreakdown {
    /** Revenu mensuel total après écrêtement PSV. = ce que retournait le legacy `number`. */
    total: number;
    /** Rentes RRQ (Régime de rentes du Québec / RPC). */
    rrq: number;
    /** Pension de la Sécurité de la vieillesse + SRG (Supplément revenu garanti). */
    psv: number;
    /** Régimes à prestations déterminées (pensions privées). */
    privee: number;
    /** Écrêtement PSV pour revenus > seuil (montant déduit). */
    oasReduction: number;
    /**
     * FA-3a — SRG mensuel familial (déjà inclus dans `psv` et `total` : c'est du REVENU).
     * Exposé séparément parce que le SRG est NON IMPOSABLE (Service Canada) : taxDecember
     * le SOUSTRAIT de l'assiette imposable. Ne pas le compter deux fois.
     */
    gis: number;
    /**
     * A1 — décomposition PAR CONJOINT du revenu de retraite (index aligné sur `users`
     * filtrés non-nuls). Permet à `taxDecember` d'imposer chaque conjoint sur SON revenu
     * réel au lieu de la moitié du ménage (le barème étant progressif, le split égal
     * sous-estime l'impôt d'un couple à revenus inégaux). La somme des `total` par
     * conjoint == `total` famille (invariant vérifié par test).
     *
     * Limite honnête : la pension privée DB et le SRG restent répartis également (le
     * modèle ne distingue pas la DB par conjoint — `RetirementGoal.dbPensionMonthly`
     * est « cumulée pour le couple » ; le SRG est calculé au niveau familial). Seules
     * RRQ et PSV (qui dépendent du salaire/résidence individuels) sont vraiment
     * attribuées par conjoint.
     */
    perUser: RetirementIncomePerUser[];
}

/**
 * Calcule le revenu mensuel brut de retraite (RRQ + PSV + DB − écrêtement PSV).
 * Appelé une fois par mois quand isRetired === true.
 *
 * Retourne maintenant un `RetirementIncomeBreakdown` avec le split par source.
 * Pour la compat legacy : `result.total` est l'équivalent du `number` retourné
 * avant le refactor.
 */
/**
 * Pension privée DB (prestations déterminées) versée à un instant donné — **SOURCE UNIQUE**.
 *
 * Extrait de `computeRetirementIncome` par `[ESTATE-NPV-07]` : `estateCalculation.ts` avait besoin
 * de la MÊME grandeur pour son revenu de contexte, et la re-dériver a produit trois divergences
 * mesurées (indexation `dbPensionIndexationPct` ignorée → jusqu'à 47 287 $/an de contexte fantôme
 * À VIE ; `dbPensionStartAge` ignoré → 53 799 $/an ; `dbSurvivorPct` remplacé par
 * `householdPensionShare`, soit 0,60 contre 0,50 pour la même grandeur). Une formule money-critical
 * recopiée est une formule qui diverge : les deux appelants passent désormais par ici.
 *
 * ⚠️ `inflFactor` est le facteur d'inflation NOMINAL déjà calculé par l'appelant
 * (`(1 + infl/100)^(mois/12)`), pas un taux — l'indexation partielle s'applique à `inflFactor − 1`.
 */
export const computeDbPensionMonthly = (p: {
    retirementGoal: RetirementGoal;
    age: number;
    inflFactor: number;
    survivorMode: boolean;
    dbSurvivorPct: number;
    householdPensionShare?: number;
}): number => {
    const dbStartAge = p.retirementGoal.dbPensionStartAge ?? p.retirementGoal.targetAge;
    if (p.age < dbStartAge) return 0;
    const dbBaseMonthly = p.retirementGoal.dbPensionMonthly || 0;
    const dbIndexationFraction = Math.min(1, Math.max(0, (p.retirementGoal.dbPensionIndexationPct ?? 100) / 100));
    const dbInflFactor = 1 + (p.inflFactor - 1) * dbIndexationFraction;
    const dbSurvivorFactor = p.survivorMode ? p.dbSurvivorPct : 1;
    // [ENG-DIVORCE — ÉLEVÉ-1] `householdPensionShare` : la DB est un montant MÉNAGE que rien ne
    // divise ici. Sans ce facteur, un divorcé conservait 100 % de la DB du couple.
    const dbHouseholdShare = Number.isFinite(p.householdPensionShare) && (p.householdPensionShare as number) > 0
        ? (p.householdPensionShare as number)
        : 1;
    return dbBaseMonthly * dbInflFactor * dbSurvivorFactor * dbHouseholdShare;
};

export function computeRetirementIncome(
    ctx: RetirementIncomeCtx,
    retirementGoal: RetirementGoal,
    users: User[],
): RetirementIncomeBreakdown {
    const {
        m, age, simInflation, activeUsersCount, baseGrossAnnual,
        delayPensions, survivorMode, monthlyOasReduction,
        dbSurvivorPct, rrqSurvivorPct, psvResidencyYears, startYear,
    } = ctx;

    let totalPsvProrata = 0;
    let totalRrqWeight = 0;
    const yearsElapsed = Math.floor(m / 12);
    // MGA RRQ projeté: base 2026 (RRQ_MPE) indexée à inflation + croissance salariale ~0.5%/an
    const rrqMpeProjected = RRQ_MPE * Math.pow(1 + (simInflation + 0.5) / 100, yearsElapsed);

    // A1 — on conserve les POIDS PAR CONJOINT (et pas seulement leur somme) pour
    // attribuer RRQ/PSV à chaque personne selon SON salaire / SA résidence.
    const filteredUsers = users.filter(u => u);
    const perUserRrqWeight: number[] = [];
    const perUserPsvProrata: number[] = [];
    filteredUsers.forEach((u, idx) => {
        // B-AUDIT-4 — indexer le salaire courant par le MÊME facteur que la MGA projetée
        // (rrqMpeProjected). Sinon le ratio currentGross/MGA rétrécit artificiellement avec
        // les années → RRQ sous-évaluée pour les départs lointains. Hypothèse standard : le
        // salaire suit la croissance de la MGA sur la carrière → ratio earnings/MGA stable.
        // FISC-RRQ-UNIT — grossSalary est MENSUEL (convention canonique du store, cf utils/salary.ts) ;
        // baseGrossAnnual/activeUsersCount est ANNUEL. On annualise grossSalary (×12) pour que le ratio
        // earnings/MGA (rrqMpeProjected, annuel) ait la bonne échelle — sinon RRQ ~12× trop basse.
        const currentGrossUser = (u.grossSalary ? u.grossSalary * 12 : (baseGrossAnnual / activeUsersCount))
            * Math.pow(1 + (simInflation + 0.5) / 100, yearsElapsed);
        const rrqRatioUser = Math.min(1.0, currentGrossUser / rrqMpeProjected);

        // FISC-RRQ-PRORATA (2026-06-16) — prorata de RÉSIDENCE RRQ désormais PER-CONJOINT (avant :
        // dérivé de users[0] SEUL puis appliqué à la rente du COUPLE → faux pour un couple d'arrivées
        // inégales, ~20 % d'erreur pour un mix natif/immigrant tardif). Mirroir de la PSV : arrivalAge
        // via getResidencyStartYear (gate isImmigrant inclus ; même repli birthYear que projection.ts:196).
        // RRQ = années cotisées 18→retraite / 39 (modèle « 39 meilleures années », FISCAL_REFERENCE §6).
        const birthYearU = u.birthYear || (startYear - (u.age || 30));
        const residencyStartU = getResidencyStartYear(birthYearU, u.isImmigrant, u.canadaArrivalYear);
        const arrivalAgeU = Math.max(18, residencyStartU - birthYearU);
        const rrqResidenceProrataUser = Math.min(1, Math.max(0, retirementGoal.targetAge - arrivalAgeU) / RRQ_DENOMINATOR_YEARS);
        // Poids RRQ individuel = ratio gains/MGA × prorata de résidence (les deux PER-CONJOINT).
        const rrqWeightUser = rrqRatioUser * rrqResidenceProrataUser;
        perUserRrqWeight.push(rrqWeightUser);
        totalRrqWeight += rrqWeightUser;

        // PSV résidence: prorata 1/40, mais 0 si < 10 ans (règle Service Canada)
        // [NAN-INPUT-HARDENING] `?? 0` ne rattrape PAS NaN → `Number.isFinite` (sinon NaN<10=false → prorata NaN).
        const ryRaw = psvResidencyYears[idx];
        const residencyYears = Number.isFinite(ryRaw) ? ryRaw : 0;
        const psvIndividualProrata = residencyYears < PSV_MIN_RESIDENCY_YEARS
            ? 0
            : Math.min(1.0, residencyYears / PSV_FULL_RESIDENCY_YEARS);
        perUserPsvProrata.push(psvIndividualProrata);
        totalPsvProrata += psvIndividualProrata;
    });
    const psvProrata = totalPsvProrata / activeUsersCount;
    // RRQ : moyenne des poids per-conjoint (gains/MGA × résidence). Couple non-immigrant (résidence=1
    // chacun) ⇒ = moyenne des ratios gains/MGA = comportement antérieur EXACT (zéro régression baseline).
    const rrqProrata = totalRrqWeight / activeUsersCount;

    // Début des rentes = CHOIX INDÉPENDANT de l'âge d'arrêt de travail (correctif Marc 2026-06 :
    // l'ancien `max(60/65, targetAge)` FORÇAIT les rentes à démarrer à l'âge de retraite → « pas de
    // rente avant 71 » si on prévoyait d'arrêter tard, alors qu'on touche le RRQ dès 65 même en
    // travaillant). Défaut = min(targetAge, 65) : plafonne le début à l'âge NORMAL (65) tout en
    // préservant l'anticipation d'un retraité précoce. Champs `rrqStartAge`/`psvStartAge` pour un
    // choix explicite. Bornes légales : RRQ 60-72 (report étendu à 72 depuis 2024), PSV 65-70.
    // delayPensions (stratégie de report optimal) → RRQ 72, PSV 70.
    const defaultStart = Math.min(retirementGoal.targetAge, 65);
    let rrqStartAge = Math.min(72, Math.max(60, retirementGoal.rrqStartAge ?? defaultStart));
    let psvStartAge = Math.min(70, Math.max(65, retirementGoal.psvStartAge ?? defaultStart));
    if (delayPensions) {
        rrqStartAge = 72;
        psvStartAge = 70;
    }
    // Facteurs de report/anticipation dérivés des âges de début (source unique utils/tax.ts).
    // delayPensions → RRQ 72 = +84 mois ×1,588 ; PSV 70 = +60 mois ×1,36. La PSV ne s'anticipe pas.
    const rrqFactor = rrqAdjustmentFactor((rrqStartAge - 65) * 12);
    const psvFactor = psvDeferralFactor((psvStartAge - 65) * 12);

    // Base FAMILIALE (ménage) de RRQ / PSV — deux chemins qui aboutissent TOUS DEUX à un montant
    // familial (cohérent avec estateCalculation.ts:177-178 et setupSimulation.ts:114-118) :
    //  • `governmentPension` est DÉJÀ un agrégat MÉNAGE (RRQ+PSV combinés des 2 conjoints) → split 65/35
    //    SANS ×N (convention de MODÈLE GOV_PENSION_*_SHARE, utils/tax.ts — PAS une règle ARC/RQ, cf
    //    FISCAL_REFERENCE §6 FA-8). ⚠️ NE PAS ajouter ×activeUsersCount ici : ce serait un double-comptage
    //    (bug FA-5 déjà corrigé) → un couple verrait sa rente doublée. (FISC-GOVPENSION-SCALE = faux positif.)
    //  • `rrqEstimateMonthly`/`psvEstimateMonthly` (relevés Retraite Québec / Service Canada) sont
    //    PER-PERSONNE → ×activeUsersCount pour reconstituer le familial. Ces estimés précis priment.
    // RRQ-PSV-MIN — clamp `Math.max(0, …)` : un estimé NÉGATIF (saisie absurde, inputs sans `min`) ne
    // doit pas créer une rente négative qui sous-estimerait en silence le revenu (et le NPV estate, aligné).
    const rrqBaseFamily = (retirementGoal.rrqEstimateMonthly !== undefined)
        ? (Math.max(0, retirementGoal.rrqEstimateMonthly) * activeUsersCount)
        : (retirementGoal.governmentPension * GOV_PENSION_RRQ_SHARE);
    const psvBaseFamily = (retirementGoal.psvEstimateMonthly !== undefined)
        ? (Math.max(0, retirementGoal.psvEstimateMonthly) * activeUsersCount)
        : (retirementGoal.governmentPension * GOV_PENSION_PSV_SHARE);

    const survivorRrqFactor = survivorMode ? (1 - 0.5 + 0.5 * rrqSurvivorPct) : 1;
    const survivorPsvFactor = survivorMode ? 0.5 : 1;
    // Bonification automatique PSV +10% à partir de 75 ans (depuis juillet 2022) — évaluée per-conjoint.
    const psv75BonusOf = (ageI: number): number => (ageI >= 75 ? (1 + PSV_BONUS_75_PLUS) : 1);
    let rrqMonthly: number;
    let psvMonthly: number;
    if (survivorMode) {
        // SURVIVANT (1 contribuable = user0) : modèle FAMILIAL × facteur survivant INCHANGÉ (le gate utilise
        // l'âge du survivant ; la part du défunt est déjà modélisée par le facteur survivant). Le per-conjoint
        // au décès est un raffinement séparé → zéro impact sur la baseline FISC-SURVIVOR-DRAWDOWN.
        rrqMonthly = age >= rrqStartAge ? (rrqBaseFamily * rrqProrata * rrqFactor * survivorRrqFactor) : 0;
        psvMonthly = age >= psvStartAge ? (psvBaseFamily * psvProrata * psvFactor * psv75BonusOf(age) * survivorPsvFactor) : 0;
    } else {
        // [ITEM-2C] COUPLE/SOLO VIVANT : le DÉPART RRQ/PSV et le BONUS PSV 75+ sont évalués à l'âge de CHAQUE
        // conjoint, sur SA part (`base/N × poids_i`). Avant : gate + bonus sur l'âge de user1 sur la base
        // familiale → un conjoint plus jeune touchait sa rente trop tôt / profitait du bonus de l'aîné. Défaut
        // additif : `Σ_i (base/N × poids_i) == base × prorata` ⇒ âges égaux/solo identiques (zéro régression).
        // Âge de DÉPART de chaque conjoint (age explicite, sinon dérivé de birthYear).
        const startAgeOf = (i: number): number | null => {
            const u = filteredUsers[i];
            if (u?.age != null && Number.isFinite(u.age)) return u.age;
            if (u?.birthYear != null && Number.isFinite(u.birthYear)) return startYear - u.birthYear;
            return null;
        };
        const a0 = startAgeOf(0);
        // Âge COURANT de chaque conjoint = âge de boucle de user0 (`ctx.age`, authoritative) + l'ÉCART d'âge
        // avec user0. Ancré sur `ctx.age` (cohérent même quand un test passe `age` ≠ users[0].age) ET symétrique
        // pour des conjoints de même âge (écart = 0). En prod `ctx.age == users[0].age + yearsElapsed` → identique
        // à `users[i].age + yearsElapsed`.
        const ageOfUser = (i: number): number => {
            if (i === 0) return age;
            const ai = startAgeOf(i);
            // Conjoint sans âge NI année de naissance → on suppose le MÊME âge que user0 (préserve le
            // comportement ménage d'avant et évite d'amputer en silence sa rente sur une donnée manquante).
            return (ai != null && a0 != null) ? age + (ai - a0) : age;
        };
        let rrqSum = 0;
        let psvSum = 0;
        for (let i = 0; i < perUserRrqWeight.length; i++) {
            const ageI = ageOfUser(i);
            if (ageI >= rrqStartAge) rrqSum += (rrqBaseFamily / activeUsersCount) * perUserRrqWeight[i] * rrqFactor;
            if (ageI >= psvStartAge) psvSum += (psvBaseFamily / activeUsersCount) * perUserPsvProrata[i] * psvFactor * psv75BonusOf(ageI);
        }
        rrqMonthly = rrqSum;
        psvMonthly = psvSum;
    }

    const inflFactor = Math.pow(1 + simInflation / 100, m / 12);

    const dbMonthly = computeDbPensionMonthly({
        retirementGoal, age, inflFactor, survivorMode, dbSurvivorPct,
        householdPensionShare: ctx.householdPensionShare,
    });

    // §6.3 — SRG (Supplément de revenu garanti) pour retraités 65+ recevant la PSV.
    // FA-3b (audit fiscal 2026-06-09) : le « revenu autre que PSV » du test SRG inclut
    // désormais le revenu imposable de l'ANNÉE PRÉCÉDENTE (retraits REER/FERR + loyers,
    // transmis nominal et déflaté ici à la même base réelle que RRQ ; NB : dbMonthly porte
    // déjà dbInflFactor (quasi nominal si indexation 100 %) → revenu test légèrement surévalué
    // pour les profils DB = SRG sous-évalué, sens CONSERVATEUR) — comme le vrai
    // SRG, calculé sur la déclaration de l'année passée. Avant : RRQ+DB seuls → SRG
    // fictif (~13 k$/an) pour les profils FIRE/meltdown vivant de retraits REER.
    // Garde NaN à la source (cohérence FA-1) : Math.max(0, NaN) = NaN — calculateGISBenefit a
    // sa propre garde mais on neutralise ici pour ne jamais propager.
    const otherLaggedReal = (Number.isFinite(ctx.otherIncomeAnnualLaggedNominal)
        ? Math.max(0, ctx.otherIncomeAnnualLaggedNominal as number)
        : 0) / inflFactor;
    // PV-9 — gains en capital RÉALISÉS de l'année précédente : le montant IMPOSABLE (×0,5) entre
    // dans le revenu net du test SRG, déflaté à la même base réelle. Avant : exclus (SRG surévalué
    // pour un 65+ bas revenu réalisant des gains). `accCapitalGainsYear` est déjà NET de la banque
    // de pertes (PV-2/PV-7) et ≥ 0 — c'est le gain RÉALISÉ net (BRUT, avant inclusion) ; ×0,5 = ligne 12700.
    const gainsLaggedReal = (Number.isFinite(ctx.prevYearCapitalGainsForGisNominal)
        ? Math.max(0, ctx.prevYearCapitalGainsForGisNominal as number)
        : 0) * CAPITAL_GAINS_INCLUSION_STANDARD / inflFactor;
    // rrqMonthly is already family-level (rrqBaseFamily above — agrégat ménage, déjà ×N si estimés).
    // Computing family total first, then dividing for the per-adult figure avoids
    // the double-multiplication that caused SRG = $0 for entitled couples (§7.G).
    const otherIncomeAnnualFamily = (rrqMonthly + dbMonthly) * 12 + otherLaggedReal + gainsLaggedReal;
    // FA-10 (suivi fiscal-accuracy) — survivorMode : UN seul bénéficiaire SRG. Avant, le
    // survivant gardait le barème COUPLE (max 662 $ ×2 = 1 324 $/mois, seuil combiné 29 760 $)
    // au lieu du barème célibataire (1 105 $, seuil 22 512 $) ET son revenu test était divisé
    // par 2 → jusqu'à ~2,6 k$/an de SRG fictif NON imposable (sens non conservateur).
    // [ENG-DIVORCE] `householdAdults` (défaut `activeUsersCount`) et NON `activeUsersCount` : après
    // un divorce le diviseur d'agrégat reste 2 (cf. `householdPensionShare`) alors que le ménage
    // n'a plus qu'une tête. Lire le diviseur ici donnait le barème COUPLE à un célibataire, puis
    // versait sa prestation en double.
    const householdAdults = Number.isFinite(ctx.householdAdults) && (ctx.householdAdults as number) > 0
        ? (ctx.householdAdults as number)
        : activeUsersCount;
    const gisHeads = survivorMode ? 1 : Math.max(1, householdAdults);
    const otherIncomeAnnualPerAdult = otherIncomeAnnualFamily / gisHeads;
    // [ITEM-2C] `psvMonthly > 0` (PSV per-conjoint) au lieu de `age >= psvStartAge` (âge user1 seul) : pour un
    // couple à écart d'âge où l'aîné touche la PSV mais user0 < psvStartAge, le SRG était à tort 0. Couple
    // d'âge égal : `age >= psvStartAge` ⟺ `psvMonthly > 0` → inchangé.
    // [ENG-DIVORCE] Même correctif : « ai-je un conjoint qui touche la PSV » est une question de
    // TÊTES, pas de diviseur. Un divorcé n'en a plus — il passe au barème célibataire.
    const hasSpouseWithOAS = !survivorMode && householdAdults > 1 && psvMonthly > 0;
    // FA-9 (audit 2026-06-09, fix 2026-06-10) — TOUT en base RÉELLE ici, comme RRQ/PSV : appel
    // SANS `year` (seuils/max 2026 de base) contre le revenu test déjà en base réelle, puis la
    // nominalisation UNIQUE ×inflFactor ci-dessous (gisTotal). Avant : `year=currentYear`
    // indexait max+seuils ×1,02^Δ DANS calculateGISBenefit PUIS ×inflFactor dehors → max SRG
    // double-indexé (surévalué ~49 % à 20 ans, ~+6,5 k$/an fictifs en $ RÉELS 2026, célibataire)
    // et seuils nominaux face à un revenu réel (clawback trop clément, même sens non conservateur).
    const gisMonthlyPerAdult = (psvMonthly > 0)
        ? calculateGISBenefit(
            hasSpouseWithOAS ? otherIncomeAnnualFamily : otherIncomeAnnualPerAdult,
            hasSpouseWithOAS,
        )
        : 0;
    const gisMonthly = gisMonthlyPerAdult * gisHeads;

    // Phase 3 Tier 3 — split par source avant clamp Math.max(0, ...)
    const rrq = rrqMonthly * inflFactor;
    const psv = (psvMonthly + gisMonthly) * inflFactor;
    const psvOasOnly = psvMonthly * inflFactor;   // PSV hors SRG (attribuable par résidence)
    const gisTotal = gisMonthly * inflFactor;     // SRG (familial → réparti également)
    const privee = dbMonthly;
    const totalRaw = rrq + psv + privee - monthlyOasReduction;

    // A1 — décomposition PAR CONJOINT. RRQ ∝ POIDS individuel (ratio salaire/MGA × prorata de
    // résidence, FISC-RRQ-PRORATA) ; PSV (volet OAS) ∝ prorata de résidence individuel. Le SRG
    // (familial), la pension DB (« cumulée pour le couple ») et l'écrêtement PSV sont répartis
    // également faute de donnée par conjoint. On répartit les TOTAUX famille au prorata des poids
    // individuels : la somme par conjoint == total famille (invariant exact, même quand un poids
    // est nul — fallback part égale).
    const n = Math.max(1, filteredUsers.length);
    const sumRrqWeight = perUserRrqWeight.reduce((s, r) => s + r, 0);
    const sumPsvProrata = perUserPsvProrata.reduce((s, p) => s + p, 0);
    const perUser: RetirementIncomePerUser[] = filteredUsers.map((_, i) => {
        const rrqShare = sumRrqWeight > 0 ? perUserRrqWeight[i] / sumRrqWeight : 1 / n;
        const psvShare = sumPsvProrata > 0 ? perUserPsvProrata[i] / sumPsvProrata : 1 / n;
        const rrqUser = rrq * rrqShare;
        // PSV individuelle = volet OAS au prorata résidence + part égale du SRG familial.
        const psvUser = psvOasOnly * psvShare + gisTotal / n;
        const priveeUser = privee / n;            // DB household → part égale
        const oasReductionUser = monthlyOasReduction / n;
        return {
            total: Math.max(0, rrqUser + psvUser + priveeUser - oasReductionUser),
            rrq: Math.max(0, rrqUser),
            psv: Math.max(0, psvUser),
            privee: Math.max(0, priveeUser),
        };
    });

    return {
        total: Math.max(0, totalRaw),
        rrq: Math.max(0, rrq),
        psv: Math.max(0, psv),
        privee: Math.max(0, privee),
        oasReduction: monthlyOasReduction,
        gis: Math.max(0, gisTotal),
        perUser,
    };
}
