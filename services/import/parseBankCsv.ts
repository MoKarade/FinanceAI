// services/import/parseBankCsv.ts
// Import de relevés bancaires CSV « pour n'importe quelle banque ». Remplace le
// vieux parseTransactions (TAB/`;` + JJ/MM/AAAA + colonnes fixes seulement).
//
// 2 passes : (1) détecte séparateur + en-tête + mappe les colonnes (FR/EN) +
// déduit l'ordre de date ; (2) construit les Transaction[]. Gère virgule/`;`/TAB,
// guillemets, débit/crédit séparés, dates ISO/JJ-MM/MM-JJ, montants `$`,
// `1 234,56` (décimale virgule QC), `(50,00)` négatif. Fonction PURE → testable.

import { Transaction } from '../../types';
import { markDuplicates } from '../../utils/transactionParser';

export type Delimiter = ',' | ';' | '\t';
export type DateOrder = 'ISO' | 'DMY' | 'MDY';

export interface BankCsvColumns {
    date: number | null;
    payee: number | null;
    amount: number | null;
    debit: number | null;
    credit: number | null;
    category: number | null;
    account: number | null;
}

export interface ParsedBankCsv {
    transactions: Transaction[];
    total: number;
    imported: number;
    skipped: number;
    delimiter: Delimiter;
    hasHeader: boolean;
    dateOrder: DateOrder;
    columns: BankCsvColumns;
}

const stripAccents = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s: string): string => stripAccents(s).toLowerCase().trim();

const HEADER_KEYWORDS: Record<keyof BankCsvColumns, string[]> = {
    date: ['date', 'transaction date', 'posting date', 'date de transaction', 'date de comptabilisation', "date d'operation"],
    payee: ['description', 'payee', 'merchant', 'libelle', 'detail', 'narration', 'memo', 'beneficiaire', 'description des operations'],
    amount: ['amount', 'montant', 'montant de la transaction'],
    debit: ['debit', 'withdrawal', 'retrait', 'sortie', 'montant du retrait'],
    credit: ['credit', 'deposit', 'depot', 'entree', 'montant du depot'],
    category: ['category', 'categorie'],
    account: ['account', 'compte', 'account name', 'nom du compte', 'no de compte'],
};

/** Découpe une ligne CSV en respectant les guillemets et les "" échappés. */
const splitCsvLine = (line: string, delim: Delimiter): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQuotes) {
            if (c === '"') {
                if (line[i + 1] === '"') { cur += '"'; i++; }
                else inQuotes = false;
            } else cur += c;
        } else if (c === '"') inQuotes = true;
        else if (c === delim) { out.push(cur); cur = ''; }
        else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
};

const countOutsideQuotes = (line: string, ch: string): number => {
    let n = 0;
    let inQuotes = false;
    for (const c of line) {
        if (c === '"') inQuotes = !inQuotes;
        else if (!inQuotes && c === ch) n++;
    }
    return n;
};

const detectDelimiter = (line: string): Delimiter => {
    const counts: Array<[Delimiter, number]> = [
        [',', countOutsideQuotes(line, ',')],
        [';', countOutsideQuotes(line, ';')],
        ['\t', countOutsideQuotes(line, '\t')],
    ];
    counts.sort((a, b) => b[1] - a[1]);
    return counts[0][1] > 0 ? counts[0][0] : ',';
};

const findColumn = (headers: string[], key: keyof BankCsvColumns): number | null => {
    const kws = HEADER_KEYWORDS[key];
    for (let i = 0; i < headers.length; i++) {
        const h = norm(headers[i]);
        if (h && kws.some((kw) => h.includes(kw))) return i;
    }
    return null;
};

/** Montant : gère `$`, espaces (insécables inclus), `1 234,56`, `1,234.56`, `(50)` négatif. */
export const parseAmount = (raw: string): number | null => {
    if (!raw) return null;
    let s = raw.replace(/\s| | /g, '').replace(/[$€£]/g, '').trim();
    if (!s) return null;
    let sign = 1;
    if (/^\(.*\)$/.test(s)) { sign = -1; s = s.slice(1, -1); }
    if (s.startsWith('-')) { sign = -1; s = s.slice(1); }
    else if (s.startsWith('+')) s = s.slice(1);
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {
        // Le séparateur le PLUS À DROITE est le décimal ; l'autre = milliers.
        if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
        else s = s.replace(/,/g, '');
    } else if (lastComma > -1) {
        // Virgule seule : décimale si suivie de 1-2 chiffres en fin, sinon milliers.
        s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
    }
    const n = parseFloat(s);
    return Number.isFinite(n) ? sign * n : null;
};

