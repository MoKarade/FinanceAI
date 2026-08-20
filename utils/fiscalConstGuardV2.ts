// utils/fiscalConstGuardV2.ts
//
// [FISC-CONST-GUARD-V2] Deuxième garde des constantes fiscales — celui qui ferme le trou par
// lequel `0.92` est passé.
//
// Le garde EXISTANT (`FISC-CONST-LINT`) interdit de RECOPIER un littéral de `utils/tax.ts` ailleurs.
// Il est aveugle au cas inverse, qui est celui qui a mordu : une constante fiscale **NOUVELLE**,
// écrite directement dans le moteur, qui n'a jamais existé dans la source unique — donc que rien
// ne compare à rien. `estimatedWithholding = totalEmployerTax * 0.92` a vécu ainsi, sans source.
//
// ⚠️ POURQUOI UN RATCHET ET PAS UN ÉCHEC DUR. Le périmètre a été MESURÉ avant d'écrire une ligne
// (leçon « resserrer le scan AVANT de coder le fix ») : **38 littéraux** en position arithmétique
// sur les 6 modules fiscaux. Un échec dur aurait cassé d'emblée sur 38 lignes — donc aurait été
// relâché jusqu'à ne plus rien attraper. Le ratchet inventorie l'existant AVEC SA RAISON, et
// échoue sur tout NOUVEAU. Le tri lui-même est la valeur : il a révélé un vrai plafond fiscal en
// dur (`0.18`, le 18 % du revenu gagné pour les droits REER) noyé au milieu d'heuristiques de
// conception qu'il ne faut surtout PAS traiter comme fiscales.
//
// ⚠️ INVENTAIRE CLÉ PAR (fichier, valeur), PAS PAR LIGNE : un numéro de ligne dérive au premier
// refactor et rendrait le garde bruyant pour rien. Le prix assumé : une DEUXIÈME occurrence de la
// même valeur dans le même fichier passe. C'est le bon compromis — la classe d'erreur visée est
// « une constante fiscale NOUVELLE apparaît », pas « elle est dupliquée ».

/** Familles de tri — le classement est le cœur du ticket, pas le scan. */
export type FiscalConstFamily =
    /** Vrai paramètre fiscal ARC/RQ : DOIT finir dans `docs/FISCAL_REFERENCE.md`. */
    | 'fiscal'
    /** Heuristique de CONCEPTION (seuil de stratégie, pas de barème) : ne jamais « sourcer ». */
    | 'design'
    /** Structurel (index de mois, pas de solveur…) : hors périmètre fiscal. */
    | 'structural';

export interface InventoryEntry {
    /** Chemin repo-relatif, séparateurs `/`. */
    file: string;
    /** Littéral tel qu'il apparaît, normalisé sans `_` (ex. `100000`). */
    value: string;
    family: FiscalConstFamily;
    /** Pourquoi cette valeur est là. Une entrée sans raison lisible ne vaut rien. */
    reason: string;
}

/**
 * Inventaire figé au 2026-08-05, chaque entrée triée à la main contre le code.
 *
 * ⚠️ Ce n'est PAS une liste d'exemptions : c'est un CONSTAT daté. Les entrées `fiscal` sont une
 * DETTE — chacune doit finir ancrée dans `docs/FISCAL_REFERENCE.md`, et disparaître d'ici en étant
 * remplacée par un import depuis la source unique.
 */
