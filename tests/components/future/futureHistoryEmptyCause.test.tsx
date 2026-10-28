// tests/components/future/futureHistoryEmptyCause.test.tsx
//
// [FUTURE-HISTORY-EMPTY-CAUSE] L'état vide du graphe « Évolution » affirmait « vérifie ta clé
// Finnhub » — une cause que cet écran ne peut PAS connaître : son hook (`usePortfolioHistory`) ne
// fait AUCUN réseau, il dérive du store. Le conseil était faux dans le cas le plus courant : sans
// clé Finnhub, le repli gratuit EST le chemin normal, et on envoyait chercher une clé inexistante.
//
// Il promettait aussi que « la courbe apparaît toute seule quand ils arrivent » — vrai PENDANT la
// synchro, faux après un échec permanent (`UN-MESSAGE-QUI-PROMET-UNE-RESOLUTION-AUTOMATIQUE-EST-
// UNE-AFFIRMATION-SUR-L-AVENIR`, lot 80).
//
// La garde tient les TROIS états, parce que chacun seul se satisfait du mauvais moyen : supprimer
// la promesse casserait le cas « en cours », et l'afficher toujours re-mentirait après un échec.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import FutureHistorySection from '../../../components/future/FutureHistorySection';
import { setHistorySyncReport, clearHistorySyncReport } from '../../../services/history/syncDiagnostics';
import { useFinanceStore } from '../../../store/useFinanceStore';
import type { Asset } from '../../../types';

vi.mock('../../../services/claude', () => ({ detectSubscriptionsAI: vi.fn() }));

const TITRE: Asset = {
    id: 'a1', symbol: 'XEQT.TO', name: 'XEQT', quantity: 10, currentPrice: 30,
    buyPrice: 25, dateBought: '2026-01-05', accountType: 'CELI', currency: 'CAD',
} as unknown as Asset;

beforeEach(() => {
    act(() => { useFinanceStore.getState().setAppState({ assets: [TITRE] }); });
});
afterEach(() => {
    clearHistorySyncReport();
    act(() => {
        useFinanceStore.getState().setAppState({ assets: [] });
        useFinanceStore.getState().setPrivacyMode(false);
    });
});

describe('[FUTURE-HISTORY-EMPTY-CAUSE] l’état vide dit ce qu’il SAIT, jamais ce qu’il suppose', () => {
    it('synchro pas encore finie → la promesse « la courbe apparaît toute seule » est VRAIE ici', () => {
        render(<FutureHistorySection />);
        expect(screen.getByText(/apparaît toute seule/i)).toBeInTheDocument();
        // …et on n'accuse plus une clé dont l'écran ne sait rien.
        expect(screen.queryByText(/clé Finnhub/i)).toBeNull();
    });

    it('synchro finie AVEC échec → la cause vient du diagnostic, pas d’une supposition', () => {
        act(() => {
            setHistorySyncReport({
                at: Date.now(), patchedCount: 0,
                skipped: [{
                    symbol: 'XEQT.TO', reason: 'error',
                    detail: 'Le fournisseur de cours REFUSE la clé API (XEQT.TO) — recharger n\'y changera rien.',
                    detailPrivacySafe: 'Le fournisseur de cours REFUSE la clé API (XEQT.TO) — recharger n\'y changera rien.',
                }],
            });
        });
        render(<FutureHistorySection />);
        expect(screen.getByText(/REFUSE la clé API/i)).toBeInTheDocument();
        // La promesse d'auto-résolution DISPARAÎT : elle serait fausse ici.
        expect(screen.queryByText(/apparaît toute seule/i)).toBeNull();
        expect(screen.getByText(/Diagnostic de synchronisation/i)).toBeInTheDocument();
    });

    it('synchro finie SANS échec → on le dit, sans inventer de coupable', () => {
        act(() => { setHistorySyncReport({ at: Date.now(), patchedCount: 0, skipped: [] }); });
        render(<FutureHistorySection />);
        expect(screen.getByText(/sans erreur signalée/i)).toBeInTheDocument();
        expect(screen.queryByText(/clé Finnhub/i)).toBeNull();
        expect(screen.queryByText(/apparaît toute seule/i)).toBeNull();
    });

    it('mode discret : c’est la variante SANS montant qui est rendue', () => {
        act(() => {
            useFinanceStore.getState().setPrivacyMode(true);
            setHistorySyncReport({
                at: Date.now(), patchedCount: 0,
                skipped: [{
                    symbol: 'XEQT.TO', reason: 'empty',
                    detail: 'ALT répond (cours 123456) mais incompatible avec le prix actuel.',
                    detailPrivacySafe: 'Une variante répond mais son cours est incompatible avec le prix actuel.',
                }],
            });
        });
        render(<FutureHistorySection />);
        expect(screen.getByText(/incompatible avec le prix actuel/i)).toBeInTheDocument();
        expect(screen.queryByText(/123456/)).toBeNull();
    });
});