/** Déduit l'ordre des dates en scannant la colonne (un jour > 12 ⇒ JJ/MM). */
const detectDateOrder = (rawDates: string[]): DateOrder => {
    for (const d of rawDates) {
        if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(d)) return 'ISO';
    }
    let dmy = false;
    let mdy = false;
    for (const d of rawDates) {
        const m = d.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
        if (!m) continue;
        const a = Number(m[1]);
        const b = Number(m[2]);
        if (a > 12) dmy = true;
        if (b > 12) mdy = true;
    }
    if (mdy && !dmy) return 'MDY';
    return 'DMY'; // défaut Canada/QC : jour d'abord
};

/** Parse une date selon l'ordre détecté → ISO YYYY-MM-DD, ou null. */
const parseDate = (raw: string, order: DateOrder): string | null => {
    const s = raw.trim();
    const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
    const m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (!m) return null;
    let year = Number(m[3]);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    const day = order === 'MDY' ? Number(m[2]) : Number(m[1]);
    const month = order === 'MDY' ? Number(m[1]) : Number(m[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const looksLikeHeader = (cells: string[], cols: BankCsvColumns): boolean => {
    // En-tête si on a trouvé au moins la colonne date par mot-clé ET que la 1re
    // ligne ne contient pas de date parsable en position attendue.
    if (cols.date == null) return false;
    return parseDate(cells[cols.date] ?? '', 'ISO') === null && parseDate(cells[cols.date] ?? '', 'DMY') === null;
};

// Compteur monotone d'IDs : Date.now() seul n'est pas unique si deux imports
// tombent dans la même milliseconde → collisions d'ID = corruption d'état React.
let importIdCounter = Date.now();

export const parseBankCsv = (raw: string): ParsedBankCsv => {
    const lines = (raw ?? '').replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim().length > 0);
    const empty: ParsedBankCsv = {
        transactions: [], total: 0, imported: 0, skipped: 0,
        delimiter: ',', hasHeader: false, dateOrder: 'DMY',
        columns: { date: null, payee: null, amount: null, debit: null, credit: null, category: null, account: null },
    };
    if (lines.length === 0) return empty;

    const delimiter = detectDelimiter(lines[0]);
    const firstCells = splitCsvLine(lines[0], delimiter);

    // Mapping par en-tête.
    let columns: BankCsvColumns = {
        date: findColumn(firstCells, 'date'),
        payee: findColumn(firstCells, 'payee'),
        amount: findColumn(firstCells, 'amount'),
        debit: findColumn(firstCells, 'debit'),
        credit: findColumn(firstCells, 'credit'),
        category: findColumn(firstCells, 'category'),
        account: findColumn(firstCells, 'account'),
    };
    const headerKeyHits = Object.values(columns).filter((v) => v != null).length;
    const hasHeader = headerKeyHits >= 2 && looksLikeHeader(firstCells, columns);

    // Pas d'en-tête fiable → mapping positionnel [date, payee, amount, cat?, compte?].
    if (!hasHeader) {
        columns = {
            date: 0, payee: 1, amount: 2,
            debit: null, credit: null,
            category: firstCells.length > 3 ? 3 : null,
            account: firstCells.length > 4 ? 4 : null,
        };
    }

    const dataLines = hasHeader ? lines.slice(1) : lines;
    const rows = dataLines.map((l) => splitCsvLine(l, delimiter));

    const dateCol = columns.date ?? 0;
    const dateOrder = detectDateOrder(rows.map((r) => r[dateCol] ?? ''));

    const at = (r: string[], i: number | null): string => (i == null ? '' : (r[i] ?? '').trim());
    const transactions: Transaction[] = [];
    let skipped = 0;

    rows.forEach((r) => {
        const isoDate = parseDate(at(r, columns.date), dateOrder);
        if (!isoDate) { skipped++; return; }

        let amount: number | null;
        if (columns.amount != null) {
            amount = parseAmount(at(r, columns.amount));
        } else {
            const debit = parseAmount(at(r, columns.debit)) ?? 0;
            const credit = parseAmount(at(r, columns.credit)) ?? 0;
            amount = credit - Math.abs(debit); // crédit + / débit −
        }
        if (amount == null || !Number.isFinite(amount)) { skipped++; return; }

        const payee = at(r, columns.payee) || 'Inconnu';
        const category = at(r, columns.category) || 'Uncategorized';
        const account = at(r, columns.account) || 'Importé';
        const lc = norm(category + ' ' + payee);
        const isTransfer = lc.includes('virement') || lc.includes('transfert') || lc.includes('transfer');

        transactions.push({
            id: -(importIdCounter++),
            date: isoDate,
            payee,
            amount,
            category,
            originalCategory: category,
            accountName: account,
            status: 'processed',
            isTransfer,
            isDuplicate: false,
        });
    });

    return {
        transactions: markDuplicates(transactions),
        total: rows.length,
        imported: transactions.length,
        skipped,
        delimiter,
        hasHeader,
        dateOrder,
        columns,
    };
};