// ⚠️ 2026-08-06 — TROIS entrées ONT ÉTÉ RETIRÉES parce qu'elles sont RÉSOLUES, pas exemptées :
// `0.18` (droits REER), `500` (arrondi CELI) et `0.20` (plateau FERR) vivent désormais dans la
// source unique (`utils/tax.ts` / `helpers.ts`), sont ancrées dans FISCAL_REFERENCE et importées.
// Le littéral ayant disparu du module scanné, l'entrée n'a plus d'objet — c'est la façon dont
// cet inventaire est censé DÉCROÎTRE. [FISC-CONST-ANCHOR-DEBT]
// ⚠️ 2026-08-20 — DEUX entrées de plus retirées pour la même raison : `1.35` (le facteur brut/net
// plat) a disparu de `setupSimulation.ts` ET de `useFinanceStore.ts`, remplacé par
// `calculateGrossFromNet` ([MIGRATE-GROSS-135]). Ce sont les gardes anti-fantôme livrées la veille
// qui l'ont EXIGÉ : elles ont rougi au moment même où la dette était payée. C'est exactement le
// comportement attendu d'un registre censé décroître.
export const FISCAL_CONST_INVENTORY: readonly InventoryEntry[] = [
    // ── services/projection/taxJanuary.ts ────────────────────────────────────────────────────
    { file: 'services/projection/taxJanuary.ts', value: '2026', family: 'fiscal',
      reason: 'Année d’ancrage dans RRSP_ANNUAL_LIMITS pour l’extrapolation au-delà du barème connu.' },
    { file: 'services/projection/taxJanuary.ts', value: '18', family: 'fiscal',
      reason: '[×2] Âge d’ouverture des droits CELI / admissibilité CELIAPP.' },
    { file: 'services/projection/taxJanuary.ts', value: '71', family: 'fiscal',
      reason: '[≠4] DEUX RÈGLES ARC distinctes sous la même clé — ma marque `[×4]` prétendait à tort qu’elles avaient le même sens. `closureForcedBy71` / éligibilité CELIAPP : fermeture obligatoire du CELIAPP/FHSA au 31 décembre de l’année des 71 ans (le commentaire du bloc FHSA cite l’audit §6.10). `rrspRoomDelta` / `rrspRoomReset` : arrêt de l’accumulation des droits REER et remise à zéro, corollaire de la conversion REER → FERR. Deux dispositions qui partagent un âge et peuvent bouger indépendamment.' },
    { file: 'services/projection/taxJanuary.ts', value: '15', family: 'fiscal',
      reason: '[×2] Durée de vie maximale du CELIAPP (15 ans depuis l’ouverture, ARC).' },
    { file: 'services/projection/taxJanuary.ts', value: '0.25', family: 'design',
      reason: 'PROXY de modèle : inverse l’impôt sur gains vers le gain BRUT en supposant un taux effectif de 25 % (inclusion 50 % × marginal 50 %). Combine un vrai paramètre et un marginal SUPPOSÉ → approximation, jamais un taux statutaire à sourcer.' },
    { file: 'services/projection/taxJanuary.ts', value: '0.95', family: 'design',
      reason: 'Seuil de gel Guyton-Klinger (−5 % du portefeuille). Heuristique de stratégie ; cf. [ENG-GK-THRESHOLD-KNIFE].' },

    // ── services/projection/taxApril.ts ─────────────────────────────────────────────────────
    { file: 'services/projection/taxApril.ts', value: '30', family: 'fiscal',
      reason: 'TAX_DUE_DAY : date limite de PAIEMENT du solde d’impôt des particuliers — le 30 avril (ARC et Revenu Québec). Ancrée dans FISCAL_REFERENCE §1 (échéances).' },

    // ── services/projection/taxDecember.ts ───────────────────────────────────────────────────
    { file: 'services/projection/taxDecember.ts', value: '65', family: 'fiscal',
      reason: '[≠3] TROIS dispositions distinctes, dont une que ma marque `[×3]` passait sous silence. Gate de `computeOasClawback` — âge d’ouverture de la PSV. `mkActiveAgeOpts` — crédit en raison de l’âge (§4). Gate `dbRealUser` du revenu de pension admissible / fractionnement (§4 et §6). ⚠️ Et il n’y a AUCUN « pivot RRQ » dans ce fichier : cette mention de ma première raison était fausse.' },
    { file: 'services/projection/taxDecember.ts', value: '0.50', family: 'design',
      reason: 'Fraction de vente FICTIVE servant à estimer la récolte de pertes — pas un taux d’inclusion.' },
    { file: 'services/projection/taxDecember.ts', value: '40', family: 'design',
      reason: 'Nombre de pas du solveur numérique (STEPS). Paramètre d’algorithme.' },
    { file: 'services/projection/taxDecember.ts', value: '100000', family: 'design',
      reason: 'APRIL_SETTLEMENT_FLOOR_REAL — plancher de garde du remboursement d’avril, documenté PR #563. Borne de robustesse, pas un barème.' },
    { file: 'services/projection/taxDecember.ts', value: '11', family: 'structural',
      reason: '[×3] Index du mois de DÉCEMBRE (0-based). Aucun rapport avec la fiscalité.' },

    // ── services/projection/retirementIncome.ts ──────────────────────────────────────────────
    { file: 'services/projection/retirementIncome.ts', value: '65', family: 'fiscal',
      reason: '[×2] Âge pivot RRQ et PSV — base des facteurs d’ajustement/report.' },
    { file: 'services/projection/retirementIncome.ts', value: '70', family: 'fiscal',
      reason: 'Âge maximal de report de la PSV.' },
    { file: 'services/projection/retirementIncome.ts', value: '72', family: 'fiscal',
      reason: 'Âge maximal de report de la rente RRQ.' },
    { file: 'services/projection/retirementIncome.ts', value: '75', family: 'fiscal',
      reason: 'Bonification de la PSV à compter de 75 ans.' },
    { file: 'services/projection/retirementIncome.ts', value: '39', family: 'fiscal',
      reason: 'RRQ_DENOMINATOR_YEARS — déjà une constante NOMMÉE, dénominateur du calcul de rente.' },
    { file: 'services/projection/retirementIncome.ts', value: '40', family: 'fiscal',
      reason: 'PSV_FULL_RESIDENCY_YEARS — déjà une constante NOMMÉE, résidence requise pour la PSV pleine.' },

    // Trouvés PAR LE RATCHET lui-même, pas par le tri manuel — la démonstration que le scan
    // élargi aux replis (`||`) attrape ce que l'œil laisse passer.
    { file: 'services/projection/taxJanuary.ts', value: '30', family: 'structural',
      reason: '[×3] Âge par DÉFAUT quand ni birthYear ni age ne sont saisis (`u.age || 30`). Valeur de repli d’UI, aucun rapport avec un barème.' },
    { file: 'services/projection/retirementIncome.ts', value: '30', family: 'structural',
      reason: 'Même repli d’âge par défaut que taxJanuary — dupliqué, mais structurel et non fiscal.' },

    // ── services/projection/helpers.ts + setupSimulation.ts ─────────────────────────────────
    // Révélés le 2026-08-06 en ÉLARGISSANT le scan à ces deux modules (finding F5). Aucun n'est
    // un paramètre ARC/RQ : ce sont des hypothèses de MODÈLE et de la mécanique numérique.
    { file: 'services/projection/helpers.ts', value: '0.20', family: 'fiscal',
      reason: 'RRIF_RATE_PLATEAU — facteur de retrait minimum FERR au plateau 95+. ANCRÉ dans FISCAL_REFERENCE et importé ; l’entrée reste pour que le garde couvre sa nouvelle adresse.' },
    { file: 'services/projection/helpers.ts', value: '71', family: 'fiscal',
      reason: 'RRSP_TO_RRIF_CONVERSION_AGE — conversion REER→FERR obligatoire à la fin de l’année des 71 ans (ARC), et par conséquent plancher de RRIF_RATES. DISTINCT de RRIF_FIRST_WITHDRAWAL_AGE (72) : conversion et premier retrait forcé sont deux règles séparées d’un an, les fusionner effacerait le cas de la conversion volontaire précoce.' },
    { file: 'services/projection/helpers.ts', value: '72', family: 'fiscal',
      reason: 'RRIF_FIRST_WITHDRAWAL_AGE — premier retrait FERR minimum obligatoire. Rapatrié depuis taxJanuary ET taxDecember (leurs entrées sont RETIRÉES) : la valeur vivait en dur sur deux modules, la configuration jumelle exacte qui avait laissé survivre le 0.18.' },
    { file: 'services/projection/helpers.ts', value: '0.30', family: 'design',
      reason: 'NONREG_DIVIDEND_DISTRIBUTION_SHARE — part du rendement non-enregistré supposée distribuée en dividendes. Hypothèse de modélisation, pas un barème.' },
    { file: 'services/projection/helpers.ts', value: '0.0020', family: 'design',
      reason: 'MER — frais de gestion annuels supposés du portefeuille. Paramètre de simulation.' },
    { file: 'services/projection/helpers.ts', value: '4294967296', family: 'structural',
      reason: '2^32 — normalisation du générateur pseudo-aléatoire (mulberry32). Mécanique numérique.' },
    { file: 'services/projection/helpers.ts', value: '2.0', family: 'structural',
      reason: 'Constante de la transformation de Box-Muller (loi normale). Mathématique, pas fiscale.' },
    { file: 'services/projection/helpers.ts', value: '65', family: 'design',
      reason: '[≠2] Seuil d’âge présent DANS LES DEUX courbes : `ltcAnnualProbability` (calibrée Genworth/StatCan, cf. D2.8) et `mortalityAnnualProbability` (Stats Canada 2020-2022). Ma marque `[×2]` n’en nommait qu’une. Hypothèses de RISQUE dans les deux cas, jamais un âge fiscal.' },
    { file: 'services/projection/helpers.ts', value: '70', family: 'design',
      reason: '[≠2] Palier d’âge présent DANS LES DEUX courbes : `ltcAnnualProbability` et `mortalityAnnualProbability` (« Stats Canada 2020-2022, unisexe lissé »). Ma marque `[×2]` ne décrivait que la LTC. Même famille pour les deux — hypothèses de RISQUE calibrées, jamais des âges fiscaux.' },
    { file: 'services/projection/helpers.ts', value: '75', family: 'design',
      reason: '[≠2] Palier d’âge présent DANS LES DEUX courbes : `ltcAnnualProbability` et `mortalityAnnualProbability` (« Stats Canada 2020-2022, unisexe lissé »). Ma marque `[×2]` ne décrivait que la LTC. Même famille pour les deux — hypothèses de RISQUE calibrées, jamais des âges fiscaux.' },
    { file: 'services/projection/helpers.ts', value: '80', family: 'design',
      reason: '[≠2] Palier d’âge présent DANS LES DEUX courbes : `ltcAnnualProbability` et `mortalityAnnualProbability` (« Stats Canada 2020-2022, unisexe lissé »). Ma marque `[×2]` ne décrivait que la LTC. Même famille pour les deux — hypothèses de RISQUE calibrées, jamais des âges fiscaux.' },
    { file: 'services/projection/helpers.ts', value: '85', family: 'design',
      reason: '[≠2] Palier d’âge présent DANS LES DEUX courbes : `ltcAnnualProbability` et `mortalityAnnualProbability` (« Stats Canada 2020-2022, unisexe lissé »). Ma marque `[×2]` ne décrivait que la LTC. Même famille pour les deux — hypothèses de RISQUE calibrées, jamais des âges fiscaux.' },
    { file: 'services/projection/helpers.ts', value: '90', family: 'design',
      reason: '[≠2] Palier d’âge présent DANS LES DEUX courbes : `ltcAnnualProbability` et `mortalityAnnualProbability` (« Stats Canada 2020-2022, unisexe lissé »). Ma marque `[×2]` ne décrivait que la LTC. Même famille pour les deux — hypothèses de RISQUE calibrées, jamais des âges fiscaux.' },
    // ⚠️ ENTRÉE DOUBLE DE SENS — la première fois que la clé (fichier, valeur) coûte quelque chose.
    // `95` apparaît DEUX fois dans helpers.ts avec des natures OPPOSÉES, et la clé ne peut pas les
    // distinguer. Les deux sont décrites ici plutôt que d'en taire une ; `family` prend le sens le
    // plus EXIGEANT (`fiscal`), parce qu'un littéral qui porte un vrai paramètre ARC mérite la
    // relecture stricte même s'il porte aussi une heuristique. Le compromis était documenté en tête
    // de fichier ; il est désormais VÉCU, pas seulement anticipé.
    { file: 'services/projection/helpers.ts', value: '95', family: 'fiscal',
      reason: '[≠2] DEUX occurrences de natures OPPOSÉES. (1) FISCAL — RRIF_PLATEAU_AGE : âge à partir duquel le facteur FERR est figé au plateau de 20 %. Ancré le 2026-08-06 ; il était jusque-là IMPLICITE, porté par la seule ABSENCE d’entrée dans la table au-delà de 94 — un seuil qu’aucune ligne n’écrit ne peut être ni relu ni corrigé. (2) DESIGN — palier terminal de la courbe de mortalité/LTC (`if (age < 95) return 0.140`), hypothèse de risque calibrée, à ne JAMAIS sourcer comme une valeur fiscale.' },
    { file: 'services/projection/helpers.ts', value: '50', family: 'design',
      reason: 'Palier d’âge bas de la courbe de mortalité/LTC. Hypothèse de risque.' },
    { file: 'services/projection/setupSimulation.ts', value: '42', family: 'structural',
      reason: 'Graine par défaut du générateur pseudo-aléatoire (`mulberry32(... || 42)`). Aucun rapport avec la fiscalité.' },
    { file: 'services/projection/setupSimulation.ts', value: '30', family: 'structural',
      reason: 'Repli d’âge par défaut quand ni birthYear ni age ne sont saisis. Structurel.' },
        { file: 'services/projection/setupSimulation.ts', value: '18', family: 'fiscal',
      reason: 'Âge d’ouverture des droits REER historiques (`birthYear + 18`) — âge fiscal, à ancrer avec les autres âges-seuils.' },
    { file: 'services/projection/setupSimulation.ts', value: '65', family: 'fiscal',
      reason: '[×2] Âge pivot RRQ : base du décalage `(pensionStartAge - 65) * 12`. Âge fiscal, à ancrer.' },
    { file: 'services/projection/setupSimulation.ts', value: '8000', family: 'design',
      reason: 'Revenu théorique mensuel de repli quand aucun salaire n’est saisi. Hypothèse d’amorçage, pas un barème.' },
    { file: 'services/projection/setupSimulation.ts', value: '0.55', family: 'design',
      reason: 'Part du revenu théorique attribuée au 1er conjoint (55/45). Hypothèse de répartition, pas une règle.' },
    { file: 'services/projection/setupSimulation.ts', value: '0.45', family: 'design',
      reason: 'Part du revenu théorique attribuée au 2e conjoint. Même nature que 0.55.' },
    { file: 'services/projection/setupSimulation.ts', value: '2.0', family: 'design',
      reason: '[≠2] DEUX SENS, tous deux dans ce fichier. (1) `simInflation = projection.inflationRate ?? 2.0` — l’inflation par DÉFAUT de la projection, qui pilote toute l’indexation du moteur, plafond RQAP compris. (2) `baseRates.nonReg` du jeu de rendement de stress (`ECONOMIC_WINTER` / `COMPOUND_STRESS`), soit 2 %/an sur le non-enregistré. ⚠️ Ma première raison parlait d’une « constante mathématique d’une formule de simulation » : FAUX pour ce fichier — le Box-Muller vit dans `helpers.ts` et a sa propre entrée. Famille corrigée `structural` → `design` : deux hypothèses de modèle, pas des index.' },
    { file: 'services/projection/setupSimulation.ts', value: '5.5', family: 'design',
      reason: '`simInflation = 5.5` forcée par le scénario `HYPER_INFLATION`. Hypothèse de scénario, pas un barème. ⚠️ La raison d’origine disait « paramètre d’amorçage de simulation », ce qui ne désignait rien — corrigé en revue avec ses voisines 2.0 et 5.0.' },
    { file: 'services/projection/setupSimulation.ts', value: '5.0', family: 'design',
      reason: '[≠2] DEUX SENS. (1) `simInflation = 5.0` forcée par le scénario `COMPOUND_STRESS`. (2) `baseRates.crypto` du même jeu de rendement de stress, soit 5 %/an sur la crypto. ⚠️ Ma première raison disait « paramètre d’amorçage d’une courbe de simulation » sans nommer ni l’une ni l’autre — recyclage d’une formule vague, exactement ce que la marque `[≠N]` doit empêcher.' },
    { file: 'services/projection/setupSimulation.ts', value: '75', family: 'design',
      reason: 'Palier d’âge d’une courbe d’amorçage. Hypothèse de modèle (≠ la bonification PSV de retirementIncome).' },
    { file: 'services/projection/setupSimulation.ts', value: '85', family: 'design',
      reason: 'Palier d’âge d’une courbe d’amorçage. Même nature que 75.' },

    // ── services/projection/meltdownReer.ts ──────────────────────────────────────────────────
    { file: 'services/projection/meltdownReer.ts', value: '2000000', family: 'design',
      reason: 'MELTDOWN_NW_HIGH — seuil de CONCEPTION de la stratégie ; cf. [MELTDOWN-THRESHOLDS-DOC].' },
    { file: 'services/projection/meltdownReer.ts', value: '1000000', family: 'design',
      reason: 'MELTDOWN_NW_MID — 2ᵉ palier de patrimoine déclenchant un décaissement anticipé du REER. Seuil de CONCEPTION.' },
    { file: 'services/projection/meltdownReer.ts', value: '220000', family: 'design',
      reason: 'MELTDOWN_TARGET_HIGH — cible de décaissement, heuristique.' },
    { file: 'services/projection/meltdownReer.ts', value: '140000', family: 'design',
      reason: 'MELTDOWN_TARGET_MID — cible annuelle de décaissement au palier MID. Heuristique de stratégie, pas un barème.' },
    { file: 'services/projection/meltdownReer.ts', value: '90000', family: 'design',
      reason: 'MELTDOWN_TARGET_BASE — cible annuelle de décaissement au palier de base. Heuristique de stratégie, pas un barème.' },
    { file: 'services/projection/meltdownReer.ts', value: '200', family: 'design',
      reason: 'Montant plancher sous lequel un meltdown ne vaut pas la peine. Heuristique.' },


    // ── services/projection/childrenReee.ts ──────────────────────────────────────────────────
    // ⚠️ CE MODULE EST LA RAISON D'ÊTRE DE L'ÉLARGISSEMENT : 34 littéraux, dont un plafond légal
    // FAUX (`98000` au lieu de `RQAP_MAX_INCOME = 103000`) resté invisible parce que le fichier
    // n'était pas scanné. Une SUBVENTION et une PRESTATION sont des valeurs fiscales.
    { file: 'services/projection/childrenReee.ts', value: '0.20', family: 'fiscal',
      reason: '[≠2] DEUX SENS sous la même clé (l’index est (fichier, valeur), pas la ligne) : `SCEE_GRANT_RATE` = 20 % de la cotisation REEE (ARC) — ancré FISCAL_REFERENCE §7 ; ET `REEE_AIP_TAX_RATE` = approximation de l’impôt sur le PRA à la fermeture, qui est une LIMITE CONNUE assumée (§9), pas un taux statutaire. Les deux sont documentés, mais ils ne sont pas de même nature.' },
    { file: 'services/projection/childrenReee.ts', value: '500', family: 'fiscal',
      reason: '[≠3] TROIS SENS sous la même clé : `SCEE_ANNUAL_GRANT_BASIC` (500 $/an, ARC) ; `IQEE_ANNUAL_GRANT_CATCHUP` (500 $/an en rattrapage, Revenu Québec) ; et un coût d’ENFANT de 500 $ à 16 ans (permis de conduire), qui lui est du `design`. Les deux premiers sont ancrés §7.' },
    { file: 'services/projection/childrenReee.ts', value: '7200', family: 'fiscal',
      reason: '`SCEE_LIFETIME_GRANT_LIMIT` — plafond à vie de la Subvention canadienne pour l’épargne-études, 7 200 $ par bénéficiaire (ARC). Ancré FISCAL_REFERENCE §7.' },
    { file: 'services/projection/childrenReee.ts', value: '0.10', family: 'fiscal',
      reason: '`IQEE_GRANT_RATE` — Incitatif québécois à l’épargne-études, 10 % de la cotisation (Revenu Québec). Ancré FISCAL_REFERENCE §7.' },
    { file: 'services/projection/childrenReee.ts', value: '250', family: 'fiscal',
      reason: '`IQEE_ANNUAL_GRANT_BASIC` — plafond annuel de base de l’IQEE, 250 $ (Revenu Québec). Ancré FISCAL_REFERENCE §7.' },
    { file: 'services/projection/childrenReee.ts', value: '3600', family: 'fiscal',
      reason: '`IQEE_LIFETIME_GRANT_LIMIT` — plafond à vie de l’IQEE, 3 600 $ par bénéficiaire (Revenu Québec). Ancré FISCAL_REFERENCE §7.' },
    { file: 'services/projection/childrenReee.ts', value: '50000', family: 'fiscal',
      reason: '`REEE_LIFETIME_LIMIT_PER_BENEFICIARY` — plafond de cotisation à vie du REEE, 50 000 $ par bénéficiaire (ARC §6.9). Ancré FISCAL_REFERENCE §7.' },
    { file: 'services/projection/childrenReee.ts', value: '2500', family: 'fiscal',
      reason: '`REEE_TARGET_ANNUAL_CONTRIB_BASIC` — cotisation visée pour toucher la SCEE pleine (20 % × 2 500 $ = 500 $). Dérivée du barème, donc fiscale par construction. Ancrée §7.' },
    { file: 'services/projection/childrenReee.ts', value: '5000', family: 'fiscal',
      reason: '`REEE_TARGET_ANNUAL_CONTRIB_CATCHUP` — cotisation visée en mode rattrapage (subvention doublée tant que la SCEE cumulée reste sous le maximum théorique). Ancrée §7.' },
    { file: 'services/projection/childrenReee.ts', value: '0.55', family: 'fiscal',
      reason: '`RQAP_REPLACEMENT_RATE_BASE` — taux de remplacement du revenu pendant le congé parental. ANCRÉ FISCAL_REFERENCE §2 depuis `[RQAP-CAP-98K]` (2026-08-20), avec sa divergence : le régime de BASE verse 70 % puis 55 % selon la phase, donc un 0,55 plat SOUS-ESTIME le début du congé. Modéliser les phases demande le nombre de semaines par prestation ET le choix base/particulier, que l’app ne saisit pas — décision produit, ticket `[RQAP-PHASES-70-55]`.' },
    { file: 'services/projection/childrenReee.ts', value: '350', family: 'design',
      reason: 'Économie de transport pendant le congé parental (350 $/mois). Hypothèse de coût de ménage, indexée par `expenseMultiplier` — aucune règle fiscale, à ne surtout pas « sourcer ».' },
    { file: 'services/projection/childrenReee.ts', value: '400', family: 'design',
      reason: 'Seuil de frais de garde au-delà duquel l’aide implicite s’applique. Heuristique FISC-CHILDCARE documentée §9 comme LIMITE assumée, pas comme barème.' },
    { file: 'services/projection/childrenReee.ts', value: '0.30', family: 'design',
      reason: 'Part du coût de garde restant à charge au-delà du seuil (≈70 % d’aide implicite). Approximation de modèle, cf. §9 — le vrai crédit est un barème progressif selon le revenu familial.' },
    { file: 'services/projection/childrenReee.ts', value: '150000', family: 'design',
      reason: '[×2] Seuil de revenu familial où le modèle commence à réduire les ALLOCATIONS gouvernementales de l’enfant (`householdGross > 150000`), et base du prorata de la même rampe. ⚠️ Ma première raison disait « aide aux études » et « inventée pour l’écran » : les deux sont faux — le code réduit `child.governmentBenefits` et l’ajoute à `monthlyIncomeDelta`, donc ça DÉPLACE de l’encaisse. Reste `design` : la courbe de dégressivité est un proxy, pas le barème d’un programme réel (§7 le nomme « clawback d’allocation »).' },
    { file: 'services/projection/childrenReee.ts', value: '100000', family: 'design',
      reason: 'Largeur de la plage de dégressivité du clawback d’ALLOCATION. Même nature que 150000 — la paire définit une rampe de proxy, pas un barème réel.' },
    { file: 'services/projection/childrenReee.ts', value: '18', family: 'structural',
      reason: '[×3] Âge de majorité converti en MOIS (`18 * 12`), trois fois : fin des coûts d’enfant, achat auto, début des études. Borne de calendrier du modèle, pas un seuil fiscal.' },
    { file: 'services/projection/childrenReee.ts', value: '25', family: 'structural',
      reason: 'Âge (en mois × 12) de fermeture du REEE dans le modèle. Le régime réel autorise 35 ans : c’est donc la borne de la SIMULATION, pas une règle. ⚠️ Ma première raison affirmait « la LIMITE est notée §9 » — VÉRIFIÉ EN REVUE : c’est FAUX, FISCAL_REFERENCE ne mentionne nulle part l’âge de fermeture du REEE (le §9 ne couvre que le PRA, le clawback de subventions et les PAE). Écart à documenter : ticket `[FISC-REEE-AGE-FERMETURE]`.' },
    { file: 'services/projection/childrenReee.ts', value: '16', family: 'design',
      reason: 'Âge auquel le modèle ajoute un coût ponctuel (permis de conduire). Hypothèse de coût de ménage.' },
    { file: 'services/projection/childrenReee.ts', value: '50', family: 'design',
      reason: 'Composante forfaitaire du coût mensuel d’un nourrisson, en sus des couches et de la nourriture. Hypothèse de coût.' },
    { file: 'services/projection/childrenReee.ts', value: '5', family: 'design',
      reason: 'Borne basse de la tranche d’âge 5-11 ans de la grille de coûts d’enfant. Paramètre de grille.' },
    { file: 'services/projection/childrenReee.ts', value: '11', family: 'design',
      reason: 'Borne haute de la tranche d’âge 5-11 ans de la grille de coûts d’enfant. Paramètre de grille.' },
    { file: 'services/projection/childrenReee.ts', value: '17', family: 'design',
      reason: '[≠2] Borne haute des tranches 12-17 ans : grille de coûts d’enfant et fenêtre de réduction des ALLOCATIONS (et non « aide aux études » comme je l’avais écrit). Paramètre de grille dans les deux cas.' },
    { file: 'services/projection/childrenReee.ts', value: '80', family: 'design',
      reason: 'Composante forfaitaire du coût mensuel d’un enfant de 5-11 ans. Hypothèse de coût.' },
    { file: 'services/projection/childrenReee.ts', value: '1.2', family: 'design',
      reason: 'Facteur d’augmentation du poste ALIMENTATION à l’adolescence. Hypothèse de coût.' },
    { file: 'services/projection/childrenReee.ts', value: '1.5', family: 'design',
      reason: 'Facteur d’augmentation du poste VÊTEMENTS à l’adolescence. Hypothèse de coût.' },
    { file: 'services/projection/childrenReee.ts', value: '150', family: 'design',
      reason: 'Composante forfaitaire du coût mensuel d’un adolescent (12-17 ans). Hypothèse de coût.' },

    // ── services/projection/realEstateMonth.ts ───────────────────────────────────────────────
    { file: 'services/projection/realEstateMonth.ts', value: '0.4', family: 'design',
      reason: '`DOWNSIZE_RELEASE_PCT` — part de l’équité libérée lors d’un downsizing. Hypothèse de stratégie (frais de vente, achat plus petit), pas une règle.' },
    { file: 'services/projection/realEstateMonth.ts', value: '2022', family: 'fiscal',
      reason: '⚠️ MA PREMIÈRE RAISON ÉTAIT FAUSSE (revue 2026-08-20) : j’y avais lu la règle anti-flip et l’exemption de résidence principale. Le code est DANS le bloc RAP et pilote `rapRepaymentStartOffset` — c’est la borne BASSE de la fenêtre du report temporaire du DÉBUT DE REMBOURSEMENT du RAP (Budget fédéral 2024 : 5 ans de grâce au lieu de 2 pour les retraits du 1er janvier 2022 au 31 décembre 2025). Rien à voir avec le gain en capital. À ancrer §7 (régimes enregistrés), avec la durée de 15 ans — pas §8.' },
    { file: 'services/projection/realEstateMonth.ts', value: '2025', family: 'fiscal',
      reason: 'Borne HAUTE de la fenêtre du report de remboursement du RAP (Budget fédéral 2024), cf. l’entrée `2022` du même fichier. Les deux bornes ET la durée de grâce (5 ans vs 2) doivent être sourcées ENSEMBLE en §7 : en ancrer une seule laisserait une règle à moitié fausse.' },
    { file: 'services/projection/realEstateMonth.ts', value: '0.015', family: 'design',
      reason: 'Amplitude du choc de taux pseudo-aléatoire dérivé de l’identifiant du bien (±1,5 pp). Paramètre de simulation, pas un taux de marché observé.' },
    { file: 'services/projection/realEstateMonth.ts', value: '0.05', family: 'design',
      reason: 'Taux d’intérêt supposé de la marge Smith Manoeuvre (5 %). Hypothèse de modèle — la LIMITE est notée §8 ; le vrai taux dépend du produit et du dossier.' },
    { file: 'services/projection/realEstateMonth.ts', value: '0.65', family: 'fiscal',
      reason: '[×2] Ratio prêt/valeur au-delà duquel le modèle déclenche un appel de marge (test du seuil, puis calcul du surplus). ⚠️ Reclassé `fiscal` en revue : j’avais écrit « pratique commerciale » alors que le §8 que je citais en preuve dit « LTV 65 %, plafond B-20 de la portion réavançable » — B-20 est une ligne directrice OSFI, source réglementaire dont §8 ancre déjà quatre constantes (`OSFI_MQR_FLOOR`, `OSFI_MQR_BUFFER`, GDS, TDS). Une raison ne peut pas contredire la section qu’elle invoque.' },
    { file: 'services/projection/realEstateMonth.ts', value: '15', family: 'fiscal',
      reason: 'Durée de remboursement du RAP (régime d’accession à la propriété) : 15 ans, ARC. Non ancrée dans FISCAL_REFERENCE — à ajouter §7.' },

    // ── services/projection/w5Effects.ts ─────────────────────────────────────────────────────
    { file: 'services/projection/w5Effects.ts', value: '0.45', family: 'fiscal',
      reason: 'PROXY d’impôt plat de 45 % sur le revenu net d’exploitation locatif. Écart MESURÉ vs impôt incrémental réel : +2 665 $/an à 60 k$ de revenu, +1 004 $ à 100 k$, −2 208 $ à 250 k$ — donc NON conservateur aux hauts revenus. Décision Marc close exigeait de le documenter : ticket `[W5-PROXY-NON-SOURCE]`.' },
    { file: 'services/projection/w5Effects.ts', value: '0.36', family: 'fiscal',
      reason: 'PROXY d’impôt plat de 36 % sur un dividende de société privée. Même statut que le 0,45 : ni sourcé, ni ancré, alors qu’il pilote un montant affiché. Ticket `[W5-PROXY-NON-SOURCE]`.' },
    { file: 'services/projection/w5Effects.ts', value: '8', family: 'design',
      reason: 'Durée par défaut d’un cycle de véhicule quand l’utilisateur ne la précise pas (8 ans). Hypothèse d’amorçage.' },
    { file: 'services/projection/w5Effects.ts', value: '5', family: 'design',
      reason: 'Nombre de mois par an passés au Sud par défaut (scénario snowbird). Hypothèse d’amorçage, surchargeable par l’utilisateur.' },
    { file: 'services/projection/w5Effects.ts', value: '1500', family: 'design',
      reason: 'Surcoût mensuel par défaut du scénario snowbird. Hypothèse d’amorçage, surchargeable.' },

    // ── services/projection/estateCalculation.ts ─────────────────────────────────────────────
    { file: 'services/projection/estateCalculation.ts', value: '95', family: 'design',
      reason: 'Espérance de vie retenue pour actualiser les rentes publiques restantes. Hypothèse de modèle explicitement nommée (`lifeExpectancy`), pas une table de mortalité.' },
    { file: 'services/projection/estateCalculation.ts', value: '0.02', family: 'design',
      reason: 'Taux d’actualisation réel de la VAN des rentes (`r_npv` = 2 %). Hypothèse financière de modèle. Le `1.02` des deux lignes de VAN (RRQ et PSV) en est le reflet et doit bouger AVEC lui — piège de duplication signalé par `[ESTATE-NPV-07]`.' },
    { file: 'services/projection/estateCalculation.ts', value: '65', family: 'fiscal',
      reason: '[×2] Âge pivot des rentes publiques (RRQ/PSV), pour la RRQ et pour la PSV, pour décider si la rente est déjà en cours. Vrai paramètre fédéral/QC, ancré FISCAL_REFERENCE §6.' },
    
    // ── services/projection/activeIncome.ts ──────────────────────────────────────────────────
    { file: 'services/projection/activeIncome.ts', value: '0.55', family: 'fiscal',
      reason: '[≠3] DEUX SENS, et mon premier tri s’est trompé sur le principal (revue 2026-08-20). `incomeMarc *= 0.55`, sous le commentaire « Job loss (AE 55%) », — est le TAUX DE REMPLACEMENT STATUTAIRE de l’assurance-emploi (55 % des gains assurables, Loi sur l’AE) : une PRESTATION fédérale, à ancrer §2 à côté de `AE_RATE_QC`/`AE_MAX_INCOME`, et de MÊME nature que le 0,55 du RQAP — pas « sans rapport » comme je l’avais écrit. Les deux applications aux bonus/RSU, elles, sont un PROXY de charge fiscale sur les bonus/RSU/revenus d’appoint (le commentaire du bloc dit « taxés ~45 % marginal ») : celles-là sont bien du design. La famille retenue est la plus stricte des deux. ⚠️ Défaut VOISIN relevé au passage : le 55 % est appliqué au net NON PLAFONNÉ, alors que l’AE est plafonnée à 68 900 $ — ticket `[AE-PLAFOND-MANQUANT]`.'},
    { file: 'services/projection/activeIncome.ts', value: '99', family: 'structural',
      reason: '[×2] Sentinelle « pas de fin connue » pour les années de RSU restantes (`?? 99`), pour le 1er conjoint et pour le 2e. Valeur d’absence, pas un paramètre.' },

    // ── services/projection/assetLocation.ts ─────────────────────────────────────────────────
    { file: 'services/projection/assetLocation.ts', value: '0.60', family: 'design',
      reason: 'Taux effectif « dividende canadien éligible » estimé à 60 % du marginal (proxy majoration 1,38 + crédits), branche `ca-equity`. Hypothèse de modèle COMMENTÉE sur place (FA-8) — mais pas nommée : c’est un littéral nu dans un `return`. Module CONSULTATIF (perte d’allocation), pas le moteur : proxy assumé, pas un barème à sourcer.' },
    { file: 'services/projection/assetLocation.ts', value: '2026', family: 'structural',
      reason: 'Année fiscale de REPLI (`input.year ?? 2026`) pour lire le taux marginal quand l’appelant n’en fournit pas. ⚠️ Reclassé `structural` en revue : une année de repli ne peut pas « finir ancrée dans FISCAL_REFERENCE », donc `fiscal` décrivait mal l’action attendue. Le défaut est qu’elle ne suit pas l’année courante du moteur — ticket `[ASSETLOC-YEAR-2026]`.' },
    { file: 'services/projection/assetLocation.ts', value: '0.02', family: 'design',
      reason: 'Écart de rendement supposé actions−obligations (2 pp) servant à chiffrer le coût d’opportunité d’obligations logées au CELI. Hypothèse de marché, pas fiscale.' },
    { file: 'services/projection/assetLocation.ts', value: '20', family: 'design',
      reason: 'Horizon d’illustration de la perte cumulée dans le libellé affiché (« sur 20 ans »). Paramètre de présentation.' },

    // ── services/projection/cashflowAllocation.ts ────────────────────────────────────────────
    { file: 'services/projection/cashflowAllocation.ts', value: '0.1', family: 'structural',
      reason: 'Epsilon de convergence du solveur d’affectation (arrêt quand le manque descend sous 10 ¢). Paramètre d’algorithme.' },
    { file: 'services/projection/cashflowAllocation.ts', value: '7', family: 'design',
      reason: '[×2] Seuil de taux au-delà duquel une dette est traitée en priorité et étiquetée « dette à taux élevé ». Heuristique de stratégie — la valeur pilote le CALCUL et l’AFFICHAGE, les deux doivent bouger ensemble.' },
    { file: 'services/projection/cashflowAllocation.ts', value: '0.40', family: 'design',
      reason: 'Taux marginal au-delà duquel la stratégie AUTO bascule vers le REER plutôt que le CELI. Seuil de conception ; il s’en approche par un vrai marginal mais n’est lui-même dans aucun barème.' },

    // ── services/projection/glidepathRates.ts ────────────────────────────────────────────────
    { file: 'services/projection/glidepathRates.ts', value: '1.0', family: 'design',
      reason: '[≠2] Prime de 1 pp au-dessus de l’inflation visée en fin de glidepath, et facteur neutre du même calcul. Hypothèse d’allocation, pas un rendement observé.' },
    { file: 'services/projection/glidepathRates.ts', value: '1.5', family: 'design',
      reason: 'Rendement en dividendes par défaut des actions américaines (1,5 %) quand l’utilisateur ne le renseigne pas. Hypothèse de marché. ⚠️ Le taux de retenue qui le multiplie, LUI, est sourcé (`US_DIVIDEND_WITHHOLDING_RATE`, §3) — ne pas confondre les deux facteurs de la même ligne.' },

    // ── services/projection/rentalMonth.ts ───────────────────────────────────────────────────
    { file: 'services/projection/rentalMonth.ts', value: '25', family: 'design',
      reason: '`DEFAULT_RENTAL_AMORTIZATION_YEARS` — amortissement supposé d’une hypothèque locative quand le champ est absent. Hypothèse NOMMÉE, introduite avec le conteneur locatif ; pratique de prêteur, pas un barème.' },

    // ── services/taxEstimate.ts ──────────────────────────────────────────────────────────────
    { file: 'services/taxEstimate.ts', value: '0.02', family: 'design',
      reason: '`EST_DIVIDEND_YIELD` — rendement en dividendes supposé (~2 %/an) pour estimer le revenu de placement imposable. Hypothèse AFFICHÉE à l’utilisateur dans l’onglet Impôt, donc honnête ; pas un barème.' },
    { file: 'services/taxEstimate.ts', value: '0.07', family: 'design',
      reason: '`EST_CAPITAL_GAINS_YIELD` — gains en capital réalisés supposés (~7 %/an). Même nature. ⚠️ Le taux d’INCLUSION qui s’y applique, lui, vient de la source unique (`CAPITAL_GAINS_INCLUSION_STANDARD`) — la frontière est au bon endroit dans ce fichier.' },

    // ── utils/donationCredit.ts ──────────────────────────────────────────────────────────────
    { file: 'utils/donationCredit.ts', value: '200', family: 'fiscal',
      reason: '`DONATION_FIRST_TIER_CEILING` — plafond du premier palier du crédit pour dons (200 $), au-delà duquel le taux bonifié s’applique. Vrai paramètre ARC/RQ, déjà ancré FISCAL_REFERENCE §10 et nommé sur place.' },

    // ── store/useFinanceStore.ts ─────────────────────────────────────────────────────────────
    { file: 'store/useFinanceStore.ts', value: '5', family: 'structural',
      reason: 'Numéro de version de schéma persisté (`fromVersion < 5`). Palier de migration, aucun rapport avec la fiscalité.' },
    { file: 'store/useFinanceStore.ts', value: '6', family: 'structural',
      reason: 'Numéro de version de schéma persisté (`fromVersion < 6`). Palier de migration.' },
    { file: 'store/useFinanceStore.ts', value: '7', family: 'structural',
      reason: '[×2] Numéro de version de schéma persisté (`fromVersion < 7`). Palier de migration.' },
    // ── Révélés par l'élargissement du filtre aux VALEURS LIÉES (2026-08-20) ────────────────────
    // `[FISC-GUARD-VALEUR-LIEE]`. Le filtre ne relevait qu'un littéral qu'on CALCULE. Or un barème
    // est tout aussi souvent un littéral qu'on NOMME (propriété d'objet) ou qu'on CHOISIT (branche
    // de ternaire). Conséquence mesurée : la table `RRIF_RATES` — les 24 facteurs de retrait
    // minimum FERR de l'ARC, le barème le plus utilisé du moteur de décaissement — n'a JAMAIS été vue
    // depuis l'entrée de `helpers.ts` au périmètre (2026-08-06), ni `DONATION_CREDIT_RATES` depuis
    // celle de `donationCredit.ts` (2026-08-20). 50 clés neuves au total.

    // — services/projection/helpers.ts : RRIF_RATES, facteurs de retrait minimum FERR ————————————
    // Les 24 sont ANCRÉS FISCAL_REFERENCE §7 et nommés. Ce qui manquait n'est pas la source, c'est
    // la PROTECTION : rien n'empêchait un facteur de dériver en silence. Une entrée par âge, pour
    // que la garde nomme précisément lequel a bougé.
    { file: 'services/projection/helpers.ts', value: '0.0528', family: 'fiscal',
      reason: '`RRIF_RATES[71]` — facteur de retrait MINIMUM du FERR à 71 ans (5.28 %), barème ARC ancré FISCAL_REFERENCE §7. Statutaire : il pilote un retrait FORCÉ, donc de l’impôt.' },
    { file: 'services/projection/helpers.ts', value: '0.0540', family: 'fiscal',
      reason: '`RRIF_RATES[72]` — facteur de retrait MINIMUM du FERR à 72 ans (5.4 %), barème ARC ancré FISCAL_REFERENCE §7. Statutaire : il pilote un retrait FORCÉ, donc de l’impôt.' },
    { file: 'services/projection/helpers.ts', value: '0.0553', family: 'fiscal',
      reason: '`RRIF_RATES[73]` — facteur de retrait MINIMUM du FERR à 73 ans (5.53 %), barème ARC ancré FISCAL_REFERENCE §7. Statutaire : il pilote un retrait FORCÉ, donc de l’impôt.' },
    { file: 'services/projection/helpers.ts', value: '0.0567', family: 'fiscal',
      reason: '`RRIF_RATES[74]` — facteur de retrait MINIMUM du FERR à 74 ans (5.67 %), barème ARC ancré FISCAL_REFERENCE §7. Statutaire : il pilote un retrait FORCÉ, donc de l’impôt.' },
    { file: 'services/projection/helpers.ts', value: '0.0582', family: 'fiscal',
      reason: '`RRIF_RATES[75]` — facteur de retrait MINIMUM du FERR à 75 ans (5.82 %), barème ARC ancré FISCAL_REFERENCE §7. Statutaire : il pilote un retrait FORCÉ, donc de l’impôt.' },
    { file: 'services/projection/helpers.ts', value: '0.0598', family: 'fiscal',
      reason: '`RRIF_RATES[76]` — facteur de retrait MINIMUM du FERR à 76 ans (5.98 %), barème ARC ancré FISCAL_REFERENCE §7. Statutaire : il pilote un retrait FORCÉ, donc de l’impôt.' },
    { file: 'services/projection/helpers.ts', value: '0.0617', family: 'fiscal',
      reason: '`RRIF_RATES[77]` — facteur de retrait MINIMUM du FERR à 77 ans (6.17 %), barème ARC ancré FISCAL_REFERENCE §7. Statutaire : il pilote un retrait FORCÉ, donc de l’impôt.' },
    { file: 'services/projection/helpers.ts', value: '0.0636', family: 'fiscal',
      reason: '`RRIF_RATES[78]` — facteur de retrait MINIMUM du FERR à 78 ans (6.36 %), barème ARC ancré FISCAL_REFERENCE §7. Statutaire : il pilote un retrait FORCÉ, donc de l’impôt.' },
    { file: 'services/projection/helpers.ts', value: '0.0658', family: 'fiscal',
      reason: '`RRIF_RATES[79]` — facteur de retrait MINIMUM du FERR à 79 ans (6.58 %), barème ARC ancré FISCAL_REFERENCE §7. Statutaire : il pilote un retrait FORCÉ, donc de l’impôt.' },
    { file: 'services/projection/helpers.ts', value: '0.0682', family: 'fiscal',
      reason: '`RRIF_RATES[80]` — facteur de retrait MINIMUM du FERR à 80 ans (6.82 %), barème ARC ancré FISCAL_REFERENCE §7. Statutaire : il pilote un retrait FORCÉ, donc de l’impôt.' },
    { file: 'services/projection/helpers.ts', value: '0.0708', family: 'fiscal',
      reason: '`RRIF_RATES[81]` — facteur de retrait MINIMUM du FERR à 81 ans (7.08 %), barème ARC ancré FISCAL_REFERENCE §7. Statutaire : il pilote un retrait FORCÉ, donc de l’impôt.' },
    { file: 'services/projection/helpers.ts', value: '0.0738', family: 'fiscal',
      reason: '`RRIF_RATES[82]` — facteur de retrait MINIMUM du FERR à 82 ans (7.38 %), barème ARC ancré FISCAL_REFERENCE §7. Statutaire : il pilote un retrait FORCÉ, donc de l’impôt.' },
    { file: 'services/projection/helpers.ts', value: '0.0771', family: 'fiscal',
      reason: '`RRIF_RATES[83]` — facteur de retrait MINIMUM du FERR à 83 ans (7.71 %), barème ARC ancré FISCAL_REFERENCE §7. Statutaire : il pilote un retrait FORCÉ, donc de l’impôt.' },
    { file: 'services/projection/helpers.ts', value: '0.0808', family: 'fiscal',
      reason: '`RRIF_RATES[84]` — facteur de retrait MINIMUM du FERR à 84 ans (8.08 %), barème ARC ancré FISCAL_REFERENCE §7. Statutaire : il pilote un retrait FORCÉ, donc de l’impôt.' },
    { file: 'services/projection/helpers.ts', value: '0.0851', family: 'fiscal',
      reason: '`RRIF_RATES[85]` — facteur de retrait MINIMUM du FERR à 85 ans (8.51 %), barème ARC ancré FISCAL_REFERENCE §7. Statutaire : il pilote un retrait FORCÉ, donc de l’impôt.' },
    { file: 'services/projection/helpers.ts', value: '0.0899', family: 'fiscal',
      reason: '`RRIF_RATES[86]` — facteur de retrait MINIMUM du FERR à 86 ans (8.99 %), barème ARC ancré FISCAL_REFERENCE §7. Statutaire : il pilote un retrait FORCÉ, donc de l’impôt.' },
    { file: 'services/projection/helpers.ts', value: '0.0955', family: 'fiscal',
      reason: '`RRIF_RATES[87]` — facteur de retrait MINIMUM du FERR à 87 ans (9.55 %), barème ARC ancré FISCAL_REFERENCE §7. Statutaire : il pilote un retrait FORCÉ, donc de l’impôt.' },
    { file: 'services/projection/helpers.ts', value: '0.1021', family: 'fiscal',
      reason: '`RRIF_RATES[88]` — facteur de retrait MINIMUM du FERR à 88 ans (10.21 %), barème ARC ancré FISCAL_REFERENCE §7. Statutaire : il pilote un retrait FORCÉ, donc de l’impôt.' },
    { file: 'services/projection/helpers.ts', value: '0.1099', family: 'fiscal',
      reason: '`RRIF_RATES[89]` — facteur de retrait MINIMUM du FERR à 89 ans (10.99 %), barème ARC ancré FISCAL_REFERENCE §7. Statutaire : il pilote un retrait FORCÉ, donc de l’impôt.' },
    { file: 'services/projection/helpers.ts', value: '0.1192', family: 'fiscal',
      reason: '`RRIF_RATES[90]` — facteur de retrait MINIMUM du FERR à 90 ans (11.92 %), barème ARC ancré FISCAL_REFERENCE §7. Statutaire : il pilote un retrait FORCÉ, donc de l’impôt.' },
    { file: 'services/projection/helpers.ts', value: '0.1306', family: 'fiscal',
      reason: '`RRIF_RATES[91]` — facteur de retrait MINIMUM du FERR à 91 ans (13.06 %), barème ARC ancré FISCAL_REFERENCE §7. Statutaire : il pilote un retrait FORCÉ, donc de l’impôt.' },
    { file: 'services/projection/helpers.ts', value: '0.1449', family: 'fiscal',
      reason: '`RRIF_RATES[92]` — facteur de retrait MINIMUM du FERR à 92 ans (14.49 %), barème ARC ancré FISCAL_REFERENCE §7. Statutaire : il pilote un retrait FORCÉ, donc de l’impôt.' },
    { file: 'services/projection/helpers.ts', value: '0.1634', family: 'fiscal',
      reason: '`RRIF_RATES[93]` — facteur de retrait MINIMUM du FERR à 93 ans (16.34 %), barème ARC ancré FISCAL_REFERENCE §7. Statutaire : il pilote un retrait FORCÉ, donc de l’impôt.' },
    { file: 'services/projection/helpers.ts', value: '0.2000', family: 'fiscal',
      reason: '`RRIF_RATES[94]` — facteur de retrait MINIMUM du FERR à 94 ans (20 %). ⚠️ SEULE ENTRÉE DE LA TABLE QUI N’EST PAS UN BARÈME ÉTABLI : FISCAL_REFERENCE §7 signale cette valeur comme CONTESTÉE — le facteur prescrit serait 18,79 %, le plateau ne commençant qu’à 95 ans, écart MESURÉ +13 726 $ de patrimoine final. Routé `[FISC-RRIF-94-FACTOR]`. La certifier « barème ARC » comme ses 23 voisines serait exactement le faux document que cet inventaire combat.' },
    { file: 'services/projection/helpers.ts', value: '0.15', family: 'design',
      reason: '`ASSET_VOLATILITY.stocks` — écart-type annuel supposé des actions (15 %), utilisé par le tirage stochastique. Hypothèse de MARCHÉ, aucun rapport avec un barème fiscal malgré la proximité de `RRIF_RATES` dans le même fichier.' },
    { file: 'services/projection/helpers.ts', value: '0.50', family: 'design',
      reason: '`ASSET_VOLATILITY.crypto` — écart-type annuel supposé de la crypto (50 %). Hypothèse de marché.' },
    { file: 'services/projection/helpers.ts', value: '0.03', family: 'design',
      reason: '`ASSET_VOLATILITY.cash` — écart-type annuel supposé des liquidités (3 %). Hypothèse de marché.' },
    { file: 'utils/donationCredit.ts', value: '0.15', family: 'fiscal',
      reason: '`DONATION_CREDIT_RATES.fed.first` — taux du crédit fédéral pour dons sur les premiers 200 $ (15 %). Barème ARC, ancré FISCAL_REFERENCE §10. ⚠️ Invisible au garde jusqu’au 2026-08-20 : une valeur de propriété d’objet n’était pas relevée.' },
    { file: 'utils/donationCredit.ts', value: '0.29', family: 'fiscal',
      reason: '`DONATION_CREDIT_RATES.fed.excess` — taux du crédit fédéral pour dons au-delà de 200 $ (29 %). Barème ARC, ancré §10.' },
    { file: 'utils/donationCredit.ts', value: '0.20', family: 'fiscal',
      reason: '`DONATION_CREDIT_RATES.qc.first` — taux du crédit québécois pour dons sur les premiers 200 $ (20 %). Barème Revenu Québec, ancré §10.' },
    { file: 'utils/donationCredit.ts', value: '0.24', family: 'fiscal',
      reason: '`DONATION_CREDIT_RATES.qc.excess` — taux du crédit québécois pour dons au-delà de 200 $ (24 %). Barème Revenu Québec, ancré §10.' },
    { file: 'services/projection/realEstateMonth.ts', value: '5', family: 'fiscal',
      reason: 'Durée de la période de grâce ALLONGÉE du RAP (5 ans au lieu de 2) pour les retraits de la fenêtre 2022-2025 — Budget fédéral 2024. Elle forme un TOUT avec les bornes `2022`/`2025` et la durée de 15 ans du même fichier : les quatre se sourcent ou se retirent ENSEMBLE, ticket `[FISC-RAP-GRACE-WINDOW]`.' },
    { file: 'services/projection/setupSimulation.ts', value: '72', family: 'fiscal',
      reason: 'Âge de report MAXIMAL de la **RRQ** quand `delayPensions` est actif (`delayPensions ? 72 : 65`) — report étendu à 72 ans depuis le 1er janvier 2024, et le seul consommateur est `computeRrqFactor`. ⚠️ NE PAS écrire « rentes publiques » au pluriel : §6 précise que la PSV ne se reporte PAS au-delà de 70 ans. Et §6 ANCRE déjà le 72 : la dette n’est donc pas l’ancrage mais l’IMPORT — le littéral est en dur ici alors que la source unique existe.' },
    { file: 'services/projection/setupSimulation.ts', value: '1.0', family: 'design',
      reason: 'Rendement de repli des LIQUIDITÉS dans le jeu de taux conservateur (1,0 %/an). Hypothèse de marché.' },
    { file: 'services/projection/setupSimulation.ts', value: '3.0', family: 'design',
      reason: 'Rendement de repli du CELI et du REER dans le jeu conservateur (3,0 %/an). Hypothèse de marché.' },
    { file: 'services/projection/setupSimulation.ts', value: '6.5', family: 'design',
      reason: 'Rendement de repli du REER et du non-enregistré dans le jeu par défaut (6,5 %/an). Hypothèse de marché.' },
    { file: 'services/projection/setupSimulation.ts', value: '7', family: 'design',
      reason: 'Rendement de repli du CELI dans le jeu par défaut (7 %/an). Hypothèse de marché.' },
    { file: 'services/projection/assetLocation.ts', value: '4.0', family: 'design',
      reason: '`ASSET_ASSUMPTIONS.bonds.yield` — rendement courant supposé des obligations (4 %). Table d’hypothèses du module CONSULTATIF d’emplacement d’actifs, pas un barème.' },
    { file: 'services/projection/assetLocation.ts', value: '0.0', family: 'design',
      reason: '[×2] Croissance supposée nulle des obligations et des liquidités dans la même table d’hypothèses. Hypothèse de marché.' },
    { file: 'services/projection/assetLocation.ts', value: '1.5', family: 'design',
      reason: '`ASSET_ASSUMPTIONS[’us-equity’].yield` — rendement en dividendes supposé des actions américaines (1,5 %). Hypothèse de marché. ⚠️ Le taux de retenue qui s’y applique, lui, est SOURCÉ (`US_DIVIDEND_WITHHOLDING_RATE`, §3).' },
    { file: 'services/projection/assetLocation.ts', value: '6.0', family: 'design',
      reason: '[×2] Croissance supposée des actions américaines et internationales (6 %). Hypothèse de marché.' },
    { file: 'services/projection/assetLocation.ts', value: '2.5', family: 'design',
      reason: '[×2] Rendement en dividendes supposé des actions canadiennes et internationales (2,5 %). Hypothèse de marché.' },
    { file: 'services/projection/assetLocation.ts', value: '5.0', family: 'design',
      reason: '[≠2] DEUX CHAMPS différents de la même table : `ca-equity.growth` (croissance supposée des actions canadiennes, 5 %) et `reit.yield` (rendement supposé des FPI, 5 %). Hypothèses de marché toutes deux, mais elles ne bougent pas ensemble — d’où `≠` et non `×`.' },
    { file: 'services/projection/assetLocation.ts', value: '8.0', family: 'design',
      reason: 'Croissance supposée des petites capitalisations de croissance (8 %). Hypothèse de marché.' },
    { file: 'services/projection/assetLocation.ts', value: '2.0', family: 'design',
      reason: 'Croissance supposée des FPI (2 %). Hypothèse de marché.' },
    { file: 'services/projection/assetLocation.ts', value: '3.5', family: 'design',
      reason: 'Rendement supposé des liquidités (3,5 %). Hypothèse de marché.' },
    { file: 'store/useFinanceStore.ts', value: '65', family: 'design',
      reason: '[×2] Âge de retraite VISÉ par défaut dans l’état initial et dans le repli de lecture du store. ⚠️ Homonyme de l’âge-pivot fiscal des rentes publiques, mais ici c’est un DÉFAUT d’amorçage que l’utilisateur change — pas une règle.' },
    { file: 'store/useFinanceStore.ts', value: '4000', family: 'design',
      reason: '[×2] Revenu mensuel de retraite VISÉ par défaut (4 000 $). Valeur d’amorçage de l’état, modifiable par l’utilisateur.' },
    { file: 'store/useFinanceStore.ts', value: '1200', family: 'design',
      reason: '[×2] Rente gouvernementale mensuelle supposée par défaut (1 200 $). Valeur d’amorçage, remplacée dès que l’utilisateur saisit ses estimations RRQ/PSV.' },
    { file: 'store/useFinanceStore.ts', value: '90', family: 'design',
      reason: 'Espérance de vie par défaut posée par une migration de schéma (90 ans). Hypothèse de modèle, pas une table de mortalité.' },

    // ── Révélés par le RETRAIT de `0.5` et `1000` de BENIGN (2026-08-20, revue) ──────────────
    // Trois de ces huit clés recouvrent une VRAIE valeur légale qui était invisible dans des
    // modules pourtant scannés depuis le premier jour du garde.
    { file: 'services/projection/assetLocation.ts', value: '0.5', family: 'fiscal',
      reason: '[≠2] DEUX SENS. `return marginalRate * 0.5` (branche « gain en capital ») — TAUX D’INCLUSION des gains en capital (50 %, §3), et c’est le SEUL site du dépôt qui le recopie : partout ailleurs (`latentTax`, `estateCalculation`, `retirementIncome`, `taxDecember`, `taxEstimate`, `projection.ts`) `CAPITAL_GAINS_INCLUSION_STANDARD` est importé. Vraie dette, ticket `[ASSETLOC-INCLUSION-RECOPIEE]` : importer la source unique. Le rendement de 0,5 % de la classe `growth-small` dans la table d’hypothèses, celui-là purement design.' },
    { file: 'services/projection/taxDecember.ts', value: '0.5', family: 'fiscal',
      reason: '[≠3] TROIS occurrences, une seule fiscale. `Math.min(0.5 * splittable[H], …)` — PLAFOND LÉGAL de 50 % du fractionnement de revenu de pension (T1032 fédéral / Annexe Q, §6). Les seuils d’affichage à 0,50 $ décidant si un libellé mentionne la banque de pertes ou le palier bas ; aucun enjeu fiscal.' },
    { file: 'services/projection/childrenReee.ts', value: '1000', family: 'fiscal',
      reason: '`SCEE_ANNUAL_GRANT_CATCHUP` — Subvention canadienne pour l’épargne-études en mode RATTRAPAGE, 1 000 $/an (ARC), ancrée §7. Son jumeau `IQEE_ANNUAL_GRANT_CATCHUP = 500` était inventorié dès le premier jet ; celui-ci restait invisible parce que `1000` figurait dans BENIGN sans que le critère de BENIGN le couvre.' },
    { file: 'services/projection/retirementIncome.ts', value: '0.5', family: 'fiscal',
      reason: '[≠4] QUATRE LIGNES (le compte de la garde), CINQ littéraux — `survivorRrqFactor` en porte deux sur la même ligne. Deux natures. La quatrième — `survivorPsvFactor = survivorMode ? 0.5 : 1` — était INVISIBLE au scan jusqu’au 2026-08-20 : un littéral en branche de ternaire n’était pas relevé. C’est l’élargissement `[FISC-GUARD-VALEUR-LIEE]` qui l’a fait apparaître, et cette garde qui a exigé qu’on la regarde. `survivorRrqFactor` et `survivorPsvFactor` — facteurs de rente au SURVIVANT : la PSV du défunt cesse (facteur 0,5 sur un couple) et la RRQ est recalculée via `rrqSurvivorPct`. Règles de Service Canada / Retraite Québec, §6. La prime de 0,5 pp au-dessus de l’inflation pour projeter le MGA de la RRQ : celle-là est une hypothèse d’indexation, pas une règle.' },
    { file: 'services/projection/taxJanuary.ts', value: '0.5', family: 'design',
      reason: 'Prime d’indexation de 0,5 pp au-dessus de l’inflation servant à EXTRAPOLER le plafond REER au-delà de la dernière année connue de `RRSP_ANNUAL_LIMITS` (§7.G). Le plafond lui-même est sourcé ; la vitesse d’extrapolation est une hypothèse de modèle.' },
    { file: 'services/projection/childrenReee.ts', value: '0.5', family: 'design',
      reason: '[≠2] DEUX SENS. La prime de 0,5 pp au-dessus de l’inflation indexant le PLAFOND RQAP (`rqapCapProjected`), même patron que le MGA de la RRQ (§6) ; ajoutée par `[RQAP-CAP-98K]`, et c’est CETTE garde qui l’a attrapée une PR après sa livraison. La demi-part de couches dans le coût mensuel d’un nourrisson, hypothèse de ménage. Homonymes sans rapport, et sans rapport non plus avec le taux d’inclusion des gains en capital.' },
    { file: 'services/projection/realEstateMonth.ts', value: '0.5', family: 'design',
      reason: 'Moitié des frais de copropriété retenue dans le calcul d’un but immobilier. Hypothèse de modèle sur la part récupérable/évitable, aucune règle derrière.' },
    { file: 'services/projection/cashflowAllocation.ts', value: '1000', family: 'design',
      reason: 'Seuil de banque de pertes en capital (1 000 $) au-delà duquel la stratégie préfère vendre du non-enregistré avant le REER pour consommer les pertes (seuil `capitalLossBank`). Heuristique de séquencement, pas un barème.' },

    { file: 'store/useFinanceStore.ts', value: '5000', family: 'structural',
      reason: 'Durée de vie en ms d’un focus d’onglet en attente (5 s). Paramètre d’interface.' },
];

