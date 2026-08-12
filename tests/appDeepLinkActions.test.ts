// tests/appDeepLinkActions.test.ts
//
// [ASSISTANT-HUB — Test C du plan architect] Le deep-link `#ACTIONS` (bookmark/lien partagé d'avant
// la fusion) doit REDIRIGER vers ASSISTANT — jamais un 404 silencieux (l'onglet ACTIONS n'existe
// plus dans l'enum). App.tsx n'est pas rendable en test (providers lourds) → verrou par TEST-SCAN
// du source, volume prouvé (convention FISC-CONST-LINT / leçon « App non-rendable »).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Tab } from '../types';

const src = readFileSync(resolve(process.cwd(), 'App.tsx'), 'utf8');

describe('deep-link #ACTIONS → ASSISTANT (App.tsx, scan du source)', () => {
    it('volume prouvé : le fichier scanné est bien App.tsx entier', () => {
        expect(src.length).toBeGreaterThan(5000);
        expect(src).toContain('applyHash');
    });

    it('le redirect explicite existe AVANT le check générique (hash ACTIONS → Tab.ASSISTANT + URL réécrite)', () => {
        const redirectIdx = src.indexOf("hash === 'ACTIONS'");
        const genericIdx = src.indexOf('Object.values(Tab).includes(hash');
        expect(redirectIdx).toBeGreaterThan(-1);
        expect(genericIdx).toBeGreaterThan(-1);
        expect(redirectIdx).toBeLessThan(genericIdx); // sinon le check générique rejette ACTIONS en silence
        const redirectBlock = src.slice(redirectIdx, redirectIdx + 400);
        expect(redirectBlock).toContain('setActiveTab(Tab.ASSISTANT)');
        expect(redirectBlock).toContain("replaceState(null, '', '#ASSISTANT')");
    });

    it('ACTIONS a bien disparu de l\'enum Tab (le redirect est le SEUL chemin restant)', () => {
        expect(Object.values(Tab)).not.toContain('ACTIONS');
        expect(Object.values(Tab)).toContain('ASSISTANT');
    });
});

// [REFONTE-NAV Lot 1] Même verrou pour #DASHBOARD → #FUTURE. Différence CRITIQUE avec ACTIONS :
// DASHBOARD est ENCORE dans l'enum Tab (TAB_LABELS est un Record<Tab, …>, alias conservé) — si le
// redirect passait APRÈS le check générique, `Object.values(Tab).includes('DASHBOARD')` accepterait
// le hash et afficherait un onglet sans route (écran vide silencieux).
describe('deep-link #DASHBOARD → FUTURE (App.tsx, scan du source)', () => {
    it('le redirect explicite existe AVANT le check générique (hash DASHBOARD → Tab.FUTURE + URL réécrite)', () => {
        const redirectIdx = src.indexOf("hash === 'DASHBOARD'");
        const genericIdx = src.indexOf('Object.values(Tab).includes(hash');
        expect(redirectIdx).toBeGreaterThan(-1);
        expect(genericIdx).toBeGreaterThan(-1);
        expect(redirectIdx).toBeLessThan(genericIdx);
        const redirectBlock = src.slice(redirectIdx, redirectIdx + 400);
        expect(redirectBlock).toContain('setActiveTab(Tab.FUTURE)');
        expect(redirectBlock).toContain("replaceState(null, '', '#FUTURE')");
    });

    it('aucune route DASHBOARD ne survit dans TabRouter (la page est dé-routée, pas cachée)', () => {
        const router = readFileSync(resolve(process.cwd(), 'components/TabRouter.tsx'), 'utf8');
        expect(router.length).toBeGreaterThan(3000); // volume prouvé
        expect(router).not.toContain('activeTab === Tab.DASHBOARD');
    });
});
