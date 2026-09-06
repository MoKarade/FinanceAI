// services/transactions/merchantProfile.ts
//
// [TX-CATEGORIZE] Profil de RÉCURRENCE par marchand — calculé AVANT toute décision de catégorie.
// Pur, zéro dépendance, zéro réseau.
//
// Pourquoi ça existe (décision Marc 2026-07-31, réponse 22) : « un achat unique chez un marchand
// d'abonnement va dans Loisirs ». Cette règle rend le LIBELLÉ structurellement insuffisant — un jeu
// acheté une fois sur Steam et un abonnement Steam mensuel portent le MÊME libellé. Aucune regex, et
// aucune IA regardant une ligne isolée, ne peut trancher : seul l'historique du marchand le peut.
//
// C'est exactement la cause du bug rapporté (« ça met abonnement pour tout et n'importe quoi ») :
// `services/import/categoryRules.ts` décidait « Abonnements » sur des motifs comme `APPLE\.COM`,
// `GOOGLE \*` ou `MICROSOFT`, et cette règle passait AVANT Santé/Loisirs/Magasinage — donc un
// accessoire Apple, un jeu Xbox et un achat unique sur Google Play y tombaient tous.
//
// ⚠️ Ce module ne catégorise RIEN. Il mesure. La décision vit dans `contextualCategorize.ts`.

/** Nombre minimal d'occurrences pour parler de récurrence. */
const MIN_OCCURRENCES = 3;
/** Écart relatif maximal toléré sur le montant (15 %) — un abonnement dont le prix monte de 3 $ ne
 *  doit PAS disparaître, ce que faisait le seuil absolu de ±5 $ de l'ancien détecteur (Planning). */
const MAX_RELATIVE_SPREAD = 0.15;
const DAY_MS = 86_400_000;

export type MerchantCadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'irregular';

/** Fenêtres d'intervalle (en jours) par cadence — larges, les prélèvements glissent d'un mois à l'autre. */
const CADENCE_WINDOWS: Array<{ cadence: MerchantCadence; min: number; max: number }> = [
    { cadence: 'weekly', min: 6, max: 8 },
    { cadence: 'monthly', min: 25, max: 35 },
    { cadence: 'quarterly', min: 85, max: 95 },
    { cadence: 'yearly', min: 350, max: 380 },
];

export interface MerchantProfile {
    /** Clé normalisée (voir `merchantKey`). */
    key: string;
    /** Libellé le plus récent, pour l'affichage. */
    label: string;
    /** Nombre de dépenses observées pour ce marchand. */
    count: number;
    firstDate: string;
    lastDate: string;
    /** Intervalle MÉDIAN entre deux dépenses consécutives, `null` si moins de 2 occurrences. */
    medianIntervalDays: number | null;
    /** Montant typique (médiane des valeurs absolues) — robuste à un mois exceptionnel. */
    typicalAmount: number;
    /** Le montant est-il stable ? (écart relatif médian ≤ 15 %) */
    amountStable: boolean;
    cadence: MerchantCadence;
    /**
     * Marchand RÉCURRENT : au moins 3 occurrences, une cadence reconnue et un montant stable.
     * C'est le seul signal qui autorise à promouvoir une catégorie en « Abonnements ».
     */
    isRecurring: boolean;
}

/** Entrée minimale — volontairement structurelle (aucun type d'app importé). */
interface MerchantObservation {
    payee: string;
    /** Montant SIGNÉ ; seules les dépenses (négatives) comptent pour un profil d'abonnement. */
    amount: number;
    /** Date ISO `YYYY-MM-DD`. */
    date: string;
}

/**
 * Clé d'identité d'un marchand, robuste aux suffixes variables des relevés bancaires
 * (« AMZN MKTP CA*1A2B3 », « NETFLIX.COM 866-579-7172 », « SQ *CAFE X »).
 *
 * Stratégie : accents strippés, majuscules, ponctuation → espaces, tokens purement numériques ou
 * alphanumériques mixtes (références de commande) écartés, puis on garde les 2 premiers tokens
 * alphabétiques. Deux tokens suffisent à distinguer « TIM HORTONS » de « TIM ROBERTS » sans coller
 * ensemble toutes les succursales d'une même enseigne.
 */
