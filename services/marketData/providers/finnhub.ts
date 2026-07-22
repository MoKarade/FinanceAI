// §7.F.2 — Wrapper Finnhub REST.
//
// Finnhub : free tier 60 req/min, supporte US/TSX/EU/Crypto.
// Doc: https://finnhub.io/docs/api
//
// Symboles : Finnhub utilise le format `NASDAQ:NVDA`, `NYSE:V`, `TO:SHOP`
// (TSX), `PA:SAF` (Euronext Paris). Notre format historique (assetMeta.ts)
// utilise déjà ce style ("NASDAQ:NVDA") donc compat directe pour USA. Pour
// TSX on convertit `TSE:XEQT.TO` → `TO:XEQT`.

import type { Quote, HistoryPoint, AssetProfile, DividendInfo, SymbolSearchResult, MarketDataProvider } from '../types';
import { MarketDataError } from '../types';
import { logProviderError } from './providerError';

const BASE_URL = 'https://finnhub.io/api/v1';
const FETCH_TIMEOUT_MS = 10_000;

/** Coerce en nombre fini, sinon le fallback. Défend contre un champ de type inattendu dans la
 * réponse JSON (D5) : `?? 0` ne rattrapait QUE null/undefined, pas une chaîne/NaN. */
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Convertit notre format symbole vers le format Finnhub. */
export function toFinnhubSymbol(ours: string): string {
    // "NASDAQ:NVDA" → "NVDA" (Finnhub veut juste le ticker pour US main exchanges)
    // "NYSE:V" → "V"
    // "TSE:XEQT.TO" → "XEQT.TO" (Finnhub accepte le .TO)
    // "EPA:SAF" → "SAF.PA" (Euronext Paris)
    if (ours.includes(':')) {
        const [exchange, ticker] = ours.split(':');
        if (exchange === 'NASDAQ' || exchange === 'NYSE') return ticker;
        if (exchange === 'TSE' || exchange === 'TSX') {
            return ticker.endsWith('.TO') ? ticker : `${ticker}.TO`;
        }
        if (exchange === 'EPA') return `${ticker}.PA`;
        // Fallback : on tente le ticker brut
        return ticker;
    }
    return ours;
}

async function finnhubFetch(path: string, apiKey: string): Promise<Record<string, unknown>> {
    // La clé passe en QUERY `token=` : seule méthode fiable depuis un NAVIGATEUR. Le header
    // X-Finnhub-Token (tenté en SH4 « pour la sécurité ») est un header PERSONNALISÉ → il déclenche
    // un PREFLIGHT CORS que l'API Finnhub ne satisfait pas → toutes les requêtes échouaient en
    // navigateur malgré une clé valide (« ticker introuvable », retour Marc). Risque résiduel faible :
    // clé BYO propre à l'utilisateur, sur HTTPS, visible seulement dans SON propre onglet Réseau ; le
    // Referer envoyé à finnhub.io est l'URL de l'app, pas la clé.
    const sep = path.includes('?') ? '&' : '?';
    const url = `${BASE_URL}${path}${sep}token=${encodeURIComponent(apiKey)}`;
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (res.status === 401 || res.status === 403) {
            throw new MarketDataError('Clé API Finnhub invalide.', 'AUTH', 'finnhub');
        }
        if (res.status === 429) {
            throw new MarketDataError('Rate limit Finnhub atteint (60 req/min).', 'RATE_LIMIT', 'finnhub');
        }
        if (!res.ok) {
            throw new MarketDataError(`Finnhub erreur ${res.status}`, 'UNKNOWN', 'finnhub');
        }
        return await res.json() as Record<string, unknown>;
    } catch (e) {
        if (e instanceof MarketDataError) throw e;
        if (e instanceof DOMException && e.name === 'AbortError') {
            throw new MarketDataError('Timeout Finnhub.', 'NETWORK', 'finnhub');
        }
        throw new MarketDataError(String(e), 'NETWORK', 'finnhub');
    } finally {
        clearTimeout(timeout);
    }
}

export class FinnhubProvider implements MarketDataProvider {
    readonly name = 'finnhub';

