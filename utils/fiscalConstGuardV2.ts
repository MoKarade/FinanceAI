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

import { stripComments } from './stripComments';

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
    { file: 'services/projection/taxJanuary.ts', value: '18', family: 'fiscal',
      reason: '[×2] Âge d’ouverture des droits CELI / admissibilité CELIAPP.' },
    { file: 'services/projection/taxJanuary.ts', value: '71', family: 'fiscal',
      reason: '[≠4] DEUX RÈGLES ARC distinctes sous la même clé — ma marque `[×4]` prétendait à tort qu’elles avaient le même sens. `closureForcedBy71` / éligibilité CELIAPP : fermeture obligatoire du CELIAPP/FHSA au 31 décembre de l’année des 71 ans (le commentaire du bloc FHSA cite l’audit §6.10). `rrspRoomDelta` / `rrspRoomReset` : arrêt de l’accumulation des droits REER et remise à zéro, corollaire de la conversion REER → FERR. Deux dispositions qui partagent un âge et peuvent bouger indépendamment.' },
    { file: 'services/projection/taxJanuary.ts', value: '15', family: 'fiscal',
      reason: '[×2] Durée de vie maximale du CELIAPP (15 ans depuis l’ouverture, ARC).' },
    { file: 'services/projection/taxJanuary.ts', value: '0.25', family: 'design',
      reason: 'PROXY de modèle : inverse l’impôt sur gains vers le gain BRUT en supposant un taux effectif de 25 % (inclusion 50 % × marginal 50 %). Combine un vrai paramètre et un marginal SUPPOSÉ → approximation, jamais un taux statutaire à sourcer.' },
    { file: 'services/projection/taxJanuary.ts', value: '0.06', family: 'design',
      reason: 'Plafond de la bande de lissage Guyton-Klinger (gel total dès −6 % de baisse). Heuristique de stratégie, centrée sur l’ancien seuil −5 % ; [ENG-GK-THRESHOLD-KNIFE] a remplacé le couteau binaire (0.95) par cette bande.' },
    { file: 'services/projection/taxJanuary.ts', value: '0.02', family: 'design',
      reason: 'Largeur de la bande de lissage Guyton-Klinger (−4 % → −6 %, linéaire). Design d’instabilité numérique, pas un chiffre fiscal ; [ENG-GK-THRESHOLD-KNIFE].' },

    // ── services/projection.ts ──────────────────────────────────────────────────────────────
    // [FISC-GUARD-PROJECTION-TS] 37 littéraux, 20 clés. QUATRE sont de vraies bornes légales ; les
    // seize autres sont des défauts de saisie, des index ou des paramètres de SCÉNARIO.
    { file: 'services/projection.ts', value: '18', family: 'fiscal',
      reason: '[×2] Âge à partir duquel la résidence au Canada compte pour la PSV (L353 à l’initialisation, L840 dans la boucle annuelle). Même règle aux deux sites. Ancrée dans FISCAL_REFERENCE §PSV — « résidence au Canada après 18 ans » (PSV_MIN_RESIDENCY_YEARS).' },
    { file: 'services/projection.ts', value: '65', family: 'fiscal',
      reason: '[≠4] QUATRE sens sous la même clé, qui peuvent bouger indépendamment. L840 : fin de l’accumulation de résidence PSV (règle légale, FISCAL_REFERENCE §PSV). L1388 : seuil d’âge des crédits et de la récupération PSV (règle légale). L2544 : comparaison de l’âge RRQ choisi au standard 65 pour libeller « rentes reportées ». L359 : `retirementGoal.targetAge || 65` — DÉFAUT DE SAISIE, pas une règle : l’utilisateur choisit son âge de retraite.' },
    { file: 'services/projection.ts', value: '60', family: 'fiscal',
      reason: '[≠3] L585 et L586 : part de la rente conservée par le SURVIVANT (RRQ et régime DB), défaut réglementaire — deux sites, même règle. L767 : `m === 60`, le mois 60 du scénario WINDFALL, qui n’a rien de fiscal.' },
    { file: 'services/projection.ts', value: '30', family: 'design',
      reason: '[×6] `u.age || 30` — âge de repli quand un conjoint n’a pas d’âge saisi (L310, L351, L641, L750, L838, L1310). Défaut de saisie, aucune règle derrière.' },
    { file: 'services/projection.ts', value: '0.5', family: 'design',
      reason: '[≠3] L1708 : part de garde d’enfant au divorce (moitié). L1901 : seuil de « coussin passif » à 50 % du fonds d’urgence avant de vendre des actifs. L2089 : epsilon de découvert (`liquid < -0.5`). Trois moitiés sans rapport entre elles.' },
    { file: 'services/projection.ts', value: '250000', family: 'design',
      reason: '[×2] Montant d’héritage des scénarios WINDFALL (L768) et LATE_INHERITANCE (L777). Paramètre de SCÉNARIO comparatif, pas une valeur fiscale.' },
    { file: 'services/projection.ts', value: '250', family: 'design',
      reason: '[×2] Fragment du libellé « 250 000$ » des deux scénarios d’héritage (L770, L779) — du TEXTE, capté par le scan parce qu’il suit un caractère significatif.' },
    { file: 'services/projection.ts', value: '11', family: 'design',
      reason: '[×2] `currentMonthIndex === 11` — décembre, l’index du mois de la déclaration (L1239, L1388). Index de boucle, pas un barème.' },
    { file: 'services/projection.ts', value: '5', family: 'design',
      reason: '[≠2] L151 : `dateStr.slice(5, 7)`, position du mois dans une date ISO. L474 : `stressTestYear || 5`, année de krach par défaut du test de résistance.' },
    { file: 'services/projection.ts', value: '7', family: 'design',
      reason: 'L149 : longueur minimale d’une date ISO `AAAA-MM` avant de la découper.' },
    { file: 'services/projection.ts', value: '55', family: 'design',
      reason: 'L360 : âge de retraite du scénario nommé LIBERTE_55 — le nom du scénario EST sa définition, pas une règle externe.' },
    { file: 'services/projection.ts', value: '4000', family: 'design',
      reason: 'L379 : dépenses mensuelles théoriques par défaut du mode « projection théorique ». Défaut de saisie.' },
    { file: 'services/projection.ts', value: '2.5', family: 'design',
      reason: 'L468 : croissance salariale annuelle par défaut (%). Hypothèse de modèle modifiable par l’utilisateur.' },
    { file: 'services/projection.ts', value: '50', family: 'design',
      reason: 'L725 : plafond du nombre d’événements journalisés — garde-fou d’affichage.' },
    { file: 'services/projection.ts', value: '31', family: 'design',
      reason: 'L733 : borne haute d’un numéro de jour valide, pour décider si un événement porte un jour exploitable.' },
    { file: 'services/projection.ts', value: '240', family: 'design',
      reason: 'L776 : mois 240 (20 ans) du scénario LATE_INHERITANCE. Paramètre de scénario.' },
    { file: 'services/projection.ts', value: '0.005', family: 'design',
      reason: 'L1570 : epsilon sous lequel un solde de dette est considéré éteint, pour ne pas répéter l’alerte de fin de terme tous les mois.' },
    { file: 'services/projection.ts', value: '300', family: 'design',
      reason: 'L1579 : plancher de remboursement du capital d’une dette sans échéance — 300 mois, soit 25 ans × 12 (le commentaire du code le dit).' },

    // ── services/projection/taxApril.ts ─────────────────────────────────────────────────────
    { file: 'services/projection/taxApril.ts', value: '30', family: 'fiscal',
      reason: 'TAX_DUE_DAY : date limite de PAIEMENT du solde d’impôt des particuliers — le 30 avril (ARC et Revenu Québec). Ancrée dans FISCAL_REFERENCE §1 (échéances).' },

    // ── services/projection/taxDecember.ts ───────────────────────────────────────────────────
    { file: 'services/projection/taxDecember.ts', value: '65', family: 'fiscal',
      reason: '[≠3] TROIS occurrences, deux dispositions distinctes. Gate de `computeOasClawback` — âge d’ouverture de la PSV. Admissibilité au crédit en raison de l’âge, à DEUX sites : `mkActiveAgeOpts` (§4) et le `mk` d’`incrementalBandTax` (bandes incrémentales §2 gains / §3 dividendes, [FISC-TAXDEC-INCR]). ⚠️ La QUATRIÈME — le gate d’âge du revenu de pension ADMISSIBLE — a QUITTÉ ce fichier le 2026-09-02 (`[FISC-LATENT-PENSION-CREDIT]`) : la règle est extraite en source unique `services/projection/pensionCredit.ts`, ajoutée au périmètre scanné ci-dessous pour que la dette ne change pas de cachette, et elle y est écrite avec la CONSTANTE NOMMÉE `AGE_AMOUNT_FED_MIN_AGE` — donc plus aucun littéral à déclarer. ⚠️ Et il n’y a AUCUN « pivot RRQ » dans ce fichier : cette mention de ma première raison était fausse.' },
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
      reason: '[≠3] TROIS occurrences, deux sens. (1)+(2) Âge PIVOT de la RRQ et de la PSV, base des facteurs d’ajustement et de report (`(rrqStartAge - 65) * 12`, `(psvStartAge - 65) * 12`). (3) ⚠️ AJOUTÉE au périmètre le 2026-08-22 : borne LÉGALE BASSE de la PSV, `Math.max(65, psvStartAge ?? defaultStart)` — on ne peut pas toucher la PSV avant 65 ans. Le pivot et la borne coïncident numériquement mais ne sont PAS la même règle : le pivot survivrait à un changement de la borne.' },
    { file: 'services/projection/retirementIncome.ts', value: '70', family: 'fiscal',
      reason: '[×2] Âge maximal de report de la PSV, écrit DEUX fois : comme borne du clamp (`Math.min(70, …)`, visible depuis le 2026-08-22 seulement) et comme valeur imposée par la stratégie de report optimal (`psvStartAge = 70`). Deux écritures de la même règle légale — si l’une change sans l’autre, le clamp et la stratégie se contredisent en silence.' },
    { file: 'services/projection/retirementIncome.ts', value: '72', family: 'fiscal',
      reason: '[×2] Âge maximal de report de la rente RRQ (étendu de 70 à 72 en 2024), écrit DEUX fois : borne du clamp (`Math.min(72, …)`, visible depuis le 2026-08-22 seulement) et valeur de la stratégie de report optimal (`rrqStartAge = 72`). Même risque de divergence silencieuse que son jumeau PSV.' },
    // ⚠️ AJOUTÉES le 2026-08-22 ([FISC-GUARD-ARGUMENT] + [FISC-GUARD-BENIGN-60]) : révélées par
    // l’élargissement à la position d’ARGUMENT et par le retrait de `60` de BENIGN.
    { file: 'services/projection/retirementIncome.ts', value: '18', family: 'fiscal',
      reason: 'Âge de début de la période COTISABLE à la RRQ. Le modèle « 39 meilleures années » compte les années cotisées de 18 ans jusqu’à la retraite (FISCAL_REFERENCE §6) : ce 18 est le numérateur du prorata de résidence RRQ, `Math.max(18, residencyStartU - birthYearU)`. Barème légal, à ancrer §6 aux côtés de `RRQ_DENOMINATOR_YEARS` (39) qui est, lui, déjà nommé — c’est le déséquilibre qui rendait ce littéral suspect.' },
    { file: 'services/projection/retirementIncome.ts', value: '60', family: 'fiscal',
      reason: 'Borne LÉGALE basse d’anticipation de la rente RRQ : `Math.max(60, rrqStartAge ?? defaultStart)`. On ne peut pas demander sa rente avant 60 ans, et le facteur d’anticipation est calibré sur cette borne. Elle était doublement invisible — `60` était dans BENIGN, ET la valeur est en position d’argument : il a fallu les deux correctifs du même lot pour la voir.' },
    { file: 'services/projection/retirementIncome.ts', value: '1.0', family: 'structural',
      reason: '[≠2] DEUX plafonnements à 100 %, sans rapport entre eux. (a) `Math.min(1.0, currentGrossUser / rrqMpeProjected)` — le ratio gains/MGA ne dépasse pas 1, cotiser au-delà du maximum des gains admissibles n’augmente pas la rente. (b) `Math.min(1.0, residencyYears / PSV_FULL_RESIDENCY_YEARS)` — le prorata de résidence PSV plafonne à la pleine pension. Les DEUX bornes traduisent une règle, mais le nombre lui-même n’est qu’un plafond de fraction : aucune indexation ne le fera bouger.' },
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
    { file: 'services/projection/helpers.ts', value: '60', family: 'design',
      reason: 'Palier d’âge de `mortalityAnnualProbability` (`if (age < 60) return 0.003`), courbe Stats Canada 2020-2022 unisexe lissée. Hypothèse de RISQUE, comme ses voisins 50/65/70/75/80/85/90/95 déjà inventoriés — surtout PAS l’âge d’anticipation de la RRQ, qui porte le même nombre dans un AUTRE fichier. C’est précisément cette homonymie qui avait fait glisser `60` dans BENIGN.' },
    { file: 'services/projection/setupSimulation.ts', value: '42', family: 'structural',
      reason: 'Graine par défaut du générateur pseudo-aléatoire (`mulberry32(... || 42)`). Aucun rapport avec la fiscalité.' },
    { file: 'services/projection/setupSimulation.ts', value: '30', family: 'structural',
      reason: 'Repli d’âge par défaut quand ni birthYear ni age ne sont saisis. Structurel.' },
        { file: 'services/projection/setupSimulation.ts', value: '18', family: 'fiscal',
      reason: 'Âge d’ouverture des droits REER historiques (`birthYear + 18`) — âge fiscal, à ancrer avec les autres âges-seuils.' },
    { file: 'services/projection/setupSimulation.ts', value: '65', family: 'fiscal',
      reason: '[×2] Âge pivot RRQ : base du décalage `(pensionStartAge - 65) * 12`. Âge fiscal, à ancrer.' },
    { file: 'services/projection/setupSimulation.ts', value: '1.02', family: 'design',
      reason: 'Dé-indexation du salaire à 2 %/an pour RECONSTITUER les salaires passés (`individualSalaryPortion / Math.pow(1.02, y)`) et en déduire les droits REER accumulés avant le début de la simulation. Hypothèse de carrière, pas un barème : le barème de cette même ligne, ce sont `RRSP_ROOM_RATE` et `RRSP_ANNUAL_LIMITS`, tous deux déjà nommés et ancrés. ⚠️ Ce 2 % est INDÉPENDANT de l’inflation saisie par l’utilisateur — un profil qui projette 4 % voit quand même son passé reconstruit à 2 %.' },
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

    // ── services/projection/modelAssumptions.ts ──────────────────────────────────────────────
    // ⚠️ Ce module est le domicile DÉSIGNÉ des hypothèses de MODÈLE. Ses entrées sont donc toutes
    // `design` par construction — et c'est précisément pour ça qu'il doit rester scanné : un
    // fichier « pour les hypothèses » est l'endroit rêvé où un vrai barème finirait par se glisser
    // sous couvert d'hypothèse.
    { file: 'services/projection/modelAssumptions.ts', value: '0.05', family: 'design',
      reason: '`COAST_FIRE_ASSUMED_ANNUAL_GROWTH` — croissance supposée pour actualiser la cible CoastFIRE, indépendante de `projection.returnRate` ; portée mesurée NULLE (champ publié sans consommateur), suivie par `[COASTFIRE-CROISSANCE-FIGEE]`. ⚠️ Cette clé portait la marque `[≠2]` jusqu’au 2026-08-24 : elle recouvrait AUSSI `SMITH_HELOC_ANNUAL_RATE`, le taux figé de la marge Smith. Ce littéral a DISPARU du fichier ([SMITH-HELOC-TAUX-FIGE] : le taux suit désormais l’hypothèque, cf. `smithHelocAnnualRate`) — l’inventaire décroît donc d’un sens, exactement comme il doit. Ce n’est pas une valeur de loi : l’ancrer dans FISCAL_REFERENCE lui donnerait une autorité qu’elle n’a pas.' },
    { file: 'services/projection/modelAssumptions.ts', value: '0.02', family: 'design',
      reason: '`SMITH_HELOC_SPREAD_OVER_MORTGAGE` — écart appliqué au-dessus du taux hypothécaire pour obtenir celui de la marge Smith ([SMITH-HELOC-TAUX-FIGE], décision Marc 2026-08-24). ⚠️ La DIRECTION est structurelle (une marge révolvante de rang postérieur se prête plus cher que le prêt de premier rang), la MAGNITUDE est une hypothèse de modèle ASSUMÉE — pas un écart de marché relevé quelque part. La documenter comme un « prime + 0,5 » fabriquerait la source qu’on prétend citer.' },
    { file: 'services/projection/modelAssumptions.ts', value: '0.03', family: 'design',
      reason: '`SMITH_HELOC_RATE_FLOOR` — plancher du taux de la marge Smith. Un bien sans taux hypothécaire saisi donnerait sinon une marge quasi gratuite, donc un levier artificiellement gagnant : c’est précisément le biais que [SMITH-HELOC-TAUX-FIGE] corrige. Garde-fou de modèle, aucune origine réglementaire.' },
    { file: 'services/projection/modelAssumptions.ts', value: '1500', family: 'design',
      reason: '`BARISTA_ASSUMED_MONTHLY_INCOME` — revenu mensuel supposé d’un emploi d’appoint dans la cible BaristaFIRE. Nombre conventionnel, sans source et NON indexé (il reste nominal alors que les dépenses dont il se soustrait sont indexées). Portée mesurée nulle : `BaristaFIRE` est publié au contrat et lu par personne.' },
    { file: 'services/projection/modelAssumptions.ts', value: '25', family: 'design',
      reason: '`FIRE_TARGET_MULTIPLE` — multiple de dépenses annuelles de la règle des 4 % (Trinity Study, 1998). Convention de planification largement documentée, PAS un paramètre fiscal : aucune autorité ne la publie et aucun texte de loi ne s’y réfère. Source unique des deux sites qui en portaient chacun une copie anonyme (`projection.ts`, `monthlyOutput.ts`).' },

    // ── services/projection/realEstateMonth.ts ───────────────────────────────────────────────
    { file: 'services/projection/realEstateMonth.ts', value: '0.4', family: 'design',
      reason: '`DOWNSIZE_RELEASE_PCT` — part de l’équité libérée lors d’un downsizing. Hypothèse de stratégie (frais de vente, achat plus petit), pas une règle.' },
    { file: 'services/projection/realEstateMonth.ts', value: '2022', family: 'fiscal',
      reason: '⚠️ MA PREMIÈRE RAISON ÉTAIT FAUSSE (revue 2026-08-20) : j’y avais lu la règle anti-flip et l’exemption de résidence principale. Le code est DANS le bloc RAP et pilote `rapRepaymentStartOffset` — c’est la borne BASSE de la fenêtre du report temporaire du DÉBUT DE REMBOURSEMENT du RAP (Budget fédéral 2024 : 5 ans de grâce au lieu de 2 pour les retraits du 1er janvier 2022 au 31 décembre 2025). Rien à voir avec le gain en capital. À ancrer §7 (régimes enregistrés), avec la durée de 15 ans — pas §8.' },
    { file: 'services/projection/realEstateMonth.ts', value: '2025', family: 'fiscal',
      reason: 'Borne HAUTE de la fenêtre du report de remboursement du RAP (Budget fédéral 2024), cf. l’entrée `2022` du même fichier. Les deux bornes ET la durée de grâce (5 ans vs 2) doivent être sourcées ENSEMBLE en §7 : en ancrer une seule laisserait une règle à moitié fausse.' },
    { file: 'services/projection/realEstateMonth.ts', value: '60', family: 'design',
      reason: 'Terme hypothécaire de 5 ans exprimé en MOIS : `remainingMonths > 60` empêche de « renouveler » un prêt dont il reste moins d’un terme. Convention du marché canadien, pas une règle de loi. ⚠️ Son JUMEAU `monthsSincePurchase % 60 === 0`, deux lignes plus haut, reste INVISIBLE au scan — l’opérateur `%` n’est pas une position retenue. Les deux 60 disent la même chose et doivent bouger ensemble ; celui-ci sert de sentinelle pour l’autre.' },
    { file: 'services/projection/realEstateMonth.ts', value: '0.01', family: 'design',
      reason: 'Plancher du taux au renouvellement hypothécaire (`Math.max(0.01, mortgageRate/100 + rateShock)`) : le choc pseudo-aléatoire de ±1,5 pp pourrait sinon rendre un taux négatif, qui casserait la formule d’amortissement. Garde-fou numérique du modèle, aucune origine réglementaire.' },
    { file: 'services/projection/realEstateMonth.ts', value: '0.015', family: 'design',
      reason: 'Amplitude du choc de taux pseudo-aléatoire dérivé de l’identifiant du bien (±1,5 pp). Paramètre de simulation, pas un taux de marché observé.' },
    // ⚠️ 2026-08-22 — l'entrée `0.05` (taux de marge Smith) a QUITTÉ ce fichier : le littéral est
    // devenu `SMITH_HELOC_ANNUAL_RATE` dans `modelAssumptions.ts`, importé ici
    // ([CONSTANTES-MOTEUR-NON-SOURCEES]). Elle n'est PAS supprimée pour autant — la valeur existe
    // toujours et pèse toujours : elle est ré-inventoriée à son nouveau domicile, lui-même AJOUTÉ au
    // périmètre scanné. C'est la seule façon de nommer une constante sans la faire changer de
    // cachette (même leçon qu'en 2026-08-06 pour `helpers.ts`).
    { file: 'services/projection/realEstateMonth.ts', value: '0.65', family: 'fiscal',
      reason: '[×2] Ratio prêt/valeur au-delà duquel le modèle déclenche un appel de marge (test du seuil, puis calcul du surplus). ⚠️ Reclassé `fiscal` en revue : j’avais écrit « pratique commerciale » alors que le §8 que je citais en preuve dit « LTV 65 %, plafond B-20 de la portion réavançable » — B-20 est une ligne directrice OSFI, source réglementaire dont §8 ancre déjà quatre constantes (`OSFI_MQR_FLOOR`, `OSFI_MQR_BUFFER`, GDS, TDS). Une raison ne peut pas contredire la section qu’elle invoque.' },
    { file: 'services/projection/realEstateMonth.ts', value: '15', family: 'fiscal',
      reason: 'Durée de remboursement du RAP (régime d’accession à la propriété) : 15 ans, ARC. Non ancrée dans FISCAL_REFERENCE — à ajouter §7.' },

    // ── services/projection/w5Effects.ts ─────────────────────────────────────────────────────
    { file: 'services/projection/w5Effects.ts', value: '0.45', family: 'fiscal',
      reason: 'PROXY d’impôt plat de 45 % sur le revenu net d’exploitation locatif. DOCUMENTÉ dans FISCAL_REFERENCE.md §6 « Proxys d’impôt W5 » (décision Marc [W5-TAX-PROXY] : garder le forfait, l’ancrer comme estimation de taux marginal QC). Écart MESURÉ vs impôt incrémental réel sur 30 k$ de NOI : +4 387 $/an à 40 k$ de revenu, +2 665 $ à 60 k$, +1 004 $ à 100 k$, puis NÉGATIF au-delà de ~145 k$ (−738 $ à 150 k$, −2 208 $ à 250 k$) — conservateur en bas, NON conservateur en haut.' },
    { file: 'services/projection/w5Effects.ts', value: '0.36', family: 'fiscal',
      reason: 'PROXY d’impôt plat de 36 % sur un dividende de société privée. DOCUMENTÉ dans FISCAL_REFERENCE.md §6 « Proxys d’impôt W5 ». MESURÉ sur 30 k$ de dividende : correspond au taux d’un dividende ORDINAIRE à ~100 k$ de revenu (36,04 %) et à personne d’autre — il sur-impose un dividende DÉTERMINÉ de jusqu’à 7 606 $/an et sous-impose un actionnaire à 250 k$ de 3 526 $/an. Le dépôt sait pourtant calculer ce taux exactement (utils/tax.ts calculateDividendTax) : ticket `[W5-DIVIDENDE-PROXY-VS-MOTEUR]`.' },
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
    { file: 'services/projection/estateCalculation.ts', value: '1.02', family: 'design',
      reason: '[×2] Le REFLET de `r_npv` (0.02, entrée ci-dessus), écrit en dur sur les DEUX lignes de VAN — RRQ et PSV — pour actualiser une rente qui ne démarrera qu’à 65 ans. Même sens les deux fois, et même nombre que `r_npv` : c’est une duplication, pas un second paramètre. Le piège est déjà nommé par `[ESTATE-NPV-07]` — changer `r_npv` sans changer ces deux `1.02` fait diverger l’actualisation de son propre taux, en silence. La clé existe pour que la duplication soit VISIBLE au garde, pas seulement en commentaire.' },
    { file: 'services/projection/estateCalculation.ts', value: '65', family: 'fiscal',
      reason: '[×2] Âge pivot des rentes publiques (RRQ/PSV), pour la RRQ et pour la PSV, pour décider si la rente est déjà en cours. Vrai paramètre fédéral/QC, ancré FISCAL_REFERENCE §6.' },

    // ── services/projection/activeIncome.ts ──────────────────────────────────────────────────
    { file: 'services/projection/activeIncome.ts', value: '0.55', family: 'fiscal',
      reason: '[≠4] DEUX SENS. (1) Le TAUX DE REMPLACEMENT STATUTAIRE de l’assurance-emploi (55 % des gains assurables, Loi sur l’AE, ancré §2) — DEUX occurrences depuis `[AE-PLAFOND-MANQUANT]` (2026-08-20) : la voie normale `min(brut, plafond) × 0,55` puis net à assiette de cotisation nulle, et le REPLI legacy `net × 0,55` quand le brut est absent (approximation documentée, mieux qu’une prestation inventée à 0). (2) Les deux applications aux bonus/RSU/side : un PROXY de charge fiscale (« taxés ~45 % marginal »), du design. Famille retenue = la plus stricte. Le défaut voisin d’avant (55 % du net NON plafonné comme voie PRINCIPALE) est corrigé par ce même lot.'},
    { file: 'services/projection/activeIncome.ts', value: '0.5', family: 'design',
      reason: 'Indexation PROJETÉE du plafond AE : `(simInflation + 0,5)/100` — le demi-point au-dessus de l’inflation approxime la croissance des salaires moyens qui indexe le MRA en réalité. MÊME patron (et même biais documenté §2) que `rqapCapProjected` dans childrenReee.ts : une hypothèse de modèle, pas un paramètre ARC — ne JAMAIS la « sourcer ».'},
    { file: 'services/projection/activeIncome.ts', value: '60', family: 'design',
      reason: 'Taux de remplacement du revenu par DÉFAUT d’une assurance invalidité longue durée (`proj.ltdIncomeReplacementPct ?? 60`, en pourcentage). Paramètre d’un CONTRAT privé — 60 à 70 % est l’usage du marché — jamais une règle fiscale ni un programme public. À ne pas confondre avec `0.55` du même fichier, qui est LUI le taux de l’assurance-emploi (fédéral, barème). Deux taux de remplacement voisins dans un même module, l’un légal et l’autre contractuel : c’est exactement le genre de paire qu’un inventaire doit distinguer.' },
    { file: 'services/projection/activeIncome.ts', value: '99', family: 'structural',
      reason: '[×2] Sentinelle « pas de fin connue » pour les années de RSU restantes (`?? 99`), pour le 1er conjoint et pour le 2e. Valeur d’absence, pas un paramètre.' },

    // ── services/projection/assetLocation.ts ─────────────────────────────────────────────────
    { file: 'services/projection/assetLocation.ts', value: '0.60', family: 'design',
      reason: 'Taux effectif « dividende canadien éligible » estimé à 60 % du marginal (proxy majoration 1,38 + crédits), branche `ca-equity`. Hypothèse de modèle COMMENTÉE sur place (FA-8) — mais pas nommée : c’est un littéral nu dans un `return`. Module CONSULTATIF (perte d’allocation), pas le moteur : proxy assumé, pas un barème à sourcer.' },
    // [ASSETLOC-YEAR-2026] L'entrée `2026` (année fiscale de repli, `input.year ?? 2026`) a été
    // RETIRÉE ici le 2026-08-21 parce que le littéral n'existe plus : `year` est devenu REQUIS dans
    // `AssetLocationInput`, et l'appelant fournit l'année courante. La garde anti-entrée-fantôme a
    // d'ailleurs rougi d'elle-même sur ce commit — c'est exactement son rôle
    // (`ENTREE-D-INVENTAIRE-FANTOME` : un inventaire de dette doit DÉCROÎTRE, pas conserver des
    // constats périmés qui se lisent comme des faits au présent).
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
    { file: 'services/projection/glidepathRates.ts', value: '0.60', family: 'design',
      reason: 'Plancher du facteur de glissement une fois à la retraite (`Math.max(0.60, glideFactor)`) : le portefeuille ne se dé-risque pas au-delà de 60 % de la trajectoire, sans quoi un retraité de long horizon convergerait vers un rendement quasi nul. Hypothèse d’allocation, pas un barème.' },
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
    { file: 'store/useFinanceStore.ts', value: '36', family: 'structural',
      reason: 'Base 36 de `Math.random().toString(36)` dans le générateur d’identifiants. Mécanique de chaîne de caractères — le seul faux positif ASSUMÉ de l’élargissement à la position d’argument, gardé plutôt qu’exempté : une exemption se lit comme un détail déjà tranché, une entrée d’inventaire dit ce qu’elle est (`AUDITER-LE-FILTRE-AUTANT-QUE-LA-LISTE`).' },
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
      reason: 'Prime d’indexation de 0,5 pp au-dessus de l’inflation servant à EXTRAPOLER le plafond REER au-delà de la dernière année connue de `RRSP_ANNUAL_LIMITS`. Le plafond lui-même est sourcé ; la vitesse d’extrapolation est une hypothèse de MODÈLE, documentée comme telle en §7 « REER — plafonds annuels » avec son écart mesuré contre l’indexation observée. ⚠️ La référence disait « §7.G » — une section qui n’a JAMAIS existé dans FISCAL_REFERENCE.md : une raison qui pointe une ancre fantôme se lit comme « c’est sourcé quelque part » et personne ne vérifie.' },
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
    // ⚠️ AJOUTÉ le 2026-09-01 (`[FISC-GUARD-PROJECTION-TS]`). L'orchestrateur était le dernier
    // trou DÉCLARÉ du ratchet : « le travail fiscal vit dans les sous-modules déjà scannés ». C'est
    // vrai des BARÈMES, mais pas des BORNES D'ÂGE, qui se décident dans la boucle — l'entrée du
    // fichier au périmètre a sorti de l'ombre l'âge 18 de la résidence PSV, le 65 de fin
    // d'accumulation, le 60 du taux au survivant et le 70 du report RRQ.
    // Périmètre MESURÉ avant d'écrire : 37 littéraux → 20 clés (fichier, valeur) à trier. Le ticket
    // en annonçait 31, chiffre du 2026-08-20 : le fichier a bougé depuis.
    'services/projection.ts',
    'services/projection/taxDecember.ts',
    'services/projection/taxApril.ts',
    'services/projection/taxJanuary.ts',
    'services/projection/latentTax.ts',
    // ⚠️ AJOUTÉ le 2026-09-02 (`[FISC-LATENT-PENSION-CREDIT]`) — et c'est CETTE GARDE qui l'a exigé :
    // en extrayant l'assiette du crédit pour revenu de retraite hors de `taxDecember`, le compte de
    // littéraux `65` du fichier d'origine est passé de 4 à 3 et l'inventaire a rougi. Sans l'entrée
    // ci-dessous, deux règles d'âge fiscales (65 ARC, 72 FERR) auraient quitté le périmètre scanné :
    // exactement le mode d'échec que l'ajout de 2026-08-06 décrit plus bas — la dette qui change de
    // cachette au lieu de se résorber. Le module n'a AUCUN littéral aujourd'hui (constantes nommées),
    // donc aucune entrée d'inventaire ; le scanner est là pour le jour où quelqu'un en écrira un.
    'services/projection/pensionCredit.ts',
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
    // ⚠️ AJOUTÉ le 2026-08-22 ([CONSTANTES-MOTEUR-NON-SOURCEES]). Nommer une constante la déplace :
    // `SMITH_HELOC_ANNUAL_RATE` est sorti de `realEstateMonth.ts` (scanné) pour entrer ici. Sans cet
    // ajout, l'opération aurait fait DISPARAÎTRE la valeur du garde tout en la laissant peser autant
    // sur le moteur — exactement le mode de panne décrit six lignes plus haut. Le ratchet l'a d'ailleurs
    // exigé de lui-même : sa garde anti-fantôme a rougi sur ce commit.
    'services/projection/modelAssumptions.ts',
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
 * ⚠️ 2026-08-22 — `'60'` RETIRÉ ([FISC-GUARD-BENIGN-60]). Même faute que ci-dessus, une seconde fois :
 * la justification parlait d'indices et de mois, et `60` y avait été glissé comme « secondes/minutes »
 * — or aucune des quatre occurrences du dépôt n'est une durée. Ce qu'il masquait, MESURÉ :
 *   • `retirementIncome.ts` `Math.max(60, …)` — borne LÉGALE basse d'anticipation de la RRQ (§6),
 *     et la seule des quatre qui soit fiscale. C'était la cible du ticket ;
 *   • `helpers.ts` `if (age < 60)` — palier de la courbe de mortalité (Stats Canada) ;
 *   • `realEstateMonth.ts` `remainingMonths > 60` — terme hypothécaire de 5 ans en mois ;
 *   • `activeIncome.ts` `?? 60` — taux de remplacement par défaut d'une assurance invalidité.
 * ⚠️ Le retirer ne SUFFISAIT PAS : le 60 de la RRQ est en position d'ARGUMENT, donc doublement
 * caché. Il fallait les DEUX correctifs, d'où le lot commun avec [FISC-GUARD-ARGUMENT].
 *
 * Ce qui reste ici est vraiment inoffensif : indices, mois, jours, pourcentage, epsilons.
 */
