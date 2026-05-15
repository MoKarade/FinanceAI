// components/TaxBracketViz.tsx
// W4.1 — Visualisation des tranches d'imposition fédérales + Québec
// avec marqueur du revenu actuel/projeté pour voir où l'utilisateur tombe.

import React from 'react';
import { Card } from './ui/Card';
import { FED_BRACKETS, QC_BRACKETS } from '../utils/tax';

interface TaxBracketVizProps {
    annualGrossIncome: number;
    label?: string;
}

export const TaxBracketViz: React.FC<TaxBracketVizProps> = ({ annualGrossIncome, label }) => {
    const maxIncome = Math.max(annualGrossIncome * 1.2, 300000);

    const renderBracketBar = (brackets: typeof FED_BRACKETS, jurisdiction: string, colorBase: string) => {
        return (
            <div className="space-y-1">
                <h4 className="text-xs font-bold text-white">{jurisdiction}</h4>
                <div className="relative h-8 bg-black/40 rounded overflow-hidden border border-white/10">
                    {brackets.map((b: any, i: number) => {
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
                                title={`Tranche ${(b.rate * 100).toFixed(1)}% jusqu'à ${b.upTo === Infinity ? '∞' : b.upTo.toLocaleString('fr-CA')}\$`}
                            >
                                <span className="text-tiny text-white font-mono">{(b.rate * 100).toFixed(0)}%</span>
                            </div>
                        );
                    })}
                    {/* Marqueur du revenu */}
                    <div
                        className="absolute top-0 bottom-0 w-0.5 bg-yellow-400"
                        style={{ left: `${(annualGrossIncome / maxIncome) * 100}%` }}
                        title={`Revenu: ${annualGrossIncome.toLocaleString('fr-CA')}\$`}
                    >
                        <div className="absolute -top-1 -translate-x-1/2 w-2 h-2 bg-yellow-400 rounded-full" />
                    </div>
                </div>
                <div className="flex justify-between text-tiny text-gray-500">
                    <span>0\$</span>
                    <span className="text-yellow-400 font-bold">{annualGrossIncome.toLocaleString('fr-CA')}\$</span>
                    <span>{Math.round(maxIncome / 1000)}k\$</span>
                </div>
            </div>
        );
    };

    return (
        <Card title={`💰 Tranches d'imposition${label ? ` (${label})` : ''}`}>
            <div className="space-y-3">
                <p className="text-tiny text-gray-400">
                    Marqueur jaune = ton revenu brut annuel ({annualGrossIncome.toLocaleString('fr-CA')}\$).
                    Vise à minimiser le temps passé dans les tranches au-dessus de 40%.
                </p>
                {renderBracketBar(FED_BRACKETS as any, '🇨🇦 Fédéral (ARC)', '59, 130, 246')}
                {renderBracketBar(QC_BRACKETS as any, '🟦 Québec (Revenu Québec)', '236, 72, 153')}
                <p className="text-tiny text-gray-500 italic">
                    Marginal combiné approximatif: {(() => {
                        const fed = FED_BRACKETS.find((b: any) => annualGrossIncome <= b.upTo)?.rate || 0;
                        const qc = QC_BRACKETS.find((b: any) => annualGrossIncome <= b.upTo)?.rate || 0;
                        return ((fed + qc) * 100).toFixed(1);
                    })()}%
                </p>
            </div>
        </Card>
    );
};
