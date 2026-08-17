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
// ⚠️ LE PIÈGE DU DÉPÔT, qui ferait un total FAUX en silence. Un achat de titre SORT des liquidités
// et ENTRE dans un régime :
//     ΔLiquidités = NetTransferLiquid − Σdépôts     et     ΔPlacements = Σdépôts + Σrendement
// Les dépôts s'ANNULENT donc dans le total. Les additionner reviendrait à compter deux fois le même
// argent. Ils restent une information utile à MONTRER (« tu as déplacé X »), mais à somme nulle sur
// le patrimoine — d'où leur champ séparé, hors de la somme.
//
// ⚠️ L'IMMOBILIER bouge par palier ANNUEL et les DETTES sont FIGÉES (décision Marc, Option A).
// Un jour de palier affiche donc un saut immobilier qui n'a rien de journalier. On le DIT, on ne le
// lisse pas : étaler une donnée annuelle sur 365 jours fabriquerait de la donnée.
import type { DailyPastRow, PastAccountKey } from './dailyPastLedger';
import { PAST_ACCOUNT_KEYS } from './dailyPastLedger';

export interface VariationSource {
    /** Clé stable — l'affichage ne doit pas dépendre du libellé. */
    cle: 'tresorerie' | 'rendement' | 'immobilier' | 'dettes';
    montant: number;
}

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
    /** Mouvements INTERNES (liquidités → placements) : montrés, mais à somme nulle sur le total. */
    depotsInternes: number;
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
    const rendement = somme(jour.growth);
    const deltaImmo = fini(jour.Immobilier) - fini(veille.Immobilier);
    // ⚠️ Une dette qui BAISSE fait MONTER le patrimoine : la contribution est l'OPPOSÉ du delta.
    const deltaDettes = -(fini(jour.DettesNonImmo) - fini(veille.DettesNonImmo));

    const sources: VariationSource[] = [
        { cle: 'tresorerie', montant: tresorerie },
        { cle: 'rendement', montant: rendement },
        { cle: 'immobilier', montant: deltaImmo },
        { cle: 'dettes', montant: deltaDettes },
    ];

    const expliquee = sources.reduce((a, s) => a + s.montant, 0);

    return {
        deltaNetWorth,
        sources,
        residuel: deltaNetWorth - expliquee,
        depotsInternes: somme(jour.deposits),
        immobilierEstPalier: Math.abs(deltaImmo) > 0.005,
    };
}
