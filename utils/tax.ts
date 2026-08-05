
// ============================================
// BARÈMES FISCAUX CANADA / QUÉBEC — 2026
// Source: ARC + Revenu Québec
// ============================================

// FA-8 — année de BASE des barèmes de ce module : toutes les constantes *_2026 et l'indexation
// getIndexedBracketsForYear (≈ +2 %/an, ADR 009) partent de cette année. Exposée pour que l'UI
// (ex. SystemView « TAX_MODULE ») compose ses libellés depuis la source au lieu de les hardcoder.
export const TAX_BASE_YEAR = 2026;

export const FED_BRACKETS = [
    { upTo: 58523, rate: 0.14, label: "14.0%" },
    { upTo: 117045, rate: 0.205, label: "20.5%" },
    { upTo: 181440, rate: 0.26, label: "26.0%" },
    { upTo: 258482, rate: 0.29, label: "29.0%" },
    { upTo: Infinity, rate: 0.33, label: "33.0%" }
];

export const QC_BRACKETS = [
    { upTo: 54345, rate: 0.14, label: "14.0%" },
    { upTo: 108680, rate: 0.19, label: "19.0%" },
    { upTo: 132245, rate: 0.24, label: "24.0%" },
    { upTo: Infinity, rate: 0.2575, label: "25.75%" }
];

// BPA 2026 — montants personnels de base (crédit non remboursable au taux le plus bas).
// Vérifiés 2026-05 contre les sources officielles (indexation féd 2,0 %, QC 2,05 %).
// Fédéral : BPA dégressif de 16 452$ (revenu ≤ ~177k$) à 14 829$ (hauts revenus) ;
//   on retient le palier maximal — la dégressivité haut-revenu n'est pas modélisée.
// Québec : 18 952$ (= 18 571$ de 2025 × 1,0205).
// NB : un audit antérieur (« F22 ») avait par erreur retenu les valeurs 2025
//   (16 444 / 18 571) en les croyant définitives — corrigé ici.
export const BASIC_PERSONAL_AMOUNT_FED = 16452;
export const BASIC_PERSONAL_AMOUNT_QC = 18952;

// RRQ 2026 : 5,30 % base + 1,00 % volet 1 = 6,30 %. Le taux de base a été réduit
// de 5,40 % à 5,30 % en 2026 (cotisation totale employé+employeur 10,8 % → 10,6 %).
// Vérifié 2026-05 contre Revenu Québec / Retraite Québec.
export const RRQ_RATE = 0.063;
export const RRQ_MPE = 74600;            // MGA 2026 (= YMPE RPC ; +4,6 % vs 71 300 $ en 2025)
export const RRQ_EXEMPTION = 3500;
export const RRQ_MAX = (RRQ_MPE - RRQ_EXEMPTION) * RRQ_RATE; // ≈ 4 479,30 $

export const RRQ_PART2_RATE = 0.04;      // volet 2 (MGA → MGAS), inchangé
export const RRQ_YAMPE = 85000;          // MGAS 2026 (2e plafond)
export const RRQ_PART2_MAX = (RRQ_YAMPE - RRQ_MPE) * RRQ_PART2_RATE; // = 416 $

export const RQAP_RATE = 0.0043;
export const RQAP_MAX_INCOME = 103000;
export const RQAP_MAX = 442.90;

export const AE_RATE_QC = 0.0130;
export const AE_MAX_INCOME = 68900;
export const AE_MAX_QC = 895.70;

// Inclusion gains en capital: 50% uniforme depuis annulation de la proposition
// fédérale à 66.67% > 250k$ en mars 2025.
export const CAPITAL_GAINS_INCLUSION_STANDARD = 0.50;

// FA-8 (2026-06-11) — retenue à la source AMÉRICAINE sur les dividendes US versés à un résident
// canadien : 15 % (Convention fiscale Canada–États-Unis (1980), art. X(2)b) — taux réduit
// « portefeuille »). L'art. XXI exempte les régimes de PENSION (REER/FERR) ; le CELI n'est PAS
// couvert (pas un régime de pension au sens de la convention) → drag NON récupérable dans le CELI.
// En non-enregistré, la retenue est récupérable via le crédit pour impôt étranger (FTC).
// Réf docs/FISCAL_REFERENCE.md §3. Consommé par assetLocation + glidepathRates (D2.7).
export const US_DIVIDEND_WITHHOLDING_RATE = 0.15;

// Plafonds spécifiques aux régimes (par utilisateur).
// Source : Budget fédéral 2024-2026. À mettre à jour à chaque budget.
export const RAP_LIMIT_PER_USER = 60000;                    // Régime Accession Propriété
export const PBMA_THRESHOLD_PER_USER = 17183;               // Palier de base montant ajusté
export const OAS_CLAWBACK_THRESHOLD_2026 = 95323;           // Seuil récupération PSV 2026 (ARC). 93 454 était la valeur 2025 — vérifié 2026-05.
// FA-8 (2026-06-11) — taux de récupération (clawback) de la PSV : 15 % du revenu net INDIVIDUEL
// au-delà du seuil (ARC — « impôt de récupération » de la PSV, ligne 23500), plafonné à la PSV
// réellement versée. Réf docs/FISCAL_REFERENCE.md §6. Consommé par taxDecember.computeOasClawback.
export const OAS_CLAWBACK_RATE = 0.15;
export const FHSA_LIFETIME_LIMIT_PER_USER = 40000;          // CELIAPP plafond à vie
export const FHSA_ANNUAL_LIMIT_PER_USER = 8000;             // CELIAPP plafond annuel

// ============================================
// REPORT / ANTICIPATION DES RENTES PUBLIQUES (RRQ / PSV)
// Source unique (avant : facteurs 1,42 / 1,36 et taux 0,007 / 0,006 dupliqués dans
// retirementIncome.ts + setupSimulation.ts — audit fiscal-accuracy 2026-06).
// Réf docs/FISCAL_REFERENCE.md §6. Retraite Québec (RRQ) + Service Canada (PSV).
// ============================================
export const RRQ_DEFERRAL_RATE_PER_MONTH = 0.007;  // +0,7 %/mois de report APRÈS 65 ans (RRQ)
export const RRQ_EARLY_RATE_PER_MONTH = 0.006;     // −0,6 %/mois d'anticipation AVANT 65 ans (RRQ)
export const PSV_DEFERRAL_RATE_PER_MONTH = 0.006;  // +0,6 %/mois de report APRÈS 65 ans (PSV/OAS)
// Plafonds de report/anticipation (en MOIS depuis 65 ans). Réf docs/FISCAL_REFERENCE.md §6.
// RRQ : report jusqu'à 72 ans (depuis le 1ᵉʳ janvier 2024) = 84 mois → max +58,8 %. Anticipation
// jusqu'à 60 ans = 60 mois → −36 %. PSV : report jusqu'à 70 ans = 60 mois → max +36 % (pas d'anticipation).
export const RRQ_DEFERRAL_MAX_MONTHS = 84;         // 65 → 72 ans
export const PENSION_EARLY_MAX_MONTHS = 60;        // 65 → 60 ans (anticipation RRQ ; PSV ne s'anticipe pas)
export const PSV_DEFERRAL_MAX_MONTHS = 60;         // 65 → 70 ans
export const PSV_BONUS_75_PLUS = 0.10;             // +10 % automatique dès 75 ans (PSV, depuis juillet 2022)

