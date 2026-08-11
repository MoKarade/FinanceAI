// services/history/reconstructPortfolioHistory.ts
// A1 — reconstruction du PASSÉ réel des comptes de placement à partir des
// avoirs (purchases datés) et de l'historique de prix (priceHistory, peuplé via
// Finnhub — A2). Fonction PURE (aucun réseau, aucune dépendance store) →
// testable. La valeur marché à une date t = Σ détention(t) × prix(t), convertie
// en CAD. No-fake : si le prix historique manque pour un titre, on retombe sur
// son prix actuel et on le compte dans `coverage` pour signaler l'estimation.

import type { RegisteredAccountType } from '../../types';

export interface MinimalPurchase { date: string; quantity: number; price: number }
export interface MinimalPricePoint { date: string; price: number }
export interface MinimalAsset {
    symbol: string;
    quantity: number;
    currency: string; // 'CAD' | 'USD' | 'EUR'
    currentPrice: number; // prix actuel en devise native
    accountType?: RegisteredAccountType;
    dateBought?: string; // fallback si purchases absent
    purchases?: MinimalPurchase[];
    priceHistory?: MinimalPricePoint[]; // prix natif daté (close Finnhub)
}

// Clés alignées sur le chartData de la projection (pour fusionner les axes en A3).
export type AccountKey = 'CELI' | 'CELIAPP' | 'REER' | 'REEE' | 'NonReg' | 'Crypto';
const ACCOUNT_KEYS: AccountKey[] = ['CELI', 'CELIAPP', 'REER', 'REEE', 'NonReg', 'Crypto'];

const TYPE_TO_KEY: Record<RegisteredAccountType, AccountKey> = {
    CELI: 'CELI',
    CELIAPP: 'CELIAPP',
    REER: 'REER',
    REEE: 'REEE',
    'NON-ENREG': 'NonReg',
    CRYPTO: 'Crypto',
    MARGE: 'NonReg', // compte sur marge = non enregistré côté avoirs
    AUTRE: 'NonReg',
};

export interface PortfolioHistoryPoint {
    date: string; // YYYY-MM-DD (fin de mois)
    monthIndex: number; // ≤ 0, relatif à aujourd'hui (0 = ce mois) — aligne avec la projection
    CELI: number; CELIAPP: number; REER: number; REEE: number; NonReg: number; Crypto: number;
    /** Somme des comptes de PLACEMENT seulement (ni cash, ni immo, ni dette) — même sémantique que
     *  la version quotidienne. ⚠️ RENOMMÉ depuis `NetWorth` ([NAMING-INVESTED] 2026-08-11) : ce nom
     *  promettait un patrimoine net et a déjà fabriqué de faux findings d'audit. */
    InvestedValue: number;
}
export interface PortfolioHistoryResult {
    points: PortfolioHistoryPoint[];
    /** Part de la valeur finale adossée à de vrais prix historiques (0..1). */
    coverage: number;
    /** Date de la 1re donnée réelle (1er achat connu), ou null. */
    firstDate: string | null;
}

const fxToCad = (currency: string, fx: Record<string, number>): number => {
    if (!currency || currency === 'CAD') return 1;
    const r = fx[currency];
    return typeof r === 'number' && r > 0 ? r : 1;
};

// Détention cumulée d'un titre à la date t (somme des achats jusqu'à t).
// [PORTFOLIO-HISTORY] Exportée : buildMarketData (courbes Dashboard/Investissements) partage la
// MÊME définition de détention/prix — jamais deux copies qui divergent (source unique).
export function holdingsAt(asset: MinimalAsset, t: string): number {
    if (asset.purchases && asset.purchases.length > 0) {
        return asset.purchases.reduce((q, p) => (p.date <= t ? q + p.quantity : q), 0);
    }
    if (asset.dateBought) return asset.dateBought <= t ? asset.quantity : 0;
    return asset.quantity; // pas de date connue → supposé détenu sur toute la fenêtre
}

// Prix natif à la date t : dernier point d'historique ≤ t. Renvoie null si aucun
// (→ le caller retombe sur le prix actuel et marque l'estimation).
// `maxStaleDays` (optionnel — buildMarketData passe 7) : au-delà de ce retard entre le close
// retenu et t, le prix est PÉRIMÉ → null (un titre à l'historique arrêté — délisting, sync en
// échec — ne doit pas afficher un close de 11 mois comme une valeur du jour ; panel 2026-07-22).
// Sans le param (reconstruction mensuelle du Futur) : comportement historique inchangé.
export function priceAt(asset: MinimalAsset, t: string, maxStaleDays?: number): number | null {
    const hist = asset.priceHistory;
    if (!hist || hist.length === 0) return null;
    let best: MinimalPricePoint | null = null;
    for (const p of hist) {
        if (p.date <= t && (!best || p.date > best.date)) best = p;
    }
    if (!best) return null;
    if (maxStaleDays !== undefined) {
        const ageDays = (Date.parse(`${t}T00:00:00Z`) - Date.parse(`${best.date}T00:00:00Z`)) / 86_400_000;
        if (ageDays > maxStaleDays) return null;
    }
    return best.price;
}

