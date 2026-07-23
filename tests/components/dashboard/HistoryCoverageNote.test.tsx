/**
 * @vitest-environment jsdom
 */
// [HIST-COVERAGE-TOTAL] Bandeau partagé (Dashboard + Investissements) des approximations de
// couverture de la courbe : libellés HONNÊTES selon l'état réel (findings panel #493).

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HistoryCoverageNote } from '../../../components/dashboard/HistoryCoverageNote';

describe('HistoryCoverageNote', () => {
    it('avec courbe : « compté dans le total à la valeur actuelle » + montant', () => {
        const { container } = render(
            <HistoryCoverageNote hasChart
                noHistorySymbols={[{ symbol: 'GBS.PA', valueCad: 7350 }]}
                partialHistorySymbols={[]} staleTailSymbols={[]} />,
        );
        expect(container.textContent).toContain('compté dans le total à la valeur actuelle');
        expect(container.textContent).toContain('GBS.PA');
    });

    it('[INVEST-CHART-CLEAN] REPLIÉ par défaut (details sans open) — le but même de la PR #495', () => {
        // ⚠️ jsdom n'applique pas le display:none UA d'un details fermé → getByText « voit » le
        // contenu quand même : l'attribut `open` est le SEUL discriminant testable ici.
        const { container } = render(
            <HistoryCoverageNote hasChart
                noHistorySymbols={[{ symbol: 'GBS.PA', valueCad: 7350 }]}
                partialHistorySymbols={[]} staleTailSymbols={[]} />,
        );
        expect(container.querySelector('details')?.open).toBeFalsy();
        expect(container.querySelector('summary')?.textContent).toContain('Couverture des courbes');
    });

    it('[Finding code-reviewer #493] SANS courbe : ne prétend PAS « compté dans le total » (aucun total tracé)', () => {
        // Mesuré : rows vides + bandeau « compté dans le total : X $ » sous un graphe « Aucune
        // donnée » = affirmation sans rien pour l'appuyer.
        const { container } = render(
            <HistoryCoverageNote hasChart={false}
                noHistorySymbols={[{ symbol: 'GBS.PA', valueCad: 7350 }]}
                partialHistorySymbols={[]} staleTailSymbols={[]} />,
        );
        expect(container.textContent).not.toContain('compté dans le total');
        expect(container.textContent).toContain('pas de courbe à tracer');
    });

    it('[Finding silent-failure #493] queue périmée → « historique arrêté … absent du total des derniers jours »', () => {
        const { container } = render(
            <HistoryCoverageNote hasChart
                noHistorySymbols={[]} partialHistorySymbols={[]}
                staleTailSymbols={[{ symbol: 'ARRETE', lastKnownDate: '2026-02-20' }]} />,
        );
        expect(container.textContent).toContain('Historique arrêté');
        expect(container.textContent).toContain('2026-02-20');
        expect(container.textContent).toContain('absent du total des derniers jours');
    });

    it('rien à signaler → aucun rendu', () => {
        const { container } = render(
            <HistoryCoverageNote hasChart noHistorySymbols={[]} partialHistorySymbols={[]} staleTailSymbols={[]} />,
        );
        expect(container.textContent).toBe('');
    });
});
