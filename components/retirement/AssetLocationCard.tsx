// components/retirement/AssetLocationCard.tsx
// Architecture refactor: extraction de la Card "Asset Location Optimizer"

import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { optimizeAssetLocation, type AssetClass, type AccountType } from '../../services/projection/assetLocation';

interface AssetLocationCardProps {
    annualGrossIncome: number;
}

const newId = () => Math.random().toString(36).slice(2, 10);

export const AssetLocationCard: React.FC<AssetLocationCardProps> = ({ annualGrossIncome }) => {
    const [holdings, setHoldings] = useState<Array<{ assetClass: AssetClass; amount: number; currentAccount: AccountType }>>([
        { assetClass: 'bonds', amount: 50000, currentAccount: 'CELI' },
        { assetClass: 'us-equity', amount: 100000, currentAccount: 'CELI' },
        { assetClass: 'ca-equity', amount: 50000, currentAccount: 'NonReg' },
    ]);
    const [result, setResult] = useState<ReturnType<typeof optimizeAssetLocation> | null>(null);

    return (
        <Card title="🧭 Asset Location Optimizer">
            <div className="space-y-3">
                <p className="text-[11px] text-gray-400">
                    Place chaque classe d'actif dans le bon compte (CELI/REER/NonReg) pour minimiser l'impôt. Règle d'or canadienne.
                </p>
                {holdings.map((h, i) => (
                    <div key={i} className="grid grid-cols-12 gap-1 items-center">
                        <select
                            value={h.assetClass}
                            onChange={e => { const next = [...holdings]; next[i] = { ...h, assetClass: e.target.value as AssetClass }; setHoldings(next); }}
                            className="col-span-4 bg-dark border border-border rounded px-1 py-1 text-[11px] text-white"
                        >
                            <option value="bonds">Obligations</option>
                            <option value="us-equity">Actions US</option>
                            <option value="ca-equity">Actions CAD</option>
                            <option value="international">International</option>
                            <option value="growth-small">Croissance/Small</option>
                            <option value="reit">REIT</option>
                            <option value="cash">Cash</option>
                        </select>
                        <input
                            type="number" value={h.amount}
                            onChange={e => { const next = [...holdings]; next[i] = { ...h, amount: Number(e.target.value) || 0 }; setHoldings(next); }}
                            className="col-span-4 bg-dark border border-border rounded px-1 py-1 text-[11px] text-white"
                        />
                        <select
                            value={h.currentAccount}
                            onChange={e => { const next = [...holdings]; next[i] = { ...h, currentAccount: e.target.value as AccountType }; setHoldings(next); }}
                            className="col-span-3 bg-dark border border-border rounded px-1 py-1 text-[11px] text-white"
                        >
                            <option value="CELI">CELI</option>
                            <option value="REER">REER</option>
                            <option value="NonReg">NonReg</option>
                        </select>
                        <button onClick={() => { const next = [...holdings]; next.splice(i, 1); setHoldings(next); }} className="col-span-1 text-red-400 text-xs">×</button>
                    </div>
                ))}
                <div className="flex gap-2">
                    <button
                        onClick={() => setHoldings([...holdings, { assetClass: 'us-equity', amount: 10000, currentAccount: 'CELI' }])}
                        className="text-[10px] px-2 py-1 bg-gray-800 rounded text-gray-300"
                    >
                        + Ligne
                    </button>
                    <button
                        onClick={() => setResult(optimizeAssetLocation({ annualGrossIncome, holdings }))}
                        className="text-[11px] px-3 py-1 bg-emerald-500/20 border border-emerald-500/50 rounded text-emerald-300 font-bold"
                    >
                        🔍 Analyser
                    </button>
                </div>
                {result && (
                    <div className="p-3 bg-emerald-900/30 border border-emerald-500/30 rounded-lg space-y-2">
                        <p className="text-xs text-emerald-200">{result.summary}</p>
                        {result.recommendations.map((r, i) => (
                            <div key={i} className="text-[10px] text-gray-300 p-2 bg-black/30 rounded">
                                <div className="flex justify-between">
                                    <span><strong>{r.assetClass}</strong> {r.amount.toLocaleString('fr-CA')}$ : <span className="text-orange-400">{r.currentAccount}</span> → <span className="text-emerald-400">{r.recommendedAccount}</span></span>
                                    <span className="text-red-300 font-mono">~-{r.annualLossIfUnchanged.toLocaleString('fr-CA')}$/an</span>
                                </div>
                                <p className="text-gray-500 mt-1">{r.rationale}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Card>
    );
};
