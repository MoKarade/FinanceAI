import { describe, it, expect } from 'vitest';
import { NAV_GROUPS, MOBILE_BAR_TABS, NAV_TABS_ATTEIGNABLES, PROFILE_TAB, navItemOfTab } from '../../components/navDestinations';
import { Tab } from '../../types';

// [S5-REFONTE-R1] Critère de Marc : « rien de perdu ». La source unique de la nav (trois groupes
// + carte Profil) couvre EXACTEMENT les pages routées — un onglet routé absent de la nav serait
// inatteignable en silence (classe UX-UNREACHABLE-FEATURE).

// Hors nav : DASHBOARD (Accueil retiré, redirigé vers FUTURE), TRAVEL et LIFE_EVENTS (alias legacy
// redirigés vers LIFE_PROJECTS par TabRouter).
const UNROUTED: Tab[] = [Tab.DASHBOARD, Tab.TRAVEL, Tab.LIFE_EVENTS];

describe('navDestinations — non-perte (source unique de la nav)', () => {
    it('la nav couvre EXACTEMENT tous les onglets routés, sans doublon', () => {
        expect(new Set(NAV_TABS_ATTEIGNABLES).size).toBe(NAV_TABS_ATTEIGNABLES.length);
        const expected = Object.values(Tab).filter((t) => !UNROUTED.includes(t));
        expect([...NAV_TABS_ATTEIGNABLES].sort()).toEqual([...expected].sort());
    });

    it('trois groupes Vue / Planifier / Outils ; Futur ouvre la marche', () => {
        expect(NAV_GROUPS.map((g) => g.label)).toEqual(['Vue', 'Planifier', 'Outils']);
        expect(NAV_GROUPS[0].items[0].tab).toBe(Tab.FUTURE);
    });

    it('la barre mobile ne contient que des onglets de la nav', () => {
        for (const tab of MOBILE_BAR_TABS) expect(navItemOfTab(tab)?.tab).toBe(tab);
    });

    it('Immobilier réunit les biens détenus ET les projets d\'achat', () => {
        expect(navItemOfTab(Tab.REAL_ESTATE)?.label).toBe('Immobilier');
        expect(navItemOfTab(Tab.REAL_ESTATE_PROJECTS)?.tab).toBe(Tab.REAL_ESTATE);
    });

    it('le Profil passe par la carte, pas par un groupe', () => {
        expect(navItemOfTab(PROFILE_TAB)).toBeUndefined();
        expect(NAV_TABS_ATTEIGNABLES).toContain(PROFILE_TAB);
        expect(navItemOfTab(Tab.DASHBOARD)).toBeUndefined();
    });
});
