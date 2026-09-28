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

const FMT_NUM_1 = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
});

const FMT_NUM_0_1 = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
});

const FMT_NUM_0_2 = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
});

type Decimals = 0 | 2;

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
export function formatNumber(n: unknown, opts: { decimals?: Decimals | 1 } = {}): string {
    if (!isFiniteNumber(n)) return '—';
    // 1 décimale : durées (« 2,9 ans ») — jamais pour un montant (formatCAD s'en tient à 0 ou 2).
    if (opts.decimals === 1) return FMT_NUM_1.format(n);
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
 * [S5-REFONTE-PLACEMENTS] Variation en % signée (« +14,7 % », « −2,4 % », « 0,0 % ») — un ratio,
 * pas un montant. Un résultat qui s'arrondit à zéro n'a pas de signe (jamais « −0,0 % »).
 */
export function formatVariationPct(n: unknown, decimals: 0 | 1 | 2 = 1): string {
    if (!isFiniteNumber(n)) return '—';
    const texte = formatNumber(Math.abs(n), { decimals });
    const nul = Math.abs(n) < 0.5 * 10 ** -decimals;
    return `${nul ? '' : n > 0 ? '+' : '−'}${texte}\u00a0%`;
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
 * [DETTE-BALANCEASOF-INVISIBLE] Formate un JOUR ISO `YYYY-MM-DD` (« 18 septembre 2026 »).
 *
 * ⚠️ NE PAS remplacer par `formatDate(iso)` : `new Date('2026-09-18')` est parsé comme MINUIT UTC,
 * donc relu en heure locale dans un fuseau NÉGATIF il redevient la VEILLE — un solde estampillé le
 * 18 s'afficherait « 17 septembre » chez Marc (Montréal, UTC−4). Le concept est déjà documenté et
 * mesuré dans `Budget.tsx` (`parseLocalDateStr`, « TZ=America/Toronto : 2026-08-01 redevient le
 * 31 juillet ») ; ce qui DIFFÈRE ici est le repli — celui de Budget retombe sur AUJOURD'HUI, ce qui
 * est juste pour une fenêtre d'affichage et interdit pour une date qui AFFIRME quand un solde a été
 * relevé (`no-fake-data`). D'où une lecture qui construit la date en heure LOCALE et rend « — »
 * plutôt que d'inventer un jour (`AVANT-D-UNIFIER-N-COPIES-SEPARER-CE-QUI-EST-PARTAGE-DE-CE-QUI-NE-L-EST-PAS`).
 *
 * ⚠️ Le conteneur de CI tourne en UTC, où les deux variantes coïncident TOUJOURS : la garde de ce
 * helper balaie un fuseau de chaque signe (`UN-CONTENEUR-EN-UTC-NE-PEUT-PAS-DEPARTAGER-LOCAL-ET-UTC`).
 */
export function formatIsoDay(iso: unknown): string {
    if (typeof iso !== 'string') return '—';
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d) || !y || !m || !d) return '—';
    return formatDate(new Date(y, m - 1, d));
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
export function formatCompactCAD(n: unknown, opts: { precis?: boolean; repere?: boolean } = {}): string {
    if (!isFiniteNumber(n)) return '—';
    const abs = Math.abs(n);
    // `repere` : graduation d'axe (maquettes : « 0 », « 750 k$ », « 1 M$ », « 1,25 M$ ») — zéro nu et
    // pas de décimales inutiles en M$ (« 1,00 M$ » ne tient pas dans la marge de l'axe).
    if (opts.repere && n === 0) return '0';
    if (opts.repere && abs >= 1_000_000) return `${FMT_NUM_0_2.format(n / 1_000_000)} M$`;
    // `precis` : une décimale au besoin sous le million (« 8,5 k$ », « 12 k$ ») — étiquettes courtes
    // où arrondir 8 500 $ à « 9 k$ » tromperait (frise des projets de vie).
    if (opts.precis && abs >= 1_000 && abs < 1_000_000) return `${FMT_NUM_0_1.format(n / 1_000)} k$`;
    if (abs >= 1_000_000) {
        return `${formatNumber(n / 1_000_000, { decimals: 2 })} M$`;
    }
    if (abs >= 1_000) {
        return `${formatNumber(n / 1_000, { decimals: 0 })} k$`;
    }
    return formatCAD(n);
}

/**
 * [B4-CHAT-COST] Coût API en CAD depuis un coût USD + le taux fxRates.USD de l'app.
 * Micro-montants : un coût réel > 0 qui arrondirait à « 0,00 $ » rend « < 0,01 $ » (jamais un
 * zéro qui laisse croire à de la gratuité). Entrées non finies → « — » (no-fake-data).
 */
export function formatCostCad(usd: unknown, fxUsdToCad: unknown): string {
    if (!isFiniteNumber(usd) || !isFiniteNumber(fxUsdToCad) || fxUsdToCad <= 0) return '—';
    const cad = usd * fxUsdToCad;
    if (cad > 0 && cad < 0.005) return '< 0,01 $';
    return formatCAD(cad, { decimals: 2 });
}
