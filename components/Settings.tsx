// components/Settings.tsx
// G22-N4 — Refonte en sous-onglets thématiques. Settings est désormais un
// orchestrateur léger : il détient les données (pour construire le payload de
// backup) et délègue chaque thème à une section dédiée sous components/settings/sections/.
//
// Sous-onglets : Complétude | Comptes et soldes | Patrimoine | Clés API | Sauvegarde | Système et diagnostics
// (+ lien « Profil ↗ » hors tablist : c'est une autre page, pas un onglet).
// (« Hypothèses éco » du plan initial est sans objet ici : les hypothèses
// économiques vivent dans l'onglet Futur. « Patrimoine » accueille les panneaux
// W5.x qui n'avaient pas de section dédiée.)
//
// Deep-link cross-tab : si une bannière d'un autre onglet pointe vers un champ
// de Configuration (data-focus-section), on ouvre d'office le bon sous-onglet
// pour que usePendingFocus trouve l'élément et scrolle dessus.

import React, { useState } from 'react';
import { PageHeader } from './ui/PageHeader';
import type { IconName } from './ui/Icon';
import { SubTabs, TabPanel } from './ui/SubTabs';
import {
  AppState, BudgetCategory, Transaction, Asset, TravelGoal, Debt,
  InvestmentAccount, InvestmentTransaction, LifeEvent, RetirementGoal, FinancialGoal,
  RealEstateGoal, ChildGoal, Tab,
} from '../types';
import { useFinanceStore } from '../store/useFinanceStore';
import { SetupHub, useCompletudeOnglets } from './setup/SetupHub';
import { usePendingFocus } from '../utils/usePendingFocus';
import { TestModePanel } from './settings/TestModePanel';
import { startGuidedTour } from './tour/tourControl';
import { useViewportXl } from '../hooks/useViewportXl';
import { AccountsSection } from './settings/sections/AccountsSection';
import { PatrimoineSection } from './settings/sections/PatrimoineSection';
import { IntegrationsSection } from './settings/sections/IntegrationsSection';
import { FintableSyncCard } from './settings/FintableSyncCard';
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

type SubTab = 'completude' | 'accounts' | 'patrimoine' | 'integrations' | 'backup' | 'system';

const SUB_TABS: ReadonlyArray<{ id: SubTab; label: string; icon: IconName }> = [
  // [S5-REFONTE-REGLAGES] « Complétude » ouvre les Réglages ; le Profil a son propre onglet (lien sous
  // le menu) et le mode test sa carte à droite — l'ancien sous-onglet « Profil » n'avait plus que ça.
  { id: 'completude', label: 'Complétude', icon: 'check' },
  { id: 'accounts', label: 'Comptes et soldes', icon: 'bank' },
  { id: 'patrimoine', label: 'Patrimoine', icon: 'real-estate' },
  { id: 'integrations', label: 'Clés API', icon: 'link' },
  { id: 'backup', label: 'Sauvegarde', icon: 'cloud' },
  { id: 'system', label: 'Système et diagnostics', icon: 'group-tools' },
];

/** Mappe un data-focus-section (deep-link) vers le sous-onglet qui le contient. */
function subTabForSection(section: string | null | undefined): SubTab | null {
  if (!section) return null;
  if (section.startsWith('apiKeys-')) return 'integrations';
  // [FINTABLE-STALE-ALERT] La bannière « import figé » de l'Accueil pointe ici. Sans cette
  // entrée, le deep-link ouvrait Réglages sur le sous-onglet courant sans rien focaliser :
  // un bouton d'apparence fonctionnelle qui ne mène nulle part (panne silencieuse).
  if (section.startsWith('fintable-')) return 'integrations';
  if (section.startsWith('profile-')) return 'completude';
  return null;
}

