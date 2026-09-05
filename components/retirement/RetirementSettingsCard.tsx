import React from 'react';
import { Card } from '../ui/Card';
import { PrivateNumberInput } from '../ui/PrivateNumberInput';
import { Icon } from '../ui/Icon';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { RetirementGoal } from '../../types';
import { DEFAULT_LIFE_EXPECTANCY } from '../../services/projection/modelAssumptions';

/**
 * Carte d'édition des paramètres de retraite, déplacée depuis Configuration
 * vers l'onglet Retraite (demande Marc : éditer les infos dans l'onglet concerné).
 * Autonome (lit le store) — reste la source de vérité unique qui alimente
 * Retraite, Investissement et Futur.
 */
export const RetirementSettingsCard: React.FC = () => {
    const retirementGoal = useFinanceStore((s) => s.retirementGoal);
    const setAppState = useFinanceStore((s) => s.setAppState);

    // Âge de DÉBUT des rentes (indépendant de l'âge d'arrêt). Défaut = min(âge retraite, 65),
    // borné aux plages légales (RRQ 60-72 depuis 2024 ; PSV 65-70). Cf moteur retirementIncome.
    const targetAge = retirementGoal?.targetAge ?? 65;
    const defaultRrqStart = Math.min(72, Math.max(60, Math.min(targetAge, 65)));
    const defaultPsvStart = Math.min(70, Math.max(65, Math.min(targetAge, 65)));

    return (
        <Card icon={<Icon name="retirement" size={18} />} title="Paramètres de retraite">
            <div className="space-y-4">
                <p className="text-meta text-ink-400">
                    Source de vérité unique — alimente Retraite, Investissement et Futur.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div data-focus-section="profile-retirementAge">
                        <label htmlFor="rsc-targetAge" className="block text-meta text-ink-300 mb-1">Âge de retraite cible</label>
                        <input id="rsc-targetAge"
                            type="number"
                            min={50}
                            max={75}
                            value={retirementGoal?.targetAge ?? 65}
                            onChange={(e) => setAppState({ retirementGoal: { ...(retirementGoal as RetirementGoal), targetAge: Number(e.target.value) || 65 } })}
                            className="w-full bg-dark border border-border rounded px-3 py-2 text-white focus:border-primary outline-none"
                        />
                    </div>
                    <div data-focus-section="profile-lifeExpectancy">
                        <label htmlFor="rsc-lifeExp" className="block text-meta text-ink-300 mb-1">
                            Espérance de vie
                            <span className="ml-1 text-tiny text-ink-400">(80–100 ans)</span>
                        </label>
                        <input id="rsc-lifeExp"
                            type="number"
                            min={80}
                            max={105}
                            value={retirementGoal?.lifeExpectancy ?? DEFAULT_LIFE_EXPECTANCY}
                            onChange={(e) => setAppState({ retirementGoal: { ...(retirementGoal as RetirementGoal), lifeExpectancy: Number(e.target.value) || DEFAULT_LIFE_EXPECTANCY } })}
                            className="w-full bg-dark border border-border rounded px-3 py-2 text-white focus:border-primary outline-none"
                        />
                    </div>
                    <div data-focus-section="profile-retirementIncome">
                        <label htmlFor="rsc-income" className="block text-meta text-ink-300 mb-1">Revenu mensuel cible</label>
                        <PrivateNumberInput id="rsc-income"
                            type="number"
                            min={0}
                            step={100}
                            value={retirementGoal?.targetMonthlyIncome ?? 4000}
                            onChange={(e) => setAppState({ retirementGoal: { ...(retirementGoal as RetirementGoal), targetMonthlyIncome: Number(e.target.value) || 0 } })}
                            className="w-full bg-dark border border-border rounded px-3 py-2 text-white focus:border-primary outline-none"
                        />
                    </div>
                </div>

                {/* Âge de DÉBUT des rentes — choix indépendant de l'âge d'arrêt de travail
                    (correctif bug « pas de rente avant l'âge de retraite », 2026-06). */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="rsc-rrqStart" className="block text-meta text-ink-300 mb-1">
                            Début rente RRQ
                            <span className="ml-1 text-tiny text-ink-400">(60–72 ans)</span>
                        </label>
                        <input id="rsc-rrqStart"
                            type="number"
                            min={60}
                            max={72}
                            value={retirementGoal?.rrqStartAge ?? defaultRrqStart}
                            onChange={(e) => setAppState({ retirementGoal: { ...(retirementGoal as RetirementGoal), rrqStartAge: Math.min(72, Math.max(60, Number(e.target.value) || 65)) } })}
                            className="w-full bg-dark border border-border rounded px-3 py-2 text-white focus:border-primary outline-none"
                        />
                    </div>
                    <div>
                        <label htmlFor="rsc-psvStart" className="block text-meta text-ink-300 mb-1">
                            Début pension PSV
                            <span className="ml-1 text-tiny text-ink-400">(65–70 ans)</span>
                        </label>
                        <input id="rsc-psvStart"
                            type="number"
                            min={65}
                            max={70}
                            value={retirementGoal?.psvStartAge ?? defaultPsvStart}
                            onChange={(e) => setAppState({ retirementGoal: { ...(retirementGoal as RetirementGoal), psvStartAge: Math.min(70, Math.max(65, Number(e.target.value) || 65)) } })}
                            className="w-full bg-dark border border-border rounded px-3 py-2 text-white focus:border-primary outline-none"
                        />
                    </div>
                </div>
                <p className="text-tiny text-ink-400 leading-snug">
                    Le début des rentes est <strong>indépendant de ton âge d'arrêt de travail</strong> :
                    tu peux arrêter tôt et toucher le RRQ/PSV plus tard (ou l'inverse). Reporter
                    <strong> bonifie</strong> la rente — RRQ jusqu'à 72 ans (+58,8 %), PSV jusqu'à 70 ans
                    (+36 %). Par défaut = ton âge de retraite (plafonné à 65 ans).
                </p>
            </div>
        </Card>
    );
};
