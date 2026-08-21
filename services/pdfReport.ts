// P1.5 — PDF report complet (patrimoine, fiscal, holdings, dettes, goals, budget, retraite).
//
// Architecture :
//   - Builders (purs, testables) qui dérivent les données depuis AppState
//   - generateFinancialReport(data) — entry historique, rétro-compatible
//   - generateCompleteReport(state, opts) — nouvelle entry qui consomme directement AppState
//   - Fallback browser print() si jsPDF indisponible
//
// Le chargement de jspdf reste lazy (595KB vendor) — import dynamique au clic.

import type { AppState, Asset, Debt, FinancialGoal } from '../types';
import type { ProjectionResult } from './projection/types';
import { calculateFiscalReport } from '../utils/tax';
import { formatCAD } from '../utils/format';
import { assetValueCad } from './portfolio';
import { logError } from './errorLogger';
import { useFinanceStore } from '../store/useFinanceStore';

// ============================================================================
// Types — payload de report
// ============================================================================

export interface HoldingRow {
    symbol: string;
    name: string;
    quantity: number;
    currentPrice: number;
    currency: 'USD' | 'CAD' | 'EUR';
    valueCAD: number;
    accountType?: string;
    performancePct?: number;
}

export interface DebtRow {
    name: string;
    balance: number;
    interestRatePct: number;
    minimumPayment: number;
    category: string;
    monthsToZero?: number;
}

export interface GoalRow {
    name: string;
    targetAmount: number;
    currentAmount: number;
    progressPct: number;
    deadline: string;
    status?: string;
}

export interface FiscalSummary {
    year: number;
    perUser: Array<{
        name: string;
        grossAnnual: number;
        netAnnual: number;
        federalTax: number;
        quebecTax: number;
        rrq: number;
        rqap: number;
        ae: number;
        totalTax: number;
        marginalRatePct: number;
        averageRatePct: number;
    }>;
    totalGross: number;
    totalNet: number;
    totalTax: number;
}

export interface ScenarioRow {
    strategyName: string;
    stratType: string;
    finalNetWorth: number;
    estateNetWorth: number;
    fvi: number | null;
    successRate: number | null;
    gainVsAuto: number | null;
    isBest: boolean;
    pros: string[];
    cons: string[];
}

export interface ReportData {
    netWorth: number;
    monthlySavings: number;
    monthlyIncome: number;
    totalDebts: number;
    celiBalance: number;
    reerBalance: number;
    investmentsTotal: number;
    liquidityBalance: number;
    budgetItems: Array<{ name: string; nature: string; target: number; frequency: string }>;
    realEstateGoals: Array<{ name: string; price: number; equity: number }>;
    retirementTargetAge: number;
    retirementTargetIncome: number;
    userName?: string;
    generatedAt: string;
    lang?: string; // 'fr' | 'en'
    // P1.5 — nouvelles sections optionnelles
    fiscal?: FiscalSummary;
    holdings?: HoldingRow[];
    /** [FX-FALLBACK-SILENCIEUX] : au moins un holding en devise étrangère ET le taux vient du
     *  repli en dur (jamais récupéré) — ajoute une note sous le total des placements. `undefined`/
     *  `false` = rien n'est ajouté (rétrocompat des appelants qui ne le fournissent pas). */
    fxRatesEstimated?: boolean;
    debtsDetail?: DebtRow[];
    goalsDetail?: GoalRow[];
    // PDF Futur — comparaison de scénarios de projection
    scenarios?: ScenarioRow[];
}

// ============================================================================
// Builders purs (testables) — dérivent depuis AppState
// ============================================================================

/** Convertit `assets` en holdings avec valeur CAD. Trie par valeur décroissante. */
export function buildHoldingsRows(state: Pick<AppState, 'assets' | 'fxRates'>): HoldingRow[] {
    return state.assets
        .map((a: Asset): HoldingRow => ({
            symbol: a.symbol,
            name: a.name,
            quantity: a.quantity,
            currentPrice: a.currentPrice,
            currency: a.currency,
            // [DETTE-PDF-FX-BYPASS] source unique (FX + garde NaN/Infinity + devise absente signalée) —
            // JAMAIS `quantity × currentPrice × fx` à la main : le prix est stocké en devise NATIVE et
            // un repli fxRates[currency]||1 muet sous-affiche le patrimoine (incident ASSET-FX-DISPLAY).
            valueCAD: assetValueCad(a, state.fxRates),
            accountType: a.accountType,
            performancePct: a.performance,
        }))
        .sort((x, y) => y.valueCAD - x.valueCAD);
}

