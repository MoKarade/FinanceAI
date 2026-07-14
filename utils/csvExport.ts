// P1.4 — Export CSV helpers (RFC 4180 compliant).
//
// Fonctions :
//   - toCSV(rows, columns) : helper générique
//   - downloadCSV(filename, content) : trigger téléchargement browser
//   - exportTransactionsCSV / exportHoldingsCSV / exportBudgetCSV : presets
//
// Format : virgule (comma) comme delimiter, double-quotes pour escape,
// CRLF line ending — conforme RFC 4180 pour compat Excel/Google Sheets.

import type { Transaction, Asset, BudgetCategory } from '../types';

/**
 * Échappe une valeur pour CSV RFC 4180.
 * - Si contient `,`, `"`, ou `\n` → entoure de `"` et double les `"` internes.
 * - Sinon, retourne tel quel.
 */
export function escapeCsvField(value: unknown): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    const needsQuoting = /[",\n\r]/.test(str);
    if (!needsQuoting) return str;
    return `"${str.replace(/"/g, '""')}"`;
}

export interface CsvColumn<T> {
    header: string;
    accessor: (row: T) => unknown;
}

/**
 * Convertit un array d'objets en CSV.
 *
 * @example
 *   toCSV([{a:1, b:'x'}], [{header:'A', accessor: r => r.a}, {header:'B', accessor: r => r.b}])
 *   // → "A,B\r\n1,x"
 */
export function toCSV<T>(rows: T[], columns: CsvColumn<T>[]): string {
    const header = columns.map(c => escapeCsvField(c.header)).join(',');
    const body = rows.map(row =>
        columns.map(c => escapeCsvField(c.accessor(row))).join(','),
    );
    return [header, ...body].join('\r\n');
}

/**
 * Déclenche le téléchargement d'un CSV dans le browser.
 * Ajoute le BOM UTF-8 pour qu'Excel ouvre correctement les accents.
 */
export function downloadCSV(filename: string, content: string): void {
    if (typeof window === 'undefined') return;
    const bom = '﻿'; // BOM UTF-8 pour Excel
    const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Export transactions au format CSV (preset). */
export function exportTransactionsCSV(transactions: Transaction[]): string {
    return toCSV<Transaction>(transactions, [
        { header: 'Date', accessor: t => t.date },
        { header: 'Payee', accessor: t => t.payee || '' },
        { header: 'Amount', accessor: t => t.amount },
        { header: 'Category', accessor: t => t.category || '' },
        { header: 'Account', accessor: t => t.accountName || '' },
        { header: 'Is Transfer', accessor: t => t.isTransfer ? 'true' : 'false' },
        { header: 'Is Duplicate', accessor: t => t.isDuplicate ? 'true' : 'false' },
        { header: 'Status', accessor: t => t.status || '' },
    ]);
}

/** Export holdings (Asset[]) au format CSV (preset). */
export function exportHoldingsCSV(assets: Asset[]): string {
    return toCSV<Asset>(assets, [
        { header: 'Symbol', accessor: a => a.symbol },
        { header: 'Name', accessor: a => a.name || '' },
        { header: 'Quantity', accessor: a => a.quantity },
        { header: 'Currency', accessor: a => a.currency },
        { header: 'Current Price', accessor: a => a.currentPrice },
        { header: 'Buy Price', accessor: a => a.buyPrice ?? '' },
        { header: 'Date Bought', accessor: a => a.dateBought || '' },
        { header: 'Account Type', accessor: a => a.accountType || '' },
        { header: 'Performance %', accessor: a => a.performance },
        // [ASSET-FX-DISPLAY] `Value` est volontairement en devise NATIVE de la ligne (la colonne
        // `Currency` à côté la qualifie) — c'est le seul agrégat par-ligne où le natif est correct.
        // Ne PAS sommer cette colonne entre devises ; pour un total CAD, utiliser l'app.
        { header: 'Value', accessor: a => (a.quantity || 0) * (a.currentPrice || 0) },
    ]);
}

/** Export budget items au format CSV (preset). */
export function exportBudgetCSV(items: BudgetCategory[]): string {
    return toCSV<BudgetCategory>(items, [
        { header: 'Name', accessor: b => b.name },
        { header: 'Nature', accessor: b => b.nature || '' },
        { header: 'Type', accessor: b => b.type || '' },
        { header: 'Target', accessor: b => b.target },
        { header: 'Frequency', accessor: b => b.frequency || '' },
        { header: 'User ID', accessor: b => (b as { userId?: number }).userId ?? '' },
    ]);
}

/** Format ISO date pour les noms de fichiers (YYYY-MM-DD) */
export function dateForFilename(): string {
    return new Date().toISOString().slice(0, 10);
}
