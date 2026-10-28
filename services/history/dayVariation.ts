// services/history/dayVariation.ts
// [PASSE-REEL-VARIATION-DU-JOUR] La variation du patrimoine d'UNE journée, ventilée par SOURCE.
//
// Demande de Marc (2026-08-14) : « je veux voir la variabilité d'argent pour la journée (tout
// compris mais détaillé) ». Le panneau du jour montrait jusqu'ici le NET ENCAISSÉ (Σ des
// transactions) — ce qui n'est pas la variation du patrimoine : un jour de forte hausse boursière
// affiche 0 $ de transactions pendant que la courbe monte.
//
// ⚠️ RIEN N'EST RECALCULÉ ICI. `DailyPastRow` émet DÉJÀ tout ce qu'il faut (`NetTransferLiquid`,
// `deposits` et `growth` par régime, `Immobilier`, `DettesNonImmo`, `NetWorth`). Ce module ne fait
// que COMBINER ces valeurs et exposer le résiduel. Règle « source unique » : avant d'ajouter un
// calcul, greper le moteur — il l'émettait.
//
// ⚠️ LE PIÈGE DU DÉPÔT — et je m'étais trompé de sens. La première version affirmait :
//     « ΔLiquidités = NetTransferLiquid − Σdépôts, donc les dépôts s'ANNULENT dans le total »
// et les excluait des sources. **C'est faux, et MESURÉ faux.** `reconstructCashHistoryDaily`
// construit les liquidités à partir des SEULES transactions : `ΔLiquidités = NetTransferLiquid`,
// point. Le côté PLACEMENT de l'achat (`deposits`) n'a donc aucun pendant dans les sources —
// résultat, le résiduel valait EXACTEMENT les dépôts du jour, systématiquement.
// Mesuré sur un achat de 500 $ correctement débité : ΔPatrimoine = 0 (juste), et pourtant
// « Non expliqué +500 $ ». Un jour parfaitement explicable était étiqueté inexpliqué.
// Les dépôts sont donc une SOURCE à part entière : ils portent l'entrée dans le régime, pendant
// que `tresorerie` porte la sortie du compte. Les deux s'annulent alors dans la SOMME — ce qui
// était l'intuition de départ — mais seulement parce qu'ils y sont TOUS LES DEUX.
//
// ⚠️ CE QUE CE CORRECTIF NE DOIT PAS ABSORBER (et c'est le vrai danger). Quand un achat est marqué
// « virement interne », il est EXCLU de la reconstruction du cash : les liquidités ne baissent pas,
// le titre entre quand même, et le patrimoine du jour SAUTE réellement du montant de l'achat
// (mesuré : ΔPatrimoine = +500 $ sur un simple déplacement). Ajouter les dépôts aux sources ferme
// le résiduel de ce cas AUSSI — donc masquerait le défaut. D'où `depotsNonFinances` : un dépôt
// qu'aucune sortie de liquidités ne finance est SIGNALÉ à part. Le résiduel n'est plus le détecteur
// de ce cas ; ce drapeau l'est.
//
// ⚠️ L'IMMOBILIER bouge par palier ANNUEL et les DETTES sont FIGÉES (décision Marc, Option A).
// Un jour de palier affiche donc un saut immobilier qui n'a rien de journalier. On le DIT, on ne le
// lisse pas : étaler une donnée annuelle sur 365 jours fabriquerait de la donnée.
import type { DailyPastRow, PastAccountKey } from './dailyPastLedger';
import { PAST_ACCOUNT_KEYS } from './dailyPastLedger';

export interface VariationSource {
    /** Clé stable — l'affichage ne doit pas dépendre du libellé. */
    cle: 'tresorerie' | 'depots' | 'rendement' | 'immobilier' | 'dettes';
    montant: number;
}

/**
 * En deçà de ce montant, un résiduel est du BRUIT D'ARRONDI, pas un mouvement inexpliqué.
 *
 * ⚠️ Mesuré : `dailyPastLedger` arrondit `NetWorth` et `reconstructCashHistory` arrondit le cash,
 * tandis que les sources (`growth`, `NetTransferLiquid`) restent fractionnaires. Sur trois jours
 * consécutifs SANS le moindre mouvement, le résiduel valait +0,37 / −0,21 / +0,04 — tous au-dessus
 * de l'ancien seuil de 0,005 $, donc tous rendus en ambre sous « Non expliqué », et formatés en
 * « 0 $ » et « **-0 $** ». Le seul garde-fou honnête du panneau devenait du bruit quotidien, et un
 * avertissement permanent ne se lit plus comme un avertissement.
 * Deux points arrondis à l'unité bornent l'erreur à ±1 $ : c'est le seuil.
 * ⚠️ Le résiduel n'est PAS absorbé pour autant — il reste exposé tel quel dans le résultat ; seul
 * son AFFICHAGE est filtré, et le filtre est ici pour que l'écran ne le redéfinisse pas dans son coin.
 */
