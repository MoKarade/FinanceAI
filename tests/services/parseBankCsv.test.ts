import { describe, it, expect } from 'vitest';
import { parseBankCsv, parseAmount, extractedTxnsToCsv } from '../../services/import/parseBankCsv';

const find = (r: ReturnType<typeof parseBankCsv>, payeeFragment: string) =>
    r.transactions.find((t) => t.payee.toLowerCase().includes(payeeFragment.toLowerCase()));

describe('parseAmount', () => {
    it('gère $, milliers, décimales US et FR, négatifs', () => {
        expect(parseAmount('$1,234.56')).toBeCloseTo(1234.56);
        expect(parseAmount('1 234,56')).toBeCloseTo(1234.56); // espace fine + virgule décimale
        expect(parseAmount('1 234,56')).toBeCloseTo(1234.56);
        expect(parseAmount('-45.00')).toBeCloseTo(-45);
        expect(parseAmount('(50,00)')).toBeCloseTo(-50); // parenthèses = négatif
        expect(parseAmount('1,500')).toBeCloseTo(1500); // virgule + 3 chiffres = milliers
        expect(parseAmount('1,50')).toBeCloseTo(1.5); // virgule + 2 chiffres = décimale
        expect(parseAmount('1,234.56')).toBeCloseTo(1234.56); // format US
        expect(parseAmount('2500')).toBe(2500);
        expect(parseAmount('')).toBeNull();
        expect(parseAmount('abc')).toBeNull();
    });
});

describe('parseBankCsv', () => {
    it('CSV virgule avec en-tête + dates ISO + montants signés', () => {
        const raw = [
            'Date,Description,Amount',
            '2026-01-15,Epicerie Metro,-85.40',
            '2026-01-16,Paie,2500.00',
        ].join('\n');
        const r = parseBankCsv(raw);
        expect(r.delimiter).toBe(',');
        expect(r.hasHeader).toBe(true);
        expect(r.imported).toBe(2);
        expect(find(r, 'metro')!.amount).toBeCloseTo(-85.4);
        expect(find(r, 'paie')!.amount).toBeCloseTo(2500);
    });

    it('CSV point-virgule, en-têtes FR accentués, virgule décimale', () => {
        const raw = [
            'Date;Libellé;Montant',
            '15/01/2026;Loyer;-1 250,00',
            '20/01/2026;Remboursement;75,50',
        ].join('\n');
        const r = parseBankCsv(raw);
        expect(r.delimiter).toBe(';');
        expect(r.hasHeader).toBe(true);
        expect(r.dateOrder).toBe('DMY'); // 15 > 12
        expect(find(r, 'loyer')!.amount).toBeCloseTo(-1250);
        expect(find(r, 'loyer')!.date).toBe('2026-01-15');
        expect(find(r, 'remboursement')!.amount).toBeCloseTo(75.5);
    });

    it('colonnes Débit / Crédit séparées', () => {
        const raw = [
            'Date,Description,Débit,Crédit',
            '2026-02-01,Achat essence,60.00,',
            '2026-02-02,Salaire,,3000.00',
        ].join('\n');
        const r = parseBankCsv(raw);
        expect(find(r, 'essence')!.amount).toBeCloseTo(-60); // débit → négatif
        expect(find(r, 'salaire')!.amount).toBeCloseTo(3000); // crédit → positif
    });

    it('ignore (skip) les lignes au montant vide / non numérique — garde anti-corruption money', () => {
        // L'import CSV est le seul vecteur de données externes non contrôlées : une ligne au
        // montant illisible NE DOIT PAS entrer dans le store (sinon patrimoine corrompu).
        const raw = [
            'Date,Description,Amount',
            '2026-04-01,Valide,-10.00',
            '2026-04-02,Montant vide,',
            '2026-04-03,Montant texte,N/A',
            '2026-04-04,Montant illisible,abc',
        ].join('\n');
        const r = parseBankCsv(raw);
        expect(r.total).toBe(4);
        expect(r.imported).toBe(1);
        expect(r.skipped).toBe(3);
        expect(r.imported + r.skipped).toBe(r.total);
        // Aucune transaction importée n'a un montant non-fini.
        expect(r.transactions.every((t) => Number.isFinite(t.amount))).toBe(true);
        expect(r.transactions).toHaveLength(1);
        expect(find(r, 'valide')!.amount).toBeCloseTo(-10);
    });

    it('détecte MM/DD/YYYY quand le 2e nombre dépasse 12', () => {
        const raw = ['Date,Description,Amount', '01/25/2026,Cafe,-5.00'].join('\n');
        const r = parseBankCsv(raw);
        expect(r.dateOrder).toBe('MDY');
        expect(find(r, 'cafe')!.date).toBe('2026-01-25');
    });

    it('respecte les guillemets contenant le séparateur', () => {
        const raw = ['Date,Description,Amount', '2026-03-01,"Epicerie, Metro Plus",-42.00'].join('\n');
        const r = parseBankCsv(raw);
        expect(r.imported).toBe(1);
        expect(r.transactions[0].payee).toBe('Epicerie, Metro Plus');
    });

    it('sans en-tête → mapping positionnel [date, payee, montant]', () => {
        const raw = ['2026-04-01,Pharmacie,-30.00', '2026-04-02,Interets,1.25'].join('\n');
        const r = parseBankCsv(raw);
        expect(r.hasHeader).toBe(false);
        expect(r.imported).toBe(2);
        expect(find(r, 'pharmacie')!.amount).toBeCloseTo(-30);
    });

    it('lignes invalides (sans date) comptées dans skipped', () => {
        const raw = ['Date,Description,Amount', '2026-05-01,Valide,-10.00', 'pas une date,Bidon,-5.00'].join('\n');
        const r = parseBankCsv(raw);
        expect(r.imported).toBe(1);
        expect(r.skipped).toBe(1);
    });

    it('entrée vide → résultat vide sans planter', () => {
        const r = parseBankCsv('');
        expect(r.imported).toBe(0);
        expect(r.transactions).toHaveLength(0);
    });
});

