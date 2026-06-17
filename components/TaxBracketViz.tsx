// Phase G.3 — Visualisation tranches d'imposition.
//   Les BARRES + le détail $ montrent la répartition du revenu par palier (BRUT, avant crédits) —
//   pédagogique. Le TOTAL et le taux EFFECTIF affichés viennent de calculateFiscalReport (impôt NET,
//   crédits inclus : BPA + abattement QC) = l'impôt réel de la projection (fix M4, audit 2026-06-17).

import React from 'react';
import { Card } from './ui/Card';
import { FED_BRACKETS, QC_BRACKETS, calculateFiscalReport } from '../utils/tax';
import { formatCAD, formatPercent } from '../utils/format';
import { ChartDataTable, type ChartDataColumn } from './ui/ChartDataTable';

interface TaxBracketVizProps {
    annualGrossIncome: number;
    label?: string;
}

function computeTaxBreakdown(income: number, brackets: typeof FED_BRACKETS): { perBracket: Array<{ rate: number; income: number; tax: number; from: number; to: number }>; totalTax: number; marginalRate: number; effectiveRate: number } {
    let totalTax = 0;
    let prev = 0;
    let marginalRate = 0;
    const perBracket: Array<{ rate: number; income: number; tax: number; from: number; to: number }> = [];
    for (const b of brackets) {
        const max = b.upTo === Infinity ? Number.MAX_SAFE_INTEGER : b.upTo;
        const incomeInBracket = Math.max(0, Math.min(income, max) - prev);
        const taxInBracket = incomeInBracket * b.rate;
        perBracket.push({ rate: b.rate, income: incomeInBracket, tax: taxInBracket, from: prev, to: max });
        totalTax += taxInBracket;
        if (income > prev && income <= max) marginalRate = b.rate;
        prev = max;
        if (income <= max) break;
    }
    return { perBracket, totalTax, marginalRate, effectiveRate: income > 0 ? totalTax / income : 0 };
}

