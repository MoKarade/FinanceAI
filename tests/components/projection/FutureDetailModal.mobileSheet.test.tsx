/**
 * [FUTUR-MOBILE-PR5] La modale de détail du mois devient, SUR TÉLÉPHONE, une feuille aux 3/4 de
 * l'écran : contenu CONDENSÉ d'entrée (comptes, écart vs mois précédent DÉJÀ PUBLIÉ par le
 * moteur — `diffNW`, jamais une soustraction locale — et « N événements ce mois-ci »), détail
 * complet (liste exhaustive des événements, catégories, ventilation du jour, transactions)
 * déplié sur demande via le bouton « Détail complet ».
 *
 * ⚠️ Desktop reste EXACTEMENT comme avant PR5 (mandat Marc #13, testé en contrôle négatif) :
 * `useViewportBelowSm` réplie sur `false` sans `matchMedia` (jsdom nu), donc les suites
 * PRÉEXISTANTES de ce composant (categories/variation/transactions/stepDay/focus) restent
 * vertes SANS modification — c'est ce que ce fichier vérifie explicitement.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { FutureDetailModal } from '../../../components/projection/FutureDetailModal';
import { _resetViewportMqlForTests } from '../../../hooks/useViewportBelowSm';
import type { ProjectionChartPoint } from '../../../services/projection/types';
import type { DayVariationResult } from '../../../services/history/dayVariation';

vi.mock('recharts', async () => {
    const R = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => R.createElement('div', null, children);
    return {
        ResponsiveContainer: P, ComposedChart: P, Area: () => null, XAxis: () => null,
        YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null, ReferenceDot: () => null,
    };
});

const stubViewport = (narrow: boolean) => {
    _resetViewportMqlForTests();
    vi.stubGlobal('matchMedia', (q: string) => ({
        media: q, matches: narrow,
        addEventListener: () => {}, removeEventListener: () => {},
    }));
};

afterEach(() => { vi.unstubAllGlobals(); _resetViewportMqlForTests(); });

const point = {
    monthIndex: 1, year: 2026, dateLabel: 'févr. 2026', age: 41,
    NetWorth: 223_110, Liquidites: 50_000, CELI: 50_000,
    diffNW: 1_234,
    lifeEvents: ['🎓 Diplôme'],
    flowEvents: ['💰 Bonus +5000$'],
} as unknown as ProjectionChartPoint;
const prevPoint = { monthIndex: 0, year: 2026, NetWorth: 221_876, Liquidites: 49_000, CELI: 49_000 } as unknown as ProjectionChartPoint;
const chartData = [prevPoint, point];

const variation: DayVariationResult = {
    deltaNetWorth: 1_500,
    sources: [{ cle: 'rendement', montant: 1_500 }],
    residuel: 0, depotsInternes: 0, depotsNonFinances: 0, immobilierEstPalier: false,
};

const rendre = (props: Record<string, unknown> = {}) =>
    render(<FutureDetailModal point={point} chartData={chartData} onClose={vi.fn()} {...props} />);

const dialog = () => screen.getByRole('dialog');

describe('[FUTUR-MOBILE-PR5] FutureDetailModal — desktop inchangé (contrôle négatif)', () => {
    it('conteneur : dialogue centré classique, PAS de feuille', () => {
        rendre();
        expect(dialog().className).toContain('items-center');
        expect(dialog().firstElementChild?.className).toContain('rounded-2xl');
        expect(dialog().firstElementChild?.className).toContain('max-h-[90vh]');
        expect(dialog().firstElementChild?.className).not.toContain('rounded-t-2xl');
    });

    it('aucun bouton « Détail complet », la liste COMPLÈTE des événements est affichée d\'entrée', () => {
        rendre();
        expect(screen.queryByRole('button', { name: 'Détail complet' })).toBeNull();
        expect(screen.getByText(/Diplôme/)).toBeInTheDocument();
        expect(screen.getByText(/Bonus/)).toBeInTheDocument();
        expect(screen.queryByText(/événements ce mois-ci/)).toBeNull();
    });
});

describe('[FUTUR-MOBILE-PR5] FutureDetailModal — feuille 3/4 mobile', () => {
    it('conteneur : feuille ancrée en bas, hauteur 75vh', () => {
        stubViewport(true);
        rendre();
        expect(dialog().className).toContain('items-end');
        expect(dialog().firstElementChild?.className).toContain('rounded-t-2xl');
        expect(dialog().firstElementChild?.className).toContain('h-[75vh]');
    });

    it('condensée : le nombre d\'événements remplace la liste, sans montant ni détail', () => {
        stubViewport(true);
        rendre();
        expect(screen.getByText('2 événements ce mois-ci')).toBeInTheDocument();
        expect(screen.queryByText(/Diplôme/)).toBeNull();
        expect(screen.queryByText(/Bonus/)).toBeNull();
    });

    it('condensée : l\'écart vs mois précédent (diffNW, PUBLIÉ par le moteur) reste visible', () => {
        stubViewport(true);
        rendre();
        expect(screen.getByText('Variation nette (mois)')).toBeInTheDocument();
        // Espace INSÉCABLE dans formatCAD (`\s` de JS la matche aussi) — normaliser avant de comparer.
        const texte = (document.body.textContent ?? '').replace(/\s+/g, '');
        expect(texte).toContain('+1234$');
    });

    it('condensée : la répartition par compte reste visible', () => {
        stubViewport(true);
        rendre();
        expect(screen.getByText('CELI')).toBeInTheDocument();
        expect(screen.getByText(/Cash \(Coussin\)/)).toBeInTheDocument();
    });

    it('un bouton « Détail complet » (44 px) déplie la liste exhaustive des événements', () => {
        stubViewport(true);
        rendre();
        const btn = screen.getByRole('button', { name: 'Détail complet' });
        expect(btn.className).toContain('min-h-[44px]');
        fireEvent.click(btn);
        expect(screen.getByText(/Diplôme/)).toBeInTheDocument();
        expect(screen.getByText(/Bonus/)).toBeInTheDocument();
        expect(screen.queryByText(/événements ce mois-ci/)).toBeNull();
        expect(screen.queryByRole('button', { name: 'Détail complet' })).toBeNull();
    });

    it('« Détail complet » révèle aussi la ventilation du jour (SectionVariationJour), repliée avant', () => {
        stubViewport(true);
        rendre({ dayIso: '2026-02-10', variation, transactions: [] });
        expect(screen.queryByRole('button', { name: /Variation du patrimoine/ })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Détail complet' }));
        expect(screen.getByRole('button', { name: /Variation du patrimoine/ })).toBeInTheDocument();
    });
});
