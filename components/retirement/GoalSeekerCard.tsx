// components/retirement/GoalSeekerCard.tsx
// Architecture refactor (code-architect agent): extraction de la Card
// "Projection inverse" hors de Retirement.tsx pour réduire la complexité.

import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { findRequiredMonthlySavings, findEarliestRetirementAge } from '../../services/projection/goalSeek';
import { compareLifeScenarios } from '../../services/projection/drawdownOptimizer';
import type { SimulationParams } from '../../services/projection';
import { Icon } from '../ui/Icon';
import { PrivateAmount } from '../ui/PrivateAmount';
import { formatCAD } from '../../utils/format';

interface GoalSeekerCardProps {
    paramsBuilder: () => SimulationParams;
    targetAge: number;
}

export const GoalSeekerCard: React.FC<GoalSeekerCardProps> = ({ paramsBuilder, targetAge }) => {
    const [goalSeekTarget, setGoalSeekTarget] = useState<number>(1_000_000);
    const [goalSeekResult, setGoalSeekResult] = useState<{ savings?: number; age?: number; error?: string } | null>(null);
    const [drawdownResult, setDrawdownResult] = useState<ReturnType<typeof compareLifeScenarios> | null>(null);
    const [busySavings, setBusySavings] = useState(false);
    const [busyAge, setBusyAge] = useState(false);
    const [busyDrawdown, setBusyDrawdown] = useState(false);

    const handleSavings = () => {
        setBusySavings(true);
        setTimeout(() => {
            const r = findRequiredMonthlySavings(paramsBuilder(), goalSeekTarget, targetAge, 0, 15000, goalSeekTarget * 0.02, 20);
            setGoalSeekResult(r.found ? { savings: r.value } : { savings: r.value, error: r.error });
            setBusySavings(false);
        }, 50);
    };

    const handleAge = () => {
        setBusyAge(true);
        setTimeout(() => {
            const r = findEarliestRetirementAge(paramsBuilder());
            setGoalSeekResult({ age: r.value });
            setBusyAge(false);
        }, 50);
    };

    const handleDrawdown = () => {
        setBusyDrawdown(true);
        setTimeout(() => {
            setDrawdownResult(compareLifeScenarios(paramsBuilder()));
            setBusyDrawdown(false);
        }, 50);
    };

    const anyBusy = busySavings || busyAge || busyDrawdown;

    return (
        <Card icon={<Icon name="goal" size={18} />} title="Projection inverse (Goal seeker)">
            <div className="space-y-4">
                <p className="text-meta text-ink-300">
                    Au lieu de tâtonner les sliders, dis-nous combien tu veux avoir et on calcule l'épargne nécessaire.
                </p>
                <div>
                    <label htmlFor="goalseek-target" className="block text-meta text-ink-300 mb-1">Patrimoine cible à la retraite</label>
                    <input
                        id="goalseek-target"
                        type="number"
                        value={goalSeekTarget}
                        onChange={e => setGoalSeekTarget(Number(e.target.value))}
                        className="w-full bg-black/40 border border-purple-500/20 rounded-lg px-3 py-2 text-purple-300 font-bold focus:border-purple-500 transition-colors outline-none"
                    />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={handleSavings}
                        disabled={busySavings}
                        className="px-3 py-2 bg-purple-500/20 border border-purple-500/50 rounded-md text-purple-300 text-meta font-bold hover:bg-purple-500/30 disabled:opacity-50"
                    >
                        Trouver épargne $/mois
                    </button>
                    <button
                        onClick={handleAge}
                        disabled={busyAge}
                        className="px-3 py-2 bg-purple-500/20 border border-purple-500/50 rounded-md text-purple-300 text-meta font-bold hover:bg-purple-500/30 disabled:opacity-50"
                    >
                        Âge retraite minimum
                    </button>
                </div>
                <button
                    onClick={handleDrawdown}
                    disabled={busyDrawdown}
                    className="w-full px-3 py-2 bg-indigo-500/20 border border-indigo-500/50 rounded-md text-indigo-300 text-meta font-bold hover:bg-indigo-500/30 disabled:opacity-50"
                >
                    Optimiser ordre de décaissement
                </button>
                {drawdownResult && !busyDrawdown && (
                    <div className="p-3 bg-white/[0.03] border border-white/10 rounded-lg space-y-2">
                        <p className="text-meta text-ink-300">{drawdownResult.explanation}</p>
                        <div className="space-y-1">
                            {drawdownResult.results
                                .sort((a, b) => b.estateNetWorth - a.estateNetWorth)
                                .map((r, i) => (
                                    <div key={r.scenarioType} className="flex justify-between text-tiny text-ink-200">
                                        <span className="flex items-center gap-2"><span className="w-4 h-4 inline-flex items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-ink-300 shrink-0">{i + 1}</span>{r.strategyName}</span>
                                        <PrivateAmount className="font-mono" title="Patrimoine successoral, rentes RRQ/PSV incluses">{formatCAD(r.estateNetWorth)}</PrivateAmount>
                                    </div>
                                ))}
                        </div>
                    </div>
                )}
                {anyBusy && <p className="text-meta text-ink-300">Calcul en cours…</p>}
                {goalSeekResult && !busySavings && !busyAge && (
                    <div className="p-3 bg-white/[0.03] border border-white/10 rounded-lg">
                        {goalSeekResult.savings !== undefined && (
                            <p className="text-body text-ink-200">
                                Tu dois épargner <strong className="text-primary"><PrivateAmount>{formatCAD(goalSeekResult.savings)}</PrivateAmount>/mois</strong>
                                {goalSeekResult.error && <span className="text-meta text-orange-300 mt-1 flex items-center gap-1.5"><Icon name="alert" size={13} /> {goalSeekResult.error}</span>}
                            </p>
                        )}
                        {goalSeekResult.age !== undefined && (
                            <p className="text-body text-ink-200">
                                Tu peux prendre ta retraite dès <strong className="text-primary">{goalSeekResult.age} ans</strong> sans tomber en faillite.
                            </p>
                        )}
                    </div>
                )}
            </div>
        </Card>
    );
};
