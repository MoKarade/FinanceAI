/**
 * [DETTE-GODFN-PDF] Garde STRUCTURELLE du rendu PDF — le journal d'appels jsPDF.
 *
 * `generateFinancialReport` faisait 615 lignes ; le découpage par section ne doit RIEN changer au
 * document produit. Le juge d'équivalence pendant le découpage a été le JOURNAL COMPLET des appels
 * jsPDF (chaque méthode + ses arguments, dans l'ordre), diffé avant/après à l'octet près :
 *
 *   PDF_JOURNAL_OUT=/tmp/avant npx vitest run tests/services/pdfReport.journalRendu.test.ts
 *   (appliquer le découpage)
 *   PDF_JOURNAL_OUT=/tmp/apres npx vitest run tests/services/pdfReport.journalRendu.test.ts
 *   diff -r /tmp/avant /tmp/apres   →  vide = document identique
 *
 * Ce test COMMITTÉ n'épingle PAS le journal complet (un golden au pixel se ferait re-baser au
 * premier ajustement de style) : il fige la STRUCTURE — l'ordre des pages, les témoins de contenu
 * de chaque section, le refus des chemins d'erreur — qui survit aux retouches cosmétiques mais
 * rougit si une section disparaît ou change d'ordre.
 *
 * ⚠️ Le faux jspdf expose `jsPDF` ET `default` : `pdfReport` lit `mod.jsPDF || mod.default`, un
 * mock qui n'expose que `default` n'est PAS pris (piège déjà payé par pdfPrivacyRefus.test.ts).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { generateFinancialReport, type ReportData } from '../../services/pdfReport';
import { useFinanceStore } from '../../store/useFinanceStore';
import { logError } from '../../services/errorLogger';

type AppelJournal = { m: string; a: unknown[] };
const journal: AppelJournal[] = [];

vi.mock('jspdf', () => {
    class FauxPdf {
        constructor(...a: unknown[]) { journal.push({ m: 'new', a }); }
        setFont(...a: unknown[]) { journal.push({ m: 'setFont', a }); }
        setFontSize(...a: unknown[]) { journal.push({ m: 'setFontSize', a }); }
        setTextColor(...a: unknown[]) { journal.push({ m: 'setTextColor', a }); }
        setFillColor(...a: unknown[]) { journal.push({ m: 'setFillColor', a }); }
        setDrawColor(...a: unknown[]) { journal.push({ m: 'setDrawColor', a }); }
        rect(...a: unknown[]) { journal.push({ m: 'rect', a }); }
        text(...a: unknown[]) { journal.push({ m: 'text', a }); }
        line(...a: unknown[]) { journal.push({ m: 'line', a }); }
        addPage(...a: unknown[]) { journal.push({ m: 'addPage', a }); }
        setPage(...a: unknown[]) { journal.push({ m: 'setPage', a }); }
        save(...a: unknown[]) { journal.push({ m: 'save', a }); }
        internal = { pageSize: { getWidth: () => 216, getHeight: () => 279 } };
    }
    return { __esModule: true, jsPDF: FauxPdf, default: FauxPdf };
});

// Le chemin d'ÉCHEC (repli impression navigateur) passe par logError — l'espionner prouve que le
// rendu nominal n'emprunte JAMAIS le catch, sans dépendre de `window` (environnement node).
vi.mock('../../services/errorLogger', () => ({ logError: vi.fn() }));

const UTILISATEUR_FISCAL = (nom: string, brut: number) => ({
    name: nom, grossAnnual: brut, netAnnual: brut * 0.7, federalTax: brut * 0.15,
    quebecTax: brut * 0.12, rrq: 4_348, rqap: 494, ae: 1_049, totalTax: brut * 0.3,
    marginalRatePct: 41.12, averageRatePct: 29.6,
});

/** Fixture RICHE : chaque section optionnelle est présente et chaque branche interne visitée
 *  (dette sans `monthsToZero`, holding sans `accountType`, scénario best + scénario sans MC,
 *  nature de budget inconnue, note FX). */
