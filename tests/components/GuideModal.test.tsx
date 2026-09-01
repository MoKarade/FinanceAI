import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuideModal } from '../../components/GuideModal';
import { Tab } from '../../types';

describe('GuideModal', () => {
    // [REFONTE-NAV Lot 1] Tab.DASHBOARD n'est plus routé → le guide se teste sur Futur.
    it('affiche le titre du Futur quand activeTab = FUTURE', () => {
        render(<GuideModal activeTab={Tab.FUTURE} onClose={() => {}} />);
        expect(screen.getByRole('heading', { level: 2, name: /Machine a Voyager/i })).toBeInTheDocument();
    });

    it('appelle onClose quand on clique sur le bouton fermer', async () => {
        // ⚠️ Ce test visait `/Fermer le guide/` — le libellé de l'ancien bouton écrit à la main. La
        // migration vers `ui/Modal` l'a fait rougir alors que RIEN de ce qu'il défend n'avait bougé :
        // il mesurait la FORME. Il vise désormais le bouton de fermeture DU DIALOGUE, quel que soit
        // son libellé (`UNE-GARDE-ANCRE-LE-FAIT-JAMAIS-LA-FORME-QU-AVAIT-LE-CODE`).
        const onClose = vi.fn();
        const user = userEvent.setup();
        render(<GuideModal activeTab={Tab.FUTURE} onClose={onClose} />);

        const dialogue = screen.getByRole('dialog');
        const closeBtn = within(dialogue).getByRole('button', { name: /Fermer/i });
        await user.click(closeBtn);
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('[A11Y-MODAL-GUIDE-NODIALOG] EST un dialogue, et il est nommé', async () => {
        // ⚠️ Le guide était un `<div>` par-dessus l'app : rien ne disait à un lecteur d'écran que le
        // reste était hors d'atteinte, et la tabulation y descendait. Il est atteignable au clavier
        // (palette Cmd+K), donc le cas n'était pas théorique.
        const onClose = vi.fn();
        render(<GuideModal activeTab={Tab.FUTURE} onClose={onClose} />);

        const dialogue = screen.getByRole('dialog');
        expect(dialogue.getAttribute('aria-modal'), 'sans aria-modal, la page en dessous reste annoncée').toBe('true');
        // Nommé PAR son titre : un dialogue anonyme s'annonce « dialogue », ce qui n'apprend rien.
        const titreId = dialogue.getAttribute('aria-labelledby');
        expect(titreId, 'dialogue sans nom accessible').toBeTruthy();
        expect(document.getElementById(titreId as string)?.textContent).toMatch(/Machine a Voyager/i);

        // Échap ferme — c'est ce que la version manuelle n'avait pas, et ce qu'on attend d'un dialogue.
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });

    it('rend le markdown bold de façon sûre (anti-XSS audit 2026-05)', () => {
        // Vérifie que le parser markdown ne crée PAS de noeud HTML brut depuis
        // les `**...**` (refactor sécurité: dangerouslySetInnerHTML supprimé).
        render(<GuideModal activeTab={Tab.FUTURE} onClose={() => {}} />);

        // Les ** dans les strings sont parsés en <strong>, jamais en HTML brut.
        const strongs = document.querySelectorAll('strong');
        expect(strongs.length).toBeGreaterThan(0);

        // Aucun script injecté possible: pas de innerHTML brut.
        const scripts = document.querySelectorAll('script');
        expect(scripts.length).toBe(0);
    });
});
