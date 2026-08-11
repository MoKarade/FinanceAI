// [FUTUR-DAILY] Ventilation PAR COMPTE du tableau quotidien (demande Marc 2026-08-09 :
// « le passé je veux voir le détail par jour et par compte aussi »).
//
// Ce que ces tests protègent vraiment :
//   1. les montants atterrissent dans la BONNE colonne de régime (une inversion CELI/REER serait
//      invisible à l'œil : deux nombres plausibles au même endroit) ;
//   2. le FUTUR n'invente PAS de ventilation — « — » et non un chiffre crédible (règle no-fake-data).
// La donnée existait déjà dans `reconstructPortfolioHistoryDaily` ; c'est l'AFFICHAGE qui la jetait.
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { DailyDetailPanel, ACCOUNT_COLUMNS } from '../../../components/projection/DailyDetailPanel';
import type { MinimalAsset } from '../../../services/history/reconstructPortfolioHistory';

const FX = { USD: 1.35, EUR: 1.5, CAD: 1 };

// Deux titres au prix DATÉ (donc reconstruit, pas estimé), dans deux régimes distincts et à des
// valeurs volontairement très différentes pour qu'une inversion de colonne soit détectable.
const ASSETS: MinimalAsset[] = [
    {
        symbol: 'CELI-A', quantity: 10, currency: 'CAD', currentPrice: 100, accountType: 'CELI',
        dateBought: '2025-01-01',
        priceHistory: [{ date: '2026-01-01', price: 100 }],
    },
    {
        symbol: 'REER-B', quantity: 3, currency: 'CAD', currentPrice: 1000, accountType: 'REER',
        dateBought: '2025-01-01',
        priceHistory: [{ date: '2026-01-01', price: 1000 }],
    },
];

// Fenêtre à cheval : 01→02 janvier au PASSÉ, 03→04 au FUTUR.
const TODAY = '2026-01-03';
const BASE = {
    from: '2026-01-01',
    to: '2026-01-04',
    today: TODAY,
    anchors: [
        { monthIndex: 0, year: 2025, month: 11, value: 100_000 },
        { monthIndex: 1, year: 2026, month: 0, value: 110_000 },
    ],
    transactions: [] as ReadonlyArray<{ date: string; amount: number }>,
    currentCash: 5_000,
    assets: ASSETS,
    fx: FX,
    recurring: [] as ReadonlyArray<never>,
};

const rowFor = (date: string) => screen.getByText(date).closest('tr') as HTMLElement;

describe('DailyDetailPanel — le jour MÊME est mesuré, pas projeté', () => {
    // La borne de reconstruction est `min(to, today)`, INCLUSIVE : le jour même porte de vrais prix.
    // Le marquer « (projeté) » contredirait la <caption> sur la ligne la plus regardée du tableau
    // (toute fenêtre zoomée réaliste contient aujourd'hui).
    it('porte une ventilation RÉELLE et n’est PAS annoncé « (projeté) »', () => {
        render(<DailyDetailPanel {...BASE} />);
        const row = rowFor(TODAY);
        expect(row.textContent).not.toContain('(projeté)');
        const cells = within(row).getAllByRole('cell').map((c) => c.textContent ?? '');
        const headers = screen.getAllByRole('columnheader').map((h) => h.textContent ?? '');
        expect(cells[headers.indexOf('CELI') - 1]).toMatch(/1[\s ]?000/);
    });

    it('le LENDEMAIN, lui, est bien annoncé « (projeté) »', () => {
        render(<DailyDetailPanel {...BASE} />);
        expect(rowFor('2026-01-04').textContent).toContain('(projeté)');
    });
});

describe('DailyDetailPanel — accessibilité du tableau élargi', () => {
    it('le conteneur défilant est atteignable au CLAVIER (11 colonnes, aucun descendant focusable)', () => {
        render(<DailyDetailPanel {...BASE} />);
        const region = screen.getByRole('region', { name: /tableau défilant horizontalement/i });
        expect(region).toHaveAttribute('tabindex', '0');
        expect(region.className).toContain('overflow-x-auto');
    });

    it('une cellule vide dit « Pas de donnée » au lecteur d’écran, pas un tiret muet', () => {
        render(<DailyDetailPanel {...BASE} />);
        const futureRow = rowFor('2026-01-04');
        expect(within(futureRow).getAllByText('Pas de donnée').length).toBeGreaterThan(0);
        // ⚠️ Et surtout PAS « Montant masqué » : ce serait laisser croire à un montant caché
        // là où il n'y a aucune donnée.
        expect(within(futureRow).queryByText('Montant masqué')).toBeNull();
    });
});

describe('DailyDetailPanel — ventilation par compte (passé)', () => {
    it("affiche une colonne par régime, dans l'ordre canonique", () => {
        render(<DailyDetailPanel {...BASE} />);
        const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
        for (const c of ACCOUNT_COLUMNS) expect(headers).toContain(c.label);
        // L'ordre compte : la lecture se fait de gauche à droite, régime par régime.
        const idx = ACCOUNT_COLUMNS.map((c) => headers.indexOf(c.label));
        expect(idx).toEqual([...idx].sort((a, b) => a - b));
    });

    it('place chaque montant dans SA colonne (10 × 100 en CELI, 3 × 1000 en REER)', () => {
        render(<DailyDetailPanel {...BASE} />);
        const cells = within(rowFor('2026-01-01')).getAllByRole('cell').map((c) => c.textContent ?? '');
        const headers = screen.getAllByRole('columnheader').map((h) => h.textContent ?? '');
        // -1 : la 1re colonne est un <th scope="row"> (la date), pas une <td>.
        const cellAt = (label: string) => cells[headers.indexOf(label) - 1];
        expect(cellAt('CELI')).toMatch(/1[\s ]?000/);
        expect(cellAt('REER')).toMatch(/3[\s ]?000/);
        // Les régimes sans titre restent à 0 $ — c'est une VRAIE valeur reconstruite, pas un trou.
        expect(cellAt('REEE')).toMatch(/0/);
    });

    it("le total « Placements » est la somme des colonnes de régime", () => {
        render(<DailyDetailPanel {...BASE} />);
        const row = rowFor('2026-01-01');
        expect(row.textContent).toMatch(/4[\s ]?000/); // 1 000 (CELI) + 3 000 (REER)
    });

    it("le FUTUR n'affiche AUCUNE ventilation par compte (« — », jamais un chiffre inventé)", () => {
        render(<DailyDetailPanel {...BASE} />);
        const cells = within(rowFor('2026-01-04')).getAllByRole('cell').map((c) => c.textContent ?? '');
        const headers = screen.getAllByRole('columnheader').map((h) => h.textContent ?? '');
        for (const c of ACCOUNT_COLUMNS) {
            const cell = cells[headers.indexOf(c.label) - 1];
            // Le tiret VISIBLE + son doublon `sr-only` « Pas de donnée » (convention A11Y-DASH-SRONLY).
            // Ce qui compte ici : AUCUN chiffre — c'est la fausse précision qu'on refuse.
            expect(cell).toContain('—');
            expect(cell).not.toMatch(/\d/);
        }
    });
});
