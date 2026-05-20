// §7.F.1 — Types partagés pour la façade marketData (provider-agnostic).
//
// Une seule source de vérité pour ce que l'app attend d'un provider de
// données de marché. Les wrappers spécifiques (finnhub.ts, bankOfCanada.ts,
// googleSheet.ts) implémentent ces interfaces.

/** Quote spot sur un symbole. */
export interface Quote {
    /** Symbole canonique, ex "NASDAQ:NVDA", "TSX:VFV" ou "TSE:XEQT.TO". */
    symbol: string;
    /** Prix actuel en devise native (USD/CAD/EUR). */
    price: number;
    /** Variation absolue depuis la veille. */
    change: number;
    /** Variation en %. */
    changePercent: number;
    /** Devise native du symbole. */
    currency: 'CAD' | 'USD' | 'EUR' | string;
    /** Timestamp Unix de la quote (ms). */
    timestamp: number;
}

/** Point d'historique journalier. */
export interface HistoryPoint {
    /** Date au format ISO YYYY-MM-DD. */
    date: string;
    /** Close ajusté (post split + dividende). */
    close: number;
    open?: number;
    high?: number;
    low?: number;
    volume?: number;
}

/** Profil statique d'un actif (rarement changeant). */
export interface AssetProfile {
    symbol: string;
    /** Nom complet de la compagnie (ex "NVIDIA Corporation"). */
    name: string;
    /** Secteur (Technologie, Finance, Industrie, etc.). */
    sector: string;
    /** Région primaire (USA, Europe, Asie, Canada). */
    region: string;
    /** Yield dividende annuel en % (0 si pas de dividende). */
    dividendYield: number;
    /** Devise de cotation. */
    currency: string;
    /** Pays ISO du HQ (US, CA, FR, etc.). */
    country?: string;
    /** Industrie plus fine (sous-secteur). */
    industry?: string;
}

/** Information de dividende prochain. */
export interface DividendInfo {
    symbol: string;
    /** Montant du dividende par action en devise native. */
    amount: number;
    /** Date ex-dividende. */
    exDate: string;
    /** Date de paiement. */
    payDate: string;
    /** Fréquence (4 = trimestriel, 12 = mensuel, etc.). */
    frequency: number;
}

/** Interface qu'un provider de marketData doit implémenter. */
export interface MarketDataProvider {
    /** Nom du provider pour le logging/diagnostics. */
    name: string;
    /** Quote courante. Retourne null si symbole inconnu/erreur. */
    getQuote(symbol: string): Promise<Quote | null>;
    /** Historique sur une période. Retourne [] si aucun point. */
    getHistory(symbol: string, from: Date, to: Date): Promise<HistoryPoint[]>;
    /** Profil statique. Cache fortement recommandé côté caller. */
    getProfile(symbol: string): Promise<AssetProfile | null>;
    /** Prochains dividendes. Optionnel selon le provider. */
    getDividends?(symbol: string): Promise<DividendInfo[]>;
}

/** Erreur de provider (rate limit, auth, network…). */
export class MarketDataError extends Error {
    constructor(
        message: string,
        public readonly code: 'AUTH' | 'RATE_LIMIT' | 'NOT_FOUND' | 'NETWORK' | 'UNKNOWN',
        public readonly provider: string,
    ) {
        super(message);
        this.name = 'MarketDataError';
    }
}
