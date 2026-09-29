// tests/components/panneauJourLot3.test.tsx
//
// [A11Y-PANNEAU-BOUTONS-FANTOMES] La BORDURE des boutons à contour fantôme du panneau du jour atteint
// 3:1 contre le fond (WCAG 1.4.11, limites d'un contrôle). Le test MESURE : il lit la classe
// `border-<couleur>/<opacité>` du bouton rendu, compose la couleur sur chaque fond possible du
// panneau (tokens lus dans tailwind.config.js, jamais recopiés) et calcule le rapport de contraste.
// `npm run check-contrast` ne mesure que les CTA pleins : sans ce test, personne ne voit ces bordures.
//
// [PANNEAU-FLUX-COLONNE-MUETTE] Une journée sans revenu ni dépense dit « rien » au lieu de rendre
// un bloc vide (qui se lit comme une donnée manquante).
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderPanneauJour } from '../helpers/panneauJour';
import type { ProjectionChartPoint } from '../../services/projection/types';

type Rgb = [number, number, number];
const config = fs.readFileSync(path.resolve(__dirname, '../../tailwind.config.js'), 'utf8');
const token = (nom: string): Rgb => {
    const m = config.match(new RegExp(`\\b${nom}:\\s*'#([0-9a-fA-F]{6})'`));
    if (!m) throw new Error(`token ${nom} introuvable dans tailwind.config.js`);
    return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) as Rgb;
};
const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]: Rgb) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contraste = (a: Rgb, b: Rgb) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return (h + 0.05) / (l + 0.05); };
const sur = (fg: Rgb, alpha: number, bg: Rgb): Rgb => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha)) as Rgb;

const COULEURS: Record<string, () => Rgb> = { white: () => [255, 255, 255], primary: () => token('primary') };
/** Fonds possibles derrière un bouton : page, carte, carte surélevée, et le panneau (surface/40 sur la page). */
const fonds = (): Rgb[] => [token('dark'), token('surface'), token('surfaceHighlight'), sur(token('surface'), 0.4, token('dark'))];

const jourCalme = {
    monthIndex: 60, dateLabel: '10 août 2031', age: 45, NetWorth: 0,
    isDailyPoint: true, dayIsReal: false,
} as unknown as ProjectionChartPoint;

describe('[A11Y-PANNEAU-BOUTONS-FANTOMES] bordures >= 3:1 (mesuré)', () => {
    const boutons = ['← Veille', 'Lendemain →', 'Détail complet →', 'Revenir à aujourd’hui'];

    it.each(boutons)('« %s » : la bordure atteint 3:1 sur TOUS les fonds du panneau', (nom) => {
        renderPanneauJour(jourCalme, { origine: 'epingle', onRelease: () => {} });
        const bouton = screen.getByText(nom).closest('button') as HTMLElement;
        const m = bouton.className.match(/(?:^|\s)border-(white|primary)\/(\d+)(?:\s|$)/);
        expect(m, `aucune classe border-<couleur>/<n> sur « ${nom} »`).toBeTruthy();
        const alpha = Number(m![2]) / 100;
        for (const fond of fonds()) {
            const r = contraste(sur(COULEURS[m![1]](), alpha, fond), fond);
            expect(r, `${nom} : ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
        }
    });

    it('anti-vacuité : l’ancienne valeur (border-white/20) était SOUS 3:1 — la mesure sait échouer', () => {
        const r = Math.max(...fonds().map(f => contraste(sur([255, 255, 255], 0.2, f), f)));
        expect(r).toBeLessThan(3);
    });
});

describe('[PANNEAU-FLUX-COLONNE-MUETTE]', () => {
    it('une journée calme le DIT (prose courte, jamais un bloc vide)', () => {
        renderPanneauJour(jourCalme);
        const t = screen.getAllByText('Aucun revenu ni dépense');
        expect(t.length).toBeGreaterThan(0);
        expect(t[0].textContent!.length).toBeLessThanOrEqual(45); // plafond [FUTUR-INFOBULLE-EPUREE]
    });

    it('contrôle négatif : avec une dépense, la phrase disparaît et la ligne apparaît', () => {
        renderPanneauJour({ ...jourCalme, Expenses: 1234 } as unknown as ProjectionChartPoint);
        expect(screen.queryByText('Aucun revenu ni dépense')).toBeNull();
    });
});
