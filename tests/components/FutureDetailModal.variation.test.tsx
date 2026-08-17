/**
 * [PASSE-REEL-VARIATION-DU-JOUR] Le rendu de la ventilation dans le panneau du jour.
 *
 * ⚠️ CE QUI EST EN JEU ICI, et que les tests du service ne couvrent PAS : un service juste dont
 * personne n'affiche la sortie est la définition d'une feature qui n'existe pas
 * (`UX-UNREACHABLE-FEATURE`). Ces tests portent donc sur l'ATTEIGNABILITÉ et sur les deux
 * contraintes attachées au choix de Marc (section fermée par défaut, mais état persisté et titre
 * autonome) — sans elles, « repliable » devient « invisible ».
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { FutureDetailModal } from '../../components/projection/FutureDetailModal';
import type { DayVariationResult } from '../../services/history/dayVariation';
import type { ProjectionChartPoint } from '../../services/projection/types';

vi.mock('recharts', async () => {
    const R = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => R.createElement('div', null, children);
    return {
        ResponsiveContainer: P, ComposedChart: P, Area: () => null, XAxis: () => null,
        YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null, ReferenceDot: () => null,
    };
});

const JOUR = '2026-08-10';
const point = { monthIndex: 0, year: 2026, dateLabel: 'août 2026', NetWorth: 1_000 } as unknown as ProjectionChartPoint;

const variation = (o: Partial<DayVariationResult> = {}): DayVariationResult => ({
    deltaNetWorth: 1_500,
    sources: [
        { cle: 'tresorerie', montant: -200 },
        { cle: 'rendement', montant: 1_700 },
        { cle: 'immobilier', montant: 0 },
        { cle: 'dettes', montant: 0 },
    ],
    residuel: 0,
    depotsInternes: 0,
    immobilierEstPalier: false,
    ...o,
});

const rendre = (v: DayVariationResult | null) =>
    render(
        <FutureDetailModal
            point={point}
            chartData={[point]}
            transactions={[]}
            dayIso={JOUR}
            variation={v}
            onClose={vi.fn()}
        />,
    );

const texte = () => (document.body.textContent || '').replace(/\s+/g, '');

beforeEach(() => {
    localStorage.clear();
});

describe('[PASSE-REEL-VARIATION-DU-JOUR] la section est atteignable et honnête', () => {
    it('le titre porte le MONTANT : la valeur est lisible SANS déplier', () => {
        rendre(variation());
        // ⚠️ C'est ce qui rend le repli acceptable. Sans montant au titre, une section fermée par
        // défaut cache l'information au lieu de la ranger.
        expect(texte()).toContain('Variationdupatrimoinecejour-là');
        expect(texte()).toContain('1500');
    });

    it('FERMÉE par défaut : le détail des sources n’est pas rendu', () => {
        rendre(variation());
        expect(screen.queryByText('Rendement des placements')).toBeNull();
        expect(screen.getByRole('button', { name: /Variation du patrimoine/ }).getAttribute('aria-expanded')).toBe('false');
    });

    it('un clic déplie et montre les sources non nulles', async () => {
        rendre(variation());
        await userEvent.click(screen.getByRole('button', { name: /Variation du patrimoine/ }));
        expect(screen.getByText('Rendement des placements')).toBeTruthy();
        expect(screen.getByText('Encaissé / décaissé')).toBeTruthy();
        // Les sources à zéro ne sont PAS listées — sinon la section devient illisible.
        expect(screen.queryByText('Équité immobilière')).toBeNull();
    });

    // ⚠️ Contrainte attachée à la décision de Marc. Sans persistance, « repliable » devient
    // « toujours fermée » : il faudrait redéplier à chaque ouverture, et personne ne le fait deux fois.
    it('l’état déplié est PERSISTÉ d’une ouverture à l’autre', async () => {
        const { unmount } = rendre(variation());
        await userEvent.click(screen.getByRole('button', { name: /Variation du patrimoine/ }));
        unmount();

        rendre(variation());
        expect(
            screen.getByRole('button', { name: /Variation du patrimoine/ }).getAttribute('aria-expanded'),
            'le choix de Marc ne doit pas être à refaire à chaque ouverture',
        ).toBe('true');
    });
});

describe('[PASSE-REEL-VARIATION-DU-JOUR] ce qui est dit, et ce qui se tait', () => {
    it('le RÉSIDUEL est affiché, jamais noyé', async () => {
        rendre(variation({ residuel: 4_200 }));
        await userEvent.click(screen.getByRole('button', { name: /Variation du patrimoine/ }));
        expect(screen.getByText('Non expliqué')).toBeTruthy();
        expect(texte()).toContain('4200');
    });

    it('sans résiduel, aucune ligne « Non expliqué » (pas de bruit permanent)', async () => {
        rendre(variation({ residuel: 0 }));
        await userEvent.click(screen.getByRole('button', { name: /Variation du patrimoine/ }));
        // Garde ANTI-SUR-CORRECTIF : sans elle, afficher TOUJOURS « Non expliqué : 0 $ » resterait vert.
        expect(screen.queryByText('Non expliqué')).toBeNull();
    });

    it('les dépôts internes sont dits HORS du total, avec leur raison', async () => {
        rendre(variation({ depotsInternes: 5_000 }));
        await userEvent.click(screen.getByRole('button', { name: /Variation du patrimoine/ }));
        expect(texte()).toContain('nechangepastonpatrimoine');
    });

    it('un palier immobilier est signalé comme ANNUEL', async () => {
        rendre(variation({ immobilierEstPalier: true, sources: [{ cle: 'immobilier', montant: 12_000 }] }));
        await userEvent.click(screen.getByRole('button', { name: /Variation du patrimoine/ }));
        expect(texte()).toContain('parpalier');
    });

    // Une variation est une DIFFÉRENCE : sans veille, on n'affirme rien — surtout pas 0 $.
    it('sans ventilation calculable, AUCUNE section', () => {
        rendre(null);
        expect(screen.queryByRole('button', { name: /Variation du patrimoine/ })).toBeNull();
        expect(texte()).not.toContain('Variationdupatrimoine');
    });
});