// FA-8 (2026-06-11) — convention de MODÈLE (PAS une règle ARC/RQ) : split du champ AGRÉGÉ legacy
// `RetirementGoal.governmentPension` (RRQ+PSV combinés) quand les champs précis
// `rrqEstimateMonthly`/`psvEstimateMonthly` ne sont pas fournis. 65/35 ≈ ordre de grandeur d'un
// cotisant RRQ proche du maximum (RRQ 65 ans : 1 507,65 $/mois — FISCAL_REFERENCE §6) vs PSV pleine.
// Source unique des 3 sites (setupSimulation, retirementIncome, estateCalculation) — réf
// docs/FISCAL_REFERENCE.md §6 (« Split 65/35 », approximation interne documentée).
export const GOV_PENSION_RRQ_SHARE = 0.65;
export const GOV_PENSION_PSV_SHARE = 0.35;

/**
 * Facteur d'ajustement RRQ selon l'écart en mois vs 65 ans (référence).
 * monthsFrom65 > 0 → report (+0,7 %/mois, max +84 mois = ×1,588 à 72 ans — depuis 2024) ;
 * monthsFrom65 < 0 → anticipation (−0,6 %/mois, max −60 mois = ×0,64 à 60 ans).
 */
export const rrqAdjustmentFactor = (monthsFrom65: number): number =>
    monthsFrom65 >= 0
        ? 1 + Math.min(monthsFrom65, RRQ_DEFERRAL_MAX_MONTHS) * RRQ_DEFERRAL_RATE_PER_MONTH
        : 1 + Math.max(monthsFrom65, -PENSION_EARLY_MAX_MONTHS) * RRQ_EARLY_RATE_PER_MONTH;

/**
 * Facteur de report PSV/OAS selon les mois APRÈS 65 ans (la PSV ne s'anticipe pas, et ne se
 * reporte pas au-delà de 70 ans). +0,6 %/mois, plafonné à 60 mois → ×1,36 à 70 ans. ≤ 0 → 1,0.
 */
export const psvDeferralFactor = (monthsFrom65: number): number =>
    monthsFrom65 > 0
        ? 1 + Math.min(monthsFrom65, PSV_DEFERRAL_MAX_MONTHS) * PSV_DEFERRAL_RATE_PER_MONTH
        : 1.0;

// ============================================
// CRÉDITS 65+ ET REVENU DE RETRAITE (audit §6.2)
// ============================================

// --- Fédéral ---
// Crédit en raison de l'âge (ligne 30100). Source: ARC, indexation 2026 = 2.0%.
// Base 2025: 8 790$ max, seuil 45 522$, réduction 15% au-delà.
// Voir https://www.canada.ca/.../line-30100-amount.html
export const AGE_AMOUNT_FED_2026 = 9208;                    // 9 028 (2025) × 1,02. Vérifié 2026-05 (Fidelity/ARC). L'ancien 8 966 indexait par erreur la base 2024.
export const AGE_AMOUNT_FED_THRESHOLD_2026 = 46432;         // 45522 × 1.02
export const AGE_AMOUNT_FED_REDUCTION_RATE = 0.15;
export const AGE_AMOUNT_FED_MIN_AGE = 65;

// Crédit pour revenu de pension (ligne 31400). Source: ARC, montant fixe
// non indexé depuis 2006. Voir https://www.canada.ca/.../line-31400-pension-income-amount.html
export const PENSION_INCOME_AMOUNT_FED = 2000;

// Taux du palier le plus bas fédéral pour crédits non-remboursables (gelé à 15%
// par l'ARC malgré la baisse du 1er palier à 14% en 2026 — politique C-4).
export const FED_NONREFUNDABLE_RATE = 0.15;

// --- Provincial Québec ---
// Ligne 361 — Montant accordé en raison de l'âge ou pour revenus de retraite.
// Source: Revenu Québec, formulaire TP-1.G 2026, indexation 2026 = 2.05%.
// Voir https://www.revenuquebec.ca/.../aide-par-ligne/350-a-398-1-credits-dimpot-non-remboursables/ligne-361/
export const AGE_AMOUNT_QC_2026 = 3986;                     // 65+ par personne, 2026
export const RETIREMENT_INCOME_AMOUNT_QC_2026 = 3058;       // max sur premier 3 058$ de pension admissible (≈2998 × 1.0205)
// TP1G-VIVANT-SEUL (2026-07-07) — seuil de réduction UNIQUE (revenu familial net) : remplace les paliers
// duaux 27 835/45 270 (non sourcés, archivés). Source : MFQ Dépenses fiscales 2025, fiche 110606, tableau C.31.
export const QC_LINE_361_THRESHOLD_2026 = 42955;
// Montant « personne vivant seule » (base), ligne 361 — s'ADDITIONNE à âge + revenu de retraite AVANT la
// réduction commune. MFQ fiche 110606 C.31 / Loi sur les impôts art. 752.0.7.4 a). Supplément monoparental
// (2 681 $) NON modélisé (hors scope : exigerait childrenCount + réduction 1/12 par mois d'Allocation famille).
export const LIVING_ALONE_AMOUNT_QC_2026 = 2172;
export const QC_LINE_361_REDUCTION_RATE = 0.1875;           // 18.75% au-delà du seuil
export const QC_LINE_361_MIN_AGE = 65;

// Taux du palier le plus bas QC pour crédits non-remboursables.
export const QC_NONREFUNDABLE_RATE = 0.14;

export interface AgeCreditOptions {
    /** Âge de la personne au moment du calcul (≥ 65 pour activer crédit âge fed + QC). */
    age?: number;
    /** Revenu de pension admissible — sert au crédit pension fed (max 2 000$) et au crédit revenu retraite QC. */
    eligiblePensionIncome?: number;
    /**
     * TP1G-VIVANT-SEUL — présence d'un conjoint. `false`/absent (contribuable SEUL, inclut le survivant
     * via `taxFilers`) ⇒ ajoute le montant QC « personne vivant seule » (2 172$) à la ligne 361. `true` ⇒ pas
     * de montant vivant seul. (Le seuil de réduction est désormais UNIQUE — 42 955$ — quel que soit le statut.)
     * ⚠️ Optionnel = `undefined` traité comme SOLO : un appelant en mode COUPLE DOIT passer `hasSpouse: true`
     * explicitement, sinon sur-crédit ~304$/an. Tous les appelants prod le font (taxDecember, survivor-aware).
     */
    hasSpouse?: boolean;
    /**
     * Revenu familial QC utilisé pour réduire la ligne 361.
     * Si non fourni, on prend le revenu imposable net (grossIncome - rrsp - fhsa).
     */
    familyIncome?: number;
}

/**
 * Calcule les crédits non-remboursables fédéraux et provinciaux liés à l'âge
 * (65+) et au revenu de pension admissible.
 *
 * Retourne `{ fedCredit, qcCredit }` à SOUSTRAIRE de l'impôt déjà calculé
 * (avant abattement fédéral et avant BPA).
 *
 * Sources :
 *  - ARC ligne 30100 (âge fédéral, indexé annuellement via getIndexedBracketsForYear)
 *  - ARC ligne 31400 (pension fédéral, fixe 2 000$, restreint 65+ hors cas invalidité)
 *  - Revenu Québec ligne 361 (âge + revenu retraite, indexé annuellement)
 *
 * @param opts          Âge, revenu pension admissible, statut conjoint, revenu familial
 * @param netTaxableIncome Revenu net après déductions (sert au seuil fed et fallback QC)
 * @param year          Année fiscale pour indexer les seuils et montants (défaut 2026)
 * @param realDeflator  [FISC-BRACKET-REALINDEX] déflateur (1+i)^Δ quand le revenu passé est
 *                      en dollars RÉELS (défaut 1 = espace nominal, rétrocompat bit-identique)
 */