/**
 * Modules fiscaux scannés.
 *
 * ⚠️ Le critère d'origine — « ceux qui PRODUISENT de l'impôt ou une rente » — était TROP ÉTROIT, et
 * c'est lui qui a laissé `98000` (plafond RQAP figé à sa valeur 2025, alors que la source unique
 * porte 103 000 $) vivre hors de portée. Écrire un barème ne demande pas de produire un impôt :
 * une SUBVENTION (SCEE/IQEE), une PRESTATION (RQAP), un PLAFOND LÉGAL (RAP, REEE) et un PROXY
 * d'impôt (`noi * 0.45`) sont tout autant des valeurs fiscales.
 *
 * **Critère actuel** : tout module qui LIT ou ÉCRIT un nombre venant d'une règle de l'ARC ou de
 * Revenu Québec — impôt, cotisation, prestation, subvention, crédit, plafond, âge-seuil — ou qui en
 * fabrique une APPROXIMATION affichée à l'utilisateur. Ce qu'on exclut est listé, chiffré et motivé
 * juste en dessous : un périmètre borné en silence se lit comme « tout est couvert ».
 */
export const FISCAL_MODULES = [
    'services/projection/taxDecember.ts',
    'services/projection/taxApril.ts',
    'services/projection/taxJanuary.ts',
    'services/projection/latentTax.ts',
    'services/projection/meltdownReer.ts',
    'services/projection/retirementIncome.ts',
    // ⚠️ AJOUTÉS le 2026-08-06 (finding F5 de l'audit d'ancrage) : déplacer une constante fiscale
    // vers un fichier NON scanné la fait sortir du garde — la dette change de cachette au lieu de
    // se résorber. `helpers.ts` héberge désormais RRIF_RATE_PLATEAU, `setupSimulation.ts` calcule
    // les droits REER historiques. Les deux participent à l'impôt : ils doivent être scannés.
    'services/projection/helpers.ts',
    'services/projection/setupSimulation.ts',

    // ⚠️ AJOUTÉS le 2026-08-20 ([FISC-GUARD-SCOPE]). Le garde ne scannait que la CHAÎNE D'IMPÔT
    // proprement dite. Or « produire de l'impôt » n'est pas le seul moyen d'écrire un barème :
    // une SUBVENTION (SCEE/IQEE), une PRESTATION (RQAP), un PROXY d'impôt (`* 0.45`) et un
    // PLAFOND LÉGAL sont tout autant des valeurs fiscales, et vivaient hors de portée.
    // Périmètre MESURÉ avant d'écrire : 76 littéraux → 63 clés (fichier, valeur) à trier.
    'services/projection/childrenReee.ts',
    'services/projection/realEstateMonth.ts',
    'services/projection/w5Effects.ts',
    'services/projection/estateCalculation.ts',
    'services/projection/activeIncome.ts',
    'services/projection/assetLocation.ts',
    'services/projection/cashflowAllocation.ts',
    'services/projection/glidepathRates.ts',
    'services/projection/rentalMonth.ts',
    'services/taxEstimate.ts',
    'utils/donationCredit.ts',
    'store/useFinanceStore.ts',
] as const;

