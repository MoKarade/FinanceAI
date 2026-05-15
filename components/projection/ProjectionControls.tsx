import React, { Fragment } from 'react';
import { Card } from '../ui/Card';
import { ProjectionConfig, RealEstateGoal, BudgetConfig } from '../../types';
import { AdvancedProjectionParams } from '../AdvancedProjectionParams';

interface LiveCSVBalances {
    CELI: number;
    REER: number;
    NON_ENREG: number;
    CRYPTO: number;
    REEE: number;
    TOTAL: number;
    historicalRate: number;
}

interface ProjectionControlsProps {
    projection: ProjectionConfig;
    updateProj: (key: keyof ProjectionConfig, val: unknown) => void;
    updateReturnRate: (key: string, val: number) => void;
    runMC: boolean;
    setRunMC: (v: boolean) => void;
    isComputing: boolean;
    selectedScenarioIdx: number;
    setSelectedScenarioIdx: (i: number) => void;
    allResults: any[];
    fireNumber: number;
    aiNote: string;
    liveCSVBalances: LiveCSVBalances;
    applyHistoricalRate: () => void;
    realEstateGoals: RealEstateGoal[];
    setRealEstateGoals?: (g: RealEstateGoal[]) => void;
    config: BudgetConfig;
}

export const ProjectionControls: React.FC<ProjectionControlsProps> = ({
    projection, updateProj, updateReturnRate,
    runMC, setRunMC, isComputing,
    selectedScenarioIdx, setSelectedScenarioIdx, allResults,
    fireNumber, aiNote, liveCSVBalances, applyHistoricalRate,
    realEstateGoals, setRealEstateGoals, config,
}) => {
    return (
        <>
            {/* Scenario Selector */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {allResults.map((res: any, idx: number) => (
                    <button
                        key={idx}
                        onClick={() => setSelectedScenarioIdx(idx)}
                        className={`p-4 rounded-xl border transition-all text-left relative overflow-hidden group ${
                            selectedScenarioIdx === idx
                            ? 'bg-primary/20 border-primary ring-1 ring-primary'
                            : 'bg-surface/40 border-white/5 hover:border-white/20'
                        }`}
                    >
                        <div className="flex items-center gap-3 mb-2">
                            <span className="text-2xl">{res.icon}</span>
                            <div>
                                <div className="text-xs font-bold text-white leading-tight">{res.strategyName}</div>
                                <div className="text-[10px] text-gray-400">Patrimoine: {Math.round(res.estateNetWorth/1000000).toFixed(1)}M$</div>
                            </div>
                        </div>
                        {selectedScenarioIdx === idx && (
                            <div className="absolute top-0 right-0 w-8 h-8 bg-primary/20 rounded-bl-xl flex items-center justify-center">
                                <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                            </div>
                        )}
                    </button>
                ))}
            </div>

            <Card className="bg-surface/80 backdrop-blur-md">
                {/* AI Insight Box */}
                {aiNote && (
                    <div className="mb-6 p-4 rounded-xl bg-primary/10 border border-primary/20 flex gap-4 items-start">
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                            🤖
                        </div>
                        <div>
                            <p className="text-sm text-gray-200 leading-relaxed">
                                {aiNote.split(/(\*\*[^*]+\*\*)/g).map((part: string, i: number) =>
                                    part.startsWith('**') && part.endsWith('**')
                                        ? <strong key={i}>{part.slice(2, -2)}</strong>
                                        : <Fragment key={i}>{part}</Fragment>
                                )}
                            </p>
                            <div className="flex gap-4 mt-2">
                                <div className="text-[10px] text-emerald-400 font-bold">Pros: {allResults[selectedScenarioIdx]?.pros?.join(', ') || 'N/A'}</div>
                                <div className="text-[10px] text-red-400 font-bold">Cons: {allResults[selectedScenarioIdx]?.cons?.join(', ') || 'N/A'}</div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex justify-center mb-6">
                    <div className="bg-black/50 p-1 rounded-lg border border-white/10 flex">
                        <button
                            onClick={() => updateProj('useTheoretical', false)}
                            className={`px-6 py-2 text-sm font-bold rounded-md transition-all ${!projection.useTheoretical ? 'bg-primary text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                        >
                            🔗 Données Réelles
                        </button>
                        <button
                            onClick={() => updateProj('useTheoretical', true)}
                            className={`px-6 py-2 text-sm font-bold rounded-md transition-all ${projection.useTheoretical ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                        >
                            🧪 Mode Sandbox
                        </button>
                    </div>
                    <div className="ml-4 flex items-center gap-2">
                        <button
                            onClick={() => setRunMC(!runMC)}
                            className={`px-4 py-2 text-[10px] font-bold rounded-md border transition-all ${runMC ? 'bg-orange-500/20 border-orange-500/50 text-orange-300' : 'bg-gray-800 border-white/10 text-gray-400'} ${isComputing ? 'animate-pulse' : ''}`}
                            disabled={isComputing}
                        >
                            🎲 Monte Carlo {runMC ? 'ON' : 'OFF'}{isComputing ? ' ⏳' : ''}
                        </button>
                        <button
                            onClick={() => updateProj('useSmileCurve', !projection.useSmileCurve)}
                            title="Courbe en U des dépenses retraite (étude CIBC): go-go +15%, slow-go base, no-go -10%"
                            className={`px-4 py-2 text-[10px] font-bold rounded-md border transition-all ${projection.useSmileCurve ? 'bg-pink-500/20 border-pink-500/50 text-pink-300' : 'bg-gray-800 border-white/10 text-gray-400'}`}
                        >
                            😊 Smile Curve {projection.useSmileCurve ? 'ON' : 'OFF'}
                        </button>
                    </div>
                </div>

                {/* D2.9: Inflation par poste (panier CPI Stats Canada) */}
                <div className="mb-4">
                    <button
                        onClick={() => updateProj('usePerCategoryInflation', !projection.usePerCategoryInflation)}
                        title="Décompose l'inflation en 6 postes (logement, alim, transport, santé, loisirs, autres) avec pondérations CPI 2023. Plus réaliste que l'inflation globale unique."
                        className={`px-3 py-2 text-[11px] font-bold rounded-md border transition-all ${projection.usePerCategoryInflation ? 'bg-amber-500/20 border-amber-500/50 text-amber-300' : 'bg-gray-800 border-white/10 text-gray-400'}`}
                    >
                        📊 Inflation par poste {projection.usePerCategoryInflation ? 'ON' : 'OFF'}
                    </button>
                </div>
                {projection.usePerCategoryInflation && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4 p-3 rounded-lg border border-amber-500/20 bg-black/30">
                        {[
                            { key: 'inflationHousing',  label: 'Logement',  weight: 30, def: 4.0 },
                            { key: 'inflationFood',     label: 'Alim.',     weight: 17, def: 3.5 },
                            { key: 'inflationTransport',label: 'Transport', weight: 15, def: 2.5 },
                            { key: 'inflationHealth',   label: 'Santé',     weight: 5,  def: 4.5 },
                            { key: 'inflationLeisure',  label: 'Loisirs',   weight: 6,  def: 1.5 },
                            { key: 'inflationOther',    label: 'Autres',    weight: 27, def: 2.0 },
                        ].map(item => (
                            <div key={item.key}>
                                <label className="flex justify-between text-xs text-gray-300 mb-1">
                                    <span>{item.label} ({item.weight}%)</span>
                                    <span className="text-amber-300 font-bold">{((projection as any)[item.key] ?? item.def).toFixed(1)}%</span>
                                </label>
                                <input
                                    type="range" min="0" max="10" step="0.1"
                                    value={(projection as any)[item.key] ?? item.def}
                                    onChange={e => updateProj(item.key as keyof ProjectionConfig, Number(e.target.value))}
                                    className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-amber-500"
                                />
                            </div>
                        ))}
                    </div>
                )}

                {/* D2.8 + D2.10: Toggles événements de vie stochastiques */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                    {([
                        { key: 'useStochasticMortality', label: '⚰️ Mortalité stochastique', color: 'violet', title: "Active des tirages aléatoires de date de décès (tables Stats Can 2020-2022) en mode Monte Carlo. La simulation s'arrête à la mort." },
                        { key: 'ltcEnabled', label: '🏥 LTC stochastique', color: 'red', title: "Soins de longue durée (CHSLD/RPA). Probabilité croissante après 65 ans (1% → 25%/an). Coût mensuel ajouté aux dépenses." },
                        { key: 'jobLossEnabled', label: '💼 Perte emploi', color: 'orange', title: "Perte d'emploi stochastique en MC. Probabilité annuelle ~3% (Stats Can). Pendant N mois, revenu du user principal = 55% (assurance-emploi)." },
                        { key: 'modelSurvivor', label: '🖤 Survivant', color: 'slate', title: "Modélise le décès du conjoint en MC (RRQ survivant 60%, PSV cesse, DB selon election)." },
                        { key: 'useHistoricalBootstrap', label: '📜 Bootstrap historique', color: 'teal', title: "Au lieu de rendements gaussiens, échantillonne l'historique réel S&P 500 + inflation US 1928-2024 (97 ans). Capture les vrais krachs (1929, 1973-74, 2000-02, 2008, 2020)." },
                        { key: 'divorceEnabled', label: '💔 Divorce', color: 'rose', title: "Divorce stochastique (MC). Probabilité annuelle ~1.5% (cumul ~36% sur 30 ans). Patrimoine split selon divorceSplitPct (défaut 50%)." },
                        { key: 'ltdEnabled', label: '♿ Invalidité', color: 'yellow', title: "Invalidité longue durée stochastique. Probabilité annuelle ~0.5%. Revenu réduit à 60% (assurance privée typique) pendant 24 mois." },
                        { key: 'criticalIllnessEnabled', label: '🩺 Maladie grave', color: 'pink', title: "Maladie grave stochastique. Probabilité ~0.3%/an. Capital forfaitaire reçu + dépenses additionnelles." },
                        { key: 'inheritanceEnabled', label: '🎁 Héritage', color: 'amber', title: "Héritage probabilisé. Tirage dans la fenêtre [âge attendu ± uncertaintyY]." },
                        { key: 'snowbirdEnabled', label: '🌴 Snowbird', color: 'cyan', title: "Snowbird (4-6 mois en US/Mexique en hiver à la retraite). Surcoût mensuel ~1500$." },
                    ] as const).map(({ key, label, color, title }) => {
                        const isOn = !!(projection as any)[key];
                        return (
                            <button
                                key={key}
                                onClick={() => updateProj(key as keyof ProjectionConfig, !isOn)}
                                title={title}
                                className={`px-3 py-2 text-[11px] font-bold rounded-md border transition-all ${isOn ? `bg-${color}-500/20 border-${color}-500/50 text-${color}-300` : 'bg-gray-800 border-white/10 text-gray-400'}`}
                            >
                                {label} {isOn ? 'ON' : 'OFF'}
                            </button>
                        );
                    })}
                </div>

                {/* W4.5 — Replay historique */}
                <div className="mb-4 flex items-center gap-2">
                    <label className="text-[11px] text-gray-400">🎬 Replay krach historique:</label>
                    <select
                        value={projection.replayHistoricalYear ?? ''}
                        onChange={e => updateProj('replayHistoricalYear', e.target.value ? Number(e.target.value) : undefined)}
                        className="bg-dark border border-border rounded px-2 py-1 text-[11px] text-white"
                    >
                        <option value="">— Aucun (mode normal) —</option>
                        <option value="1929">1929 — Grande Dépression</option>
                        <option value="1973">1973 — Choc pétrolier + stagflation</option>
                        <option value="2000">2000 — Bulle dot-com</option>
                        <option value="2008">2008 — Crise financière</option>
                        <option value="2020">2020 — COVID</option>
                        <option value="2022">2022 — Inflation post-COVID</option>
                    </select>
                    <span className="text-[10px] text-gray-500">→ Force les rendements historiques à partir de cette année.</span>
                </div>

                {/* Panneau Paramètres Avancés */}
                <div className="mb-4">
                    <AdvancedProjectionParams projection={projection} updateProj={updateProj} />
                </div>

                {projection.ltcEnabled && (
                    <div className="mb-4 p-3 rounded-lg border border-red-500/20 bg-black/30">
                        <label className="flex justify-between text-xs text-gray-300 mb-1">
                            <span>Coût mensuel soins ($/mois)</span>
                            <span className="text-red-300 font-bold">{projection.ltcMonthlyCost ?? 5000}$</span>
                        </label>
                        <input
                            type="range" min="2000" max="12000" step="500"
                            value={projection.ltcMonthlyCost ?? 5000}
                            onChange={e => updateProj('ltcMonthlyCost', Number(e.target.value))}
                            className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-red-500"
                        />
                        <p className="text-[10px] text-gray-500 mt-1">CHSLD public ~2000$, RPA semi-privé ~4500$, soins privés à domicile 8000-12000$.</p>
                    </div>
                )}

                {/* D2.7: Champs Withholding tax US sur CELI */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 p-3 rounded-lg border border-white/5 bg-black/30">
                    <div>
                        <label className="flex justify-between text-xs text-gray-300 mb-1">
                            <span>🇺🇸 Part actions US dans CELI (%)</span>
                            <span className="text-blue-300 font-bold">{projection.usEquityShareCeli ?? 0}%</span>
                        </label>
                        <input
                            type="range" min="0" max="100" step="5"
                            value={projection.usEquityShareCeli ?? 0}
                            onChange={e => updateProj('usEquityShareCeli', Number(e.target.value))}
                            className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                        <p className="text-[10px] text-gray-500 mt-1">VOO/SPY/QQQ... Le CELI n'est PAS protégé du withholding US 15% (le REER si).</p>
                    </div>
                    <div>
                        <label className="flex justify-between text-xs text-gray-300 mb-1">
                            <span>Rendement dividende US (%)</span>
                            <span className="text-blue-300 font-bold">{(projection.usEquityDividendYield ?? 1.5).toFixed(1)}%</span>
                        </label>
                        <input
                            type="range" min="0" max="5" step="0.1"
                            value={projection.usEquityDividendYield ?? 1.5}
                            onChange={e => updateProj('usEquityDividendYield', Number(e.target.value))}
                            className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                        <p className="text-[10px] text-gray-500 mt-1">Yield moyen S&P 500 ≈ 1.5%. Drag annuel = part × yield × 15%.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="space-y-4">
                        <h4 className={`text-xs font-bold uppercase tracking-widest border-b pb-1 ${projection.useTheoretical ? 'text-purple-400 border-purple-500/20' : 'text-emerald-400 border-emerald-500/20'}`}>Flux Mensuels</h4>
                        <div className={!projection.useTheoretical ? 'opacity-50 pointer-events-none' : ''}>
                            <label className="flex justify-between text-xs text-gray-300 mb-1">
                                <span>Revenus (Net)</span>
                                <span className="text-green-400 font-bold privacy-blur">{projection.theoreticalIncome || 8000}$</span>
                            </label>
                            <input type="range" min="2000" max="20000" step="100" value={projection.theoreticalIncome || 8000} onChange={e => updateProj('theoreticalIncome', Number(e.target.value))} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-green-500" />
                        </div>
                        <div className={!projection.useTheoretical ? 'opacity-50 pointer-events-none' : ''}>
                            <label className="flex justify-between text-xs text-gray-300 mb-1">
                                <span>Dépenses</span>
                                <span className="text-red-400 font-bold privacy-blur">{projection.theoreticalExpenses || 4000}$</span>
                            </label>
                            <input type="range" min="1000" max="15000" step="100" value={projection.theoreticalExpenses || 4000} onChange={e => updateProj('theoreticalExpenses', Number(e.target.value))} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-red-500" />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-white/10 pb-1">Facteurs Macro</h4>
                        <div>
                            <label className="flex justify-between text-xs text-gray-300 mb-1">
                                <span>Horizon (Années)</span>
                                <span className="text-purple-400 font-bold">{projection.years || 30}</span>
                            </label>
                            <input type="range" min="5" max="50" step="1" value={projection.years || 30} onChange={e => updateProj('years', Number(e.target.value))} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-purple-500" />
                        </div>
                        <div>
                            <label className="flex justify-between text-xs text-gray-300 mb-1">
                                <span>Inflation</span>
                                <span className="text-red-400 font-bold">{projection.inflationRate}%</span>
                            </label>
                            <input type="range" min="0" max="8" step="0.1" value={projection.inflationRate} onChange={e => updateProj('inflationRate', Number(e.target.value))} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-red-500" />
                        </div>
                        <div>
                            <label className="flex justify-between text-xs text-gray-300 mb-1">
                                <span>Hausse Salaire (An)</span>
                                <span className="text-blue-400 font-bold">{projection.salaryGrowth ?? 2.5}%</span>
                            </label>
                            <input type="range" min="0" max="10" step="0.1" value={projection.salaryGrowth ?? 2.5} onChange={e => updateProj('salaryGrowth', Number(e.target.value))} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-blue-500" />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-white/10 pb-1 flex justify-between items-center">
                            <span>Rendements Estimés</span>
                            {liveCSVBalances.historicalRate > 0 && (
                                <button
                                    onClick={applyHistoricalRate}
                                    className="text-[9px] bg-blue-500/20 text-blue-300 hover:bg-blue-500/40 hover:text-white px-1.5 py-0.5 rounded transition-colors"
                                    title="Appliquer le rendement historique réel de votre Google Sheet"
                                >
                                    🪴 Auto ({liveCSVBalances.historicalRate.toFixed(1)}%)
                                </button>
                            )}
                        </h4>
                        <div>
                            <label className="flex justify-between text-xs text-gray-300 mb-1">
                                <span>CELI (Tax Free)</span>
                                <span className="text-yellow-400 font-bold">{projection.returnRates?.celi || 7}%</span>
                            </label>
                            <input type="range" min="2" max="15" step="0.1" value={projection.returnRates?.celi || 7} onChange={e => updateReturnRate('celi', Number(e.target.value))} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-yellow-500" />
                        </div>
                        <div>
                            <label className="flex justify-between text-xs text-gray-300 mb-1">
                                <span>Non-Enregistré / REER</span>
                                <span className="text-yellow-400 font-bold">{projection.returnRates?.nonReg || 6.5}%</span>
                            </label>
                            <input type="range" min="2" max="15" step="0.1" value={projection.returnRates?.nonReg || 6.5} onChange={e => { updateReturnRate('nonReg', Number(e.target.value)); updateReturnRate('reer', Number(e.target.value)); }} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-yellow-500" />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-white/10 pb-1">Paramètres Spéciaux</h4>
                        <div>
                            <label className="flex justify-between text-xs text-gray-300 mb-1">
                                <span>Coussin de Sécurité</span>
                                <span className="text-blue-400 font-bold">{projection.emergencyFundMonths || 3} Mois</span>
                            </label>
                            <input type="range" min="1" max="12" step="1" value={projection.emergencyFundMonths || 3} onChange={e => updateProj('emergencyFundMonths', Number(e.target.value))} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-blue-500" />
                        </div>
                        <div>
                            <label className="flex justify-between text-xs text-gray-300 mb-1">
                                <span>Valeur Max Maison</span>
                                <span className="text-pink-400 font-bold privacy-blur">{((realEstateGoals[0]?.maxValue || 1000000)/1000).toFixed(0)}k$</span>
                            </label>
                            <input type="range" min="300000" max="3000000" step="50000" value={realEstateGoals[0]?.maxValue || 1000000} onChange={e => {
                                const updated = [...realEstateGoals];
                                if (updated[0]) {
                                    updated[0] = { ...updated[0], maxValue: Number(e.target.value) };
                                    setRealEstateGoals?.(updated);
                                }
                            }} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-pink-500" />
                            <p className="text-[9px] text-gray-500 mt-1">Plafond de croissance immo.</p>
                        </div>
                    </div>
                </div>
            </Card>
        </>
    );
};
