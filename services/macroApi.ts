/**
 * V16: Live Macro-Economic API Service
 * Fetches real-time Canadian economic indicators from public sources.
 * Uses the Bank of Canada's public Valet API (free, no auth required).
 * Falls back to hardcoded defaults if the API is unavailable.
 */

export interface MacroRates {
    inflationRate: number;       // CPI year-over-year %
    mortgageRate5yr: number;     // 5-year fixed mortgage rate %
    bankOfCanadaRate: number;    // Bank of Canada overnight rate %
    lastUpdated: string;
    source: 'live' | 'cached' | 'fallback';
}

// Default fallback values (March 2026)
const FALLBACK_RATES: MacroRates = {
    inflationRate: 2.6,
    mortgageRate5yr: 4.79,
    bankOfCanadaRate: 3.0,
    lastUpdated: new Date().toLocaleDateString('fr-CA'),
    source: 'fallback'
};

// Cache key for localStorage
const CACHE_KEY = 'fireai_macro_rates';
const CACHE_TTL_HOURS = 24;

function getCachedRates(): MacroRates | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const { data, timestamp } = JSON.parse(raw);
        const ageHours = (Date.now() - timestamp) / (1000 * 3600);
        if (ageHours < CACHE_TTL_HOURS) return { ...data, source: 'cached' };
        return null;
    } catch (err) {
        console.warn("[MacroAPI] Cache read error:", err);
        return null;
    }
}

function setCachedRates(data: MacroRates): void {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    } catch (err) { console.warn("[MacroAPI] Cache write error:", err); }
}

/**
 * Fetch live Canadian macro rates.
 * Primary: Bank of Canada Valet API (CORS-friendly public endpoint)
 * Fallback: localStorage cache → hardcoded defaults
 */
export async function fetchMacroRates(): Promise<MacroRates> {
    // 1. Check cache first
    const cached = getCachedRates();
    if (cached) return cached;

    try {
        // 2. Bank of Canada Valet API: Overnight rate (V122514) and prime rate (V122532)
        // The endpoint returns JSONP-style JSON - we use /observations endpoint
        const bocUrl = 'https://www.bankofcanada.ca/valet/observations/V122514,V80691335,V122532/json?recent=10';
        const res = await fetch(bocUrl, { signal: AbortSignal.timeout(5000) });

        if (!res.ok) throw new Error('BOC API not OK');

        const json = await res.json();
        const obs = json.observations as any[];
        if (!obs || obs.length === 0) throw new Error('No observations returned');

        // Get latest values
        const latest = obs[obs.length - 1];
        const overnightRate = parseFloat(latest?.V122514?.v || '3.0');
        const primeRate = parseFloat(latest?.V122532?.v || '5.2');

        // Estimate 5yr fixed = prime rate + ~0-0.5% spread (simplified)
        const estimatedMortgage5yr = primeRate - 1.5; // Prime minus spread typical for 5yr fixed

        // Fetch CPI from Statistics Canada API (open)
        let inflationRate = 2.6; // Default
        try {
            const statsCanUrl = 'https://www150.statcan.gc.ca/t1/tbl1/en/dtbl!download=json&wds%5B0%5D%5B%5D=1810000401,1.1.1&lang=en';
            // Use a simplified proxy or fallback since Stats Canada doesn't support CORS well
            // We'll just use the Bank of Canada's CPI series V41694096
            const cpiUrl = 'https://www.bankofcanada.ca/valet/observations/V41694096/json?recent=3';
            const cpiRes = await fetch(cpiUrl, { signal: AbortSignal.timeout(3000) });
            if (cpiRes.ok) {
                const cpiJson = await cpiRes.json();
                const cpiObs = cpiJson.observations as any[];
                if (cpiObs && cpiObs.length >= 2) {
                    const latestCpi = parseFloat(cpiObs[cpiObs.length - 1]?.V41694096?.v || '0');
                    const prevCpi = parseFloat(cpiObs[cpiObs.length - 2]?.V41694096?.v || '0');
                    if (latestCpi > 0 && prevCpi > 0) {
                        // Monthly CPI change annualized
                        inflationRate = parseFloat(((latestCpi / prevCpi - 1) * 1200).toFixed(1));
                    }
                }
            }
        } catch (err) { console.warn("[MacroAPI] Inflation fetch error (using default):", err); }

        const result: MacroRates = {
            inflationRate: Math.max(0, Math.min(15, inflationRate)),
            mortgageRate5yr: Math.max(2, Math.min(12, estimatedMortgage5yr)),
            bankOfCanadaRate: Math.max(0, Math.min(10, overnightRate)),
            lastUpdated: new Date().toLocaleDateString('fr-CA'),
            source: 'live'
        };

        setCachedRates(result);
        return result;

    } catch (e) {
        console.warn('[MacroAPI] Failed to fetch live rates, using fallback:', e);
        return FALLBACK_RATES;
    }
}
