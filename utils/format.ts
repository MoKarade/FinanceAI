/**
 * Utilitaires de formatage centralisés pour FinanceAI.
 *
 * Convention unique : `fr-CA` — espace insécable pour les milliers, virgule
 * pour les décimales. Exemple : `1 111,55 $`.
 *
 * Toute valeur non finie (NaN, Infinity, undefined) est rendue `—`.
 */

const LOCALE = 'fr-CA';

const FMT_CAD_0 = new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
});

const FMT_CAD_2 = new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const FMT_NUM_0 = new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: 0,
});

const FMT_NUM_2 = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

export type Decimals = 0 | 2;

const isFiniteNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/**
 * Formate un montant en CAD selon `fr-CA` (« 1 111,55 $ »).
 */
export function formatCAD(n: unknown, opts: { decimals?: Decimals } = {}): string {
    if (!isFiniteNumber(n)) return '—';
    return opts.decimals === 2 ? FMT_CAD_2.format(n) : FMT_CAD_0.format(n);
}

/**
 * Formate un nombre sans devise (« 1 111,55 »).
 */
export function formatNumber(n: unknown, opts: { decimals?: Decimals } = {}): string {
    if (!isFiniteNumber(n)) return '—';
    return opts.decimals === 2 ? FMT_NUM_2.format(n) : FMT_NUM_0.format(n);
}

/**
 * Formate un pourcentage (« 12,55 % »).
 * La valeur entrée est déjà en pourcentage (×100), pas un ratio brut.
 */
export function formatPercent(n: unknown, decimals: number = 2): string {
    if (!isFiniteNumber(n)) return '—';
    const fmt = new Intl.NumberFormat(LOCALE, {
        style: 'percent',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
    return fmt.format(n / 100);
}

/**
 * Formate un nombre signé avec préfixe `+`, `−` (signe minus unicode pour le
 * rendu typographique), ou nul. Devise optionnelle.
 */
export function formatSigned(
    n: unknown,
    opts: { decimals?: Decimals; withCurrency?: boolean } = {},
): string {
    if (!isFiniteNumber(n)) return '—';
    if (n === 0) return opts.withCurrency ? formatCAD(0, opts) : formatNumber(0, opts);
    const abs = Math.abs(n);
    const formatted = opts.withCurrency ? formatCAD(abs, opts) : formatNumber(abs, opts);
    return n > 0 ? `+${formatted}` : `−${formatted}`;
}

/**
 * Formate une date courte (« 1 mai 2026 »).
 */
export function formatDate(
    d: Date | string | number | undefined | null,
    opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' },
): string {
    if (d === undefined || d === null) return '—';
    const date = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
    if (!(date instanceof Date) || isNaN(date.getTime())) return '—';
    return date.toLocaleDateString(LOCALE, opts);
}

/**
 * Format court mois-année (« mai 2026 »).
 */
export function formatMonthYear(d: Date | string | number | undefined | null): string {
    return formatDate(d, { year: 'numeric', month: 'long' });
}

/**
 * Format compact pour valeurs en k$ ou M$ (« 1,2 M$ », « 850 k$ »).
 * Utile pour les axes de graphiques.
 */
export function formatCompactCAD(n: unknown): string {
    if (!isFiniteNumber(n)) return '—';
    const abs = Math.abs(n);
    if (abs >= 1_000_000) {
        return `${formatNumber(n / 1_000_000, { decimals: 2 })} M$`;
    }
    if (abs >= 1_000) {
        return `${formatNumber(n / 1_000, { decimals: 0 })} k$`;
    }
    return formatCAD(n);
}
