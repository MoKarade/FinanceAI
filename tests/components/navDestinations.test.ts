import { describe, it, expect } from 'vitest';
import { NAV_DESTINATIONS, MOBILE_BAR_TABS, destinationOfTab } from '../../components/navDestinations';
import { Tab } from '../../types';

// [REFONTE-NAV Lot 1] Critère de fini de Marc : « rien de perdu ». Cette suite verrouille
// que la source unique des 6 destinations couvre EXACTEMENT les pages routées — un onglet
// routé absent de la nav serait inatteignable en silence (classe UX-UNREACHABLE-FEATURE).

// Tabs volontairement HORS nav : DASHBOARD (Accueil retiré, deep-link redirigé vers FUTURE),
// TRAVEL et LIFE_EVENTS (alias legacy redirigés vers LIFE_PROJECTS par TabRouter).
const UNROUTED: Tab[] = [Tab.DASHBOARD, Tab.TRAVEL, Tab.LIFE_EVENTS];

describe('navDestinations — non-perte (source unique de la nav)', () => {
    it('les 6 destinations couvrent EXACTEMENT tous les onglets routés, sans doublon', () => {
        const covered = NAV_DESTINATIONS.flatMap((d) => d.tabs);
        expect(new Set(covered).size).toBe(covered.length); // aucun onglet dans deux destinations
        const expected = Object.values(Tab).filter((t) => !UNROUTED.includes(t));
        expect([...covered].sort()).toEqual([...expected].sort());
    });

    it('exactement 6 destinations, la première est Futur (la page d\'ouverture)', () => {
        expect(NAV_DESTINATIONS).toHaveLength(6);
        expect(NAV_DESTINATIONS[0].tabs).toEqual([Tab.FUTURE]);
    });

    it('la barre mobile ne contient que des onglets connus de la nav', () => {
        for (const tab of MOBILE_BAR_TABS) {
            expect(destinationOfTab(tab), `l'onglet épinglé ${tab} doit appartenir à une destination`).toBeDefined();
        }
    });

    it('[REFONTE-NAV-L3] split immo : l\'ACTUEL en Config, les PROJETS en Vie (après Projets de vie)', () => {
        expect(destinationOfTab(Tab.REAL_ESTATE)?.id).toBe('CONFIG');
        expect(destinationOfTab(Tab.REAL_ESTATE_PROJECTS)?.id).toBe('VIE');
        const vie = NAV_DESTINATIONS.find((d) => d.id === 'VIE');
        const iLife = vie!.tabs.indexOf(Tab.LIFE_PROJECTS);
        expect(iLife).toBeGreaterThanOrEqual(0);
        expect(vie!.tabs.indexOf(Tab.REAL_ESTATE_PROJECTS)).toBe(iLife + 1);
    });

    it('destinationOfTab retrouve la destination de chaque onglet couvert', () => {
        for (const dest of NAV_DESTINATIONS) {
            for (const tab of dest.tabs) {
                expect(destinationOfTab(tab)?.id).toBe(dest.id);
            }
        }
        expect(destinationOfTab(Tab.DASHBOARD)).toBeUndefined();
    });
});
