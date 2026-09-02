// tests/components/planningToastPrivacy.test.tsx
//
// [HOOKS-EXHAUSTIVE-DEPS-WARN] Le mode discret doit survivre à une FERMETURE MÉMORISÉE.
//
// Le défaut mesuré avant ce lot : `handlePinSub` et `handleDismissSub` appelaient
// `maskPayee(sub.payee, isPrivacyMode)` sans déclarer `isPrivacyMode` en dépendance. Activer le
// mode discret ne change ni `pinnedSubs` ni `setAppState` — la fonction n'était donc pas recréée et
// gardait l'ancienne valeur. Résultat mesuré : le bouton s'appelait « Épingler Marchand masqué »
// (le JSX, lui, était à jour) et le toast déclenché par ce même clic annonçait « Netflix ».
//
// ⚠️ C'est exactement le correctif de vie privée #645 (« masquer AUSSI les toasts : une
// notification est du texte rendu ») annulé par une fermeture périmée — l'écran était masqué, et
// l'app criait le marchand au moment précis où l'utilisateur interagit devant quelqu'un.
//
// La garde vise le FAIT (ce qui sort du toast), jamais la forme du tableau de dépendances : elle
// resterait juste si le composant cessait d'utiliser `useCallback`.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Planning } from '../../components/Planning';
import { showToast } from '../../components/ui/Toast';
import { useFinanceStore } from '../../store/useFinanceStore';
import { MASKED_PAYEE_LABEL } from '../../utils/privacyAria';
import type { Transaction } from '../../types';

vi.mock('../../services/claude', () => ({ detectSubscriptionsAI: vi.fn() }));
vi.mock('../../components/ui/Toast', () => ({ showToast: vi.fn() }));

// 3 débits mensuels stables au même marchand → détecté comme abonnement récurrent.
const TX: Transaction[] = [
    { id: 1, date: '2026-05-05', payee: 'Netflix', amount: -18, category: 'Loisirs', status: 'processed' },
    { id: 2, date: '2026-06-05', payee: 'Netflix', amount: -18, category: 'Loisirs', status: 'processed' },
    { id: 3, date: '2026-07-05', payee: 'Netflix', amount: -18, category: 'Loisirs', status: 'processed' },
] as unknown as Transaction[];

// ⚠️ Le store est PARTAGÉ entre les cas de ce fichier : sans remise à zéro, un cas qui active le
// mode discret contamine les suivants, et surtout l'abonnement ÉPINGLÉ par le premier cas survit —
// le bouton devient « Désépingler » et le cas suivant mesure autre chose que ce qu'il annonce.
// (Mesuré : c'est la contre-épreuve qui a rougi, pas les cas qu'elle contrôle.)
afterEach(() => {
    act(() => {
        useFinanceStore.getState().setPrivacyMode(false);
        useFinanceStore.getState().setAppState({ subscriptions: [], dismissedSubscriptions: [] });
    });
    vi.clearAllMocks();
});

const boutonPar = (motif: RegExp): HTMLElement => {
    const el = screen.getAllByRole('button').find((b) => motif.test(b.getAttribute('aria-label') ?? ''));
    if (!el) throw new Error(`aucun bouton dont l’aria-label matche ${motif}`);
    return el;
};

describe('[HOOKS-EXHAUSTIVE-DEPS-WARN] le toast des abonnements suit le mode discret COURANT', () => {
    it('mode discret activé APRÈS le montage : « Épingler » ne dit pas le marchand', () => {
        render(<Planning transactions={TX} />);
        // Anti-vacuité : l'abonnement est bien détecté et lisible AVANT le masquage — sans ça, le
        // reste du test pourrait passer sur un écran vide.
        expect(screen.getByText('Netflix')).toBeInTheDocument();

        act(() => { useFinanceStore.getState().setPrivacyMode(true); });
        // L'écran suit (il n'a jamais eu le défaut) — c'est le contraste qui rendait le bug invisible.
        expect(screen.queryByText('Netflix')).not.toBeInTheDocument();

        fireEvent.click(boutonPar(/Épingler/i));
        const texte = String(vi.mocked(showToast).mock.calls[0]?.[0] ?? '');
        expect(texte, 'le toast d’épinglage a gardé le mode discret d’AVANT').not.toContain('Netflix');
        expect(texte).toContain(MASKED_PAYEE_LABEL);
    });

    it('mode discret activé APRÈS le montage : « Pas un abo » ne dit pas le marchand', () => {
        render(<Planning transactions={TX} />);
        expect(screen.getByText('Netflix')).toBeInTheDocument();

        act(() => { useFinanceStore.getState().setPrivacyMode(true); });
        fireEvent.click(boutonPar(/n'est pas un abonnement/i));
        const texte = String(vi.mocked(showToast).mock.calls[0]?.[0] ?? '');
        expect(texte, 'le toast d’écartement a gardé le mode discret d’AVANT').not.toContain('Netflix');
        expect(texte).toContain(MASKED_PAYEE_LABEL);
    });

    // CONTRE-ÉPREUVE : hors mode discret, le marchand doit rester LISIBLE. Sans ce cas, masquer
    // tout inconditionnellement rendrait les deux tests ci-dessus verts.
    it('sans mode discret, le toast nomme bien le marchand', () => {
        render(<Planning transactions={TX} />);
        fireEvent.click(boutonPar(/Épingler/i));
        expect(String(vi.mocked(showToast).mock.calls[0]?.[0] ?? '')).toContain('Netflix');
    });
});
