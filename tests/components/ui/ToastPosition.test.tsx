/**
 * [TOAST-BARRE-NAV-MOBILE] Sur téléphone, la barre de navigation du bas (76 px + zone sûre) est fixe :
 * le conteneur des notifications doit se poser AU-DESSUS, pas dessous. Sur grand écran, position d'origine.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToastContainer } from '../../../components/ui/Toast';

describe('[TOAST-BARRE-NAV-MOBILE] position des notifications', () => {
    it('sur mobile, remonte au-dessus de la barre du bas ; sur grand écran, bottom-6', () => {
        render(<ToastContainer />);
        const zone = screen.getByRole('region', { name: 'Notifications' });
        expect(zone.className).toContain('bottom-[calc(76px+env(safe-area-inset-bottom)+0.75rem)]');
        expect(zone.className).toContain('lg:bottom-6');
        expect(zone.className).not.toMatch(/(^|\s)bottom-6(\s|$)/);
    });
});
