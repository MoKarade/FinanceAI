/**
 * @vitest-environment jsdom
 *
 * D2 (activation) — recharger en plein onboarding repartait à l'étape 1 et perdait
 * les champs (state useState non persisté). Ces tests verrouillent la persistance
 * du brouillon (étape restaurée au remontage) et son nettoyage à la fin, ainsi que
 * la NON-persistance de la clé API (secret).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Onboarding } from '../../components/Onboarding';

beforeEach(() => { localStorage.clear(); cleanup(); });

const DRAFT_KEY = 'financeai_onboarding_draft';

describe('Onboarding — persistance du brouillon (D2)', () => {
    it('restaure l\'étape après un remontage (rechargement), sans persister la clé API', () => {
        const { unmount } = render(<Onboarding onComplete={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /C'est parti/i })); // welcome → profile
        expect(screen.getByText(/Ton profil/i)).toBeInTheDocument();

        const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
        expect(draft.step).toBe('profile');
        expect(draft).not.toHaveProperty('anthropicKey'); // secret jamais persisté

        unmount();
        render(<Onboarding onComplete={vi.fn()} />);
        expect(screen.getByText(/Ton profil/i)).toBeInTheDocument(); // restauré, pas retour à welcome
    });

    it('nettoie le brouillon à la fin de l\'onboarding', () => {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ step: 'investing' }));
        const onComplete = vi.fn();
        render(<Onboarding onComplete={onComplete} />);
        fireEvent.click(screen.getByRole('button', { name: /Lancer FinanceAI/i }));
        expect(onComplete).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    });
});
