
import React from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { Tab, FinancialGoal } from '../types';

interface LayoutProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  children: React.ReactNode;
  lastUpdate: number;
  onRefresh: () => void;
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
  lastUpdate,
  onRefresh,
  isLoading,
  isPrivacyMode,
  togglePrivacyMode,
  netWorth,
  monthlySavings = 0,
  financialGoals = [],
  currentValues = { celi: 0, reer: 0, liquidity: 0 },
  onOpenGuide,
  onGeneratePDF
}) => {
  const { t } = useTranslation();
  const [showMobileDrawer, setShowMobileDrawer] = React.useState(false);
  const currentLang = i18n.language?.startsWith('en') ? 'en' : 'fr';
  const toggleLang = () => i18n.changeLanguage(currentLang === 'fr' ? 'en' : 'fr');

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
        { id: Tab.TRAVEL, label: t('tabs.travel', 'Voyages'), icon: '✈️' },
        { id: Tab.LIFE_EVENTS, label: t('tabs.life_events'), icon: '🛤️' },
      ],
    },
    {
      label: 'Outils',
      icon: '🛠️',
      items: [
        { id: Tab.TAX, label: t('tabs.tax'), icon: '🏛️' },
        { id: Tab.DEBT, label: t('tabs.debt'), icon: '💸' },
        { id: Tab.PLANNING, label: t('tabs.planning'), icon: '📅' },
      ],
    },
  ];

  // Items utilisés par les menus mobile/legacy. Garde une liste plate.
  const allNavItems = navGroups.flatMap(g => g.items);
  const navItems = navGroups[0].items; // shortcut Argent pour bottom-nav
  const extraItems = navGroups.slice(1).flatMap(g => g.items);

  const getSmartMilestone = () => {
    const activeGoals = financialGoals
      .filter(g => !g.completed)
      .map(g => {
        let current = g.manualCurrentAmount || 0;
        if (g.type === 'NET_WORTH') current = netWorth;
        else if (g.type === 'CELI') current = currentValues.celi;
        else if (g.type === 'REER') current = currentValues.reer;
        else if (g.type === 'LIQUIDITY') current = currentValues.liquidity;

        if (current >= g.targetAmount) return null;

        return {
          ...g,
          current,
          percent: (current / g.targetAmount) * 100,
          remaining: g.targetAmount - current,
          isUserDefined: true
        };
      })
      .filter((g): g is NonNullable<typeof g> => g !== null)
      .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());

    if (activeGoals.length > 0) {
      const next = activeGoals[0];
      return { target: next.targetAmount, current: next.current, label: next.name, percent: next.percent, remaining: next.remaining };
    }

    const getNextStep = (current: number) => {
      if (current < 10000) return 10000;
      if (current < 50000) return 50000;
      if (current < 100000) return 100000;
      if (current < 250000) return 250000;
      if (current < 500000) return 500000;
      if (current < 1000000) return 1000000;
      return Math.ceil((current + 1) / 100000) * 100000;
    };

    const stepTarget = getNextStep(netWorth);
    return { target: stepTarget, current: netWorth, label: "Prochain Palier", percent: Math.min(100, Math.max(0, (netWorth / stepTarget) * 100)), remaining: stepTarget - netWorth };
  };

  const milestone = getSmartMilestone();

  let milestoneDateStr = "N/A";
  if (monthlySavings > 0 && milestone.remaining > 0) {
    const monthsToGo = milestone.remaining / monthlySavings;
    const targetDate = new Date();
    targetDate.setMonth(targetDate.getMonth() + Math.ceil(monthsToGo));
    milestoneDateStr = targetDate.toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' });
  } else if (milestone.remaining <= 0) {
    milestoneDateStr = "Atteint !";
  }

  return (
    <div className={`min-h-screen flex flex-col md:flex-row text-gray-200 font-sans ${isPrivacyMode ? 'privacy-active' : ''}`}>
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

      <aside className="hidden md:flex w-72 min-w-[18rem] bg-[#0B0E14] border-r border-white/10 flex-col z-30 h-screen overflow-hidden shadow-2xl sticky top-0">
        <div className="p-6 pb-2">
          <div className="flex justify-between items-start">
            <div className={`flex items-center gap-3 group px-2 py-1 rounded-xl transition-all duration-500 hover:bg-white/5`}>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-emerald-300 flex items-center justify-center text-white text-xl shadow-[0_0_20px_rgba(16,185,129,0.3)] group-hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] transition-all" aria-hidden="true">
                Fi
              </div>
              <div className="animate-premium-in">
                <h1 className="text-xl font-bold text-white tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">FinanceAI</h1>
                <div className="text-tiny text-gray-500 font-mono">v2.5 • Pro</div>
              </div>
            </div>
            <div className="flex gap-1">
              <button onClick={onOpenGuide} aria-label="Guide du Pilote" className="p-2 rounded-lg text-blue-400 hover:bg-blue-500/10 hover:text-blue-300 transition-all" title="Guide du Pilote">ℹ️</button>
              <button onClick={togglePrivacyMode} aria-label={isPrivacyMode ? 'Quitter le mode discret' : 'Activer le mode discret'} aria-pressed={isPrivacyMode} className={`p-2 rounded-lg transition-all ${isPrivacyMode ? 'bg-white/10 text-white' : 'text-gray-500 hover:bg-white/5 hover:text-white'}`} title="Mode Discret">{isPrivacyMode ? '🙈' : '👁️'}</button>
            </div>
          </div>
        </div>

        <div className="px-6 py-6">
          <button type="button" onClick={() => setActiveTab(Tab.FUTURE)} className="w-full p-4 rounded-xl bg-gradient-to-br from-[#1A1E29] to-[#0d0f14] border border-white/5 relative overflow-hidden group shadow-lg cursor-pointer hover:border-primary/30 transition-colors text-left" aria-label={`Objectif: ${milestone.label}, ${milestone.percent.toFixed(0)}%`}>
            <div className="absolute top-0 right-0 w-16 h-16 bg-primary/10 rounded-full blur-2xl -mr-8 -mt-8" aria-hidden="true"></div>
            <div className="flex justify-between items-end mb-2 relative z-10">
              <div>
                <div className="text-tiny text-gray-400 uppercase tracking-widest font-bold mb-0.5 truncate max-w-[120px]">{milestone.label}</div>
                <div className="text-lg font-black text-white privacy-blur">{milestone.target.toLocaleString()}$</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-primary">{milestone.percent.toFixed(0)}%</div>
              </div>
            </div>
            <div className="w-full bg-black/50 rounded-full h-1.5 overflow-hidden mb-3 relative z-10 border border-white/5">
              <div className="h-full bg-gradient-to-r from-emerald-600 to-primary shadow-[0_0_10px_rgba(16,185,129,0.5)] transition-all duration-1000" style={{ width: `${milestone.percent}%` }}></div>
            </div>
            <div className="flex items-center justify-between text-tiny text-gray-500 relative z-10 bg-white/[0.03] p-1.5 rounded-lg border border-white/5 backdrop-blur-sm">
              <span className="flex items-center gap-1"><span aria-hidden="true">🎯</span> Cible:</span>
              <span className="text-white font-bold capitalize">{milestoneDateStr}</span>
            </div>
          </button>
        </div>

        <nav aria-label="Navigation principale" className="flex-1 min-h-0 overflow-y-auto px-4 space-y-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="text-tiny uppercase text-ink-500 font-bold px-4 mb-2 tracking-widest flex items-center gap-2">
                <span aria-hidden="true">{group.icon}</span>
                <span>{group.label}</span>
              </div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveTab(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-card transition-all duration-200 group relative overflow-hidden focus-ring ${
                        isActive
                          ? 'bg-white/5 text-ink-50 shadow-lg border border-white/5'
                          : 'hover:bg-white/5 text-ink-300 hover:text-ink-50'
                      }`}
                    >
                      {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r" aria-hidden="true"></div>}
                      <span
                        aria-hidden="true"
                        className={`text-base transition-transform group-hover:scale-110 ${isActive ? 'scale-110 text-primary' : ''}`}
                      >
                        {item.icon}
                      </span>
                      <span className="font-medium text-meta">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-white/5 bg-[#0F1116]">
          {/* Phase D1 — système: targets touch 44px+ (text-meta + py-2.5) */}
          <nav aria-label="Outils système" className="grid grid-cols-3 gap-2 mb-3">
            <button type="button" onClick={() => setActiveTab(Tab.DATA)} aria-current={activeTab === Tab.DATA ? 'page' : undefined} className={`flex flex-col items-center justify-center p-2.5 rounded-card text-tiny font-medium transition-all focus-ring ${activeTab === Tab.DATA ? 'bg-white/10 text-ink-50' : 'text-ink-400 hover:bg-white/5 hover:text-ink-100'}`}><span className="text-base" aria-hidden="true">💾</span> Data</button>
            <button type="button" onClick={() => setActiveTab(Tab.SYSTEM)} aria-current={activeTab === Tab.SYSTEM ? 'page' : undefined} className={`flex flex-col items-center justify-center p-2.5 rounded-card text-tiny font-medium transition-all focus-ring ${activeTab === Tab.SYSTEM ? 'bg-white/10 text-ink-50' : 'text-ink-400 hover:bg-white/5 hover:text-ink-100'}`}><span className="text-base" aria-hidden="true">🛠️</span> Sys</button>
            <button type="button" onClick={() => setActiveTab(Tab.SETTINGS)} aria-current={activeTab === Tab.SETTINGS ? 'page' : undefined} className={`flex flex-col items-center justify-center p-2.5 rounded-card text-tiny font-medium transition-all focus-ring ${activeTab === Tab.SETTINGS ? 'bg-white/10 text-ink-50' : 'text-ink-400 hover:bg-white/5 hover:text-ink-100'}`}><span className="text-base" aria-hidden="true">⚙️</span> Config</button>
          </nav>
          <button onClick={onRefresh} disabled={isLoading} className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-gray-800 to-gray-700 hover:from-gray-700 hover:to-gray-600 border border-white/10 text-white py-3 rounded-xl text-sm font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:scale-100">
            <span aria-hidden="true" className={isLoading ? "animate-spin" : ""}>🔄</span> {isLoading ? "Sync" : "Synchroniser"}
          </button>
          {onGeneratePDF && (
            <button onClick={onGeneratePDF} className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-900/40 to-purple-900/40 hover:from-indigo-800/60 hover:to-purple-800/60 border border-indigo-500/20 text-indigo-300 hover:text-white py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg active:scale-95 mt-2">
              <span aria-hidden="true">📄</span> {currentLang === 'fr' ? 'Rapport PDF' : 'PDF Report'}
            </button>
          )}
          <button
            onClick={toggleLang}
            title={currentLang === 'fr' ? 'Switch to English' : 'Passer en Francais'}
            aria-label={currentLang === 'fr' ? 'Switch to English' : 'Passer en Francais'}
            className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white py-2 rounded-xl text-xs font-bold transition-all mt-2"
          >
            <span aria-hidden="true">🌐</span> {currentLang === 'fr' ? '🇫🇷 FR → EN' : '🇬🇧 EN → FR'}
          </button>
        </div>
      </aside>

      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-[#0B0E14]/95 backdrop-blur-xl border-b border-white/10 z-50 flex items-center justify-between px-4 shadow-xl">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-emerald-400 flex items-center justify-center text-white font-bold shadow-lg shadow-primary/20" aria-hidden="true">Fi</div>
          <h1 className="text-lg font-bold text-white tracking-tight">FinanceAI</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onOpenGuide} aria-label="Guide du Pilote" className="w-9 h-9 flex items-center justify-center rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400">ℹ️</button>
          <button onClick={togglePrivacyMode} aria-label={isPrivacyMode ? 'Quitter le mode discret' : 'Activer le mode discret'} aria-pressed={isPrivacyMode} className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-lg active:scale-90 transition-transform">{isPrivacyMode ? '🙈' : '👁️'}</button>
          <button onClick={onRefresh} aria-label="Synchroniser" className={`w-9 h-9 flex items-center justify-center rounded-full bg-white/5 border border-white/10 active:scale-90 transition-transform ${isLoading ? 'animate-spin text-primary' : 'text-gray-300'}`}>🔄</button>
        </div>
      </div>

      <main className="flex-1 p-3 md:p-10 mt-16 md:mt-0 overflow-y-auto min-h-[100dvh] pb-24 md:pb-10 relative z-0 scroll-smooth">
        <div className="max-w-7xl mx-auto space-y-6 md:space-y-8 animate-premium-in">
          {children}
        </div>
      </main>

      {/* Phase D1 — Bottom nav avec text-tiny (cohérent avec scale typo) + targets touch 48px+ */}
      <nav aria-label="Navigation mobile" className="md:hidden fixed bottom-0 left-0 right-0 h-[72px] bg-[#12141a]/100 backdrop-blur-2xl border-t border-white/10 z-[100] flex items-center justify-around px-1 pb-safe shadow-[0_-5px_20px_rgba(0,0,0,0.5)]">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
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
          className={`relative flex flex-col items-center justify-center min-w-[56px] h-full transition-all duration-200 active:scale-95 focus-ring rounded-card ${showMobileDrawer || extraItems.some(e => e.id === activeTab) || [Tab.SETTINGS, Tab.DATA, Tab.SYSTEM].includes(activeTab) ? 'text-primary' : 'text-ink-400'}`}
        >
          <div aria-hidden="true" className={`text-2xl mb-1 transition-transform ${showMobileDrawer ? 'rotate-90' : ''}`}>⋯</div>
          <span className="text-tiny font-medium">Plus</span>
          {(extraItems.some(e => e.id === activeTab) || [Tab.SETTINGS, Tab.DATA, Tab.SYSTEM].includes(activeTab)) && <span aria-hidden="true" className="absolute top-1.5 w-1 h-1 bg-primary rounded-full"></span>}
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
              <span aria-hidden="true">⚙️</span><span>Système</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[{ id: Tab.SETTINGS, icon: '⚙️', label: 'Config' }, { id: Tab.DATA, icon: '💾', label: 'Data' }, { id: Tab.SYSTEM, icon: '🛠️', label: 'Système' }].map(item => (
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
