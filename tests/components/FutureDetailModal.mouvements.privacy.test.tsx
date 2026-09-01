/**
 * [A11Y-PRIVACY-CHAINES-RESTANTES] Les explications de mouvement d'un compte (« Rendement
 * placements +1 200 $ », « Retrait (argent sorti) −800 $ ») étaient des CHAÎNES portant le montant
 * à l'intérieur. Les deux surfaces qui les affichent enveloppaient donc la phrase ENTIÈRE dans
 * `PrivateAmount` : en mode discret, la ligne devenait « ••• » — icône comprise — et le FAIT
 * disparaissait avec le chiffre.
 *
 * ⚠️ Ce n'était donc PAS une fuite : c'était l'autre moitié de la leçon du lot 56 — garder le FAIT,
 * taire le DÉTAIL. Ces cas défendent les deux sens à la fois, ce qu'aucune des deux formes
 * précédentes ne pouvait faire.
 *
 * Le chemin est gaté par une INTERACTION (il faut cliquer un compte pour ouvrir son historique) :
 * le test compte donc ce geste au lieu de fabriquer l'état à la main.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { FutureDetailModal } from '../../components/projection/FutureDetailModal';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { ProjectionChartPoint } from '../../services/projection/types';

vi.mock('recharts', async () => {
    const R = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => R.createElement('div', null, children);
    return {
        ResponsiveContainer: P, ComposedChart: P, Area: () => null, XAxis: () => null,
        YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null, ReferenceDot: () => null,
        Legend: () => null, Line: () => null, LineChart: P, Bar: () => null, BarChart: P,
    };
});

/** Deux mois de CELI : gain marché ET dépôt, tous deux au-dessus du seuil de 0,50 $. */
const GAIN = 1_234;
const FLOW = 5_678;
const mois = (monthIndex: number): ProjectionChartPoint => ({
    monthIndex,
    year: 2026,
    dateLabel: `mois ${monthIndex}`,
    NetWorth: 100_000 + monthIndex,
    CELI: 50_000 + monthIndex * 1_000,
    MarketGrowthCELI: GAIN,
    NetTransferCELI: FLOW,
} as unknown as ProjectionChartPoint);

const chartData = [mois(0), mois(1), mois(2)];

const monter = () => render(
    <FutureDetailModal
        point={chartData[1]}
        chartData={chartData}
        transactions={[]}
        dayIso={null}
        variation={null}
        onClose={vi.fn()}
    />,
);

/** Ouvre l'historique du CELI — un seul geste depuis l'état par défaut. */
const ouvrirCELI = () => fireEvent.click(screen.getByText('CELI'));

const texte = () => (document.body.textContent ?? '').replace(/[\s  ]+/g, '');

afterEach(() => { useFinanceStore.setState({ isPrivacyMode: false }); });

describe('FutureDetailModal — explications de mouvement', () => {
    it('mode NORMAL : le libellé ET le montant sont affichés (anti-vacuité)', () => {
        monter();
        ouvrirCELI();
        expect(texte()).toContain('Rendementplacements');
        expect(texte()).toContain('1234');
        expect(texte()).toContain('Dépôt(argentajouté)');
        expect(texte()).toContain('5678');
    });

    it('mode DISCRET : le LIBELLÉ survit, le montant disparaît', () => {
        useFinanceStore.setState({ isPrivacyMode: true });
        monter();
        ouvrirCELI();
        const t = texte();
        // Le fait — « il y a eu du rendement, il y a eu un dépôt » — reste lisible. C'est
        // exactement ce que la version « chaîne enveloppée » ne pouvait pas rendre.
        expect(t).toContain('Rendementplacements');
        expect(t).toContain('Dépôt(argentajouté)');
        // Le chiffre, lui, n'est plus dans le DOM du tout (PrivateAmount ne floute pas : il retire).
        expect(t).not.toContain('1234');
        expect(t).not.toContain('5678');
    });
});
