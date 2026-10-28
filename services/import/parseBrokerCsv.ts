// services/import/parseBrokerCsv.ts
// Import de positions courtier CSV (Wealthsimple, Questrade, Disnat, RBC DI, etc.)
// « pour n'importe quel courtier ». Réutilise les primitives CSV éprouvées de
// parseBankCsv (détection séparateur, parseAmount QC, normalisation).
//
// Produit des "holdings" PURS {symbol, quantity, avgCost, currency, accountType?,
// date?} → mappés en Asset[] par holdingsToAssets. Fonction PURE, zéro réseau →
// testable. Le prix LIVE est laissé à l'UI (quote Finnhub optionnel, comme
// AddStockForm) ; par défaut currentPrice = avgCost (placeholder honnête, perf 0 %).

import type { Asset, RegisteredAccountType } from '../../types';
import { splitCsvLine, detectDelimiter, parseAmount, norm, type Delimiter } from './parseBankCsv';

export interface ParsedHolding {
    symbol: string;
    quantity: number;
    /** Coût moyen PAR action, dans la devise du holding. */
    avgCost: number;
    currency: 'USD' | 'CAD' | 'EUR';
    accountType?: RegisteredAccountType;
    /** Date d'achat si une colonne date existe (sinon undefined → pas de passé daté). */
    date?: string;
}

interface BrokerCsvColumns {
    symbol: number | null;
    quantity: number | null;
    price: number | null;      // coût moyen PAR action
    bookCost: number | null;   // coût TOTAL (divisé par la quantité si price absent)
    currency: number | null;
    account: number | null;
    date: number | null;
}

export interface ParsedBrokerCsv {
    holdings: ParsedHolding[];
    total: number;
    imported: number;
    skipped: number;
    delimiter: Delimiter;
    hasHeader: boolean;
    columns: BrokerCsvColumns;
}

const HEADER_KEYWORDS: Record<keyof BrokerCsvColumns, string[]> = {
    symbol: ['symbol', 'ticker', 'symbole', 'security', 'titre', 'fund', 'description'],
    quantity: ['quantity', 'qty', 'shares', 'quantite', 'parts', 'nombre', 'units', 'unites'],
    price: ['average cost', 'avg cost', 'cost per', 'prix moyen', 'cout moyen', 'cout unitaire', 'prix unitaire', 'unit cost', 'average price', 'prix de revient'],
    bookCost: ['book cost', 'book value', 'total cost', 'cout total', 'valeur comptable', 'cout dacquisition'],
    currency: ['currency', 'devise', 'monnaie', 'curr'],
    account: ['account', 'compte', 'registration', 'type de compte', 'regime'],
    date: ['purchase date', 'date achat', 'date d achat', 'acquired', 'date acquisition', 'trade date', 'date'],
};

function findColumn(headers: string[], key: keyof BrokerCsvColumns): number | null {
    const kws = HEADER_KEYWORDS[key];
    for (let i = 0; i < headers.length; i++) {
        const h = norm(headers[i]);
        if (h && kws.some((kw) => h.includes(kw))) return i;
    }
    return null;
}

function normCurrency(raw: string): 'USD' | 'CAD' | 'EUR' {
    const u = norm(raw);
    if (u.includes('cad') || u.includes('can')) return 'CAD';
    if (u.includes('eur')) return 'EUR';
    return 'USD';
}

function normAccountType(raw: string): RegisteredAccountType | undefined {
    const u = norm(raw);
    if (!u) return undefined;
    if (u.includes('tfsa') || u.includes('celi')) return 'CELI';
    if (u.includes('fhsa') || u.includes('celiapp')) return 'CELIAPP';
    if (u.includes('rrsp') || u.includes('reer')) return 'REER';
    if (u.includes('crypto')) return 'CRYPTO';
    return 'NON-ENREG';
}

