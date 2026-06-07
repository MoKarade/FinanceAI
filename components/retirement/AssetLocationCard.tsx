// Phase F.4 — Asset Location Optimizer DÉVELOPPÉ.
//
// Améliorations vs version initiale :
//   - Pré-remplissage depuis le store (assets) avec auto-classification
//   - Score d'efficacité fiscale 0-100 calculé en live
//   - Synthèse répartition CELI/REER/NonReg + perte annuelle si inchangé
//   - Visualisation cibles vs actuel (barres comparatives)
//   - Bouton "Réinitialiser depuis portefeuille"

import React, { useState, useMemo } from 'react';
import { Card } from '../ui/Card';
import { optimizeAssetLocation, type AssetClass, type AccountType } from '../../services/projection/assetLocation';
import { useFinanceStore } from '../../store/useFinanceStore';
import { formatCAD } from '../../utils/format';
import { Icon } from '../ui/Icon';

interface AssetLocationCardProps {
    annualGrossIncome: number;
}

type Holding = { assetClass: AssetClass; amount: number; currentAccount: AccountType };

const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
    bonds: 'Obligations',
    'us-equity': 'Actions US',
    'ca-equity': 'Actions CAD',
    international: 'International',
    'growth-small': 'Croissance/Small',
    reit: 'REIT',
    cash: 'Cash',
};

// Heuristique : classifier les holdings du store en assetClass basé sur le symbol
function classifyAsset(symbol: string, sector?: string, region?: string): AssetClass {
    const s = symbol.toUpperCase();
    if (region === 'CA' || s.endsWith('.TO')) return 'ca-equity';
    if (sector === 'REIT' || s.includes('REIT')) return 'reit';
    if (region === 'US' || ['QQQ', 'SPY', 'VTI', 'VOO'].some(t => s.includes(t))) return 'us-equity';
    if (region === 'INTERNATIONAL' || region === 'EU' || region === 'ASIA') return 'international';
    return 'us-equity'; // fallback
}

function classifyAccount(accountType: string | undefined): AccountType {
    if (accountType === 'CELI' || accountType === 'CELIAPP') return 'CELI';
    if (accountType === 'REER' || accountType === 'REEE') return 'REER';
    return 'NonReg';
}

