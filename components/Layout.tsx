
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Tab, FinancialGoal, User } from '../types';
import { TAB_LABELS } from '../constants';
import { NAV_DESTINATIONS, MOBILE_BAR_TABS, destinationOfTab } from './navDestinations';
import { CoupleModeBadge } from './ui/CoupleModeBadge';
import { showToast } from './ui/Toast';
import { Icon, type IconName } from './ui/Icon';
import { useFinanceStore } from '../store/useFinanceStore';
import { BackupReminder } from './BackupReminder';
import { getPersonaById, getPersonaOrDefault, TEST_PERSONAS } from '../services/testFixtures';

// Hub perso — cible du lien « ← Hub » de la sidebar (overridable au build via VITE_HUB_URL).
const HUB_URL = (import.meta.env.VITE_HUB_URL as string | undefined)?.replace(/\/+$/, '') || 'https://hubperso.com';

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
  useTranslation(); // <html lang> sync et re-render au changement de langue (labels via TAB_LABELS)
  const [showMobileDrawer, setShowMobileDrawer] = React.useState(false);

  // Phase B.1 — sidebar cachée par défaut, expansion au survol + focus clavier.
  const [sidebarHovered, setSidebarHovered] = React.useState(false);
  const [sidebarFocused, setSidebarFocused] = React.useState(false);
  // [A11Y-SIDEBAR-ESC] WCAG 1.4.13 (Dismissable) : un contenu déclenché par le survol ou le focus
  // doit pouvoir être REFERMÉ au clavier sans déplacer ni le pointeur ni le focus. Un simple
  // `setSidebarHovered(false)` ne suffit pas — `onMouseEnter` ne se redéclenche pas tant que le
  // pointeur ne SORT pas, mais `onFocus` se redéclenche au moindre Tab interne et rouvrirait le
  // rail aussitôt. D'où un VERROU, levé quand le survol ou le focus quitte réellement l'aside.
  const [sidebarDismissed, setSidebarDismissed] = React.useState(false);
  const isSidebarOpen = (sidebarHovered || sidebarFocused) && !sidebarDismissed;

  // Phase B.2 — accordion : chaque destination multi-onglets peut être dépliée/repliée au clic.
  // Par défaut toutes ouvertes pour ne pas surprendre l'utilisateur.
  const [openGroups, setOpenGroups] = React.useState<Set<string>>(
    () => new Set(NAV_DESTINATIONS.filter((d) => d.tabs.length > 1).map((d) => d.label)),
  );
  const toggleGroup = React.useCallback((label: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  // [REFONTE-NAV Lot 1] La structure vient de NAV_DESTINATIONS (source unique) — plus de
  // navGroups locaux. Icône par onglet : celle de sa destination pour les singletons, sinon
  // l'icône historique de la page.
  const TAB_ICONS: Record<Tab, IconName> = {
    [Tab.DASHBOARD]: 'dashboard',
    [Tab.TRANSACTIONS]: 'transactions',
    [Tab.BUDGET]: 'budget',
    [Tab.DEBT]: 'debt',
    [Tab.INVESTMENTS]: 'investments',
    [Tab.FUTURE]: 'future',
    [Tab.REAL_ESTATE]: 'real-estate',
    [Tab.REAL_ESTATE_PROJECTS]: 'building',
    [Tab.CHILD]: 'child',
    [Tab.TRAVEL]: 'life-projects',
    [Tab.LIFE_EVENTS]: 'life-projects',
    [Tab.LIFE_PROJECTS]: 'life-projects',
    [Tab.RETIREMENT]: 'retirement',
    [Tab.TAX]: 'tax',
    [Tab.SETTINGS]: 'settings',
    [Tab.PROFILE]: 'settings',
    [Tab.ASSISTANT]: 'bot',
  };

  // Barre mobile : onglets épinglés + tout le reste via le drawer « Plus ».
  const mobileBarItems = MOBILE_BAR_TABS.map((tab) => ({
    id: tab,
    label: destinationOfTab(tab)?.tabs.length === 1 ? destinationOfTab(tab)!.label : TAB_LABELS[tab],
    icon: TAB_ICONS[tab],
  }));
  // ⚠️ `isSingleTab` se calcule AVANT le filtrage des tabs épinglés : après filtrage,
  // Transactions [TRANSACTIONS, BUDGET] devient [BUDGET] (length 1) et le bouton Budget
  // s'étiquetait « Transactions » (finding code-reviewer #600, prouvé par rendu).
  const drawerDestinations = NAV_DESTINATIONS
    .map((d) => ({
      ...d,
      isSingleTab: d.tabs.length === 1,
      tabs: d.tabs.filter((tab) => !MOBILE_BAR_TABS.includes(tab)),
    }))
    .filter((d) => d.tabs.length > 0);

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
    if (isCouple) {
      // repasse en individuel : on retire le conjoint
      setAppState({ config: { ...coupleConfig, users: [users[0]] as unknown as [User, User] } });
      return;
    }
    // [CPL-1] (revue #245 MAJEUR-1) — plus AUCUNE création/nommage de conjoint placeholder ici :
    // la simple présence d'un 2e user change les calculs (PSV/SRG à ses 65 ans, imposition 2 têtes).
    // Passage en couple = définition CONSCIENTE via le formulaire gaté de Profil.
    showToast('Définis d\'abord ton conjoint (nom + âge) dans Profil pour passer en couple.', 'info');
    useFinanceStore.getState().setActiveTab(Tab.PROFILE);
  };

  return (
    <div className={`min-h-screen flex flex-col md:flex-row text-ink-100 font-sans ${isPrivacyMode ? 'privacy-active' : ''} ${isTestMode ? 'test-mode-active' : ''}`}>
      {/* A11y (Audit Phase 5.1): skip link — invisible jusqu'à focus clavier. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:px-4 focus:py-2 focus:rounded-card focus:bg-primary focus:text-dark focus:font-bold focus:shadow-xl"
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
          <Icon name="flask" size={16} />
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
              <option key={p.id} value={p.id} className="bg-dark text-white">
                {p.emoji} {p.label}
              </option>
            ))}
          </select>
          <span className="hidden md:inline font-normal text-meta opacity-90">— données fictives, vraies données sauvegardées</span>
        </div>
      )}
      <style>{`
        /* [PRIV-DISCRET-DOM] survol-révèle RETIRÉ (un survol accidentel exposait le montant). Cette classe
           ne s'applique plus qu'aux spots BRUTS non encore migrés vers <PrivateAmount> (qui masque la VALEUR
           par « ••• », hors DOM). À terme, migrer ces spots → plus aucun montant flouté dans le DOM. */
        .privacy-active .privacy-blur {
            filter: blur(8px) !important;
            opacity: 0.5 !important;
            transition: all 0.3s ease;
            user-select: none !important;
        }
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
      {/* aria-expanded retiré de l'aside (audit #598) : non supporté par le rôle implicite
          complementary (axe aria-allowed-attr) — chaque groupe expose le sien via son bouton. */}
      <aside
        className={`hidden md:flex fixed top-0 left-0 bottom-0 z-40 flex-col bg-dark border-r border-white/10 overflow-hidden shadow-2xl transition-[width] duration-200 motion-reduce:transition-none ${
          isSidebarOpen ? 'w-72' : 'w-16'
        }`}
        onMouseEnter={() => setSidebarHovered(true)}
        onMouseLeave={() => { setSidebarHovered(false); setSidebarDismissed(false); }}
        onFocus={() => setSidebarFocused(true)}
        onBlur={(e) => {
          // Ne déclenche le collapse que si le focus quitte tout l'aside.
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setSidebarFocused(false);
            setSidebarDismissed(false);
          }
        }}
        // [A11Y-SIDEBAR-ESC] Échap replie le rail sans bouger le focus : les libellés repassent en
        // `opacity-0`, mais les noms accessibles restent (chaque item porte un `aria-label` quand le
        // rail est replié), donc rien n'est perdu pour un lecteur d'écran.
        onKeyDown={(e) => { if (e.key === 'Escape') setSidebarDismissed(true); }}
      >
        {/* Brand + privacy toggle */}
        <div className="p-3 pb-2 shrink-0 space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-ink-50 text-xl font-bold shadow-[0_0_20px_rgba(230,234,242,0.12)] shrink-0" aria-hidden="true">
              Fi
            </div>
            <div className={`min-w-0 whitespace-nowrap transition-opacity duration-150 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
              <p className="text-lg font-bold text-white tracking-tight">FinanceAI</p>
              <div className="text-tiny text-ink-400 font-mono" title={`Build ${__BUILD_DATE__}`}>
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
              isPrivacyMode ? 'bg-white/10 text-white' : 'text-ink-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Icon name={isPrivacyMode ? 'eye-off' : 'eye'} size={16} className="shrink-0" />
            <span className={`text-meta whitespace-nowrap transition-opacity duration-150 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
              {isPrivacyMode ? 'Quitter discret' : 'Mode discret'}
            </span>
          </button>
        </div>

        {/* NBA-PAGE — « Prochaine action » déplacé dans son onglet dédié (retiré de la sidebar). */}

        {/* Navigation principale — accordion par groupe */}
        <nav aria-label="Navigation principale" className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {NAV_DESTINATIONS.map((dest) => {
            // [REFONTE-NAV Lot 1] Destination à onglet UNIQUE (Futur, Assistant, Réglages) :
            // bouton de navigation direct, même gabarit visuel qu'un header de groupe (pas
            // d'accordéon d'un seul item). aria-current le distingue des accordéons.
            if (dest.tabs.length === 1) {
              const tab = dest.tabs[0];
              const isActive = activeTab === tab;
              return (
                <div key={dest.id} className="mb-1.5">
                  <button
                    type="button"
                    data-tour-id={`nav-${tab}`}
                    onClick={() => setActiveTab(tab)}
                    aria-current={isActive ? 'page' : undefined}
                    title={!isSidebarOpen ? dest.label : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-card transition-colors duration-150 relative focus-ring ${
                      isActive ? 'bg-white/5 text-ink-50' : 'hover:bg-white/5 text-ink-300 hover:text-ink-50'
                    }`}
                  >
                    {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-primary rounded-r" aria-hidden="true"></span>}
                    <Icon name={dest.icon} size={18} className={`shrink-0 ${isActive ? 'text-primary' : 'text-ink-300'}`} />
                    <span className={`text-tiny uppercase font-bold tracking-widest whitespace-nowrap flex-1 text-left transition-opacity duration-150 ${isActive ? 'text-ink-100' : 'text-ink-400'} ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
                      {dest.label}
                    </span>
                  </button>
                </div>
              );
            }

            const group = {
              label: dest.label,
              icon: dest.icon,
              items: dest.tabs.map((tab) => ({ id: tab, label: TAB_LABELS[tab], icon: TAB_ICONS[tab] })),
            };
            const isGroupExpanded = openGroups.has(group.label);
            // U-sidebar — le repli RESPECTE désormais l'accordion : un sous-groupe
            // rangé (replié) n'empile plus toutes ses icônes ; il montre l'icône
            // du groupe + un badge compteur (nombre d'items cachés). Déplié, on
            // affiche les items (icônes seules en rail, icônes + labels ouvert).
            const showItems = isGroupExpanded;
            const count = group.items.length;
            const hasActive = group.items.some((it) => it.id === activeTab);
            const tidied = !isGroupExpanded; // groupe « rangé »

            return (
              <div key={group.label} className="mb-1.5">
                <button
                  type="button"
                  // [D6-KBD] JAMAIS disabled : un bouton désactivé est SAUTÉ par Tab — au moment où
                  // Tab le considérait, la sidebar était encore repliée (le focus n'y était pas
                  // entré), donc l'accordéon était inatteignable au clavier en marche avant. Le
                  // focus OUVRE la sidebar (onFocus de l'aside) : atteint = opérable, toujours.
                  onClick={() => toggleGroup(group.label)}
                  aria-expanded={isGroupExpanded}
                  aria-controls={`nav-group-${group.label}`}
                  aria-label={!isSidebarOpen ? `${group.label} — ${count} onglets${tidied ? ' (rangé)' : ''}` : undefined}
                  title={!isSidebarOpen ? `${group.label} (${count})` : undefined}
                  className="w-full flex items-center gap-3 px-3 py-1.5 rounded-card transition-colors hover:bg-white/5 cursor-pointer focus-ring"
                >
                  <span className="relative shrink-0 flex items-center justify-center">
                    <Icon
                      name={group.icon}
                      size={18}
                      className={`shrink-0 transition-colors ${hasActive && tidied ? 'text-primary' : 'text-ink-300'}`}
                    />
                    {/* Badge compteur visible en rail replié quand le groupe est rangé. */}
                    {!isSidebarOpen && tidied && (
                      <span
                        className={`absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-1 flex items-center justify-center rounded-full text-[9px] font-bold leading-none ring-2 ring-dark ${
                          hasActive ? 'bg-primary text-dark' : 'bg-white/15 text-ink-100'
                        }`}
                        aria-hidden="true"
                      >
                        {count}
                      </span>
                    )}
                  </span>
                  <span className={`text-tiny uppercase font-bold tracking-widest whitespace-nowrap flex-1 text-left transition-opacity duration-150 ${hasActive ? 'text-ink-200' : 'text-ink-400'} ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
                    {group.label}
                  </span>
                  {/* Pastille compteur (panneau ouvert) — sous-groupes plus lisibles. */}
                  <span
                    className={`shrink-0 flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-bold leading-none transition-opacity duration-150 ${
                      tidied ? 'bg-white/12 text-ink-100' : 'bg-white/5 text-ink-400'
                    } ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}
                    aria-hidden="true"
                  >
                    {count}
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
                {/* [D6-KBD] `invisible` quand replié : max-h-0 + overflow-hidden CACHE visuellement
                    mais laisse les boutons DANS l'ordre de tabulation — Tab posait le focus sur un
                    élément invisible (focus perdu à l'écran). visibility:hidden les en retire. */}
                <div id={`nav-group-${group.label}`} className={`overflow-hidden transition-[max-height] duration-200 motion-reduce:transition-none ${showItems ? 'max-h-[600px] visible' : 'max-h-0 invisible'}`}>
                  {/* Filet + léger retrait pour matérialiser l'appartenance au groupe (panneau ouvert). */}
                  <div className={`space-y-0.5 pt-0.5 ${isSidebarOpen ? 'ml-[1.35rem] pl-1 border-l border-white/10' : ''}`}>
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
                          <Icon name={item.icon} size={18} className={`shrink-0 ${isActive ? 'text-primary' : ''}`} />
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
            {/* [REFONTE-NAV Lot 1] Le bouton Configuration/Réglages a MONTÉ dans la nav
                principale (destination « Réglages ») — le footer ne garde que le lien Hub. */}
            {/* Retour au hub perso (lien externe ; URL overridable via VITE_HUB_URL). */}
            <a
              href={HUB_URL}
              title="Retour au hub"
              className="flex flex-row items-center gap-3 px-3 py-2 rounded-card text-tiny font-medium text-ink-400 hover:bg-white/5 hover:text-ink-100 transition-colors focus-ring"
            >
              <span aria-hidden className="shrink-0 w-[18px] text-center text-base leading-none">←</span>
              <span className={`whitespace-nowrap transition-opacity duration-150 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
                Hub
              </span>
            </a>
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
          <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-ink-50 font-bold" aria-hidden="true">Fi</div>
          <p className="text-lg font-bold text-white tracking-tight">FinanceAI</p>
        </div>
        {/* Phase B.4 — info ℹ️ et Synchroniser 🔄 retirées sur mobile aussi. */}
        <div className="flex items-center gap-3">
          <button
            onClick={togglePrivacyMode}
            aria-label={isPrivacyMode ? 'Quitter le mode discret' : 'Activer le mode discret'}
            aria-pressed={isPrivacyMode}
            className="w-11 h-11 rounded-full bg-white/5 flex items-center justify-center text-ink-200 active:scale-90 transition-transform focus-ring"
          >
            <Icon name={isPrivacyMode ? 'eye-off' : 'eye'} size={20} />
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
        {mobileBarItems.map((item) => (
          <button
            key={item.id}
            type="button"
            data-tour-id={`nav-${item.id}`}
            onClick={() => { setActiveTab(item.id as Tab); setShowMobileDrawer(false); }}
            aria-current={activeTab === item.id ? 'page' : undefined}
            className={`relative flex flex-col items-center justify-center min-w-[56px] h-full transition-all duration-200 active:scale-95 group focus-ring rounded-card`}
          >
            <div aria-hidden="true" className={`mb-1 transition-transform duration-300 ${activeTab === item.id ? 'scale-110 -translate-y-0.5 text-ink-50 drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]' : 'text-ink-400 group-hover:text-ink-200'}`}><Icon name={item.icon} size={24} /></div>
            <span className={`text-tiny font-medium transition-colors ${activeTab === item.id ? 'text-primary' : 'text-ink-400'}`}>{item.label}</span>
            {activeTab === item.id && <span aria-hidden="true" className="absolute top-1.5 w-1 h-1 bg-primary rounded-full shadow-[0_0_6px_rgba(230,234,242,0.55)]"></span>}
          </button>
        ))}
        <button
          onClick={() => setShowMobileDrawer(v => !v)}
          aria-label="Plus d'options"
          aria-expanded={showMobileDrawer}
          className={`relative flex flex-col items-center justify-center min-w-[56px] h-full transition-all duration-200 active:scale-95 focus-ring rounded-card ${showMobileDrawer || !MOBILE_BAR_TABS.includes(activeTab) ? 'text-primary' : 'text-ink-400'}`}
        >
          <div aria-hidden="true" className={`mb-1 transition-transform ${showMobileDrawer ? 'rotate-90' : ''}`}><Icon name="more" size={24} /></div>
          <span className="text-tiny font-medium">Plus</span>
          {!MOBILE_BAR_TABS.includes(activeTab) && <span aria-hidden="true" className="absolute top-1.5 w-1 h-1 bg-primary rounded-full"></span>}
        </button>
      </nav>

      {showMobileDrawer && (
        <div className="md:hidden fixed inset-0 z-40" onClick={() => setShowMobileDrawer(false)}>
          {/* role+label : sémantique du panneau ET ancrage des tests (le test « non-perte mobile »
              doit interroger CE conteneur — interroger le document entier laissait la sidebar
              desktop satisfaire l'assertion, test vacueux — finding code-reviewer #600). */}
          <div role="navigation" aria-label="Autres destinations" className="absolute bottom-[72px] left-0 right-0 bg-[#0F1116]/98 backdrop-blur-xl border-t border-white/10 p-4 shadow-2xl animate-slide-up max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* [REFONTE-NAV Lot 1] Drawer « Plus » = les destinations, moins les onglets déjà
                épinglés dans la barre (dérivé de NAV_DESTINATIONS — source unique). */}
            {drawerDestinations.map((dest) => (
              <div key={dest.id} className="mb-4 last:mb-0">
                <div className="text-tiny uppercase text-ink-400 font-bold tracking-widest mb-2 flex items-center gap-2">
                  <Icon name={dest.icon} size={16} />
                  <span>{dest.label}</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {dest.tabs.map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => { setActiveTab(tab); setShowMobileDrawer(false); }}
                      aria-current={activeTab === tab ? 'page' : undefined}
                      className={`flex flex-col items-center justify-center p-3 rounded-card transition-all active:scale-95 border focus-ring min-h-[72px] ${activeTab === tab
                        ? 'bg-white/10 border-white/20 text-ink-50'
                        : 'bg-white/5 border-white/5 text-ink-300 hover:text-ink-50 hover:bg-white/10'
                        }`}
                    >
                      <Icon name={TAB_ICONS[tab]} size={20} className="mb-1" />
                      <span className="text-tiny font-medium text-center leading-tight">
                        {dest.isSingleTab ? dest.label : TAB_LABELS[tab]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
