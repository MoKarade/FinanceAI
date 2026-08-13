/**
 * [A11Y-PRIVACY-*] — MODE DISCRET : les 5 fuites mesurées par l'audit 2026-08-12.
 *
 * Dans CHACUN de ces écrans, `isPrivacyMode` était DÉJÀ câblé pour d'autres champs (slider, table
 * sr-only, détail fiscal) : c'était une omission PAR CHAMP, pas une plomberie manquante. Le contrat
 * du dépôt (ADR-5 / `PrivateAmount`) est « masquer = NE PAS RENDRE » : la vraie valeur doit SORTIR
 * du DOM — un flou CSS la laisserait au copier-coller, à l'inspecteur et au lecteur d'écran.
 *
 * Chaque test compare donc le texte APLATI du DOM (espaces retirés : formatCAD insère une espace
 * fine insécable) au montant attendu, dans les DEUX sens : visible hors mode discret (sinon le test
 * ne prouverait rien), absent en mode discret.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { DebtManager } from '../../components/DebtManager';
import { TaxCenter } from '../../components/TaxCenter';
import { AssetLocationCard } from '../../components/retirement/AssetLocationCard';
import { Transactions } from '../../components/Transactions';
import { TaxBracketViz } from '../../components/TaxBracketViz';
import { FED_BRACKETS } from '../../utils/tax';
import { TransfersPanel } from '../../components/transactions/TransfersPanel';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { BudgetConfig, Debt, Transaction, User } from '../../types';

/** Valeur témoin injectée dans les formateurs de graphique mockés (= solde de la fixture Dettes). */
const SAMPLE_TICK = 41337;

vi.mock('recharts', async () => {
    const React = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: P, AreaChart: P, BarChart: P, ComposedChart: P, PieChart: P, LineChart: P,
        Area: () => null, Bar: () => null, Line: () => null, Pie: () => null, Cell: () => null,
        Legend: () => null, ReferenceLine: () => null,
        XAxis: () => null, CartesianGrid: () => null,
        // [revue #608] Mocker `YAxis`/`Tooltip` en `() => null` rendait ces tests AVEUGLES à la
        // fuite la plus visible de l'écran : les graduations de l'axe Y. On rend donc la SORTIE des
        // formateurs pour une valeur témoin — la vraie surface d'affichage, celle que Recharts
        // peindrait. `SAMPLE_TICK` est le solde de la fixture : ce que l'axe dirait pour de vrai.
        YAxis: ({ tickFormatter }: { tickFormatter?: (v: number) => string }) =>
            tickFormatter ? React.createElement('div', null, tickFormatter(SAMPLE_TICK)) : null,
        Tooltip: ({ formatter }: { formatter?: (v: number, n: string) => unknown }) =>
            formatter ? React.createElement('div', null, String(formatter(SAMPLE_TICK, 'Série'))) : null,
    };
});
vi.mock('../../services/claude', () => ({ categorizeBatch: vi.fn(), analyzePayslip: vi.fn() }));
vi.mock('../../components/ui/Toast', () => ({ showToast: vi.fn() }));

/** Texte du DOM sans aucune espace (formatCAD sépare les milliers par une espace fine insécable). */
const flat = (el: HTMLElement) => (el.textContent ?? '').replace(/[\s  ]/g, '');

const setPrivacy = (on: boolean) => act(() => { useFinanceStore.setState({ isPrivacyMode: on }); });

afterEach(() => {
    cleanup();
    setPrivacy(false);
});