export const calculateAgeAndPensionCredits = (
    opts: AgeCreditOptions,
    netTaxableIncome: number,
    year: number = 2026,
    realDeflator: number = 1,
): { fedCredit: number; qcCredit: number } => {
    // Guard NaN/Infinity (audit silent-failure-hunter §6.2) : un NaN injecté via
    // opts (e.g. activeUsersCount = 0 → division NaN) polluerait tout le calcul.
    const safe = (v: number | undefined, fallback = 0): number => {
        const n = v ?? fallback;
        return Number.isFinite(n) ? Math.max(0, n) : fallback;
    };

    const age = safe(opts.age);
    const pension = safe(opts.eligiblePensionIncome);
    const familyIncome = safe(opts.familyIncome, netTaxableIncome);

    // Indexation des seuils et montants 2026 selon l'année (fact mutualisé
    // avec getIndexedBracketsForYear pour cohérence avec les paliers).
    const { inflationFactor } = getIndexedBracketsForYear(year, realDeflator);
    const ageAmountFed = AGE_AMOUNT_FED_2026 * inflationFactor;
    const ageThresholdFed = AGE_AMOUNT_FED_THRESHOLD_2026 * inflationFactor;
    const ageAmountQc = AGE_AMOUNT_QC_2026 * inflationFactor;
    const retirementAmountQc = RETIREMENT_INCOME_AMOUNT_QC_2026 * inflationFactor;
    const line361Threshold = QC_LINE_361_THRESHOLD_2026 * inflationFactor;
    const livingAloneAmount = LIVING_ALONE_AMOUNT_QC_2026 * inflationFactor;

    let fedAmount = 0;
    let qcAmount = 0;

    // Crédit fédéral en raison de l'âge (65+, ARC ligne 30100)
    if (age >= AGE_AMOUNT_FED_MIN_AGE) {
        fedAmount += netTaxableIncome <= ageThresholdFed
            ? ageAmountFed
            : Math.max(
                0,
                ageAmountFed - (netTaxableIncome - ageThresholdFed) * AGE_AMOUNT_FED_REDUCTION_RATE,
            );
    }

    // Crédit fédéral pour revenu de pension (ARC ligne 31400).
    // FIX audit code-reviewer + silent-failure §6.2 — restreint 65+ pour rentes
    // standard (FERR, pension privée, REER converti). Les exceptions invalidité
    // < 65 ans ne sont pas modélisées dans FinanceAI (caller responsabilité).
    if (age >= AGE_AMOUNT_FED_MIN_AGE) {
        fedAmount += Math.min(PENSION_INCOME_AMOUNT_FED, pension);
    }

    // Ligne 361 QC — âge + revenu de retraite + « personne vivant seule », COMBINÉS puis réduits UNE fois.
    if (age >= QC_LINE_361_MIN_AGE) {
        const retirementQc = Math.min(retirementAmountQc, pension);
        // TP1G-VIVANT-SEUL : le montant « vivant seule » s'ADDITIONNE (mécanique combinée, Annexe B /
        // art. 752.0.7.4), gaté sur !hasSpouse — couvre solo ET survivant (tous deux 1 contribuable via
        // taxFilers). Seuil de réduction UNIQUE sur le revenu FAMILIAL (fin des paliers duaux). Limite
        // assumée : appliqué au bloc 65+ (le montant est en fait indépendant de l'âge, mais la fonction
        // n'est appelée qu'à 65+ ; un solo actif < 65 n'est pas crédité — surface golden énorme, différé + doc §4).
        const livingAlone = opts.hasSpouse ? 0 : livingAloneAmount;
        const grossLine361 = ageAmountQc + retirementQc + livingAlone;

        const reduction = Math.max(0, familyIncome - line361Threshold) * QC_LINE_361_REDUCTION_RATE;
        qcAmount = Math.max(0, grossLine361 - reduction);
    }

    return {
        fedCredit: fedAmount * FED_NONREFUNDABLE_RATE,
        qcCredit: qcAmount * QC_NONREFUNDABLE_RATE,
    };
};

// ============================================
// RAMQ — Régime public d'assurance médicaments (audit §6.4)
// Source: Régie de l'assurance maladie du Québec (RAMQ) + Revenu Québec ligne 447.
// Annexe K de la déclaration TP-1. Indexation annuelle au 1er juillet.
//
// Sources :
//  - RAMQ tarifs 2026 : https://www.ramq.gouv.qc.ca/fr/citoyens/assurance-medicaments-prescrits
//  - Annexe K Revenu Québec : https://www.revenuquebec.ca/fr/citoyens/declaration-de-revenus/produire-votre-declaration-de-revenus/comment-remplir-votre-declaration-de-revenus/aide-par-ligne/400-a-447-impot-et-cotisations/ligne-447/
//  - CFFP Université de Sherbrooke (paliers détaillés) : https://cffp.recherche.usherbrooke.ca/outils-ressources/guide-mesures-fiscales/cotisation-regime-assurance-medicaments-quebec/
// ============================================

// Seuils d'exemption 2026 (revenu familial net) — pas de prime sous le seuil.
export const RAMQ_EXEMPTION_SINGLE_2026 = 19500;
export const RAMQ_EXEMPTION_COUPLE_2026 = 31610;
// Bonus seuil selon enfants à charge — barème Annexe K 2026 (Revenu Québec).
// Note: l'Annexe K s'arrête à "2 enfants ou plus" — pas de tranche additionnelle 3+.
export const RAMQ_EXEMPTION_SINGLE_CHILD_1 = 4105;          // ajouté pour 1 enfant
export const RAMQ_EXEMPTION_SINGLE_CHILD_2PLUS = 7895;      // total pour 2+ enfants
export const RAMQ_EXEMPTION_COUPLE_CHILD_1 = 12110;
export const RAMQ_EXEMPTION_COUPLE_CHILD_2PLUS = 16215;

// Paliers sur l'excès au-dessus du seuil
export const RAMQ_BRACKET1_AMOUNT = 5000;
export const RAMQ_BRACKET2_AMOUNT = 9600;       // jusqu'à 14 600$ d'excès total

// Taux par adulte (single vs couple — par adulte du couple)
export const RAMQ_RATE_SINGLE_BRACKET1 = 0.0765;
export const RAMQ_RATE_SINGLE_BRACKET2 = 0.1148;
export const RAMQ_RATE_COUPLE_BRACKET1 = 0.0384;
export const RAMQ_RATE_COUPLE_BRACKET2 = 0.0575;

// Prime maximale 2026
export const RAMQ_MAX_PREMIUM_2026 = 766;

export interface RamqOptions {
    /** Couple = seuils plus élevés et taux plus bas par adulte. */
    hasSpouse?: boolean;
    /** Nombre d'enfants à charge — relève le seuil d'exemption. */
    childrenCount?: number;
    /**
     * Personne exemptée du paiement (livret de réclamation valide, étudiant 18-25
     * célibataire temps plein, 65+ avec SRG maximum, trouble fonctionnel < 18 ans,
     * COUVERTURE PRIVÉE par régime employeur/association).
     * Caller responsabilité de fournir ce flag.
     */
    exempt?: boolean;
}

/**
 * Calcule la prime RAMQ annuelle PAR ADULTE pour le régime public d'assurance
 * médicaments (Revenu Québec ligne 447, Annexe K).
 *
 * Source : RAMQ + Revenu Québec, barème 2026 (prime max 766$). Indexation
 * annuelle via getIndexedBracketsForYear pour les projections > 2026.
 *
 * Important : si l'adulte est couvert par un régime PRIVÉ (employeur, association
 * professionnelle, conjoint), il ne paie pas la prime publique. Le caller doit
 * passer `exempt: true` dans ce cas.
 *
 * @param familyNetIncome Revenu familial NET (après déductions REER/FHSA).
 * @param opts            hasSpouse, childrenCount, exempt
 * @param year            Année fiscale pour indexer seuils + prime max (défaut 2026).
 * @param realDeflator    [FISC-BRACKET-REALINDEX] déflateur (1+i)^Δ pour un revenu en $ RÉELS
 *                        (défaut 1 = nominal).
 * @returns Prime annuelle PAR ADULTE (0 à RAMQ_MAX_PREMIUM_2026 × indexation).
 *          Multiplier par activeUsersCount pour le total famille.
 */
