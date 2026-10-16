/**
 * [BANDEAU-INSTALL-BARRE-NAV] Sur téléphone, le bandeau « Installer FinanceAI » doit se poser AU-DESSUS
 * de la barre de navigation du bas (76 px + zone sûre) ; sur grand écran, position d'origine (bottom-4).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../hooks/usePwaInstallPrompt', () => ({
    usePwaInstallPrompt: () => ({ canInstall: true, promptInstall: vi.fn(), dismissForNow: vi.fn() }),
}));

import { PwaInstallBanner } from '../../components/PwaInstallBanner';

describe('[BANDEAU-INSTALL-BARRE-NAV] position du bandeau d\'installation', () => {
    it('remonte au-dessus de la barre du bas sur mobile, bottom-4 sur grand écran', () => {
        render(<PwaInstallBanner />);
        const zone = screen.getByRole('region', { name: 'Installer FinanceAI comme application' });
        expect(zone.className).toContain('bottom-[calc(76px+env(safe-area-inset-bottom)+0.75rem)]');
        expect(zone.className).toContain('lg:bottom-4');
        expect(zone.className).not.toMatch(/(^|\s)bottom-4(\s|$)/);
    });
});
