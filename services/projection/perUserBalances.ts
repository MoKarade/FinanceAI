// services/projection/perUserBalances.ts
// Phase 1 du refactor « soldes enregistrés PAR CONJOINT » (cf docs/REFACTOR_REER_PAR_CONJOINT.md).
// Module PUR (zéro état, zéro dépendance) : clés d'attribution + réconciliation d'un registre
// par conjoint. Le moteur garde les soldes EN COMMUN pour la croissance/allocation ; ce registre
// est mis à jour en parallèle et DOIT respecter l'invariant Σ(byUser) == pool à tout instant.
// Consommé par la couche fiscale en Phase 2 (impôt + FERR par conjoint, fractionnement 65+).

/**
 * Parts normalisées (somme = 1) à partir des bruts par conjoint (proxy de l'historique de
 * cotisation). Repli ÉGAL si le total est ≤ 0 (aucun salaire connu) ou liste vide.
 */
export function salaryShares(grossByUser: number[]): number[] {
    const n = Math.max(1, grossByUser.length);
    if (grossByUser.length === 0) return [1];
    const clamped = grossByUser.map(g => Math.max(0, Number.isFinite(g) ? g : 0));
    const total = clamped.reduce((s, g) => s + g, 0);
    if (!(total > 0)) return Array(n).fill(1 / n);
    return clamped.map(g => g / total);
}

/**
 * Répartit un pool selon des parts. Les parts sont renormalisées par sécurité (somme quelconque).
 * Repli égal si la somme des parts est ≤ 0. Le pool négatif est ramené à 0 (un solde ne peut l'être).
 */
export function splitByShares(pool: number, shares: number[]): number[] {
    const n = Math.max(1, shares.length);
    const safePool = Math.max(0, Number.isFinite(pool) ? pool : 0);
    const sumShares = shares.reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0);
    if (!(sumShares > 0)) return Array(n).fill(safePool / n);
    return shares.map(s => safePool * ((Number.isFinite(s) ? s : 0) / sumShares));
}

/**
 * Réconcilie un registre par conjoint pour que sa somme == pool (absorbe au prorata la croissance
 * et tout flux non attribué explicitement). GARANTIT l'invariant Σ == pool.
 * Si la somme courante est ≤ 0, retombe sur une répartition par `shares`.
 */
export function reconcileToPool(byUser: number[], pool: number, shares: number[]): number[] {
    const safePool = Math.max(0, Number.isFinite(pool) ? pool : 0);
    const sum = byUser.reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0);
    if (!(sum > 0)) return splitByShares(safePool, shares);
    const k = safePool / sum;
    return byUser.map(x => Math.max(0, (Number.isFinite(x) ? x : 0) * k));
}

/**
 * Met à jour un registre REER par conjoint sur un mois, puis réconcilie au pool final.
 * - retrait : au prorata du solde courant de chaque conjoint (neutre).
 * - cotisation : attribuée par `shares` (proxy plafond ≈ salaire).
 * - le reste (croissance, RAP, meltdown…) est absorbé pro-rata par la réconciliation au pool.
 * `poolEnd` est le solde COMMUN final du mois (source de vérité) → invariant Σ == poolEnd garanti.
 */
export function stepReerByUser(
    prev: number[],
    opts: { withdrawal: number; contribution: number; poolEnd: number; shares: number[] },
): number[] {
    const { withdrawal, contribution, poolEnd, shares } = opts;
    const prevSum = prev.reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0);
    const w = Math.max(0, Number.isFinite(withdrawal) ? withdrawal : 0);
    const c = Math.max(0, Number.isFinite(contribution) ? contribution : 0);
    const afterFlows = prev.map((bal, i) => {
        const b = Math.max(0, Number.isFinite(bal) ? bal : 0);
        const wShare = prevSum > 0 ? (b / prevSum) : (1 / Math.max(1, prev.length));
        return b - w * wShare + c * (shares[i] ?? 0);
    });
    return reconcileToPool(afterFlows, poolEnd, shares);
}