export const calculateRamqPremium = (
    familyNetIncome: number,
    opts: RamqOptions = {},
    year: number = 2026,
    realDeflator: number = 1,
): number => {
    if (opts.exempt) return 0;
    if (!Number.isFinite(familyNetIncome) || familyNetIncome <= 0) return 0;

    const children = Math.max(0, Math.floor(opts.childrenCount ?? 0));
    const isCouple = !!opts.hasSpouse;

    // Indexation annuelle des seuils et de la prime max (mutualisée avec les
    // paliers d'impôt via getIndexedBracketsForYear).
    const { inflationFactor } = getIndexedBracketsForYear(year, realDeflator);

    let exemption = (isCouple ? RAMQ_EXEMPTION_COUPLE_2026 : RAMQ_EXEMPTION_SINGLE_2026) * inflationFactor;
    if (children >= 1) {
        exemption += (isCouple ? RAMQ_EXEMPTION_COUPLE_CHILD_1 : RAMQ_EXEMPTION_SINGLE_CHILD_1) * inflationFactor;
    }
    if (children >= 2) {
        // L'écart entre "1 enfant" et "2+ enfants" couvre le 2e enfant et au-delà
        // (l'Annexe K ne distingue pas 2 vs 3+ enfants — c'est un palier final).
        exemption += (isCouple
            ? (RAMQ_EXEMPTION_COUPLE_CHILD_2PLUS - RAMQ_EXEMPTION_COUPLE_CHILD_1)
            : (RAMQ_EXEMPTION_SINGLE_CHILD_2PLUS - RAMQ_EXEMPTION_SINGLE_CHILD_1)
        ) * inflationFactor;
    }

    const excess = Math.max(0, familyNetIncome - exemption);
    if (excess <= 0) return 0;

    const rate1 = isCouple ? RAMQ_RATE_COUPLE_BRACKET1 : RAMQ_RATE_SINGLE_BRACKET1;
    const rate2 = isCouple ? RAMQ_RATE_COUPLE_BRACKET2 : RAMQ_RATE_SINGLE_BRACKET2;

    const bracket1Width = RAMQ_BRACKET1_AMOUNT * inflationFactor;
    const bracket2Width = RAMQ_BRACKET2_AMOUNT * inflationFactor;
    const maxPremium = RAMQ_MAX_PREMIUM_2026 * inflationFactor;

    const inBracket1 = Math.min(excess, bracket1Width);
    const inBracket2 = Math.min(Math.max(0, excess - bracket1Width), bracket2Width);

    const premium = inBracket1 * rate1 + inBracket2 * rate2;
    return Math.min(maxPremium, premium);
};

// ============================================
// FSS — Cotisation au Fonds des services de santé (audit §6.1)
// Source: Revenu Québec ligne 446 + Annexe F. S'applique principalement aux
// retraités, indépendants et autres revenus non salariaux (les salariés sont
// couverts par leur employeur via cotisation FSS de l'employeur).
//
// Paliers 2026 (FA-8, vérifiés 2026-06-11 — Revenu Québec « Cotisation des particuliers au FSS »
// + CFFP U. Sherbrooke ; remplacent le barème 2025 : 18 130/33 130/63 060/148 030) :
//  - 0 à 18 500$         → 0$
//  - 18 500 à 33 500$    → 1% × (revenu - 18 500)
//  - 33 500 à 64 355$    → 150$ fixe
//  - 64 355 à 149 355$   → 150$ + 1% × (revenu - 64 355)
//  - ≥ 149 355$          → 1 000$ max
// Formule officielle : « moindre de 150 $ et 1 % de l'excédent de 18 500 $ » (revenu ≤ 64 355 $),
// puis « moindre de 1 000 $ et 150 $ + 1 % de l'excédent de 64 355 $ ». Les seuils FLAT (33 500)
// et MAX (149 355) sont les points de bascule DÉRIVÉS de cette formule (équivalence exacte).
// NB : 150 $ et 1 000 $ sont identiques en 2025 et 2026 (historiquement gelés) — le modèle les
// indexe quand même au-delà de TAX_BASE_YEAR (inflationFactor) : biais CONSERVATEUR ~2 %/an
// assumé, cf docs/FISCAL_REFERENCE.md §5.
//
// https://www.revenuquebec.ca/fr/citoyens/declaration-de-revenus/payer-ou-etre-rembourse/paiement-des-cotisations/cotisation-des-particuliers-au-fonds-des-services-de-sante/
// ============================================

export const FSS_THRESHOLD_ZERO = 18500;       // pas de cotisation sous ce seuil (2026)
export const FSS_THRESHOLD_FLAT = 33500;       // début palier 150$ fixe (= ZERO + 15 000)
export const FSS_THRESHOLD_RAMP = 64355;       // début palier 150$ + 1% (2026)
export const FSS_THRESHOLD_MAX = 149355;       // début plafond 1 000$ (= RAMP + 85 000)
export const FSS_RATE_TIER1 = 0.01;            // 1% sur première tranche progressive
export const FSS_RATE_TIER2 = 0.01;            // 1% sur deuxième tranche progressive
export const FSS_FLAT_AMOUNT = 150;
export const FSS_MAX_PREMIUM = 1000;

/**
 * Calcule la cotisation FSS (ligne 446) selon l'Annexe F pour un particulier.
 *
 * Applicable aux retraités, indépendants et autres revenus non salariaux.
 * Les salariés sont couverts par leur employeur (cotisation FSS employeur).
 *
 * @param netIncome  Revenu net imposable (après déductions).
 * @param year       Année fiscale pour indexation (défaut 2026).
 * @param realDeflator [FISC-BRACKET-REALINDEX] déflateur (1+i)^Δ pour un revenu en $ RÉELS
 *                   (défaut 1 = nominal).
 * @returns Cotisation FSS annuelle (0 à FSS_MAX_PREMIUM × indexation).
 */
export const calculateFSSPremium = (
    netIncome: number,
    year: number = 2026,
    realDeflator: number = 1,
): number => {
    if (!Number.isFinite(netIncome) || netIncome <= 0) return 0;

    const { inflationFactor } = getIndexedBracketsForYear(year, realDeflator);
    const t1 = FSS_THRESHOLD_ZERO * inflationFactor;
    const t2 = FSS_THRESHOLD_FLAT * inflationFactor;
    const t3 = FSS_THRESHOLD_RAMP * inflationFactor;
    const t4 = FSS_THRESHOLD_MAX * inflationFactor;
    const flat = FSS_FLAT_AMOUNT * inflationFactor;
    const max = FSS_MAX_PREMIUM * inflationFactor;

    if (netIncome <= t1) return 0;
    if (netIncome <= t2) return (netIncome - t1) * FSS_RATE_TIER1;
    if (netIncome <= t3) return flat;
    if (netIncome <= t4) return flat + (netIncome - t3) * FSS_RATE_TIER2;
    return max;
};