/** Calcule le nombre de mois jusqu'à extinction (avalanche simple sans intérêt composé précis). */
function estimateMonthsToZero(balance: number, payment: number, annualRatePct: number): number | undefined {
    if (payment <= 0 || balance <= 0) return undefined;
    const monthlyRate = (annualRatePct / 100) / 12;
    if (monthlyRate <= 0) return Math.ceil(balance / payment);
    // Formule: N = -log(1 - (r * B / P)) / log(1 + r)
    const denominator = 1 - (monthlyRate * balance) / payment;
    if (denominator <= 0) return undefined; // paiement < intérêt mensuel → jamais
    const n = -Math.log(denominator) / Math.log(1 + monthlyRate);
    return Math.ceil(n);
}

export function buildDebtsRows(state: Pick<AppState, 'debts'>): DebtRow[] {
    return state.debts
        .map((d: Debt): DebtRow => ({
            name: d.name,
            balance: d.balance,
            interestRatePct: d.interestRate,
            minimumPayment: d.minimumPayment,
            category: d.category,
            monthsToZero: estimateMonthsToZero(d.balance, d.minimumPayment, d.interestRate),
        }))
        .sort((x, y) => y.balance - x.balance);
}

export function buildGoalsRows(state: Pick<AppState, 'financialGoals'>): GoalRow[] {
    return state.financialGoals
        .filter(g => g.status !== 'archived')
        .map((g: FinancialGoal): GoalRow => {
            const current = g.manualCurrentAmount ?? 0;
            const target = g.targetAmount > 0 ? g.targetAmount : 1; // évite /0
            return {
                name: g.name,
                targetAmount: g.targetAmount,
                currentAmount: current,
                progressPct: Math.max(0, Math.min(100, (current / target) * 100)),
                deadline: g.deadline,
                status: g.status,
            };
        });
}

/** Calcule la fiche fiscale par user en utilisant calculateFiscalReport (utils/tax). */
export function buildFiscalSummary(state: Pick<AppState, 'config'>, year: number = new Date().getFullYear()): FiscalSummary {
    const perUser = state.config.users
        .filter(u => u.grossSalary > 0)
        .map(u => {
            const grossAnnual = (u.grossSalary || 0) * 12;
            const rrspContribution = 0; // P1.5 — pas d'input dédié dans la signature, peut être étendu
            const fhsaContribution = 0;
            const r = calculateFiscalReport(grossAnnual, rrspContribution, fhsaContribution, year, true);
            return {
                name: u.name || '—',
                grossAnnual,
                netAnnual: r.netIncome,
                federalTax: r.fedTax,
                quebecTax: r.qcTax,
                rrq: r.rrq,
                rqap: r.rqap,
                ae: r.ae,
                totalTax: r.totalTax,
                marginalRatePct: r.marginalRate * 100,
                averageRatePct: r.averageRate,
            };
        });
    const totalGross = perUser.reduce((s, u) => s + u.grossAnnual, 0);
    const totalNet = perUser.reduce((s, u) => s + u.netAnnual, 0);
    const totalTax = perUser.reduce((s, u) => s + u.totalTax, 0);
    return { year, perUser, totalGross, totalNet, totalTax };
}

/**
 * Convertit allResults d'une ProjectionResult en ScenarioRow[].
 * @param allResults - tableau des scénarios calculés par le moteur
 * @param bestIdx - index du meilleur scénario (bestStrategyIdx du parent)
 */
export function buildScenariosRows(
    allResults: ProjectionResult[],
    bestIdx?: number,
): ScenarioRow[] {
    return allResults
        .filter(r => Boolean(r.strategyName || r.stratType))
        .map((r, i) => ({
            strategyName: r.strategyName || String(r.stratType || '—'),
            stratType: String(r.stratType || ''),
            finalNetWorth: typeof r.finalNetWorth === 'number' ? r.finalNetWorth : 0,
            estateNetWorth: typeof r.estateNetWorth === 'number' ? r.estateNetWorth : 0,
            fvi: typeof r.fvi === 'number' ? r.fvi : null,
            successRate: typeof r.successRate === 'number' ? r.successRate : null,
            gainVsAuto: typeof r.gainVsAuto === 'number' ? r.gainVsAuto : null,
            isBest: i === (bestIdx ?? -1),
            pros: Array.isArray(r.pros) ? r.pros.slice(0, 2) : [],
            cons: Array.isArray(r.cons) ? r.cons.slice(0, 2) : [],
        }));
}

// ============================================================================
// Format helpers
// ============================================================================

// DETTE-PDF-FORMAT — `formatCAD` vient désormais de `utils/format` (source unique fr-CA, gère
// les valeurs non finies → '—' au lieu de « NaN $ »). L'ancienne réimplémentation locale est retirée.