export const SEUIL_RESIDUEL_SIGNIFICATIF = 1;

export interface DayVariationResult {
    /** ΔPatrimoine net du jour, MESURÉ (pas reconstitué à partir des sources). */
    deltaNetWorth: number;
    /** Les sources qui l'expliquent. Somme ≠ `deltaNetWorth` ⇒ voir `residuel`. */
    sources: VariationSource[];
    /**
     * `deltaNetWorth` − Σ(sources). **AFFICHÉ, jamais absorbé.**
     *
     * ⚠️ C'est le critère de « fini » posé d'avance sur ce ticket. Ajouter un poste « autre » qui
     * encaisse la différence fermerait le total PAR CONSTRUCTION : la vérification deviendrait
     * circulaire et ne prouverait plus rien (classe déjà consignée dans `CLAUDE.md`). Un résiduel
     * visible est une information ; un résiduel absorbé est un mensonge.
     */
    residuel: number;
    /** Mouvements INTERNES (liquidités → placements) sur le jour. */
    depotsInternes: number;
    /**
     * Part des dépôts qu'AUCUNE sortie de liquidités ne finance ce jour-là.
     *
     * ⚠️ > 0 signifie que le patrimoine du jour a AUGMENTÉ d'un simple déplacement d'argent : un
     * titre est entré sans que le compte ne soit débité (typiquement un achat marqué « virement
     * interne », exclu de la reconstruction du cash). C'est un défaut de DONNÉES, pas d'affichage.
     * ⚠️ HEURISTIQUE ASSUMÉE : on compare aux sorties TOTALES du jour, donc une grosse dépense le
     * même jour peut masquer un dépôt non financé. Sous-détection possible, jamais sur-détection.
     */
    depotsNonFinances: number;
    /** Vrai si l'équité immobilière a changé — c'est un palier ANNUEL, pas un mouvement du jour. */
    immobilierEstPalier: boolean;
}

const somme = (r: Record<PastAccountKey, number>): number =>
    PAST_ACCOUNT_KEYS.reduce((acc, k) => {
        const v = r?.[k];
        // Un champ non fini n'est jamais traité comme 0 : il est ÉCARTÉ du total et fera apparaître
        // un résiduel — visible — plutôt qu'un total silencieusement faux (no-fake-data).
        return acc + (Number.isFinite(v) ? v : 0);
    }, 0);

const fini = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

/**
 * Ventile la variation de `jour` par rapport à `veille`.
 *
 * ⚠️ Les DEUX journées sont nécessaires : une variation est une DIFFÉRENCE. Sans la veille, on ne
 * peut rien affirmer — la fonction rend alors `null` plutôt qu'un zéro crédible.
 */
export function dayVariation(
    jour: DailyPastRow | null | undefined,
    veille: DailyPastRow | null | undefined,
): DayVariationResult | null {
    if (!jour || !veille) return null;
    if (!Number.isFinite(jour.NetWorth) || !Number.isFinite(veille.NetWorth)) return null;

    const deltaNetWorth = jour.NetWorth - veille.NetWorth;

    const tresorerie = fini(jour.NetTransferLiquid);
    const depots = somme(jour.deposits);
    const rendement = somme(jour.growth);
    const deltaImmo = fini(jour.Immobilier) - fini(veille.Immobilier);
    // ⚠️ Une dette qui BAISSE fait MONTER le patrimoine : la contribution est l'OPPOSÉ du delta.
    const deltaDettes = -(fini(jour.DettesNonImmo) - fini(veille.DettesNonImmo));

    const sources: VariationSource[] = [
        { cle: 'tresorerie', montant: tresorerie },
        // ⚠️ Le côté PLACEMENT du déplacement. Sans lui, le résiduel valait les dépôts du jour.
        { cle: 'depots', montant: depots },
        { cle: 'rendement', montant: rendement },
        { cle: 'immobilier', montant: deltaImmo },
        { cle: 'dettes', montant: deltaDettes },
    ];

    const expliquee = sources.reduce((a, s) => a + s.montant, 0);

    return {
        deltaNetWorth,
        sources,
        residuel: deltaNetWorth - expliquee,
        depotsInternes: depots,
        // `min(0, tresorerie)` = les sorties de liquidités du jour. Ce qui dépasse n'est financé
        // par rien : clampé à 0 pour ne jamais annoncer un défaut qui n'existe pas.
        depotsNonFinances: Math.max(0, depots + Math.min(0, tresorerie)),
        immobilierEstPalier: Math.abs(deltaImmo) > 0.005,
    };
}
