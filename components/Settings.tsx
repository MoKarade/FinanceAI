// components/Settings.tsx
// G22-N4 — Refonte en sous-onglets thématiques. Settings est désormais un
// orchestrateur léger : il détient les données (pour construire le payload de
// backup) et délègue chaque thème à une section dédiée sous components/settings/sections/.
//
// Sous-onglets : Profil | Comptes & soldes | Patrimoine | Clés API | Sauvegarde.
// (« Hypothèses éco » du plan initial est sans objet ici : les hypothèses
// économiques vivent dans l'onglet Futur. « Patrimoine » accueille les panneaux
// W5.x qui n'avaient pas de section dédiée.)
//
// Deep-link cross-tab : si une bannière d'un autre onglet pointe vers un champ
// de Configuration (data-focus-section), on ouvre d'office le bon sous-onglet
// pour que usePendingFocus trouve l'élément et scrolle dessus.

import React, { useState } from 'react';
import { PageHeader } from './ui/PageHeader';
import { Icon, type IconName } from './ui/Icon';
import { SubTabs, TabPanel } from './ui/SubTabs';
import {
  AppState, BudgetCategory, Transaction, Asset, SavingsGoal, TravelGoal, Debt,
  InvestmentAccount, InvestmentTransaction, LifeEvent, RetirementGoal, FinancialGoal,
  RealEstateGoal, ChildGoal, Tab,
} from '../types';
import { useFinanceStore } from '../store/useFinanceStore';
import { SetupHub } from './setup/SetupHub';
import { usePendingFocus } from '../utils/usePendingFocus';
import { ProfileSection } from './settings/sections/ProfileSection';
import { AccountsSection } from './settings/sections/AccountsSection';
import { PatrimoineSection } from './settings/sections/PatrimoineSection';
import { IntegrationsSection } from './settings/sections/IntegrationsSection';
import { FintableSyncCard } from './settings/FintableSyncCard';
import { AnalyticsConsentCard } from './settings/sections/AnalyticsConsentCard';
import { BackupSection } from './settings/sections/BackupSection';
// G22-N5 — Système fusionné dans Config (6e sous-onglet « Système & diagnostics »).
import { SystemView } from './SystemView';

interface SettingsProps {
  apiKeys: AppState['apiKeys'];
  setApiKeys: (keys: AppState['apiKeys']) => void;
  config: AppState['config'];
  setConfig: (c: AppState['config']) => void;
  budgetItems: BudgetCategory[];
  onImportData: (data: string) => void;
  initialBalances: Record<string, number>;
  setInitialBalances: (balances: Record<string, number>) => void;
  transactions: Transaction[];
  setTransactions?: (t: Transaction[]) => void;
  assets: Asset[];
  savingsGoals: SavingsGoal[];
  travelGoals: TravelGoal[];
  debts?: Debt[];
  investmentAccounts?: InvestmentAccount[];
  investmentTransactions?: InvestmentTransaction[];
  lifeEvents?: LifeEvent[];
  retirementGoal?: RetirementGoal;
  realEstateGoals?: RealEstateGoal[];
  setRealEstateGoals?: (g: RealEstateGoal[]) => void;
  childGoal?: ChildGoal;
  childGoals?: ChildGoal[];
  financialGoals?: FinancialGoal[];
  // G22-N5 — état complet, forwardé à SystemView (sous-onglet diagnostics).
  appState: AppState;
}

type SubTab = 'profile' | 'accounts' | 'patrimoine' | 'integrations' | 'backup' | 'system';

const SUB_TABS: ReadonlyArray<{ id: SubTab; label: string; icon: IconName }> = [
  { id: 'profile', label: 'Profil', icon: 'users' },
  { id: 'accounts', label: 'Comptes & soldes', icon: 'bank' },
  { id: 'patrimoine', label: 'Patrimoine', icon: 'real-estate' },
  { id: 'integrations', label: 'Clés API', icon: 'link' },
  { id: 'backup', label: 'Sauvegarde', icon: 'cloud' },
  { id: 'system', label: 'Système & diagnostics', icon: 'group-tools' },
];

/** Mappe un data-focus-section (deep-link) vers le sous-onglet qui le contient. */
function subTabForSection(section: string | null | undefined): SubTab | null {
  if (!section) return null;
  if (section.startsWith('apiKeys-')) return 'integrations';
  // [FINTABLE-STALE-ALERT] La bannière « import figé » de l'Accueil pointe ici. Sans cette
  // entrée, le deep-link ouvrait Réglages sur le sous-onglet courant sans rien focaliser :
  // un bouton d'apparence fonctionnelle qui ne mène nulle part (panne silencieuse).
  if (section.startsWith('fintable-')) return 'integrations';
  if (section.startsWith('profile-')) return 'profile';
  return null;
}