// ============================================
// SRG — Supplément de revenu garanti (audit §6.3)
// Source: Service Canada. Programme aux aînés 65+ recevant la PSV avec
// revenu autre que PSV faible. Réduit par clawback 50¢/1$ d'autre revenu.
//
// Barème 2026 Q1 (janvier-mars), indexé trimestriellement :
//  - Célibataire 65+ : max 1 105$/mois, seuil revenu 22 512$
//  - Couple (2 reçoivent PSV) : max 662$/mois par adulte, seuil 29 760$ combiné
//  - (Cas conjoint sans PSV ou Allocation : non implémentés ici)
//
// Clawback : 50% du revenu autre que PSV au-delà de l'exemption d'emploi.
//
// https://www.canada.ca/en/services/benefits/publicpensions/old-age-security/guaranteed-income-supplement/benefit-amount.html
// ============================================

export const GIS_MAX_MONTHLY_SINGLE_2026 = 1105;
export const GIS_MAX_MONTHLY_COUPLE_2026 = 662;       // par adulte
export const GIS_INCOME_THRESHOLD_SINGLE = 22512;
export const GIS_INCOME_THRESHOLD_COUPLE = 29760;     // revenu combiné
export const GIS_CLAWBACK_RATE = 0.50;                // 50¢ par 1$ d'autre revenu

/**
 * Calcule le SRG mensuel pour un retraité 65+ recevant la PSV.
 *
 * @param otherIncomeAnnual Revenu net annuel autre que PSV (RRQ, retraits REER,
 *                          pensions privées, gains capitaux imposables...).
 *                          Pour un couple : revenu FAMILIAL combiné.
 * @param hasSpouseWithOAS  Si vrai, applique le barème couple (max plus bas
 *                          par adulte, seuil revenu combiné plus haut).
 * @param year              Année fiscale pour indexation (défaut 2026). ⚠️ Réservé aux usages
 *                          NOMINAUX hors moteur de projection : dans `services/projection/`,
 *                          appeler SANS `year` (barème 2026 = base réelle) et nominaliser
 *                          ×inflFactor UNE seule fois en aval — sinon double indexation
 *                          (max SRG surévalué ~49 % à 20 ans ; FA-9, 2026-06-10).
 * @returns SRG mensuel PAR ADULTE (0 à GIS_MAX_MONTHLY_*_2026 × indexation).
 */
export const calculateGISBenefit = (
    otherIncomeAnnual: number,
    hasSpouseWithOAS: boolean,
    year: number = 2026,
): number => {
    if (!Number.isFinite(otherIncomeAnnual) || otherIncomeAnnual < 0) return 0;

    const { inflationFactor } = getIndexedBracketsForYear(year);
    const maxMonthly = hasSpouseWithOAS
        ? GIS_MAX_MONTHLY_COUPLE_2026 * inflationFactor
        : GIS_MAX_MONTHLY_SINGLE_2026 * inflationFactor;
    const incomeThreshold = hasSpouseWithOAS
        ? GIS_INCOME_THRESHOLD_COUPLE * inflationFactor
        : GIS_INCOME_THRESHOLD_SINGLE * inflationFactor;

    if (otherIncomeAnnual >= incomeThreshold) return 0;

    // Clawback : 50% du revenu autre que PSV (les seuils incluent déjà cette
    // logique : à 0$ revenu autre = max, à incomeThreshold = 0).
    // SRG mensuel = max - (clawback × revenu / 12).
    const monthlyClawback = (otherIncomeAnnual * GIS_CLAWBACK_RATE) / 12;
    return Math.max(0, maxMonthly - monthlyClawback);
};

// §7.E.2 — Décomposition des taux de retenue source REER pour résidents QC.
// ARC + RQ : retenue = féd uniforme + QC progressif.
//   Tranche ≤ 5 000$    : 5% féd + 14% QC = 19% combiné
//   Tranche 5 001-15 000 : 10% féd + 14% QC = 24% combiné (NB : 14% reste idem QC)
//   Tranche > 15 000     : 15% féd + 14% QC = 29% combiné
// Hors QC : 10/20/30% combiné (à modéliser si besoin futur).
// Refs : ARC IT-528R2 + RQ TP-1015.
export const RRSP_WITHHOLDING_QC = {
    bracket1: { upTo: 5000,  fed: 0.05, qc: 0.14, combined: 0.19 },
    bracket2: { upTo: 15000, fed: 0.10, qc: 0.14, combined: 0.24 },
    bracket3: { upTo: Infinity, fed: 0.15, qc: 0.14, combined: 0.29 },
} as const;

/**
 * Retourne le gross + withholding pour retirer `netNeeded` du REER (résident QC).
 * §7.E.2 : on garde la signature historique (compatibilité) mais on rajoute
 * une variante typée par tranche pour les nouveaux consumers.
 *
 * Note : les anciens taux 21/26/30 étaient des approximations combinées
 * historiques. La décomposition réelle est 19/24/29 (QC). Le delta est mineur
 * mais cumulé à 30 ans il représente ~1 000-3 000$ par retraité.
 */
export const calculateGrossWithholdingRRSP = (netNeeded: number): { gross: number, withholding: number, bracket: 1 | 2 | 3 } => {
    if (netNeeded <= 0) return { gross: 0, withholding: 0, bracket: 1 };
    let grossAttempt = netNeeded / (1 - RRSP_WITHHOLDING_QC.bracket1.combined);
    if (grossAttempt <= RRSP_WITHHOLDING_QC.bracket1.upTo) {
        return { gross: grossAttempt, withholding: grossAttempt * RRSP_WITHHOLDING_QC.bracket1.combined, bracket: 1 };
    }
    grossAttempt = netNeeded / (1 - RRSP_WITHHOLDING_QC.bracket2.combined);
    if (grossAttempt <= RRSP_WITHHOLDING_QC.bracket2.upTo) {
        return { gross: grossAttempt, withholding: grossAttempt * RRSP_WITHHOLDING_QC.bracket2.combined, bracket: 2 };
    }
    grossAttempt = netNeeded / (1 - RRSP_WITHHOLDING_QC.bracket3.combined);
    return { gross: grossAttempt, withholding: grossAttempt * RRSP_WITHHOLDING_QC.bracket3.combined, bracket: 3 };
};

/**
 * Retenue à la source pour un retrait REER dont on connaît déjà le BRUT (résident
 * QC) — inverse de `calculateGrossWithholdingRRSP` (qui part du net). Même source
 * de vérité (`RRSP_WITHHOLDING_QC`, 19/24/29 %), tranche déterminée sur le brut.
 * Utilisé par le meltdown REER (qui cible un brut, pas un net).
 */
export const withholdingForGrossRRSP = (gross: number): { withholding: number; rate: number; bracket: 1 | 2 | 3 } => {
    if (gross <= 0) return { withholding: 0, rate: RRSP_WITHHOLDING_QC.bracket1.combined, bracket: 1 };
    if (gross <= RRSP_WITHHOLDING_QC.bracket1.upTo) {
        return { withholding: gross * RRSP_WITHHOLDING_QC.bracket1.combined, rate: RRSP_WITHHOLDING_QC.bracket1.combined, bracket: 1 };
    }
    if (gross <= RRSP_WITHHOLDING_QC.bracket2.upTo) {
        return { withholding: gross * RRSP_WITHHOLDING_QC.bracket2.combined, rate: RRSP_WITHHOLDING_QC.bracket2.combined, bracket: 2 };
    }
    return { withholding: gross * RRSP_WITHHOLDING_QC.bracket3.combined, rate: RRSP_WITHHOLDING_QC.bracket3.combined, bracket: 3 };
};