const formatPct = (v: number, digits: number = 1) =>
    `${v.toFixed(digits)}%`;

// ============================================================================
// Main entry — generateFinancialReport (compat existante, étendue)
// ============================================================================

/**
 * [A11Y-PRIVACY-PDF-CONTRAT] Refus de générer en mode discret — décision Marc 2026-08-17
 * (`docs/adr/0012-quatre-decisions-de-marc-2026-08-17.md`).
 *
 * ⚠️ POURQUOI UN REFUS, et pas un PDF masqué. Un PDF **SORT de l'app et survit au mode** : le
 * fichier ne sait pas qu'il a été produit depuis un écran masqué. Générer en clair depuis un écran
 * volontairement masqué est donc un piège — l'utilisateur croit ses montants protégés alors qu'il
 * vient d'en fabriquer une copie permanente. Générer en « ••• » donnerait un rapport financier sans
 * chiffres, c'est-à-dire rien. Refuser est le seul comportement qui ne trompe personne.
 *
 * ⚠️ LA GARDE EST AU SERVICE, PAS SEULEMENT AU CLIC. Une borne posée uniquement dans `App.tsx`
 * laisserait passer tout futur appelant (bouton ailleurs, raccourci, outil MCP, script) — c'est
 * exactement le motif corrigé sur `clampSplitPct`, où la borne UI seule laissait passer un import
 * de sauvegarde. Le contrat vit donc là où le fichier est produit.
 */
export class PdfRefusedPrivacyError extends Error {
    constructor() {
        super('Export PDF refusé : le mode discret est actif.');
        this.name = 'PdfRefusedPrivacyError';
    }
}

