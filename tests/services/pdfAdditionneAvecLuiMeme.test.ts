// tests/services/pdfAdditionneAvecLuiMeme.test.ts
//
// [PDF-DETTES-SOLDE-BRUT] FinanceAI#1154 — le rapport PDF se recompose avec lui-même.
// Marc : « deux chiffres d'un même écran qui ne se recomposent pas, c'est une mesure ». Un PDF sort de
// l'app et n'a plus aucun contexte pour s'expliquer : actifs − dettes DOIT valoir la valeur nette
// imprimée sur la même page, au dollar.
//
// On exécute le VRAI chemin du clic « Générer PDF » (`genererRapportPdfEcran`), alimenté par le VRAI
// `useDerivedFinancials`, et on capture la charge remise à `generateFinancialReport` — jamais une
// formule recopiée dans le test.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDerivedFinancials } from '../../utils/useDerivedFinancials';
import { genererRapportPdfEcran } from '../../components/app/exportPdfEcran';
import type { AppState, Asset, Debt, FintableBrokerBalance } from '../../types';
import type { ReportData } from '../../services/pdfReport';

const capture = vi.hoisted(() => ({ data: undefined as unknown }));

vi.mock('../../services/pdfReport', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../services/pdfReport')>()),
    generateFinancialReport: vi.fn(async (d: unknown) => { capture.data = d; }),
}));
vi.mock('../../components/ui/Toast', () => ({ showToast: vi.fn() }));

/** Bail hebdomadaire daté du 9 sept. : au 17 sept. un prélèvement de 150 $ est déjà parti. */
const BAIL: Debt = {
    id: 'bail', name: 'Bail auto', category: 'Car', kind: 'auto-lease',
    balance: 30_150, interestRate: 0, minimumPayment: 650,
    startDate: '2026-07-06', termEndDate: '2030-07-06', paymentFrequency: 'weekly',
    balanceAsOf: '2026-09-09',
} as Debt;

const CARTE: Debt = {
    id: 'visa', name: 'Carte Visa', category: 'CreditCard',
    balance: 5_000, interestRate: 19.99, minimumPayment: 200,
} as Debt;

const titre = (o: Partial<Asset> = {}): Asset => ({
    symbol: 'AAA', name: 'AAA', quantity: 100, currentPrice: 200, buyPrice: 100,
    currency: 'CAD', accountType: 'NON-ENREG', type: 'Stock',
    ...o,
} as unknown as Asset);

const courtier: FintableBrokerBalance = {
    accountId: 'acc1', label: 'Disnat', balanceCad: 31_000, taxRegime: 'NON-ENREG', at: Date.now(),
};

function etat(o: Partial<AppState> = {}): AppState {
    return {
        transactions: [], investmentTransactions: [], investmentAccounts: [], budgetItems: [],
        config: { users: [{ name: 'Marc', grossSalary: 6000, netSalary: 4200, age: 35 }], splitMode: '50/50' },
        realEstateGoals: [], childGoals: [], travelGoals: [], lifeEvents: [], financialGoals: [],
        retirementGoal: { targetAge: 65, targetMonthlyIncome: 4000, governmentPension: 1200 },
        initialBalances: { chequing: 2_500 },
        fxRates: { USD: 1.4, EUR: 1.47, CAD: 1 },
        assets: [titre(), titre({ symbol: 'BBB', accountType: 'CELI', quantity: 10, currentPrice: 150 })],
        debts: [BAIL, CARTE],
        ...o,
    } as unknown as AppState;
}

/** Exécute le clic « Générer PDF » comme App.tsx le câble, et rend la charge imprimée. */
async function pdfDe(state: AppState): Promise<ReportData> {
    const { result } = renderHook(() => useDerivedFinancials(state));
    const f = result.current;
    await genererRapportPdfEcran({
        state,
        globalNetWorth: f.globalNetWorth,
        dettesHorsImmo: f.dettesHorsImmo,
        ecartCourtier: f.ecartCourtier,
        calculatedMonthlySavings: f.calculatedMonthlySavings,
        assetBreakdown: f.assetBreakdown,
        currentLiquidity: f.currentLiquidity,
    });
    return capture.data as ReportData;
}

const actifs = (d: ReportData) => d.celiBalance + d.reerBalance + d.investmentsTotal + d.liquidityBalance;

beforeEach(() => {
    capture.data = undefined;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 17, 12, 0, 0)); // 17 sept. 2026, heure locale
});
afterEach(() => { vi.useRealTimers(); });

describe('[PDF-DETTES-SOLDE-BRUT] actifs − dettes = valeur nette, dans le même PDF', () => {
    it('dette datée + écart courtier : la page se recompose au cent près', async () => {
        const d = await pdfDe(etat({ fintableBrokerBalances: [courtier] }));
        // Anti-vacuité : les deux corrections VALENT quelque chose (sinon l'égalité passerait aussi avant le correctif).
        expect(d.totalDebts).toBeCloseTo(35_000, 2);            // 30 000 (bail au jour) + 5 000
        expect(d.totalDebts).not.toBeCloseTo(35_150, 2);            // le solde figé d'avant
        expect(d.investmentsTotal).toBeCloseTo(20_000 + 11_000, 2); // titres non enreg. + écart courtier
        expect(actifs(d) - d.totalDebts).toBeCloseTo(d.netWorth, 2);
    });

    it('le tableau des dettes totalise EXACTEMENT la ligne « Passif » de la page Patrimoine', async () => {
        const d = await pdfDe(etat({ fintableBrokerBalances: [courtier] }));
        const somme = (d.debtsDetail ?? []).reduce((s, r) => s + r.balance, 0);
        expect(somme).toBeCloseTo(d.totalDebts, 2);
        expect((d.debtsDetail ?? []).find((r) => r.name === 'Bail auto')?.balance).toBeCloseTo(30_000, 2);
    });

    it('CONTRÔLE NÉGATIF — sans dette datée ni synchro courtier, rien ne bouge (identité)', async () => {
        const d = await pdfDe(etat({ debts: [CARTE] }));
        expect(d.totalDebts).toBe(5_000);
        expect(d.investmentsTotal).toBe(20_000);
        expect(actifs(d) - d.totalDebts).toBeCloseTo(d.netWorth, 2);
    });

    it('un solde non fini compte 0 dans la ligne ET dans le total, la page reste cohérente', async () => {
        const d = await pdfDe(etat({ debts: [CARTE, { ...CARTE, id: 'x', name: 'Corrompue', balance: Number.NaN }] }));
        expect(Number.isFinite(d.totalDebts)).toBe(true);
        const somme = (d.debtsDetail ?? []).reduce((s, r) => s + r.balance, 0);
        expect(somme).toBeCloseTo(d.totalDebts, 2);
        expect(actifs(d) - d.totalDebts).toBeCloseTo(d.netWorth, 2);
    });
});