// Plafonds CELI annuels. 2009-2026 = montants officiels confirmés (ARC).
// 2027-2030 = estimations à indexation ~2%/an (arrondies à 500$) — à
// remplacer par les vrais montants annoncés à chaque Budget fédéral.
export const CELI_ANNUAL_LIMITS: Record<number, number> = {
    2009: 5000, 2010: 5000, 2011: 5000, 2012: 5000,
    2013: 5500, 2014: 5500, 2015: 10000,
    2016: 5500, 2017: 5500, 2018: 5500,
    2019: 6000, 2020: 6000, 2021: 6000, 2022: 6000,
    2023: 6500, 2024: 7000, 2025: 7000,
    2026: 7000, 2027: 7500, 2028: 7500, 2029: 7500, 2030: 7500,
};

// FA-8 (2026-06-11) — dernière année où le plafond CELI est CONNU dans la table ci-dessus.
// Au-delà : extrapolation indexée arrondie au 500 $ (mécanisme légal d'indexation du plafond).
// Source unique partagée par taxJanuary (moteur — indexe par simInflation) et calculateCeliRoom
// (droits historiques hors moteur — hypothèse ~2 %/an, ADR 009). Étendre la table suffit :
// les deux consommateurs suivent automatiquement.
export const LAST_KNOWN_CELI_YEAR = Math.max(...Object.keys(CELI_ANNUAL_LIMITS).map(Number));

// Plafonds REER annuels. 2010-2026 = montants officiels (ARC). 2027-2030 =
// estimations indexées ~2%/an — à mettre à jour au Budget fédéral.
export const RRSP_ANNUAL_LIMITS: Record<number, number> = {
    2010: 22000, 2011: 22450, 2012: 22970, 2013: 23820, 2014: 24270,
    2015: 24930, 2016: 25370, 2017: 26010, 2018: 26230, 2019: 26500,
    2020: 27230, 2021: 27830, 2022: 29210, 2023: 30780, 2024: 31560,
    2025: 32490,
    2026: 33810, 2027: 34480, 2028: 35170, 2029: 35870, 2030: 36590,
};

// Plafond REER de repli pour une année HORS table (ex. années en sol canadien avant 2010, lors du
// calcul des droits historiques). Source unique (évite la recopie en dur du 32490 ailleurs —
// FISC-CONST-LINT). = plafond 2025 ; conserve le comportement existant de setupSimulation.
export const RRSP_ANNUAL_LIMIT_FALLBACK = 32490;

/**
 * Année de début de résidence fiscale canadienne, utilisée pour les droits de
 * cotisation (CELI/REER) et la résidence PSV.
 * - Non-immigrant (résident de naissance) : retourne l'année de naissance ;
 *   combiné au plancher `birthYear + 18` côté appelant, ça donne le droit
 *   complet depuis 18 ans / 2009.
 * - Immigrant : l'année d'arrivée déclarée. Le droit CELI et la résidence PSV
 *   ne commencent à s'accumuler qu'à partir de cette date.
 */
export const getResidencyStartYear = (
    birthYear: number,
    isImmigrant: boolean | undefined,
    canadaArrivalYear: number | undefined,
): number => (isImmigrant && canadaArrivalYear ? canadaArrivalYear : birthYear);

export const calculateCeliRoom = (birthYear: number, arrivalYear: number, currentYear: number): number => {
    let room = 0;
    const yearTurning18 = birthYear + 18;
    const startYear = Math.max(2009, Math.max(yearTurning18, arrivalYear));

    // FA-8 (2026-06-11) — années au-delà de la table : MÊME formule d'extrapolation que le moteur
    // (taxJanuary.processJanuaryReset, FA-4) : dernière limite CONNUE × (1+i)^Δ, arrondie au 500 $
    // (mécanisme légal d'indexation du plafond CELI). Hors moteur de projection (pas de simInflation
    // ici), i = hypothèse standard ~2 %/an (ADR 009 / FISCAL_REFERENCE « Indexation 2027+ »).
    // Avant : `base2030 = 7500` en dur + fallback `|| 7500` NON indexé — divergeait de la table et
    // de taxJanuary dès qu'on étendait CELI_ANNUAL_LIMITS. Le `?? lastKnownLimit` est un filet
    // (la table est dense 2009→LAST_KNOWN_CELI_YEAR — jamais atteint en pratique).
    const lastKnownLimit = CELI_ANNUAL_LIMITS[LAST_KNOWN_CELI_YEAR];
    for (let y = startYear; y <= currentYear; y++) {
        if (y > LAST_KNOWN_CELI_YEAR) {
            const rawLimit = lastKnownLimit * Math.pow(1.02, y - LAST_KNOWN_CELI_YEAR);
            room += Math.round(rawLimit / 500) * 500;
        } else {
            room += CELI_ANNUAL_LIMITS[y] ?? lastKnownLimit;
        }
    }
    return room;
};

export const calculateCeliAvailableRoom = (birthYear: number, arrivalYear: number, currentYear: number, currentCeliBalance: number): number => {
    const totalHistoricalRoom = calculateCeliRoom(birthYear, arrivalYear, currentYear);
    return Math.max(0, totalHistoricalRoom - currentCeliBalance);
};

type BracketBreakdown = {
    rate: string;
    amount: number;
    filled: number;
    max: number | string;
    percentFull: number;
};

export const calculateDetailedTax = (income: number, brackets: typeof FED_BRACKETS, skipBreakdown: boolean = false) => {
    income = Number(income) || 0;
    let totalTax = 0;
    let previousLimit = 0;
    // Fix: typage explicite pour eviter TS7005 implicit any[]
    const breakdown: BracketBreakdown[] | undefined = skipBreakdown ? undefined : [];

    for (let i = 0; i < brackets.length; i++) {
        const bracket = brackets[i];
        // Le revenu ne remplit pas ce palier. En mode détaillé on l'affiche
        // quand même (rempli à 0) pour la barre de progression ; sinon on
        // arrête la boucle puisque tous les paliers suivants seront vides aussi.
        if (income <= previousLimit) {
            if (!skipBreakdown) {
                breakdown!.push({ rate: bracket.label, amount: 0, filled: 0, max: bracket.upTo === Infinity ? '∞' : bracket.upTo - previousLimit, percentFull: 0 });
            } else {
                break;
            }
            continue;
        }

        const currentBracketRange = bracket.upTo - previousLimit;
        const taxableInThisBracket = Math.min(Math.max(0, income - previousLimit), currentBracketRange);

        const taxInBracket = taxableInThisBracket * bracket.rate;
        totalTax += taxInBracket;

        if (!skipBreakdown) {
            breakdown!.push({
                rate: bracket.label,
                amount: taxInBracket,
                filled: taxableInThisBracket,
                max: bracket.upTo === Infinity ? '∞' : currentBracketRange,
                percentFull: bracket.upTo === Infinity ? 100 : Math.min(100, (taxableInThisBracket / currentBracketRange) * 100)
            });
        }

        previousLimit = bracket.upTo;
    }
    return { totalTax, breakdown };
};

const bracketsCache: Record<string, {
    fed: typeof FED_BRACKETS,
    qc: typeof QC_BRACKETS,
    basicFed: number,
    basicQc: number,
    inflationFactor: number
}> = {};

/**
 * [FISC-BRACKET-REALINDEX] `realDeflator` (optionnel, défaut 1 = rétrocompat bit-identique) :
 * quand l'APPELANT calcule en dollars RÉELS (taxDecember déflate le revenu par (1+i)^Δ puis
 * re-nominalise), les paliers/montants indexés 1,02^Δ NOMINAUX doivent être ramenés au même
 * espace — palier_réel = palier_2026 × 1,02^Δ / (1+i)^Δ. Sans ça, les paliers s'élargissaient de
 * 2 %/an EN DOLLARS RÉELS quel que soit i (mesuré : l'impôt réel d'un revenu réel constant fondait
 * de 24 932 → 16 740 $/pers à l'an 30 — sens NON conservateur). Tout ce qui dérive du facteur
 * (paliers, BPA, crédits d'âge, ligne 361, RAMQ, FSS) suit automatiquement.
 */
