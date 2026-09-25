// services/history/plausibiliteCours.ts
//
// Règle d'ORDRE DE GRANDEUR d'un cours par rapport au prix connu de l'actif — source unique, sans
// dépendance (partagée par l'hydratation de l'historique et la vérification d'un symbole collé,
// `services/verifierSymboleCotation.ts`).

/**
 * Le dernier close d'une VARIANTE est-il PLAUSIBLE vs le prix courant connu de l'actif ?
 * Garde anti-collision de ticker (« ABC » nu peut désigner un AUTRE titre sur « ABC.PA ») : sans
 * référence de prix courant on REFUSE (afficher la courbe d'un autre titre avec assurance serait
 * la pire violation no-fake-data) ; avec référence, on exige un facteur ≤ 2. Exporté pour test.
 */
export function variantClosePlausible(lastClose: number, currentPrice: number | undefined): boolean {
    const ref = Number(currentPrice);
    if (!Number.isFinite(ref) || ref <= 0) return false;
    return lastClose >= ref * 0.5 && lastClose <= ref * 2;
}
