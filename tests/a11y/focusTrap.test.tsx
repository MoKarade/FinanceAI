// tests/a11y/focusTrap.test.tsx
//
// [A11Y-FUTUR-DETAIL-FOCUS-TRAP] La tabulation reste DANS le dialogue.
//
// ⚠️ CE QUE LE TICKET DEMANDAIT, ET POURQUOI LE CORRECTIF N'EST PAS CELUI QU'IL PROPOSAIT.
// `FutureDetailModal` avait `role="dialog" aria-modal="true"`, le focus au montage et Échap — mais
// rien ne retenait Tab : la tabulation sortait vers le contenu de fond, que l'overlay masque à la
// souris et laisse atteignable au clavier. Le ticket suggérait de reprendre « le patron déjà présent
// deux fois ». Or ces deux copies avaient DÉJÀ DIVERGÉ : `Modal.tsx` inclut `select`/`textarea`
// dans sa liste d'éléments focusables, `SyncConflictModal.tsx` les avait perdus. Une troisième
// copie aurait reproduit la dérive — d'où un hook partagé, et les trois dialogues branchés dessus.
//
// ⚠️ La garde vise le COMPORTEMENT (le focus cycle vraiment) sur le dialogue du ticket, PUIS le
// câblage des deux autres par scan de source. Un scan seul prouverait la présence d'un jeton, pas
// l'acheminement (`GARDE-AU-PRODUCTEUR-NE-PROUVE-PAS-LA-CHAINE`).
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { FutureDetailModal } from '../../components/projection/FutureDetailModal';
import { FOCUSABLE_SELECTOR } from '../../hooks/useFocusTrap';
import type { ProjectionChartPoint } from '../../services/projection/types';
import { stripComments } from '../../utils/stripComments';

vi.mock('recharts', async () => {
    const R = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => R.createElement('div', null, children);
    return {
        ResponsiveContainer: P, ComposedChart: P, Area: () => null, XAxis: () => null,
        YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null, ReferenceDot: () => null,
    };
});

const point = {
    monthIndex: 4, year: 2026, dateLabel: '18 juin 2026', age: 41, NetWorth: 223_110,
} as unknown as ProjectionChartPoint;

// ⚠️ Les flèches Veille/Lendemain ne sont rendues QUE si `onStepDay` est fourni. Sans elles, le
// dialogue n'a qu'UN seul élément focusable : le piège devient une boucle sur lui-même et les
// assertions de cycle passent sans rien prouver. C'est l'anti-vacuité ci-dessous qui l'a attrapé.
const rendre = () =>
    render(
        <FutureDetailModal
            point={point} chartData={[point]} onClose={vi.fn()}
            onStepDay={vi.fn()} canStepPrev canStepNext
        />,
    );

const focusables = (): HTMLElement[] => {
    const dialog = screen.getByRole('dialog');
    return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
};

describe('[A11Y-FUTUR-DETAIL-FOCUS-TRAP] la tabulation ne sort pas du panneau Futur', () => {
    it('le panneau contient bien plusieurs éléments focusables (anti-vacuité)', () => {
        // Sans ce plancher, « le focus cycle » serait satisfait par un dialogue vide : le hook
        // s'abstient quand il ne trouve rien, et l'assertion suivante passerait sur du néant.
        rendre();
        expect(focusables().length).toBeGreaterThan(2);
    });

    it('Tab depuis le DERNIER élément revient au premier', () => {
        rendre();
        const liste = focusables();
        const premier = liste[0];
        const dernier = liste[liste.length - 1];
        dernier.focus();
        expect(document.activeElement).toBe(dernier);

        fireEvent.keyDown(document, { key: 'Tab' });
        expect(document.activeElement, 'la tabulation est sortie du dialogue').toBe(premier);
    });

    it('Shift+Tab depuis le PREMIER élément va au dernier', () => {
        rendre();
        const liste = focusables();
        const premier = liste[0];
        const dernier = liste[liste.length - 1];
        premier.focus();

        fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(dernier);
    });

    it('une touche autre que Tab ne déplace rien', () => {
        // Un piège qui bougerait le focus à chaque frappe rendrait la saisie impossible — c'est un
        // bug déjà vécu sur `Modal` (le ✕ reprenait le focus à chaque rendu).
        rendre();
        const liste = focusables();
        liste[1].focus();
        fireEvent.keyDown(document, { key: 'a' });
        expect(document.activeElement).toBe(liste[1]);
    });
});

describe('[A11Y-FUTUR-DETAIL-FOCUS-TRAP] une seule liste d’éléments focusables dans le dépôt', () => {
    const lire = (p: string): string => readFileSync(resolve(__dirname, '../..', p), 'utf8');
    const DIALOGUES = [
        'components/ui/Modal.tsx',
        'components/sync/SyncConflictModal.tsx',
        'components/projection/FutureDetailModal.tsx',
    ];

    it('les trois dialogues appellent le hook partagé', () => {
        for (const f of DIALOGUES) {
            expect(lire(f), `${f} n’utilise pas useFocusTrap`).toMatch(/useFocusTrap\(/);
        }
    });

    it('aucun composant ne redéclare sa PROPRE liste d’éléments focusables', () => {
        // ⚠️ C'est la dérive constatée qui motive cette garde, pas une précaution : les deux copies
        // existantes ne listaient pas les mêmes éléments. Le motif vise la DÉCLARATION d'un
        // sélecteur (`… = '…:not([disabled])…'`), pas la mention du mot dans un commentaire.
        const offenders: string[] = [];
        for (const f of [...DIALOGUES, 'components/FutureProjection.tsx', 'components/Budget.tsx']) {
            const src = stripComments(lire(f));
            if (/=\s*['"`][^'"`]*\[tabindex\]:not\(\[tabindex="-1"\]\)/.test(src)) offenders.push(f);
        }
        expect(offenders, 'une liste locale rouvre la porte à la divergence').toEqual([]);
    });

    it('le sélecteur partagé couvre les champs que la copie du modal de conflit avait perdus', () => {
        // La régression concrète évitée : un dialogue contenant une liste déroulante ou une zone de
        // texte aurait fui hors du piège.
        for (const balise of ['select:not([disabled])', 'textarea:not([disabled])']) {
            expect(FOCUSABLE_SELECTOR).toContain(balise);
        }
    });
});