const getIndexedBracketsForYear = (year: number, realDeflator: number = 1) => {
    const deflator = Number.isFinite(realDeflator) && realDeflator > 0 ? realDeflator : 1;
    const cacheKey = deflator === 1 ? String(year) : `${year}|${deflator.toPrecision(12)}`;
    if (bracketsCache[cacheKey]) return bracketsCache[cacheKey];
    const inflationFactor = Math.pow(1.02, Math.max(0, year - TAX_BASE_YEAR)) / deflator;
    const indexedFed = FED_BRACKETS.map(b => ({ ...b, upTo: b.upTo === Infinity ? Infinity : b.upTo * inflationFactor }));
    const indexedQc = QC_BRACKETS.map(b => ({ ...b, upTo: b.upTo === Infinity ? Infinity : b.upTo * inflationFactor }));
    const basicFed = BASIC_PERSONAL_AMOUNT_FED * inflationFactor;
    const basicQc = BASIC_PERSONAL_AMOUNT_QC * inflationFactor;
    bracketsCache[cacheKey] = { fed: indexedFed, qc: indexedQc, basicFed, basicQc, inflationFactor };
    return bracketsCache[cacheKey];
};

/**
 * Plafond du 1er palier COMBINÉ (le plus restrictif QC/féd), indexé à `year` (×1,02/an, MÊME
 * indexation que l'impôt réel via getIndexedBracketsForYear). Sert à la récolte de gains
 * (remplir le palier bas en revenu NOMINAL) → cohérent avec le calcul d'impôt du moteur.
 */
export const firstCombinedBracketTopForYear = (year: number): number => {
    const { fed, qc } = getIndexedBracketsForYear(year);
    return Math.min(qc[0].upTo, fed[0].upTo);
};

// Abattement du Québec : un résident du QC voit son impôt fédéral réduit de
// 16,5 %. Ottawa « rétrocède » ce pourcentage à Québec (héritage des points
// d'impôt de 1965). On l'applique partout où on calcule le fédéral net au QC.
const QC_FEDERAL_ABATEMENT_RATE = 0.165;

export const getMarginalRate = (income: number, year: number = 2026, realDeflator: number = 1) => {
    // GUARD-NAN — un income NON FINI (NaN/Infinity, bug amont) ne matche aucun palier (`income <= upTo`
    // toujours faux) → tombait SILENCIEUSEMENT sur le taux MAX via `|| 0.33`. On le rabat sur 0 (1er
    // palier) : dégradation PRÉVISIBLE et bornée plutôt qu'un taux marginal plein fantôme. `utils/tax.ts`
    // reste sans dépendance (pas de logError importé ici) — le repli explicite EST le signal.
    const safeIncome = Number.isFinite(income) ? income : 0;
    const { fed, qc } = getIndexedBracketsForYear(year, realDeflator);
    const fedRate = fed.find(b => safeIncome <= b.upTo)?.rate || 0.33;
    const qcRate = qc.find(b => safeIncome <= b.upTo)?.rate || 0.2575;
    // Fédéral effectif au QC = taux fédéral diminué de l'abattement de 16,5 %.
    const effectiveFedRate = fedRate * (1 - QC_FEDERAL_ABATEMENT_RATE);
    return effectiveFedRate + qcRate;
};

export type FiscalReport = ReturnType<typeof calculateFiscalReport>;

export const calculateFiscalReport = (
    grossIncome: number,
    rrspContribution: number,
    fhsaContribution: number,
    year: number = 2026,
    skipBreakdown: boolean = false,
    ageOpts?: AgeCreditOptions,
    // [FISC-PAYROLL-BASE-INVEST] Assiette d'EMPLOI (RRQ/RQAP/AE) — DISTINCTE de l'assiette imposable
    // (`grossIncome`, qui inclut légitimement le revenu de placement pour les paliers d'impôt). Les
    // cotisations RRQ/RQAP/AE ne portent QUE sur le revenu de TRAVAIL ; les inclure sur le placement
    // les gonfle quand le salaire est sous les maximums (RRQ ~74,6 k, AE ~68,9 k, RQAP ~103 k). Absent
    // (`undefined`) → défaut = `grossIncome` : rétrocompat TOTALE pour les appelants dont le gross EST
    // le salaire (moteur de projection, PDF, viz…). Une valeur explicite (même 0) est respectée.
    employmentIncome?: number,
    // [FISC-BRACKET-REALINDEX] déflateur (1+i)^Δ quand `grossIncome` est en dollars RÉELS
    // (taxDecember déflate les revenus par ctx.inflationFactor avant d'appeler ici). Défaut 1 =
    // espace nominal, rétrocompat bit-identique. Propagé aux paliers, BPA et crédits d'âge.
    realDeflator: number = 1,
) => {
    grossIncome = Number(grossIncome) || 0;
    rrspContribution = Number(rrspContribution) || 0;
    fhsaContribution = Number(fhsaContribution) || 0;
    // Rétrocompat : absent → grossIncome. Fourni → coercé ; NaN/Infinity → 0 (repli BORNÉ et VOLONTAIRE,
    // même discipline que getMarginalRate : utils/tax.ts n'importe jamais logError — le repli explicite EST
    // le signal). Les 2 appelants vivants (TaxCenter uGross, get_tax_situation g filtré > 0) sont pré-assainis
    // en amont ; un futur appelant qui brancherait un employmentIncome non validé doit loguer côté appelant.
    const employmentBase = employmentIncome === undefined ? grossIncome : (Number(employmentIncome) || 0);
    const { fed: indexedFedBrackets, qc: indexedQcBrackets, basicFed: indexedBasicFed, basicQc: indexedBasicQc } = getIndexedBracketsForYear(year, realDeflator);

    const netTaxable = Math.max(0, grossIncome - rrspContribution - fhsaContribution);

    // Crédits 65+ et revenu de retraite (audit §6.2). Calculés une seule fois,
    // appliqués au fédéral AVANT l'abatement QC et au provincial APRÈS le BPA.
    // L'année est propagée pour indexer seuils et montants ligne 361 + ligne 30100.
    const ageCredits = ageOpts
        ? calculateAgeAndPensionCredits(ageOpts, netTaxable, year, realDeflator)
        : { fedCredit: 0, qcCredit: 0 };

    const fedData = calculateDetailedTax(netTaxable, indexedFedBrackets, skipBreakdown);
    let fedTax = fedData.totalTax;
    // Crédit non-remboursable BPA fédéral: l'ARC maintient le crédit au taux le plus
    // bas applicable, soit 15% (gelé), malgré la baisse du 1er palier à 14% (C-4).
    fedTax -= (indexedBasicFed * FED_NONREFUNDABLE_RATE);
    // §6.2 — crédits âge fédéral + pension fédéral (appliqués AVANT abatement QC).
    // Le clamp final à 0 sur totalTax couvre déjà le cas où fedTax devient négatif.
    fedTax -= ageCredits.fedCredit;
    const abatement = fedTax * QC_FEDERAL_ABATEMENT_RATE;
    fedTax -= abatement;

    const qcData = calculateDetailedTax(netTaxable, indexedQcBrackets, skipBreakdown);
    let qcTax = qcData.totalTax;
    qcTax -= (indexedBasicQc * QC_NONREFUNDABLE_RATE);
    // §6.2 — ligne 361 QC (âge + revenu retraite, réduite par revenu familial)
    qcTax -= ageCredits.qcCredit;

    // [FISC-PAYROLL-BASE-INVEST] cotisations sur l'assiette d'EMPLOI (salaire), jamais sur le placement.
    const rrqBase = Math.max(0, Math.min(employmentBase, RRQ_MPE) - RRQ_EXEMPTION);
    const rrqVolet1 = Math.min(RRQ_MAX, rrqBase * RRQ_RATE);

    const rrqBaseVolet2 = Math.max(0, Math.min(employmentBase, RRQ_YAMPE) - RRQ_MPE);
    const rrqVolet2 = rrqBaseVolet2 * RRQ_PART2_RATE;
    const rrq = rrqVolet1 + rrqVolet2;

    const rqap = Math.min(RQAP_MAX, Math.min(employmentBase, RQAP_MAX_INCOME) * RQAP_RATE);
    const ae = Math.min(AE_MAX_QC, Math.min(employmentBase, AE_MAX_INCOME) * AE_RATE_QC);

    const totalTax = Math.max(0, fedTax) + Math.max(0, qcTax);
    const totalDeductions = totalTax + rrq + rqap + ae;
    const netIncome = grossIncome - totalDeductions;

    const marginalRate = getMarginalRate(netTaxable);

    return {
        fedTax: Math.max(0, fedTax),
        qcTax: Math.max(0, qcTax),
        deductionsSource: rrq + rqap + ae,
        rrq, rrqVolet1, rrqVolet2, rqap, ae,
        totalTax,
        netIncome,
        marginalRate,
        averageRate: grossIncome > 0 ? (totalTax / grossIncome) * 100 : 0,
        fedBreakdown: fedData.breakdown,
        qcBreakdown: qcData.breakdown,
        refundOrOwe: 0
    };
};