export const TaxBracketViz: React.FC<TaxBracketVizProps> = ({ annualGrossIncome, label }) => {
    const maxIncome = Math.max(annualGrossIncome * 1.2, 300000);

    const fedBreakdown = computeTaxBreakdown(annualGrossIncome, FED_BRACKETS as never);
    const qcBreakdown = computeTaxBreakdown(annualGrossIncome, QC_BRACKETS as never);
    // [M4] Total + taux effectif = impôt NET (crédits inclus) via la source unique calculateFiscalReport,
    // PAS la somme brute par palier (surévaluée). Les barres restent brutes (pédagogiques).
    const report = calculateFiscalReport(annualGrossIncome, 0, 0);
    const netRate = (net: number) => (annualGrossIncome > 0 ? net / annualGrossIncome : 0);

    const renderBracketBar = (
        brackets: typeof FED_BRACKETS,
        jurisdiction: string,
        colorBase: string,
        breakdown: ReturnType<typeof computeTaxBreakdown>,
        netTax: number,
    ) => {
        // [A11Y-TAXBRACKET] alternative texte (sr-only) au graphe de barres, opaque aux lecteurs d'écran (WCAG 1.1.1 A).
        const ladderColumns: ChartDataColumn[] = [
            { key: 'range', label: 'Tranche de revenu' },
            { key: 'rate', label: 'Taux marginal' },
        ];
        const ladderRows = brackets.map((b: { rate: number; upTo: number }, i: number) => ({
            range: `${formatCAD(i === 0 ? 0 : brackets[i - 1].upTo)} → ${b.upTo === Infinity ? '∞' : formatCAD(b.upTo)}`,
            rate: `${(b.rate * 100).toFixed(1)} %`,
        }));
        return (
            <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                    <h3 className="text-meta font-bold text-white">{jurisdiction}</h3>
                    <div className="text-tiny font-mono">
                        <span className="text-danger-400" title="Impôt net (crédits inclus)">{formatCAD(netTax)}</span>
                        <span className="text-ink-400 mx-1">·</span>
                        <span className="text-warning-400">{formatPercent(netRate(netTax) * 100, 2)} effectif</span>
                        <span className="text-ink-400 mx-1">·</span>
                        <span className="text-info-400">{formatPercent(breakdown.marginalRate * 100, 0)} marginal</span>
                    </div>
                </div>
                <div
                    className="relative h-8 bg-black/40 rounded overflow-hidden border border-white/10"
                    role="img"
                    aria-label={`Graphique des tranches d'imposition ${jurisdiction}. Revenu brut ${formatCAD(annualGrossIncome)}, taux marginal ${(breakdown.marginalRate * 100).toFixed(0)} %. Détail dans le tableau suivant.`}
                >
                    {/* Contenu purement visuel : masqué au SR (décrit par aria-label + ChartDataTable sr-only).
                        role="img" rend déjà les enfants présentationnels, mais aria-hidden lève toute ambiguïté inter-AT. */}
                    <div className="absolute inset-0" aria-hidden="true">
                    {brackets.map((b: { rate: number; upTo: number }, i: number) => {
                        const min = i === 0 ? 0 : brackets[i - 1].upTo;
                        const max = b.upTo === Infinity ? maxIncome : b.upTo;
                        const startPct = (min / maxIncome) * 100;
                        const widthPct = ((Math.min(max, maxIncome) - min) / maxIncome) * 100;
                        const intensity = 0.2 + (i / brackets.length) * 0.6;
                        return (
                            <div
                                key={i}
                                className="absolute top-0 h-full flex items-center justify-center"
                                style={{
                                    left: `${startPct}%`,
                                    width: `${widthPct}%`,
                                    background: `rgba(${colorBase}, ${intensity})`,
                                }}
                                title={`Tranche ${(b.rate * 100).toFixed(1)}% : ${formatCAD(min)} → ${b.upTo === Infinity ? '∞' : formatCAD(b.upTo)}`}
                            >
                                <span className="text-tiny text-white font-mono">{(b.rate * 100).toFixed(0)}%</span>
                            </div>
                        );
                    })}
                    {/* Marqueur du revenu */}
                    <div
                        className="absolute top-0 bottom-0 w-0.5 bg-yellow-400"
                        style={{ left: `${(annualGrossIncome / maxIncome) * 100}%` }}
                        title={`Revenu : ${formatCAD(annualGrossIncome)}`}
                    >
                        <div className="absolute -top-1 -translate-x-1/2 w-2 h-2 bg-yellow-400 rounded-full" />
                    </div>
                    </div>
                </div>
                <div className="flex justify-between text-tiny text-ink-400">
                    <span>0 $</span>
                    <span className="text-yellow-400 font-bold">{formatCAD(annualGrossIncome)}</span>
                    <span>{formatCAD(maxIncome)}</span>
                </div>

                <ChartDataTable
                    caption={`${jurisdiction} — paliers d'imposition ; revenu brut ${formatCAD(annualGrossIncome)}, taux marginal ${(breakdown.marginalRate * 100).toFixed(0)} %, impôt net ${formatCAD(netTax)}.`}
                    columns={ladderColumns}
                    rows={ladderRows}
                />

                {/* Phase G.3 — Détail $ par palier consommé */}
                <details className="text-tiny">
                    <summary className="cursor-pointer text-ink-400 hover:text-ink-200 italic">
                        Voir décomposition $ par tranche
                    </summary>
                    <div className="mt-1 space-y-0.5 pl-2 border-l border-white/10">
                        {breakdown.perBracket.map((b, i) => b.income > 0 && (
                            <div key={i} className="flex justify-between font-mono">
                                <span className="text-ink-400">
                                    {formatCAD(b.from)} → {b.to === Number.MAX_SAFE_INTEGER ? '∞' : formatCAD(b.to)}
                                </span>
                                <span>
                                    <span className="text-ink-300">{formatCAD(b.income)} × {(b.rate * 100).toFixed(1)}% = </span>
                                    <span className="text-red-300">{formatCAD(b.tax)}</span>
                                </span>
                            </div>
                        ))}
                    </div>
                </details>
            </div>
        );
    };

    const combinedMarginal = (fedBreakdown.marginalRate + qcBreakdown.marginalRate) * 100;
    // [M4] Effectif combiné = impôt NET total / revenu (crédits inclus), pas la somme des taux bruts.
    const combinedEffective = report.averageRate;

    return (
        <Card title={`Tranches d'imposition${label ? ` (${label})` : ''}`}>
            <div className="space-y-4">
                <p className="text-tiny text-ink-300 leading-snug">
                    Marqueur jaune = revenu brut annuel ({formatCAD(annualGrossIncome)}). Barres = répartition par
                    palier (AVANT crédits). Total/effectif = impôt NET (crédits inclus : BPA, abattement QC).
                    Marginal = taux du prochain dollar gagné.
                </p>
                {renderBracketBar(FED_BRACKETS as never, 'Fédéral (ARC)', '59, 130, 246', fedBreakdown, report.fedTax)}
                {renderBracketBar(QC_BRACKETS as never, 'Québec (Revenu Québec)', '236, 72, 153', qcBreakdown, report.qcTax)}
                <div className="grid grid-cols-2 gap-3 p-3 bg-white/5 rounded border border-white/10">
                    <div>
                        <div className="text-tiny text-ink-400 uppercase tracking-wide">Combiné effectif</div>
                        <div className="text-base font-bold text-warning-400 font-mono">{combinedEffective.toFixed(2)}%</div>
                    </div>
                    <div>
                        <div className="text-tiny text-ink-400 uppercase tracking-wide">Combiné marginal</div>
                        <div className="text-base font-bold text-info-400 font-mono">{combinedMarginal.toFixed(1)}%</div>
                    </div>
                </div>
                <p className="text-tiny text-ink-400 italic">
                    Pour optimiser : préfère REER si revenu actuel &gt; revenu à la retraite ;
                    privilégie CELI sinon. Bracket creep = augmenter dans une tranche fait BONDIR le marginal.
                </p>
            </div>
        </Card>
    );
};
