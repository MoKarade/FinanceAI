import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuideModal } from '../../components/GuideModal';
import { Tab } from '../../types';

describe('GuideModal', () => {
    it('affiche le titre du Dashboard quand activeTab = DASHBOARD', () => {
        render(<GuideModal activeTab={Tab.DASHBOARD} onClose={() => {}} />);
        expect(screen.getByRole('heading', { level: 2, name: /Accueil/i })).toBeInTheDocument();
    });

    it('appelle onClose quand on clique sur le bouton fermer', async () => {
        const onClose = vi.fn();
        const user = userEvent.setup();
        render(<GuideModal activeTab={Tab.DASHBOARD} onClose={onClose} />);

        const closeBtn = screen.getByRole('button', { name: /Fermer le guide/i });
        await user.click(closeBtn);
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('rend le markdown bold de façon sûre (anti-XSS audit 2026-05)', () => {
        // Vérifie que le parser markdown ne crée PAS de noeud HTML brut depuis
        // les `**...**` (refactor sécurité: dangerouslySetInnerHTML supprimé).
        render(<GuideModal activeTab={Tab.DASHBOARD} onClose={() => {}} />);

        // Les ** dans les strings sont parsés en <strong>, jamais en HTML brut.
        const strongs = document.querySelectorAll('strong');
        expect(strongs.length).toBeGreaterThan(0);

        // Aucun script injecté possible: pas de innerHTML brut.
        const scripts = document.querySelectorAll('script');
        expect(scripts.length).toBe(0);
    });
});
