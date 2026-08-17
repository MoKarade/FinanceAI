// components/budget/BudgetWorkspace.tsx
// G22-N3 — regroupe Budget + Planif/Abos en sous-onglets dans l'onglet « Budget ».
//
// L'ancien onglet « Planif & Abos » (Planning) est fusionné ici : on ne touche pas
// aux composants Budget/Planning eux-mêmes, on les compose. Planning rend des
// sous-sections via sa prop `section` ('fixed' = abonnements/récurrents + calendrier,
// 'goals' = objectifs d'épargne). Budget et Planning partagent déjà budgetItems/config.
//
// [REFONTE-NAV-L5] Le workspace porte désormais l'EN-TÊTE DE PAGE (h1 = TAB_LABELS,
// commun aux quatre sous-onglets — un seul h1 par destination, comme Transactions)
// et consomme le deep-link `pendingFocus` venu de Transactions (« Voir au budget »
// sur une catégorie → section `poste:<nom>` → sous-onglet Budget + scroll au poste).

import React, { useState, useMemo } from 'react';
import { Tab, type Transaction, type BudgetConfig, type BudgetCategory, type SavingsGoal } from '../../types';
import { TAB_LABELS } from '../../constants';
import { monthlyActualsMap } from '../../utils/budget';
import { useFinanceStore } from '../../store/useFinanceStore';
import { usePendingFocus } from '../../utils/usePendingFocus';
import { Budget } from '../Budget';
import { Planning } from '../Planning';
import { HealthIndicator } from '../dashboard/HealthIndicator';
import { ProfileFieldsMoved } from '../settings/ProfileFieldsMoved';
import { PageHeader } from '../ui/PageHeader';
import { Icon, type IconName } from '../ui/Icon';
import { SubTabs, TabPanel } from '../ui/SubTabs';

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

/** [REFONTE-NAV-L5] Section de deep-link → sous-onglet (même patron que Settings). */
function subTabForSection(section: string | null | undefined): SubTab | null {
    if (!section) return null;
    if (section.startsWith('poste:')) return 'budget';
    if (section === 'abonnements' || section === 'fixed') return 'fixed';
    if (section === 'objectifs' || section === 'goals') return 'goals';
    if (section === 'sante') return 'sante';
    return null;
}

export const BudgetWorkspace: React.FC<BudgetWorkspaceProps> = ({
    transactions, config, budgetItems, setBudgetItems, apiKey, savingsGoals, setSavingsGoals,
}) => {
    // [REFONTE-NAV-L5] Deep-link : démarrer sur le sous-onglet ciblé pour que l'élément
    // `data-focus-section` soit monté quand usePendingFocus tente le scroll (patron Settings).
    const pendingFocus = useFinanceStore(s => s.pendingFocus);
    const [sub, setSub] = useState<SubTab>(() => {
        if (pendingFocus && pendingFocus.tab === Tab.BUDGET && Date.now() <= pendingFocus.expiresAt) {
            return subTabForSection(pendingFocus.section) ?? 'budget';
        }
        return 'budget';
    });
    // Consomme pendingFocus + scroll vers le poste ciblé (one-shot).
    usePendingFocus(Tab.BUDGET);

    // [PH4-C] Dépense réelle rapprochée du MOIS COURANT par catégorie → « versé ce mois » des objectifs liés.
    // Calculé ici (parent) pour le partager avec Planning (frère de Budget). `monthStr` ré-évalué à chaque render
    // (et dans les deps) → réactif au passage de mois, pas figé (revue panel).
    const monthStr = new Date().toISOString().substring(0, 7);
    const monthActualsMap = useMemo(
        () => monthlyActualsMap(transactions, budgetItems, monthStr),
        [transactions, budgetItems, monthStr],
    );

    return (
        <div className="space-y-4 stagger-in">
            {/* [REFONTE-NAV-L5] En-tête de page : titre = TAB_LABELS (cohérence de la destination
                Transactions), stable quel que soit le sous-onglet actif. */}
            <PageHeader
                icon={<Icon name="budget" size={28} />}
                title={TAB_LABELS[Tab.BUDGET]}
                subtitle="Budget, charges fixes & abonnements, objectifs et santé — ton argent au quotidien."
            />

            <SubTabs<SubTab>
                idPrefix="budget"
                label="Sections Budget"
                tabs={SUB_TABS}
                active={sub}
                onSelect={setSub}
            />

            {/* PH3 — mode de répartition (couple) déplacé dans l'onglet Profil unifié. */}
            <ProfileFieldsMoved what="Le mode de répartition du couple" />

            <TabPanel idPrefix="budget" tab="budget" when={sub === 'budget'}>
                <Budget transactions={transactions} config={config} budgetItems={budgetItems} setBudgetItems={setBudgetItems} apiKey={apiKey} />
            </TabPanel>
            <TabPanel idPrefix="budget" tab="fixed" when={sub === 'fixed'}>
                <Planning section="fixed" transactions={transactions} savingsGoals={savingsGoals} setSavingsGoals={setSavingsGoals} budgetItems={budgetItems} setBudgetItems={setBudgetItems} config={config} apiKey={apiKey} />
            </TabPanel>
            <TabPanel idPrefix="budget" tab="goals" when={sub === 'goals'}>
                <Planning section="goals" transactions={transactions} savingsGoals={savingsGoals} setSavingsGoals={setSavingsGoals} budgetItems={budgetItems} setBudgetItems={setBudgetItems} config={config} apiKey={apiKey} actualsMap={monthActualsMap} />
            </TabPanel>
            <TabPanel idPrefix="budget" tab="sante" when={sub === 'sante'}>
                <HealthIndicator />
            </TabPanel>
        </div>
    );
};
