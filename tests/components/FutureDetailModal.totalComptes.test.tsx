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

/**
 * Premier montant rendu APRÈS un libellé donné, lu sur le DOM.
 * ⚠️ Lire le RENDU et non la fixture est tout l'objet de la correction ci-dessous : une garde qui
 * ne compare que des constantes du test ne peut rien détecter dans le composant.
 */
const montantApres = (libelleSansEspaces: string): number | null => {
    const t = texte();
    const i = t.indexOf(libelleSansEspaces);
    if (i < 0) return null;
    const m = t.slice(i + libelleSansEspaces.length).match(/-?[\d\u202f\u00a0]+/);
    if (!m) return null;
    const n = Number(m[0].replace(/[\u202f\u00a0]/g, ''));
    return Number.isFinite(n) ? n : null;
};

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

    /**
     * ⚠️ CE TEST ÉTAIT TAUTOLOGIQUE, et son commentaire le prétendait discriminant — le pire des
     * deux mondes. Il faisait `expect(TOTAL_COMPTES - DETTES).toBe(point.NetWorth)` sans AUCUN
     * `render()` : trois valeurs de la fixture, construites ensemble quinze lignes plus haut,
     * comparées entre elles. Si le composant oubliait un compte, il restait vert.
     * Il lit désormais le total RENDU — donc ce que le composant a réellement calculé — et le
     * confronte à la valeur nette du moteur.
     */
    it('le total RENDU − dettes === valeur nette du MOTEUR', () => {
        render(<FutureDetailModal point={point} chartData={[point]} onClose={vi.fn()} />);
        const totalRendu = montantApres('Totaldescomptes');
        expect(totalRendu, 'total introuvable dans le rendu — le test serait vacueux').not.toBeNull();
        expect(totalRendu! - DETTES).toBe(point.NetWorth);
    });

    it('le libellé dit « hors dettes » — sinon on le lit comme le patrimoine', () => {
        render(<FutureDetailModal point={point} chartData={[point]} onClose={vi.fn()} />);
        // L'écart entre les deux vaut ici 49 337 $ : le confondre n'est pas un détail.
        expect(texte()).toContain('horsdettes');
    });
});
