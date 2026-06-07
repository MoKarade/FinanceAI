// Phase G.3 — Visualisation tranches d'imposition ultra-précise.
//   Affiche la décomposition exacte du revenu dans chaque tranche, le taux
//   effectif (moyen) vs marginal, et un détail $ dans chaque palier.

import React from 'react';
import { Card } from './ui/Card';
import { FED_BRACKETS, QC_BRACKETS } from '../utils/tax';
import { formatCAD, formatPercent } from '../utils/format';

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

    const renderBracketBar = (
        brackets: typeof FED_BRACKETS,
        jurisdiction: string,
        colorBase: string,
        breakdown: ReturnType<typeof computeTaxBreakdown>,
    ) => {
        return (
            <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                    <h4 className="text-meta font-bold text-white">{jurisdiction}</h4>
                    <div className="text-tiny font-mono">
                        <span className="text-danger-400">{formatCAD(breakdown.totalTax)}</span>
                        <span className="text-ink-500 mx-1">·</span>
                        <span className="text-warning-400">{formatPercent(breakdown.effectiveRate * 100, 2)} effectif</span>
                        <span className="text-ink-500 mx-1">·</span>
                        <span className="text-info-400">{formatPercent(breakdown.marginalRate * 100, 0)} marginal</span>
                    </div>
                </div>
                <div className="relative h-8 bg-black/40 rounded overflow-hidden border border-white/10">
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
                <div className="flex justify-between text-tiny text-ink-500">
                    <span>0 $</span>
                    <span className="text-yellow-400 font-bold">{formatCAD(annualGrossIncome)}</span>
                    <span>{formatCAD(maxIncome)}</span>
                </div>

                {/* Phase G.3 — Détail $ par palier consommé */}
                <details className="text-tiny">
                    <summary className="cursor-pointer text-ink-400 hover:text-ink-200 italic">
                        Voir décomposition $ par tranche
                    </summary>
                    <div className="mt-1 space-y-0.5 pl-2 border-l border-white/10">
                        {breakdown.perBracket.map((b, i) => b.income > 0 && (
                            <div key={i} className="flex justify-between font-mono">
                                <span className="text-ink-500">
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
    const combinedEffective = (fedBreakdown.effectiveRate + qcBreakdown.effectiveRate) * 100;

    return (
        <Card title={`Tranches d'imposition${label ? ` (${label})` : ''}`}>
            <div className="space-y-4">
                <p className="text-tiny text-ink-300 leading-snug">
                    Marqueur jaune = revenu brut annuel ({formatCAD(annualGrossIncome)}).
                    Effectif = moyen pondéré sur toutes les tranches consommées.
                    Marginal = taux appliqué au prochain dollar gagné.
                </p>
                {renderBracketBar(FED_BRACKETS as never, 'Fédéral (ARC)', '59, 130, 246', fedBreakdown)}
                {renderBracketBar(QC_BRACKETS as never, 'Québec (Revenu Québec)', '236, 72, 153', qcBreakdown)}
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
                <p className="text-tiny text-ink-500 italic">
                    Pour optimiser : préfère REER si revenu actuel &gt; revenu à la retraite ;
                    privilégie CELI sinon. Bracket creep = augmenter dans une tranche fait BONDIR le marginal.
                </p>
            </div>
        </Card>
    );
};
