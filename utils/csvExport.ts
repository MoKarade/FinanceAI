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
import { useFinanceStore } from '../store/useFinanceStore';

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

/**
 * [PRIV-EXPORT-CSV-CONTRAT] Refus d'exporter en mode discret — même contrat que le PDF
 * (`PdfRefusedPrivacyError`, décision Marc 2026-08-17 dans `docs/decisions.md`).
 *
 * ⚠️ POURQUOI CETTE GARDE MANQUAIT, et pourquoi c'est la MÊME faute. La décision « refuser en mode
 * discret » a été prise pour le PDF, avec cette justification : « un fichier SORT de l'app et
 * SURVIT au mode ». Elle n'a jamais été étendue au CSV — or le CSV est PIRE : il contient le
 * marchand ET le montant, ligne par ligne, alors que le PDF ne porte aucun `payee`. L'écran
 * affichait « ••• » partout pendant que le bouton « Export CSV » fabriquait, en un clic, une copie
 * permanente et intégralement en clair. Trouvé par l'audit vie privée de la PR #645.
 *
 * ⚠️ Au SERVICE, pas au clic : une borne posée dans le composant laisserait passer tout futur
 * appelant (autre bouton, raccourci, outil MCP, script). Même motif que `clampSplitPct`, où la
 * borne UI seule laissait passer un import de sauvegarde.
 */
export class CsvRefusedPrivacyError extends Error {
    constructor() {
        super('Export CSV refusé : le mode discret est actif.');
        this.name = 'CsvRefusedPrivacyError';
    }
}

/**
 * Export transactions au format CSV (preset).
 * @throws {CsvRefusedPrivacyError} si le mode discret est actif.
 */
export function exportTransactionsCSV(transactions: Transaction[]): string {
    // ⚠️ Lu à l'APPEL, pas capturé en amont : le mode a pu être activé entre le rendu du bouton et
    // le clic. Et on refuse AVANT de construire la moindre ligne.
    if (useFinanceStore.getState().isPrivacyMode) throw new CsvRefusedPrivacyError();
    return toCSV<Transaction>(transactions, [
        { header: 'Date', accessor: t => t.date },
        { header: 'Payee', accessor: t => t.payee || '' },
        { header: 'Amount', accessor: t => t.amount },
        { header: 'Category', accessor: t => t.category || '' },
        { header: 'Account', accessor: t => t.accountName || '' },
        { header: 'Is Transfer', accessor: t => t.isTransfer ? 'true' : 'false' },
        { header: 'Is Duplicate', accessor: t => t.isDuplicate ? 'true' : 'false' },
        { header: 'Status', accessor: t => t.status || '' },
        // [REFONTE-NAV-L5, revue #606] Colonne CONSERVÉE lors de la consolidation des deux exports :
        // l'export « vue filtrée » la portait (`Confiance IA`) et sert justement à relire les
        // catégorisations douteuses. Unifier les formats ne doit RIEN retirer — on ajoute au format
        // commun plutôt que de laisser tomber une capacité en silence. Vide (pas 0) si absente :
        // une confiance inconnue n'est pas une confiance nulle.
        { header: 'Confiance IA', accessor: t => (typeof t.confidence === 'number' ? t.confidence : '') },
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