const RICHE: ReportData = {
    netWorth: 850_000, monthlySavings: 1_850, monthlyIncome: 9_400, totalDebts: 312_000,
    celiBalance: 95_000, reerBalance: 210_000, investmentsTotal: 130_000, liquidityBalance: 24_000,
    budgetItems: [
        { name: 'Épicerie', nature: 'Besoin', target: 900, frequency: 'Monthly' },
        { name: 'Assurance auto', nature: 'Besoin', target: 1_440, frequency: 'Yearly' },
        { name: 'Resto', nature: 'Envie', target: 240, frequency: 'Quarterly' },
        { name: 'CELI auto', nature: 'Epargne', target: 120, frequency: 'Weekly' },
        { name: 'Divers', nature: '', target: 60, frequency: 'Monthly' },
    ],
    realEstateGoals: [{ name: 'Condo', price: 480_000, equity: 168_000 }],
    retirementTargetAge: 60, retirementTargetIncome: 4_500,
    generatedAt: '2026-09-04', lang: 'fr',
    fiscal: {
        year: 2026,
        perUser: [UTILISATEUR_FISCAL('Marc', 110_000), UTILISATEUR_FISCAL('Anna', 80_000)],
        totalGross: 190_000, totalNet: 133_000, totalTax: 57_000,
    },
    holdings: [
        { symbol: 'VEQT.TO', name: 'Vanguard All-Equity', quantity: 1200.5, currentPrice: 41.23, currency: 'CAD', valueCAD: 49_497, accountType: 'CELI' },
        { symbol: 'AAPL', name: 'Apple', quantity: 80, currentPrice: 230.11, currency: 'USD', valueCAD: 25_000 },
    ],
    fxRatesEstimated: true,
    debtsDetail: [
        { name: 'Hypothèque résidence', balance: 300_000, interestRatePct: 4.79, minimumPayment: 1_750, category: 'mortgage', monthsToZero: 264 },
        { name: 'Marge de crédit', balance: 12_000, interestRatePct: 8.2, minimumPayment: 240, category: 'credit_line' },
    ],
    goalsDetail: [
        { name: 'Fonds urgence', targetAmount: 30_000, currentAmount: 24_000, progressPct: 80, deadline: '2027-06' },
        { name: 'Voyage', targetAmount: 8_000, currentAmount: 1_200, progressPct: 15, deadline: '2028-01' },
    ],
    scenarios: [
        {
            strategyName: 'Cascade auto (marginal)', stratType: 'BASE', finalNetWorth: 2_100_000,
            estateNetWorth: 1_500_000, fvi: 88, successRate: 92, gainVsAuto: 0, isBest: true,
            pros: ['Souple selon le palier'], cons: ['Sensible aux seuils'],
        },
        {
            strategyName: 'Meltdown REER', stratType: 'MELTDOWN_REER', finalNetWorth: 2_050_000,
            estateNetWorth: 1_540_000, fvi: 84, successRate: null, gainVsAuto: -50_000, isBest: false,
            pros: [], cons: ['Impôt payé tôt'],
        },
    ],
};

/** Fixture MINIMALE : aucune section optionnelle, pas de dette, pas d'immobilier — visite les
 *  branches d'ABSENCE (pas de page fiscale/placements/dettes/objectifs/scénarios, texte noImmo). */
const MINIMALE: ReportData = {
    netWorth: 42_000, monthlySavings: 300, monthlyIncome: 3_100, totalDebts: 0,
    celiBalance: 20_000, reerBalance: 12_000, investmentsTotal: 0, liquidityBalance: 10_000,
    budgetItems: [], realEstateGoals: [],
    retirementTargetAge: 65, retirementTargetIncome: 3_000,
    generatedAt: '2026-09-04', lang: 'fr',
};

/** En-têtes de page rendus par `addPage`/`ensureRoom` : `« <page>  •  <date> »` en haut à droite.
 *  Les continuations (saut de page dans une section) répètent le même en-tête → dédupliqué. */
