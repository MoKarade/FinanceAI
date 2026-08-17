/**
 * [FUTUR-DETAIL-STEP-DAY] Aller à la veille / au lendemain SANS quitter le panneau.
 *
 * Demande de Marc (2026-08-17, capture à l'appui) : « dans cette page là j'aimerais aussi pouvoir
 * aller au lendemain ».
 *
 * ⚠️ CE QUI MOTIVE LE TICKET, et c'est mesurable en GESTES. Le panneau était un cul-de-sac : pour
 * voir la journée suivante il fallait (1) le fermer, (2) re-viser au PIXEL sur la courbe — un jour
 * fait ~6 px à ~150 jours affichés — et (3) rouvrir « Détail complet ». Trois gestes dont un au
 * pixel près, pour avancer d'un jour. C'est la classe `UX-UNREACHABLE-FEATURE` : livré, testé,
 * déployé… et hors d'atteinte en pratique. L'infobulle avait déjà ses flèches ; le panneau, non.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

const point = {
    monthIndex: 4, year: 2026, dateLabel: '18 juin 2026', age: 41, NetWorth: 223_110,
} as unknown as ProjectionChartPoint;

const rendre = (props: Record<string, unknown> = {}) =>
    render(
        <FutureDetailModal point={point} chartData={[point]} onClose={vi.fn()} {...props} />,
    );

describe('[FUTUR-DETAIL-STEP-DAY] les flèches du panneau', () => {
    it('Veille et Lendemain appellent onStepDay avec −1 et +1', () => {
        const onStepDay = vi.fn();
        rendre({ onStepDay, canStepPrev: true, canStepNext: true });
        // ⚠️ [WCAG 2.5.3 label-in-name] La requête passe par le TEXTE VISIBLE : un futur aria-label
        // de remplacement (« Jour précédent » seul) casserait ce test comme il casserait la
        // commande vocale. Même convention que les flèches de l'infobulle.
        fireEvent.click(screen.getByRole('button', { name: /Veille/ }));
        fireEvent.click(screen.getByRole('button', { name: /Lendemain/ }));
        expect(onStepDay).toHaveBeenNthCalledWith(1, -1);
        expect(onStepDay).toHaveBeenNthCalledWith(2, 1);
    });

    it('borne atteinte = bouton DÉSACTIVÉ, pas absent', () => {
        // Un bouton qui disparaît fait sauter la géométrie de l'en-tête, et le lecteur d'écran perd
        // l'information « il n'y a simplement pas de veille dans la fenêtre ».
        rendre({ onStepDay: vi.fn(), canStepPrev: false, canStepNext: true });
        expect(screen.getByRole('button', { name: /Veille/ })).toBeDisabled();
        expect(screen.getByRole('button', { name: /Lendemain/ })).toBeEnabled();
    });

    // ⚠️ Anti-sur-correctif : le panneau s'ouvre AUSSI sur un mois (pastille d'événement), où
    // « lendemain » n'a aucun sens. Sans `onStepDay`, aucune flèche ne doit être rendue.
    it('sans onStepDay : aucune flèche (le panneau sert aussi aux MOIS)', () => {
        rendre();
        expect(screen.queryByRole('button', { name: /Veille/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /Lendemain/ })).toBeNull();
    });
});