export async function generateFinancialReport(data: ReportData): Promise<void> {
    // ⚠️ Lu au moment de l'APPEL, pas capturé en amont : le mode a pu être activé entre le rendu du
    // bouton et le clic. Et on refuse AVANT tout travail — pas au moment d'écrire le fichier, pour
    // ne pas laisser un PDF partiel derrière soi.
    if (useFinanceStore.getState().isPrivacyMode) throw new PdfRefusedPrivacyError();

    const isFr = (data.lang || 'fr') !== 'en';
    const L = {
        title: isFr ? 'FinanceAI — Bilan Financier Personnel' : 'FinanceAI — Personal Financial Report',
        netWorthLabel: isFr ? 'Actif Net Total' : 'Total Net Worth',
        assets: isFr ? 'Répartition des Actifs' : 'Asset Breakdown',
        celi: 'CELI / TFSA',
        reer: 'REER / RRSP',
        nonReg: isFr ? 'Placements Non-Enregistrés' : 'Non-Registered Investments',
        liq: isFr ? 'Liquidités disponibles' : 'Available Cash',
        debts: isFr ? 'Dettes totales' : 'Total Debts',
        monthly: isFr ? 'Flux Mensuels' : 'Monthly Cash Flows',
        income: isFr ? 'Revenus nets mensuels' : 'Monthly Net Income',
        savings: isFr ? 'Épargne nette mensuelle' : 'Monthly Net Savings',
        retirement: isFr ? 'Planification Retraite & Immobilier' : 'Retirement & Real Estate',
        retirAge: isFr ? 'Âge cible de retraite' : 'Target Retirement Age',
        retirIncome: isFr ? 'Revenu mensuel souhaité' : 'Desired Monthly Income',
        retirYears: isFr ? ' ans' : ' yrs',
        immo: isFr ? 'Immobilier' : 'Real Estate',
        noImmo: isFr ? 'Aucun projet immobilier configuré.' : 'No real estate project configured.',
        equity: isFr ? 'Équité bâtie' : 'Built Equity',
        budget: isFr ? 'Budget Mensuel' : 'Monthly Budget',
        patPage: isFr ? 'Synthèse Patrimoniale' : 'Wealth Summary',
        retPage: isFr ? 'Retraite & Immobilier' : 'Retirement & Real Estate',
        budPage: isFr ? 'Budget Mensuel' : 'Monthly Budget',
        fiscalPage: isFr ? 'Situation Fiscale' : 'Tax Situation',
        holdingsPage: isFr ? 'Détail Placements' : 'Holdings Detail',
        debtsPage: isFr ? 'Détail Dettes' : 'Debt Detail',
        goalsPage: isFr ? 'Objectifs Financiers' : 'Financial Goals',
        fiscalTotalGross: isFr ? 'Revenu brut combiné' : 'Combined Gross Income',
        fiscalTotalNet: isFr ? 'Revenu net combiné' : 'Combined Net Income',
        fiscalTotalTax: isFr ? 'Impôts & cotisations totaux' : 'Total Taxes & Contributions',
        fiscalUserSection: isFr ? 'Par contribuable' : 'Per Taxpayer',
        marginalRate: isFr ? 'Taux marginal' : 'Marginal Rate',
        averageRate: isFr ? 'Taux moyen' : 'Average Rate',
        fed: isFr ? 'Fédéral' : 'Federal',
        qc: isFr ? 'Québec' : 'Quebec',
        rrq: 'RRQ',
        rqap: 'RQAP',
        ae: isFr ? 'AE' : 'EI',
        symbol: isFr ? 'Symbole' : 'Symbol',
        qty: isFr ? 'Qté' : 'Qty',
        price: isFr ? 'Prix' : 'Price',
        value: isFr ? 'Valeur CAD' : 'CAD Value',
        account: isFr ? 'Compte' : 'Account',
        rate: isFr ? 'Taux' : 'Rate',
        payment: isFr ? 'Paiement min' : 'Min Payment',
        months: isFr ? 'Mois rest.' : 'Months left',
        target: isFr ? 'Cible' : 'Target',
        current: isFr ? 'Actuel' : 'Current',
        progress: isFr ? 'Progrès' : 'Progress',
        deadline: isFr ? 'Échéance' : 'Deadline',
        noHoldings: isFr ? 'Aucun placement.' : 'No holdings.',
        noDebts: isFr ? 'Aucune dette.' : 'No debts.',
        noGoals: isFr ? 'Aucun objectif financier actif.' : 'No active financial goals.',
        scenariosPage: isFr ? 'Projections & Scénarios' : 'Projections & Scenarios',
        scenBest: isFr ? 'RECOMMANDE' : 'RECOMMENDED',
        scenFinal: isFr ? 'Actif net final' : 'Final net worth',
        scenEstate: isFr ? 'Succession' : 'Estate',
        scenSurvival: isFr ? 'Survie MC' : 'MC survival',
        scenFvi: isFr ? 'Score FVI' : 'FVI score',
        scenGain: isFr ? 'Gain vs auto' : 'Gain vs auto',
        scenPros: isFr ? 'Avantages' : 'Pros',
        scenCons: isFr ? 'Inconvénients' : 'Cons',
        scenNoData: isFr ? 'Aucune projection disponible. Lance une simulation dans l\'onglet Futur.' : 'No projection available. Run a simulation in the Future tab.',
        footer: (p: number, total: number) => isFr
            ? `FinanceAI — Document confidentiel généré le ${data.generatedAt} — Page ${p}/${total}`
            : `FinanceAI — Confidential document generated on ${data.generatedAt} — Page ${p}/${total}`,
    };

    try {
        // Try named export first, then default
        let jsPDFClass: unknown;
        try {
            const mod = await import('jspdf');
            jsPDFClass = (mod as { jsPDF?: unknown; default?: unknown }).jsPDF
                || (mod as { default?: unknown }).default;
        } catch {
            throw new Error('jsPDF not available');
        }

        if (typeof jsPDFClass !== 'function') {
            throw new Error('jsPDF constructor not found');
        }

        // jspdf types are out of bounds for our minimal usage; treat doc as a structural type.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const JsPDFCtor = jsPDFClass as new (opts: unknown) => any;
        const doc = new JsPDFCtor({ orientation: 'portrait', unit: 'mm', format: 'letter' });

        const primary = [16, 185, 129] as [number, number, number]; // emerald
        const dark = [13, 15, 20] as [number, number, number];
        const gray = [100, 110, 130] as [number, number, number];
        const W = doc.internal.pageSize.getWidth();
        const PAGE_BOTTOM_LIMIT = 250; // mm — au-delà on saute de page (letter ~279mm - marge basse)

        // -------- Helpers de rendu --------

        let pageCounter = 0;
        const addPage = (pageName: string) => {
            pageCounter += 1;
            if (pageCounter > 1) doc.addPage();
            doc.setFillColor(...dark);
            doc.rect(0, 0, W, 22, 'F');
            doc.setFillColor(...primary);
            doc.rect(0, 22, W, 1.5, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.text(L.title, 14, 14);
            doc.setTextColor(...gray);
            doc.setFontSize(8);
            doc.text(`${pageName}  •  ${data.generatedAt}`, W - 14, 14, { align: 'right' });
        };

        let y = 34;
        const resetY = () => { y = 34; };

        const ensureRoom = (lines: number, pageName: string) => {
            if (y > PAGE_BOTTOM_LIMIT - lines * 6) {
                doc.addPage();
                pageCounter += 1;
                // Re-render mini header on continuation
                doc.setFillColor(...dark);
                doc.rect(0, 0, W, 22, 'F');
                doc.setFillColor(...primary);
                doc.rect(0, 22, W, 1.5, 'F');
                doc.setTextColor(255, 255, 255);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(11);
                doc.text(L.title, 14, 14);
                doc.setTextColor(...gray);
                doc.setFontSize(8);
                doc.text(`${pageName}  •  ${data.generatedAt}`, W - 14, 14, { align: 'right' });
                resetY();
            }
        };

        const row = (label: string, value: string, color?: [number, number, number]) => {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...gray);
            doc.text(label, 20, y);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...(color || [220, 225, 235] as [number, number, number]));
            doc.text(value, W - 20, y, { align: 'right' });
            doc.setDrawColor(50, 55, 70);
            doc.line(20, y + 2.5, W - 20, y + 2.5);
            y += 10;
        };

        const sectionTitle = (txt: string, color: [number, number, number] = primary) => {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(...color);
            doc.text(txt, 20, y);
            y += 8;
        };

        // ------- PAGE: PATRIMOINE -------
        addPage(L.patPage);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(...primary);
        doc.text(L.netWorthLabel, 20, y);
        doc.setFontSize(18);
        doc.setTextColor(255, 255, 255);
        doc.text(formatCAD(data.netWorth), W - 20, y, { align: 'right' });
        y += 14;

        sectionTitle(L.assets);
        row(L.celi, formatCAD(data.celiBalance), [34, 197, 94]);
        row(L.reer, formatCAD(data.reerBalance), [59, 130, 246]);
        row(L.nonReg, formatCAD(data.investmentsTotal), [168, 85, 247]);
        row(L.liq, formatCAD(data.liquidityBalance), [6, 182, 212]);

        if (data.totalDebts > 0) {
            y += 4;
            sectionTitle(isFr ? 'Passif' : 'Liabilities', [239, 68, 68]);
            row(L.debts, `– ${formatCAD(data.totalDebts)}`, [239, 68, 68]);
        }

        y += 6;
        sectionTitle(L.monthly);
        row(L.income, formatCAD(data.monthlyIncome), [34, 197, 94]);
        row(L.savings, formatCAD(data.monthlySavings), [34, 197, 94]);

        // ------- PAGE: FISCAL (nouveau) -------
        if (data.fiscal && data.fiscal.perUser.length > 0) {
            addPage(L.fiscalPage);
            resetY();

            sectionTitle(`${L.fiscalPage} ${data.fiscal.year}`);
            row(L.fiscalTotalGross, formatCAD(data.fiscal.totalGross));
            row(L.fiscalTotalNet, formatCAD(data.fiscal.totalNet), [34, 197, 94]);
            row(L.fiscalTotalTax, `– ${formatCAD(data.fiscal.totalTax)}`, [239, 68, 68]);

            y += 6;
            sectionTitle(L.fiscalUserSection);

            data.fiscal.perUser.forEach(u => {
                ensureRoom(10, L.fiscalPage);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(255, 255, 255);
                doc.text(u.name, 20, y);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...gray);
                doc.setFontSize(8);
                doc.text(`${L.marginalRate}: ${formatPct(u.marginalRatePct)} · ${L.averageRate}: ${formatPct(u.averageRatePct)}`, W - 20, y, { align: 'right' });
                y += 6;
                row(`  ${isFr ? 'Brut annuel' : 'Annual gross'}`, formatCAD(u.grossAnnual));
                row(`  ${isFr ? 'Net annuel' : 'Annual net'}`, formatCAD(u.netAnnual), [34, 197, 94]);
                row(`  ${L.fed}`, formatCAD(u.federalTax), [239, 68, 68]);
                row(`  ${L.qc}`, formatCAD(u.quebecTax), [239, 68, 68]);
                row(`  ${L.rrq}`, formatCAD(u.rrq));
                row(`  ${L.rqap}`, formatCAD(u.rqap));
                row(`  ${L.ae}`, formatCAD(u.ae));
                y += 4;
            });
        }

        // ------- PAGE: HOLDINGS (nouveau) -------
        if (data.holdings && data.holdings.length > 0) {
            addPage(L.holdingsPage);
            resetY();

            sectionTitle(L.holdingsPage);

            // Table header
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(...gray);
            doc.text(L.symbol, 20, y);
            doc.text(L.qty, 65, y);
            doc.text(L.price, 95, y);
            doc.text(L.account, 130, y);
            doc.text(L.value, W - 20, y, { align: 'right' });
            doc.setDrawColor(70, 75, 90);
            doc.line(20, y + 1.5, W - 20, y + 1.5);
            y += 6;

            const total = data.holdings.reduce((s, h) => s + h.valueCAD, 0);
            data.holdings.forEach(h => {
                ensureRoom(2, L.holdingsPage);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                doc.setTextColor(255, 255, 255);
                doc.text(h.symbol.slice(0, 12), 20, y);
                doc.setTextColor(...gray);
                doc.text(h.quantity.toFixed(2), 65, y);
                doc.text(`${h.currentPrice.toFixed(2)} ${h.currency}`, 95, y);
                doc.text(h.accountType || '—', 130, y);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(220, 225, 235);
                doc.text(formatCAD(h.valueCAD), W - 20, y, { align: 'right' });
                doc.setDrawColor(40, 45, 55);
                doc.line(20, y + 1.5, W - 20, y + 1.5);
                y += 5.5;
            });

            // Total
            y += 2;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(...primary);
            doc.text(isFr ? 'Total placements' : 'Total holdings', 20, y);
            doc.text(formatCAD(total), W - 20, y, { align: 'right' });

            // [FX-FALLBACK-SILENCIEUX] : le total ci-dessus convertit les holdings en devise
            // étrangère via le taux du store — le repli en dur n'était visible que dans la page
            // technique SystemView. Note discrète, seulement quand elle s'applique.
            if (data.fxRatesEstimated) {
                y += 5;
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(7);
                doc.setTextColor(...gray);
                doc.text(
                    isFr
                        ? 'Taux de change estimés (non récupérés) — total en devise étrangère approximatif.'
                        : 'Estimated exchange rates (not fetched) — foreign-currency total is approximate.',
                    20, y,
                );
            }
        }

        // ------- PAGE: DETTES (nouveau) -------
        if (data.debtsDetail && data.debtsDetail.length > 0) {
            addPage(L.debtsPage);
            resetY();

            sectionTitle(L.debtsPage, [239, 68, 68]);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(...gray);
            doc.text(isFr ? 'Nom' : 'Name', 20, y);
            doc.text(L.rate, 90, y);
            doc.text(L.payment, 115, y);
            doc.text(L.months, 150, y);
            doc.text(isFr ? 'Solde' : 'Balance', W - 20, y, { align: 'right' });
            doc.setDrawColor(70, 75, 90);
            doc.line(20, y + 1.5, W - 20, y + 1.5);
            y += 6;

            const totalBalance = data.debtsDetail.reduce((s, d) => s + d.balance, 0);
            data.debtsDetail.forEach(d => {
                ensureRoom(2, L.debtsPage);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                doc.setTextColor(255, 255, 255);
                doc.text(d.name.slice(0, 30), 20, y);
                doc.setTextColor(...gray);
                doc.text(formatPct(d.interestRatePct, 2), 90, y);
                doc.text(formatCAD(d.minimumPayment), 115, y);
                doc.text(d.monthsToZero !== undefined ? String(d.monthsToZero) : '—', 150, y);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(239, 68, 68);
                doc.text(formatCAD(d.balance), W - 20, y, { align: 'right' });
                doc.setDrawColor(40, 45, 55);
                doc.line(20, y + 1.5, W - 20, y + 1.5);
                y += 5.5;
            });

            y += 2;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(239, 68, 68);
            doc.text(isFr ? 'Total dettes' : 'Total debts', 20, y);
            doc.text(formatCAD(totalBalance), W - 20, y, { align: 'right' });
        }

        // ------- PAGE: GOALS (nouveau) -------
        if (data.goalsDetail && data.goalsDetail.length > 0) {
            addPage(L.goalsPage);
            resetY();

            sectionTitle(L.goalsPage);

            data.goalsDetail.forEach(g => {
                ensureRoom(4, L.goalsPage);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(255, 255, 255);
                doc.text(g.name, 20, y);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...gray);
                doc.setFontSize(8);
                doc.text(g.deadline, W - 20, y, { align: 'right' });
                y += 5;

                // Progress bar
                const barX = 20;
                const barW = W - 40;
                const barH = 3;
                doc.setFillColor(40, 45, 55);
                doc.rect(barX, y, barW, barH, 'F');
                const filledW = barW * (g.progressPct / 100);
                doc.setFillColor(...primary);
                doc.rect(barX, y, filledW, barH, 'F');
                y += barH + 3;

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                doc.setTextColor(...gray);
                doc.text(
                    `${formatCAD(g.currentAmount)} / ${formatCAD(g.targetAmount)} — ${formatPct(g.progressPct)}`,
                    20, y,
                );
                y += 8;
            });
        }

        // ------- PAGE: PROJECTIONS & SCÉNARIOS -------
        if (data.scenarios !== undefined) {
            addPage(L.scenariosPage);
            resetY();

            sectionTitle(L.scenariosPage);

            if (data.scenarios.length === 0) {
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(9);
                doc.setTextColor(...gray);
                doc.text(L.scenNoData, 20, y);
                y += 12;
            } else {
                data.scenarios.forEach(sc => {
                    ensureRoom(12, L.scenariosPage);

                    // --- Nom du scénario + badge meilleur ---
                    const headerY = y;
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(10);
                    if (sc.isBest) {
                        doc.setTextColor(...primary);
                    } else {
                        doc.setTextColor(220, 225, 235);
                    }
                    doc.text(sc.strategyName.slice(0, 45), 20, headerY);

                    if (sc.isBest) {
                        doc.setFontSize(7);
                        doc.setTextColor(...primary);
                        doc.setFont('helvetica', 'bold');
                        doc.text(`[ ${L.scenBest} ]`, W - 20, headerY, { align: 'right' });
                    } else if (sc.fvi !== null) {
                        doc.setFontSize(8);
                        doc.setTextColor(...gray);
                        doc.setFont('helvetica', 'normal');
                        doc.text(`${L.scenFvi}: ${sc.fvi.toFixed(1)}`, W - 20, headerY, { align: 'right' });
                    }
                    y += 6;

                    // --- Métriques principales sur une ligne ---
                    const gainColor: [number, number, number] = sc.gainVsAuto !== null && sc.gainVsAuto > 0
                        ? [34, 197, 94]
                        : sc.gainVsAuto !== null && sc.gainVsAuto < 0
                            ? [239, 68, 68]
                            : [...gray] as [number, number, number];

                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(8);
                    doc.setTextColor(...gray);

                    const col1 = 20;
                    const col2 = 75;
                    const col3 = 135;

                    // Actif net final
                    doc.text(L.scenFinal + ':', col1, y);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(220, 225, 235);
                    doc.text(formatCAD(sc.finalNetWorth), col1, y + 4);

                    // Succession
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(...gray);
                    doc.text(L.scenEstate + ':', col2, y);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(220, 225, 235);
                    doc.text(formatCAD(sc.estateNetWorth), col2, y + 4);

                    // Survie MC ou Gain
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(...gray);
                    if (sc.successRate !== null) {
                        doc.text(L.scenSurvival + ':', col3, y);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(sc.successRate >= 80 ? 34 : 239, sc.successRate >= 80 ? 197 : 68, sc.successRate >= 80 ? 94 : 68);
                        doc.text(formatPct(sc.successRate), col3, y + 4);
                    } else if (sc.gainVsAuto !== null && sc.stratType !== 'BASE') {
                        doc.text(L.scenGain + ':', col3, y);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(...gainColor);
                        const gainSign = sc.gainVsAuto > 0 ? '+' : '';
                        doc.text(`${gainSign}${formatCAD(sc.gainVsAuto)}`, col3, y + 4);
                    }

                    y += 12;

                    // --- Pros / Cons (max 2 chacun) ---
                    const hasPros = sc.pros.length > 0;
                    const hasCons = sc.cons.length > 0;

                    if (hasPros || hasCons) {
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(7.5);

                        if (hasPros) {
                            doc.setTextColor(34, 197, 94);
                            sc.pros.forEach(p => {
                                ensureRoom(2, L.scenariosPage);
                                doc.text(`+ ${p.slice(0, 85)}`, 22, y);
                                y += 4.5;
                            });
                        }

                        if (hasCons) {
                            doc.setTextColor(239, 68, 68);
                            sc.cons.forEach(c => {
                                ensureRoom(2, L.scenariosPage);
                                doc.text(`- ${c.slice(0, 85)}`, 22, y);
                                y += 4.5;
                            });
                        }
                    }

                    // Séparateur
                    doc.setDrawColor(45, 50, 65);
                    doc.line(20, y + 1, W - 20, y + 1);
                    y += 7;
                });
            }
        }

        // ------- PAGE: RETRAITE & IMMO -------
        addPage(L.retPage);
        resetY();

        sectionTitle(isFr ? 'Objectif Retraite' : 'Retirement Goal');
        row(L.retirAge, `${data.retirementTargetAge}${L.retirYears}`);
        row(L.retirIncome, formatCAD(data.retirementTargetIncome));

        y += 6;
        sectionTitle(L.immo, [236, 72, 153]);

        if (data.realEstateGoals.length > 0) {
            data.realEstateGoals.forEach(re => {
                row(re.name || (isFr ? 'Propriété' : 'Property'), formatCAD(re.price));
                if (re.equity > 0) row(`  ${L.equity}`, formatCAD(re.equity), [34, 197, 94]);
                y += 2;
            });
        } else {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(9);
            doc.setTextColor(...gray);
            doc.text(L.noImmo, 20, y);
            y += 10;
        }

        // ------- PAGE: BUDGET -------
        if (data.budgetItems.length > 0) {
            addPage(L.budPage);
            resetY();

            const grouped: Record<string, typeof data.budgetItems> = {};
            data.budgetItems.forEach(item => {
                const g = item.nature || 'Autre';
                if (!grouped[g]) grouped[g] = [];
                grouped[g].push(item);
            });

            const natureColor: Record<string, [number, number, number]> = {
                'Besoin': [59, 130, 246],
                'Need': [59, 130, 246],
                'Envie': [168, 85, 247],
                'Want': [168, 85, 247],
                'Epargne': [34, 197, 94],
                'Savings': [34, 197, 94],
            };

            for (const [nature, items] of Object.entries(grouped)) {
                const c = natureColor[nature] || [150, 150, 150] as [number, number, number];
                ensureRoom(3, L.budPage);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.setTextColor(...c);
                doc.text(nature, 20, y);
                y += 7;
                items.forEach(item => {
                    let m = item.target;
                    if (item.frequency === 'Yearly') m /= 12;
                    if (item.frequency === 'Quarterly') m /= 3;
                    if (item.frequency === 'Weekly') m *= 4.33;
                    ensureRoom(2, L.budPage);
                    row(`  ${item.name}`, formatCAD(Math.round(m)) + (isFr ? '/mois' : '/month'));
                });
                y += 4;
            }
        }

        // ------- Footer sur toutes les pages -------
        const totalPages = pageCounter;
        for (let p = 1; p <= totalPages; p++) {
            doc.setPage(p);
            doc.setFontSize(7);
            doc.setTextColor(...gray);
            doc.text(
                L.footer(p, totalPages),
                W / 2, doc.internal.pageSize.getHeight() - 8,
                { align: 'center' },
            );
        }

        const filename = `bilan_financier_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(filename);

    } catch (err) {
        // SF-PDF — échec jsPDF routé vers logError (visible en prod via SystemView), pas un
        // console.error invisible. Le repli ci-dessous ouvre le dialogue d'impression du navigateur.
        logError({ source: 'ui', severity: 'error', message: 'Génération PDF (jsPDF) échouée — repli sur le dialogue d\'impression', error: err });
        const w = typeof window !== 'undefined' ? window.open('', '_blank') : null;
        if (w) {
            w.document.write(`
                <html><head>
                <title>FinanceAI - Bilan</title>
                <style>
                  body { font-family: Arial, sans-serif; padding: 40px; color: #111; }
                  h1 { color: #10b981; }
                  table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                  td { padding: 8px 12px; border-bottom: 1px solid #eee; }
                  td:last-child { text-align: right; font-weight: bold; }
                  .section { font-weight: bold; color: #10b981; font-size: 14px; margin-top: 20px; }
                </style>
                </head><body>
                <h1>FinanceAI — Bilan Financier</h1>
                <p style="color:#888">Généré le ${data.generatedAt}</p>
                <div class="section">Patrimoine</div>
                <table>
                  <tr><td>Actif Net Total</td><td>${formatCAD(data.netWorth)}</td></tr>
                  <tr><td>CELI / TFSA</td><td>${formatCAD(data.celiBalance)}</td></tr>
                  <tr><td>REER / RRSP</td><td>${formatCAD(data.reerBalance)}</td></tr>
                  <tr><td>Non-Enregistré</td><td>${formatCAD(data.investmentsTotal)}</td></tr>
                  <tr><td>Liquidités</td><td>${formatCAD(data.liquidityBalance)}</td></tr>
                  ${data.totalDebts > 0 ? `<tr><td>Dettes</td><td style="color:red">-${formatCAD(data.totalDebts)}</td></tr>` : ''}
                </table>
                <div class="section">Flux Mensuels</div>
                <table>
                  <tr><td>Revenus nets</td><td>${formatCAD(data.monthlyIncome)}</td></tr>
                  <tr><td>Épargne nette</td><td>${formatCAD(data.monthlySavings)}</td></tr>
                </table>
                <div class="section">Retraite</div>
                <table>
                  <tr><td>Âge cible</td><td>${data.retirementTargetAge} ans</td></tr>
                  <tr><td>Revenu souhaité</td><td>${formatCAD(data.retirementTargetIncome)}/mois</td></tr>
                </table>
              </body></html>`);
            w.document.close();
            w.print();
        } else if (typeof window !== 'undefined') {
            window.print();
        }
    }
}