export const Settings: React.FC<SettingsProps> = ({
  apiKeys,
  setApiKeys,
  config,
  setConfig: _setConfig,
  initialBalances,
  setInitialBalances,
  transactions,
  budgetItems,
  onImportData,
  assets,
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
  // `null` = accueil des Réglages : « Complétude » sur bureau, liste des sections sur mobile.
  const [sub, setSub] = useState<SubTab | null>(() => {
    if (pendingFocus && pendingFocus.tab === Tab.SETTINGS && Date.now() <= pendingFocus.expiresAt) {
      return subTabForSection(pendingFocus.section);
    }
    return null;
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
    // [PTF-L1A] Grand livre courtier et référentiel : lus au moment de l'EXPORT (aucun abonnement de
    // rendu pour deux tableaux que cet écran n'affiche pas). `undefined` reste `undefined` — JSON
    // l'omet — et jamais `[]` : un backup d'un appareil qui n'a jamais importé ne doit pas restaurer
    // un livre « importé et vide ».
    brokerLedger: useFinanceStore.getState().brokerLedger,
    instruments: useFinanceStore.getState().instruments,
    brokerAccountRegimes: useFinanceStore.getState().brokerAccountRegimes,
  });

  const { pct } = useCompletudeOnglets();
  const large = useViewportXl();
  const setActiveTab = useFinanceStore(s => s.setActiveTab);
  const aFaire = (id: SubTab) => id === 'integrations' && !apiKeys.anthropic;
  const onglets = SUB_TABS.map((t) => ({
    ...t,
    badge: t.id === 'completude' ? `${pct} %` : aFaire(t.id) ? <span className="text-warning-400">à faire</span> : undefined,
  }));

  // Contenu d'une section — partagé par les deux mises en page.
  const contenu = (id: SubTab): React.ReactNode => {
    switch (id) {
      case 'completude':
        // Hub de complétude PAR ONGLET : ce qui manque pour débloquer chaque page + remplir ici.
        return <SetupHub compact={!large} />;
      case 'accounts':
        return (
          <AccountsSection
            initialBalances={initialBalances}
            setInitialBalances={setInitialBalances}
            transactions={transactions}
            onImportData={onImportData}
            apiKey={apiKeys.anthropic}
          />
        );
      case 'patrimoine':
        return <PatrimoineSection />;
      case 'integrations':
        return (
          <div className="space-y-6">
            <IntegrationsSection apiKeys={apiKeys} setApiKeys={setApiKeys} />
            {/* [FINTABLE-7] Sync bancaire in-app : jeton + rôles de comptes, sans aucune config externe. */}
            <FintableSyncCard />
          </div>
        );
      case 'backup':
        return <BackupSection buildPayload={buildBackupPayload} />;
      case 'system':
        return <SystemView state={appState} />;
    }
  };

  const enTete = (
    <PageHeader
      title="Réglages"
      actions={
        <button type="button" onClick={startGuidedTour} className="h-10 px-4 rounded-lg border border-white/40 text-body text-ink-100 hover:bg-white/5 transition-colors focus-ring">
          Revoir le tutoriel
        </button>
      }
    />
  );

  // [S5-REFONTE-REGLAGES] Bureau large (≥ xl, maquette E-reglages) : menu à gauche (onglets verticaux),
  // section au centre, carte du mode test à droite.
  if (large) {
    const actif = sub ?? 'completude';
    return (
      <div className="space-y-6 stagger-in">
        {enTete}
        <div className="grid grid-cols-[240px_minmax(0,1fr)_380px] gap-5 items-start">
          <div className="min-w-0 flex flex-col gap-1">
            <SubTabs<SubTab>
              idPrefix="config"
              label="Sections des réglages"
              tabs={onglets}
              active={actif}
              onSelect={setSub}
              orientation="vertical"
            />
            {/* Hors tablist : le Profil est une autre page, pas un onglet de celle-ci. */}
            <button type="button" onClick={() => setActiveTab(Tab.PROFILE)} className="h-10 px-3 rounded-[10px] flex items-center justify-between gap-2 text-body text-ink-300 hover:bg-white/5 hover:text-ink-50 focus-ring">
              Profil <span aria-hidden="true">↗</span>
            </button>
          </div>
          <div className="min-w-0">
            {SUB_TABS.map(({ id }) => (
              <TabPanel key={id} idPrefix="config" tab={id} when={actif === id}>{contenu(id)}</TabPanel>
            ))}
          </div>
          {/* Mode test (dev) — charger un persona réaliste ; vraies données sauvegardées/restaurées. */}
          <div className="min-w-0">
            <TestModePanel />
          </div>
        </div>
      </div>
    );
  }

  // Mobile et bureau étroit (maquette M-reglages) : carte du mode test, liste des sections (on touche
  // pour ouvrir), puis la complétude. Une section ouverte remplace la liste, avec un retour.
  const ouverte = sub && sub !== 'completude' ? SUB_TABS.find((t) => t.id === sub) : undefined;
  if (ouverte) {
    return (
      <div className="space-y-6 stagger-in">
        {enTete}
        <section aria-labelledby="reglages-section-titre" className="space-y-4">
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => { setSub(null); requestAnimationFrame(() => document.getElementById(`reglages-ligne-${ouverte.id}`)?.focus()); }}
              className="self-start min-h-11 text-meta text-ink-400 hover:text-ink-100 focus-ring rounded-sm"
            >
              ‹ Toutes les sections
            </button>
            <h2 id="reglages-section-titre" tabIndex={-1} className="text-[20px] font-semibold text-ink-50 focus:outline-hidden">{ouverte.label}</h2>
          </div>
          {contenu(ouverte.id)}
        </section>
      </div>
    );
  }

  const ouvrir = (id: SubTab) => {
    setSub(id);
    requestAnimationFrame(() => document.getElementById('reglages-section-titre')?.focus());
  };
  const ligne = 'w-full h-[52px] px-4 flex items-center justify-between gap-3 text-left text-body text-ink-100 focus-ring';
  return (
    <div className="space-y-4 stagger-in">
      {enTete}
      <TestModePanel compact />
      <nav aria-label="Sections des réglages" className="rounded-2xl bg-surface border border-white/6 overflow-hidden">
        <button type="button" onClick={() => setActiveTab(Tab.PROFILE)} className={ligne}>
          Profil <span className="text-ink-400" aria-hidden="true">›</span>
        </button>
        {SUB_TABS.filter((t) => t.id !== 'completude').map((t) => (
          <button key={t.id} id={`reglages-ligne-${t.id}`} type="button" onClick={() => ouvrir(t.id)} className={`${ligne} border-t border-white/5`}>
            {t.label}
            <span className="flex items-center gap-3">
              {aFaire(t.id) && <span className="text-meta text-warning-400">à faire</span>}
              <span className="text-ink-400" aria-hidden="true">›</span>
            </span>
          </button>
        ))}
      </nav>
      {contenu('completude')}
    </div>
  );
};