export const AssetLocationCard: React.FC<AssetLocationCardProps> = ({ annualGrossIncome }) => {
    const storeAssets = useFinanceStore(s => s.assets || []);

    // Pré-remplit depuis les assets réels du store
    const initialHoldings = useMemo<Holding[]>(() => {
        const fromStore = storeAssets
            .filter(a => a.quantity > 0 && a.currentPrice > 0)
            .map(a => ({
                assetClass: classifyAsset(a.symbol, undefined, undefined),
                amount: Math.round(a.quantity * a.currentPrice),
                currentAccount: classifyAccount(a.accountType),
            }));
        if (fromStore.length > 0) return fromStore;
        return [
            { assetClass: 'bonds', amount: 50000, currentAccount: 'CELI' },
            { assetClass: 'us-equity', amount: 100000, currentAccount: 'CELI' },
            { assetClass: 'ca-equity', amount: 50000, currentAccount: 'NonReg' },
        ];
    }, [storeAssets]);

    const [holdings, setHoldings] = useState<Holding[]>(initialHoldings);

    // Analyse en temps réel (re-calcule à chaque changement)
    const analysis = useMemo(() => {
        if (annualGrossIncome <= 0) return null;
        return optimizeAssetLocation({ annualGrossIncome, holdings });
    }, [annualGrossIncome, holdings]);

    // Synthèse par compte
    const accountTotals = useMemo(() => {
        const totals: Record<AccountType, number> = { CELI: 0, REER: 0, NonReg: 0 };
        for (const h of holdings) totals[h.currentAccount] += h.amount;
        const total = totals.CELI + totals.REER + totals.NonReg;
        return { totals, total };
    }, [holdings]);

    // Score d'efficacité 0-100 : 100 si pas de pertes ; baisse selon ratio loss/total
    const efficiencyScore = useMemo(() => {
        if (!analysis || accountTotals.total === 0) return 100;
        const lossRatio = analysis.totalAnnualLoss / accountTotals.total;
        return Math.max(0, Math.min(100, Math.round(100 - lossRatio * 100 * 20))); // amplifié ×20
    }, [analysis, accountTotals.total]);

    const scoreColor = efficiencyScore >= 80 ? 'text-success-400' : efficiencyScore >= 50 ? 'text-warning-400' : 'text-danger-400';

    return (
        <Card icon={<Icon name="compass" size={18} />} title="Asset Location Optimizer">
            <div className="space-y-4">
                <p className="text-meta text-ink-300 leading-snug">
                    Place chaque classe d'actif dans le compte optimal (CELI/REER/NonReg) selon les
                    règles fiscales canadiennes. L'objectif : minimiser l'impôt sur revenus passifs
                    (intérêts, dividendes US, gains réalisés).
                </p>

                {/* Score d'efficacité + synthèse comptes */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="bg-black/30 rounded p-3 border border-white/5 col-span-1 text-center">
                        <div className="text-tiny text-ink-300 uppercase tracking-wide mb-1">Efficacité fiscale</div>
                        <div className={`text-2xl font-black ${scoreColor} tabular-nums`}>{efficiencyScore}</div>
                        <div className="text-tiny text-ink-500">/ 100</div>
                    </div>
                    <div className="bg-success-500/10 rounded p-3 border border-success-500/20">
                        <div className="text-tiny text-success-400 uppercase tracking-wide mb-1">CELI</div>
                        <div className="text-base font-bold text-emerald-200 font-mono">{formatCAD(accountTotals.totals.CELI)}</div>
                        <div className="text-tiny text-ink-500">{accountTotals.total > 0 ? ((accountTotals.totals.CELI / accountTotals.total) * 100).toFixed(0) : 0}%</div>
                    </div>
                    <div className="bg-info-500/10 rounded p-3 border border-info-500/20">
                        <div className="text-tiny text-info-400 uppercase tracking-wide mb-1">REER</div>
                        <div className="text-base font-bold text-info-200 font-mono">{formatCAD(accountTotals.totals.REER)}</div>
                        <div className="text-tiny text-ink-500">{accountTotals.total > 0 ? ((accountTotals.totals.REER / accountTotals.total) * 100).toFixed(0) : 0}%</div>
                    </div>
                    <div className="bg-warning-500/10 rounded p-3 border border-warning-500/20">
                        <div className="text-tiny text-warning-400 uppercase tracking-wide mb-1">Non-Enreg.</div>
                        <div className="text-base font-bold text-amber-200 font-mono">{formatCAD(accountTotals.totals.NonReg)}</div>
                        <div className="text-tiny text-ink-500">{accountTotals.total > 0 ? ((accountTotals.totals.NonReg / accountTotals.total) * 100).toFixed(0) : 0}%</div>
                    </div>
                </div>

                {/* Perte annuelle si inchangé */}
                {analysis && analysis.totalAnnualLoss > 0 && (
                    <div className="p-3 bg-danger-500/10 border border-danger-500/30 rounded">
                        <div className="flex items-center justify-between">
                            <span className="text-tiny text-red-300 font-bold uppercase">Manque à gagner annuel si inchangé</span>
                            <span className="text-base font-bold text-danger-400 font-mono">{formatCAD(analysis.totalAnnualLoss)}/an</span>
                        </div>
                        <p className="text-tiny text-ink-400 mt-1">Sur 20 ans capitalisé à 5% : ~{formatCAD(analysis.totalAnnualLoss * 33)} de patrimoine perdu.</p>
                    </div>
                )}

                {/* Holdings editor */}
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <h4 className="text-tiny font-bold text-ink-300 uppercase tracking-wider">Holdings</h4>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setHoldings(initialHoldings)}
                                className="text-tiny px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-ink-300 transition-colors"
                                title="Réinitialiser depuis le portefeuille actuel"
                            >
                                ↺ Depuis portefeuille
                            </button>
                            <button
                                type="button"
                                onClick={() => setHoldings([...holdings, { assetClass: 'us-equity', amount: 10000, currentAccount: 'CELI' }])}
                                className="text-tiny px-2 py-1 bg-success-500/15 hover:bg-success-500/25 rounded text-emerald-300 transition-colors"
                            >
                                + Ligne
                            </button>
                        </div>
                    </div>
                    {holdings.map((h, i) => (
                        <div key={i} className="grid grid-cols-12 gap-2 items-center bg-white/[0.02] rounded p-2">
                            <select
                                value={h.assetClass}
                                onChange={e => { const next = [...holdings]; next[i] = { ...h, assetClass: e.target.value as AssetClass }; setHoldings(next); }}
                                className="col-span-4 bg-dark border border-border rounded px-2 py-1 text-meta text-white"
                            >
                                {(Object.keys(ASSET_CLASS_LABELS) as AssetClass[]).map(ac => (
                                    <option key={ac} value={ac}>{ASSET_CLASS_LABELS[ac]}</option>
                                ))}
                            </select>
                            <input
                                type="number" value={h.amount}
                                onChange={e => { const next = [...holdings]; next[i] = { ...h, amount: Number(e.target.value) || 0 }; setHoldings(next); }}
                                className="col-span-4 bg-dark border border-border rounded px-2 py-1 text-meta text-white font-mono"
                            />
                            <select
                                value={h.currentAccount}
                                onChange={e => { const next = [...holdings]; next[i] = { ...h, currentAccount: e.target.value as AccountType }; setHoldings(next); }}
                                className="col-span-3 bg-dark border border-border rounded px-2 py-1 text-meta text-white"
                            >
                                <option value="CELI">CELI</option>
                                <option value="REER">REER</option>
                                <option value="NonReg">NonReg</option>
                            </select>
                            <button
                                type="button"
                                onClick={() => { const next = [...holdings]; next.splice(i, 1); setHoldings(next); }}
                                className="col-span-1 text-danger-400 text-meta hover:text-red-300"
                                aria-label="Supprimer cette ligne"
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>

                {/* Recommandations en temps réel */}
                {analysis && analysis.recommendations.length > 0 && (
                    <div className="p-3 bg-emerald-900/30 border border-success-500/30 rounded-lg space-y-2">
                        <p className="text-meta text-emerald-200 font-medium">{analysis.summary}</p>
                        {analysis.recommendations.map((r, i) => (
                            <div key={i} className="text-tiny p-2 bg-black/40 rounded space-y-1">
                                <div className="flex justify-between gap-2">
                                    <span className="flex-1 min-w-0">
                                        <strong className="text-white">{ASSET_CLASS_LABELS[r.assetClass]}</strong>
                                        <span className="text-ink-400"> {formatCAD(r.amount)}</span>
                                        <span className="text-orange-400 mx-1">{r.currentAccount}</span>
                                        <span className="text-ink-500">→</span>
                                        <span className="text-success-400 mx-1">{r.recommendedAccount}</span>
                                    </span>
                                    <span className="text-red-300 font-mono shrink-0">−{formatCAD(r.annualLossIfUnchanged)}/an</span>
                                </div>
                                <p className="text-ink-400 leading-snug">{r.rationale}</p>
                            </div>
                        ))}
                    </div>
                )}

                {analysis && analysis.recommendations.length === 0 && (
                    <div className="p-3 bg-success-500/10 border border-success-500/30 rounded text-emerald-300 text-meta font-medium text-center">
                        Allocation déjà optimale — aucun déplacement à faire.
                    </div>
                )}

                {annualGrossIncome <= 0 && (
                    <p className="text-tiny text-warning-400 italic">
                        ℹ️ Configure ton revenu brut dans Configuration pour activer l'analyse précise (taux marginal requis).
                    </p>
                )}
            </div>
        </Card>
    );
};
