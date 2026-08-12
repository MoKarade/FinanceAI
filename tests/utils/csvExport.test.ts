import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { escapeCsvField, toCSV, exportTransactionsCSV, exportHoldingsCSV, exportBudgetCSV, downloadCSV, dateForFilename } from '../../utils/csvExport';
import type { Transaction, Asset, BudgetCategory } from '../../types';

describe('escapeCsvField', () => {
    it('pass through simple strings', () => {
        expect(escapeCsvField('hello')).toBe('hello');
        expect(escapeCsvField(42)).toBe('42');
    });

    it('handles null/undefined as empty', () => {
        expect(escapeCsvField(null)).toBe('');
        expect(escapeCsvField(undefined)).toBe('');
    });

    it('quotes string with comma', () => {
        expect(escapeCsvField('a, b')).toBe('"a, b"');
    });

    it('quotes string with quote and doubles internal quotes', () => {
        expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    });

    it('quotes string with newline', () => {
        expect(escapeCsvField('a\nb')).toBe('"a\nb"');
    });

    it('quotes string with carriage return', () => {
        expect(escapeCsvField('a\rb')).toBe('"a\rb"');
    });
});

describe('toCSV', () => {
    it('formats simple rows with CRLF line endings', () => {
        const csv = toCSV(
            [{ a: 1, b: 'x' }, { a: 2, b: 'y' }],
            [
                { header: 'A', accessor: (r: { a: number; b: string }) => r.a },
                { header: 'B', accessor: (r: { a: number; b: string }) => r.b },
            ],
        );
        expect(csv).toBe('A,B\r\n1,x\r\n2,y');
    });

    it('handles empty rows array (returns header only)', () => {
        const csv = toCSV([], [{ header: 'A', accessor: () => '' }]);
        expect(csv).toBe('A');
    });

    it('escapes fields with special chars', () => {
        const csv = toCSV(
            [{ note: 'Hello, world\n"quoted"' }],
            [{ header: 'Note', accessor: (r: { note: string }) => r.note }],
        );
        expect(csv).toContain('"Hello, world\n""quoted"""');
    });
});

describe('exportTransactionsCSV', () => {
    it('exports transactions with all required columns', () => {
        const txs: Transaction[] = [
            {
                id: 1, date: '2026-01-15', payee: 'Maxi', amount: -50,
                category: 'Épicerie', accountName: 'Courant', isTransfer: false,
                isDuplicate: false, status: 'processed', originalCategory: 'Épicerie',
            },
        ];
        const csv = exportTransactionsCSV(txs);
        const lines = csv.split('\r\n');
        expect(lines[0]).toBe('Date,Payee,Amount,Category,Account,Is Transfer,Is Duplicate,Status,Confiance IA');
        // Confiance absente → champ VIDE, jamais 0 (une confiance inconnue n'est pas une confiance nulle).
        expect(lines[1]).toBe('2026-01-15,Maxi,-50,Épicerie,Courant,false,false,processed,');
    });

    // [REFONTE-NAV-L5, revue #606] La consolidation des deux exports ne doit RIEN retirer :
    // l'export « vue filtrée » portait `Confiance IA` et sert à relire les catégorisations
    // douteuses. Ce test échoue si quelqu'un « simplifie » la colonne hors du format commun.
    it('conserve la confiance IA quand elle existe (capacité de l\'ex-export « vue filtrée »)', () => {
        const txs: Transaction[] = [
            {
                id: 2, date: '2026-02-01', payee: 'Inconnu', amount: -12,
                category: 'Divers', accountName: 'Courant', isTransfer: false,
                isDuplicate: false, status: 'processed', originalCategory: 'Divers',
                confidence: 0.42,
            },
        ];
        const lines = exportTransactionsCSV(txs).split('\r\n');
        expect(lines[0].endsWith('Confiance IA')).toBe(true);
        expect(lines[1].endsWith(',0.42')).toBe(true);
    });

    it('handles transactions with commas in payee (escaping)', () => {
        const txs: Transaction[] = [
            {
                id: 1, date: '2026-01-15', payee: 'Maxi, Montréal', amount: -50,
                category: 'Épicerie', accountName: 'Courant', isTransfer: false,
                isDuplicate: false, status: 'processed', originalCategory: 'Épicerie',
            },
        ];
        const csv = exportTransactionsCSV(txs);
        expect(csv).toContain('"Maxi, Montréal"');
    });
});

