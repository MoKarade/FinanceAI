// [A11Y-CHARTS] — ChartDataTable rend une alternative texte sr-only à un graphe (WCAG 1.1.1).
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ChartDataTable, type ChartDataColumn } from '../../../components/ui/ChartDataTable';

const columns: ChartDataColumn[] = [
    { key: 'date', label: 'Date' },
    { key: 'val', label: 'Patrimoine', format: (v) => `${v} $` },
];

describe('[A11Y-CHARTS] ChartDataTable', () => {
    it('rend une table sr-only avec caption, en-têtes scope et lignes', () => {
        const rows = [{ date: '2026', val: 100 }, { date: '2027', val: 200 }];
        const { container } = render(<ChartDataTable caption="Évolution du patrimoine" columns={columns} rows={rows} />);
        const table = container.querySelector('table');
        expect(table?.className).toContain('sr-only');               // hors flux visuel
        expect(container.querySelector('caption')?.textContent).toContain('Évolution du patrimoine');
        // En-têtes de colonnes (scope=col) + en-tête de ligne (scope=row sur la 1re colonne).
        expect(container.querySelectorAll('th[scope="col"]').length).toBe(2);
        expect(container.querySelectorAll('th[scope="row"]').length).toBe(2); // une par ligne
        // Le formateur de cellule est appliqué.
        expect(table?.textContent).toContain('100 $');
        expect(table?.textContent).toContain('200 $');
    });

    it('échantillonne uniformément quand rows > maxRows (1er et dernier conservés)', () => {
        const rows = Array.from({ length: 360 }, (_, i) => ({ date: String(i), val: i }));
        const { container } = render(<ChartDataTable caption="Long" columns={columns} rows={rows} maxRows={10} />);
        const bodyRows = container.querySelectorAll('tbody tr');
        expect(bodyRows.length).toBeLessThanOrEqual(10);
        // 1er (0) et dernier (359) toujours présents.
        expect(container.querySelector('caption')?.textContent).toContain('échantillonnés sur 360');
        expect(container.querySelector('tbody tr:first-child th')?.textContent).toBe('0');
        expect(container.querySelector('tbody tr:last-child th')?.textContent).toBe('359');
    });

    it('pas d\'échantillonnage si rows <= maxRows', () => {
        const rows = [{ date: 'a', val: 1 }, { date: 'b', val: 2 }];
        const { container } = render(<ChartDataTable caption="Court" columns={columns} rows={rows} maxRows={40} />);
        expect(container.querySelector('caption')?.textContent).not.toContain('échantillonnés');
        expect(container.querySelectorAll('tbody tr').length).toBe(2);
    });
});