/**
 * Modules NON scannés DÉLIBÉRÉMENT, avec leur volume mesuré le 2026-08-20. Un périmètre borné en
 * silence se lit comme « tout est couvert » — on écrit donc ce qui est dehors ET pourquoi.
 *
 * - `utils/tax.ts` (82 littéraux) et `services/realEstate.ts` (26) — ce sont les **sources
 *   DÉSIGNÉES** du garde V1 (`TAX_SOURCE_FILES`), déjà ancrées dans `docs/FISCAL_REFERENCE.md` §1-3
 *   et §8. Les inventorier ici dupliquerait la référence en 108 entrées de bruit : leur littéral
 *   fiscal est *attendu*, c'est leur raison d'être. Les scanner INVERSERAIT le sens du garde.
 * - `services/projection.ts` (31) — orchestrateur : le travail fiscal est déjà dans les
 *   sous-modules scannés. **Trou connu et assumé** : un barème écrit directement dans la boucle y
 *   échapperait. Chiffré ici pour que le prochain sache ce qu'il achète en l'ajoutant.
 * - `services/projection/historicalReturns.ts` (58), `services/pdfReport.ts` (61),
 *   `services/projection/monthlyCalcs.ts` (15), `services/testPersonas/*`, `services/fintable/*`,
 *   `services/marketData/*` — rendements de marché, mise en page, fixtures de démo, codes HTTP et
 *   durées en ms. Aucun n'écrit de barème ; les inclure noierait le signal (leçon déjà payée sur
 *   `helpers.ts`, où les entrailles du générateur pseudo-aléatoire ont imposé d'exclure les
 *   opérateurs binaires).
 */
