// services/history/fraicheurCours.ts
//
// [COURS-AU-TROMPEUR] L'ÂGE RÉEL d'un cours. Avant, « Cours au … » affichait l'heure du dernier
// rafraîchissement (le moment où on a DEMANDÉ le cours) et la variation « 24 h » comparait les deux
// dernières clôtures quel que soit leur âge : un titre dont le dernier close date de deux semaines
// s'affichait « Cours au <ce matin> » avec une « variation du jour ». Ici, la date d'un cours est
// celle de sa DERNIÈRE CLÔTURE (priceHistory), et une variation 24 h n'existe que si les deux
// clôtures sont récentes. Pas de date connue ≠ périmé : on ne signale que ce qu'on sait (no-fake-data).
//
// Fonctions PURES : la date du jour est injectée (le conteneur de CI tourne en TZ=UTC, cf.
// `todayIsoLocal`).

import type { MarketDataPoint } from '../finance';
import { seriesReturnEndpoints, seriesReturnPct } from './periodReturn';

/**
 * Un close daté de plus de 4 jours avant aujourd'hui est périmé. 4 et non 1 : un vendredi vu le
 * mardi après un lundi férié a 4 jours d'âge et reste le dernier close réel ; au-delà, le marché
 * a rouvert au moins une fois sans qu'on reçoive de cours.
 */
export const COURS_PERIME_APRES_JOURS = 4;

type PointPrix = { date: string; price: number };

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Jours entiers de `de` à `a` (YYYY-MM-DD, calendrier UTC). null si une date est illisible. */
export function joursEntre(de: string, a: string): number | null {
    if (!DATE_ISO.test(de) || !DATE_ISO.test(a)) return null;
    const t0 = Date.parse(`${de}T00:00:00Z`);
    const t1 = Date.parse(`${a}T00:00:00Z`);
    if (!Number.isFinite(t0) || !Number.isFinite(t1)) return null;
    return Math.round((t1 - t0) / 86_400_000);
}

/** Closes exploitables (date lisible, prix fini > 0), du plus ancien au plus récent. */
function closesTries(history: PointPrix[] | undefined): PointPrix[] {
    return (history ?? [])
        .filter((p) => p && DATE_ISO.test(p.date) && Number.isFinite(p.price) && p.price > 0)
        .sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
}

/** Date (YYYY-MM-DD) du dernier close connu du titre, ou null (titre manuel, GIC, historique absent). */
export function dateDernierCours(history: PointPrix[] | undefined): string | null {
    const closes = closesTries(history);
    return closes.length > 0 ? closes[closes.length - 1].date : null;
}

/** Le cours daté `dateCours` est-il périmé à `aujourdhui` ? false si la date est inconnue. */
export function coursPerime(dateCours: string | null, aujourdhui: string): boolean {
    if (dateCours === null) return false;
    const age = joursEntre(dateCours, aujourdhui);
    return age !== null && age > COURS_PERIME_APRES_JOURS;
}

/** Les deux bornes d'une variation 24 h sont-elles récentes (la plus récente pas périmée, écart ≤ seuil) ? */
function bornesRecentes(dateAvant: string, dateApres: string, aujourdhui: string): boolean {
    if (coursPerime(dateApres, aujourdhui)) return false;
    const ecart = joursEntre(dateAvant, dateApres);
    return ecart !== null && ecart <= COURS_PERIME_APRES_JOURS;
}

/**
 * Les deux derniers closes d'un titre sont-ils récents ? Sert de garde à `priceReturnPct(..., '24H')`
 * (même filtre de closes : la valeur affichée et la garde lisent les mêmes deux points).
 */
export function variation24hTitreAffichable(history: PointPrix[] | undefined, aujourdhui: string): boolean {
    const closes = closesTries(history);
    if (closes.length < 2) return false;
    return bornesRecentes(closes[closes.length - 2].date, closes[closes.length - 1].date, aujourdhui);
}

/**
 * `seriesReturnPct(rows, key, '24H')` si — et seulement si — ses deux points sont récents ; sinon
 * null (« — »). Un `null` de `seriesReturnPct` reste null.
 */
export function variation24hSerieSiRecente(
    rows: MarketDataPoint[],
    key: string,
    aujourdhui: string,
    isSynthetic?: (date: string, key: string) => boolean,
): number | null {
    const b = seriesReturnEndpoints(rows, key, '24H', isSynthetic);
    if (b === null || !bornesRecentes(b.fromDate, b.toDate, aujourdhui)) return null;
    return seriesReturnPct(rows, key, '24H', isSynthetic);
}

export interface TitreAuCoursPerime {
    symbol: string;
    /** Date (YYYY-MM-DD) du dernier close connu. */
    date: string;
}

/**
 * Les titres dont le DERNIER CLOSE connu est périmé, du plus ancien au plus récent. Un titre sans
 * historique n'y figure pas (âge inconnu ≠ périmé) ; un symbole n'apparaît qu'une fois (le même
 * titre détenu dans deux comptes porte le même cours).
 */
export function titresAuCoursPerime(
    assets: ReadonlyArray<{ symbol: string; priceHistory?: PointPrix[] }>,
    aujourdhui: string,
): TitreAuCoursPerime[] {
    const vus = new Set<string>();
    const out: TitreAuCoursPerime[] = [];
    for (const a of assets) {
        if (vus.has(a.symbol)) continue;
        const date = dateDernierCours(a.priceHistory);
        if (date !== null && coursPerime(date, aujourdhui)) {
            vus.add(a.symbol);
            out.push({ symbol: a.symbol, date });
        }
    }
    return out.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.symbol.localeCompare(y.symbol)));
}
