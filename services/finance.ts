// --- TAUX DE CHANGE BANQUE DU CANADA (seul fetch externe restant) ---
// P1 — Suppression totale du Google Sheet legacy (sur demande utilisateur).
// L'app ne fait plus aucun fetch vers docs.google.com pour les données
// boursières. La source de vérité unique est désormais Finnhub via
// services/marketData/.

import { logError } from './errorLogger';

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
                // Distingue un taux ABSENT (repli silencieux normal) d'un taux PRÉSENT mais
                // CORROMPU (0/NaN/texte) → ce dernier est loggué au lieu d'être masqué par le repli.
                const parseRate = (raw: unknown, fallback: number, label: string): number => {
                    if (raw === undefined || raw === null || String(raw).trim() === '') return fallback; // absent : normal
                    const v = parseFloat(String(raw));
                    if (Number.isFinite(v) && v > 0) return v;
                    logError({ source: 'network', severity: 'warning', message: `Taux de change ${label} corrompu — repli sur ${fallback}`, context: { raw: String(raw).slice(0, 24) } });
                    return fallback;
                };
                const usdCad = parseRate(obs?.FXUSDCAD?.v, 1.40, 'USD/CAD');
                const eurCad = parseRate(obs?.FXEURCAD?.v, 1.47, 'EUR/CAD');

                const rates = { USD: usdCad, EUR: eurCad, CAD: 1.00, lastFetched: now };
                cachedFxRates = rates;

                // Persistance dans localStorage si disponible (no-op en Node)
                safeSetItem('fx_rates_cache', JSON.stringify(rates));

                // Confirmation de mise à jour des taux : log informatif, pas une erreur.
                // eslint-disable-next-line no-console
                console.log(`Taux FX mis a jour (Banque du Canada): USD=${usdCad.toFixed(4)}, EUR=${eurCad.toFixed(4)}`);
                return rates;
            }
        }
    } catch (e) {
        logError({ source: 'network', severity: 'warning', message: 'Taux FX (Banque du Canada) indisponibles — fallback cache/défaut', error: e });
    }

    // Fallback (audit Tier 🟡) — préférer le DERNIER taux réel connu, même périmé (>24h),
    // à un taux inventé : un taux d'hier est plus honnête qu'une approximation hardcodée.
    // (Le check de fraîcheur 24h plus haut a échoué OU le réseau est tombé ; ici on
    // accepte volontairement un cache vieux comme repli réaliste.)
    const lastKnown = safeGetItem('fx_rates_cache');
    if (lastKnown) {
        try {
            const parsed = JSON.parse(lastKnown);
            if (parsed && typeof parsed.USD === 'number' && typeof parsed.EUR === 'number' && typeof parsed.CAD === 'number') {
                return parsed; // périmé mais réel
            }
        } catch { /* cache corrompu : on tombe sur les défauts */ }
    }

    // Dernier recours : défauts approximatifs. `lastFetched: 0` = signal « jamais récupéré »
    // (contrat qu'un futur badge UI « taux estimé » pourra détecter).
    const fallback = { USD: 1.40, EUR: 1.47, CAD: 1.00, lastFetched: 0 };
    return fallback;
};

// P1 — STUB : Google Sheet legacy COMPLÈTEMENT supprimé (demande utilisateur :
// "je veux que plus rien ai accès à ce sheet"). Aucune requête vers
// docs.google.com depuis l'app. La source de vérité pour les données
// boursières est désormais Finnhub (services/marketData/) ou les saisies
// manuelles de l'utilisateur dans Configuration/Investments.
//
// Conservée pour ses consumers restants (StockComparisonModal, usePortfolioHistory,
// fetchAssetHistory ci-dessous) — retourne toujours un tableau vide. [DEAD-FLT] : Retirement
// purgé 2026-06-11 ; candidat : purger toute la chaîne du stub (cf BACKLOG).
export const fetchPortfolioHistory = async (): Promise<MarketDataPoint[]> => {
    return [];
};


export const fetchAssetHistory = async (symbol: string, _currency: string, _currentPrice: number, _performance: number) => {
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
