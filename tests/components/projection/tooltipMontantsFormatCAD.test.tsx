/**
 * [FMT-TOLOCALESTRING-MONEY] Lot 102 — le « $ » de l'infobulle Futur vient du FORMATEUR, plus du JSX.
 *
 * ⚠️ Pourquoi cette garde existe. Le lot a retiré **18 « $ » posés à la main** dans le JSX de
 * `ProjectionTooltip` (`{fmt(x)}$` → `{fmt(x)}`), parce que `formatCAD` pose le sien. Les deux
 * façons de se tromper sont muettes : oublier de retirer un « $ » en affiche DEUX
 * (« 500 000 $$ »), et migrer un site qui n'en portait pas en ajoute un qui n'a jamais existé.
 * Aucun test de rendu du dépôt ne regardait le symbole — ils asseyaient les libellés et les signes.
 *
 * ⚠️ Le 19ᵉ site est le MEMBRE DÉVIANT : `{fmt(a.gain)}` n'a jamais porté de « $ » (le symbole est
 * déjà sur la valeur du compte, une ligne plus haut). Il passe par `formatNumber`, pas `formatCAD` —
 * un remplacement de classe se relit membre par membre.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExpertTooltip } from '../../../components/projection/ProjectionTooltip';
import { formatCAD, formatNumber } from '../../../utils/format';
import type { ProjectionChartPoint } from '../../../services/projection/types';

const pt = (over: Partial<ProjectionChartPoint>): ProjectionChartPoint => ({
    monthIndex: 0, dateLabel: 'janv. 2030', age: 40, NetWorth: 500000, ...over,
} as ProjectionChartPoint);

const rendu = (over: Partial<ProjectionChartPoint> = {}): string =>
    render(<ExpertTooltip data={pt(over)} />).container.textContent ?? '';

describe('[FMT] les montants de l\'infobulle passent par la source unique', () => {
    it('le gros chiffre porte UN seul « $ », posé par formatCAD', () => {
        const txt = rendu({ NetWorth: 1234567 });
        // ⚠️ L'attendu se COMPOSE avec le formateur : `formatCAD` sépare par une INSÉCABLE
        // (U+00A0), donc un littéral écrit avec une espace ordinaire serait vacueux — piège déjà
        // payé par le dépôt sur `not.toContain('90 000')`.
        expect(txt).toContain(formatCAD(1234567));
        expect(txt).not.toContain('$$');
    });

    it('aucun « $ » orphelin : autant de symboles que de montants formatés', () => {
        // Contrôle de la classe entière plutôt que d'un site : si un seul des 18 « $ » retirés
        // était resté, il apparaîtrait ici en doublon collé au symbole du formateur.
        const txt = rendu({ NetWorth: 500000, Expenses: 3000, IncomeMarc: 7000, FluxImpots: 1200 });
        expect(txt).not.toMatch(/\$\s*\$/);
        expect(txt.match(/\$/g)?.length ?? 0).toBeGreaterThan(3);
    });

    it('le gain par compte reste un nombre NU — formatCAD y ajouterait un « $ » jamais eu', () => {
        // ⚠️ La fixture porte DEUX comptes à gains différents : avec un seul, le gain du compte
        // (1 500) et le TOTAL « Rendement » (1 500 aussi) sont indiscernables, et « formatCAD(1500)
        // n'apparaît pas » devient faux pour une raison légitime — la ligne de total, elle, porte
        // bien son symbole. Une fixture qui confond deux grandeurs rend la mesure aveugle.
        const txt = rendu({
            CELI: 100000, MarketGrowthCELI: 1500, REER: 80000, MarketGrowthREER: 700,
        } as Partial<ProjectionChartPoint>);
        // Le gain est rendu par `formatNumber` : sa forme est celle du nombre, sans devise.
        expect(txt).toContain(formatNumber(1500));
        // ⚠️ L'attendu NÉGATIF se compose lui aussi avec le formateur : mon premier jet écrivait
        // `` `${formatNumber(1500)} $` `` — une espace ORDINAIRE devant le « $ », que `formatCAD`
        // n'écrit jamais (il pose U+00A0). La perturbation « migre ce site vers formatCAD » restait
        // donc VERTE : l'assertion cherchait une chaîne qui n'existe dans aucune des deux versions.
        expect(txt).not.toContain(formatCAD(1500));
        // Anti-vacuité : la valeur du compte, elle, porte bien son symbole — sans quoi le cas
        // ci-dessus serait satisfait par une infobulle qui n'affiche simplement rien.
        expect(txt).toContain(formatCAD(100000));
        // …et le TOTAL des rendements (1 500 + 700) porte bien le sien : c'est lui qui distingue
        // « le gain par compte est nu » de « rien n'est formaté ».
        expect(txt).toContain(formatCAD(2200));
    });
});
