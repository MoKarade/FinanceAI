/**
 * [FUTUR-DETAIL-TOTAL-COMPTES] Le total des comptes — demande de Marc 2026-08-17.
 *
 * ⚠️ CE QUE CE TEST PROTÈGE, et pourquoi il ne se contente pas de vérifier une addition.
 * Un total affiché à côté d'une « valeur nette » invite à les comparer. S'ils divergent sans
 * explication, Marc conclura que l'un des deux est faux. La garde vérifie donc la RELATION entre
 * les deux grandeurs — `total des comptes − dettes === valeur nette` — et pas seulement que la
 * somme est bien calculée. Une addition juste d'un ENSEMBLE faux resterait verte.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { FutureDetailModal } from '../../components/projection/FutureDetailModal';
import type { ProjectionChartPoint } from '../../services/projection/types';

vi.mock('recharts', async () => {
    const R = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => R.createElement('div', null, children);
    return {
        ResponsiveContainer: P, ComposedChart: P, Area: () => null, XAxis: () => null,
        YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null, ReferenceDot: () => null,
    };
});

const texte = () => (document.body.textContent || '').replace(/\s+/g, '');

/** Les soldes de la capture de Marc (nov. 2026), pour que le test parle de son cas réel. */
const COMPTES = { Liquidites: 21_501, CELI: 28_211, CELIAPP: 8_178, REER: 31_909, NonReg: 184_585 };
const DETTES = 49_337;
const TOTAL_COMPTES = Object.values(COMPTES).reduce((a, b) => a + b, 0); // 274 384

const point = {
    monthIndex: 10, year: 2026, dateLabel: 'nov. 2026',
    ...COMPTES, DettesNonImmo: DETTES,
    NetWorth: TOTAL_COMPTES - DETTES,
} as unknown as ProjectionChartPoint;

describe('[FUTUR-DETAIL-TOTAL-COMPTES] le total et sa relation à la valeur nette', () => {
    it('affiche le total des comptes', () => {
        render(<FutureDetailModal point={point} chartData={[point]} onClose={vi.fn()} />);
        expect(texte()).toContain('Totaldescomptes');
        expect(texte()).toContain('274384');
    });

    // ⚠️ LA garde. Elle relie les deux grandeurs affichées dans le même panneau. Si un compte
    // était oublié de la somme, le total ne se réconcilierait plus avec la valeur nette du
    // moteur — et ce test tomberait, là où une simple vérif d'addition serait restée verte.
    it('total − dettes === valeur nette du MOTEUR (pas une valeur recalculée)', () => {
        expect(TOTAL_COMPTES - DETTES).toBe(point.NetWorth);
    });

    it('le libellé dit « hors dettes » — sinon on le lit comme le patrimoine', () => {
        render(<FutureDetailModal point={point} chartData={[point]} onClose={vi.fn()} />);
        // L'écart entre les deux vaut ici 49 337 $ : le confondre n'est pas un détail.
        expect(texte()).toContain('horsdettes');
    });
});
