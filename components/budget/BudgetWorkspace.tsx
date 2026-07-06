// components/budget/BudgetWorkspace.tsx
// G22-N3 — regroupe Budget + Planif/Abos en sous-onglets dans l'onglet « Budget ».
//
// L'ancien onglet « Planif & Abos » (Planning) est fusionné ici : on ne touche pas
// aux composants Budget/Planning eux-mêmes, on les compose. Planning rend des
// sous-sections via sa prop `section` ('fixed' = abonnements/récurrents + calendrier,
// 'goals' = objectifs d'épargne). Budget et Planning partagent déjà budgetItems/config.

import React, { useState, useMemo } from 'react';
import type { Transaction, BudgetConfig, BudgetCategory, SavingsGoal } from '../../types';
import { monthlyActualsMap } from '../../utils/budget';
import { Budget } from '../Budget';
import { Planning } from '../Planning';
import { HealthIndicator } from '../dashboard/HealthIndicator';
import { ProfileFieldsMoved } from '../settings/ProfileFieldsMoved';
import { Icon, type IconName } from '../ui/Icon';

interface BudgetWorkspaceProps {
    transactions: Transaction[];
    config: BudgetConfig;
    budgetItems: BudgetCategory[];
    setBudgetItems: (items: BudgetCategory[]) => void;
    apiKey: string;
    savingsGoals: SavingsGoal[];
    setSavingsGoals: (goals: SavingsGoal[]) => void;
}

type SubTab = 'budget' | 'fixed' | 'goals' | 'sante';

const SUB_TABS: ReadonlyArray<{ id: SubTab; label: string; icon: IconName }> = [
    { id: 'budget', label: 'Budget', icon: 'chart' },
    { id: 'fixed', label: 'Charges fixes & Abos', icon: 'clock' },
    { id: 'goals', label: 'Objectifs', icon: 'goal' },
    { id: 'sante', label: 'Santé', icon: 'health' }, // [PH4-D] indicateur de santé financière ramené du Dashboard
];

export const BudgetWorkspace: React.FC<BudgetWorkspaceProps> = ({
    transactions, config, budgetItems, setBudgetItems, apiKey, savingsGoals, setSavingsGoals,
}) => {
    const [sub, setSub] = useState<SubTab>('budget');

    // [PH4-C] Dépense réelle rapprochée du MOIS COURANT par catégorie → « versé ce mois » des objectifs liés.
    // Calculé ici (parent) pour le partager avec Planning (frère de Budget). `monthStr` ré-évalué à chaque render
    // (et dans les deps) → réactif au passage de mois, pas figé (revue panel).
    const monthStr = new Date().toISOString().substring(0, 7);
    const monthActualsMap = useMemo(
        () => monthlyActualsMap(transactions, budgetItems, monthStr),
        [transactions, budgetItems, monthStr],
    );

    return (
        <div className="space-y-4">
            <div className="flex gap-1 p-0.5 rounded-card bg-black/30 border border-white/5 w-fit overflow-x-auto" role="tablist" aria-label="Sections Budget">
                {SUB_TABS.map((s) => (
                    <button
                        key={s.id}
                        type="button"
                        role="tab"
                        aria-selected={sub === s.id}
                        onClick={() => setSub(s.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-meta font-bold rounded whitespace-nowrap transition-colors focus-ring ${sub === s.id ? 'bg-primary text-dark' : 'text-ink-300 hover:text-ink-50 hover:bg-white/10'}`}
                    >
                        <Icon name={s.icon} size={14} />{s.label}
                    </button>
                ))}
            </div>

            {/* PH3 — mode de répartition (couple) déplacé dans l'onglet Profil unifié. */}
            <ProfileFieldsMoved what="Le mode de répartition du couple" />

            {sub === 'budget' && (
                <Budget transactions={transactions} config={config} budgetItems={budgetItems} setBudgetItems={setBudgetItems} apiKey={apiKey} />
            )}
            {sub === 'fixed' && (
                <Planning section="fixed" transactions={transactions} savingsGoals={savingsGoals} setSavingsGoals={setSavingsGoals} budgetItems={budgetItems} setBudgetItems={setBudgetItems} config={config} apiKey={apiKey} />
            )}
            {sub === 'goals' && (
                <Planning section="goals" transactions={transactions} savingsGoals={savingsGoals} setSavingsGoals={setSavingsGoals} budgetItems={budgetItems} setBudgetItems={setBudgetItems} config={config} apiKey={apiKey} actualsMap={monthActualsMap} />
            )}
            {sub === 'sante' && (
                <HealthIndicator />
            )}
        </div>
    );
};
