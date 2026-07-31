// services/transactions/reviewSample.ts
//
// [TX-REVIEW] Revue d'ÉCHANTILLON : mesurer le taux réel de transactions mal classées.
// Pur, déterministe, zéro réseau.
//
// Pourquoi ça existe (cadrage Marc 2026-07-31) : son critère d'arrêt est « moins de 1 % mal classé ».
// Il a refusé de fournir un export de référence — il n'existe donc AUCUN jeu de vérité hors ligne, et
// le critère serait invérifiable. La mesure doit alors être un OUTIL DE L'APP : elle tire des
// transactions au hasard, il tranche « correct / mal classé », et le taux se calcule sur ce qu'il a
// jugé. Ses corrections servent en même temps de correctifs réels.
//
// ⚠️ Un taux mesuré sur un échantillon a une MARGE. Avec 100 tirages on ne distingue pas 1 % de 4 % —
// annoncer « 1 % » sur 100 jugements serait un faux avec l'autorité d'un chiffre. On rend donc
// TOUJOURS l'intervalle, et on dit quand l'échantillon est trop petit pour conclure (`conclusive`).
//
// ⚠️ Le tirage est SEEDÉ : rouvrir l'écran ne doit pas re-tirer un échantillon différent (sinon on
// juge sans jamais converger, et le dénominateur ne veut plus rien dire).

import type { Transaction } from '../../types';

/**
 * Générateur pseudo-aléatoire déterministe (mulberry32). `Math.random()` rendrait le tirage
 * irreproductible : la liste changerait à chaque rendu et les jugements déjà faits ne
 * correspondraient plus au même échantillon.
 */
function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Transactions ÉLIGIBLES au tirage. Les doublons marqués sont exclus (déjà retirés de tous les
 * calculs), mais PAS les transferts : un faux virement interne est précisément une erreur de
 * classement qu'on veut pouvoir mesurer.
 */
export function eligibleForReview(transactions: readonly Transaction[]): Transaction[] {
    return transactions.filter((t) => !t.isDuplicate && typeof t.date === 'string' && t.date.length >= 7);
}

/**
 * Tire un échantillon déterministe de `size` transactions (mélange de Fisher-Yates seedé, puis
 * troncature). Rend moins d'éléments si l'historique est plus petit — jamais de doublon.
 */
export function drawReviewSample(
    transactions: readonly Transaction[],
    size: number,
    seed: number,
): Transaction[] {
    const pool = eligibleForReview(transactions);
    // Ordre de départ STABLE (par id) : l'ordre du tableau d'entrée peut changer d'un rendu à
    // l'autre (tri UI, ré-import) et ferait dériver l'échantillon malgré la graine.
    pool.sort((a, b) => a.id - b.id);
    const rand = mulberry32(seed);
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, Math.max(0, Math.floor(size)));
}

export interface ErrorRateEstimate {
    /** Nombre de transactions jugées. */
    reviewed: number;
    /** Nombre jugées mal classées. */
    errors: number;
    /** Taux ponctuel observé, en POURCENTAGE (0 si rien jugé). */
    ratePct: number;
    /** Borne basse de l'intervalle de confiance à 95 %, en pourcentage. */
    lowPct: number;
    /** Borne haute de l'intervalle de confiance à 95 %, en pourcentage. */
    highPct: number;
    /**
     * L'échantillon permet-il de TRANCHER le seuil ? Vrai seulement quand l'intervalle entier est
     * d'un côté : borne haute < seuil (réussi) ou borne basse > seuil (échoué). Entre les deux, on
     * ne sait pas — et le dire est plus utile qu'un chiffre qui fait semblant.
     */
    conclusive: boolean;
    /** Verdict lisible quand `conclusive` ; sinon ce qu'il manque pour conclure. */
    verdict: 'sous-seuil' | 'au-dessus' | 'indeterminé';
}

/**
 * Intervalle de WILSON (95 %) plutôt que l'approximation normale : sur un taux proche de 0 —
 * exactement notre cas — l'approximation normale rend un intervalle qui déborde sous zéro et
 * SOUS-ESTIME l'incertitude. Wilson reste correct avec peu d'erreurs observées.
 */
export function computeErrorRate(reviewed: number, errors: number, thresholdPct = 1): ErrorRateEstimate {
    const n = Math.max(0, Math.floor(reviewed));
    const k = Math.min(Math.max(0, Math.floor(errors)), n);
    if (n === 0) {
        return { reviewed: 0, errors: 0, ratePct: 0, lowPct: 0, highPct: 100, conclusive: false, verdict: 'indeterminé' };
    }
    const z = 1.96;
    const p = k / n;
    const denom = 1 + (z * z) / n;
    const centre = p + (z * z) / (2 * n);
    const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
    const low = Math.max(0, (centre - margin) / denom);
    const high = Math.min(1, (centre + margin) / denom);

    const lowPct = low * 100;
    const highPct = high * 100;
    const verdict: ErrorRateEstimate['verdict'] = highPct < thresholdPct
        ? 'sous-seuil'
        : lowPct > thresholdPct ? 'au-dessus' : 'indeterminé';

    return {
        reviewed: n,
        errors: k,
        ratePct: p * 100,
        lowPct,
        highPct,
        conclusive: verdict !== 'indeterminé',
        verdict,
    };
}

/**
 * Combien de tirages SANS erreur faut-il pour que la borne haute passe sous le seuil ? Sert à
 * annoncer honnêtement l'effort restant (« encore ~N à juger ») au lieu de laisser croire qu'un
 * verdict va tomber tout seul. Rend `null` au-delà de 5 000 (seuil trop bas pour être atteignable).
 */
export function samplesNeededForThreshold(thresholdPct = 1): number | null {
    for (let n = 10; n <= 5000; n += 10) {
        if (computeErrorRate(n, 0, thresholdPct).verdict === 'sous-seuil') return n;
    }
    return null;
}

/**
 * Taille d'échantillon RECOMMANDÉE : le nombre de jugements sans erreur qu'il faut pour que la borne
 * haute passe sous 1 %. **Dérivée du calcul, jamais devinée** — c'est la seule façon qu'elle reste
 * vraie si le seuil ou la méthode d'intervalle change.
 *
 * ⚠️ MESURÉ : **390**, pas 300. Marc a demandé au cadrage « moins de 1 % sur 300 tirages », mais ces
 * deux nombres sont incompatibles : à 300 jugements SANS AUCUNE erreur, l'intervalle de Wilson monte
 * encore à 1,26 % — on ne peut pas conclure. Annoncer « moins de 1 % » sur 300 aurait été un chiffre
 * faux présenté avec assurance. Le repli 400 ne sert que si le seuil devenait inatteignable (<10 %
 * exige déjà des milliers de tirages).
 */
export const RECOMMENDED_SAMPLE_SIZE = samplesNeededForThreshold(1) ?? 400;
