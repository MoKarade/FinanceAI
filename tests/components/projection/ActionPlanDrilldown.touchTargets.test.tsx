// [FUTUR-MOBILE-PR5] Plan d'action mobile : « Pourquoi ? » (14 px) et la case « Marquer comme
// fait » (14 px) doivent atteindre 44 px de cible tactile SUR TÉLÉPHONE — desktop INCHANGÉ
// (mandat Marc #13, contrôle négatif).
//
// ⚠️ `useViewportBelowSm` lit `matchMedia`, absent de jsdom nu (replie sur `false` = desktop) —
// on le stube explicitement pour chaque cas, et on réinitialise le singleton du hook entre les
// deux (sinon le second test lirait le `matchMedia` du premier).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActionPlanDrilldown } from '../../../components/projection/ActionPlanDrilldown';
import { _resetViewportMqlForTests } from '../../../hooks/useViewportBelowSm';

const stubViewport = (narrow: boolean) => {
    _resetViewportMqlForTests();
    vi.stubGlobal('matchMedia', (q: string) => ({
        media: q, matches: narrow,
        addEventListener: () => {}, removeEventListener: () => {},
    }));
};

afterEach(() => { vi.unstubAllGlobals(); _resetViewportMqlForTests(); });

// Flux au-dessus du seuil (100 $) sur les deux comptes → deux conseils cochables (dépôt CELI,
// retrait REER) dès la vue racine, sans avoir à creuser.
const makePoints = (months: number) => Array.from({ length: months }, (_, i) => ({
    monthIndex: i, year: 2026 + Math.floor(i / 12), age: 40, isRetired: false,
    dateLabel: `m${i}`, NetWorth: 100_000 + i * 1000,
    NetTransferCELI: 500, NetTransferREER: -100,
}));

const chartData = makePoints(24);

describe('[FUTUR-MOBILE-PR5] ActionPlanDrilldown — cibles tactiles mobile', () => {
    it('desktop (défaut jsdom) : « Pourquoi ? » et la case restent tels quels — AUCUN min-h-[44px]', () => {
        render(<ActionPlanDrilldown chartData={chartData} />);
        const pourquoi = screen.getAllByRole('button', { name: /Pourquoi/ })[0];
        expect(pourquoi.className).not.toContain('min-h-[44px]');
        const checkbox = screen.getAllByRole('checkbox')[0];
        // Le conteneur PARENT immédiat de la case ne porte pas la classe mobile.
        expect(checkbox.parentElement?.className ?? '').not.toContain('min-h-[44px]');
    });

    it('mobile : « Pourquoi ? » atteint min-h-[44px]', () => {
        stubViewport(true);
        render(<ActionPlanDrilldown chartData={chartData} />);
        const pourquoi = screen.getAllByRole('button', { name: /Pourquoi/ })[0];
        expect(pourquoi.className).toContain('min-h-[44px]');
    });

    it('mobile : la case « Marquer comme fait » est enveloppée dans une cible min-h/min-w 44 px', () => {
        stubViewport(true);
        render(<ActionPlanDrilldown chartData={chartData} />);
        const checkbox = screen.getAllByRole('checkbox')[0];
        const wrapper = checkbox.parentElement!;
        expect(wrapper.className).toContain('min-h-[44px]');
        expect(wrapper.className).toContain('min-w-[44px]');
        // La case elle-même garde sa taille visuelle (14 px) — seule la zone cliquable grandit.
        expect(checkbox.className).toContain('h-3.5');
        expect(checkbox.className).toContain('w-3.5');
    });

    // ⚠️ [a11y-auditor, revue de ce lot] Une classe `min-h/min-w-[44px]` sur un `<span>` ne PROUVE
    // rien : un `<span>` ne relaie pas le clic à son `<input>` descendant. Le conteneur doit être un
    // `<label>` ET le clic dans la marge AJOUTÉE (hors des 14 px visuels de la case) doit réellement
    // la cocher — sinon la correction WCAG 2.5.8 est un leurre.
    it('mobile : le conteneur est un <label> et un clic dans la MARGE AJOUTÉE coche réellement la case', () => {
        stubViewport(true);
        render(<ActionPlanDrilldown chartData={chartData} />);
        const checkbox = screen.getAllByRole('checkbox')[0] as HTMLInputElement;
        const wrapper = checkbox.parentElement!;
        expect(wrapper.tagName).toBe('LABEL');
        expect(checkbox.checked).toBe(false);
        fireEvent.click(wrapper); // le <label> lui-même, PAS l'input — c'est la marge des 44 px.
        expect(checkbox.checked).toBe(true);
    });
});