export const FISCAL_MODULES_HORS_PERIMETRE = [
    { file: 'utils/tax.ts', literals: 82, reason: 'source désignée du garde V1' },
    { file: 'services/realEstate.ts', literals: 26, reason: 'source désignée du garde V1' },
    { file: 'services/projection.ts', literals: 31, reason: 'orchestrateur — trou connu et assumé' },
    // Ces trois-ci étaient chiffrés en PROSE seulement : une métrique qu'aucun test ne relit dérive
    // en silence (`DOC-METRIQUE-RECOPIEE`). Elles rejoignent la table pour être vérifiées.
    { file: 'services/projection/historicalReturns.ts', literals: 58, reason: 'rendements de marché observés' },
    { file: 'services/pdfReport.ts', literals: 61, reason: 'mise en page du rapport PDF' },
    { file: 'services/projection/monthlyCalcs.ts', literals: 15, reason: 'agrégats mensuels, aucun barème' },
    // ⚠️ AJOUTÉ le 2026-08-20 (revue de `[GROSSFROMNET-ANNEE-FIGEE]`). Ce module ASSEMBLE les
    // paramètres du moteur ; il ne calcule aucun barème, mais il porte désormais un défaut d'année
    // (`computeBaseGrossAnnual(users, year = TAX_BASE_YEAR)`). Il n'était NI scanné NI déclaré ici —
    // donc invisible aux deux bouts, ce qui rendait à moitié fausse mon affirmation « le ratchet a
    // attrapé mon propre code » : il en avait attrapé UN des DEUX littéraux du même commit.
    { file: 'services/projection/buildSimulationParams.ts', literals: 1, reason: 'assemblage des paramètres, aucun barème' },
] as const;

