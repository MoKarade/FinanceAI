import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dashboard } from '../../components/Dashboard';
import { useFinanceStore } from '../../store/useFinanceStore';
import { logError } from '../../services/errorLogger';
import { Tab } from '../../types';
import type { Transaction, RetirementGoal, BudgetConfig, User } from '../../types';

vi.mock('../../services/finance', () => ({
    fetchPortfolioHistory: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../services/errorLogger', () => ({
    logError: vi.fn(),
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'fr' } }),
}));
vi.mock('recharts', async () => {
    const React = await import('react');
    return {
        AreaChart: ({ children }: { children: React.ReactNode }) => React.createElement('div', { 'data-testid': 'chart' }, children),
        Area: () => null,
        XAxis: () => null,
        YAxis: () => null,
        CartesianGrid: () => null,
        Tooltip: () => null,
        ResponsiveContainer: ({ children }: { children: React.ReactNode }) => React.createElement('div', { 'data-testid': 'responsive-container' }, children),
        Legend: () => null,
        Brush: () => null,
    };
});

const defaultGoal: RetirementGoal = {
    targetAge: 60,
    targetMonthlyIncome: 5000,
    governmentPension: 1200,
};

const defaultConfig: BudgetConfig = {
    users: [
        { name: 'Marc', monthlyGross: 7000, rrspContribution: 0, fhsaContribution: 0, birthYear: 1990, canadaArrivalYear: 2009 } as unknown as User,
        { name: 'Anna', monthlyGross: 5000, rrspContribution: 0, fhsaContribution: 0, birthYear: 1992, canadaArrivalYear: 2009 } as unknown as User,
    ],
    splitMode: '50/50',
};

const baseProps = {
    transactions: [],
    assets: [],
    initialBalances: {},
    budgetItems: [],
    realEstateGoals: [],
    travelGoals: [],
    lifeEvents: [],
    retirementGoal: defaultGoal,
    config: defaultConfig,
};

// D2 : le Dashboard affiche un accueil « premier lancement » tant qu'il n'y a AUCUNE donnée.
// Les tests du dashboard plein doivent donc fournir au moins une transaction.
const oneTx: Transaction = {
    id: -99, date: '2026-01-10', payee: 'Test', amount: -10, category: 'Autre',
    accountName: 'Desjardins', status: 'processed', isTransfer: false, isDuplicate: false,
};

const navSpy = vi.fn();