const BENIGN = new Set(['0', '1', '2', '3', '4', '10', '12', '24', '100', '365', '1e-9', '1e-6']);

export interface ConstHit {
    line: number;
    value: string;
    text: string;
}

/** [GUARD-STRIPCOMMENTS-CONSOLIDER] Découpe en lignes le source décommenté par la SOURCE UNIQUE
 *  (`utils/stripComments.ts`). La copie locale d'avant était aveugle aux littéraux de chaîne : un
 *  `//` dans une URL amputait la ligne, donc une constante fiscale placée après y échappait. */
const lignesDeCode = (source: string): string[] => stripComments(source).split('\n');

/**
 * Relève les littéraux numériques en position SIGNIFIANTE dans un module fiscal.
 *
 * Positions retenues : opérande d'un calcul (`* 0.18`), d'une comparaison (`>= 65`), d'une
 * affectation de constante (`= 100_000`), ou d'un repli (`|| 0.20`) — cette dernière ayant été
 * AJOUTÉE après avoir constaté qu'un vrai taux FERR y échappait au premier jet du scan.
 */
export function findFiscalConstants(source: string): ConstHit[] {
    const out: ConstHit[] = [];
    lignesDeCode(source).forEach((line, i) => {
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
                // ⚠️ AJOUTÉ le 2026-08-22 (`[FISC-GUARD-ARGUMENT]`). Quatrième position : le littéral
                // PASSÉ à une fonction — `Math.max(18, …)`, `Math.min(60, …)`. Deux barèmes légaux y
                // vivaient sans aucune clé : l'âge 18 de début de la période cotisable RRQ et la borne
                // 60 d'anticipation de la RRQ. Le motif exige un IDENTIFIANT collé à la parenthèse :
                // c'est ce qui distingue un appel de fonction d'une parenthèse de PROSE. Le motif large
                // `/[(,]$/`, mesuré d'abord, relevait « (18 ans) » dans un message utilisateur de
                // `childrenReee.ts` — `SCAN-QUI-MATCHE-LA-PROSE`, payé une fois de trop.
                || /\w\($/.test(before)      // 1er argument d'un appel (`Math.max(60, …)`)
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