/** Date d'achat : ISO (AAAA-MM-JJ) ou JJ/MM/AAAA → ISO, ou undefined. */
function parseHoldingDate(raw: string): string | undefined {
    const s = (raw ?? '').trim();
    if (!s) return undefined;
    const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
    const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (dmy) {
        let year = Number(dmy[3]);
        if (year < 100) year += year < 50 ? 2000 : 1900;
        const day = Number(dmy[1]);
        const month = Number(dmy[2]);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
    }
    return undefined;
}

/**
 * Parse un CSV de positions courtier. Exige un en-tête nommé (colonnes trop
 * variables d'un courtier à l'autre pour deviner par position).
 */
export function parseBrokerCsv(raw: string): ParsedBrokerCsv {
    const lines = (raw ?? '').replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim().length > 0);
    const emptyCols: BrokerCsvColumns = { symbol: null, quantity: null, price: null, bookCost: null, currency: null, account: null, date: null };
    if (lines.length === 0) {
        return { holdings: [], total: 0, imported: 0, skipped: 0, delimiter: ',', hasHeader: false, columns: emptyCols };
    }

    const delimiter = detectDelimiter(lines[0]);
    const firstCells = splitCsvLine(lines[0], delimiter);
    const columns: BrokerCsvColumns = {
        symbol: findColumn(firstCells, 'symbol'),
        quantity: findColumn(firstCells, 'quantity'),
        price: findColumn(firstCells, 'price'),
        bookCost: findColumn(firstCells, 'bookCost'),
        currency: findColumn(firstCells, 'currency'),
        account: findColumn(firstCells, 'account'),
        date: findColumn(firstCells, 'date'),
    };

    // En-tête fiable = symbole + quantité nommés. Sinon on n'invente pas.
    const hasHeader = columns.symbol != null && columns.quantity != null;
    if (!hasHeader) {
        return { holdings: [], total: lines.length, imported: 0, skipped: lines.length, delimiter, hasHeader: false, columns };
    }

    const rows = lines.slice(1).map((l) => splitCsvLine(l, delimiter));
    const at = (r: string[], i: number | null): string => (i == null ? '' : (r[i] ?? '').trim());

    const holdings: ParsedHolding[] = [];
    let skipped = 0;
    for (const r of rows) {
        const symbol = at(r, columns.symbol).toUpperCase().replace(/\s+/g, '');
        const quantity = parseAmount(at(r, columns.quantity));
        if (!symbol || quantity == null || quantity <= 0) { skipped++; continue; }

        // Coût par action ; à défaut, coût total ÷ quantité.
        let avgCost: number | null = columns.price != null ? parseAmount(at(r, columns.price)) : null;
        if ((avgCost == null || avgCost <= 0) && columns.bookCost != null) {
            const book = parseAmount(at(r, columns.bookCost));
            if (book != null && book > 0) avgCost = book / quantity;
        }
        if (avgCost == null || avgCost <= 0) { skipped++; continue; }

        holdings.push({
            symbol,
            quantity,
            avgCost,
            currency: columns.currency != null ? normCurrency(at(r, columns.currency)) : 'USD',
            accountType: columns.account != null ? normAccountType(at(r, columns.account)) : undefined,
            date: columns.date != null ? parseHoldingDate(at(r, columns.date)) : undefined,
        });
    }

    return { holdings, total: rows.length, imported: holdings.length, skipped, delimiter, hasHeader, columns };
}

/**
 * Mappe les holdings parsés en Asset[] prêts pour le store.
 * currentPrice = avgCost (placeholder honnête : perf 0 % jusqu'à un quote live).
 * Aucune devinette : si pas de date, purchases.date reste vide (le passé daté
 * ne prend pas ce titre tant qu'une date n'est pas fournie).
 */
export function holdingsToAssets(holdings: ParsedHolding[]): Asset[] {
    return holdings.map((h) => ({
        symbol: h.symbol,
        name: h.symbol,
        quantity: h.quantity,
        currency: h.currency,
        currentPrice: h.avgCost,
        performance: 0,
        dateBought: h.date ?? '',
        buyPrice: h.avgCost,
        purchases: [{ date: h.date ?? '', quantity: h.quantity, price: h.avgCost }],
        accountType: h.accountType ?? 'NON-ENREG',
    }));
}
