// --- TAUX DE CHANGE BANQUE DU CANADA (seul fetch externe restant) ---
// P1 — Suppression totale du Google Sheet legacy (sur demande utilisateur).
// L'app ne fait plus aucun fetch vers docs.google.com pour les données
// boursières. La source de vérité unique est désormais Finnhub via
// services/marketData/.

export interface MarketDataPoint {
    date: string;
    [key: string]: string | number;
}

// Timeout pour les fetches (utilisé par fetchFxRates Banque du Canada uniquement)
const FETCH_TIMEOUT_MS = 12000; // 12 secondes max

// Taux de change mis en cache localement
let cachedFxRates: { USD: number; EUR: number; CAD: number; lastFetched: number } | null = null;

// --- Wrapper localStorage tolerant aux environnements sans Web Storage ---
// Le module est importe par App (browser) et potentiellement par le MCP server (Node).
// En Node, ServiceWorker ou mode prive Safari, localStorage peut etre absent
// ou jeter SecurityError ; on no-op silencieusement dans ces cas.
const hasLocalStorage = (): boolean => {
    try {
        return typeof localStorage !== 'undefined' && localStorage !== null;
    } catch {
        return false;
    }
};

const safeGetItem = (key: string): string | null => {
    if (!hasLocalStorage()) return null;
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
};

const safeSetItem = (key: string, value: string): void => {
    if (!hasLocalStorage()) return;
    try {
        localStorage.setItem(key, value);
    } catch {
        /* QuotaExceededError, SecurityError, etc. */
    }
};

/**
 * Fetch avec timeout integre et support d'abort
 */
const fetchWithTimeout = async (url: string, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        clearTimeout(timeoutId);
        return response;
    } catch (e) {
        clearTimeout(timeoutId);
        throw e;
    }
};


/**
 * Recupere les taux de change depuis la Banque du Canada (API officielle, gratuite).
 * Cache 24h pour eviter trop de requetes.
 * Fallback sur les valeurs stockees en cas d'echec.
 */
export const fetchFxRates = async (): Promise<{ USD: number; EUR: number; CAD: number; lastFetched: number }> => {
    const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 heures
    const now = Date.now();

    // Verifier le cache en memoire (toujours dispo, browser + Node)
    if (cachedFxRates && (now - cachedFxRates.lastFetched) < CACHE_DURATION_MS) {
        return cachedFxRates;
    }

    // Verifier le cache persistant si localStorage existe (browser uniquement)
    const stored = safeGetItem('fx_rates_cache');
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            if (parsed && (now - (parsed.lastFetched || 0)) < CACHE_DURATION_MS) {
                cachedFxRates = parsed;
                return parsed;
            }
        } catch { /* JSON corrompu : on continue le fetch */ }
    }

    // Fetch depuis la Banque du Canada
    // API: /valet/observations/GROUPE/json?recent=1
    // Series: FXUSDCAD (USD/CAD) et FXEURCAD (EUR/CAD)
    try {
        const BDC_URL = "https://www.bankofcanada.ca/valet/observations/group/FX_RATES_DAILY/json?recent=1";
        const response = await fetchWithTimeout(BDC_URL, 8000);

        if (response.ok) {
            const data = await response.json();
            const obs = data?.observations?.[0];

            if (obs) {
                const usdCad = parseFloat(obs?.FXUSDCAD?.v) || 1.40;
                const eurCad = parseFloat(obs?.FXEURCAD?.v) || 1.47;

                const rates = { USD: usdCad, EUR: eurCad, CAD: 1.00, lastFetched: now };
                cachedFxRates = rates;

                // Persistance dans localStorage si disponible (no-op en Node)
                safeSetItem('fx_rates_cache', JSON.stringify(rates));

                console.log(`Taux FX mis a jour (Banque du Canada): USD=${usdCad.toFixed(4)}, EUR=${eurCad.toFixed(4)}`);
                return rates;
            }
        }
    } catch (e) {
        console.warn("Impossible de recuperer les taux FX (Banque du Canada), utilisation des valeurs en cache/defaut:", e);
    }

    // Fallback: valeurs par defaut approximatives si tout echoue
    const fallback = { USD: 1.40, EUR: 1.47, CAD: 1.00, lastFetched: 0 };
    return fallback;
};

// P1 — STUB : Google Sheet legacy COMPLÈTEMENT supprimé (demande utilisateur :
// "je veux que plus rien ai accès à ce sheet"). Aucune requête vers
// docs.google.com depuis l'app. La source de vérité pour les données
// boursières est désormais Finnhub (services/marketData/) ou les saisies
// manuelles de l'utilisateur dans Configuration/Investments.
//
// Cette fonction est conservée pour ne pas casser les ~5 consumers
// (Dashboard, Investments, Retirement, FutureProjection, JsonDataView)
// qui l'attendent — elle retourne désormais toujours un tableau vide.
export const fetchPortfolioHistory = async (): Promise<MarketDataPoint[]> => {
    return [];
};


export const fetchAssetHistory = async (symbol: string, currency: string, currentPrice: number, performance: number) => {
    const data = await fetchPortfolioHistory();
    const cleanSym = symbol.split('.')[0];
    const keys = data.length > 0 ? Object.keys(data[0]) : [];
    const colKey = keys.find(k => k.includes(cleanSym) || k === symbol);

    if (!colKey) return { history: [], fromCache: true };

    const history = data.map(d => ({
        date: d.date as string,
        price: Number(d[colKey]) || 0
    }));

    return { history, fromCache: true };
};