export function merchantKey(payee: string): string {
    const cleaned = (payee ?? '')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();
    if (!cleaned) return '';
    const tokens = cleaned.split(' ').filter((t) => /^[A-Z]+$/.test(t) && t.length > 1);
    if (tokens.length === 0) return cleaned;
    return tokens.slice(0, 2).join(' ');
}

function median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function dayNumber(isoDate: string): number | null {
    const t = Date.parse(`${isoDate}T00:00:00Z`);
    return Number.isFinite(t) ? Math.round(t / DAY_MS) : null;
}

function cadenceOf(medianInterval: number | null): MerchantCadence {
    if (medianInterval === null) return 'irregular';
    const hit = CADENCE_WINDOWS.find((w) => medianInterval >= w.min && medianInterval <= w.max);
    return hit ? hit.cadence : 'irregular';
}

/**
 * Construit les profils de tous les marchands observés dans un ensemble de dépenses.
 *
 * Seules les DÉPENSES (montants négatifs, finis, non nuls) sont considérées : un abonnement est une
 * sortie d'argent récurrente. Les transferts et doublons doivent être filtrés par l'appelant — ils
 * fausseraient la cadence.
 */
export function buildMerchantProfiles(
    observations: readonly MerchantObservation[],
): Map<string, MerchantProfile> {
    const groups = new Map<string, MerchantObservation[]>();
    for (const o of observations) {
        if (!Number.isFinite(o.amount) || o.amount >= 0) continue;
        if (dayNumber(o.date) === null) continue;
        const key = merchantKey(o.payee);
        if (!key) continue;
        const list = groups.get(key);
        if (list) list.push(o);
        else groups.set(key, [o]);
    }

    const profiles = new Map<string, MerchantProfile>();
    for (const [key, rows] of groups) {
        rows.sort((a, b) => a.date.localeCompare(b.date));
        const amounts = rows.map((r) => Math.abs(r.amount));
        const typicalAmount = median(amounts);

        // Écart RELATIF (et non absolu) : un abonnement à 9,99 $ qui passe à 12,99 $ reste le même
        // abonnement, alors qu'un seuil absolu de ±5 $ le ferait sortir de la liste (défaut de
        // l'ancien détecteur de `components/Planning.tsx`).
        const spreads = typicalAmount > 0
            ? amounts.map((a) => Math.abs(a - typicalAmount) / typicalAmount)
            : amounts.map(() => 1);
        const amountStable = median(spreads) <= MAX_RELATIVE_SPREAD;

        const intervals: number[] = [];
        for (let i = 1; i < rows.length; i++) {
            const prev = dayNumber(rows[i - 1].date);
            const cur = dayNumber(rows[i].date);
            if (prev !== null && cur !== null) intervals.push(Math.abs(cur - prev));
        }
        const medianIntervalDays = intervals.length > 0 ? median(intervals) : null;
        const cadence = cadenceOf(medianIntervalDays);

        profiles.set(key, {
            key,
            label: rows[rows.length - 1].payee,
            count: rows.length,
            firstDate: rows[0].date,
            lastDate: rows[rows.length - 1].date,
            medianIntervalDays,
            typicalAmount,
            amountStable,
            cadence,
            isRecurring: rows.length >= MIN_OCCURRENCES && cadence !== 'irregular' && amountStable,
        });
    }
    return profiles;
}

/** Profil du marchand d'un libellé donné, ou `undefined` s'il n'a jamais été observé en dépense. */
export function profileForPayee(
    profiles: ReadonlyMap<string, MerchantProfile>,
    payee: string,
): MerchantProfile | undefined {
    return profiles.get(merchantKey(payee));
}
