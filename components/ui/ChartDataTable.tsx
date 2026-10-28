// components/ui/ChartDataTable.tsx
// [A11Y-CHARTS] — alternative TEXTUELLE (sr-only) à un graphe Recharts (WCAG 1.1.1 Non-text Content, A).
// Un <ResponsiveContainer>/SVG Recharts est OPAQUE pour les lecteurs d'écran : les données ne sont
// lisibles qu'à l'œil. Ce composant rend les MÊMES données en <table> sr-only (caption + en-têtes +
// lignes formatées) → un utilisateur SR « lit » le graphe. Zéro impact visuel (classe `sr-only`).
//
// Échantillonnage : un graphe de projection a ~360 points mensuels — tout lire serait noyé. On
// échantillonne UNIFORMÉMENT à `maxRows` lignes (premier + dernier toujours inclus), et la caption
// indique l'échantillonnage. Le formatage de chaque colonne est délégué à l'appelant (qui sait
// formater $ / dates / % et gérer le mode privé en renvoyant « Montant masqué »).
import React from 'react';

export interface ChartDataColumn {
    /** Clé dans la ligne de données. */
    key: string;
    /** En-tête de colonne (lu par le SR). */
    label: string;
    /** Formateur de cellule (défaut : String(valeur)). Gère $/date/%/privacy côté appelant. */
    format?: (value: unknown, row: Record<string, unknown>) => string;
}

interface ChartDataTableProps {
    /** Décrit ce que le graphe montre (ex. « Évolution du patrimoine par compte »). OBLIGATOIRE. */
    caption: string;
    columns: ChartDataColumn[];
    rows: ReadonlyArray<Record<string, unknown>>;
    /** Nombre max de lignes annoncées (échantillonnage uniforme). Défaut 40. */
    maxRows?: number;
}

/** Échantillonne `rows` à au plus `maxRows` éléments, en gardant toujours le premier et le dernier. */
function sampleRows<T>(rows: ReadonlyArray<T>, maxRows: number): { sampled: T[]; isSampled: boolean } {
    if (rows.length <= maxRows) return { sampled: rows.slice(), isSampled: false };
    const step = (rows.length - 1) / (maxRows - 1);
    const out: T[] = [];
    const seen = new Set<number>();
    for (let i = 0; i < maxRows; i++) {
        const idx = Math.round(i * step);
        if (!seen.has(idx)) { seen.add(idx); out.push(rows[idx]); }
    }
    return { sampled: out, isSampled: true };
}

export const ChartDataTable: React.FC<ChartDataTableProps> = ({ caption, columns, rows, maxRows = 40 }) => {
    const { sampled, isSampled } = sampleRows(rows, maxRows);
    return (
        <table className="sr-only">
            <caption>
                {caption}
                {isSampled
                    ? ` — tableau de données accessible (${sampled.length} points échantillonnés sur ${rows.length}).`
                    : ' — tableau de données accessible.'}
            </caption>
            <thead>
                <tr>
                    {columns.map((c) => (
                        <th key={c.key} scope="col">{c.label}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {sampled.map((row, i) => (
                    <tr key={i}>
                        {columns.map((c, j) => {
                            const raw = row[c.key];
                            const text = c.format ? c.format(raw, row) : String(raw ?? '');
                            // 1re colonne = en-tête de ligne (scope=row) pour la navigation tabulaire SR.
                            return j === 0
                                ? <th key={c.key} scope="row">{text}</th>
                                : <td key={c.key}>{text}</td>;
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
    );
};
