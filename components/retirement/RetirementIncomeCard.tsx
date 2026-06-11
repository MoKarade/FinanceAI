// components/retirement/RetirementIncomeCard.tsx
// PH3 — éditeur de REVENU-RETRAITE (besoin mensuel, RRQ/PSV/pension d'État agrégée, pension
// d'employeur DB + options de survie), EXTRAIT verbatim de l'onglet Retraite vers l'onglet Profil
// unifié. Self-contained : lit/écrit `retirementGoal` du store (mêmes clés → zéro perte de données).
import React from 'react';
import { Card } from '../ui/Card';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { useFinanceStore } from '../../store/useFinanceStore';
import { numOr, numOrUndef } from '../../utils/numericInput';
import type { RetirementGoal } from '../../types';

export const RetirementIncomeCard: React.FC = () => {
    const goal = useFinanceStore((s) => s.retirementGoal);
    const setAppState = useFinanceStore((s) => s.setAppState);
    const updateGoal = <K extends keyof RetirementGoal>(key: K, val: RetirementGoal[K]) =>
        setAppState({ retirementGoal: { ...goal, [key]: val } });
    const setGoal = (g: RetirementGoal) => setAppState({ retirementGoal: g });

    return (
                    <Card title="Rentes & pensions">
                        {/* Revue #244 (MAJEUR) — le champ « Besoin Mensuel » (targetMonthlyIncome) a été RETIRÉ
                            d'ici : il dupliquait « Revenu mensuel cible » de RetirementSettingsCard (même clé
                            store), rendu juste au-dessus dans Profil. UN seul éditeur par champ. */}
                        <div className="space-y-5">
                            <div>
                                <label htmlFor="ric-govPension" className="block text-meta text-ink-300 mb-1">Rente Etat agrégée (RRQ + PSV / mois) — legacy</label>
                                <input id="ric-govPension" type="number" value={goal.governmentPension} onChange={e => updateGoal('governmentPension', numOr(e.target.value, goal.governmentPension))} className="w-full bg-black/40 border border-info-500/20 rounded-lg px-3 py-2 text-blue-300 font-bold focus:border-info-500 transition-colors outline-none privacy-blur" />
                                <p className="text-tiny text-ink-500 mt-1">Si tu remplis les 2 champs ci-dessous, ce champ est ignoré.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
                                <div>
                                    <label htmlFor="ric-rrq" className="block text-meta text-ink-300 mb-1">🇨🇦 RRQ projetée / mois (par personne)</label>
                                    <input id="ric-rrq"
                                        type="number"
                                        value={goal.rrqEstimateMonthly ?? ''}
                                        placeholder="ex: 1100"
                                        onChange={e => updateGoal('rrqEstimateMonthly', numOrUndef(e.target.value))}
                                        className="w-full bg-black/40 border border-info-500/20 rounded-lg px-3 py-2 text-blue-300 text-body focus:border-info-500 transition-colors outline-none"
                                    />
                                    <p className="text-tiny text-ink-500 mt-1">Max 2025: 1 433$/mois. Consulte ton relevé RRQ.</p>
                                </div>
                                <div>
                                    <label htmlFor="ric-psv" className="block text-meta text-ink-300 mb-1">PSV projetée / mois</label>
                                    <input id="ric-psv"
                                        type="number"
                                        value={goal.psvEstimateMonthly ?? ''}
                                        placeholder="ex: 734"
                                        onChange={e => updateGoal('psvEstimateMonthly', numOrUndef(e.target.value))}
                                        className="w-full bg-black/40 border border-info-500/20 rounded-lg px-3 py-2 text-blue-300 text-body focus:border-info-500 transition-colors outline-none"
                                    />
                                    <p className="text-tiny text-ink-500 mt-1">Max 2025: 734$/mois (40 ans résidence).</p>
                                </div>
                            </div>
                            {/* [EP-8] Pension d'employeur DB repliée par défaut : moins courante que RRQ/PSV
                                (laisse vide si tu n'as que du REER/CD). Les champs de détail restent
                                conditionnels au montant DB > 0. */}
                            <CollapsibleSection
                                title="Pension d'employeur (prestations déterminées)"
                                subtitle="Optionnel — RREGOP, fonction publique, régime garanti viager."
                                defaultOpen={(goal.dbPensionMonthly ?? 0) > 0}
                                variant="quiet"
                            >
                                <div className="space-y-4 pt-1">
                                    <div>
                                        <label htmlFor="ric-dbMonthly" className="block text-meta text-ink-300 mb-1">Pension employeur DB (prestations determinees) / mois</label>
                                        <input id="ric-dbMonthly"
                                            type="number"
                                            value={goal.dbPensionMonthly ?? 0}
                                            onChange={e => updateGoal('dbPensionMonthly', numOr(e.target.value, goal.dbPensionMonthly ?? 0))}
                                            placeholder="0"
                                            className="w-full bg-black/40 border border-success-500/20 rounded-lg px-3 py-2 text-emerald-300 font-bold focus:border-success-500 transition-colors outline-none privacy-blur"
                                        />
                                        <p className="text-tiny text-ink-500 mt-1">RREGOP, fonction publique federale, regime garanti viager. Laisse 0 si tu n'as que du REER/CD.</p>
                                    </div>
                                    {(goal.dbPensionMonthly ?? 0) > 0 && (
                                        <div className="grid grid-cols-2 gap-3 pb-3 border-b border-white/5">
                                            <div>
                                                <label htmlFor="ric-dbElection" className="block text-meta text-ink-300 mb-1">Option DB (au décès)</label>
                                                <select id="ric-dbElection"
                                                    value={goal.dbElectionType ?? 'joint60'}
                                                    onChange={e => setGoal({ ...goal, dbElectionType: e.target.value as RetirementGoal['dbElectionType'] })}
                                                    className="w-full bg-black/40 border border-success-500/10 rounded-lg px-3 py-2 text-emerald-200 text-body"
                                                >
                                                    <option value="single">Vie seule (rente cesse)</option>
                                                    <option value="joint60">Conjoint à 60% (recommandé)</option>
                                                    <option value="joint66">Conjoint à 66%</option>
                                                    <option value="joint100">Conjoint à 100% (rente réduite)</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label htmlFor="ric-dbSurvivor" className="block text-meta text-ink-300 mb-1">% rente survivant</label>
                                                <input id="ric-dbSurvivor"
                                                    type="number"
                                                    min={0}
                                                    max={100}
                                                    value={goal.dbSurvivorPct ?? 60}
                                                    onChange={e => updateGoal('dbSurvivorPct', numOr(e.target.value, goal.dbSurvivorPct ?? 60))}
                                                    className="w-full bg-black/40 border border-success-500/10 rounded-lg px-3 py-2 text-emerald-200 text-body"
                                                />
                                            </div>
                                        </div>
                                    )}
                                    {(goal.dbPensionMonthly ?? 0) > 0 && (
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label htmlFor="ric-dbIndex" className="block text-meta text-ink-300 mb-1">Indexation IPC (%)</label>
                                                <input id="ric-dbIndex"
                                                    type="number"
                                                    min={0}
                                                    max={100}
                                                    value={goal.dbPensionIndexationPct ?? 100}
                                                    onChange={e => updateGoal('dbPensionIndexationPct', numOr(e.target.value, goal.dbPensionIndexationPct ?? 100))}
                                                    className="w-full bg-black/40 border border-success-500/10 rounded-lg px-3 py-2 text-emerald-200 text-body focus:border-success-500 transition-colors outline-none"
                                                />
                                                <p className="text-tiny text-ink-500 mt-1">100 = pleine indexation, 50 = demi, 0 = nominale</p>
                                            </div>
                                            <div>
                                                <label htmlFor="ric-dbStartAge" className="block text-meta text-ink-300 mb-1">Age debut versement</label>
                                                <input id="ric-dbStartAge"
                                                    type="number"
                                                    min={50}
                                                    max={75}
                                                    value={goal.dbPensionStartAge ?? goal.targetAge}
                                                    onChange={e => updateGoal('dbPensionStartAge', numOr(e.target.value, goal.dbPensionStartAge ?? goal.targetAge))}
                                                    className="w-full bg-black/40 border border-success-500/10 rounded-lg px-3 py-2 text-emerald-200 text-body focus:border-success-500 transition-colors outline-none"
                                                />
                                                <p className="text-tiny text-ink-500 mt-1">Defaut = age cible retraite</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </CollapsibleSection>
                        </div>
                    </Card>
    );
};
