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
export const FISCAL_CONST_INVENTORY: readonly InventoryEntry[] = [
    // ── services/projection/taxJanuary.ts ────────────────────────────────────────────────────
    { file: 'services/projection/taxJanuary.ts', value: '2026', family: 'fiscal',
      reason: 'Année d’ancrage dans RRSP_ANNUAL_LIMITS pour l’extrapolation au-delà du barème connu.' },
    { file: 'services/projection/taxJanuary.ts', value: '18', family: 'fiscal',
      reason: '[×2] Âge d’ouverture des droits CELI / admissibilité CELIAPP.' },
    { file: 'services/projection/taxJanuary.ts', value: '71', family: 'fiscal',
      reason: '[×4] Conversion obligatoire REER → FERR à la fin de l’année des 71 ans (ARC).' },
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
      reason: '[×3] Âge d’ouverture du crédit en raison de l’âge, et pivot RRQ/PSV.' },
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
      reason: '[×2] Seuil d’âge de la courbe de probabilité LTC (calibrée sur Genworth/StatCan, cf. commentaire D2.8) — hypothèse de RISQUE, pas un âge fiscal.' },
    { file: 'services/projection/helpers.ts', value: '70', family: 'design',
      reason: '[×2] Palier d’âge de la courbe LTC. Même nature que 65.' },
    { file: 'services/projection/helpers.ts', value: '75', family: 'design',
      reason: '[×2] Palier d’âge de la courbe LTC. Même nature que 65.' },
    { file: 'services/projection/helpers.ts', value: '80', family: 'design',
      reason: '[×2] Palier d’âge de la courbe LTC. Même nature que 65.' },
    { file: 'services/projection/helpers.ts', value: '85', family: 'design',
      reason: '[×2] Palier d’âge de la courbe LTC. Même nature que 65.' },
    { file: 'services/projection/helpers.ts', value: '90', family: 'design',
      reason: '[×2] Palier d’âge de la courbe LTC. Même nature que 65.' },
    // ⚠️ ENTRÉE DOUBLE DE SENS — la première fois que la clé (fichier, valeur) coûte quelque chose.
    // `95` apparaît DEUX fois dans helpers.ts avec des natures OPPOSÉES, et la clé ne peut pas les
    // distinguer. Les deux sont décrites ici plutôt que d'en taire une ; `family` prend le sens le
    // plus EXIGEANT (`fiscal`), parce qu'un littéral qui porte un vrai paramètre ARC mérite la
    // relecture stricte même s'il porte aussi une heuristique. Le compromis était documenté en tête
    // de fichier ; il est désormais VÉCU, pas seulement anticipé.
    { file: 'services/projection/helpers.ts', value: '95', family: 'fiscal',
      reason: '[×2] DEUX occurrences distinctes. (1) FISCAL — RRIF_PLATEAU_AGE : âge à partir duquel le facteur FERR est figé au plateau de 20 %. Ancré le 2026-08-06 ; il était jusque-là IMPLICITE, porté par la seule ABSENCE d’entrée dans la table au-delà de 94 — un seuil qu’aucune ligne n’écrit ne peut être ni relu ni corrigé. (2) DESIGN — palier terminal de la courbe de mortalité/LTC (`if (age < 95) return 0.140`), hypothèse de risque calibrée, à ne JAMAIS sourcer comme une valeur fiscale.' },
    { file: 'services/projection/helpers.ts', value: '50', family: 'design',
      reason: 'Palier d’âge bas de la courbe de mortalité/LTC. Hypothèse de risque.' },
    { file: 'services/projection/setupSimulation.ts', value: '42', family: 'structural',
      reason: 'Graine par défaut du générateur pseudo-aléatoire (`mulberry32(... || 42)`). Aucun rapport avec la fiscalité.' },
    { file: 'services/projection/setupSimulation.ts', value: '30', family: 'structural',
      reason: 'Repli d’âge par défaut quand ni birthYear ni age ne sont saisis. Structurel.' },
    { file: 'services/projection/setupSimulation.ts', value: '18', family: 'fiscal',
      reason: 'Âge d’ouverture des droits REER historiques (`birthYear + 18`) — âge fiscal, à ancrer avec les autres âges-seuils.' },
    { file: 'services/projection/setupSimulation.ts', value: '65', family: 'fiscal',
      reason: 'Âge pivot RRQ : base du décalage `(pensionStartAge - 65) * 12`. Âge fiscal, à ancrer.' },
    { file: 'services/projection/setupSimulation.ts', value: '8000', family: 'design',
      reason: 'Revenu théorique mensuel de repli quand aucun salaire n’est saisi. Hypothèse d’amorçage, pas un barème.' },
    { file: 'services/projection/setupSimulation.ts', value: '0.55', family: 'design',
      reason: 'Part du revenu théorique attribuée au 1er conjoint (55/45). Hypothèse de répartition, pas une règle.' },
    { file: 'services/projection/setupSimulation.ts', value: '0.45', family: 'design',
      reason: 'Part du revenu théorique attribuée au 2e conjoint. Même nature que 0.55.' },
    { file: 'services/projection/setupSimulation.ts', value: '1.35', family: 'design',
      reason: '[×4] Facteur brut/net approximatif pour remonter un revenu théorique. Approximation de modèle.' },
    { file: 'services/projection/setupSimulation.ts', value: '2.0', family: 'structural',
      reason: 'Constante mathématique d’une formule de simulation. Pas fiscale.' },
    { file: 'services/projection/setupSimulation.ts', value: '5.5', family: 'design',
      reason: 'Paramètre d’amorçage de simulation. Hypothèse de modèle.' },
    { file: 'services/projection/setupSimulation.ts', value: '5.0', family: 'design',
      reason: 'Paramètre d’amorçage de simulation. Hypothèse de modèle.' },
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
      reason: 'DEUX SENS sous la même clé (l’index est (fichier, valeur), pas la ligne) : L22 `SCEE_GRANT_RATE` = 20 % de la cotisation REEE (ARC) — ancré FISCAL_REFERENCE §7 ; ET L41 `REEE_AIP_TAX_RATE` = approximation de l’impôt sur le PRA à la fermeture, qui est une LIMITE CONNUE assumée (§9), pas un taux statutaire. Les deux sont documentés, mais ils ne sont pas de même nature.' },
    { file: 'services/projection/childrenReee.ts', value: '500', family: 'fiscal',
      reason: 'TROIS SENS sous la même clé : L23 `SCEE_ANNUAL_GRANT_BASIC` (500 $/an, ARC) ; L30 `IQEE_ANNUAL_GRANT_CATCHUP` (500 $/an en rattrapage, Revenu Québec) ; et L243 un coût d’ENFANT de 500 $ à 16 ans (permis de conduire), qui lui est du `design`. Les deux premiers sont ancrés §7.' },
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
    { file: 'services/projection/childrenReee.ts', value: '98000', family: 'fiscal',
      reason: '⚠️ VALEUR FAUSSE, PAS SEULEMENT NON SOURCÉE. L256 `rqapCap = 98000 * expenseMultiplier` est le plafond de revenu assurable RQAP figé à sa valeur 2025, alors que la source unique `utils/tax.ts` porte `RQAP_MAX_INCOME = 103000` (§2). Ticket dédié `[RQAP-CAP-98K]` — à remplacer par un import, pas à inventorier durablement.' },
    { file: 'services/projection/childrenReee.ts', value: '0.55', family: 'fiscal',
      reason: 'Taux de remplacement du revenu appliqué au congé parental (L259). Le régime de BASE du RQAP verse 70 % puis 55 % selon la phase ; un 0,55 plat sous-estime le début du congé. Ni le taux ni le choix de la phase ne sont dans FISCAL_REFERENCE. Ticket `[RQAP-CAP-98K]`.' },
    { file: 'services/projection/childrenReee.ts', value: '350', family: 'design',
      reason: 'Économie de transport pendant le congé parental (350 $/mois). Hypothèse de coût de ménage, indexée par `expenseMultiplier` — aucune règle fiscale, à ne surtout pas « sourcer ».' },
    { file: 'services/projection/childrenReee.ts', value: '400', family: 'design',
      reason: 'Seuil de frais de garde au-delà duquel l’aide implicite s’applique. Heuristique FISC-CHILDCARE documentée §9 comme LIMITE assumée, pas comme barème.' },
    { file: 'services/projection/childrenReee.ts', value: '0.30', family: 'design',
      reason: 'Part du coût de garde restant à charge au-delà du seuil (≈70 % d’aide implicite). Approximation de modèle, cf. §9 — le vrai crédit est un barème progressif selon le revenu familial.' },
    { file: 'services/projection/childrenReee.ts', value: '150000', family: 'design',
      reason: 'Seuil de revenu familial où le modèle commence à réduire l’aide aux études (L291) et base du prorata (L292). PROXY de conception : ce n’est pas le seuil d’un programme réel, c’est une courbe de dégressivité inventée pour l’écran.' },
    { file: 'services/projection/childrenReee.ts', value: '100000', family: 'design',
      reason: 'Largeur de la plage de dégressivité de ce même proxy (L292). Même nature que 150000 — la paire définit une rampe, pas un barème.' },
    { file: 'services/projection/childrenReee.ts', value: '18', family: 'structural',
      reason: 'Âge de majorité converti en MOIS (`18 * 12`), trois fois : fin des coûts d’enfant (L219), achat auto (L362), début des études (L374). Borne de calendrier du modèle, pas un seuil fiscal.' },
    { file: 'services/projection/childrenReee.ts', value: '25', family: 'structural',
      reason: 'Âge (en mois × 12) de fermeture du REEE dans le modèle. Le régime réel autorise 35 ans ; ici c’est la borne de la simulation, donc structurel — la LIMITE est notée §9.' },
    { file: 'services/projection/childrenReee.ts', value: '16', family: 'design',
      reason: 'Âge auquel le modèle ajoute un coût ponctuel (permis de conduire). Hypothèse de coût de ménage.' },
    { file: 'services/projection/childrenReee.ts', value: '50', family: 'design',
      reason: 'Composante forfaitaire du coût mensuel d’un nourrisson, en sus des couches et de la nourriture. Hypothèse de coût.' },
    { file: 'services/projection/childrenReee.ts', value: '5', family: 'design',
      reason: 'Borne basse de la tranche d’âge 5-11 ans de la grille de coûts d’enfant. Paramètre de grille.' },
    { file: 'services/projection/childrenReee.ts', value: '11', family: 'design',
      reason: 'Borne haute de la tranche d’âge 5-11 ans de la grille de coûts d’enfant. Paramètre de grille.' },
    { file: 'services/projection/childrenReee.ts', value: '17', family: 'design',
      reason: 'Borne haute des tranches 12-17 ans, utilisée deux fois : grille de coûts (L239) et fenêtre d’aide aux études (L288). Paramètre de grille dans les deux cas.' },
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
      reason: 'Borne BASSE de la fenêtre où l’exemption de gain en capital sur résidence bénéficie d’une période de grâce allongée (règle anti-flip fédérale). Absente de FISCAL_REFERENCE — à ancrer §8.' },
    { file: 'services/projection/realEstateMonth.ts', value: '2025', family: 'fiscal',
      reason: 'Borne HAUTE de cette même fenêtre. Même statut : règle réelle, non ancrée. Les deux bornes doivent être sourcées ensemble ou retirées ensemble.' },
    { file: 'services/projection/realEstateMonth.ts', value: '0.015', family: 'design',
      reason: 'Amplitude du choc de taux pseudo-aléatoire dérivé de l’identifiant du bien (±1,5 pp). Paramètre de simulation, pas un taux de marché observé.' },
    { file: 'services/projection/realEstateMonth.ts', value: '0.05', family: 'design',
      reason: 'Taux d’intérêt supposé de la marge Smith Manoeuvre (5 %). Hypothèse de modèle — la LIMITE est notée §8 ; le vrai taux dépend du produit et du dossier.' },
    { file: 'services/projection/realEstateMonth.ts', value: '0.65', family: 'design',
      reason: 'Ratio prêt/valeur au-delà duquel le modèle déclenche un appel de marge (L431 test, L432 calcul du surplus). Les prêteurs plafonnent réellement une marge réavançable à 65 % — mais c’est une pratique commerciale, pas un barème fiscal : cf. §8.' },
    { file: 'services/projection/realEstateMonth.ts', value: '15', family: 'fiscal',
      reason: 'Durée de remboursement du RAP (régime d’accession à la propriété) : 15 ans, ARC. Non ancrée dans FISCAL_REFERENCE — à ajouter §7.' },

    // ── services/projection/w5Effects.ts ─────────────────────────────────────────────────────
    { file: 'services/projection/w5Effects.ts', value: '0.45', family: 'fiscal',
      reason: 'PROXY d’impôt plat de 45 % sur le revenu net d’exploitation locatif (L127). Écart MESURÉ vs impôt incrémental réel : +2 665 $/an à 60 k$ de revenu, +1 004 $ à 100 k$, −2 208 $ à 250 k$ — donc NON conservateur aux hauts revenus. Décision Marc close exigeait de le documenter : ticket `[W5-PROXY-NON-SOURCE]`.' },
    { file: 'services/projection/w5Effects.ts', value: '0.36', family: 'fiscal',
      reason: 'PROXY d’impôt plat de 36 % sur un dividende de société privée (L141). Même statut que le 0,45 : ni sourcé, ni ancré, alors qu’il pilote un montant affiché. Ticket `[W5-PROXY-NON-SOURCE]`.' },
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
      reason: 'Taux d’actualisation réel de la VAN des rentes (`r_npv` = 2 %). Hypothèse financière de modèle. Le `1.02` de L229-230 en est le reflet et doit bouger AVEC lui — piège de duplication signalé par `[ESTATE-NPV-07]`.' },
    { file: 'services/projection/estateCalculation.ts', value: '65', family: 'fiscal',
      reason: 'Âge pivot des rentes publiques (RRQ/PSV), en L229 (RRQ) et L230 (PSV), pour décider si la rente est déjà en cours. Vrai paramètre fédéral/QC, ancré FISCAL_REFERENCE §6.' },
    { file: 'services/projection/estateCalculation.ts', value: '0.7', family: 'fiscal',
      reason: 'Facteur de 30 % d’abattement appliqué à la VAN des rentes dans le patrimoine successoral (L232). SANS NOM, SANS COMMENTAIRE, absent de FISCAL_REFERENCE — et 30 % d’une VAN de rentes vaut des dizaines de k$ à l’écran Succession. Ticket `[ESTATE-NPV-07]` : le nommer comme hypothèse de modèle, ou le retirer.' },

    // ── services/projection/activeIncome.ts ──────────────────────────────────────────────────
    { file: 'services/projection/activeIncome.ts', value: '0.55', family: 'design',
      reason: 'Facteur brut→net appliqué au salaire (L70), puis aux bonus/RSU/revenus d’appoint du 1er conjoint (L106) et du 2e (L107). PROXY de charge fiscale globale, pas un taux statutaire. ⚠️ Homonyme du 0,55 du RQAP dans `childrenReee.ts` : deux valeurs identiques, deux sens sans rapport — ne pas les unifier.' },
    { file: 'services/projection/activeIncome.ts', value: '99', family: 'structural',
      reason: 'Sentinelle « pas de fin connue » pour les années de RSU restantes (`?? 99`), en L101 (1er conjoint) et L102 (2e). Valeur d’absence, pas un paramètre.' },

    // ── services/projection/assetLocation.ts ─────────────────────────────────────────────────
    { file: 'services/projection/assetLocation.ts', value: '0.60', family: 'design',
      reason: 'Taux effectif « dividende canadien éligible » estimé à 60 % du marginal (proxy majoration 1,38 + crédits). Hypothèse de modèle NOMMÉE et commentée sur place (FA-8), dans un module CONSULTATIF — pas un barème à sourcer.' },
    { file: 'services/projection/assetLocation.ts', value: '2026', family: 'fiscal',
      reason: 'Année fiscale de repli pour lire le taux marginal quand l’appelant n’en fournit pas. Ancrage temporel du barème, donc fiscal — à faire pointer vers l’année courante du moteur plutôt qu’un littéral.' },
    { file: 'services/projection/assetLocation.ts', value: '0.02', family: 'design',
      reason: 'Écart de rendement supposé actions−obligations (2 pp) servant à chiffrer le coût d’opportunité d’obligations logées au CELI. Hypothèse de marché, pas fiscale.' },
    { file: 'services/projection/assetLocation.ts', value: '20', family: 'design',
      reason: 'Horizon d’illustration de la perte cumulée dans le libellé affiché (« sur 20 ans »). Paramètre de présentation.' },

    // ── services/projection/cashflowAllocation.ts ────────────────────────────────────────────
    { file: 'services/projection/cashflowAllocation.ts', value: '0.1', family: 'structural',
      reason: 'Epsilon de convergence du solveur d’affectation (arrêt quand le manque descend sous 10 ¢). Paramètre d’algorithme.' },
    { file: 'services/projection/cashflowAllocation.ts', value: '7', family: 'design',
      reason: 'Seuil de taux au-delà duquel une dette est traitée en priorité (L324) et étiquetée « dette à taux élevé » (L331). Heuristique de stratégie — la valeur pilote le CALCUL et l’AFFICHAGE, les deux doivent bouger ensemble.' },
    { file: 'services/projection/cashflowAllocation.ts', value: '0.40', family: 'design',
      reason: 'Taux marginal au-delà duquel la stratégie AUTO bascule vers le REER plutôt que le CELI. Seuil de conception ; il s’en approche par un vrai marginal mais n’est lui-même dans aucun barème.' },

    // ── services/projection/glidepathRates.ts ────────────────────────────────────────────────
    { file: 'services/projection/glidepathRates.ts', value: '1.0', family: 'design',
      reason: 'Prime de 1 pp au-dessus de l’inflation visée en fin de glidepath, et facteur neutre du même calcul. Hypothèse d’allocation, pas un rendement observé.' },
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
    { file: 'store/useFinanceStore.ts', value: '1.35', family: 'fiscal',
      reason: 'Facteur brut/net plat servant à FABRIQUER un salaire brut à la migration legacy (L144). Ce brut alimente `baseGrossAnnual`, donc TOUT l’impôt de la projection. `calculateGrossFromNet` existe déjà et est vérifié exact au roundtrip : ticket `[MIGRATE-GROSS-135]`.' },
    { file: 'store/useFinanceStore.ts', value: '5', family: 'structural',
      reason: 'Numéro de version de schéma persisté (`fromVersion < 5`). Palier de migration, aucun rapport avec la fiscalité.' },
    { file: 'store/useFinanceStore.ts', value: '6', family: 'structural',
      reason: 'Numéro de version de schéma persisté (`fromVersion < 6`). Palier de migration.' },
    { file: 'store/useFinanceStore.ts', value: '7', family: 'structural',
      reason: 'Numéro de version de schéma persisté (`fromVersion < 7`). Palier de migration.' },
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
] as const;

/**
 * Littéraux BÉNINS : indices, mois, pourcentage, epsilons. Les exclure n'affaiblit pas le garde —
 * aucun barème fiscal ne vaut 0, 1, 2, 12 ou 100.
 */
const BENIGN = new Set(['0', '1', '2', '3', '4', '10', '12', '24', '60', '100', '365', '1000', '0.5', '1e-9', '1e-6']);

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
