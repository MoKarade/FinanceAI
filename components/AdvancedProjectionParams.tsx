// components/AdvancedProjectionParams.tsx
// Panneau "Paramètres Avancés" qui expose TOUS les flags lus par le moteur
// mais jusqu'ici cachés derrière des défauts hard-codés.
//
// Issu de l'audit cycle 5 (agent UI coverage):
//   - 4 paramètres HIGH (stress test, vehicle auto, Smith Manoeuvre, T1213)
//   - ~20 paramètres MEDIUM (probas/durées/montants événements stochastiques,
//     MC iterations, useManualBalances, survivor pcts)

import React from 'react';
import { Card } from './ui/Card';
import type { ProjectionConfig } from '../types';
import { Icon } from './ui/Icon';

interface AdvancedProjectionParamsProps {
    projection: ProjectionConfig;
    updateProj: (key: keyof ProjectionConfig, val: ProjectionConfig[keyof ProjectionConfig]) => void;
}

export const AdvancedProjectionParams: React.FC<AdvancedProjectionParamsProps> = ({ projection, updateProj }) => {
    return (
        <Card icon={<Icon name="settings" size={18} />} title="Paramètres avancés">
            <details className="space-y-4">
                <summary className="cursor-pointer text-body text-ink-200 hover:text-white py-1.5">Déplier — paramètres habituellement masqués</summary>

                {/* ─────────────────────────────────────────────────────────── */}
                <div className="mt-4 pt-3 border-t border-white/5">
                    <h4 className="text-meta font-bold uppercase tracking-widest text-warning-400 mb-2">Stress Test (krach + inflation programmé)</h4>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => updateProj('stressTestEnabled', !projection.stressTestEnabled)}
                            className={`px-3 py-2 text-meta font-bold rounded-md border transition-all ${projection.stressTestEnabled ? 'bg-warning-500/20 border-warning-500/50 text-amber-300' : 'bg-surfaceHighlight border-white/10 text-ink-300'}`}
                        >
                            Activer stress test {projection.stressTestEnabled ? 'ON' : 'OFF'}
                        </button>
                        {projection.stressTestEnabled && (
                            <>
                                <div>
                                    <label className="text-tiny text-ink-300">Année du krach (depuis aujourd'hui)</label>
                                    <input type="number" value={projection.stressTestYear ?? 5} onChange={e => updateProj('stressTestYear', Number(e.target.value))} className="w-full bg-dark border border-warning-500/20 rounded px-2 py-1 text-meta text-white" />
                                </div>
                                <div>
                                    <label className="text-tiny text-ink-300">Chute bourse (%)</label>
                                    <input type="number" value={projection.stressTestDrop ?? 30} onChange={e => updateProj('stressTestDrop', Number(e.target.value))} className="w-full bg-dark border border-warning-500/20 rounded px-2 py-1 text-meta text-white" />
                                </div>
                                <div>
                                    <label className="text-tiny text-ink-300">Durée récupération (mois)</label>
                                    <input type="number" value={projection.stressTestRecoveryMonths ?? 24} onChange={e => updateProj('stressTestRecoveryMonths', Number(e.target.value))} className="w-full bg-dark border border-warning-500/20 rounded px-2 py-1 text-meta text-white" />
                                </div>
                                <div>
                                    <label className="text-tiny text-ink-300">Choc inflation additionnel (pp)</label>
                                    <input type="number" step="0.5" value={projection.stressTestInflationShock ?? 0} onChange={e => updateProj('stressTestInflationShock', Number(e.target.value))} className="w-full bg-dark border border-warning-500/20 rounded px-2 py-1 text-meta text-white" />
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* ─────────────────────────────────────────────────────────── */}
                <div className="pt-3 border-t border-white/5">
                    <h4 className="text-meta font-bold uppercase tracking-widest text-ink-200 mb-2">Optimisations fiscales avancées</h4>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => updateProj('useSmithManoeuvre', !projection.useSmithManoeuvre)}
                            title="Smith Manoeuvre: rendre l'hypothèque déductible en empruntant pour investir hors REER. Stratégie agressive."
                            className={`px-3 py-2 text-meta font-bold rounded-md border transition-all ${projection.useSmithManoeuvre ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-surfaceHighlight border-white/10 text-ink-300'}`}
                        >
                            Smith Manoeuvre {projection.useSmithManoeuvre ? 'ON' : 'OFF'}
                        </button>
                        <button
                            onClick={() => updateProj('optimizeSourceDeductions', !projection.optimizeSourceDeductions)}
                            title="T1213: réduction de la retenue à la source pour ne plus prêter d'argent au gouvernement pendant l'année (cotisations REER déductibles immédiates)."
                            className={`px-3 py-2 text-meta font-bold rounded-md border transition-all ${projection.optimizeSourceDeductions ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-surfaceHighlight border-white/10 text-ink-300'}`}
                        >
                            T1213 retenue source {projection.optimizeSourceDeductions ? 'ON' : 'OFF'}
                        </button>
                        <button
                            onClick={() => updateProj('vehicleReplacementEnabled', !projection.vehicleReplacementEnabled)}
                            title="Achat de véhicule automatique tous les ~10 ans (utile si tu n'as pas configuré de véhicules cycliques dans Settings)."
                            className={`px-3 py-2 text-meta font-bold rounded-md border transition-all ${projection.vehicleReplacementEnabled ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-surfaceHighlight border-white/10 text-ink-300'}`}
                        >
                            Véhicule auto-replace {projection.vehicleReplacementEnabled ? 'ON' : 'OFF'}
                        </button>
                    </div>
                </div>

                {/* ─────────────────────────────────────────────────────────── */}
                <div className="pt-3 border-t border-white/5">
                    <h4 className="text-meta font-bold uppercase tracking-widest text-ink-200 mb-2">Monte Carlo & Bootstrap</h4>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-tiny text-ink-300">Itérations Monte Carlo</label>
                            <input type="number" min={50} max={1000} step={50} value={projection.monteCarloIterations ?? 100} onChange={e => updateProj('monteCarloIterations', Number(e.target.value))} className="w-full bg-dark border border-violet-500/20 rounded px-2 py-1 text-meta text-white" />
                            <p className="text-tiny text-ink-400 mt-1">100 = défaut, 500+ pour précision queues</p>
                        </div>
                        <div>
                            <label className="text-tiny text-ink-300">Taille bloc bootstrap (mois)</label>
                            <input type="number" min={12} max={120} step={12} value={projection.bootstrapBlockSize ?? 24} onChange={e => updateProj('bootstrapBlockSize', Number(e.target.value))} className="w-full bg-dark border border-violet-500/20 rounded px-2 py-1 text-meta text-white" />
                            <p className="text-tiny text-ink-400 mt-1">24 = défaut (préserve corrélation 2 ans)</p>
                        </div>
                    </div>
                </div>

                {/* ─────────────────────────────────────────────────────────── */}
                {(projection.divorceEnabled || projection.ltdEnabled || projection.criticalIllnessEnabled || projection.inheritanceEnabled || projection.jobLossEnabled || projection.modelSurvivor) && (
                    <div className="pt-3 border-t border-white/5">
                        <h4 className="text-meta font-bold uppercase tracking-widest text-ink-200 mb-2">Détails événements stochastiques</h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {projection.divorceEnabled && <>
                                <div>
                                    <label className="text-tiny text-ink-300">Divorce: proba annuelle %</label>
                                    <input type="number" step="0.1" value={(projection.divorceAnnualProbability ?? 0.015) * 100} onChange={e => updateProj('divorceAnnualProbability', Number(e.target.value) / 100)} className="w-full bg-dark border border-rose-500/20 rounded px-2 py-1 text-meta text-white" />
                                </div>
                                <div>
                                    <label className="text-tiny text-ink-300">Split patrimoine %</label>
                                    <input type="number" value={projection.divorceSplitPct ?? 50} onChange={e => updateProj('divorceSplitPct', Number(e.target.value))} className="w-full bg-dark border border-rose-500/20 rounded px-2 py-1 text-meta text-white" />
                                </div>
                                <div>
                                    <label className="text-tiny text-ink-300">Pension alimentaire $/mois</label>
                                    <input type="number" value={projection.divorceAlimonyMonthly ?? 0} onChange={e => updateProj('divorceAlimonyMonthly', Number(e.target.value))} className="w-full bg-dark border border-rose-500/20 rounded px-2 py-1 text-meta text-white" />
                                </div>
                            </>}
                            {projection.ltdEnabled && <>
                                <div>
                                    <label className="text-tiny text-ink-300">LTD: proba annuelle %</label>
                                    <input type="number" step="0.1" value={(projection.ltdAnnualProbability ?? 0.005) * 100} onChange={e => updateProj('ltdAnnualProbability', Number(e.target.value) / 100)} className="w-full bg-dark border border-yellow-500/20 rounded px-2 py-1 text-meta text-white" />
                                </div>
                                <div>
                                    <label className="text-tiny text-ink-300">% revenu maintenu</label>
                                    <input type="number" value={projection.ltdIncomeReplacementPct ?? 60} onChange={e => updateProj('ltdIncomeReplacementPct', Number(e.target.value))} className="w-full bg-dark border border-yellow-500/20 rounded px-2 py-1 text-meta text-white" />
                                </div>
                                <div>
                                    <label className="text-tiny text-ink-300">Durée invalidité (mois)</label>
                                    <input type="number" value={projection.ltdDurationMonths ?? 24} onChange={e => updateProj('ltdDurationMonths', Number(e.target.value))} className="w-full bg-dark border border-yellow-500/20 rounded px-2 py-1 text-meta text-white" />
                                </div>
                            </>}
                            {projection.criticalIllnessEnabled && <>
                                <div>
                                    <label className="text-tiny text-ink-300">CI: proba annuelle %</label>
                                    <input type="number" step="0.1" value={(projection.ciAnnualProbability ?? 0.003) * 100} onChange={e => updateProj('ciAnnualProbability', Number(e.target.value) / 100)} className="w-full bg-dark border border-pink-500/20 rounded px-2 py-1 text-meta text-white" />
                                </div>
                                <div>
                                    <label className="text-tiny text-ink-300">Capital forfaitaire reçu $</label>
                                    <input type="number" value={projection.ciPayoutAmount ?? 0} onChange={e => updateProj('ciPayoutAmount', Number(e.target.value))} className="w-full bg-dark border border-pink-500/20 rounded px-2 py-1 text-meta text-white" />
                                </div>
                                <div>
                                    <label className="text-tiny text-ink-300">Dépenses additionnelles $/mois</label>
                                    <input type="number" value={projection.ciExtraMonthlyExpense ?? 0} onChange={e => updateProj('ciExtraMonthlyExpense', Number(e.target.value))} className="w-full bg-dark border border-pink-500/20 rounded px-2 py-1 text-meta text-white" />
                                </div>
                            </>}
                            {projection.inheritanceEnabled && <>
                                <div>
                                    <label className="text-tiny text-ink-300">Héritage attendu $</label>
                                    <input type="number" value={projection.inheritanceExpectedAmount ?? 0} onChange={e => updateProj('inheritanceExpectedAmount', Number(e.target.value))} className="w-full bg-dark border border-warning-500/20 rounded px-2 py-1 text-meta text-white" />
                                </div>
                                <div>
                                    <label className="text-tiny text-ink-300">À l'âge</label>
                                    <input type="number" value={projection.inheritanceExpectedAtAge ?? 60} onChange={e => updateProj('inheritanceExpectedAtAge', Number(e.target.value))} className="w-full bg-dark border border-warning-500/20 rounded px-2 py-1 text-meta text-white" />
                                </div>
                                <div>
                                    <label className="text-tiny text-ink-300">Incertitude ± années</label>
                                    <input type="number" value={projection.inheritanceUncertaintyYears ?? 5} onChange={e => updateProj('inheritanceUncertaintyYears', Number(e.target.value))} className="w-full bg-dark border border-warning-500/20 rounded px-2 py-1 text-meta text-white" />
                                </div>
                                <div>
                                    <label className="text-tiny text-ink-300">Probabilité 0-1</label>
                                    <input type="number" step="0.1" min={0} max={1} value={projection.inheritanceProbability ?? 0.8} onChange={e => updateProj('inheritanceProbability', Number(e.target.value))} className="w-full bg-dark border border-warning-500/20 rounded px-2 py-1 text-meta text-white" />
                                </div>
                            </>}
                            {projection.jobLossEnabled && <>
                                <div>
                                    <label className="text-tiny text-ink-300">Perte emploi: proba annuelle %</label>
                                    <input type="number" step="0.5" value={(projection.jobLossAnnualProbability ?? 0.03) * 100} onChange={e => updateProj('jobLossAnnualProbability', Number(e.target.value) / 100)} className="w-full bg-dark border border-orange-500/20 rounded px-2 py-1 text-meta text-white" />
                                </div>
                                <div>
                                    <label className="text-tiny text-ink-300">Durée chômage (mois)</label>
                                    <input type="number" value={projection.jobLossDurationMonths ?? 6} onChange={e => updateProj('jobLossDurationMonths', Number(e.target.value))} className="w-full bg-dark border border-orange-500/20 rounded px-2 py-1 text-meta text-white" />
                                </div>
                            </>}
                            {projection.modelSurvivor && <>
                                <div>
                                    <label className="text-tiny text-ink-300">Survivant: % RRQ versé</label>
                                    <input type="number" value={projection.rrqSurvivorPct ?? 60} onChange={e => updateProj('rrqSurvivorPct', Number(e.target.value))} className="w-full bg-dark border border-slate-500/20 rounded px-2 py-1 text-meta text-white" />
                                </div>
                                <div>
                                    <label className="text-tiny text-ink-300">% DB conjoint conservé</label>
                                    <input type="number" value={projection.spouseDbSurvivorPct ?? 60} onChange={e => updateProj('spouseDbSurvivorPct', Number(e.target.value))} className="w-full bg-dark border border-slate-500/20 rounded px-2 py-1 text-meta text-white" />
                                </div>
                            </>}
                        </div>
                    </div>
                )}

                {/* ─────────────────────────────────────────────────────────── */}
                <div className="pt-3 border-t border-white/5">
                    <h4 className="text-meta font-bold uppercase tracking-widest text-ink-200 mb-2">Snowbird (détails)</h4>
                    {projection.snowbirdEnabled && (
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-tiny text-ink-300">Mois passés à l'étranger/an</label>
                                <input type="number" value={projection.snowbirdMonthsPerYear ?? 5} onChange={e => updateProj('snowbirdMonthsPerYear', Number(e.target.value))} className="w-full bg-dark border border-cyan-500/20 rounded px-2 py-1 text-meta text-white" />
                            </div>
                            <div>
                                <label className="text-tiny text-ink-300">Surcoût mensuel ($)</label>
                                <input type="number" value={projection.snowbirdExtraMonthlyCost ?? 1500} onChange={e => updateProj('snowbirdExtraMonthlyCost', Number(e.target.value))} className="w-full bg-dark border border-cyan-500/20 rounded px-2 py-1 text-meta text-white" />
                            </div>
                        </div>
                    )}
                    {!projection.snowbirdEnabled && (
                        <p className="text-tiny text-ink-400 italic">Active d'abord le toggle Snowbird dans la grille principale.</p>
                    )}
                </div>

                {/* ─────────────────────────────────────────────────────────── */}
                <div className="pt-3 border-t border-white/5">
                    <h4 className="text-meta font-bold uppercase tracking-widest text-success-400 mb-2">Sandwich Generation</h4>
                    <p className="text-tiny text-ink-400 mb-2 italic">Aide aux enfants adultes (boomerang) et/ou parents âgés (caregiving).</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div>
                            <label className="text-tiny text-emerald-300">Boomerang $/mois</label>
                            <input type="number" value={projection.boomerangSupportMonthly ?? 0} onChange={e => updateProj('boomerangSupportMonthly', Number(e.target.value))} className="w-full bg-dark border border-success-500/20 rounded px-2 py-1 text-meta text-white" />
                        </div>
                        <div>
                            <label className="text-tiny text-emerald-300">Début (âge user)</label>
                            <input type="number" value={projection.boomerangStartAge ?? 0} onChange={e => updateProj('boomerangStartAge', Number(e.target.value))} className="w-full bg-dark border border-success-500/20 rounded px-2 py-1 text-meta text-white" />
                        </div>
                        <div>
                            <label className="text-tiny text-emerald-300">Durée (mois)</label>
                            <input type="number" value={projection.boomerangDurationMonths ?? 0} onChange={e => updateProj('boomerangDurationMonths', Number(e.target.value))} className="w-full bg-dark border border-success-500/20 rounded px-2 py-1 text-meta text-white" />
                        </div>
                        <div>
                            <label className="text-tiny text-emerald-300">Caregiving $/mois</label>
                            <input type="number" value={projection.caregivingMonthly ?? 0} onChange={e => updateProj('caregivingMonthly', Number(e.target.value))} className="w-full bg-dark border border-success-500/20 rounded px-2 py-1 text-meta text-white" />
                        </div>
                        <div>
                            <label className="text-tiny text-emerald-300">Début (âge user)</label>
                            <input type="number" value={projection.caregivingStartAge ?? 0} onChange={e => updateProj('caregivingStartAge', Number(e.target.value))} className="w-full bg-dark border border-success-500/20 rounded px-2 py-1 text-meta text-white" />
                        </div>
                        <div>
                            <label className="text-tiny text-emerald-300">Durée (mois)</label>
                            <input type="number" value={projection.caregivingDurationMonths ?? 0} onChange={e => updateProj('caregivingDurationMonths', Number(e.target.value))} className="w-full bg-dark border border-success-500/20 rounded px-2 py-1 text-meta text-white" />
                        </div>
                    </div>
                </div>

                {/* ─────────────────────────────────────────────────────────── */}
                <div className="pt-3 border-t border-white/5">
                    <h4 className="text-meta font-bold uppercase tracking-widest text-info-400 mb-2">Soldes initiaux manuels</h4>
                    <button
                        onClick={() => updateProj('useManualBalances', !projection.useManualBalances)}
                        className={`px-3 py-2 text-meta font-bold rounded-md border transition-all mb-2 ${projection.useManualBalances ? 'bg-info-500/20 border-info-500/50 text-blue-300' : 'bg-surfaceHighlight border-white/10 text-ink-300'}`}
                    >
                        Outrepasser balances live {projection.useManualBalances ? 'ON' : 'OFF'}
                    </button>
                    {projection.useManualBalances && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            <div>
                                <label className="text-tiny text-ink-300">CELI $</label>
                                <input type="number" value={projection.manualCELI ?? 0} onChange={e => updateProj('manualCELI', Number(e.target.value))} className="w-full bg-dark border border-info-500/20 rounded px-2 py-1 text-meta text-white" />
                            </div>
                            <div>
                                <label className="text-tiny text-ink-300">REER $</label>
                                <input type="number" value={projection.manualREER ?? 0} onChange={e => updateProj('manualREER', Number(e.target.value))} className="w-full bg-dark border border-info-500/20 rounded px-2 py-1 text-meta text-white" />
                            </div>
                            <div>
                                <label className="text-tiny text-ink-300">Non-Enreg $</label>
                                <input type="number" value={projection.manualNonReg ?? 0} onChange={e => updateProj('manualNonReg', Number(e.target.value))} className="w-full bg-dark border border-info-500/20 rounded px-2 py-1 text-meta text-white" />
                            </div>
                            <div>
                                <label className="text-tiny text-ink-300">Cash $</label>
                                <input type="number" value={projection.manualCash ?? 0} onChange={e => updateProj('manualCash', Number(e.target.value))} className="w-full bg-dark border border-info-500/20 rounded px-2 py-1 text-meta text-white" />
                            </div>
                            <div>
                                <label className="text-tiny text-ink-300">Crypto $</label>
                                <input type="number" value={projection.manualCrypto ?? 0} onChange={e => updateProj('manualCrypto', Number(e.target.value))} className="w-full bg-dark border border-info-500/20 rounded px-2 py-1 text-meta text-white" />
                            </div>
                            <div>
                                <label className="text-tiny text-ink-300">CELI room restant $</label>
                                <input type="number" value={projection.manualCELIRoom ?? 0} onChange={e => updateProj('manualCELIRoom', Number(e.target.value))} className="w-full bg-dark border border-info-500/20 rounded px-2 py-1 text-meta text-white" />
                            </div>
                            <div>
                                <label className="text-tiny text-ink-300">REER room restant $</label>
                                <input type="number" value={projection.manualREERRoom ?? 0} onChange={e => updateProj('manualREERRoom', Number(e.target.value))} className="w-full bg-dark border border-info-500/20 rounded px-2 py-1 text-meta text-white" />
                            </div>
                        </div>
                    )}
                </div>

                {/* ─────────────────────────────────────────────────────────── */}
                <div className="pt-3 border-t border-white/5">
                    <h4 className="text-meta font-bold uppercase tracking-widest text-ink-200 mb-2">Rendements affinés</h4>
                    <p className="text-tiny text-ink-400 mb-2 italic">Override des taux par défaut (crypto/cash absents de la grille principale).</p>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-tiny text-ink-300">Rendement crypto annuel (%)</label>
                            <input type="number" step="0.5" value={projection.returnRates?.crypto ?? 10} onChange={e => updateProj('returnRates', { ...projection.returnRates, crypto: Number(e.target.value) })} className="w-full bg-dark border border-teal-500/20 rounded px-2 py-1 text-meta text-white" />
                        </div>
                        <div>
                            <label className="text-tiny text-ink-300">Rendement cash/HISA annuel (%)</label>
                            <input type="number" step="0.1" value={projection.returnRates?.cash ?? 3} onChange={e => updateProj('returnRates', { ...projection.returnRates, cash: Number(e.target.value) })} className="w-full bg-dark border border-teal-500/20 rounded px-2 py-1 text-meta text-white" />
                        </div>
                    </div>
                </div>
            </details>
        </Card>
    );
};
