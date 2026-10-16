// [REGLAGES-MOTS-FRANCAIS] Carte 17 : trois mots anglais restaient dans des écrans en français.
//   - « Holdings »        → « Placements »        (carte de répartition des comptes)
//   - « Side income $/an » → « Revenu d'appoint $/an » (profil, section détaillée)
//   - « Cash $ »          → « Liquidités $ »      (paramètres avancés ; voir aussi AdvancedProjectionParams.privacy.test)
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { UserConfigFields } from '../../../components/settings/UserConfigFields';
import { AssetLocationCard } from '../../../components/retirement/AssetLocationCard';

vi.mock('../../../components/ui/Toast', () => ({ showToast: vi.fn() }));

describe('[REGLAGES-MOTS-FRANCAIS] libellés français', () => {
    it('le champ de revenu secondaire dit « Revenu d\'appoint $/an »', () => {
        const { container } = render(<UserConfigFields section="detailed" />);
        expect(container.querySelector('[placeholder="Revenu d\'appoint $/an"]')).not.toBeNull();
        expect(container.querySelector('[placeholder="Side income $/an"]')).toBeNull();
    });

    it('la carte de répartition titre sa liste « Placements », pas « Holdings »', () => {
        const { container } = render(<AssetLocationCard annualGrossIncome={0} />);
        const titres = Array.from(container.querySelectorAll('h4')).map((h) => h.textContent);
        expect(titres).toContain('Placements');
        expect(titres).not.toContain('Holdings');
    });
});
