import React from 'react';
import { Card } from './ui/Card';
import { PageHeader } from './ui/PageHeader';
import { AppState, BudgetCategory, Transaction, Asset, SavingsGoal, TravelGoal, Debt, InvestmentAccount, InvestmentTransaction, LifeEvent, RetirementGoal, FinancialGoal, RealEstateGoal, BudgetConfig, Tab } from '../types';
import { showToast } from './ui/Toast';
import { useFinanceStore } from '../store/useFinanceStore';
import { InsurancePanel, RentalPropertyPanel, BusinessPanel, CyclicalGoalsPanel } from './PatrimoineExtended';
import { BackupPanel } from './settings/BackupPanel';
import { AutoBackupPanel } from './settings/AutoBackupPanel';
import { PayslipUploadCard } from './settings/PayslipUploadCard';
import { MissingDataChecklist } from './ui/MissingDataBanner';
import { usePendingFocus } from '../utils/usePendingFocus';

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
  childGoal?: any;
  childGoals?: any[];
  financialGoals?: FinancialGoal[];
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
  assets,
  savingsGoals,
  travelGoals,
  debts = [],
  investmentAccounts = [],
  investmentTransactions = [],
  lifeEvents = [],
  retirementGoal,
  realEstateGoals = [],
  setRealEstateGoals,
  childGoal,
  childGoals = [],
  financialGoals = []
}) => {
  // W5.x — Containers étendus via store direct
  const insurancePolicies = useFinanceStore(s => s.insurancePolicies ?? []);
  const rentalProperties = useFinanceStore(s => s.rentalProperties ?? []);
  const privateBusinesses = useFinanceStore(s => s.privateBusinesses ?? []);
  const vehicleReplacements = useFinanceStore(s => s.vehicleReplacements ?? []);
  const majorRenovations = useFinanceStore(s => s.majorRenovations ?? []);
  const charitableGoals = useFinanceStore(s => s.charitableGoals ?? []);
  const setAppState = useFinanceStore(s => s.setAppState);

  const knownAccounts = React.useMemo(() => {
    const accs: Record<string, boolean> = {};
    transactions.forEach(t => {
      if (t.accountName && t.accountName !== 'Unknown') accs[t.accountName] = true;
    });
    Object.keys(initialBalances).forEach(k => accs[k] = true);
    return accs;
  }, [transactions, initialBalances]);

  // Phase C.5 — consomme pendingFocus pour scroll vers le champ ciblé
  // depuis une bannière MissingDataBanner d'un autre onglet.
  usePendingFocus(Tab.SETTINGS);

  const [savedProfiles, setSavedProfiles] = React.useState<string[]>([]);
  const [newProfileName, setNewProfileName] = React.useState('');

  React.useEffect(() => {
    try {
      const profiles = JSON.parse(localStorage.getItem('saved_profiles_list') || '[]');
      setSavedProfiles(profiles);
    } catch (err) {
      console.warn("[Settings] Restore config error:", err);
    }
  }, []);

  const saveProfile = () => {
    if (!newProfileName.trim()) return;
    const profileSlug = `profile_${newProfileName.trim().replace(/\s+/g, '_').toLowerCase()}`;
    const profileData = { config };
    localStorage.setItem(profileSlug, JSON.stringify(profileData));

    const newProfiles = [...new Set([...savedProfiles, newProfileName.trim()])];
    setSavedProfiles(newProfiles);
    localStorage.setItem('saved_profiles_list', JSON.stringify(newProfiles));
    setNewProfileName('');
    showToast(`Profil "${newProfileName}" sauvegarde avec succes !`, "success");
  };

  const loadProfile = (name: string) => {
    const profileSlug = `profile_${name.replace(/\s+/g, '_').toLowerCase()}`;
    try {
      const dataStr = localStorage.getItem(profileSlug);
      if (dataStr) {
        const data = JSON.parse(dataStr);
        if (data.config) {
          setConfig(data.config);
          showToast(`Profil "${name}" charge !`, "success");
        }
      }
    } catch (err: unknown) {
      // TH4 fix : unknown au lieu de any (useUnknownInCatchVariables tsconfig)
      console.error("[Settings] Profile load error:", err);
      const msg = err instanceof Error ? err.message : 'inconnu';
      showToast(`Erreur sur "${name}": ${msg}`, "error");
    }
  };

  const [profileToDelete, setProfileToDelete] = React.useState<string | null>(null);

  const deleteProfile = (name: string) => {
    if (profileToDelete !== name) {
      setProfileToDelete(name);
      setTimeout(() => setProfileToDelete(null), 3000);
      return;
    }
    const profileSlug = `profile_${name.replace(/\s+/g, '_').toLowerCase()}`;
    localStorage.removeItem(profileSlug);
    const newProfiles = savedProfiles.filter(p => p !== name);
    setSavedProfiles(newProfiles);
    localStorage.setItem('saved_profiles_list', JSON.stringify(newProfiles));
    setProfileToDelete(null);
  };

  // C5 fix (Sprint 1) — Sécurité : apiKeys NE SONT PLUS incluses par défaut
  // dans le backup. Avant ce fix, un fichier `.bak` chiffré avec passphrase
  // faible (ou partagé accidentellement) exposait Anthropic + Era + Finnhub
  // (clés directes vers données bancaires + LLM payant).
  // Si l'utilisateur veut quand même inclure les clés, la fonction doit être
  // appelée explicitement avec `buildBackupPayload({ includeApiKeys: true })`.
  // L'utilisateur est alors prévenu via le toast de restauration que ses clés
  // sont à re-saisir (déjà le cas dans le UX flow actuel).
  const buildBackupPayload = (opts: { includeApiKeys?: boolean } = {}) => ({
    version: "3.2",
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
    // FIX agents (HIGH): persister les nouveaux W5.x containers dans le backup
    insurancePolicies,
    rentalProperties,
    privateBusinesses,
    vehicleReplacements,
    majorRenovations,
    charitableGoals,
  });

  return (
    <>
      <BackupPanel buildPayload={buildBackupPayload} />
      {/* P1.3 — Backup auto rolling IndexedDB (complémentaire à l'export JSON manuel) */}
      <AutoBackupPanel />

      <div className="max-w-4xl mx-auto space-y-6">
        <PageHeader
            icon="⚙️"
            title="Configuration"
            subtitle="Hub central — profil, retraite, intégrations, sauvegarde. Modifie ici, l'app suit."
        />

        {/* Phase C.5 — état global de la configuration : %completion + champs manquants */}
        <MissingDataChecklist />

        {/* Phase C.1 — Hub retraite : centralise les paramètres absorbés depuis
            l'onglet Retraite (espérance de vie, âge cible, revenu cible). */}
        <Card title="🏖️ Paramètres de retraite (hub central)">
          <div className="space-y-4">
            <p className="text-tiny text-gray-400 leading-snug">
              Ces paramètres alimentent les projections retraite (capital, drawdown, RRQ/PSV) et
              s'appliquent automatiquement aux onglets Retraite, Investissement et Futur.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div data-focus-section="profile-retirementAge">
                <label className="block text-xs text-gray-400 mb-1">Âge de retraite cible</label>
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
                <label className="block text-xs text-gray-400 mb-1">
                  Espérance de vie
                  <span className="ml-1 text-tiny text-gray-500">(80–100 ans)</span>
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
                <label className="block text-xs text-gray-400 mb-1">Revenu mensuel cible</label>
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
            <p className="text-tiny text-gray-500 italic">
              💡 Ces valeurs sont la source de vérité unique. Les onglets Retraite/Futur
              les lisent depuis ici — plus de duplication.
            </p>
          </div>
        </Card>

        {/* Phase C.2 — upload IA de relevé de salaire (Vision Claude) */}
        <PayslipUploadCard />

        <Card title="Soldes Initiaux des Comptes">
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Definissez le montant de depart de vos comptes (Chequing, Savings).
              <br /><span className="text-xs text-orange-400">Important : Ces montants definissent le point de depart "Cash".</span>
            </p>

            {Object.keys(knownAccounts).length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.keys(knownAccounts).map(acc => (
                  <div key={acc}>
                    <label className="block text-xs text-gray-400 mb-1">{acc}</label>
                    <input
                      type="number"
                      value={initialBalances[acc] || 0}
                      onChange={(e) => setInitialBalances({ ...initialBalances, [acc]: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-dark border border-border rounded px-3 py-2 text-white focus:border-primary outline-none"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-500 text-sm italic">Aucun compte detecte. Importez des transactions d'abord.</div>
            )}
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card title="Cles API & Services">
            <div className="space-y-4">
              <div data-focus-section="apiKeys-anthropic">
                <label htmlFor="apikey-anthropic" className="block text-sm text-gray-400 mb-1">Anthropic API Key (Claude)</label>
                <input
                  id="apikey-anthropic"
                  type="password"
                  value={apiKeys?.anthropic || ''}
                  onChange={(e) => setApiKeys({ ...apiKeys, anthropic: e.target.value })}
                  className="w-full bg-dark border border-border rounded px-3 py-2 text-white focus:border-primary outline-none"
                  placeholder="sk-ant-..."
                />
                <p className="text-xs text-gray-500 mt-1">Pour Claude Sonnet/Haiku — analyse, catégorisation, vision. Obtenez votre clé sur <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="text-info-400 underline">console.anthropic.com</a></p>
              </div>
              <div data-focus-section="apiKeys-eraContext">
                <label htmlFor="apikey-era" className="block text-sm text-gray-400 mb-1">Era Context Token</label>
                <input
                  id="apikey-era"
                  type="password"
                  value={apiKeys?.eraContext || ''}
                  onChange={(e) => setApiKeys({ ...apiKeys, eraContext: e.target.value })}
                  className="w-full bg-dark border border-border rounded px-3 py-2 text-white focus:border-primary outline-none"
                  placeholder="Token Era Context..."
                />
                <p className="text-xs text-gray-500 mt-1">Pour la synchronisation des transactions via era.app.</p>
              </div>
              <div>
                <label htmlFor="apikey-finnhub" className="block text-sm text-gray-400 mb-1">Finnhub API Key (Données boursières)</label>
                <input
                  id="apikey-finnhub"
                  type="password"
                  value={apiKeys?.finnhub || ''}
                  onChange={(e) => setApiKeys({ ...apiKeys, finnhub: e.target.value })}
                  className="w-full bg-dark border border-border rounded px-3 py-2 text-white focus:border-primary outline-none"
                  placeholder="d12abc..."
                />
                <p className="text-xs text-gray-500 mt-1">
                  §7.F : remplace l'ancien Google Sheet hardcodé. Quotes + historique + profils
                  d'actifs à jour quotidiennement via <a href="https://finnhub.io/register" target="_blank" rel="noopener noreferrer" className="text-info-400 underline">finnhub.io</a> (gratuit, 60 req/min).
                  Optionnel : sans clé, fallback sur le Google Sheet legacy.
                </p>
              </div>
              <div className="p-3 bg-info-bg rounded border border-info-border mt-4">
                <div className="text-xs text-info-400 font-bold mb-1">ℹ️ Source de données actives</div>
                <p className="text-tiny text-gray-400">
                  {apiKeys?.finnhub
                    ? <>Finnhub configuré → quotes/profils dynamiques. Google Sheet en fallback.</>
                    : <>Google Sheet uniquement (mode legacy). Ajoutez une clé Finnhub pour des données dynamiques.</>
                  }
                </p>
              </div>
            </div>
          </Card>

          <Card title="⚙️ Configuration Utilisateurs (Salaires & Macro)">

            <div className="mb-6 bg-black/30 p-4 rounded-xl border border-white/5 shadow-inner">
              <h3 className="text-sm font-bold text-white mb-3">💾 Profils Enregistres</h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {savedProfiles.length === 0 && <span className="text-xs text-gray-500 italic">Aucun profil enregistre.</span>}
                {savedProfiles.map(p => (
                  <div key={p} className="flex items-center bg-primary/20 text-blue-300 text-xs px-3 py-1.5 rounded-full border border-primary/30">
                    <span className="font-bold cursor-pointer" onClick={() => loadProfile(p)}>{p}</span>
                    <button
                      onClick={() => deleteProfile(p)}
                      className={`ml-2 font-bold px-1.5 rounded ${profileToDelete === p ? 'bg-red-500 text-white' : 'text-white/50 hover:text-red-400'}`}
                      title={profileToDelete === p ? "Cliquez encore pour confirmer" : "Supprimer"}
                      aria-label={profileToDelete === p ? "Confirmer la suppression" : `Supprimer le profil ${p}`}
                    >
                      {profileToDelete === p ? 'Sur?' : '×'}
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nom du profil (ex: Marc & Anna 2026)"
                  value={newProfileName}
                  onChange={e => setNewProfileName(e.target.value)}
                  className="flex-1 bg-white/5 border border-border rounded px-3 py-1.5 text-sm text-white"
                />
                <button onClick={saveProfile} className="bg-primary text-white px-4 py-1.5 rounded text-sm font-bold hover:brightness-110">
                  Sauvegarder
                </button>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Utilisateurs</h3>
                <div className="flex gap-2">
                  {config.users.length > 1 && (
                    <button
                      onClick={() => {
                        const newUsers = [...config.users];
                        newUsers.pop();
                        setConfig({ ...config, users: newUsers as [any, any] });
                      }}
                      className="bg-red-900/40 text-red-300 px-3 py-1 rounded text-xs hover:bg-red-900/60"
                    >
                      - Retirer conjoint
                    </button>
                  )}
                  {config.users.length < 2 && (
                    <button
                      onClick={() => {
                        const newUsers = [...config.users, { name: "Conjoint(e)", age: 30, grossSalary: 0, netSalary: 0, canadaArrivalYear: new Date().getFullYear() - 5, color: '#ec4899' }];
                        setConfig({ ...config, users: newUsers as [any, any] });
                      }}
                      className="bg-green-900/40 text-green-300 px-3 py-1 rounded text-xs hover:bg-green-900/60"
                    >
                      + Ajouter conjoint
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {config.users.map((user, idx) => (
                  <div
                    key={idx}
                    data-focus-section={`profile-user${idx + 1}-card`}
                    className="space-y-2 p-3 bg-white/5 rounded border border-border"
                  >
                    <div className="font-bold text-white mb-2 border-b border-white/5 pb-1">Utilisateur {idx + 1}</div>
                    <div data-focus-section={`profile-user${idx + 1}-name`}>
                      <label className="text-xs text-gray-400">Nom</label>
                      <input
                        type="text"
                        value={user.name}
                        onChange={(e) => {
                          const newUsers = [...config.users] as [any, any];
                          newUsers[idx] = { ...user, name: e.target.value };
                          setConfig({ ...config, users: newUsers });
                        }}
                        className="w-full bg-dark border border-border rounded px-2 py-1 text-sm text-white"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div data-focus-section={`profile-user${idx + 1}-age`}>
                        <label className="text-xs text-gray-400">Age actuel</label>
                        <input
                          type="number"
                          value={user.age || 30}
                          onChange={(e) => {
                            const newUsers = [...config.users] as [any, any];
                            newUsers[idx] = { ...user, age: parseInt(e.target.value) || 30 };
                            setConfig({ ...config, users: newUsers });
                          }}
                          className="w-full bg-dark border border-border rounded px-2 py-1 text-sm text-white font-mono"
                          min={18} max={80}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-orange-300">Arrivee au Canada</label>
                        <input
                          type="number"
                          value={user.canadaArrivalYear || new Date().getFullYear() - 5}
                          onChange={(e) => {
                            const newUsers = [...config.users] as [any, any];
                            newUsers[idx] = { ...user, canadaArrivalYear: parseInt(e.target.value) || 2020 };
                            setConfig({ ...config, users: newUsers });
                          }}
                          className="w-full bg-dark border border-border rounded px-2 py-1 text-sm text-white font-mono"
                          min={2009} max={new Date().getFullYear()}
                          placeholder="ex: 2020"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div data-focus-section={`profile-user${idx + 1}-grossSalary`}>
                        <label className="text-xs text-gray-400 font-bold text-green-300">Salaire Brut ($)</label>
                        <input
                          type="number"
                          value={user.grossSalary || 0}
                          onChange={(e) => {
                            const newUsers = [...config.users] as [any, any];
                            newUsers[idx] = { ...user, grossSalary: parseFloat(e.target.value) || 0 };
                            setConfig({ ...config, users: newUsers });
                          }}
                          className="w-full bg-dark border border-border rounded px-2 py-1 text-sm text-white font-mono"
                        />
                      </div>
                      <div data-focus-section={`profile-user${idx + 1}-netSalary`}>
                        <label className="text-xs text-gray-400 font-bold text-blue-300">Salaire Net ($)</label>
                        <input
                          type="number"
                          value={user.netSalary || user.salary || 0}
                          onChange={(e) => {
                            const newUsers = [...config.users] as [any, any];
                            newUsers[idx] = { ...user, netSalary: parseFloat(e.target.value) || 0 };
                            setConfig({ ...config, users: newUsers });
                          }}
                          className="w-full bg-dark border border-border rounded px-2 py-1 text-sm text-white font-mono"
                        />
                      </div>
                    </div>

                    <div className="pt-2 border-t border-white/5 space-y-2">
                      <div className="text-tiny text-gray-500 font-black uppercase tracking-widest">Options Fiscales</div>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={!user.hasOwnedPropertyLast4Years}
                            onChange={(e) => {
                              const newUsers = [...config.users] as [any, any];
                              newUsers[idx] = { ...user, hasOwnedPropertyLast4Years: !e.target.checked };
                              setConfig({ ...config, users: newUsers });
                            }}
                            className="w-3 h-3 rounded border-gray-600 bg-black text-blue-500 focus:ring-blue-500/50"
                          />
                          <span className="text-tiny text-gray-400 group-hover:text-blue-400 transition-colors">Premier Acheteur (CELIAPP)</span>
                        </label>
                      </div>

                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={user.hasChildren}
                            onChange={(e) => {
                              const newUsers = [...config.users] as [any, any];
                              newUsers[idx] = { ...user, hasChildren: e.target.checked };
                              setConfig({ ...config, users: newUsers });
                            }}
                            className="w-3 h-3 rounded border-gray-600 bg-black text-blue-500 focus:ring-blue-500/50"
                          />
                          <span className="text-tiny text-gray-400 group-hover:text-pink-400 transition-colors">A des enfants (REEE)</span>
                        </label>
                        {user.hasChildren && (
                          <input
                            type="number"
                            value={user.childCount || 1}
                            onChange={(e) => {
                              const newUsers = [...config.users] as [any, any];
                              newUsers[idx] = { ...user, childCount: parseInt(e.target.value) || 1 };
                              setConfig({ ...config, users: newUsers });
                            }}
                            className="w-12 bg-black/40 border border-white/10 rounded px-1.5 py-0.5 text-tiny text-white font-mono text-center"
                            min={1} max={10}
                          />
                        )}
                      </div>

                      <div className="flex items-center gap-2 bg-black/20 p-1.5 rounded border border-white/5">
                        <span className="text-tiny text-gray-400 uppercase font-black shrink-0">FE ⚖️</span>
                        <input
                          type="number"
                          placeholder="Facteur Equiv. (ex: 0)"
                          value={user.facteurEquivalence ?? 0}
                          onChange={(e) => {
                            const newUsers = [...config.users] as [any, any];
                            newUsers[idx] = { ...user, facteurEquivalence: parseFloat(e.target.value) || 0 };
                            setConfig({ ...config, users: newUsers });
                          }}
                          className="w-full bg-transparent border-none text-tiny text-white font-mono focus:ring-0 text-right p-0"
                        />
                      </div>
                    </div>

                    {/* W5.1 — Profil détaillé (santé, carrière, identité) */}
                    <details className="mt-3 pt-3 border-t border-white/5">
                      <summary className="text-tiny font-bold text-gray-300 cursor-pointer hover:text-white">🩺 Profil détaillé (santé, carrière, identité)</summary>
                      <div className="mt-2 space-y-2">
                        <div className="grid grid-cols-3 gap-1">
                          <select
                            value={user.gender ?? ''}
                            onChange={e => { const u=[...config.users] as [any,any]; u[idx]={...user,gender:e.target.value||undefined}; setConfig({...config,users:u}); }}
                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white"
                          >
                            <option value="">Sexe</option><option value="M">Homme</option><option value="F">Femme</option><option value="X">Autre</option>
                          </select>
                          <select
                            value={user.province ?? ''}
                            onChange={e => { const u=[...config.users] as [any,any]; u[idx]={...user,province:e.target.value||undefined}; setConfig({...config,users:u}); }}
                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white"
                          >
                            <option value="">Province</option>
                            <option value="QC">Québec</option><option value="ON">Ontario</option><option value="AB">Alberta</option>
                            <option value="BC">C.-B.</option><option value="MB">Manitoba</option><option value="SK">Saskatchewan</option>
                            <option value="NS">N.-É.</option><option value="NB">N.-B.</option><option value="NL">T.-N.</option>
                            <option value="PE">Î.-P.-É.</option><option value="YT">Yukon</option><option value="NT">T.-N.-O.</option><option value="NU">Nunavut</option>
                          </select>
                          <select
                            value={user.citizenship ?? ''}
                            onChange={e => { const u=[...config.users] as [any,any]; u[idx]={...user,citizenship:e.target.value||undefined}; setConfig({...config,users:u}); }}
                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white"
                          >
                            <option value="">Citoyenneté</option><option value="CA">Canadien</option><option value="US-person-CA">Dual CA/US (PFIC!)</option><option value="other">Autre</option>
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <select
                            value={user.maritalStatus ?? ''}
                            onChange={e => { const u=[...config.users] as [any,any]; u[idx]={...user,maritalStatus:e.target.value||undefined}; setConfig({...config,users:u}); }}
                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white"
                          >
                            <option value="">Statut civil</option>
                            <option value="single">Célibataire</option><option value="married">Marié</option><option value="common-law">Conjoint de fait</option>
                            <option value="separated">Séparé</option><option value="divorced">Divorcé</option><option value="widowed">Veuf</option>
                          </select>
                          <select
                            value={user.employmentType ?? ''}
                            onChange={e => { const u=[...config.users] as [any,any]; u[idx]={...user,employmentType:e.target.value||undefined}; setConfig({...config,users:u}); }}
                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white"
                          >
                            <option value="">Type emploi</option>
                            <option value="employee">Employé</option><option value="self-employed">Autonome</option>
                            <option value="contractor">Contractuel</option><option value="business-owner">Entrepreneur</option>
                            <option value="unemployed">Sans emploi</option><option value="retired">Retraité</option><option value="student">Étudiant</option>
                          </select>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          <select value={user.industry ?? ''}
                            onChange={e => { const u=[...config.users] as [any,any]; u[idx]={...user,industry:e.target.value || undefined}; setConfig({...config,users:u}); }}
                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white">
                            <option value="">Industrie...</option>
                            <option value="tech">Tech</option><option value="finance">Finance</option><option value="health">Santé</option>
                            <option value="public-sector">Secteur public</option><option value="education">Éducation</option>
                            <option value="construction">Construction</option><option value="retail">Commerce</option>
                            <option value="manufacturing">Manufacture</option><option value="energy">Énergie</option>
                            <option value="transportation">Transport</option><option value="agriculture">Agriculture</option>
                            <option value="media">Médias</option><option value="other">Autre</option>
                          </select>
                          <input aria-label="Années d'expérience professionnelle" type="number" placeholder="Ans expérience" value={user.yearsOfExperience ?? ''}
                            onChange={e => { const u=[...config.users] as [any,any]; u[idx]={...user,yearsOfExperience:Number(e.target.value)||undefined}; setConfig({...config,users:u}); }}
                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white" />
                          <select
                            value={user.pensionPlan ?? ''}
                            onChange={e => { const u=[...config.users] as [any,any]; u[idx]={...user,pensionPlan:e.target.value||undefined}; setConfig({...config,users:u}); }}
                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white"
                          >
                            <option value="">Régime retraite</option>
                            <option value="DB">DB (prestations dét.)</option><option value="DC">DC (cotisations dét.)</option>
                            <option value="RPDB">RPDB</option><option value="none">Aucun</option>
                          </select>
                        </div>
                        <div className="text-tiny text-gray-500 uppercase tracking-widest mt-2">Santé & longévité</div>
                        <div className="grid grid-cols-2 gap-1">
                          <select
                            value={user.healthRating ?? ''}
                            onChange={e => { const u=[...config.users] as [any,any]; u[idx]={...user,healthRating:e.target.value||undefined}; setConfig({...config,users:u}); }}
                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white"
                          >
                            <option value="">État santé</option><option value="excellent">Excellent</option><option value="good">Bon</option><option value="average">Moyen</option><option value="poor">Faible</option>
                          </select>
                          <select
                            value={user.activityLevel ?? ''}
                            onChange={e => { const u=[...config.users] as [any,any]; u[idx]={...user,activityLevel:e.target.value||undefined}; setConfig({...config,users:u}); }}
                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white"
                          >
                            <option value="">Activité physique</option><option value="sedentary">Sédentaire</option><option value="light">Légère</option><option value="moderate">Modérée</option><option value="active">Active</option>
                          </select>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          <label className="flex items-center gap-1 text-tiny text-gray-400">
                            <input type="checkbox" checked={user.isSmoker ?? false}
                              onChange={e => { const u=[...config.users] as [any,any]; u[idx]={...user,isSmoker:e.target.checked}; setConfig({...config,users:u}); }} />
                            🚬 Fumeur
                          </label>
                          <input aria-label="Âge au décès de la mère (espérance vie hérédité)" type="number" placeholder="Mère ✝ âge" value={user.parentAgeAtDeath?.mother ?? ''}
                            onChange={e => { const u=[...config.users] as [any,any]; u[idx]={...user, parentAgeAtDeath:{...user.parentAgeAtDeath, mother:Number(e.target.value)||undefined}}; setConfig({...config,users:u}); }}
                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white" />
                          <input aria-label="Âge au décès du père (espérance vie hérédité)" type="number" placeholder="Père ✝ âge" value={user.parentAgeAtDeath?.father ?? ''}
                            onChange={e => { const u=[...config.users] as [any,any]; u[idx]={...user, parentAgeAtDeath:{...user.parentAgeAtDeath, father:Number(e.target.value)||undefined}}; setConfig({...config,users:u}); }}
                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white" />
                        </div>
                        <div className="text-tiny text-gray-500 uppercase tracking-widest mt-2">Rémunération variable</div>
                        <div className="grid grid-cols-3 gap-1">
                          <input aria-label="Bonus en pourcentage du brut" type="number" placeholder="Bonus % brut" value={user.bonusPctOfGross ?? ''}
                            onChange={e => { const u=[...config.users] as [any,any]; u[idx]={...user,bonusPctOfGross:Number(e.target.value)||undefined}; setConfig({...config,users:u}); }}
                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white" />
                          <input aria-label="RSU vesting annuel (dollars)" type="number" placeholder="RSU $/an" value={user.rsuVestingPerYear ?? ''}
                            onChange={e => { const u=[...config.users] as [any,any]; u[idx]={...user,rsuVestingPerYear:Number(e.target.value)||undefined}; setConfig({...config,users:u}); }}
                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white" />
                          <input aria-label="Valeur stock options (dollars)" type="number" placeholder="Stock opts $" value={user.stockOptionsValue ?? ''}
                            onChange={e => { const u=[...config.users] as [any,any]; u[idx]={...user,stockOptionsValue:Number(e.target.value)||undefined}; setConfig({...config,users:u}); }}
                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white" />
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <input aria-label="Revenus secondaires annuels (freelance, etc.)" type="number" placeholder="Side income $/an" value={user.sideIncomeAnnual ?? ''}
                            onChange={e => { const u=[...config.users] as [any,any]; u[idx]={...user,sideIncomeAnnual:Number(e.target.value)||undefined}; setConfig({...config,users:u}); }}
                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white" />
                          <select
                            value={user.payFrequency ?? ''}
                            onChange={e => { const u=[...config.users] as [any,any]; u[idx]={...user,payFrequency:e.target.value||undefined}; setConfig({...config,users:u}); }}
                            className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white"
                          >
                            <option value="">Périodicité paie</option>
                            <option value="weekly">Hebdo (52)</option><option value="biweekly">Bihebdo (26)</option>
                            <option value="semimonthly">Bimensuel (24)</option><option value="monthly">Mensuel (12)</option>
                          </select>
                        </div>
                      </div>
                    </details>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Mode de Repartition</label>
                <select
                  value={config.splitMode}
                  onChange={(e) => setConfig({ ...config, splitMode: e.target.value as any })}
                  className="w-full bg-dark border border-border rounded px-3 py-2 text-white"
                >
                  <option value="prorata">Prorata des Salaires Nets</option>
                  <option value="50/50">50 / 50</option>
                  <option value="custom">Personnalise</option>
                </select>
              </div>
            </div>
          </Card>
        </div>

        {/* W5.4 — Assurances */}
        <InsurancePanel
          policies={insurancePolicies}
          onChange={next => setAppState({ insurancePolicies: next })}
        />

        {/* W5.6 — Immeubles locatifs */}
        <RentalPropertyPanel
          properties={rentalProperties}
          onChange={next => setAppState({ rentalProperties: next })}
        />

        {/* W5.7 — Entreprises privées */}
        <BusinessPanel
          businesses={privateBusinesses}
          onChange={next => setAppState({ privateBusinesses: next })}
        />

        {/* W5.x — Goals cycliques */}
        <CyclicalGoalsPanel
          vehicles={vehicleReplacements}
          renovations={majorRenovations}
          charity={charitableGoals}
          onVehicles={next => setAppState({ vehicleReplacements: next })}
          onRenovations={next => setAppState({ majorRenovations: next })}
          onCharity={next => setAppState({ charitableGoals: next })}
        />


      </div>
    </>
  );
};
