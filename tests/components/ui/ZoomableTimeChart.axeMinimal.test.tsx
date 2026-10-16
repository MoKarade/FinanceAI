/**
 * [FUTUR-AXE-Y-MINIMAL, FinanceAI#1144] Option `axeYMinimal` de `ZoomableTimeChart` : l'axe Y numérique
 * (55 px) est remplacé par un badge « valeur du dernier point », activé par l'APPELANT seulement
 * (téléphone, tiroir Historique). Défaut inchangé pour les autres usages.
 *
 * jsdom ne donne aucune dimension à recharts : on capture les props reçues à sa frontière (même patron
 * que `FutureProjection.todayValueBadge.test.tsx`) et on teste directement le badge et le total.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import {
    ZoomableTimeChart, BadgeValeurFinale, totalEmpileDernierPoint, type ZoomableSeries,
} from '../../../components/ui/ZoomableTimeChart';

type Props = Record<string, unknown>;
let axes: Props[];
let dots: Props[];

vi.mock('recharts', async () => {
    const React = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: P, ComposedChart: P,
        Area: () => null, Line: () => null, Legend: () => null, Tooltip: () => null,
        CartesianGrid: () => null, XAxis: () => null,
        YAxis: (props: Props) => { axes.push(props); return null; },
        ReferenceDot: (props: Props) => { dots.push(props); return null; },
    };
});

const data = Array.from({ length: 5 }, (_, i) => ({
    date: new Date(2026, 0, i + 1).toISOString(), A: 1000 + i, B: 500 + i,
}));
const series: ZoomableSeries[] = [
    { key: 'A', color: '#10b981', name: 'CELI' },
    { key: 'B', color: '#3b82f6', name: 'REER' },
];

beforeEach(() => { axes = []; dots = []; });

describe('ZoomableTimeChart — option axeYMinimal', () => {
    it('défaut : axe Y visible (largeur 55), aucun badge — les autres usages ne changent pas', () => {
        render(<ZoomableTimeChart data={data} xKey="date" series={series} />);
        expect(axes).toHaveLength(1);
        expect(axes[0].hide).toBeUndefined();
        expect(axes[0].width).toBe(55);
        expect(dots).toHaveLength(0);
    });

    it('axeYMinimal : axe masqué et badge ancré sur le dernier point = somme des aires', () => {
        render(<ZoomableTimeChart data={data} xKey="date" series={series} axeYMinimal />);
        expect(axes).toHaveLength(1);
        expect(axes[0].hide).toBe(true);
        expect(dots).toHaveLength(1);
        expect(dots[0].y).toBe(1004 + 504);
        expect(dots[0].x).toBe(data[4].date);
    });

    it('axeYMinimal sans empilement : pas de badge (le haut de pile n\'a plus de sens)', () => {
        render(<ZoomableTimeChart data={data} xKey="date" series={series} axeYMinimal stacked={false} />);
        expect(axes[0].hide).toBe(true);
        expect(dots).toHaveLength(0);
    });

    it('mode discret : le badge porte « *** », jamais le montant', () => {
        render(<ZoomableTimeChart data={data} xKey="date" series={series} axeYMinimal privacyMode />);
        const shape = dots[0].shape as { props: { value?: string } };
        expect(shape.props.value).toBe('***');
    });
});

describe('totalEmpileDernierPoint — pas de total partiel', () => {
    it('somme les aires du dernier point et ignore les lignes (ex. « Total » superposé)', () => {
        const avecLigne: ZoomableSeries[] = [...series, { key: 'Total', color: '#fff', type: 'line' }];
        expect(totalEmpileDernierPoint([{ A: 1, B: 2, Total: 999 }], avecLigne)).toBe(3);
    });
    it('une série absente ou non finie au dernier point ⇒ null (un trou n\'est pas un 0)', () => {
        expect(totalEmpileDernierPoint([{ A: 1 }], series)).toBeNull();
        expect(totalEmpileDernierPoint([{ A: 1, B: Number.NaN }], series)).toBeNull();
        expect(totalEmpileDernierPoint([{ A: 1, B: null }], series)).toBeNull();
    });
    it('aucune donnée ou aucune aire ⇒ null', () => {
        expect(totalEmpileDernierPoint([], series)).toBeNull();
        expect(totalEmpileDernierPoint([{ A: 1 }], [{ key: 'A', color: '#fff', type: 'line' }])).toBeNull();
    });
});

describe('BadgeValeurFinale — garde no-fake-data', () => {
    it('rend la valeur reçue, à gauche du point, aria-hidden', () => {
        const { container } = render(<svg><BadgeValeurFinale cx={300} cy={80} value="1,5 k$" /></svg>);
        expect(container.querySelector('text')?.textContent).toBe('1,5 k$');
        expect(container.querySelector('g')?.getAttribute('aria-hidden')).toBe('true');
        const rect = container.querySelector('rect');
        expect(Number(rect?.getAttribute('x')) + Number(rect?.getAttribute('width'))).toBeLessThan(300);
    });
    it('coordonnées ou valeur absentes/non finies ⇒ rien', () => {
        for (const p of [{ cx: Number.NaN, cy: 1, value: 'x' }, { cx: 1, cy: undefined, value: 'x' }, { cx: 1, cy: 1, value: '' }]) {
            const { container } = render(<svg><BadgeValeurFinale {...p} /></svg>);
            expect(container.querySelector('g')).toBeNull();
        }
    });
});

describe('câblage : seul le tiroir Historique active l\'option', () => {
    const src = (f: string) => readFileSync(f, 'utf8');
    it('FutureHistorySection la fournit, seulement sur téléphone', () => {
        expect(src('components/future/FutureHistorySection.tsx')).toMatch(/axeYMinimal=\{isNarrowViewport\}/);
    });
    it('les autres appelants de ZoomableTimeChart ne la mentionnent pas (axe inchangé)', () => {
        for (const f of ['components/StockChart.tsx', 'components/Investments.tsx', 'components/investments/StockComparisonModal.tsx']) {
            expect(src(f)).not.toContain('axeYMinimal');
        }
    });
});
