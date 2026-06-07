import React, { Fragment } from 'react';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { Button } from '../ui/Button';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { Badge } from '../ui/Badge';
import { ProjectionConfig, RealEstateGoal, BudgetConfig } from '../../types';
import { AdvancedProjectionParams } from '../AdvancedProjectionParams';
import { ProjectionResult } from '../../services/projection/types';

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
    allResults: ProjectionResult[];
    fireNumber: number;
    aiNote: string;
    liveCSVBalances: LiveCSVBalances;
    applyHistoricalRate: () => void;
    realEstateGoals: RealEstateGoal[];
    setRealEstateGoals?: (g: RealEstateGoal[]) => void;
    config: BudgetConfig;
}

const STOCHASTIC_TOGGLES = [
    { key: 'useStochasticMortality', label: 'Mortalité', title: "Active des tirages aléatoires de date de décès (tables Stats Can 2020-2022) en mode Monte Carlo. La simulation s'arrête à la mort." },
    { key: 'ltcEnabled', label: 'Soins LD', title: "Soins de longue durée (CHSLD/RPA). Probabilité croissante après 65 ans (1% → 25%/an)." },
    { key: 'jobLossEnabled', label: 'Perte emploi', title: "Perte d'emploi stochastique en MC. Probabilité annuelle ~3% (Stats Can). Pendant N mois, revenu du user principal = 55% (assurance-emploi)." },
    { key: 'modelSurvivor', label: 'Survivant', title: "Modélise le décès du conjoint en MC (RRQ survivant 60%, PSV cesse, DB selon election)." },
    { key: 'useHistoricalBootstrap', label: 'Bootstrap historique', title: "Échantillonne l'historique réel S&P 500 + inflation US 1928-2024 (97 ans)." },
    { key: 'divorceEnabled', label: 'Divorce', title: "Divorce stochastique (MC). Probabilité annuelle ~1.5% (cumul ~36% sur 30 ans)." },
    { key: 'ltdEnabled', label: 'Invalidité', title: "Invalidité longue durée stochastique. Probabilité annuelle ~0.5%." },
    { key: 'criticalIllnessEnabled', label: 'Maladie grave', title: "Maladie grave stochastique. Probabilité ~0.3%/an." },
    { key: 'inheritanceEnabled', label: 'Héritage', title: "Héritage probabilisé. Tirage dans la fenêtre [âge attendu ± uncertaintyY]." },
    { key: 'snowbirdEnabled', label: 'Snowbird', title: "Snowbird (4-6 mois en US/Mexique en hiver à la retraite). Surcoût mensuel ~1500$." },
] as const;

const INFLATION_CATEGORIES = [
    { key: 'inflationHousing',   label: 'Logement',   weight: 30, def: 4.0 },
    { key: 'inflationFood',      label: 'Alim.',      weight: 17, def: 3.5 },
    { key: 'inflationTransport', label: 'Transport',  weight: 15, def: 2.5 },
    { key: 'inflationHealth',    label: 'Santé',      weight: 5,  def: 4.5 },
    { key: 'inflationLeisure',   label: 'Loisirs',    weight: 6,  def: 1.5 },
    { key: 'inflationOther',     label: 'Autres',     weight: 27, def: 2.0 },
] as const;

const REPLAY_OPTIONS = [
    { value: '',     label: '— Aucun (mode normal) —' },
    { value: '1929', label: '1929 — Grande Dépression' },
    { value: '1973', label: '1973 — Choc pétrolier + stagflation' },
    { value: '2000', label: '2000 — Bulle dot-com' },
    { value: '2008', label: '2008 — Crise financière' },
    { value: '2020', label: '2020 — COVID' },
    { value: '2022', label: '2022 — Inflation post-COVID' },
];

