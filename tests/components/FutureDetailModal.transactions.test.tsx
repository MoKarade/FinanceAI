// tests/components/FutureDetailModal.transactions.test.tsx
//
// [PASSE-REEL-TXN-DU-JOUR] Demande de Marc : « je veux voir mes transactions à chaque date quand je
// clique sur détail ». Cadrage confirmé par lui : TOUTES les transactions, dans le PANNEAU EXISTANT.
//
// ⚠️ Le helper `transactionsOnDay` a sa propre suite (logique d'inclusion). ICI on prouve autre
// chose, et c'est le risque réel de ce lot : que la section soit effectivement ATTEIGNABLE et
// RENDUE. Un helper juste dont personne n'affiche la sortie est la définition d'une feature qui
// n'existe pas (leçon `UX-UNREACHABLE-FEATURE` du dépôt).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { FutureDetailModal } from '../../components/projection/FutureDetailModal';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { ProjectionChartPoint } from '../../services/projection/types';
import type { Transaction } from '../../types';

vi.mock('recharts', async () => {
    const React = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: P, ComposedChart: P, Area: () => null, XAxis: () => null,
        YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null, ReferenceDot: () => null,
    };
});

const JOUR = '2026-03-04';

const txn = (p: Partial<Transaction>): Transaction => ({
    id: 1, date: JOUR, payee: 'IGA', amount: -42.5, category: 'Épicerie', status: 'processed', ...p,
} as Transaction);

// Montants « uniques » : aucun autre nombre de la modale ne peut les imiter.
const TRANSACTIONS: Transaction[] = [
    txn({ id: 1, payee: 'Épicerie Metro', amount: -13741, category: 'Alimentation', accountName: 'Chèque' }),
    txn({ id: 2, payee: 'Paie', amount: 28319, category: 'Revenu' }),
    txn({ id: 3, payee: 'Doublon Metro', amount: -13741, category: 'Alimentation', isDuplicate: true }),
    txn({ id: 4, payee: 'Vers CELI', amount: -55127, category: 'Virement', isTransfer: true }),
    txn({ id: 5, date: '2026-03-05', payee: 'Autre jour', amount: -99991, category: 'Divers' }),
];

const pointDuJour = { monthIndex: 2, dayIso: JOUR, NetWorth: 1000, diffNW: 0 } as unknown as ProjectionChartPoint;
const pointMensuel = { monthIndex: 2, NetWorth: 1000, diffNW: 0 } as unknown as ProjectionChartPoint;

const ouvrir = (point: ProjectionChartPoint, transactions: Transaction[] | undefined = TRANSACTIONS) =>
    render(
        <FutureDetailModal
            point={point}
            chartData={[point]}
            transactions={transactions}
            onClose={vi.fn()}
        />,
    );

/** Texte du document ENTIER : la modale se rend dans un portail (`document.body`). */
const texte = () => (document.body.textContent ?? '').replace(/[\s  ]/g, '');

beforeEach(() => { act(() => { useFinanceStore.setState({ isPrivacyMode: false }); }); });
afterEach(() => { cleanup(); act(() => { useFinanceStore.setState({ isPrivacyMode: false }); }); });

describe('[PASSE-REEL-TXN-DU-JOUR] la section est ATTEIGNABLE et rendue', () => {
    it('une journée identifiée affiche ses transactions, marchand ET montant', () => {
        ouvrir(pointDuJour);
        const t = texte();
        expect(t, 'la section doit s’annoncer').toContain(`Transactionsdu${JOUR}`);
        expect(t, 'marchand').toContain('ÉpicerieMetro');
        expect(t, 'montant').toContain('13741');
        expect(t, 'catégorie').toContain('Alimentation');
        expect(t, 'compte').toContain('Chèque');
        expect(t, 'la paie du jour').toContain('28319');
    });

    it('les transactions d’un AUTRE jour ne sont pas montrées', () => {
        ouvrir(pointDuJour);
        expect(texte(), 'une transaction du 5 mars n’a rien à faire dans le détail du 4').not.toContain('99991');
    });

    // Le cœur du cadrage : TOUTES les transactions, mais un total qui reste celui de la courbe.
    it('doublon et virement sont AFFICHÉS, avec leur raison', () => {
        ouvrir(pointDuJour);
        const t = texte();
        expect(t, 'le doublon doit apparaître — il est sur le relevé').toContain('DoublonMetro');
        expect(t).toContain('doublon');
        expect(t, 'le virement aussi').toContain('VersCELI');
        expect(t).toContain('virementinterne');
        expect(t, 'et l’écran doit EXPLIQUER pourquoi ils ne comptent pas').toContain('nebougentpaslacourbe');
    });

    it('le total affiché est celui qui explique la COURBE (hors doublon et virement)', () => {
        ouvrir(pointDuJour);
        // −13 741 + 28 319 = 14 578. Le virement (−55 127) et le doublon en sont exclus.
        expect(texte()).toContain('14578');
    });

    // ⚠️ Sur un point MENSUEL ou FUTUR, il n'y a pas de mouvements réels. Une section vide y
    // laisserait croire « aucune transaction ce jour-là » — un faux (no-fake-data).
    it('un point SANS `dayIso` n’affiche aucune section transactions', () => {
        ouvrir(pointMensuel);
        expect(texte(), 'pas de journée identifiée → pas de section').not.toContain('Transactionsdu');
    });

    it('une journée SANS transaction n’affiche pas de section vide', () => {
        ouvrir(pointDuJour, [txn({ id: 9, date: '2020-01-01', amount: -5 })]);
        expect(texte()).not.toContain('Transactionsdu');
    });

    // ⚠️ Rendu DIRECT, pas via `ouvrir` : passer `undefined` à un paramètre À VALEUR PAR DÉFAUT
    // déclenche ce défaut (sémantique JS). Mon premier essai passait donc la liste COMPLÈTE en
    // croyant tester son absence — le test échouait en accusant le composant, à tort.
    it('sans la prop `transactions`, la modale rend sans erreur et sans section', () => {
        expect(() => render(
            <FutureDetailModal point={pointDuJour} chartData={[pointDuJour]} onClose={vi.fn()} />,
        )).not.toThrow();
        expect(texte()).not.toContain('Transactionsdu');
    });
});

// ── Mode discret ─────────────────────────────────────────────────────────────────────────────
// Cinq tickets de ce lot ont posé la même règle : on masque les MONTANTS, pas ce qui identifie.
// Une nouvelle surface qui affiche des $ doit naître conforme, pas être rattrapée plus tard.
describe('[PASSE-REEL-TXN-DU-JOUR] mode discret', () => {
    it('les montants SORTENT du DOM, marchands et catégories restent', () => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        ouvrir(pointDuJour);
        const t = texte();
        expect(t, 'montant d’une ligne').not.toContain('13741');
        expect(t, 'la paie').not.toContain('28319');
        expect(t, 'le total du jour').not.toContain('14578');
        expect(t, 'le marchand identifie la ligne : il reste').toContain('ÉpicerieMetro');
        expect(t, 'la catégorie aussi').toContain('Alimentation');
    });
});