    constructor(private apiKey: string) {
        if (!apiKey || apiKey.trim().length === 0) {
            throw new Error('FinnhubProvider: clé API requise.');
        }
    }

    async getQuote(symbol: string): Promise<Quote | null> {
        const fnSymbol = toFinnhubSymbol(symbol);
        try {
            const data = await finnhubFetch(`/quote?symbol=${encodeURIComponent(fnSymbol)}`, this.apiKey);
            // Finnhub renvoie { c: current, d: change, dp: changePercent, t: timestamp }
            const c = data.c as number | undefined;
            const d = data.d as number | undefined;
            const dp = data.dp as number | undefined;
            const t = data.t as number | undefined;
            if (!data || typeof c !== 'number' || c === 0) return null;
            return {
                symbol,
                price: c,
                change: num(d),
                changePercent: num(dp),
                currency: this.inferCurrency(symbol),
                timestamp: num(t, Math.floor(Date.now() / 1000)) * 1000,
            };
        } catch (e) {
            logProviderError('Finnhub', 'getQuote', symbol, e);
            return null;
        }
    }

    async getHistory(symbol: string, from: Date, to: Date): Promise<HistoryPoint[] | null> {
        const fnSymbol = toFinnhubSymbol(symbol);
        const fromTs = Math.floor(from.getTime() / 1000);
        const toTs = Math.floor(to.getTime() / 1000);
        try {
            const data = await finnhubFetch(
                `/stock/candle?symbol=${encodeURIComponent(fnSymbol)}&resolution=D&from=${fromTs}&to=${toTs}`,
                this.apiKey,
            );
            const tArr = data.t as number[] | undefined;
            const cArr = data.c as number[] | undefined;
            const oArr = data.o as number[] | undefined;
            const hArr = data.h as number[] | undefined;
            const lArr = data.l as number[] | undefined;
            const vArr = data.v as number[] | undefined;
            // `no_data` = réponse VALIDE sans point (cacheable) ; toute autre forme inattendue = erreur.
            if (data && data.s === 'no_data') return [];
            if (!data || data.s !== 'ok' || !Array.isArray(tArr)) return null;
            return tArr.map((ts: number, i: number) => ({
                date: new Date(ts * 1000).toISOString().slice(0, 10),
                close: num(cArr?.[i]),
                open: oArr?.[i],
                high: hArr?.[i],
                low: lArr?.[i],
                volume: vArr?.[i],
            }));
        } catch (e) {
            // [PORTFOLIO-HISTORY] null = ERREUR (403 premium candles, 429, réseau) : withCache ne la
            // cache PAS (avant : `[]` d'erreur caché 24h = trou silencieux) et la façade peut replier.
            logProviderError('Finnhub', 'getHistory', symbol, e);
            return null;
        }
    }

    async getProfile(symbol: string): Promise<AssetProfile | null> {
        const fnSymbol = toFinnhubSymbol(symbol);
        try {
            const data = await finnhubFetch(`/stock/profile2?symbol=${encodeURIComponent(fnSymbol)}`, this.apiKey);
            const name = data.name as string | undefined;
            const finnhubIndustry = data.finnhubIndustry as string | undefined;
            const country = data.country as string | undefined;
            const currency = data.currency as string | undefined;
            if (!data || !name) return null;
            return {
                symbol,
                name,
                sector: this.sectorFromFinnhub(finnhubIndustry),
                region: this.regionFromCountry(country),
                dividendYield: 0, // Finnhub profile2 ne renvoie pas le yield, à enrichir via /stock/metric
                currency: currency ?? this.inferCurrency(symbol),
                country,
                industry: finnhubIndustry,
            };
        } catch (e) {
            logProviderError('Finnhub', 'getProfile', symbol, e);
            return null;
        }
    }

    async getDividends(symbol: string): Promise<DividendInfo[]> {
        const fnSymbol = toFinnhubSymbol(symbol);
        const from = new Date();
        const to = new Date();
        to.setFullYear(to.getFullYear() + 1);
        try {
            const data = await finnhubFetch(
                `/stock/dividend?symbol=${encodeURIComponent(fnSymbol)}&from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`,
                this.apiKey,
            );
            if (!Array.isArray(data)) return [];
            return data.map((d: { amount?: number; exDate?: string; payDate?: string }) => ({
                symbol,
                amount: num(d.amount),
                exDate: d.exDate ?? '',
                payDate: d.payDate ?? '',
                frequency: 4, // estimation par défaut, Finnhub ne renvoie pas
            }));
        } catch (e) {
            logProviderError('Finnhub', 'getDividends', symbol, e);
            return [];
        }
    }

