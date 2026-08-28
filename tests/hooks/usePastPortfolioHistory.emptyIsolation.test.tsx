// [HISTORY-OBJET-VIDE-PARTAGE] Troisième site de la classe — celui que le ticket ne nommait pas.
//
// `usePastPortfolioHistory` renvoyait, sur le chemin « aucun actif », une constante de MODULE.
// Une constante de module est partagée par TOUTES les instances du hook et tous les rendus : un
// tri ou un `push` posé sur `points` par n'importe quel consommateur y restait pour la vie du
// processus, et chaque montage suivant sans actif héritait de ces données fantômes.
//
// ⚠️ Pourquoi ça ne se voit nulle part aujourd'hui : les consommateurs actuels
// (`useSimulationParams`, `FutureProjection`) lisent `points` sans le muter. La garde est donc
// PRÉVENTIVE — et c'est exactement ce que le ticket demandait, puisque le premier tri d'affichage
// ajouté sur cette liste empoisonnerait le chemin vide sans qu'aucun test existant ne rougisse.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../../services/marketData', () => ({
    getHistory: vi.fn().mockResolvedValue([]),
    configureMarketDataProvider: vi.fn(),
}));
vi.mock('../../services/errorLogger', () => ({ logError: vi.fn() }));

import { usePastPortfolioHistory, _resetPastHistoryFetchCache } from '../../hooks/usePastPortfolioHistory';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { PortfolioHistoryPoint } from '../../services/history/reconstructPortfolioHistory';

const pointFantome = { date: '1999-12-31', monthIndex: -999, CELI: 42, CELIAPP: 0, REER: 0, REEE: 0, NonReg: 0, Crypto: 0, InvestedValue: 42 } as PortfolioHistoryPoint;

describe('[HISTORY-OBJET-VIDE-PARTAGE] usePastPortfolioHistory — le résultat « aucun actif » n\'est pas partagé', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        _resetPastHistoryFetchCache();
        act(() => {
            useFinanceStore.setState({ assets: [], fxRates: { USD: 1.35, EUR: 1.5, CAD: 1 }, isTestMode: false, apiKeys: { anthropic: '', finnhub: '' } });
        });
    });

    it('deux montages sans actif rendent des tableaux `points` DISTINCTS', () => {
        const a = renderHook(() => usePastPortfolioHistory());
        const b = renderHook(() => usePastPortfolioHistory());
        // Anti-vacuité : les deux sont bien sur le chemin « aucun actif ».
        expect(a.result.current.points).toHaveLength(0);
        expect(b.result.current.points).toHaveLength(0);
        expect(a.result.current.points).not.toBe(b.result.current.points);
    });

    it('polluer `points` d\'un montage ne contamine PAS le montage suivant', () => {
        const pollue = renderHook(() => usePastPortfolioHistory());
        (pollue.result.current.points as PortfolioHistoryPoint[]).push(pointFantome);
        // Anti-vacuité : la mutation a bien atteint le tableau rendu par le hook.
        expect(pollue.result.current.points).toHaveLength(1);

        const propre = renderHook(() => usePastPortfolioHistory());
        expect(propre.result.current.points).toHaveLength(0);
    });
});