describe('exportHoldingsCSV', () => {
    it('exports holdings with computed value', () => {
        const assets: Asset[] = [
            { symbol: 'AAPL', name: 'Apple', quantity: 10, currency: 'USD', currentPrice: 200, performance: 33, dateBought: '2024-01-01', buyPrice: 150, accountType: 'CELI' },
        ];
        const csv = exportHoldingsCSV(assets);
        const lines = csv.split('\r\n');
        expect(lines[0]).toContain('Symbol');
        expect(lines[0]).toContain('Value');
        expect(lines[1]).toContain('AAPL');
        expect(lines[1]).toContain('2000'); // 10 × 200
    });

    it('exports holdings with empty buyPrice / accountType', () => {
        const assets: Asset[] = [
            { symbol: 'TSLA', name: '', quantity: 5, currency: 'USD', currentPrice: 100, performance: 0, dateBought: '' },
        ];
        const csv = exportHoldingsCSV(assets);
        expect(csv).toContain('TSLA');
    });
});

describe('exportBudgetCSV', () => {
    it('exports budget items', () => {
        const budget: BudgetCategory[] = [
            { id: 'c1', name: 'Loyer', target: 1500, frequency: 'Monthly', type: 'Commun', nature: 'Besoin' },
        ];
        const csv = exportBudgetCSV(budget);
        const lines = csv.split('\r\n');
        expect(lines[0]).toContain('Name');
        expect(lines[0]).toContain('Target');
        expect(lines[1]).toContain('Loyer');
        expect(lines[1]).toContain('1500');
        expect(lines[1]).toContain('Besoin');
    });
});

describe('downloadCSV', () => {
    beforeEach(() => {
        // jsdom n'implémente ni URL.createObjectURL/revokeObjectURL ni la navigation
        // déclenchée par <a>.click() — on les remplace par des mocks.
        global.URL.createObjectURL = vi.fn(() => 'blob:test');
        global.URL.revokeObjectURL = vi.fn();
        HTMLAnchorElement.prototype.click = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("crée un lien, l'ajoute au DOM, le clique puis le retire", () => {
        const appendChildSpy = vi.spyOn(document.body, 'appendChild');
        const removeChildSpy = vi.spyOn(document.body, 'removeChild');

        downloadCSV('export', 'col1,col2\r\n1,2');

        expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
        expect(appendChildSpy).toHaveBeenCalledTimes(1);
        expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
        expect(removeChildSpy).toHaveBeenCalledTimes(1);
    });

    it("ajoute l'extension .csv quand le filename ne la contient pas", () => {
        const appendChildSpy = vi.spyOn(document.body, 'appendChild');

        downloadCSV('transactions', 'a,b');

        const anchor = appendChildSpy.mock.calls[0][0] as HTMLAnchorElement;
        expect(anchor.download).toBe('transactions.csv');
    });

    it("conserve le filename tel quel s'il finit déjà par .csv", () => {
        const appendChildSpy = vi.spyOn(document.body, 'appendChild');

        downloadCSV('budget.csv', 'a,b');

        const anchor = appendChildSpy.mock.calls[0][0] as HTMLAnchorElement;
        expect(anchor.download).toBe('budget.csv');
    });

    it("révoque l'URL de l'objet après le délai (setTimeout 1s)", () => {
        vi.useFakeTimers();

        downloadCSV('export', 'a,b');
        vi.advanceTimersByTime(1000);

        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
    });

    it("ne fait rien quand window est undefined (environnement non-browser)", () => {
        vi.stubGlobal('window', undefined);

        expect(() => downloadCSV('export', 'a,b')).not.toThrow();
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });
});

describe('dateForFilename', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('retourne la date du jour au format YYYY-MM-DD', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-27T14:30:00.000Z'));

        expect(dateForFilename()).toBe('2026-05-27');
    });

    it('respecte le format ISO sur 10 caractères (YYYY-MM-DD)', () => {
        const result = dateForFilename();

        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(result).toHaveLength(10);
    });
});
