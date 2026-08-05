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
export const FISCAL_CONST_INVENTORY: readonly InventoryEntry[] = [
    // ── services/projection/taxJanuary.ts ────────────────────────────────────────────────────
    { file: 'services/projection/taxJanuary.ts', value: '0.18', family: 'fiscal',
      reason: 'Plafond REER = 18 % du revenu gagné (ARC). ⚠️ VRAI chiffre fiscal EN DUR, non sourcé — la dette la plus nette de cet inventaire.' },
    { file: 'services/projection/taxJanuary.ts', value: '0.20', family: 'fiscal',
      reason: 'Facteur de retrait minimum FERR par défaut (20 %, plateau 95+ ARC), repli quand l’âge sort de RRIF_RATES.' },
    { file: 'services/projection/taxJanuary.ts', value: '500', family: 'fiscal',
      reason: 'Le plafond CELI est arrondi au 500 $ le plus proche (ARC).' },
    { file: 'services/projection/taxJanuary.ts', value: '2026', family: 'fiscal',
      reason: 'Année d’ancrage dans RRSP_ANNUAL_LIMITS pour l’extrapolation au-delà du barème connu.' },
    { file: 'services/projection/taxJanuary.ts', value: '18', family: 'fiscal',
      reason: 'Âge d’ouverture des droits CELI / admissibilité CELIAPP.' },
    { file: 'services/projection/taxJanuary.ts', value: '71', family: 'fiscal',
      reason: 'Conversion obligatoire REER → FERR à la fin de l’année des 71 ans (ARC).' },
    { file: 'services/projection/taxJanuary.ts', value: '72', family: 'fiscal',
      reason: 'Premier retrait FERR minimum obligatoire (l’année suivant la conversion).' },
    { file: 'services/projection/taxJanuary.ts', value: '15', family: 'fiscal',
      reason: 'Durée de vie maximale du CELIAPP (15 ans depuis l’ouverture, ARC).' },
    { file: 'services/projection/taxJanuary.ts', value: '0.25', family: 'design',
      reason: 'PROXY de modèle : inverse l’impôt sur gains vers le gain BRUT en supposant un taux effectif de 25 % (inclusion 50 % × marginal 50 %). Combine un vrai paramètre et un marginal SUPPOSÉ → approximation, jamais un taux statutaire à sourcer.' },
    { file: 'services/projection/taxJanuary.ts', value: '0.95', family: 'design',
      reason: 'Seuil de gel Guyton-Klinger (−5 % du portefeuille). Heuristique de stratégie ; cf. [ENG-GK-THRESHOLD-KNIFE].' },

    // ── services/projection/taxDecember.ts ───────────────────────────────────────────────────
    { file: 'services/projection/taxDecember.ts', value: '65', family: 'fiscal',
      reason: 'Âge d’ouverture du crédit en raison de l’âge, et pivot RRQ/PSV.' },
    { file: 'services/projection/taxDecember.ts', value: '72', family: 'fiscal',
      reason: 'Âge du retrait FERR minimum, utilisé dans l’assiette du crédit pension.' },
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
            const significant =
                /[*/+\-<>=|?]$/.test(before) // calcul, comparaison, affectation, repli (|| ??)
                || /^[*/]/.test(after);      // le littéral est à GAUCHE d'un produit
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