// ── [A11Y-PRIVACY-DEBT] ──────────────────────────────────────────────────────
describe('[A11Y-PRIVACY-DEBT] page Dettes', () => {
    // Montants volontairement « uniques » : aucun autre chiffre de l'écran ne peut les imiter.
    const debts: Debt[] = [
        { id: 'd1', name: 'Carte Visa', balance: 41337, interestRate: 19.99, minimumPayment: 613, category: 'CreditCard' },
    ];

    it('mode discret INACTIF : solde, minimum et total dû sont LISIBLES (le test discrimine)', () => {
        const { container } = render(<DebtManager debts={debts} setDebts={vi.fn()} />);
        const text = flat(container);
        expect(text).toContain('41337');  // solde de la dette
        expect(text).toContain('613');    // paiement minimum
        expect(text, "graduation de l'axe Y de la courbe d'extinction").toContain('41k');
    });

    it('mode discret ACTIF : solde, minimum, total dû et total payé SORTENT du DOM', () => {
        setPrivacy(true);
        const { container } = render(<DebtManager debts={debts} setDebts={vi.fn()} />);
        const text = flat(container);
        expect(text, 'le solde de la dette fuyait (badge de liste)').not.toContain('41337');
        expect(text, 'le paiement minimum fuyait').not.toContain('613');
        // [revue #608] L'axe Y annonçait « 41k » à côté d'une infobulle correctement masquée.
        expect(text, "l'axe Y de la courbe d'extinction fuyait l'ordre de grandeur").not.toContain('41k');
        expect(container.querySelectorAll('.sr-only').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Montant masqué').length).toBeGreaterThan(0);
    });
});

// ── [A11Y-PRIVACY-TAXCENTER] ─────────────────────────────────────────────────
describe('[A11Y-PRIVACY-TAXCENTER] Centre fiscal', () => {
    // Salaires MENSUELS dans le store (convention canonique) → brut annuel = (7013 + 4987) × 12.
    const config: BudgetConfig = {
        users: [
            { name: 'Marc', grossSalary: 7013, netSalary: 5000, color: '#10b981', age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 } as unknown as User,
            { name: 'Anna', grossSalary: 4987, netSalary: 4000, color: '#3b82f6', age: 33, birthYear: 1993, canadaArrivalYear: 1993, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 } as unknown as User,
        ],
        splitMode: '50/50',
    };
    const ANNUAL_GROSS = String((7013 + 4987) * 12); // 144000

    it('mode discret INACTIF : le revenu brut annuel est LISIBLE (le test discrimine)', () => {
        const { container } = render(<TaxCenter config={config} assets={[]} />);
        expect(flat(container)).toContain(ANNUAL_GROSS);
    });

    it('mode discret ACTIF : le revenu brut synchronisé et les KPI $ SORTENT du DOM', () => {
        setPrivacy(true);
        const { container } = render(<TaxCenter config={config} assets={[]} />);
        expect(flat(container), 'le « Total Synchronisé » fuyait le revenu brut du couple').not.toContain(ANNUAL_GROSS);
        expect(screen.getAllByText('Montant masqué').length).toBeGreaterThan(0);
    });
});

// ── [A11Y-PRIVACY-RETIREMENT-ASSETLOC] ───────────────────────────────────────
describe('[A11Y-PRIVACY-RETIREMENT-ASSETLOC] Asset Location Optimizer', () => {
    // Le composant n'avait AUCUNE référence à isPrivacyMode : ses répartitions CELI/REER/NonReg
    // (et le champ éditable pré-rempli avec le VRAI portefeuille) étaient à nu.
    it('mode discret INACTIF : les totaux par compte sont LISIBLES (le test discrimine)', () => {
        const { container } = render(<AssetLocationCard annualGrossIncome={120000} />);
        // Fixture par défaut du composant : 50 000 obligations + 100 000 US en CELI = 150 000 CELI.
        expect(flat(container)).toContain('150000');
    });

    it('mode discret ACTIF : totaux par compte masqués ET champ éditable non rendu en clair', () => {
        setPrivacy(true);
        const { container } = render(<AssetLocationCard annualGrossIncome={120000} />);
        const text = flat(container);
        expect(text, 'le total CELI fuyait').not.toContain('150000');
        expect(text, 'le total NonReg fuyait').not.toContain('50000');
        // La valeur d'un champ ÉDITABLE ne vit pas dans textContent : elle vit dans `.value` du DOM.
        // En mode discret, PrivateNumberInput ne rend PAS d'input du tout (bouton « ••• »).
        const values = [...container.querySelectorAll('input[type="number"]')].map((i) => (i as HTMLInputElement).value);
        expect(values, 'les montants du bac-à-sable venaient du VRAI portefeuille').toHaveLength(0);
        expect(screen.getAllByText('Montant masqué').length).toBeGreaterThan(0);
    });
});

// ── [A11Y-PRIVACY-TXN-TOTALS] ────────────────────────────────────────────────
describe('[A11Y-PRIVACY-TXN-TOTALS] Transactions — agrégats', () => {
    const txns: Transaction[] = [
        { id: 1, date: '2026-01-05', payee: 'IGA', amount: -4321, category: 'Uncategorized', status: 'processed' },
        { id: 2, date: '2026-01-06', payee: 'IGA', amount: -1000, category: 'Uncategorized', status: 'processed' },
    ];
    const SUM = '5321'; // Σ de la vue filtrée = −5 321,00 $ ; total du groupe « IGA » = idem.

    const renderTxn = () => render(
        <Transactions transactions={txns} setTransactions={vi.fn()} apiKey="" budgetItems={[]} />,
    );

    it('mode discret INACTIF : Σ filtré et total de groupe sont LISIBLES (le test discrimine)', () => {
        const { container } = renderTxn();
        expect(flat(container)).toContain(SUM);
        fireEvent.click(screen.getByLabelText(/Ouvrir l'assistant de classement/));
        expect(flat(container), 'total du groupe « IGA » dans l\'assistant').toContain(SUM);
    });

    it('mode discret ACTIF : Σ filtré et total de groupe SORTENT du DOM (les lignes l\'étaient déjà)', () => {
        setPrivacy(true);
        const { container } = renderTxn();
        expect(flat(container), 'le Σ de la vue filtrée fuyait').not.toContain(SUM);
        fireEvent.click(screen.getByLabelText(/Ouvrir l'assistant de classement/));
        expect(flat(container), 'le total par marchand est aussi révélateur qu\'une ligne').not.toContain(SUM);
        expect(screen.getAllByText('Montant masqué').length).toBeGreaterThan(0);
    });
});

// ── [A11Y-PRIVACY-TAXBRACKET] (revue #608) ───────────────────────────────────
// Écran RENDU depuis l'onglet Retraite, dont ce même lot avait masqué l'axe Y quelques lignes plus
// haut : il n'avait AUCUNE notion de mode discret. Revenu brut, impôt net et détail $ par palier
// s'affichaient en clair, `aria-label` et `title` compris.
describe('[A11Y-PRIVACY-TAXBRACKET] paliers d\'imposition', () => {
    const INCOME = 91337; // chiffre « unique » : aucun autre nombre de l'écran ne peut l'imiter.

    it('mode discret INACTIF : le revenu brut est LISIBLE (le test discrimine)', () => {
        const { container } = render(<TaxBracketViz annualGrossIncome={INCOME} />);
        expect(flat(container)).toContain(String(INCOME));
    });

    it('mode discret ACTIF : revenu, impôt et détail par palier SORTENT du DOM (attributs compris)', () => {
        setPrivacy(true);
        const { container } = render(<TaxBracketViz annualGrossIncome={INCOME} />);
        expect(flat(container), 'le revenu brut fuyait').not.toContain(String(INCOME));
        // Les BORNES de palier sont du droit fiscal PUBLIC : elles doivent RESTER (sinon l'écran
        // perd son intérêt pédagogique et le test ne prouverait qu'un écran vide). La borne est LUE
        // depuis la source unique — jamais un chiffre fiscal recopié dans un test.
        const firstBound = String(Math.round(FED_BRACKETS[0].upTo));
        expect(flat(container), 'les bornes de palier publiques ont disparu').toContain(firstBound);
        // Une valeur sensible peut sortir par un ATTRIBUT sans jamais toucher textContent.
        const attrs = [...container.querySelectorAll('[aria-label], [title], caption')]
            .map((el) => `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('title') ?? ''} ${el.textContent ?? ''}`)
            .join(' ')
            .replace(/[\s  ]/g, '');
        expect(attrs, 'un aria-label / title / caption fuyait le revenu').not.toContain(String(INCOME));
    });
});

// ── [A11Y-PRIVACY-TRANSFERS-ARIA] (revue #608) ───────────────────────────────
// Le montant VISIBLE passait par PrivateAmount, mais l'aria-label du bouton juste en dessous le
// reconstruisait avec formatCAD nu : annoncé en clair au lecteur d'écran, lisible dans le DOM.
describe('[A11Y-PRIVACY-TRANSFERS-ARIA] virements internes', () => {
    // Paire PLAUSIBLE (un compte inconnu) → suggestion affichée, jamais marquée d'office.
    const txns: Transaction[] = [
        { id: 1, date: '2026-03-02', payee: 'Retrait', amount: -7431, category: 'Divers', status: 'processed', accountName: 'Courant' },
        { id: 2, date: '2026-03-03', payee: 'Dépôt', amount: 7431, category: 'Divers', status: 'processed' },
    ];
    const AMOUNT = '7431';

    const openPanel = () => {
        const view = render(<TransfersPanel transactions={txns} onMarkTransfers={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /virement/i }));
        return view;
    };

    const ariaText = (container: HTMLElement) =>
        [...container.querySelectorAll('[aria-label]')]
            .map((el) => el.getAttribute('aria-label') ?? '')
            .join(' ')
            .replace(/[\s  ]/g, '');

    it('mode discret INACTIF : l\'aria-label du bouton porte le montant (le test discrimine)', () => {
        const { container } = openPanel();
        expect(ariaText(container)).toContain(AMOUNT);
    });

    it('mode discret ACTIF : l\'aria-label ne porte plus le montant', () => {
        setPrivacy(true);
        const { container } = openPanel();
        expect(ariaText(container), 'l\'aria-label du bouton de confirmation fuyait le montant').not.toContain(AMOUNT);
        expect(flat(container), 'le montant visible fuyait').not.toContain(AMOUNT);
    });
});