const lastDayOfMonth = (year: number, monthIdx0: number): string => {
    const d = new Date(Date.UTC(year, monthIdx0 + 1, 0));
    return d.toISOString().slice(0, 10);
};

/**
 * Reconstruit la valeur marché mensuelle passée par compte, de la 1re donnée
 * connue jusqu'à aujourd'hui (inclus). `monthIndex` ≤ 0 pour s'aligner sur la
 * projection (qui démarre à monthIndex 0 = aujourd'hui).
 */
export function reconstructPortfolioHistory(
    assets: MinimalAsset[],
    fx: Record<string, number>,
    opts?: { today?: Date; maxMonths?: number },
): PortfolioHistoryResult {
    const invest = (assets || []).filter((a) => (a.quantity || 0) !== 0 || (a.purchases && a.purchases.length > 0));
    if (invest.length === 0) return { points: [], coverage: 1, firstDate: null };

    // 1re date connue = plus ancien achat (sinon dateBought).
    let first: string | null = null;
    for (const a of invest) {
        const dates = [
            ...(a.purchases?.map((p) => p.date) ?? []),
            ...(a.dateBought ? [a.dateBought] : []),
        ];
        for (const d of dates) if (d && (!first || d < first)) first = d;
    }
    if (!first) return { points: [], coverage: 1, firstDate: null };

    const today = opts?.today ?? new Date();
    const maxMonths = opts?.maxMonths ?? 600;
    const firstDate = new Date(`${first}T00:00:00Z`);

    // Liste des fins de mois de `first` → aujourd'hui (cap maxMonths).
    const months: { y: number; m: number }[] = [];
    let y = firstDate.getUTCFullYear(), m = firstDate.getUTCMonth();
    const ty = today.getUTCFullYear(), tm = today.getUTCMonth();
    while ((y < ty || (y === ty && m <= tm)) && months.length < maxMonths) {
        months.push({ y, m });
        m++; if (m > 11) { m = 0; y++; }
    }

    const totalMonths = months.length;
    let valueWithRealPrice = 0;
    let valueTotalFinal = 0;

    const points: PortfolioHistoryPoint[] = months.map(({ y: yy, m: mm }, i) => {
        const t = lastDayOfMonth(yy, mm);
        const isFinal = i === totalMonths - 1;
        const acc: Record<AccountKey, number> = { CELI: 0, CELIAPP: 0, REER: 0, REEE: 0, NonReg: 0, Crypto: 0 };
        for (const a of invest) {
            const qty = holdingsAt(a, t);
            if (qty === 0) continue;
            const histPrice = priceAt(a, t);
            const price = histPrice ?? a.currentPrice ?? 0;
            const valueCad = qty * price * fxToCad(a.currency, fx);
            const key = a.accountType ? TYPE_TO_KEY[a.accountType] : 'NonReg';
            acc[key] += valueCad;
            if (isFinal) {
                valueTotalFinal += valueCad;
                if (histPrice !== null) valueWithRealPrice += valueCad;
            }
        }
        // ⚠️ [NAMING-INVESTED 2026-08-11] Renommé `NetWorth` → `InvestedValue`, aligné sur la version
        // quotidienne. L'ancien commentaire affirmait « renommer casserait d'autres consommateurs
        // `.NetWorth` » — constat PÉRIMÉ, jamais re-vérifié : mesuré au grep, AUCUN consommateur de
        // prod ne lisait ce champ (`buildPastPrefix` recompose le patrimoine via `pastNetWorthAt` à
        // partir des buckets par compte). Le nom, lui, avait un coût réel : somme des comptes de
        // PLACEMENT seulement (ni cash, ni immo, ni dette), il promettait un patrimoine net et a
        // déjà nourri de faux rapprochements d'audit.
        const invested = ACCOUNT_KEYS.reduce((s, k) => s + acc[k], 0);
        return {
            date: t,
            monthIndex: i - (totalMonths - 1), // dernier point = 0 (aujourd'hui), passé < 0
            ...acc,
            InvestedValue: Number(invested.toFixed(2)),
        };
    });

    const coverage = valueTotalFinal > 0 ? valueWithRealPrice / valueTotalFinal : 1;
    return { points, coverage: Number(coverage.toFixed(3)), firstDate: first };
}