describe('Dashboard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        navSpy.mockClear();
        // EP-3 : on injecte un spy de navigation + une projection vide par défaut.
        // Les tests qui veulent le chemin « avec valeur » posent leur propre lastProjection.
        useFinanceStore.setState({ navigateWithFocus: navSpy as never, lastProjection: null });
    });

    it('se rend sans erreur avec des props vides', () => {
        const { container } = render(<Dashboard {...baseProps} />);
        expect(container.firstChild).toBeTruthy();
    });

    it('Phase C2: affiche le PageHeader + les 4 KPI du hero', () => {
        const { container } = render(<Dashboard {...baseProps} transactions={[oneTx]} />);
        // useTranslation est mocké → on vérifie les clés i18n présentes.
        const text = container.textContent || '';
        expect(text).toContain('dashboard.title');
        expect(text).toContain('dashboard.global_net_worth');
        expect(text).toContain('dashboard.global_variation');
        expect(text).toContain('dashboard.passive_income_month');
        expect(text).toContain('dashboard.future_predictor');
    });

    // EP-3 : le KPI « Patrimoine projeté » a remplacé l'ancien mini-formulaire.
    // Sans projection calculée → empty state <ProjectionRequired> avec un lien vers Future.
    it('EP-3: sans projection, le KPI Futur propose un lien « ouvrir Future »', () => {
        render(<Dashboard {...baseProps} transactions={[oneTx]} />);
        // Le KPI rend ProjectionRequired inline → bouton « ouvrir Future » (aria-label …Future…).
        fireEvent.click(screen.getByRole('button', { name: /Future/i }));
        expect(navSpy).toHaveBeenCalledWith(Tab.FUTURE);
    });

    // EP-3 : avec une projection en store, le KPI affiche la valeur réelle (dernier point
    // de chartData) et devient lui-même un bouton cliquable qui navigue vers Future.
    it('EP-3: avec projection, le KPI Futur est cliquable et navigue vers Future', () => {
        useFinanceStore.setState({
            navigateWithFocus: navSpy as never,
            lastProjection: { chartData: [{ monthIndex: 240, NetWorth: 1_234_567 }] } as never,
        });
        render(<Dashboard {...baseProps} transactions={[oneTx]} />);
        const buttons = Array.from(document.querySelectorAll('button'));
        const kpiBtn = buttons.find(b => b.textContent?.includes('dashboard.future_predictor'));
        expect(kpiBtn).toBeTruthy();
        fireEvent.click(kpiBtn!);
        expect(navSpy).toHaveBeenCalledWith(Tab.FUTURE);
    });

    // EP-3 / no-silent-failure : un dernier point corrompu (NetWorth NaN) NE doit PAS
    // s'afficher en « — » muet ni rendre le KPI cliquable — il bascule sur <ProjectionRequired>
    // (empty state honnête) et journalise une projection corrompue.
    it('EP-3: une projection corrompue (NetWorth NaN) bascule sur ProjectionRequired + log', () => {
        useFinanceStore.setState({
            navigateWithFocus: navSpy as never,
            lastProjection: { chartData: [{ monthIndex: 240, NetWorth: NaN }] } as never,
        });
        render(<Dashboard {...baseProps} transactions={[oneTx]} />);
        // Le KPI n'est PAS un bouton cliquable porteur de valeur…
        const valueBtn = Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent?.includes('dashboard.future_predictor'));
        expect(valueBtn).toBeFalsy();
        // …mais l'empty state ProjectionRequired propose toujours « ouvrir Future ».
        fireEvent.click(screen.getByRole('button', { name: /Future/i }));
        expect(navSpy).toHaveBeenCalledWith(Tab.FUTURE);
        // …et la corruption est journalisée (pas avalée).
        expect(logError).toHaveBeenCalledWith(expect.objectContaining({ source: 'projection', severity: 'warning' }));
    });

    it('en mode privacyMode=true, se rend sans crash', () => {
        const { container } = render(<Dashboard {...baseProps} isPrivacyMode={true} />);
        expect(container.firstChild).toBeTruthy();
    });

    it('se rend sans crash avec des transactions fournies', () => {
        const txs: Transaction[] = [
            {
                id: -1,
                date: '2026-01-15',
                payee: 'Epicerie Métro',
                amount: -45.99,
                category: 'Alimentation',
                accountName: 'Desjardins',
                status: 'processed',
                isTransfer: false,
                isDuplicate: false,
            },
            {
                id: -2,
                date: '2026-01-20',
                payee: 'Hydro Québec',
                amount: -120.00,
                category: 'Services',
                accountName: 'Desjardins',
                status: 'processed',
                isTransfer: false,
                isDuplicate: false,
            },
        ];
        const { container } = render(<Dashboard {...baseProps} transactions={txs} />);
        expect(container.firstChild).toBeTruthy();
        expect(document.body.textContent).toContain('$');
    });

    it('se rend sans crash quand onNavigate est fourni', () => {
        const onNavigate = vi.fn();
        const { container } = render(<Dashboard {...baseProps} onNavigate={onNavigate} />);
        expect(container.firstChild).toBeTruthy();
    });

    it('D2 — premier lancement (aucune donnée) : affiche l\'accueil + CTA, pas les KPIs', () => {
        const onNavigate = vi.fn();
        render(<Dashboard {...baseProps} onNavigate={onNavigate} />);
        expect(screen.getByText(/Tableau de bord vide/i)).toBeInTheDocument();
        // les KPIs (clés i18n) ne sont PAS rendus dans l'accueil
        expect(document.body.textContent).not.toContain('dashboard.global_net_worth');
        // les CTA naviguent vers les bons onglets
        fireEvent.click(screen.getByRole('button', { name: /Importer des transactions/i }));
        expect(onNavigate).toHaveBeenCalledWith('TRANSACTIONS');
        fireEvent.click(screen.getByRole('button', { name: /Ajouter des placements/i }));
        expect(onNavigate).toHaveBeenCalledWith('INVESTMENTS');
    });

    it('avec des données (transactions/placements) : affiche le dashboard plein, pas l\'accueil', () => {
        render(<Dashboard {...baseProps} transactions={[oneTx]} />);
        expect(screen.queryByText(/Bienvenue ! Ajoute tes premières données/i)).toBeNull();
    });

    it('ignore les transactions dupliquées sans crash (isDuplicate=true)', () => {
        const txsWithDuplicate: Transaction[] = [
            { id: -1, date: '2026-01-15', payee: 'Metro', amount: -50, category: 'Alimentation', accountName: 'Desjardins', status: 'processed', isTransfer: false, isDuplicate: false },
            { id: -2, date: '2026-01-15', payee: 'Metro', amount: -50, category: 'Alimentation', accountName: 'Desjardins', status: 'processed', isTransfer: false, isDuplicate: true },
        ];
        const { container } = render(<Dashboard {...baseProps} transactions={txsWithDuplicate} />);
        expect(container.firstChild).toBeTruthy();
    });

    it('[DASH-NW-DUP audit 2026-07-16] sans CSV historique, la « Valeur Nette Globale » SOUSTRAIT les dettes (source unique)', () => {
        // Discriminant : l'ancien repli (marketData vide — le cas de CE harnais, fetch mocké → [])
        // calculait `cash + portefeuille` SANS soustraire les dettes → affichait 990 $ ici.
        // La source unique (computePresentNetWorth) donne 1000 − 10 − 400 = 590 $.
        const debt = { id: 'debt_1752585600001', name: 'Auto', balance: 400, interestRate: 6.5, minimumPayment: 50 };
        const { container } = render(
            <Dashboard
                {...baseProps}
                transactions={[oneTx]}
                initialBalances={{ Compte: 1000 }}
                debts={[debt as unknown as import('../../types').Debt]}
            />,
        );
        const text = container.textContent ?? '';
        expect(text).toContain('590');   // dettes soustraites (nouveau)
        expect(text).not.toContain('990'); // l'ancien montant gonflé n'apparaît nulle part
    });

    it('[DASH-NW-DUP suivi panel] le repli sans CSV INCLUT l\'équité immo (l\'étiquette « équité immo incluse » dit vrai)', () => {
        // Discriminant (finding financial-integrity, lot 2026-07-17) : le repli routait sur
        // computePresentNetWorth qui EXCLUT l'immo par design, alors que le chemin principal
        // (avec CSV) l'inclut ET que l'étiquette du KPI affirme « équité immo incluse » dès
        // qu'un bien existe → un propriétaire sans CSV voyait 590 $ sous une étiquette qui ment.
        // Attendu : 590 + (100 000 − 60 000) = 40 590.
        const debt = { id: 'debt_1752585600001', name: 'Auto', balance: 400, interestRate: 6.5, minimumPayment: 50 };
        const home = { id: 'reg_1752585600002', name: 'Maison', currentValue: 100000, mortgageBalance: 60000 };
        const { container } = render(
            <Dashboard
                {...baseProps}
                transactions={[oneTx]}
                initialBalances={{ Compte: 1000 }}
                debts={[debt as unknown as import('../../types').Debt]}
                realEstateGoals={[home as unknown as import('../../types').RealEstateGoal]}
            />,
        );
        const text = container.textContent ?? '';
        // 40 590 rendu (formatCAD fr-CA : espace fine/insécable comme séparateur de milliers).
        expect(text).toMatch(/40[\s  ]590/);
        expect(text).toContain('équité immo incluse');
    });
});
