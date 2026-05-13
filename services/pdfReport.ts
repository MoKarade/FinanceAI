/**
 * V18: Financial Report PDF Generator
 * Generates a multi-page PDF using jsPDF with a clean financial summary.
 * Falls back to browser print() if jsPDF fails.
 */

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
}

const formatCAD = (v: number) =>
    v.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0, maximumFractionDigits: 0 });

export async function generateFinancialReport(data: ReportData): Promise<void> {
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
        footer: (p: number, total: number) => isFr
            ? `FinanceAI — Document confidentiel généré le ${data.generatedAt} — Page ${p}/${total}`
            : `FinanceAI — Confidential document generated on ${data.generatedAt} — Page ${p}/${total}`,
    };

    try {
        // Try named export first, then default
        let jsPDFClass: any;
        try {
            const mod = await import('jspdf');
            jsPDFClass = (mod as any).jsPDF || (mod as any).default;
        } catch {
            throw new Error('jsPDF not available');
        }

        if (!jsPDFClass || typeof jsPDFClass !== 'function') {
            throw new Error('jsPDF constructor not found');
        }

        const doc = new jsPDFClass({ orientation: 'portrait', unit: 'mm', format: 'letter' });

        const primary = [16, 185, 129] as [number, number, number]; // emerald green
        const dark = [13, 15, 20] as [number, number, number];
        const gray = [100, 110, 130] as [number, number, number];
        const W = doc.internal.pageSize.getWidth();

        const addPage = (pageName: string, pageNum: number) => {
            if (pageNum > 1) doc.addPage();
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

        // ------- PAGE 1: PATRIMOINE -------
        addPage(L.patPage, 1);

        let y = 34;
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

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(...primary);
        doc.text(L.netWorthLabel, 20, y);
        doc.setFontSize(18);
        doc.setTextColor(255, 255, 255);
        doc.text(formatCAD(data.netWorth), W - 20, y, { align: 'right' });
        y += 14;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...primary);
        doc.text(L.assets, 20, y);
        y += 8;

        row(L.celi, formatCAD(data.celiBalance), [34, 197, 94]);
        row(L.reer, formatCAD(data.reerBalance), [59, 130, 246]);
        row(L.nonReg, formatCAD(data.investmentsTotal), [168, 85, 247]);
        row(L.liq, formatCAD(data.liquidityBalance), [6, 182, 212]);

        if (data.totalDebts > 0) {
            y += 4;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(239, 68, 68);
            doc.text(isFr ? 'Passif' : 'Liabilities', 20, y);
            y += 8;
            row(L.debts, `– ${formatCAD(data.totalDebts)}`, [239, 68, 68]);
        }

        y += 6;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...primary);
        doc.text(L.monthly, 20, y);
        y += 8;
        row(L.income, formatCAD(data.monthlyIncome), [34, 197, 94]);
        row(L.savings, formatCAD(data.monthlySavings), [34, 197, 94]);

        // ------- PAGE 2: RETRAITE & IMMOBILIER -------
        addPage(L.retPage, 2);
        y = 34;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...primary);
        doc.text(isFr ? 'Objectif Retraite' : 'Retirement Goal', 20, y);
        y += 10;
        row(L.retirAge, `${data.retirementTargetAge}${L.retirYears}`);
        row(L.retirIncome, formatCAD(data.retirementTargetIncome));

        y += 6;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(236, 72, 153);
        doc.text(L.immo, 20, y);
        y += 10;

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

        // ------- PAGE 3: BUDGET -------
        if (data.budgetItems.length > 0) {
            addPage(L.budPage, 3);
            y = 34;

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
                    row(`  ${item.name}`, formatCAD(Math.round(m)) + (isFr ? '/mois' : '/month'));
                    if (y > 240) {
                        doc.addPage();
                        y = 20;
                    }
                });
                y += 4;
            }
        }

        // Footer on all pages
        const pages = (doc.internal as any).pages?.length - 1;
        const totalPages = isNaN(pages) ? 3 : pages;
        for (let p = 1; p <= totalPages; p++) {
            doc.setPage(p);
            doc.setFontSize(7);
            doc.setTextColor(...gray);
            doc.text(
                L.footer(p, totalPages),
                W / 2, doc.internal.pageSize.getHeight() - 8,
                { align: 'center' }
            );
        }

        const filename = `bilan_financier_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(filename);
        console.log('✅ PDF generated:', filename);

    } catch (err) {
        console.error('[PDF] jsPDF failed:', err);
        // Fallback: open a print-friendly window
        const w = window.open('', '_blank');
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
        } else {
            window.print();
        }
    }
}