function pagesRendues(dateGeneration: string): string[] {
    const suffixe = `  •  ${dateGeneration}`;
    const brut = journal
        .filter(c => c.m === 'text' && typeof c.a[0] === 'string' && (c.a[0] as string).endsWith(suffixe))
        .map(c => (c.a[0] as string).slice(0, -suffixe.length));
    return brut.filter((p, i) => i === 0 || p !== brut[i - 1]);
}

const textesRendus = () => journal.filter(c => c.m === 'text').map(c => String(c.a[0]));

beforeEach(() => {
    journal.length = 0;
    vi.mocked(logError).mockClear();
    useFinanceStore.setState({ isPrivacyMode: false });
});

let nomDernierCas = '';
afterEach(() => {
    // Dump du journal complet pour le protocole d'équivalence avant/après (voir l'en-tête).
    const dossier = process.env.PDF_JOURNAL_OUT;
    if (dossier && nomDernierCas) {
        mkdirSync(dossier, { recursive: true });
        writeFileSync(join(dossier, `${nomDernierCas}.log`), journal.map(c => JSON.stringify(c)).join('\n'));
    }
});

describe('[DETTE-GODFN-PDF] structure du rendu PDF (journal jsPDF)', () => {
    it('fixture riche : les 8 pages sortent, dans l\'ordre du rapport', async () => {
        nomDernierCas = 'riche';
        await generateFinancialReport(RICHE);
        expect(pagesRendues('2026-09-04')).toEqual([
            'Synthèse Patrimoniale',
            'Situation Fiscale',
            'Détail Placements',
            'Détail Dettes',
            'Objectifs Financiers',
            'Projections & Scénarios',
            'Retraite & Immobilier',
            'Budget Mensuel',
        ]);
        // Témoins de CONTENU, un par section discriminant sa branche riche (pas un golden : des
        // faits stables — badge recommandé, note FX, « — » d'une dette sans horizon).
        const textes = textesRendus();
        expect(textes).toContain('[ RECOMMANDE ]');
        expect(textes.some(t => t.startsWith('Taux de change estimés'))).toBe(true);
        expect(textes).toContain('—'); // monthsToZero absent → tiret honnête, jamais un 0
        expect(textes).toContain('Total placements');
        expect(textes).toContain('Total dettes');
        // Le document est SAUVÉ (pas de repli impression), au nom daté attendu.
        const sauvegardes = journal.filter(c => c.m === 'save');
        expect(sauvegardes).toHaveLength(1);
        expect(String(sauvegardes[0].a[0])).toMatch(/^bilan_financier_\d{4}-\d{2}-\d{2}\.pdf$/);
        expect(logError).not.toHaveBeenCalled();
        // Anti-vacuité de l'enregistreur : mesuré 695 appels le 2026-09-04 sur cette fixture —
        // un plancher large en garde le sens (l'enregistreur VOIT le rendu) sans épingler le style.
        expect(journal.length).toBeGreaterThan(400);
    });

    it('fixture minimale : seulement Synthèse + Retraite, avec l\'état vide immobilier', async () => {
        nomDernierCas = 'minimale';
        await generateFinancialReport(MINIMALE);
        expect(pagesRendues('2026-09-04')).toEqual(['Synthèse Patrimoniale', 'Retraite & Immobilier']);
        const textes = textesRendus();
        expect(textes).toContain('Aucun projet immobilier configuré.');
        // totalDebts = 0 → pas de section Passif (jamais un « – 0 $ » plausible).
        expect(textes.some(t => t === 'Passif')).toBe(false);
        expect(logError).not.toHaveBeenCalled();
    });

    it('scenarios: [] (fourni mais vide) → la page existe et dit l\'absence, ne l\'invente pas', async () => {
        nomDernierCas = 'scenarios-vides';
        await generateFinancialReport({ ...MINIMALE, scenarios: [] });
        expect(pagesRendues('2026-09-04')).toEqual([
            'Synthèse Patrimoniale', 'Projections & Scénarios', 'Retraite & Immobilier',
        ]);
        expect(textesRendus().some(t => t.startsWith('Aucune projection disponible'))).toBe(true);
    });
});
