
import React, { useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { calculateFiscalReport, calculateGrossFromNet } from '../services/tax';
import { Card } from './ui/Card';
import { AppState, BudgetCategory, Transaction, Asset, SavingsGoal, TravelGoal, Debt, InvestmentAccount, InvestmentTransaction, LifeEvent, RetirementGoal, FinancialGoal, RealEstateGoal, BudgetConfig } from '../types';
import { showToast } from './ui/Toast';

interface SettingsProps {
  apiKeys: AppState['apiKeys'];
  setApiKeys: (keys: AppState['apiKeys']) => void;
  config: AppState['config'];
  setConfig: (c: AppState['config']) => void;
  budgetItems: BudgetCategory[];
  setBudgetItems: (items: BudgetCategory[]) => void;
  onImportData: (data: string) => void;
  initialBalances: Record<string, number>;
  setInitialBalances: (balances: Record<string, number>) => void;
  transactions: Transaction[];
  setTransactions?: (t: Transaction[]) => void;
  assets: Asset[];
  setAssets: (assets: Asset[]) => void;
  savingsGoals: SavingsGoal[];
  setSavingsGoals: (goals: SavingsGoal[]) => void;
  travelGoals: TravelGoal[];
  setTravelGoals: (goals: TravelGoal[]) => void;
  debts?: Debt[];
  setDebts?: (d: Debt[]) => void;
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const knownAccounts = React.useMemo(() => {
    const accs: Record<string, boolean> = {};
    transactions.forEach(t => {
      if (t.accountName && t.accountName !== 'Unknown') accs[t.accountName] = true;
    });
    Object.keys(initialBalances).forEach(k => accs[k] = true);
    return accs;
  }, [transactions, initialBalances]);

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
    } catch (err: any) {
      console.error("[Settings] Profile load error:", err);
      showToast(`Erreur sur "${name}": ${err?.message || 'inconnu'}`, "error");
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

  const handleExport = () => {
    const data = {
      version: "3.0",
      timestamp: Date.now(),
      apiKeys,
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
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financeai_FULL_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (ev) => {
      try {
        const jsonStr = ev.target?.result as string;
        if (!jsonStr) throw new Error("Fichier vide");

        const data = JSON.parse(jsonStr);

        if (!data.version && !data.transactions) {
          showToast("❌ Fichier invalide. Ce n'est pas une sauvegarde FinanceAI.", "error");
          return;
        }

        const txCount = Array.isArray(data.transactions) ? data.transactions.length : 0;
        const assetCount = Array.isArray(data.assets) ? data.assets.length : 0;

        if (confirm(`⚠️ RESTAURATION COMPLETE\n\nVersion Backup: ${data.version || 'Inconnue'}\nTransactions: ${txCount}\nActifs: ${assetCount}\n\nCela va ECRASER toutes les donnees actuelles. Continuer ?`)) {

          localStorage.clear();

          const safeSet = (key: string, val: any) => {
            if (val !== undefined && val !== null) {
              localStorage.setItem(key, JSON.stringify(val));
            }
          };

          // Phase securite C1 : on n'ecrit PLUS lm_token et gemini_key
          // en clair lors du restore. Le user doit les re-saisir via les
          // champs Cles API dans Settings apres restore. Le bloc apiKeys
          // est exclu du persist Zustand (commit e7aaad6f).
          safeSet('app_api_keys', data.apiKeys);

          safeSet('app_config', data.config);
          safeSet('app_budget', data.budgetItems);
          safeSet('initial_balances', data.initialBalances);
          safeSet('app_assets', data.assets);
          safeSet('app_savings_goals', data.savingsGoals);
          safeSet('app_travel_goals', data.travelGoals);
          safeSet('app_debts', data.debts || []);
          safeSet('app_investment_acc', data.investmentAccounts || []);
          safeSet('app_investment_tx', data.investmentTransactions || []);
          safeSet('app_life_events', data.lifeEvents || []);
          safeSet('app_financial_goals', data.financialGoals || []);
          safeSet('app_retirement_goal', data.retirementGoal);
          safeSet('app_real_estate_goals', data.realEstateGoals);
          safeSet('app_child_goal', data.childGoal);
          if (data.childGoals) safeSet('app_child_goals', data.childGoals);

          if (data.projection) safeSet('app_projection', data.projection);
          safeSet('cached_transactions', data.transactions || []);

          showToast("✅ Restauration reussie ! Re-entrez vos cles API si necessaire.", "success");
          window.location.reload();
        }
      } catch (err: any) {
        console.error('[Settings] Restore failed:', err);
        showToast(`❌ Echec restauration : ${err?.message || 'inconnu'}`, "error");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">

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
            <div>
              <label className="block text-sm text-gray-400 mb-1">Gemini API Key (IA)</label>
              <input
                type="password"
                value={apiKeys?.gemini || ''}
                onChange={(e) => setApiKeys({ ...apiKeys, gemini: e.target.value })}
                className="w-full bg-dark border border-border rounded px-3 py-2 text-white focus:border-primary outline-none"
                placeholder="AIza..."
              />
              <p className="text-xs text-gray-500 mt-1">Pour l'analyse de documents et la categorisation.</p>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Lunch Money Token</label>
              <input
                type="password"
                value={apiKeys?.lunchMoney || ''}
                onChange={(e) => setApiKeys({ ...apiKeys, lunchMoney: e.target.value })}
                className="w-full bg-dark border border-border rounded px-3 py-2 text-white focus:border-primary outline-none"
                placeholder="Token..."
              />
            </div>
            <div className="p-3 bg-green-900/10 rounded border border-green-500/20 mt-4">
              <div className="text-xs text-green-400 font-bold mb-1">✅ Donnees Boursieres</div>
              <p className="text-[10px] text-gray-400">
                L'application est maintenant connectee a votre <strong>Fichier Maitre (Google Sheet)</strong>. Plus aucune configuration requise !
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
                      // Fix TS2322 : cast vers [User, User] tuple. Note : apres pop()
                      // le tableau a 1 element, mais le type AppState force 2. C'est
                      // une dette technique du modele BudgetConfig (devrait etre User[]).
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
                      // Fix TS2322 : cast vers [User, User] tuple.
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
                <div key={idx} className="space-y-2 p-3 bg-white/5 rounded border border-border">
                  <div className="font-bold text-white mb-2 border-b border-white/5 pb-1">Utilisateur {idx + 1}</div>
                  <div>
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
                    <div>
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
                    <div>
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
                    <div>
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
                    <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Options Fiscales</div>
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
                        <span className="text-[10px] text-gray-400 group-hover:text-blue-400 transition-colors">Premier Acheteur (CELIAPP)</span>
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
                        <span className="text-[10px] text-gray-400 group-hover:text-pink-400 transition-colors">A des enfants (REEE)</span>
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
                          className="w-12 bg-black/40 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white font-mono text-center"
                          min={1} max={10}
                        />
                      )}
                    </div>

                    <div className="flex items-center gap-2 bg-black/20 p-1.5 rounded border border-white/5">
                      <span className="text-[10px] text-gray-400 uppercase font-black shrink-0">FE ⚖️</span>
                      <input
                        type="number"
                        placeholder="Facteur Equiv. (ex: 0)"
                        value={user.facteurEquivalence ?? 0}
                        onChange={(e) => {
                          const newUsers = [...config.users] as [any, any];
                          newUsers[idx] = { ...user, facteurEquivalence: parseFloat(e.target.value) || 0 };
                          setConfig({ ...config, users: newUsers });
                        }}
                        className="w-full bg-transparent border-none text-[10px] text-white font-mono focus:ring-0 text-right p-0"
                      />
                    </div>
                  </div>
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
      </div >

      <Card title="Zone de Sauvegarde (Full Backup)" className="border border-green-900/30 bg-green-900/10">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="text-sm text-gray-400">
            <p>Sauvegardez TOUTES vos donnees. La restauration ecrasera les donnees actuelles.</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg"
            >
              ⬇️ Tout Exporter
            </button>
            <div className="relative">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-bold flex items-center gap-2 border border-white/20"
              >
                ⬆️ Restaurer
              </button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".json"
                onChange={handleRestore}
              />
            </div>
          </div>
        </div>
      </Card>
    </div >
  );
};
