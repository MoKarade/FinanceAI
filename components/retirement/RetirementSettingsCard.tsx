import React from 'react';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { RetirementGoal } from '../../types';

/**
 * Carte d'édition des paramètres de retraite, déplacée depuis Configuration
 * vers l'onglet Retraite (demande Marc : éditer les infos dans l'onglet concerné).
 * Autonome (lit le store) — reste la source de vérité unique qui alimente
 * Retraite, Investissement et Futur.
 */
export const RetirementSettingsCard: React.FC = () => {
    const retirementGoal = useFinanceStore((s) => s.retirementGoal);
    const setAppState = useFinanceStore((s) => s.setAppState);

    return (
        <Card icon={<Icon name="retirement" size={18} />} title="Paramètres de retraite">
            <div className="space-y-4">
                <p className="text-meta text-ink-400">
                    Source de vérité unique — alimente Retraite, Investissement et Futur.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div data-focus-section="profile-retirementAge">
                        <label className="block text-meta text-ink-300 mb-1">Âge de retraite cible</label>
                        <input
                            type="number"
                            min={50}
                            max={75}
                            value={retirementGoal?.targetAge ?? 65}
                            onChange={(e) => setAppState({ retirementGoal: { ...(retirementGoal as RetirementGoal), targetAge: Number(e.target.value) || 65 } })}
                            className="w-full bg-dark border border-border rounded px-3 py-2 text-white focus:border-primary outline-none"
                        />
                    </div>
                    <div data-focus-section="profile-lifeExpectancy">
                        <label className="block text-meta text-ink-300 mb-1">
                            Espérance de vie
                            <span className="ml-1 text-tiny text-ink-500">(80–100 ans)</span>
                        </label>
                        <input
                            type="number"
                            min={80}
                            max={105}
                            value={retirementGoal?.lifeExpectancy ?? 90}
                            onChange={(e) => setAppState({ retirementGoal: { ...(retirementGoal as RetirementGoal), lifeExpectancy: Number(e.target.value) || 90 } })}
                            className="w-full bg-dark border border-border rounded px-3 py-2 text-white focus:border-primary outline-none"
                        />
                    </div>
                    <div data-focus-section="profile-retirementIncome">
                        <label className="block text-meta text-ink-300 mb-1">Revenu mensuel cible</label>
                        <input
                            type="number"
                            min={0}
                            step={100}
                            value={retirementGoal?.targetMonthlyIncome ?? 4000}
                            onChange={(e) => setAppState({ retirementGoal: { ...(retirementGoal as RetirementGoal), targetMonthlyIncome: Number(e.target.value) || 0 } })}
                            className="w-full bg-dark border border-border rounded px-3 py-2 text-white focus:border-primary outline-none"
                        />
                    </div>
                </div>
            </div>
        </Card>
    );
};
