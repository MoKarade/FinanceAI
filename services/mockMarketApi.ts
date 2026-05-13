
import { STATIC_CSV_DATA } from "./staticCsvData";

// HELPER: Reverse engineer raw data from the static CSV for the purpose of the simulation
// In a real app, this would perform a fetch('https://api.market.com/...')
const parseNum = (val: any) => {
    if (typeof val === 'number') return val;
    if (!val || typeof val !== 'string') return NaN;
    const clean = val.replace(/["\s\u00A0$€]/g, '').replace(',', '.');
    return parseFloat(clean);
};

export interface RawMarketData {
    date: string;
    close: number; // Local Currency
}

export interface FxData {
    date: string;
    rate: number;
}

// SIMULATED API DELAY
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const mockFetchRawPrices = async (symbol: string, currency: 'USD' | 'EUR' | 'CAD'): Promise<RawMarketData[]> => {
    await delay(50); // Simulate network latency

    // Mapping CSV headers to symbol
    const map: Record<string, string> = {
        'HWM': 'NYSE:HWM', 'NVDA': 'NASDAQ:NVDA', 'KLAC': 'NASDAQ:KLAC', 
        'TSM': 'NYSE:TSM', 'PLTR': 'NASDAQ:PLTR', 'AVGO': 'NASDAQ:AVGO', 
        'V': 'NYSE:V', 'GBS': 'BIT:GBS', 'PAASI': 'EPA:PAASI', 
        'SAF': 'EPA:SAF', 'CW8': 'EPA:CW8', 'ANDXF': 'EPA:PAASI' // Fallback
    };
    
    const csvKey = map[symbol];
    if (!csvKey) return [];

    return STATIC_CSV_DATA.map(row => {
        const dateRaw = row["Date"];
        if(!dateRaw) return null;
        const parts = dateRaw.split('/');
        const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
        
        let cadPrice = parseNum(row[csvKey]);
        let fxRate = 1;
        
        // REVERSE ENGINEERING TO SIMULATE RAW LOCAL PRICE
        // We divide by the FX rate of that day to get back the "Original USD/EUR Price"
        // This forces the ETL pipeline to actually do the multiplication work later.
        if (currency === 'USD') fxRate = parseNum(row["TauxUSDCAD"]);
        else if (currency === 'EUR') fxRate = parseNum(row["TauxEURCAD"]);
        
        if (isNaN(cadPrice) || isNaN(fxRate)) return null;

        return {
            date: isoDate,
            close: cadPrice / fxRate // Returning RAW LOCAL price
        };
    }).filter(x => x !== null) as RawMarketData[];
};

export const mockFetchFxRates = async (pair: 'USD/CAD' | 'EUR/CAD'): Promise<FxData[]> => {
    await delay(30);
    const key = pair === 'USD/CAD' ? "TauxUSDCAD" : "TauxEURCAD";
    
    return STATIC_CSV_DATA.map(row => {
        const dateRaw = row["Date"];
        if(!dateRaw) return null;
        const parts = dateRaw.split('/');
        return {
            date: `${parts[2]}-${parts[1]}-${parts[0]}`,
            rate: parseNum(row[key])
        };
    }).filter(x => x !== null && !isNaN(x.rate)) as FxData[];
}