describe('extractedTxnsToCsv — relevé PDF/image → CSV canonique → re-parse', () => {
    it('produit un CSV `date,description,amount` avec en-tête', () => {
        const csv = extractedTxnsToCsv([{ date: '2026-02-04', description: 'Metro', amount: -42.5 }]);
        expect(csv.split('\n')[0]).toBe('date,description,amount');
        expect(csv).toContain('2026-02-04,"Metro",-42.5');
    });

    it('échappe virgules et guillemets (RFC-4180) → survit au re-parse parseBankCsv', () => {
        const txns = [
            { date: '2026-02-04', description: 'EPICERIE METRO, MTL', amount: -42.5 },
            { date: '2026-02-05', description: 'Resto "Le Chic"', amount: -88.25 },
        ];
        const r = parseBankCsv(extractedTxnsToCsv(txns));
        expect(r.imported).toBe(2);
        const t0 = r.transactions.find((t) => t.payee.includes('METRO'))!;
        expect(t0.payee).toBe('EPICERIE METRO, MTL'); // virgule interne préservée
        expect(t0.amount).toBeCloseTo(-42.5);
        const t1 = r.transactions.find((t) => t.payee.includes('Chic'))!;
        expect(t1.payee).toBe('Resto "Le Chic"');     // guillemets internes préservés
        expect(t1.amount).toBeCloseTo(-88.25);
    });

    it('aller-retour : montants signés (+/-) et dates ISO conservés', () => {
        const txns = [
            { date: '2026-01-10', description: 'Depot paie', amount: 1500 },
            { date: '2026-01-11', description: 'Achat', amount: -23.99 },
        ];
        const r = parseBankCsv(extractedTxnsToCsv(txns));
        expect(r.dateOrder).toBe('ISO');
        expect(r.transactions.find((t) => t.payee.includes('Depot'))!.amount).toBeCloseTo(1500);
        expect(r.transactions.find((t) => t.payee.includes('Achat'))!.amount).toBeCloseTo(-23.99);
    });
});
