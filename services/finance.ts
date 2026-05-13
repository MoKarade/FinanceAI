
// --- GOOGLE SHEET DATA FETCHER + TAUX DE CHANGE BANQUE DU CANADA ---

export interface MarketDataPoint {
    date: string;
    [key: string]: string | number;
}

const SHEET_ID = "1bvHRAFP-GCjQjgsRit61JBidPAmerdgij33_lO1Ob9w";
const CSV_URL_GVIZ = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=0`;

// Timeout et retry pour les fetches
const FETCH_TIMEOUT_MS = 12000; // 12 secondes max
const MAX_RETRIES = 2;

let cachedData: MarketDataPoint[] | null = null;
let activeFetch: Promise<MarketDataPoint[]> | null = null;

// Taux de change mis en cache localement
let cachedFxRates: { USD: number; EUR: number; CAD: number; lastFetched: number } | null = null;

/**
 * Fetch avec timeout intégré et support d'abort
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
 * Fetch avec retries automatiques
 */
const fetchWithRetry = async (url: string, retries: number = MAX_RETRIES): Promise<Response> => {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fetchWithTimeout(url);
        } catch (e) {
            if (attempt === retries) throw e;
            console.warn(`Tentative ${attempt + 1} échouée, retry...`);
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // Backoff exponentiel
        }
    }
    throw new Error("Max retries reached");
};

// Parseur CSV manuel robuste
const parseCsvLine = (text: string, sep: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === sep && !inQuotes) {
            result.push(cur);
            cur = '';
        } else {
            cur += char;
        }
    }
    result.push(cur);
    return result.map(s => s.trim().replace(/^"|"$/g, ''));
};

const cleanNumberString = (val: any): number => {
    if (val === null || val === undefined) return NaN;
    let str = String(val).replace(/^"|"$/g, '').trim();
    if (str === '' || str === '-') return NaN;

    str = str.replace(/[\s\u00A0\u202F$€£%]/g, '');
    str = str.replace(/[^0-9.,-]/g, '');

    const isNeg = str.startsWith('-');
    str = str.replace(/-/g, '');
    if (isNeg) str = '-' + str;

    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');

    if (lastComma > lastDot) {
        str = str.replace(/\./g, '').replace(',', '.');
    } else if (lastDot > lastComma) {
        str = str.replace(/,/g, '');
    } else if (lastComma !== -1 && lastDot === -1) {
        str = str.replace(',', '.');
    }

    const num = parseFloat(str);
    return isNaN(num) ? NaN : num;
};

/**
 * Récupère les taux de change depuis la Banque du Canada (API officielle, gratuite).
 * Cache 24h pour éviter trop de requêtes.
 * Fallback sur les valeurs stockées en cas d'échec.
 */
export const fetchFxRates = async (): Promise<{ USD: number; EUR: number; CAD: number; lastFetched: number }> => {
    const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 heures
    const now = Date.now();

    // Vérifier le cache en mémoire
    if (cachedFxRates && (now - cachedFxRates.lastFetched) < CACHE_DURATION_MS) {
        return cachedFxRates;
    }

    // Vérifier le cache localStorage
    try {
        const stored = localStorage.getItem('fx_rates_cache');
        if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed && (now - (parsed.lastFetched || 0)) < CACHE_DURATION_MS) {
                cachedFxRates = parsed;
                return parsed;
            }
        }
    } catch (e) { /* ignore */ }

    // Fetch depuis la Banque du Canada
    // API: /valet/observations/GROUPE/json?recent=1
    // Séries: FXUSDCAD (USD/CAD) et FXEURCAD (EUR/CAD)
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

                // Persistance dans localStorage
                try { localStorage.setItem('fx_rates_cache', JSON.stringify(rates)); } catch (e) { /* ignore */ }

                console.log(`✅ Taux FX mis à jour (Banque du Canada): USD=${usdCad.toFixed(4)}, EUR=${eurCad.toFixed(4)}`);
                return rates;
            }
        }
    } catch (e) {
        console.warn("⚠️ Impossible de récupérer les taux FX (Banque du Canada), utilisation des valeurs en cache/défaut:", e);
    }

    // Fallback: valeurs par défaut approximatives si tout échoue
    const fallback = { USD: 1.40, EUR: 1.47, CAD: 1.00, lastFetched: 0 };
    return fallback;
};

export const fetchPortfolioHistory = async (): Promise<MarketDataPoint[]> => {
    if (cachedData && cachedData.length > 0) return cachedData;
    if (activeFetch) return activeFetch;

    activeFetch = (async () => {
        try {
            console.log(`📡 Fetching Master CSV...`);

            let csvText = '';

            // 1. Tenter l'export direct (peut échouer à cause des CORS)
            try {
                const response = await fetchWithTimeout(CSV_URL_GVIZ, 8000);
                if (response.ok) {
                    const text = await response.text();
                    if (!text.toLowerCase().includes('<!doctype html>') && !text.toLowerCase().includes('<html')) {
                        csvText = text;
                        console.log('✅ Fetch direct réussi');
                    }
                }
            } catch (e) {
                console.warn("Export direct échoué (CORS probable), tentative via Proxy...");
            }

            // 2. Fallback via proxy public si nécessaire
            if (!csvText) {
                const PROXY_URL = `https://api.allorigins.win/raw?url=${encodeURIComponent(CSV_URL_GVIZ)}`;
                try {
                    const responseProxy = await fetchWithRetry(PROXY_URL);
                    if (!responseProxy.ok) throw new Error(`Erreur Proxy: ${responseProxy.status}`);
                    csvText = await responseProxy.text();

                    if (csvText.toLowerCase().includes('<!doctype html>') || csvText.toLowerCase().includes('<html')) {
                        console.error("❌ Le fichier Google Sheet est privé ou l'ID est invalide.");
                        return [];
                    }
                    console.log('✅ Fetch via proxy réussi');
                } catch (proxyError) {
                    console.error("❌ Proxy également indisponible:", proxyError);
                    return [];
                }
            }

            const lines = csvText.split(/\r?\n/).filter(l => l.trim() !== '');
            if (lines.length < 2) return [];

            // Détection du séparateur
            const firstLine = lines[0];
            const commaCount = (firstLine.match(/,/g) || []).length;
            const semiCount = (firstLine.match(/;/g) || []).length;
            const tabCount = (firstLine.match(/\t/g) || []).length;

            let separator = ',';
            if (semiCount > commaCount && semiCount > tabCount) separator = ';';
            else if (tabCount > commaCount && tabCount > semiCount) separator = '\t';

            const headers = parseCsvLine(firstLine, separator).map(h => h.replace(/[\r\n]/g, '').trim());

            let dateColIdx = headers.findIndex(h => h.toLowerCase().includes('date') || h.toLowerCase().includes('jour') || h.toLowerCase().includes('timestamp'));
            if (dateColIdx === -1) dateColIdx = 0;

            const data: MarketDataPoint[] = [];
            const lastKnownValues: Record<string, number> = {};

            const limitDate = new Date();
            limitDate.setDate(limitDate.getDate() + 2);

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                if (!line.trim()) continue;

                const cols = parseCsvLine(line, separator);
                const rowObj: MarketDataPoint = { date: '' };

                let rawDate = cols[dateColIdx] || '';
                rawDate = String(rawDate).replace(/^"|"$/g, '').split(' ')[0];

                let parsedDateStr = '';
                // Handle Excel serial date numbers (e.g. 45678 = days since 1900-01-01)
                if (/^\d{5}$/.test(rawDate) || /^\d{4,6}$/.test(rawDate)) {
                    const serial = parseInt(rawDate);
                    if (serial > 25000 && serial < 80000) {
                        // Excel epoch: Jan 1 1900 = day 1 (with bug: treats 1900 as leap year, so offset 2)
                        const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
                        const d = new Date(excelEpoch.getTime() + serial * 86400000);
                        if (!isNaN(d.getTime())) {
                            parsedDateStr = d.toISOString().split('T')[0];
                        }
                    }
                }
                if (!parsedDateStr && rawDate.includes('/')) {
                    const p = rawDate.split('/');
                    if (p.length === 3) {
                        let y = p[2], m = p[1], d = p[0];
                        if (p[0].length === 4) { y = p[0]; m = p[1]; d = p[2]; }
                        else if (Number(p[0]) > 12) { d = p[0]; m = p[1]; }
                        else if (Number(p[1]) > 12) { m = p[0]; d = p[1]; }

                        if (y.length === 2) y = `20${y}`;
                        parsedDateStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
                    }
                } else if (rawDate.includes('-')) {
                    const p = rawDate.split('-');
                    if (p.length === 3) {
                        let y = p[0], m = p[1], d = p[2];
                        if (p[2].length === 4) { y = p[2]; m = p[1]; d = p[0]; }
                        if (y.length === 2) y = `20${y}`;
                        parsedDateStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
                    }
                } else if (!parsedDateStr) {
                    parsedDateStr = rawDate;
                }

                if (!parsedDateStr) continue;

                const rowDate = new Date(parsedDateStr);
                if (isNaN(rowDate.getTime())) continue;
                if (rowDate > limitDate) continue;

                rowObj['date'] = parsedDateStr;

                headers.forEach((header, idx) => {
                    if (idx === dateColIdx || !header) return;

                    const rawVal = cols[idx] || '';
                    const val = cleanNumberString(rawVal);

                    if (!isNaN(val) && val !== 0) {
                        lastKnownValues[header] = val;
                        rowObj[header] = val;
                    } else {
                        rowObj[header] = lastKnownValues[header] || 0;
                    }
                });

                data.push(rowObj);
            }

            const sortedData = data.sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime());

            console.log(`✅ CSV Parsed: ${sortedData.length} lignes chargées.`);
            cachedData = sortedData;
            return sortedData;

        } catch (e) {
            console.error("❌ CSV Fetch complet échoué:", e);
            return [];
        } finally {
            activeFetch = null;
        }
    })();

    return activeFetch;
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
