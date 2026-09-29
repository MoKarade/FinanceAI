/**
 * [S5-REFONTE-PERF] `apresPremierAffichage` : un travail de fond part APRÈS le premier affichage,
 * et s'annule proprement au démontage. Et `html.demarrage` : pas de fondu d'entrée au tout premier
 * affichage, sans jamais figer un indicateur de chargement.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { apresPremierAffichage } from '../../utils/apresPremierAffichage';

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('apresPremierAffichage', () => {
    it('sans requestIdleCallback (jsdom, Safari) : la tâche part après un court délai, pas tout de suite', () => {
        vi.useFakeTimers();
        const tache = vi.fn();
        apresPremierAffichage(tache);
        expect(tache).not.toHaveBeenCalled();
        vi.advanceTimersByTime(300);
        expect(tache).toHaveBeenCalledTimes(1);
    });

    it('annulée avant son départ : la tâche ne part jamais', () => {
        vi.useFakeTimers();
        const tache = vi.fn();
        const annuler = apresPremierAffichage(tache);
        annuler();
        vi.advanceTimersByTime(5000);
        expect(tache).not.toHaveBeenCalled();
    });

    it('avec requestIdleCallback : passe par lui, avec un délai maximal, et l’annule au démontage', () => {
        let rappel: (() => void) | null = null;
        const ric = vi.fn((cb: () => void, opts?: { timeout?: number }) => { rappel = cb; expect(opts?.timeout).toBe(2000); return 7; });
        const cic = vi.fn();
        vi.stubGlobal('requestIdleCallback', ric);
        vi.stubGlobal('cancelIdleCallback', cic);
        const tache = vi.fn();
        const annuler = apresPremierAffichage(tache);
        expect(ric).toHaveBeenCalledTimes(1);
        annuler();
        expect(cic).toHaveBeenCalledWith(7);
        rappel!(); // même si le navigateur rappelait quand même, rien ne part après l'annulation
        expect(tache).not.toHaveBeenCalled();
    });
});

describe('html.demarrage — premier affichage sans fondu d’entrée', () => {
    const racine = resolve(__dirname, '../..');
    const html = readFileSync(resolve(racine, 'index.html'), 'utf8');
    const css = readFileSync(resolve(racine, 'index.css'), 'utf8');
    const entree = readFileSync(resolve(racine, 'index.tsx'), 'utf8');

    it('la classe est posée d’emblée, et retirée au premier geste ou après un délai', () => {
        expect(html).toMatch(/<html[^>]*class="demarrage"/);
        expect(entree).toContain("classList.remove('demarrage')");
        expect(entree).toMatch(/pointerdown/);
        expect(entree).toMatch(/setTimeout\(finDemarrage/);
    });

    it('la règle vise les animations d’ENTRÉE, par une durée nulle (jamais `animation: none`)', () => {
        const bloc = css.slice(css.indexOf('.demarrage .animate-fade-in'), css.indexOf('}', css.indexOf('.demarrage .animate-fade-in')) + 1);
        expect(bloc).toContain('animation-duration: 0s');
        // `none` relancerait l'animation au retrait de la classe : le contenu referait un fondu.
        expect(bloc).not.toMatch(/animation:\s*none/);
        // Un indicateur de chargement doit continuer de tourner pendant le démarrage.
        expect(bloc).not.toMatch(/animate-spin|animate-pulse|skeleton/);
    });
});