export const calculateNetFromGross = (monthlyGross: number) => {
    const annualGross = monthlyGross * 12;
    const report = calculateFiscalReport(annualGross, 0, 0);
    return report.netIncome / 12;
};

// Inverse de calculateNetFromGross : trouve le revenu BRUT annuel qui produit
// un NET cible donné. L'impôt n'a pas d'inverse analytique simple (paliers +
// crédits), donc on cherche par dichotomie sur [net, high].
//
// ITEM 2b — la borne haute était figée à 2×net. Or, dès que le taux moyen dépasse
// 50 % (très hauts revenus : ~600 k$ net au QC), le brut requis est > 2×net et la
// dichotomie convergeait vers la borne (brut sous-estimé de plusieurs milliers à
// > 100 k$). On EXPAND désormais la borne haute (doublements successifs) jusqu'à ce
// que net(high) dépasse la cible, garantissant que la racine est encerclée avant la
// dichotomie. Le taux moyen tend vers le marginal max (~53 % au QC) sans jamais
// l'atteindre → net(high) > target finit toujours par être vrai ; la garde
// d'itérations borne le pire cas.
export const calculateGrossFromNet = (targetNetAnnual: number): number => {
    if (targetNetAnnual <= 0) return 0;
    const low0 = targetNetAnnual;
    let high = targetNetAnnual * 2;

    // Expansion de la borne haute : tant que net(high) reste sous la cible, on
    // double. Plafond d'expansion (40 doublements ≈ ×10^12) = garde-fou anti-boucle
    // si la fonction n'était pas monotone/atteignable (ne devrait jamais arriver).
    let expand = 0;
    while (calculateFiscalReport(high, 0, 0).netIncome < targetNetAnnual && expand < 40) {
        high *= 2;
        expand++;
    }

    let low = low0;
    let iterations = 0;
    while (iterations < 40) {
        const mid = (low + high) / 2;
        const net = calculateFiscalReport(mid, 0, 0).netIncome;
        if (Math.abs(net - targetNetAnnual) < 1) return mid;
        if (net < targetNetAnnual) {
            low = mid;
        } else {
            high = mid;
        }
        iterations++;
    }
    return (low + high) / 2;
};

// Signature préservée pour compat — paramètres activeUsersCount/otherGainsThisYear
// ignorés depuis l'annulation de la proposition fédérale 66.67% > 250k$ (mars 2025).
export const calculateCapitalGainsTax = (realizedGain: number, marginalRate: number, _activeUsersCount: number = 1, _otherGainsThisYear: number = 0): number => {
    if (realizedGain <= 0) return 0;
    return realizedGain * CAPITAL_GAINS_INCLUSION_STANDARD * marginalRate;
};

export type DividendKind = 'eligible' | 'non-eligible';

// Taux de majoration (gross-up) du dividende selon le type. Exposé pour permettre
// au moteur de calculer le montant MAJORÉ à empiler progressivement (ITEM 2d) avec
// exactement le même taux que calculateDividendTax → cohérence garantie.
export const getDividendGrossUpRate = (kind: DividendKind = 'eligible'): number =>
    kind === 'eligible' ? 1.38 : 1.15;

// Dividendes 2026 (Québec):
// - Admissibles (grandes sociétés cotées): gross-up 38%, CID fédéral 15.0198% + CID QC 11.7% du majoré
// - Non-admissibles (SPCC, sociétés privées): gross-up 15%, CID fédéral 9.0301% + CID QC 3.42% du majoré
//
// ITEM 2d — empilement PROGRESSIF (comme B-AUDIT-2 pour les gains). Le dividende
// MAJORÉ s'empile sur le revenu : son impôt « brut » doit être l'impôt INCRÉMENTAL
// de la bande [revenu, revenu+majoré], PAS le montant majoré × un taux marginal PLAT
// au niveau du revenu de base (qui sous-estime quand le dividende franchit un palier,
// voire renvoie 0 à cause du crédit d'impôt pour dividende quand le revenu de base est
// bas). Le caller passe ce `progressiveGrossTax` ; le crédit (CID) reste calculé ici
// sur le montant majoré → un seul endroit pour les taux. Sans override → ancien calcul
// plat (rétro-compat : montant majoré × marginalRate).
export const calculateDividendTax = (
    dividendAmount: number,
    marginalRate: number,
    kind: DividendKind = 'eligible',
    progressiveGrossTax?: number,
): number => {
    if (dividendAmount <= 0) return 0;
    const grossUpRate = getDividendGrossUpRate(kind);
    const cidFedRate = kind === 'eligible' ? 0.150198 : 0.090301;
    const cidQcRate = kind === 'eligible' ? 0.117 : 0.0342;
    const grossedUpAmount = dividendAmount * grossUpRate;
    const grossTax = (progressiveGrossTax !== undefined && Number.isFinite(progressiveGrossTax))
        ? Math.max(0, progressiveGrossTax)
        : grossedUpAmount * marginalRate;
    // [FISC-DTC-ABATEMENT-ORDER] Le CID FÉDÉRAL est un crédit non remboursable fédéral : au Québec
    // il est soustrait de l'impôt fédéral AVANT l'abattement de 16,5 %, donc sa valeur effective
    // est réduite d'autant — exactement comme le BPA et les crédits d'âge (calculateFiscalReport,
    // `fedTax -= …` PUIS `abatement`). Ici, `grossTax` sort déjà de calculateFiscalReport, donc
    // net d'abattement : retrancher le CID fédéral à 100 % le sur-créditait de 16,5 % (mesuré :
    // 256,50 $/an sur 7 500 $ de dividendes admissibles). Le CID QUÉBEC n'est pas concerné —
    // l'abattement ne touche que le fédéral.
    const cidAmount = grossedUpAmount * (cidFedRate * (1 - QC_FEDERAL_ABATEMENT_RATE) + cidQcRate);
    return Math.max(0, grossTax - cidAmount);
};
