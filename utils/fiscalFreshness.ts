// utils/fiscalFreshness.ts
//
// [HARDEN-FISCAL-TIMEBOMB] — détecte quand les valeurs fiscales (docs/FISCAL_REFERENCE.md =
// SOURCE DE VÉRITÉ) deviennent périmées, SANS bombe calendaire dure.
//
// ⚠️ PAS un `Date.now() < 2027` (casserait TOUS les déploiements le 1ᵉʳ janvier, même un hotfix
// non-fiscal — refus explicite de Marc). On mesure plutôt l'ANCIENNETÉ RELATIVE de la dernière
// vérification HUMAINE consignée dans le doc : l'alerte ne se déclenche que si personne n'a
// re-vérifié depuis N mois — ce qui est précisément le signal voulu. Avec la cadence
// `/audit-financier` (trimestre + release + période d'impôts), le seuil dur n'est jamais atteint
// en exploitation normale.
//
// ⚠️ LIMITE assumée : la garde mesure la fraîcheur de la DATE consignée, PAS l'exactitude des
// chiffres ni le cycle d'indexation de janvier (l'ancienneté est relative à la dernière vérif, pas
// au 1ᵉʳ janvier). Bumper la date ENGAGE une re-vérification réelle (acte d'attestation) — l'avancer
// sans re-vérifier désarme la bombe. Le contenu ligne-à-ligne reste l'affaire de `/audit-financier`.
//
// La fiscalité canadienne s'indexe chaque janvier → re-vérifier au moins annuellement. Seuils :
//   • WARN (12 mois) : nudge non bloquant (console.warn dans le test).
//   • FAIL (18 mois) : seuil DUR, généreux à dessein (1,5 an de négligence) → n'interrompt un
//     travail non-fiscal qu'en cas d'oubli profond ; le correctif (re-vérifier + bumper la date)
//     est l'action DÉSIRÉE.

export const FISCAL_FRESHNESS_WARN_MONTHS = 12;
export const FISCAL_FRESHNESS_FAIL_MONTHS = 18;

// Marqueurs datés reconnus dans FISCAL_REFERENCE.md. Tolérants au gras markdown (`**`), aux
// deux-points et espaces entre le mot-clé et la date (ex. `**Dernière vérification** : 2026-06-11`,
// `**Ré-audité 2026-06-17**`). On prend la PLUS RÉCENTE de toutes les occurrences (un ré-audit
// postérieur rafraîchit le signal).
//
// ⚠️ Fenêtre `[^\d]{0,8}` ANCRÉE COURT (pas {0,16}) : assez pour `** : ` (5 chars) mais trop courte
// pour glisser à travers une PHRASE intercalée (« …vérification par l'ARC porte sur : 2025… ») qui
// capterait une date NON pertinente et DÉSARMERAIT silencieusement la bombe (faux « frais »). Le pire
// mode d'échec ici = se croire à jour. Garde-test : « ne capte pas une date dans une phrase ».
const VERIFICATION_DATE_MARKERS: readonly RegExp[] = [
    /Derni[èe]re\s+v[ée]rification[^\d]{0,8}(\d{4}-\d{2}-\d{2})/gi,
    /R[ée]-?audit[ée][^\d]{0,8}(\d{4}-\d{2}-\d{2})/gi,
];

/**
 * Extrait la date de vérification la PLUS RÉCENTE de FISCAL_REFERENCE.md.
 * `null` si aucun marqueur daté n'est trouvé (= contrat de fraîcheur cassé → à traiter comme périmé).
 */
export function parseLatestFiscalVerification(markdown: string): Date | null {
    let latest: Date | null = null;
    for (const marker of VERIFICATION_DATE_MARKERS) {
        for (const match of markdown.matchAll(marker)) {
            const parsed = new Date(`${match[1]}T00:00:00Z`);
            if (Number.isNaN(parsed.getTime())) continue;
            if (latest === null || parsed.getTime() > latest.getTime()) latest = parsed;
        }
    }
    return latest;
}

/** Nombre de mois ENTIERS écoulés entre `from` et `to` (UTC). Négatif si `to` < `from`. */
export function monthsBetween(from: Date, to: Date): number {
    let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
    if (to.getUTCDate() < from.getUTCDate()) months -= 1;
    return months;
}

export interface FiscalFreshness {
    /** Date de la dernière vérification consignée, ou `null` si introuvable. */
    latestVerification: Date | null;
    /** Mois écoulés depuis cette date, ou `null` si introuvable. */
    monthsElapsed: number | null;
    /** > seuil WARN : nudge. `true` aussi si la date est introuvable. */
    isStale: boolean;
    /** > seuil FAIL : la fiscalité doit être re-vérifiée. `true` aussi si la date est introuvable. */
    isExpired: boolean;
}

/**
 * Évalue la fraîcheur de FISCAL_REFERENCE.md. Date introuvable ⇒ traité comme périmé (le contrat
 * de fraîcheur est cassé : mieux vaut échouer bruyamment que désamorcer la bombe en silence).
 */
export function assessFiscalFreshness(
    markdown: string,
    now: Date,
    warnMonths: number = FISCAL_FRESHNESS_WARN_MONTHS,
    failMonths: number = FISCAL_FRESHNESS_FAIL_MONTHS,
): FiscalFreshness {
    const latestVerification = parseLatestFiscalVerification(markdown);
    if (latestVerification === null) {
        return { latestVerification: null, monthsElapsed: null, isStale: true, isExpired: true };
    }
    const monthsElapsed = monthsBetween(latestVerification, now);
    return {
        latestVerification,
        monthsElapsed,
        isStale: monthsElapsed > warnMonths,
        isExpired: monthsElapsed > failMonths,
    };
}