export const ProjectionControls: React.FC<ProjectionControlsProps> = ({
    projection, updateProj, updateReturnRate,
    runMC, setRunMC, isComputing,
    selectedScenarioIdx, setSelectedScenarioIdx, allResults,
    aiNote, liveCSVBalances, applyHistoricalRate,
    realEstateGoals, setRealEstateGoals,
}) => {
    const projAsMap = projection as unknown as Record<string, unknown>;
    const activeStochasticCount = STOCHASTIC_TOGGLES.filter(t => !!projAsMap[t.key]).length;
    return (
        <>
            {/* Scenario Selector — pas dans une collapsible: choix structurant.
                7 cartes (Phase 4 #4): 4+3 sur lg, 7 sur xl. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
                {allResults.map((res, idx: number) => {
                    const isCompoundNew = res.stratType === 'COMPOUND_STRESS' || res.stratType === 'LATE_INHERITANCE';
                    return (
                        <button
                            key={idx}
                            onClick={() => setSelectedScenarioIdx(idx)}
                            className={`p-4 rounded-card border transition-all text-left relative overflow-hidden focus-ring ${
                                selectedScenarioIdx === idx
                                    ? 'bg-primary/15 border-primary ring-1 ring-primary'
                                    : 'bg-surface/40 border-white/5 hover:border-white/20'
                            }`}
                        >
                            <div className="flex items-center gap-3 mb-2">
                                <span className="text-h1" aria-hidden="true">{res.icon}</span>
                                <div className="min-w-0">
                                    <div className="text-meta font-bold text-ink-50 leading-tight truncate">{res.strategyName}</div>
                                    <div className="text-tiny text-ink-400 mt-0.5">Patrimoine: {((res.estateNetWorth ?? 0) / 1000000).toFixed(2)}M$</div>
                                </div>
                            </div>
                            {isCompoundNew && selectedScenarioIdx !== idx && (
                                <div className="absolute top-1 left-1">
                                    <Badge variant="warning" size="sm">Nouveau</Badge>
                                </div>
                            )}
                            {selectedScenarioIdx === idx && (
                                <div className="absolute top-0 right-0 w-8 h-8 bg-primary/20 rounded-bl-card flex items-center justify-center">
                                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* AI Insight — visible si présent */}
            {aiNote && (
                <Card className="bg-primary/10 border-primary/20">
                    <div className="flex gap-4 items-start">
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                            <span aria-hidden="true">🤖</span>
                        </div>
                        <div className="min-w-0">
                            <p className="text-body text-ink-100 leading-relaxed">
                                {aiNote.split(/(\*\*[^*]+\*\*)/g).map((part: string, i: number) =>
                                    part.startsWith('**') && part.endsWith('**')
                                        ? <strong key={i}>{part.slice(2, -2)}</strong>
                                        : <Fragment key={i}>{part}</Fragment>
                                )}
                            </p>
                            <div className="flex flex-wrap gap-3 mt-2">
                                <div className="text-tiny text-success-400 font-bold">Pros: {allResults[selectedScenarioIdx]?.pros?.join(', ') || 'N/A'}</div>
                                <div className="text-tiny text-danger-400 font-bold">Cons: {allResults[selectedScenarioIdx]?.cons?.join(', ') || 'N/A'}</div>
                            </div>
                        </div>
                    </div>
                </Card>
            )}

            {/* Toolbar simulation — radio-group MC prominent (U3).
                Le mode MC est structurant : il change la forme des courbes sur
                tous les onglets (Futur, Retraite, Enfant…) via la projection
                partagée. Un simple bouton toggle était invisible pour un
                nouvel utilisateur.
                Implémenté avec de vrais <input type="radio"> stylés via <label>
                plutôt que role="radio" sur <button> — les navigateurs gèrent
                nativement la navigation fléchée (ArrowLeft/Right) et l'état
                checked, sans avoir à implémenter le onKeyDown manuellement
                (fix HIGH a11y review). */}
            <div className="flex flex-wrap items-center gap-3">
                <fieldset
                    className="flex items-center bg-black/50 border border-white/10 rounded-xl p-1 gap-0.5"
                    disabled={isComputing}
                >
                    <legend className="sr-only">Mode de simulation</legend>

                    <label
                        className={`px-3 py-1.5 rounded-lg text-meta font-semibold transition-all cursor-pointer select-none ${
                            !runMC
                                ? 'bg-success-500/20 text-success-300 border border-success-500/30 shadow-sm'
                                : 'text-ink-400 hover:text-ink-200 border border-transparent'
                        } ${isComputing ? 'pointer-events-none opacity-50' : ''}`}
                        title="Projection unique, sans aléatoire. Rapide (~150 ms). Pas de bandes P10-P90."
                    >
                        <input
                            type="radio"
                            name="simulation-mode"
                            value="deterministic"
                            checked={!runMC}
                            onChange={() => setRunMC(false)}
                            className="sr-only"
                        />
                        📊 Déterministe
                    </label>

                    <label
                        className={`px-3 py-1.5 rounded-lg text-meta font-semibold transition-all cursor-pointer select-none ${
                            runMC
                                ? 'bg-primary/20 text-primary border border-primary/30 shadow-sm'
                                : 'text-ink-400 hover:text-ink-200 border border-transparent'
                        } ${isComputing ? 'pointer-events-none opacity-50' : ''}`}
                        title="100 scénarios aléatoires — affiche les bandes P10/P90. Impacte Retraite et Enfant."
                    >
                        <input
                            type="radio"
                            name="simulation-mode"
                            value="montecarlo"
                            checked={runMC}
                            onChange={() => setRunMC(true)}
                            className="sr-only"
                        />
                        🎲 Monte Carlo{isComputing && runMC ? ' …' : ''}
                    </label>
                </fieldset>
                {runMC && (
                    <span className="text-tiny text-ink-400 hidden sm:inline select-none">
                        Impacte tous les onglets
                    </span>
                )}
                <Button
                    onClick={() => updateProj('useSmileCurve', !projection.useSmileCurve)}
                    variant={projection.useSmileCurve ? 'primary' : 'ghost'}
                    size="sm"
                    title="Courbe en U des dépenses retraite (étude CIBC): go-go +15%, slow-go base, no-go -10%"
                >
                    😊 Smile Curve {projection.useSmileCurve ? 'ON' : 'OFF'}
                </Button>
                {activeStochasticCount > 0 && (
                    <Badge variant="warning" size="sm">
                        {activeStochasticCount} événements stochastiques actifs
                    </Badge>
                )}
            </div>

            {/* §1 — Hypothèses macro (ouverte par défaut) */}
            <CollapsibleSection
                title="Hypothèses macroéconomiques"
                icon={<Icon name="cash" size={20} />}
                subtitle="Horizon, inflation, rendements, paramètres de base"
                defaultOpen={true}
            >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="space-y-4">
                        <h4 className={`text-tiny uppercase border-b pb-1 ${projection.useTheoretical ? 'text-secondary border-secondary/30' : 'text-success-400 border-success-border'}`}>Flux Mensuels</h4>
                        <div className={!projection.useTheoretical ? 'opacity-50 pointer-events-none' : ''}>
                            <label className="flex justify-between text-meta text-ink-300 mb-1">
                                <span>Revenus (Net)</span>
                                <span className="text-success-400 font-bold privacy-blur">{projection.theoreticalIncome || 8000}$</span>
                            </label>
                            <input type="range" min="2000" max="20000" step="100" value={projection.theoreticalIncome || 8000} onChange={e => updateProj('theoreticalIncome', Number(e.target.value))} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-success-500" />
                        </div>
                        <div className={!projection.useTheoretical ? 'opacity-50 pointer-events-none' : ''}>
                            <label className="flex justify-between text-meta text-ink-300 mb-1">
                                <span>Dépenses</span>
                                <span className="text-danger-400 font-bold privacy-blur">{projection.theoreticalExpenses || 4000}$</span>
                            </label>
                            <input type="range" min="1000" max="15000" step="100" value={projection.theoreticalExpenses || 4000} onChange={e => updateProj('theoreticalExpenses', Number(e.target.value))} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-danger-500" />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-tiny uppercase text-ink-400 border-b border-white/10 pb-1">Facteurs Macro</h4>
                        <div>
                            <label className="flex justify-between text-meta text-ink-300 mb-1">
                                <span>Horizon (Années)</span>
                                <span className="text-secondary font-bold">{projection.years || 30}</span>
                            </label>
                            <input type="range" min="5" max="50" step="1" value={projection.years || 30} onChange={e => updateProj('years', Number(e.target.value))} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-secondary" />
                        </div>
                        <div>
                            <label className="flex justify-between text-meta text-ink-300 mb-1">
                                <span>Inflation</span>
                                <span className="text-danger-400 font-bold">{projection.inflationRate}%</span>
                            </label>
                            <input type="range" min="0" max="8" step="0.1" value={projection.inflationRate} onChange={e => updateProj('inflationRate', Number(e.target.value))} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-danger-500" />
                        </div>
                        <div>
                            <label className="flex justify-between text-meta text-ink-300 mb-1">
                                <span>Hausse Salaire (An)</span>
                                <span className="text-info-400 font-bold">{projection.salaryGrowth ?? 2.5}%</span>
                            </label>
                            <input type="range" min="0" max="10" step="0.1" value={projection.salaryGrowth ?? 2.5} onChange={e => updateProj('salaryGrowth', Number(e.target.value))} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-info-500" />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-tiny uppercase text-ink-400 border-b border-white/10 pb-1 flex justify-between items-center">
                            <span>Rendements Estimés</span>
                            {liveCSVBalances.historicalRate > 0 && (
                                <Button
                                    onClick={applyHistoricalRate}
                                    variant="ghost"
                                    size="sm"
                                    title="Appliquer le rendement historique réel de votre Google Sheet"
                                    className="!px-2 !py-0.5 !text-tiny"
                                >
                                    🪴 Auto ({liveCSVBalances.historicalRate.toFixed(1)}%)
                                </Button>
                            )}
                        </h4>
                        <div>
                            <label className="flex justify-between text-meta text-ink-300 mb-1">
                                <span>CELI (Tax Free)</span>
                                <span className="text-warning-400 font-bold">{projection.returnRates?.celi || 7}%</span>
                            </label>
                            <input type="range" min="2" max="15" step="0.1" value={projection.returnRates?.celi || 7} onChange={e => updateReturnRate('celi', Number(e.target.value))} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-warning-500" />
                        </div>
                        <div>
                            <label className="flex justify-between text-meta text-ink-300 mb-1">
                                <span>Non-Enregistré / REER</span>
                                <span className="text-warning-400 font-bold">{projection.returnRates?.nonReg || 6.5}%</span>
                            </label>
                            <input type="range" min="2" max="15" step="0.1" value={projection.returnRates?.nonReg || 6.5} onChange={e => { const v = Number(e.target.value); updateProj('returnRates', { ...(projection.returnRates || { celi: 7, reer: 6.5, nonReg: 6.5, crypto: 10, cash: 3 }), nonReg: v, reer: v }); }} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-warning-500" />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-tiny uppercase text-ink-400 border-b border-white/10 pb-1">Paramètres Spéciaux</h4>
                        <div>
                            <label className="flex justify-between text-meta text-ink-300 mb-1">
                                <span>Coussin de Sécurité</span>
                                <span className="text-info-400 font-bold">{projection.emergencyFundMonths || 3} Mois</span>
                            </label>
                            <input type="range" min="1" max="12" step="1" value={projection.emergencyFundMonths || 3} onChange={e => updateProj('emergencyFundMonths', Number(e.target.value))} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-info-500" />
                        </div>
                        <div>
                            <label className="flex justify-between text-meta text-ink-300 mb-1">
                                <span>Valeur Max Maison</span>
                                <span className="text-pink-400 font-bold privacy-blur">{((realEstateGoals[0]?.maxValue || 1000000) / 1000).toFixed(0)}k$</span>
                            </label>
                            <input type="range" min="300000" max="3000000" step="50000" value={realEstateGoals[0]?.maxValue || 1000000} onChange={e => {
                                const updated = [...realEstateGoals];
                                if (updated[0]) {
                                    updated[0] = { ...updated[0], maxValue: Number(e.target.value) };
                                    setRealEstateGoals?.(updated);
                                }
                            }} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-pink-500" />
                            <p className="text-tiny text-ink-400 mt-1">Plafond de croissance immo.</p>
                        </div>
                    </div>
                </div>
            </CollapsibleSection>

            {/* §2 — Variabilité (ouverte si MC actif) */}
            <CollapsibleSection
                title="Variabilité & Stress-test"
                icon={<Icon name="dice" size={20} />}
                subtitle="Inflation par poste, replay krach, withholding US"
                defaultOpen={runMC}
            >
                <div className="space-y-4">
                    {/* Inflation par poste */}
                    <div>
                        <Button
                            onClick={() => updateProj('usePerCategoryInflation', !projection.usePerCategoryInflation)}
                            variant={projection.usePerCategoryInflation ? 'primary' : 'ghost'}
                            size="sm"
                            title="Décompose l'inflation en 6 postes (logement, alim, transport, santé, loisirs, autres) avec pondérations CPI 2023."
                        >
                            📊 Inflation par poste {projection.usePerCategoryInflation ? 'ON' : 'OFF'}
                        </Button>
                        {projection.usePerCategoryInflation && (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3 p-3 rounded-card border border-warning-border bg-warning-bg">
                                {INFLATION_CATEGORIES.map(item => (
                                    <div key={item.key}>
                                        <label className="flex justify-between text-meta text-ink-300 mb-1">
                                            <span>{item.label} ({item.weight}%)</span>
                                            <span className="text-warning-400 font-bold">{((projAsMap[item.key] as number | undefined) ?? item.def).toFixed(1)}%</span>
                                        </label>
                                        <input
                                            type="range" min="0" max="10" step="0.1"
                                            value={(projAsMap[item.key] as number | undefined) ?? item.def}
                                            onChange={e => updateProj(item.key as keyof ProjectionConfig, Number(e.target.value))}
                                            className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-warning-500"
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Replay krach */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <label className="text-meta text-ink-300" htmlFor="replay-select">🎬 Replay krach historique:</label>
                        <select
                            id="replay-select"
                            value={projection.replayHistoricalYear ?? ''}
                            onChange={e => updateProj('replayHistoricalYear', e.target.value ? Number(e.target.value) : undefined)}
                            className="bg-dark border border-border rounded px-2 py-1 text-meta text-ink-100"
                        >
                            {REPLAY_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                        <span className="text-tiny text-ink-400">→ Force les rendements historiques.</span>
                    </div>

                    {/* US Withholding */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 rounded-card border border-white/5 bg-black/30">
                        <div>
                            <label className="flex justify-between text-meta text-ink-300 mb-1">
                                <span>🇺🇸 Part actions US dans CELI (%)</span>
                                <span className="text-info-400 font-bold">{projection.usEquityShareCeli ?? 0}%</span>
                            </label>
                            <input
                                type="range" min="0" max="100" step="5"
                                value={projection.usEquityShareCeli ?? 0}
                                onChange={e => updateProj('usEquityShareCeli', Number(e.target.value))}
                                className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-info-500"
                            />
                            <p className="text-tiny text-ink-400 mt-1">VOO/SPY/QQQ... Le CELI n'est PAS protégé du withholding US 15% (le REER si).</p>
                        </div>
                        <div>
                            <label className="flex justify-between text-meta text-ink-300 mb-1">
                                <span>Rendement dividende US (%)</span>
                                <span className="text-info-400 font-bold">{(projection.usEquityDividendYield ?? 1.5).toFixed(1)}%</span>
                            </label>
                            <input
                                type="range" min="0" max="5" step="0.1"
                                value={projection.usEquityDividendYield ?? 1.5}
                                onChange={e => updateProj('usEquityDividendYield', Number(e.target.value))}
                                className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-info-500"
                            />
                            <p className="text-tiny text-ink-400 mt-1">Yield moyen S&P 500 ≈ 1.5%. Drag = part × yield × 15%.</p>
                        </div>
                    </div>
                </div>
            </CollapsibleSection>

            {/* §3 — Événements stochastiques (FERMÉE par défaut — clé de la refonte) */}
            <CollapsibleSection
                title="Événements de vie stochastiques"
                icon={<Icon name="wind" size={20} />}
                subtitle="Mortalité, soins LD, divorce, perte d'emploi… (requiert Monte Carlo)"
                defaultOpen={false}
                badge={activeStochasticCount > 0 ? <Badge variant="warning" size="sm">{activeStochasticCount} actifs</Badge> : undefined}
            >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
                    {STOCHASTIC_TOGGLES.map(({ key, label, title }) => {
                        const isOn = !!projAsMap[key];
                        return (
                            <Button
                                key={key}
                                onClick={() => updateProj(key as keyof ProjectionConfig, !isOn)}
                                variant={isOn ? 'primary' : 'ghost'}
                                size="sm"
                                title={title}
                                fullWidth
                            >
                                {label} {isOn ? 'ON' : 'OFF'}
                            </Button>
                        );
                    })}
                </div>

                {projection.ltcEnabled && (
                    <div className="mt-3 p-3 rounded-card border border-danger-border bg-danger-bg">
                        <label className="flex justify-between text-meta text-ink-300 mb-1">
                            <span>Coût mensuel soins ($/mois)</span>
                            <span className="text-danger-400 font-bold">{projection.ltcMonthlyCost ?? 5000}$</span>
                        </label>
                        <input
                            type="range" min="2000" max="12000" step="500"
                            value={projection.ltcMonthlyCost ?? 5000}
                            onChange={e => updateProj('ltcMonthlyCost', Number(e.target.value))}
                            className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-danger-500"
                        />
                        <p className="text-tiny text-ink-400 mt-1">CHSLD public ~2000$, RPA semi-privé ~4500$, soins privés à domicile 8000-12000$.</p>
                    </div>
                )}
            </CollapsibleSection>

            {/* §4 — Paramètres avancés (FERMÉE par défaut) */}
            <CollapsibleSection
                title="Paramètres avancés"
                icon={<Icon name="settings" size={20} />}
                subtitle="DB Pension, Asset Location, options détaillées"
                defaultOpen={false}
            >
                <AdvancedProjectionParams projection={projection} updateProj={updateProj} />
            </CollapsibleSection>
        </>
    );
};
