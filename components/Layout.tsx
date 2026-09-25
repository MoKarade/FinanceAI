
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Tab, FinancialGoal, User } from '../types';
import { TAB_LABELS } from '../constants';
import { NAV_GROUPS, MOBILE_BAR_TABS, PROFILE_TAB, navItemOfTab } from './navDestinations';
import { CoupleModeBadge } from './ui/CoupleModeBadge';
import { showToast } from './ui/Toast';
import { Icon, type IconName } from './ui/Icon';
import { useFinanceStore } from '../store/useFinanceStore';
import { BackupReminder } from './BackupReminder';
import { getPersonaById, getPersonaOrDefault, TEST_PERSONAS } from '../services/testFixtures';
import { isCoupleMode } from '../services/couple/netWorthByOwner';

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

  // [A11Y-ROUTE-FOCUS] Changer d'onglet ne déplaçait NI le focus NI rien qui s'annonce. Pour qui
  // navigue au clavier ou au lecteur d'écran, cliquer une destination ne produisait donc aucun
  // signal : le focus restait sur le bouton de nav, et la seule façon d'atteindre le nouveau contenu
  // était de re-tabuler tout le rail. C'est le pendant du lien d'évitement — sauf qu'ici, le saut
  // devrait être automatique puisque c'est l'utilisateur qui a demandé le changement.
  //
  // ⚠️ PAS au premier rendu. Voler le focus au chargement (ou à un rafraîchissement, où l'app
  // restaure l'onglet mémorisé) déplacerait le point de départ de tout le monde sans que personne
  // n'ait rien demandé. On ne réagit qu'à un CHANGEMENT, d'où l'onglet précédent gardé en ref.
  //
  // ⚠️ La région d'annonce est montée EN PERMANENCE et on écrit dedans. Montée au moment de parler,
  // elle raterait la PREMIÈRE transition — la seule qui compte ici (leçon
  // `COPIER-LE-VOISIN-N-EST-PAS-COPIER-LE-BON-PATRON`).
  const ongletPrecedent = React.useRef<Tab | null>(null);
  const [annonceRoute, setAnnonceRoute] = React.useState('');
  React.useEffect(() => {
    const precedent = ongletPrecedent.current;
    ongletPrecedent.current = activeTab;
    if (precedent === null || precedent === activeTab) return;
    // `preventScroll` : le focus ne doit pas rejouer un défilement par-dessus celui que le nouvel
    // écran vient de faire (un deep-link `pendingFocus` scrolle vers sa section).
    document.getElementById('main')?.focus({ preventScroll: true });
    setAnnonceRoute(TAB_LABELS[activeTab]);
  }, [activeTab]);

  // [S5-REFONTE-R1] Barre latérale TOUJOURS dépliée (232 px, texte) : plus de rail au survol, donc
  // plus d'accordéon ni de verrou Échap (WCAG 1.4.13 ne s'applique plus : rien n'apparaît au survol).
  const isNavActive = (tab: Tab) => navItemOfTab(activeTab)?.tab === tab;
  const itemsMobilePlus = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((it) => !MOBILE_BAR_TABS.includes(it.tab)) }))
    .filter((g) => g.items.length > 0);
  const surPagePlus = !MOBILE_BAR_TABS.includes(activeTab);

  // Menu « Plus » (mobile) : Échap le referme, et le focus y entre à l'ouverture.
  const panneauPlusRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!showMobileDrawer) return;
    panneauPlusRef.current?.querySelector<HTMLElement>('button, a')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowMobileDrawer(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showMobileDrawer]);

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
  const isCouple = isCoupleMode(coupleConfig?.users); // [COUPLE-PREDICAT-COPIES] source unique
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

  // Carte Profil : initiales + prénoms du ménage (« Alex et Sam »), sans le suffixe « (test) ».
  const prenoms = ((coupleConfig?.users ?? []) as User[])
    .map((u) => (u?.name ?? '').replace(/\s*\(test\)\s*$/i, '').trim())
    .filter(Boolean);
  const libelleProfil = prenoms.length ? prenoms.join(' et ') : 'Profil';
  const initiales = prenoms.length ? prenoms.map((n) => n[0]!.toUpperCase()).join('').slice(0, 2) : 'P';

  return (
    <div className={`min-h-screen flex flex-col md:flex-row text-ink-100 font-sans ${isPrivacyMode ? 'privacy-active' : ''} ${isTestMode ? 'test-mode-active' : ''}`}>
      {/* A11y (Audit Phase 5.1): skip link — invisible jusqu'à focus clavier. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-200 focus:px-4 focus:py-2 focus:rounded-card focus:bg-primary focus:text-dark focus:font-bold focus:shadow-xl"
      >
        Aller au contenu principal
      </a>

      {/* [A11Y-ROUTE-FOCUS] Région d'annonce de destination — TOUJOURS montée, on ne fait qu'y
          écrire. Vide au premier rendu : arriver sur l'app n'est pas un changement de destination. */}
      <div role="status" aria-live="polite" className="sr-only">{annonceRoute}</div>

      {/* Banner Mode Test — toujours visible quand isTestMode=true. */}
      {isTestMode && (
        <div
          role="status"
          aria-label="Mode test activé"
          className="fixed top-0 left-0 right-0 z-150 bg-linear-to-r/srgb from-warning-600 via-orange-600 to-warning-600 text-white text-center py-2 px-4 font-bold text-body shadow-lg flex items-center justify-center gap-3"
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
            className="bg-amber-900/70 text-white text-meta rounded-sm px-2 py-1 border border-white/40 font-normal cursor-pointer max-w-[55vw] truncate focus:outline-hidden focus:ring-2 focus:ring-white/60"
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

      {/* [S5-REFONTE-R1] Barre latérale TEXTE (bureau, ≥ lg) : marque, trois groupes, carte Profil.
          aria-expanded absent de l'aside (audit #598 : non supporté par le rôle complementary). */}
      <aside className={`hidden lg:flex fixed top-0 left-0 bottom-0 z-40 w-[232px] flex-col gap-5 bg-[#0A0C10] border-r border-white/6 px-3.5 pb-3.5 ${isTestMode ? 'pt-16' : 'pt-5'}`}>
        <div className="flex items-center gap-2.5 px-2" title={`v${__APP_VERSION__} • ${__GIT_SHA__} — build ${__BUILD_DATE__}`}>
          <div className="w-[30px] h-[30px] rounded-[9px] bg-primary text-dark font-extrabold text-base flex items-center justify-center shrink-0" aria-hidden="true">F</div>
          {/* Le brand n'est PAS un titre : le <h1> est réservé au titre de page. */}
          <p className="text-base font-bold text-ink-50">FinanceAI</p>
        </div>

        <nav aria-label="Navigation principale" className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.id} className="flex flex-col gap-0.5">
              <p className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase text-ink-400">{group.label}</p>
              {group.items.map((item) => {
                const actif = isNavActive(item.tab);
                return (
                  <button
                    key={item.tab}
                    type="button"
                    data-tour-id={`nav-${item.tab}`}
                    onClick={() => setActiveTab(item.tab)}
                    aria-current={actif ? 'page' : undefined}
                    className={`h-9 px-2.5 rounded-[10px] flex items-center text-left text-body transition-colors focus-ring ${
                      actif ? 'bg-primary/10 text-ink-50 font-semibold' : 'text-ink-300 hover:bg-white/5 hover:text-ink-50'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="flex flex-col gap-2 shrink-0">
          <button
            type="button"
            data-tour-id={`nav-${PROFILE_TAB}`}
            onClick={() => setActiveTab(PROFILE_TAB)}
            aria-current={activeTab === PROFILE_TAB ? 'page' : undefined}
            className={`h-12 px-2.5 rounded-xl flex items-center gap-2.5 text-left text-body transition-colors focus-ring border ${
              activeTab === PROFILE_TAB ? 'bg-primary/10 border-primary/30 text-ink-50 font-semibold' : 'border-white/6 text-ink-200 hover:bg-white/5'
            }`}
          >
            <span className="w-7 h-7 rounded-full bg-surfaceHighlight flex items-center justify-center text-meta font-bold text-primary shrink-0" aria-hidden="true">{initiales}</span>
            <span className="truncate">{libelleProfil} · Profil</span>
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={togglePrivacyMode}
              aria-label={isPrivacyMode ? 'Quitter le mode discret' : 'Activer le mode discret'}
              aria-pressed={isPrivacyMode}
              title="Mode discret"
              className={`h-9 px-2.5 rounded-[10px] flex items-center gap-2 text-meta transition-colors focus-ring ${
                isPrivacyMode ? 'bg-white/10 text-ink-50' : 'text-ink-400 hover:bg-white/5 hover:text-ink-50'
              }`}
            >
              <Icon name={isPrivacyMode ? 'eye-off' : 'eye'} size={16} className="shrink-0" />
              {isPrivacyMode ? 'Quitter discret' : 'Discret'}
            </button>
            {/* G22-B2 — clic = bascule Couple ⇄ Individuel (détails du conjoint dans Profil). */}
            <button
              type="button"
              onClick={toggleCoupleMode}
              aria-pressed={isCouple}
              title={isCouple ? 'Mode Couple actif — cliquer pour repasser en Individuel' : 'Mode Individuel — cliquer pour passer en Couple'}
              className="rounded-full hover:opacity-80 transition-opacity focus-ring"
            >
              <CoupleModeBadge compact />
            </button>
            {/* Retour au hub perso (lien externe ; URL overridable via VITE_HUB_URL). */}
            <a href={HUB_URL} title="Retour au hub" className="ml-auto h-9 px-2.5 rounded-[10px] flex items-center text-meta text-ink-400 hover:bg-white/5 hover:text-ink-100 transition-colors focus-ring">
              ← Hub
            </a>
          </div>
        </div>
      </aside>

      {/* Contenu. Mobile : pas de barre du haut (le titre de page EST l'en-tête) ; la bannière du mode
          test est fixe en haut, d'où la marge qui la dégage. */}
      <main
        id="main"
        tabIndex={-1}
        className={`flex-1 lg:ml-[232px] px-5 pb-28 lg:px-8 lg:pb-10 ${isTestMode ? 'pt-16' : 'pt-5 lg:pt-8'} overflow-y-auto min-h-dvh relative z-0 scroll-smooth focus:outline-hidden`}
      >
        <div className="max-w-7xl mx-auto space-y-6 lg:space-y-8 animate-premium-in">
          {/* Mobile : les pages hors barre du bas remontent vers le menu « Plus ». */}
          {surPagePlus && (
            <button
              type="button"
              onClick={() => setShowMobileDrawer(true)}
              className="lg:hidden -mb-3 text-meta text-ink-400 hover:text-ink-100 focus-ring rounded-sm"
            >
              ‹ Plus
            </button>
          )}
          <BackupReminder onNavigateToSettings={() => setActiveTab(Tab.SETTINGS)} />
          {children}
        </div>
      </main>

      {/* Barre du bas (mobile, < lg) : Futur, Transactions, Assistant, Plus. Cibles ≥ 44 px. */}
      <nav aria-label="Navigation mobile" className="lg:hidden fixed bottom-0 left-0 right-0 h-[76px] z-100 grid grid-cols-4 px-3 pt-2 pb-4 pb-safe bg-[#0A0C10]/94 border-t border-white/6">
        {MOBILE_BAR_TABS.map((tab) => {
          const item = navItemOfTab(tab)!;
          const actif = activeTab === tab && !showMobileDrawer;
          return (
            <button
              key={tab}
              type="button"
              data-tour-id={`nav-${tab}`}
              onClick={() => { setActiveTab(tab); setShowMobileDrawer(false); }}
              aria-current={activeTab === tab ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-1 text-[11px] transition-colors focus-ring rounded-card ${actif ? 'text-ink-50 font-semibold' : 'text-ink-400'}`}
            >
              <Icon name={item.icon} size={22} aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setShowMobileDrawer((v) => !v)}
          aria-label="Plus d'options"
          aria-expanded={showMobileDrawer}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] transition-colors focus-ring rounded-card ${showMobileDrawer || surPagePlus ? 'text-ink-50 font-semibold' : 'text-ink-400'}`}
        >
          <Icon name="more" size={22} aria-hidden="true" />
          Plus
        </button>
      </nav>

      {/* Menu « Plus » (mobile) : un écran à part entière, au-dessus du contenu, sous la barre du bas. */}
      {showMobileDrawer && (
        <div ref={panneauPlusRef} className={`lg:hidden fixed inset-x-0 bottom-[76px] ${isTestMode ? 'top-10' : 'top-0'} z-90 bg-dark overflow-y-auto px-6 pt-5 pb-6 flex flex-col gap-4`}>
          <h2 className="text-[26px] font-bold text-ink-50">Plus</h2>
          <button
            type="button"
            onClick={() => { setActiveTab(PROFILE_TAB); setShowMobileDrawer(false); }}
            aria-current={activeTab === PROFILE_TAB ? 'page' : undefined}
            className="h-[60px] px-3.5 rounded-[14px] bg-surface border border-white/6 flex items-center gap-3 text-left focus-ring"
          >
            <span className="w-9 h-9 rounded-full bg-surfaceHighlight flex items-center justify-center text-meta font-bold text-primary shrink-0" aria-hidden="true">{initiales}</span>
            <span className="flex-1 min-w-0 flex flex-col">
              <span className="font-semibold text-ink-50 truncate">{libelleProfil}</span>
              <span className="text-meta text-ink-400">Profil</span>
            </span>
            <span className="text-ink-400" aria-hidden="true">›</span>
          </button>
          {/* role+label : ancrage des tests (le test « non-perte mobile » interroge CE conteneur). */}
          <div role="navigation" aria-label="Autres destinations" className="flex flex-col gap-4">
            {itemsMobilePlus.map((group) => (
              <section key={group.id} className="flex flex-col">
                <h3 className="px-1 pb-2 text-[11px] font-semibold tracking-[0.08em] uppercase text-ink-400">{group.label}</h3>
                <div className="rounded-[14px] bg-surface border border-white/6 overflow-hidden">
                  {group.items.map((item, i) => (
                    <button
                      key={item.tab}
                      type="button"
                      onClick={() => { setActiveTab(item.tab); setShowMobileDrawer(false); }}
                      aria-current={isNavActive(item.tab) ? 'page' : undefined}
                      className={`w-full h-[52px] px-4 flex items-center justify-between text-left text-body focus-ring ${i ? 'border-t border-white/5' : ''} ${isNavActive(item.tab) ? 'text-ink-50 font-semibold' : 'text-ink-100'}`}
                    >
                      {item.label}
                      <span className="text-ink-400" aria-hidden="true">›</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <section className="flex flex-col">
            <h3 className="px-1 pb-2 text-[11px] font-semibold tracking-[0.08em] uppercase text-ink-400">Préférences</h3>
            <div className="rounded-[14px] bg-surface border border-white/6 overflow-hidden">
              <button
                type="button"
                onClick={togglePrivacyMode}
                aria-label={isPrivacyMode ? 'Quitter le mode discret' : 'Activer le mode discret'}
                aria-pressed={isPrivacyMode}
                className="w-full h-[52px] px-4 flex items-center justify-between text-body text-ink-100 focus-ring"
              >
                <span className="flex items-center gap-2"><Icon name={isPrivacyMode ? 'eye-off' : 'eye'} size={18} aria-hidden="true" />Mode discret</span>
                <span className="text-meta text-ink-400">{isPrivacyMode ? 'activé' : 'désactivé'}</span>
              </button>
              <button
                type="button"
                onClick={toggleCoupleMode}
                aria-pressed={isCouple}
                className="w-full h-[52px] px-4 flex items-center justify-between text-body text-ink-100 border-t border-white/5 focus-ring"
              >
                Ménage
                <CoupleModeBadge />
              </button>
              <a href={HUB_URL} className="w-full h-[52px] px-4 flex items-center justify-between text-body text-ink-100 border-t border-white/5 focus-ring">
                Retour au hub
                <span className="text-ink-400" aria-hidden="true">↗</span>
              </a>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