/**
 * Littéraux BÉNINS : indices, mois, pourcentage, epsilons.
 *
 * ⚠️ 2026-08-20 — `'0.5'` et `'1000'` RETIRÉS ([FISC-GUARD-SCOPE], revue). La justification d'origine
 * (« aucun barème fiscal ne vaut 0, 1, 2, 12 ou 100 ») ne les mentionnait même pas : ils avaient été
 * ajoutés à la liste sans que le critère soit étendu pour les couvrir. Ils masquaient TROIS vraies
 * valeurs légales, dans des modules pourtant scannés :
 *   • `assetLocation.ts:117` `marginalRate * 0.5` — taux d'INCLUSION des gains en capital, seul site
 *     du dépôt à le recopier au lieu d'importer `CAPITAL_GAINS_INCLUSION_STANDARD` ;
 *   • `taxDecember.ts:667` `0.5 * splittable[H]` — plafond LÉGAL de 50 % du fractionnement de
 *     pension (T1032 / Annexe Q) ;
 *   • `childrenReee.ts:24` `SCEE_ANNUAL_GRANT_CATCHUP = 1000` — SCEE de rattrapage (ARC), dont le
 *     jumeau IQEE (500 $) était, lui, bien inventorié.
 * Leçon du lot : **auditer le critère du FILTRE autant que celui de la LISTE** — j'avais corrigé
 * l'un et laissé l'autre. Retrait mesuré : 15 occurrences révélées, 8 clés neuves.
 *
 * Ce qui reste ici est vraiment inoffensif : indices, mois, jours, pourcentage, epsilons.
 */