export const Settings: React.FC<SettingsProps> = ({
  apiKeys,
  setApiKeys,
  config,
  setConfig,
  initialBalances,
  setInitialBalances,
  transactions,
  budgetItems,
  onImportData,
  assets,
  savingsGoals,
  travelGoals,
  debts = [],
  investmentAccounts = [],
  investmentTransactions = [],
  lifeEvents = [],
  retirementGoal,
  realEstateGoals = [],
  childGoal,
  childGoals = [],
  financialGoals = [],
  appState,
}) => {
  // Containers étendus (W5.x) — lus ici pour le payload de backup ; la section
  // Patrimoine les lit/écrit de son côté (même store, pas de duplication d'état).
  const insurancePolicies = useFinanceStore(s => s.insurancePolicies ?? []);
  const rentalProperties = useFinanceStore(s => s.rentalProperties ?? []);
  const privateBusinesses = useFinanceStore(s => s.privateBusinesses ?? []);
  const vehicleReplacements = useFinanceStore(s => s.vehicleReplacements ?? []);
  const majorRenovations = useFinanceStore(s => s.majorRenovations ?? []);
  const charitableGoals = useFinanceStore(s => s.charitableGoals ?? []);
  const pendingFocus = useFinanceStore(s => s.pendingFocus);

  // Deep-link : on démarre sur le sous-onglet ciblé pour que le champ soit
  // monté quand usePendingFocus tente le scroll.
  const [sub, setSub] = useState<SubTab>(() => {
    if (pendingFocus && pendingFocus.tab === Tab.SETTINGS && Date.now() <= pendingFocus.expiresAt) {
      return subTabForSection(pendingFocus.section) ?? 'profile';
    }
    return 'profile';
  });

  // Consomme pendingFocus + scroll vers le champ (one-shot).
  usePendingFocus(Tab.SETTINGS);

  // C5 fix (Sprint 1) — Sécurité : apiKeys NE SONT PLUS incluses par défaut dans
  // le backup. buildPayload({ includeApiKeys: true }) pour les inclure explicitement.
  const buildBackupPayload = (opts: { includeApiKeys?: boolean } = {}) => ({
    version: '3.2',
    timestamp: Date.now(),
    ...(opts.includeApiKeys ? { apiKeys } : {}),
    config,
    budgetItems,
    assets,
    initialBalances,
    savingsGoals,
    travelGoals,
    debts,
    investmentAccounts,
    investmentTransactions,
    lifeEvents,
    retirementGoal,
    realEstateGoals,
    childGoal,
    childGoals,
    financialGoals,
    transactions,
    insurancePolicies,
    rentalProperties,
    privateBusinesses,
    vehicleReplacements,
    majorRenovations,
    charitableGoals,
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6 stagger-in">
      <PageHeader
        icon={<Icon name="settings" size={28} />}
        title="Configuration"
      />

      {/* Hub de complétude PAR ONGLET : ce qui manque pour débloquer chaque page + remplir ici. */}
      <SetupHub />

      {/* Navigation sous-onglets thématiques */}
      <SubTabs<SubTab>
        idPrefix="config"
        label="Sections Configuration"
        tabs={SUB_TABS}
        active={sub}
        onSelect={setSub}
      />

      <TabPanel idPrefix="config" tab="profile" when={sub === 'profile'}>
        <ProfileSection config={config} setConfig={setConfig} />
      </TabPanel>
      <TabPanel idPrefix="config" tab="accounts" when={sub === 'accounts'}>
        <AccountsSection
          initialBalances={initialBalances}
          setInitialBalances={setInitialBalances}
          transactions={transactions}
          onImportData={onImportData}
          apiKey={apiKeys.anthropic}
        />
      </TabPanel>
      <TabPanel idPrefix="config" tab="patrimoine" when={sub === 'patrimoine'}><PatrimoineSection /></TabPanel>
      <TabPanel idPrefix="config" tab="integrations" when={sub === 'integrations'}>
        <div className="space-y-6">
          <IntegrationsSection apiKeys={apiKeys} setApiKeys={setApiKeys} />
          {/* [FINTABLE-7] Sync bancaire in-app : jeton + rôles de comptes, sans aucune config externe. */}
          <FintableSyncCard />
          <AnalyticsConsentCard />
        </div>
      </TabPanel>
      <TabPanel idPrefix="config" tab="backup" when={sub === 'backup'}><BackupSection buildPayload={buildBackupPayload} /></TabPanel>
      <TabPanel idPrefix="config" tab="system" when={sub === 'system'}><SystemView state={appState} /></TabPanel>
    </div>
  );
};
