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
      reason: 'Âge d’ouverture des droits CELI / admissibilité CELIAPP.' },
    { file: 'services/projection/taxJanuary.ts', value: '71', family: 'fiscal',
      reason: 'Conversion obligatoire REER → FERR à la fin de l’année des 71 ans (ARC).' },
    { file: 'services/projection/taxJanuary.ts', value: '15', family: 'fiscal',
      reason: 'Durée de vie maximale du CELIAPP (15 ans depuis l’ouverture, ARC).' },
    { file: 'services/projection/taxJanuary.ts', value: '0.25', family: 'design',
      reason: 'PROXY de modèle : inverse l’impôt sur gains vers le gain BRUT en supposant un taux effectif de 25 % (inclusion 50 % × marginal 50 %). Combine un vrai paramètre et un marginal SUPPOSÉ → approximation, jamais un taux statutaire à sourcer.' },
    { file: 'services/projection/taxJanuary.ts', value: '0.95', family: 'design',
      reason: 'Seuil de gel Guyton-Klinger (−5 % du portefeuille). Heuristique de stratégie ; cf. [ENG-GK-THRESHOLD-KNIFE].' },

    // ── services/projection/taxApril.ts ─────────────────────────────────────────────────────
    { file: 'services/projection/taxApril.ts', value: '30', family: 'fiscal',
      reason: 'TAX_DUE_DAY : date limite de PAIEMENT du solde d’impôt des particuliers — le 30 avril (ARC et Revenu Québec). Ancrée dans FISCAL_REFERENCE §1 (échéances).' },

    // ── services/projection/taxDecember.ts ───────────────────────────────────────────────────
    { file: 'services/projection/taxDecember.ts', value: '65', family: 'fiscal',
      reason: 'Âge d’ouverture du crédit en raison de l’âge, et pivot RRQ/PSV.' },
    { file: 'services/projection/taxDecember.ts', value: '0.50', family: 'design',
      reason: 'Fraction de vente FICTIVE servant à estimer la récolte de pertes — pas un taux d’inclusion.' },
    { file: 'services/projection/taxDecember.ts', value: '40', family: 'design',
      reason: 'Nombre de pas du solveur numérique (STEPS). Paramètre d’algorithme.' },
    { file: 'services/projection/taxDecember.ts', value: '100000', family: 'design',
      reason: 'APRIL_SETTLEMENT_FLOOR_REAL — plancher de garde du remboursement d’avril, documenté PR #563. Borne de robustesse, pas un barème.' },
    { file: 'services/projection/taxDecember.ts', value: '11', family: 'structural',
      reason: 'Index du mois de DÉCEMBRE (0-based). Aucun rapport avec la fiscalité.' },

    // ── services/projection/retirementIncome.ts ──────────────────────────────────────────────
    { file: 'services/projection/retirementIncome.ts', value: '65', family: 'fiscal',
      reason: 'Âge pivot RRQ et PSV — base des facteurs d’ajustement/report.' },
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
      reason: 'Âge par DÉFAUT quand ni birthYear ni age ne sont saisis (`u.age || 30`). Valeur de repli d’UI, aucun rapport avec un barème.' },
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
      reason: 'Seuil d’âge de la courbe de probabilité LTC (calibrée sur Genworth/StatCan, cf. commentaire D2.8) — hypothèse de RISQUE, pas un âge fiscal.' },
    { file: 'services/projection/helpers.ts', value: '70', family: 'design',
      reason: 'Palier d’âge de la courbe LTC. Même nature que 65.' },
    { file: 'services/projection/helpers.ts', value: '75', family: 'design',
      reason: 'Palier d’âge de la courbe LTC. Même nature que 65.' },
    { file: 'services/projection/helpers.ts', value: '80', family: 'design',
      reason: 'Palier d’âge de la courbe LTC. Même nature que 65.' },
    { file: 'services/projection/helpers.ts', value: '85', family: 'design',
      reason: 'Palier d’âge de la courbe LTC. Même nature que 65.' },
    { file: 'services/projection/helpers.ts', value: '90', family: 'design',
      reason: 'Palier d’âge de la courbe LTC. Même nature que 65.' },
    // ⚠️ ENTRÉE DOUBLE DE SENS — la première fois que la clé (fichier, valeur) coûte quelque chose.
    // `95` apparaît DEUX fois dans helpers.ts avec des natures OPPOSÉES, et la clé ne peut pas les
    // distinguer. Les deux sont décrites ici plutôt que d'en taire une ; `family` prend le sens le
    // plus EXIGEANT (`fiscal`), parce qu'un littéral qui porte un vrai paramètre ARC mérite la
    // relecture stricte même s'il porte aussi une heuristique. Le compromis était documenté en tête
    // de fichier ; il est désormais VÉCU, pas seulement anticipé.
    { file: 'services/projection/helpers.ts', value: '95', family: 'fiscal',
      reason: 'DEUX occurrences distinctes. (1) FISCAL — RRIF_PLATEAU_AGE : âge à partir duquel le facteur FERR est figé au plateau de 20 %. Ancré le 2026-08-06 ; il était jusque-là IMPLICITE, porté par la seule ABSENCE d’entrée dans la table au-delà de 94 — un seuil qu’aucune ligne n’écrit ne peut être ni relu ni corrigé. (2) DESIGN — palier terminal de la courbe de mortalité/LTC (`if (age < 95) return 0.140`), hypothèse de risque calibrée, à ne JAMAIS sourcer comme une valeur fiscale.' },
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
      reason: 'Facteur brut/net approximatif pour remonter un revenu théorique. Approximation de modèle.' },
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
];

/** Modules fiscaux scannés — ceux qui PRODUISENT de l'impôt ou une rente. */
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
