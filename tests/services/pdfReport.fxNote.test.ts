// [FX-FALLBACK-SILENCIEUX] Le total « placements » du PDF convertit les holdings étrangers en CAD
// (assetValueCad) sans AUCUN signal — même trou que Dashboard/Investissements, sur un document qui
// SORT de l'app et n'a plus aucun contexte pour se corriger. On prouve la note conditionnelle en
// capturant les appels `doc.text(...)` du mock jsPDF (patron pdfPrivacyRefus.test.ts).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateFinancialReport } from '../../services/pdfReport';
import { useFinanceStore } from '../../store/useFinanceStore';

const jsPDFCtor = vi.fn();
const textCalls: string[] = [];
vi.mock('jspdf', () => {
    class FauxPdf {
        constructor() { jsPDFCtor(); }
        setFont() {} setFontSize() {} setTextColor() {} setFillColor() {} setDrawColor() {}
        rect() {} text(s: string) { textCalls.push(s); } addPage() {} line() {} save() {}
        splitTextToSize() { return ['']; }
        internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 }, getNumberOfPages: () => 1 };
        setPage() {}
    }
    return { __esModule: true, jsPDF: FauxPdf, default: FauxPdf };
});

const holding = { symbol: 'AAPL', name: 'Apple', quantity: 1, currentPrice: 100, currency: 'USD', valueCAD: 140, accountType: 'NON-ENREG' };

const baseData = {
    netWorth: 100_000, monthlySavings: 1_000, monthlyIncome: 5_000, totalDebts: 0,
    celiBalance: 0, reerBalance: 0, investmentsTotal: 140, liquidityBalance: 0,
    budgetItems: [], fiscal: undefined, holdings: [holding], debtsDetail: [], goalsDetail: [],
    scenarios: [],
} as unknown as Parameters<typeof generateFinancialReport>[0];

const NOTE = 'Taux de change estimés (non récupérés récemment)';

beforeEach(() => {
    jsPDFCtor.mockClear();
    textCalls.length = 0;
    useFinanceStore.setState({ isPrivacyMode: false });
});

describe('[FX-FALLBACK-SILENCIEUX] note sous « Total placements »', () => {
    it('fxRatesEstimated: true → la note apparaît sous le total', async () => {
        await generateFinancialReport({ ...baseData, fxRatesEstimated: true });
        expect(textCalls.some(t => t.includes(NOTE))).toBe(true);
    });

    it('fxRatesEstimated: false → aucune note (anti-sur-correctif : pas de bruit hors-sujet)', async () => {
        await generateFinancialReport({ ...baseData, fxRatesEstimated: false });
        expect(textCalls.some(t => t.includes(NOTE))).toBe(false);
    });

    it('fxRatesEstimated absent (appelants existants, rétrocompat) → aucune note', async () => {
        await generateFinancialReport(baseData);
        expect(textCalls.some(t => t.includes(NOTE))).toBe(false);
    });
});