const BENIGN = new Set(['0', '1', '2', '3', '4', '10', '12', '24', '60', '100', '365', '1e-9', '1e-6']);

export interface ConstHit {
    line: number;
    value: string;
    text: string;
}

function stripComments(source: string): string[] {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .split('\n')
        .map((l) => l.replace(/\/\/.*$/, ''));
}

/**
 * Relève les littéraux numériques en position SIGNIFIANTE dans un module fiscal.
 *
 * Positions retenues : opérande d'un calcul (`* 0.18`), d'une comparaison (`>= 65`), d'une
 * affectation de constante (`= 100_000`), ou d'un repli (`|| 0.20`) — cette dernière ayant été
 * AJOUTÉE après avoir constaté qu'un vrai taux FERR y échappait au premier jet du scan.
 */
export function findFiscalConstants(source: string): ConstHit[] {
    const out: ConstHit[] = [];
    stripComments(source).forEach((line, i) => {
        for (const m of line.matchAll(/(?<![\w.$])(\d+(?:_\d+)*(?:\.\d+)?(?:e-?\d+)?)(?![\w.$])/g)) {
            const value = m[1].replace(/_/g, '');
            if (BENIGN.has(value)) continue;
            const before = line.slice(0, m.index).trimEnd();
            const after = line.slice((m.index ?? 0) + m[1].length).trimStart();
            // ⚠️ Les opérateurs BINAIRES sont exclus : aucune règle fiscale ne s'écrit avec `>>>`,
            // `<<`, `&`, `^` ou un `|` simple. Sans cette exclusion, l'élargissement du scan à
            // `helpers.ts` noyait le signal sous les entrailles du générateur pseudo-aléatoire
            // (`Math.imul(t ^ (t >>> 15), t | 1)`) — un garde bruyant se fait désarmer.
            const bitwise = /(>>>?|<<|[&^]|(?<!\|)\|)$/.test(before);
            const significant = !bitwise && (
                /[*/+\-<>=]$/.test(before)   // calcul, comparaison, affectation
                || /(\|\||\?\?)$/.test(before) // repli (`|| 0.20`, `?? 0.20`)
                || /^[*/]/.test(after)       // le littéral est à GAUCHE d'un produit
                // ⚠️ AJOUTÉ le 2026-08-20 (`[FISC-GUARD-VALEUR-LIEE]`). Le filtre ne voyait qu'un
                // littéral qu'on CALCULE. Or un barème est tout aussi souvent un littéral qu'on
                // NOMME — valeur de propriété d'objet — ou qu'on CHOISIT — branche de ternaire.
                // Angle mort MESURÉ : `RRIF_RATES` (24 facteurs de retrait minimum FERR, ARC) était
                // invisible depuis l'entrée de son fichier au périmètre, ainsi que `DONATION_CREDIT_RATES`
                // (15/29 % féd, 20/24 % QC). Les deux tables les plus fiscales du moteur.
                || /[?:]$/.test(before)      // valeur liée à un nom (`taux: 0.29`) ou choisie (`? 0.5`)
            );
            if (!significant) continue;
            out.push({ line: i + 1, value, text: line.trim() });
        }
    });
    return out;
}

/** Clé d'inventaire — voir l'en-tête pour le choix (fichier, valeur) plutôt que (fichier, ligne). */
export const inventoryKey = (file: string, value: string): string => `${file}::${value}`;

/** Index de l'inventaire, pour une recherche O(1) côté test. */
export function inventoryIndex(
    entries: readonly InventoryEntry[] = FISCAL_CONST_INVENTORY,
): Set<string> {
    return new Set(entries.map((e) => inventoryKey(e.file, e.value)));
}