// ── [FUTUR-DAILY] Reconstruction QUOTIDIENNE, sur une FENÊTRE ────────────────────────────────
//
// Demande Marc 2026-08-06 : voir le détail de chaque compte au jour, en zoomant.
//
// ⚠️ Ce n'est pas un calcul nouveau : `holdingsAt(a, t)` et `priceAt(a, t)` sont DÉJÀ paramétrés
// par date. La reconstruction mensuelle ne fait que choisir `t = dernier jour du mois`. Ici on
// choisit chaque jour. Le coût est le même par point ; ce qui change, c'est leur NOMBRE.
//
// ⚠️ FENÊTRÉE, jamais « tout l'historique au jour ». Sur 18 ans ça ferait ~6 500 points × chaque
// titre — illisible à l'écran ET inutile, puisqu'on ne regarde qu'une plage à la fois. C'est le
// « si je zoom » de la demande qui rend la fenêtre légitime.
//
// ⚠️ HONNÊTETÉ DU PLATEAU. Un prix de clôture reste la valeur du titre jusqu'à la clôture suivante :
// répéter un close le samedi est JUSTE. Mais au-delà de 12 mois, le stockage est compressé à
// 1 point/semaine (`DOWNSAMPLE_AFTER_DAYS`), donc un plateau de 6 jours n'est plus un week-end :
// c'est de la donnée absente qui RESSEMBLE à une donnée stable. Chaque point porte donc l'âge du
// prix le plus vieux qui le compose — l'écran peut alors dire « reconstruit » au lieu de laisser
// croire à une mesure quotidienne.

export interface PortfolioHistoryDailyPoint {
    /** Date 'YYYY-MM-DD'. */
    date: string;
    CELI: number; CELIAPP: number; REER: number; REEE: number; NonReg: number; Crypto: number;
    /** Somme des comptes de PLACEMENT (ni cash, ni immo, ni dette) — même sémantique que la
     *  version mensuelle, cf. son commentaire : ce n'est PAS un patrimoine net. */
    InvestedValue: number;
    /** Âge, en jours, du prix le plus VIEUX ayant servi à composer ce point. 0 = un close existe
     *  à cette date. Élevé = plateau de reconstruction, pas une valeur stable observée. */
    priceAgeMaxDays: number;
    /** `true` si au moins un titre n'avait AUCUN historique et a été valorisé au prix ACTUEL —
     *  le point est alors une estimation, et le dire est le minimum (no-fake-data). */
    hasEstimatedPrice: boolean;
}

const DAY_MS_H = 86_400_000;

/** Âge en jours du dernier close ≤ t, ou null si aucun historique. */
function priceAgeDays(asset: MinimalAsset, t: string): number | null {
    const hist = asset.priceHistory;
    if (!hist || hist.length === 0) return null;
    let best: MinimalPricePoint | null = null;
    for (const p of hist) if (p.date <= t && (!best || p.date > best.date)) best = p;
    if (!best) return null;
    return Math.max(0, Math.round((Date.parse(`${t}T00:00:00Z`) - Date.parse(`${best.date}T00:00:00Z`)) / DAY_MS_H));
}

/**
 * Valeur marché par compte, JOUR par JOUR, sur `[from, to]` (bornes incluses, 'YYYY-MM-DD').
 *
 * `maxDays` borne le résultat pour qu'un appelant distrait ne demande pas 20 ans au jour
 * (défaut 400 : un peu plus d'un an, ce qui couvre la fenêtre où les prix stockés sont
 * réellement quotidiens). Au-delà, on rend les `maxDays` PREMIERS jours et l'appelant le voit à
 * la longueur — plutôt qu'une troncature silencieuse au milieu.
 */
export function reconstructPortfolioHistoryDaily(
    assets: MinimalAsset[],
    fx: Record<string, number>,
    from: string,
    to: string,
    opts?: { maxDays?: number },
): PortfolioHistoryDailyPoint[] {
    const invest = (assets || []).filter((a) => (a.quantity || 0) !== 0 || (a.purchases && a.purchases.length > 0));
    const start = Date.parse(`${from}T00:00:00Z`);
    const end = Date.parse(`${to}T00:00:00Z`);
    if (invest.length === 0 || !Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];

    const maxDays = opts?.maxDays ?? 400;
    const out: PortfolioHistoryDailyPoint[] = [];

    for (let ms = start; ms <= end && out.length < maxDays; ms += DAY_MS_H) {
        const t = new Date(ms).toISOString().slice(0, 10);
        const acc: Record<AccountKey, number> = { CELI: 0, CELIAPP: 0, REER: 0, REEE: 0, NonReg: 0, Crypto: 0 };
        let ageMax = 0;
        let estimated = false;

        for (const a of invest) {
            const qty = holdingsAt(a, t);
            if (qty === 0) continue;
            const histPrice = priceAt(a, t);
            if (histPrice === null) {
                estimated = true;
            } else {
                const age = priceAgeDays(a, t);
                if (age !== null && age > ageMax) ageMax = age;
            }
            const price = histPrice ?? a.currentPrice ?? 0;
            const key = a.accountType ? TYPE_TO_KEY[a.accountType] : 'NonReg';
            acc[key] += qty * price * fxToCad(a.currency, fx);
        }

        out.push({
            date: t,
            ...acc,
            InvestedValue: Number(ACCOUNT_KEYS.reduce((s, k) => s + acc[k], 0).toFixed(2)),
            priceAgeMaxDays: ageMax,
            hasEstimatedPrice: estimated,
        });
    }
    return out;
}
