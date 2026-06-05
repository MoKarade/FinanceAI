
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Tab, FinancialGoal, User } from '../types';
import { CoupleModeBadge } from './ui/CoupleModeBadge';
import { NextBestAction } from './sidebar/NextBestAction';
import { useFinanceStore } from '../store/useFinanceStore';
import { BackupReminder } from './BackupReminder';
import { getPersonaById, getPersonaOrDefault, TEST_PERSONAS } from '../services/testFixtures';

interface LayoutProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  children: React.ReactNode;
  lastUpdate: number;
  isLoading: boolean;
  isPrivacyMode: boolean;
  togglePrivacyMode: () => void;
  netWorth: number;
  monthlySavings?: number;
  financialGoals?: FinancialGoal[];
  currentValues?: { celi: number, reer: number, liquidity: number };
  onOpenGuide?: () => void;
  onGeneratePDF?: () => void;
}

export const Layout: React.FC<LayoutProps> = ({
  activeTab,
  setActiveTab,
  children,
  lastUpdate: _lastUpdate,
  isLoading: _isLoading,
  isPrivacyMode,
  togglePrivacyMode,
  netWorth: _netWorth,
  monthlySavings: _monthlySavings = 0,
  financialGoals: _financialGoals = [],
  currentValues: _currentValues = { celi: 0, reer: 0, liquidity: 0 },
  onOpenGuide: _onOpenGuide,
  onGeneratePDF: _onGeneratePDF
}) => {
  const { t } = useTranslation();
  const [showMobileDrawer, setShowMobileDrawer] = React.useState(false);

  // Phase B.1 — sidebar cachée par défaut, expansion au survol + focus clavier.
  const [sidebarHovered, setSidebarHovered] = React.useState(false);
  const [sidebarFocused, setSidebarFocused] = React.useState(false);
  const isSidebarOpen = sidebarHovered || sidebarFocused;

  // Phase B.2 — accordion : chaque groupe peut être déplié/replié au clic.
  // Par défaut tous ouverts pour ne pas surprendre l'utilisateur ; il choisit
  // ensuite de masquer les sections qu'il n'utilise pas.
  const [openGroups, setOpenGroups] = React.useState<Set<string>>(
    () => new Set(['Argent', 'Plan', 'Objectifs', 'Outils']),
  );
  const toggleGroup = React.useCallback((label: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  // Phase B1 — Regroupement thématique (cf docs/UI_REFOUNDATION_PLAN.md §3.1)
  const navGroups: Array<{ label: string; icon: string; items: Array<{ id: Tab; label: string; icon: string }> }> = [
    {
      label: 'Argent',
      icon: '💰',
      items: [
        { id: Tab.DASHBOARD, label: t('tabs.dashboard'), icon: '📊' },
        { id: Tab.TRANSACTIONS, label: t('tabs.transactions'), icon: '💳' },
        { id: Tab.BUDGET, label: t('tabs.budget'), icon: '⚖️' },
      ],
    },
    {
      label: 'Plan',
      icon: '🎯',
      items: [
        { id: Tab.FUTURE, label: t('tabs.future'), icon: '🔮' },
        { id: Tab.INVESTMENTS, label: t('tabs.investments'), icon: '📈' },
        { id: Tab.RETIREMENT, label: t('tabs.retirement'), icon: '🏖️' },
      ],
    },
    {
      label: 'Objectifs',
      icon: '🎁',
      items: [
        { id: Tab.REAL_ESTATE, label: t('tabs.real_estate'), icon: '🏡' },
        { id: Tab.CHILD, label: t('tabs.child'), icon: '👶' },
        // Phase F.12 — fusion Voyages + Parcours de vie → "Projets de vie" (doc directives §8)
        { id: Tab.LIFE_PROJECTS, label: 'Projets de vie', icon: '🛤️' },
      ],
    },
    {
      label: 'Outils',
      icon: '🛠️',
      items: [
        { id: Tab.TAX, label: t('tabs.tax'), icon: '🏛️' },
        { id: Tab.DEBT, label: t('tabs.debt'), icon: '💸' },
      ],
    },
  ];

  // Items utilisés par les menus mobile/legacy. Garde une liste plate.
  const navItems = navGroups[0].items; // shortcut Argent pour bottom-nav
  const extraItems = navGroups.slice(1).flatMap(g => g.items);

  // Phase B.3 — `getSmartMilestone` (palier statique) retiré. Remplacé par le
  // widget NextBestAction qui appelle Claude (Haiku) avec lastProjection.

  // Mode test : banner permanent en haut + classe globale.
  const isTestMode = useFinanceStore(s => s.isTestMode);
  const activeTestPersonaId = useFinanceStore(s => s.activeTestPersonaId);
  const activeTestPersona = getPersonaById(activeTestPersonaId);
  const enableTestMode = useFinanceStore(s => s.enableTestMode);

  // G22-B2 — bascule directe Couple ⇄ Individuel depuis la sidebar. Ajoute/retire
  // le 2e utilisateur dans `config.users` ; tout l'app lit `config.users.length`
  // (réactif via le store) donc la bascule se propage partout (Dashboard, Budget,
  // Futur, Impôts…). Détails du conjoint éditables ensuite dans Configuration.
  const coupleConfig = useFinanceStore(s => s.config);
  const setAppState = useFinanceStore(s => s.setAppState);
  // Même définition que CoupleModeBadge : couple = 2e utilisateur avec un nom.
  const isCouple = Boolean(coupleConfig?.users?.[1]?.name && coupleConfig.users[1].name.trim() !== '');
  const toggleCoupleMode = () => {
    if (!coupleConfig) return;
    const users: User[] = coupleConfig.users as User[];
    let nextUsers: User[];
    if (isCouple) {
      nextUsers = [users[0]]; // repasse en individuel : on retire le conjoint
    } else if (users.length >= 2) {
      nextUsers = [users[0], { ...users[1], name: users[1]?.name || 'Conjoint(e)' }]; // 2e user existant sans nom → on le nomme
    } else {
      nextUsers = [...users, { name: 'Conjoint(e)', age: 30, grossSalary: 0, netSalary: 0, canadaArrivalYear: new Date().getFullYear() - 5, color: '#ec4899' }];
    }
    setAppState({ config: { ...coupleConfig, users: nextUsers as [User, User] } });
  };

  return (
    <div className={`min-h-screen flex flex-col md:flex-row text-ink-100 font-sans ${isPrivacyMode ? 'privacy-active' : ''} ${isTestMode ? 'test-mode-active' : ''}`}>
      {/* A11y (Audit Phase 5.1): skip link — invisible jusqu'à focus clavier. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:px-4 focus:py-2 focus:rounded-card focus:bg-primary focus:text-white focus:font-bold focus:shadow-xl"
      >
        Aller au contenu principal
      </a>

      {/* Banner Mode Test — toujours visible quand isTestMode=true. */}
      {isTestMode && (
        <div
          role="status"
          aria-label="Mode test activé"
          className="fixed top-0 left-0 right-0 z-[150] bg-gradient-to-r from-warning-600 via-orange-600 to-warning-600 text-white text-center py-2 px-4 font-bold text-body shadow-lg flex items-center justify-center gap-3"
        >
          <span aria-hidden="true">🧪</span>
          <span className="font-bold">MODE TEST</span>
          {/* Sélecteur de persona directement dans la bannière : changer
              d'utilisateur sans passer par Réglages (demandé par Marc). */}
          <select
            aria-label="Changer de persona de test"
            value={activeTestPersona?.id ?? TEST_PERSONAS[0].id}
            onChange={(e) => {
              const persona = getPersonaOrDefault(e.target.value);
              enableTestMode(persona.build(), persona.id);
            }}
            className="bg-amber-900/70 text-white text-meta rounded px-2 py-1 border border-white/40 font-normal cursor-pointer max-w-[55vw] truncate focus:outline-none focus:ring-2 focus:ring-white/60"
          >
            {TEST_PERSONAS.map((p) => (
              <option key={p.id} value={p.id} className="bg-gray-900 text-white">
                {p.emoji} {p.label}
              </option>
            ))}
          </select>
          <span className="hidden md:inline font-normal text-meta opacity-90">— données fictives, vraies données sauvegardées</span>
          <span aria-hidden="true">🧪</span>
        </div>
      )}
      <style>{`
        .privacy-active .privacy-blur {
            filter: blur(8px) !important;
            opacity: 0.5 !important;
            transition: all 0.3s ease;
            user-select: none !important;
        }
        .privacy-active .privacy-blur:hover { filter: blur(0px) !important; opacity: 1 !important; }
        .privacy-active table td:nth-child(n+2):not(:last-child) {
            filter: blur(5px) !important;
            opacity: 0.6 !important;
        }
        .privacy-active .recharts-cartesian-axis-tick-value tspan,
        .privacy-active .recharts-tooltip-item-value,
        .privacy-active .recharts-tooltip-label,
        .privacy-active .recharts-legend-item-text {
            filter: blur(6px) !important;
            opacity: 0.3 !important;
            color: transparent !important;
        }
        .privacy-active input[type="number"],
        .privacy-active input[type="range"] + span,
        .privacy-active .font-mono {
            filter: blur(6px) !important;
            opacity: 0.6 !important;
        }
      `}</style>

      {/* Phase B.1 — sidebar fixe-positionnée, collapsed-by-default (w-16),
          expand au survol/focus (w-72). Le main a `md:ml-16` pour préserver la
          place du rail collapsé ; l'expansion overlay le contenu (pas de shift). */}
      <aside
        className={`hidden md:flex fixed top-0 left-0 bottom-0 z-40 flex-col bg-dark border-r border-white/10 overflow-hidden shadow-2xl transition-[width] duration-200 motion-reduce:transition-none ${
          isSidebarOpen ? 'w-72' : 'w-16'
        }`}
        onMouseEnter={() => setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
        onFocus={() => setSidebarFocused(true)}
        onBlur={(e) => {
          // Ne déclenche le collapse que si le focus quitte tout l'aside.
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setSidebarFocused(false);
        }}
        aria-expanded={isSidebarOpen}
      >
        {/* Brand + privacy toggle */}
        <div className="p-3 pb-2 shrink-0 space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-emerald-300 flex items-center justify-center text-white text-xl shadow-[0_0_20px_rgba(16,185,129,0.3)] shrink-0" aria-hidden="true">
              Fi
            </div>
            <div className={`min-w-0 whitespace-nowrap transition-opacity duration-150 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
              <p className="text-lg font-bold text-white tracking-tight">FinanceAI</p>
              <div className="text-tiny text-ink-500 font-mono" title={`Build ${__BUILD_DATE__}`}>
                v{__APP_VERSION__} • {__GIT_SHA__}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={togglePrivacyMode}
            aria-label={isPrivacyMode ? 'Quitter le mode discret' : 'Activer le mode discret'}
            aria-pressed={isPrivacyMode}
            title="Mode Discret"
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors ${
              isPrivacyMode ? 'bg-white/10 text-white' : 'text-ink-500 hover:bg-white/5 hover:text-white'
            }`}
          >
            <span aria-hidden="true" className="text-base shrink-0">{isPrivacyMode ? '🙈' : '👁️'}</span>
            <span className={`text-meta whitespace-nowrap transition-opacity duration-150 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
              {isPrivacyMode ? 'Quitter discret' : 'Mode discret'}
            </span>
          </button>
        </div>

        {/* Phase B.3 — NextBestAction remplace l'ancien widget milestone. */}
        <NextBestAction isSidebarOpen={isSidebarOpen} />

        {/* Navigation principale — accordion par groupe */}
        <nav aria-label="Navigation principale" className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {navGroups.map((group) => {
            const isGroupExpanded = openGroups.has(group.label);
            // Quand la sidebar est collapsée, on montre toujours les items
            // (icônes seules — labels masqués par opacity). Quand elle est
            // ouverte, on respecte l'état accordion.
            const showItems = !isSidebarOpen || isGroupExpanded;

            return (
              <div key={group.label} className="mb-1">
                <button
                  type="button"
                  onClick={() => isSidebarOpen && toggleGroup(group.label)}
                  aria-expanded={isSidebarOpen ? isGroupExpanded : undefined}
                  disabled={!isSidebarOpen}
                  title={!isSidebarOpen ? group.label : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-card transition-colors ${
                    isSidebarOpen ? 'hover:bg-white/5 cursor-pointer' : 'cursor-default'
                  }`}
                >
                  <span className="text-base shrink-0" aria-hidden="true">{group.icon}</span>
                  <span className={`text-tiny uppercase font-bold text-ink-500 tracking-widest whitespace-nowrap flex-1 text-left transition-opacity duration-150 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
                    {group.label}
                  </span>
                  <span
                    className={`shrink-0 text-ink-500 text-meta transition-all duration-150 ${
                      isSidebarOpen ? 'opacity-100' : 'opacity-0'
                    } ${isGroupExpanded ? 'rotate-90' : ''}`}
                    aria-hidden="true"
                  >
                    ›
                  </span>
                </button>
                <div className={`overflow-hidden transition-[max-height] duration-200 motion-reduce:transition-none ${showItems ? 'max-h-[600px]' : 'max-h-0'}`}>
                  <div className="space-y-0.5 pt-0.5">
                    {group.items.map((item) => {
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          data-tour-id={`nav-${item.id}`}
                          onClick={() => setActiveTab(item.id)}
                          aria-current={isActive ? 'page' : undefined}
                          title={!isSidebarOpen ? item.label : undefined}
                          className={`flex items-center gap-3 w-full px-3 py-2 rounded-card transition-colors duration-150 relative focus-ring ${
                            isActive ? 'bg-white/5 text-ink-50' : 'hover:bg-white/5 text-ink-300 hover:text-ink-50'
                          }`}
                        >
                          {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-primary rounded-r" aria-hidden="true"></span>}
                          <span aria-hidden="true" className={`text-base shrink-0 ${isActive ? 'text-primary' : ''}`}>{item.icon}</span>
                          <span className={`font-medium text-meta whitespace-nowrap transition-opacity duration-150 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer : système + badge couple */}
        <div className="p-2 border-t border-white/5 bg-[#0F1116] shrink-0 space-y-2">
          {/* U7 — disposition constante (icônes alignées à gauche, px-3) pour que
              rien ne bouge entre l'état replié et déplié ; seuls les labels
              apparaissent en fondu (opacity). Plus de bascule grid↔flex. */}
          <nav aria-label="Outils système" className="flex flex-col gap-0.5">
            {[
              // G22-N5 — Système fusionné dans Configuration (sous-onglet « Système & diagnostics »).
              { id: Tab.SETTINGS, icon: '⚙️', label: 'Configuration' },
            ].map(item => (
              <button
                key={item.id}
                type="button"
                data-tour-id={`nav-${item.id}`}
                onClick={() => setActiveTab(item.id)}
                aria-current={activeTab === item.id ? 'page' : undefined}
                title={!isSidebarOpen ? item.label : undefined}
                className={`flex flex-row items-center gap-3 px-3 py-2 rounded-card text-tiny font-medium transition-colors focus-ring ${
                  activeTab === item.id ? 'bg-white/10 text-ink-50' : 'text-ink-400 hover:bg-white/5 hover:text-ink-100'
                }`}
              >
                <span className="text-base shrink-0" aria-hidden="true">{item.icon}</span>
                <span className={`whitespace-nowrap transition-opacity duration-150 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
                  {item.label}
                </span>
              </button>
            ))}
          </nav>
          {/* G22-B2 — clic = BASCULE directe Couple ⇄ Individuel (ajoute/retire le
              conjoint), propagée à toute l'app. Détails du conjoint dans Configuration. */}
          <button
            type="button"
            onClick={toggleCoupleMode}
            aria-pressed={isCouple}
            title={isCouple ? 'Mode Couple actif — cliquer pour repasser en Individuel' : 'Mode Individuel — cliquer pour passer en Couple'}
            className="flex justify-center w-full hover:opacity-80 transition-opacity focus-ring rounded-full"
          >
            <CoupleModeBadge compact={!isSidebarOpen} />
          </button>
        </div>
      </aside>

      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-dark/95 backdrop-blur-xl border-b border-white/10 z-50 flex items-center justify-between px-4 shadow-xl">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-success-400 flex items-center justify-center text-white font-bold shadow-lg shadow-primary/20" aria-hidden="true">Fi</div>
          <p className="text-lg font-bold text-white tracking-tight">FinanceAI</p>
        </div>
        {/* Phase B.4 — info ℹ️ et Synchroniser 🔄 retirées sur mobile aussi. */}
        <div className="flex items-center gap-3">
          <button
            onClick={togglePrivacyMode}
            aria-label={isPrivacyMode ? 'Quitter le mode discret' : 'Activer le mode discret'}
            aria-pressed={isPrivacyMode}
            className="w-11 h-11 rounded-full bg-white/5 flex items-center justify-center text-lg active:scale-90 transition-transform focus-ring"
          >
            {isPrivacyMode ? '🙈' : '👁️'}
          </button>
        </div>
      </div>

      {/* Phase B.1 — md:ml-16 réserve la largeur du rail collapsé. L'expansion
          de la sidebar (w-72) overlay le contenu sans push (pas de jump). */}
      <main id="main" tabIndex={-1} className="flex-1 p-3 md:p-10 md:ml-16 mt-16 md:mt-0 overflow-y-auto min-h-[100dvh] pb-24 md:pb-10 relative z-0 scroll-smooth focus:outline-none">
        <div className="max-w-7xl mx-auto space-y-6 md:space-y-8 animate-premium-in">
          <BackupReminder onNavigateToSettings={() => setActiveTab(Tab.SETTINGS)} />
          {children}
        </div>
      </main>

      {/* Phase D1 — Bottom nav avec text-tiny (cohérent avec scale typo) + targets touch 48px+ */}
      <nav aria-label="Navigation mobile" className="md:hidden fixed bottom-0 left-0 right-0 h-[72px] bg-[#12141a]/100 backdrop-blur-2xl border-t border-white/10 z-[100] flex items-center justify-around px-1 pb-safe shadow-[0_-5px_20px_rgba(0,0,0,0.5)]">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            data-tour-id={`nav-${item.id}`}
            onClick={() => { setActiveTab(item.id as Tab); setShowMobileDrawer(false); }}
            aria-current={activeTab === item.id ? 'page' : undefined}
            className={`relative flex flex-col items-center justify-center min-w-[56px] h-full transition-all duration-200 active:scale-95 group focus-ring rounded-card`}
          >
            <div aria-hidden="true" className={`text-2xl mb-1 transition-transform duration-300 ${activeTab === item.id ? 'scale-110 -translate-y-0.5 text-ink-50 drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]' : 'text-ink-400 group-hover:text-ink-200'}`}>{item.icon}</div>
            <span className={`text-tiny font-medium transition-colors ${activeTab === item.id ? 'text-primary' : 'text-ink-400'}`}>{item.label}</span>
            {activeTab === item.id && <span aria-hidden="true" className="absolute top-1.5 w-1 h-1 bg-primary rounded-full shadow-[0_0_5px_#10b981]"></span>}
          </button>
        ))}
        <button
          onClick={() => setShowMobileDrawer(v => !v)}
          aria-label="Plus d'options"
          aria-expanded={showMobileDrawer}
          className={`relative flex flex-col items-center justify-center min-w-[56px] h-full transition-all duration-200 active:scale-95 focus-ring rounded-card ${showMobileDrawer || extraItems.some(e => e.id === activeTab) || activeTab === Tab.SETTINGS ? 'text-primary' : 'text-ink-400'}`}
        >
          <div aria-hidden="true" className={`text-2xl mb-1 transition-transform ${showMobileDrawer ? 'rotate-90' : ''}`}>⋯</div>
          <span className="text-tiny font-medium">Plus</span>
          {(extraItems.some(e => e.id === activeTab) || activeTab === Tab.SETTINGS) && <span aria-hidden="true" className="absolute top-1.5 w-1 h-1 bg-primary rounded-full"></span>}
        </button>
      </nav>

      {showMobileDrawer && (
        <div className="md:hidden fixed inset-0 z-40" onClick={() => setShowMobileDrawer(false)}>
          <div className="absolute bottom-[72px] left-0 right-0 bg-[#0F1116]/98 backdrop-blur-xl border-t border-white/10 p-4 shadow-2xl animate-slide-up max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Phase D1 — Drawer mobile aligné sur les groupes desktop (cohérent avec B1) */}
            {navGroups.slice(1).map((group) => (
              <div key={group.label} className="mb-4 last:mb-0">
                <div className="text-tiny uppercase text-ink-400 font-bold tracking-widest mb-2 flex items-center gap-2">
                  <span aria-hidden="true">{group.icon}</span>
                  <span>{group.label}</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {group.items.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => { setActiveTab(item.id); setShowMobileDrawer(false); }}
                      aria-current={activeTab === item.id ? 'page' : undefined}
                      className={`flex flex-col items-center justify-center p-3 rounded-card transition-all active:scale-95 border focus-ring min-h-[72px] ${activeTab === item.id
                        ? 'bg-white/10 border-white/20 text-ink-50'
                        : 'bg-white/5 border-white/5 text-ink-300 hover:text-ink-50 hover:bg-white/10'
                        }`}
                    >
                      <span aria-hidden="true" className="text-xl mb-1">{item.icon}</span>
                      <span className="text-tiny font-medium text-center leading-tight">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div className="text-tiny uppercase text-ink-400 font-bold tracking-widest mb-2 flex items-center gap-2">
              <span aria-hidden="true">⚙️</span><span>Configuration</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {/* G22-N5 — Système fusionné dans Configuration (sous-onglet interne). */}
              {[{ id: Tab.SETTINGS, icon: '⚙️', label: 'Configuration' }].map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { setActiveTab(item.id); setShowMobileDrawer(false); }}
                  aria-current={activeTab === item.id ? 'page' : undefined}
                  className={`flex flex-col items-center justify-center p-3 rounded-card border transition-all active:scale-95 focus-ring min-h-[64px] ${activeTab === item.id
                    ? 'bg-white/10 border-white/20 text-ink-50'
                    : 'bg-white/5 border-white/5 text-ink-300 hover:text-ink-50'
                    }`}
                >
                  <span aria-hidden="true" className="text-xl mb-1">{item.icon}</span>
                  <span className="text-tiny font-medium">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
