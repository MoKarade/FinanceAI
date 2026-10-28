// [A11Y-TAXBRACKET] — le graphe de tranches d'imposition doit être lisible au lecteur d'écran :
//   (a) barres = role="img" + aria-label (WCAG 1.1.1 A) + <ChartDataTable> sr-only ;
//   (b) titre de juridiction = <h3> (pas de saut h2→h4, WCAG 1.3.1 A) ;
//   (c) plus aucun text-ink-500 (4,14:1 < 4,5, WCAG 1.4.3 AA) sur du contenu actif.
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TaxBracketViz } from '../../components/TaxBracketViz';

describe('[A11Y-TAXBRACKET] TaxBracketViz', () => {
    it('(a) chaque barre de juridiction est un role="img" avec aria-label descriptif', () => {
        const { container } = render(<TaxBracketViz year={2026} annualGrossIncome={90000} />);
        const imgs = container.querySelectorAll('[role="img"]');
        expect(imgs.length).toBe(2); // Fédéral + Québec
        for (const img of imgs) {
            const label = img.getAttribute('aria-label') ?? '';
            expect(label).toContain("tranches d'imposition");
            expect(label).toContain('taux marginal');
            expect(label).toContain('Revenu brut'); // label dynamique, pas générique
        }
        // ÉLEVÉ-1 : le contenu visuel interne est masqué au SR (aria-hidden), en plus du role="img".
        expect(container.querySelectorAll('[role="img"] [aria-hidden="true"]').length).toBe(2);
    });

    it('(a) fournit une alternative textuelle sr-only (ChartDataTable) avec les paliers', () => {
        const { container } = render(<TaxBracketViz year={2026} annualGrossIncome={90000} />);
        const srTables = container.querySelectorAll('table.sr-only');
        expect(srTables.length).toBe(2); // une par juridiction
        const captions = Array.from(container.querySelectorAll('caption')).map((c) => c.textContent ?? '');
        expect(captions.some((c) => c.includes("paliers d'imposition"))).toBe(true);
        // En-têtes de colonnes accessibles.
        expect(container.querySelectorAll('th[scope="col"]').length).toBeGreaterThanOrEqual(4); // 2 col × 2 tables
    });

    it('(b) le titre de juridiction est un <h3> (pas de saut depuis le <h2> de la Card)', () => {
        const { container } = render(<TaxBracketViz year={2026} annualGrossIncome={90000} />);
        expect(container.querySelectorAll('h3').length).toBe(2);   // Fédéral + Québec
        expect(container.querySelectorAll('h4').length).toBe(0);   // plus de saut h2→h4
    });

    it('(c) plus aucun text-ink-500 (échec AA) dans le rendu', () => {
        const { container } = render(<TaxBracketViz year={2026} annualGrossIncome={90000} label="brut annuel" />);
        expect(container.innerHTML).not.toContain('ink-500');
        expect(container.innerHTML).toContain('ink-400'); // prouve le remplacement, pas juste l'absence
    });
});