    async searchSymbol(query: string): Promise<SymbolSearchResult[]> {
        const q = query.trim();
        if (q.length < 1) return [];
        try {
            const data = await finnhubFetch(`/search?q=${encodeURIComponent(q)}`, this.apiKey);
            // Finnhub : { count, result: [{ symbol, description, displaySymbol, type }] }
            const result = data.result as Array<Record<string, unknown>> | undefined;
            if (!Array.isArray(result)) return [];
            return result
                .map((r) => ({
                    symbol: typeof r.symbol === 'string' ? r.symbol : '',
                    description: typeof r.description === 'string' ? r.description : '',
                    displaySymbol: typeof r.displaySymbol === 'string' ? r.displaySymbol : (typeof r.symbol === 'string' ? r.symbol : ''),
                    type: typeof r.type === 'string' && r.type ? r.type : undefined,
                }))
                .filter((r) => r.symbol && r.description);
        } catch (e) {
            logProviderError('Finnhub', 'searchSymbol', query, e);
            return [];
        }
    }

    // --- helpers de mapping Finnhub → notre taxonomie interne ---

    private inferCurrency(symbol: string): string {
        // Préfixes (format historique assetMeta) ET suffixes (format Finnhub /search : `CW8.PA`,
        // `VISA.TO`…). ⚠️ Finding panel 2026-07-15 : sans les suffixes, un titre Euronext `.PA`
        // était étiqueté USD → la garde de devise du refresh des cours skippait à tort TOUTE la
        // poche EUR en « currency-mismatch » (les cours EUR ne se rafraîchissaient jamais).
        if (symbol.startsWith('TSE:') || symbol.startsWith('TSX:')) return 'CAD';
        if (symbol.startsWith('EPA:')) return 'EUR';
        const dot = symbol.lastIndexOf('.');
        if (dot > 0) {
            const suffix = symbol.slice(dot + 1).toUpperCase();
            if (suffix === 'TO' || suffix === 'V' || suffix === 'NE' || suffix === 'CN') return 'CAD';
            // Places de la zone euro couvertes par Finnhub : Paris, Francfort/Xetra/Tradegate,
            // Milan, Madrid, Amsterdam, Bruxelles, Lisbonne, Vienne, Dublin, Helsinki.
            if (['PA', 'DE', 'F', 'TG', 'MI', 'MC', 'AS', 'BR', 'LS', 'VI', 'IR', 'HE'].includes(suffix)) return 'EUR';
            if (suffix === 'L') return 'GBP';
            if (suffix === 'SW') return 'CHF';
        }
        return 'USD';
    }

    private sectorFromFinnhub(industry?: string): string {
        if (!industry) return 'Autre';
        const i = industry.toLowerCase();
        if (i.includes('semiconductor') || i.includes('software') || i.includes('technology')) return 'Technologie';
        if (i.includes('bank') || i.includes('financial') || i.includes('insurance')) return 'Finance';
        if (i.includes('industrial') || i.includes('aerospace') || i.includes('defense')) return 'Industrie';
        if (i.includes('mining') || i.includes('metal') || i.includes('gold')) return 'Mines/Or';
        if (i.includes('etf') || i.includes('index')) return 'Index';
        return 'Autre';
    }

    private regionFromCountry(country?: string): string {
        if (!country) return 'Global';
        const c = country.toUpperCase();
        if (c === 'US') return 'USA';
        if (c === 'CA') return 'Canada';
        if (['FR', 'DE', 'GB', 'NL', 'IT', 'ES', 'BE', 'CH'].includes(c)) return 'Europe';
        if (['CN', 'JP', 'KR', 'TW', 'HK', 'IN'].includes(c)) return 'Asie';
        return 'Global';
    }
}
