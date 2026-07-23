/**
 * @vitest-environment jsdom
 */
// tests/components/StockChart.test.tsx
//
// [INVEST-CURVES-LOW] « Certaines courbes trop basses, je les vois pas » : (1) Base 100 sur lignes
// ÉPARSES — la base de CHAQUE série est son premier point FINI (avant : ligne 0 → un titre acheté
// plus tard avait base 0 → courbe FIGÉE À ZÉRO invisible) ; (2) auto-défaut Base 100 quand ≥ 2
// séries d'échelles disparates (> 20×) partagent l'axe $ ; le choix MANUEL de l'utilisateur prime.

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StockChart, seriesScaleDisparity, toPerformanceRows } from '../../components/StockChart';
import type { MarketDataPoint } from '../../services/finance';

const rows: MarketDataPoint[] = [
    { date: '2026-01-01', TOTAL: 200_000, 'XEQT.TO': 30 },
    { date: '2026-01-02', TOTAL: 202_000, 'XEQT.TO': 31, TARD: 50 }, // TARD apparaît plus tard (ligne éparse)
    { date: '2026-01-03', TOTAL: 204_000, 'XEQT.TO': 32, TARD: 55 },
];

describe('seriesScaleDisparity', () => {
    it('TOTAL (200 k$) + titre (30 $) → disparate (échelle $ commune illisible)', () => {
        expect(seriesScaleDisparity(rows, new Set(['TOTAL', 'XEQT.TO']))).toBe(true);
    });
    it('deux titres du même ordre de grandeur → pas disparate ; une seule série → jamais', () => {
        expect(seriesScaleDisparity(rows, new Set(['XEQT.TO', 'TARD']))).toBe(false);
        expect(seriesScaleDisparity(rows, new Set(['TOTAL']))).toBe(false);
    });
});

describe('toPerformanceRows (Base 100 sur lignes éparses)', () => {
    it('base de CHAQUE série = son PREMIER point fini (un titre apparu plus tard ne reste plus figé à 0)', () => {
        const out = toPerformanceRows(rows, new Set(['TOTAL', 'TARD']));
        expect(out[0].TOTAL).toBe(0);                       // base = 200 000 (ligne 0)
        expect(out[0].TARD).toBeNull();                     // pas encore de donnée → trou honnête, PAS 0
        expect(out[1].TARD).toBe(0);                        // base = 50 (SON premier point, ligne 1)
        expect(out[2].TARD).toBeCloseTo(10);                // (55-50)/50 — avant fix : base 0 → courbe morte à 0
        expect(out[2].TOTAL).toBeCloseTo(2);
    });
});

describe('StockChart — auto-défaut Base 100', () => {
    it('séries disparates → démarre DIRECTEMENT en Base 100 (init paresseux, pas de flash $) + aria-pressed', () => {
        render(<StockChart data={rows} visibleKeys={new Set(['TOTAL', 'XEQT.TO'])} />);
        const perf = screen.getByRole('button', { name: 'Base 100 (%)' });
        expect(perf.className).toContain('bg-purple-600');       // auto-défaut actif dès le 1er rendu
        expect(perf).toHaveAttribute('aria-pressed', 'true');    // état exposé aux SR
        expect(screen.getByRole('button', { name: 'Prix ($)' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('[Finding panel #495] le choix MANUEL prime : un re-render avec un NOUVEAU Set équivalent ne réimpose pas l\'auto', () => {
        // Cas réel : chaque toggle de série dans Investments crée un new Set() → l'effet re-tourne.
        // Sans userChoseRef, l'auto réimposerait Base 100 après le choix manuel Prix ($).
        const { rerender } = render(<StockChart data={rows} visibleKeys={new Set(['TOTAL', 'XEQT.TO'])} />);
        fireEvent.click(screen.getByRole('button', { name: 'Prix ($)' }));
        rerender(<StockChart data={[...rows]} visibleKeys={new Set(['TOTAL', 'XEQT.TO'])} />); // nouvelles RÉFÉRENCES
        expect(screen.getByRole('button', { name: 'Prix ($)' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('séries homogènes → démarre en Prix ($)', () => {
        render(<StockChart data={rows} visibleKeys={new Set(['XEQT.TO', 'TARD'])} />);
        expect(screen.getByRole('button', { name: 'Prix ($)' })).toHaveAttribute('aria-pressed', 'true');
    });
});
