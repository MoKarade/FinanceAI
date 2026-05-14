import React, { useRef } from 'react';
import { z } from 'zod';
import { Card } from './ui/Card';
import { AppState, BudgetCategory, Transaction, Asset, SavingsGoal, TravelGoal, Debt, InvestmentAccount, InvestmentTransaction, LifeEvent, RetirementGoal, FinancialGoal, RealEstateGoal, BudgetConfig } from '../types';
import { showToast } from './ui/Toast';
import { downloadBackup, readBackupFile, defaultBackupFilename, CloudBackupError } from '../services/cloudBackup';

const BackupSchema = z.object({
  version: z.string().optional(),
  timestamp: z.number().optional(),
  apiKeys: z.object({
    gemini: z.string().optional(),
    eraContext: z.string().optional(),
    lunchMoney: z.string().optional(), // backward compat
  }).passthrough().optional(),
  config: z.unknown().optional(),
  transactions: z.array(z.unknown()).optional(),
  budgetItems: z.array(z.unknown()).optional(),
  assets: z.array(z.unknown()).optional(),
  initialBalances: z.record(z.string(), z.number()).optional(),
  savingsGoals: z.array(z.unknown()).optional(),
  travelGoals: z.array(z.unknown()).optional(),
  debts: z.array(z.unknown()).optional(),
  investmentAccounts: z.array(z.unknown()).optional(),
  investmentTransactions: z.array(z.unknown()).optional(),
  lifeEvents: z.array(z.unknown()).optional(),
  retirementGoal: z.unknown().optional(),
  realEstateGoals: z.array(z.unknown()).optional(),
  childGoal: z.unknown().optional(),
  childGoals: z.array(z.unknown()).optional(),
  financialGoals: z.array(z.unknown()).optional(),
  projection: z.unknown().optional(),
}).passthrough().refine(
  (data) => data.version !== undefined || data.transactions !== undefined,
  { message: "doit contenir au moins 'version' ou 'transactions'" }
);

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const encryptedFileRef = useRef<HTMLInputElement>(null);

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

  const [pendingRestoreData, setPendingRestoreData] = React.useState<z.infer<typeof BackupSchema> | null>(null);
  const [restoreConfirmPhrase, setRestoreConfirmPhrase] = React.useState('');

  // -- Sauvegarde chiffrée (AES-256-GCM + PBKDF2 600k) --
  const [showExportEncModal, setShowExportEncModal] = React.useState(false);
  const [exportPassphrase, setExportPassphrase] = React.useState('');
  const [exportPassphraseConfirm, setExportPassphraseConfirm] = React.useState('');
  const [encryptedFile, setEncryptedFile] = React.useState<File | null>(null);
  const [importPassphrase, setImportPassphrase] = React.useState('');
  const [encWorking, setEncWorking] = React.useState(false);

  const buildBackupPayload = () => ({
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
  });

  const handleExport = () => {
    const data = buildBackupPayload();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financeai_FULL_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const doEncryptedExport = async () => {
    if (exportPassphrase.length < 8) {
      showToast("Passphrase trop courte (min 8 caractères).", "error");
      return;
    }
    if (exportPassphrase !== exportPassphraseConfirm) {
      showToast("Les deux passphrases ne correspondent pas.", "error");
      return;
    }
    setEncWorking(true);
    try {
      await downloadBackup(buildBackupPayload(), exportPassphrase, defaultBackupFilename());
      showToast("✅ Sauvegarde chiffrée téléchargée. Conserve la passphrase précieusement.", "success");
      setShowExportEncModal(false);
      setExportPassphrase('');
      setExportPassphraseConfirm('');
    } catch (e) {
      const msg = e instanceof CloudBackupError ? e.message : (e as Error).message;
      console.error('[Settings] Encrypted export error:', e);
      showToast(`❌ Echec chiffrement : ${msg}`, "error");
    } finally {
      setEncWorking(false);
    }
  };

  const handleEncryptedRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setEncryptedFile(file);
    setImportPassphrase('');
  };

  const doEncryptedImport = async () => {
    if (!encryptedFile || importPassphrase.length < 8) return;
    setEncWorking(true);
    try {
      const decrypted = await readBackupFile<unknown>(encryptedFile, importPassphrase);
      const parsed = BackupSchema.safeParse(decrypted);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const path = issue.path.length > 0 ? issue.path.join('.') : 'racine';
        showToast(`❌ Backup déchiffré invalide (${path}) : ${issue.message}`, "error");
        return;
      }
      setEncryptedFile(null);
      setImportPassphrase('');
      setRestoreConfirmPhrase('');
      setPendingRestoreData(parsed.data); // Réutilise le flux de confirmation existant
    } catch (e) {
      const msg = e instanceof CloudBackupError ? e.message : (e as Error).message;
      console.error('[Settings] Encrypted import error:', e);
      showToast(`❌ ${msg}`, "error");
    } finally {
      setEncWorking(false);
    }
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (ev) => {
      try {
        const jsonStr = ev.target?.result as string;
        if (!jsonStr) throw new Error("Fichier vide");

        const rawData = JSON.parse(jsonStr);
        const parsed = BackupSchema.safeParse(rawData);
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          const path = issue.path.length > 0 ? issue.path.join('.') : 'racine';
          showToast(`❌ Backup invalide (${path}) : ${issue.message}`, "error");
          return;
        }

        setRestoreConfirmPhrase('');
        setPendingRestoreData(parsed.data);
      } catch (err: any) {
        console.error('[Settings] Restore parse error:', err);
        showToast(`❌ Echec lecture : ${err?.message || 'inconnu'}`, "error");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const doRestore = () => {
    if (!pendingRestoreData || restoreConfirmPhrase !== 'RESTAURER') return;
    const data = pendingRestoreData;
    setPendingRestoreData(null);
    setRestoreConfirmPhrase('');

    localStorage.clear();

    const safeSet = (key: string, val: any) => {
      if (val !== undefined && val !== null) {
        localStorage.setItem(key, JSON.stringify(val));
      }
    };

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
  };

  return (
    <>
      {/* Modal Export chiffré */}
      {showExportEncModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => !encWorking && setShowExportEncModal(false)}
        >
          <div
            className="bg-[#151922] border border-white/15 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-scale-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="text-2xl mt-0.5">🔐</div>
              <div className="flex-1">
                <h3 className="text-white font-bold text-base mb-2">Sauvegarde Chiffrée</h3>
                <p className="text-gray-400 text-xs leading-relaxed">
                  Le fichier sera chiffré localement (AES-256-GCM + PBKDF2 600 000 itérations). Conserve la passphrase précieusement — <span className="text-red-300 font-bold">sans elle, le fichier est irrécupérable</span>.
                </p>
              </div>
            </div>
            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Passphrase (min 8 caractères)</label>
                <input
                  type="password"
                  value={exportPassphrase}
                  onChange={e => setExportPassphrase(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-primary outline-none font-mono"
                  autoFocus
                  disabled={encWorking}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Confirmation</label>
                <input
                  type="password"
                  value={exportPassphraseConfirm}
                  onChange={e => setExportPassphraseConfirm(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doEncryptedExport()}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-primary outline-none font-mono"
                  disabled={encWorking}
                />
                {exportPassphrase && exportPassphraseConfirm && exportPassphrase !== exportPassphraseConfirm && (
                  <p className="text-[10px] text-red-400 mt-1">Les deux passphrases ne correspondent pas.</p>
                )}
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowExportEncModal(false); setExportPassphrase(''); setExportPassphraseConfirm(''); }}
                disabled={encWorking}
                className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-all text-sm font-medium disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={doEncryptedExport}
                disabled={encWorking || exportPassphrase.length < 8 || exportPassphrase !== exportPassphraseConfirm}
                className="px-4 py-2 rounded-xl bg-primary hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold shadow-lg active:scale-95 transition-all"
              >
                {encWorking ? 'Chiffrement…' : 'Exporter chiffré'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Import chiffré (saisie passphrase) */}
      {encryptedFile && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => !encWorking && setEncryptedFile(null)}
        >
          <div
            className="bg-[#151922] border border-white/15 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-scale-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="text-2xl mt-0.5">🔓</div>
              <div className="flex-1">
                <h3 className="text-white font-bold text-base mb-1">Déchiffrer la Sauvegarde</h3>
                <p className="text-gray-500 text-xs font-mono break-all">{encryptedFile.name}</p>
              </div>
            </div>
            <div className="mb-5">
              <label className="block text-xs text-gray-400 mb-2">Passphrase</label>
              <input
                type="password"
                value={importPassphrase}
                onChange={e => setImportPassphrase(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && importPassphrase.length >= 8 && doEncryptedImport()}
                className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-primary outline-none font-mono"
                autoFocus
                disabled={encWorking}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setEncryptedFile(null); setImportPassphrase(''); }}
                disabled={encWorking}
                className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-all text-sm font-medium disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={doEncryptedImport}
                disabled={encWorking || importPassphrase.length < 8}
                className="px-4 py-2 rounded-xl bg-primary hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold shadow-lg active:scale-95 transition-all"
              >
                {encWorking ? 'Déchiffrement…' : 'Déchiffrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingRestoreData && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => { setPendingRestoreData(null); setRestoreConfirmPhrase(''); }}
        >
          <div
            className="bg-[#151922] border border-white/15 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-scale-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="text-2xl mt-0.5">⚠️</div>
              <div className="flex-1">
                <h3 className="text-white font-bold text-base mb-2">Restauration Complète</h3>
                <div className="text-gray-400 text-sm space-y-1 bg-black/30 p-3 rounded-lg mb-3">
                  <p>Version : <span className="text-white font-mono">{String(pendingRestoreData.version ?? 'Inconnue')}</span></p>
                  <p>Transactions : <span className="text-white font-mono">{(pendingRestoreData.transactions as any[])?.length ?? 0}</span></p>
                  <p>Actifs : <span className="text-white font-mono">{(pendingRestoreData.assets as any[])?.length ?? 0}</span></p>
                </div>
                <p className="text-red-400 text-xs font-bold leading-relaxed">
                  ⛔ Toutes les données actuelles seront effacées. Action irréversible.
                </p>
              </div>
            </div>
            <div className="mb-5">
              <label className="block text-xs text-gray-400 mb-2">
                Tapez <span className="text-red-400 font-bold font-mono">RESTAURER</span> pour confirmer :
              </label>
              <input
                type="text"
                value={restoreConfirmPhrase}
                onChange={e => setRestoreConfirmPhrase(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && restoreConfirmPhrase === 'RESTAURER' && doRestore()}
                className="w-full bg-black/50 border border-red-500/30 rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-red-500 outline-none"
                placeholder="RESTAURER"
                autoFocus
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setPendingRestoreData(null); setRestoreConfirmPhrase(''); }}
                className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-all text-sm font-medium"
              >
                Annuler
              </button>
              <button
                onClick={doRestore}
                disabled={restoreConfirmPhrase !== 'RESTAURER'}
                className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold shadow-lg active:scale-95 transition-all"
              >
                Restaurer définitivement
              </button>
            </div>
          </div>
        </div>
      )}

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
                <label className="block text-sm text-gray-400 mb-1">Era Context Token</label>
                <input
                  type="password"
                  value={apiKeys?.eraContext || ''}
                  onChange={(e) => setApiKeys({ ...apiKeys, eraContext: e.target.value })}
                  className="w-full bg-dark border border-border rounded px-3 py-2 text-white focus:border-primary outline-none"
                  placeholder="Token Era Context..."
                />
                <p className="text-xs text-gray-500 mt-1">Pour la synchronisation des transactions via era.app.</p>
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
        </div>

        <Card title="Zone de Sauvegarde (Full Backup)" className="border border-green-900/30 bg-green-900/10">
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <div className="text-sm text-gray-400">
                <p className="font-bold text-white mb-1">📄 JSON en clair</p>
                <p className="text-xs">Sauvegarde lisible (debugging, audit). À conserver localement uniquement — contient tes clés API en clair.</p>
              </div>
              <div className="flex gap-3 flex-shrink-0">
                <button
                  onClick={handleExport}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg"
                >
                  ⬇️ Exporter JSON
                </button>
                <div className="relative">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-bold flex items-center gap-2 border border-white/20"
                  >
                    ⬆️ Restaurer JSON
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

            <div className="border-t border-white/5 pt-4 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <div className="text-sm text-gray-400">
                <p className="font-bold text-white mb-1">🔐 Sauvegarde chiffrée (.bak)</p>
                <p className="text-xs">AES-256-GCM + PBKDF2 600 000 itérations. Stockage cloud safe (Drive, Gist…) car illisible sans passphrase.</p>
              </div>
              <div className="flex gap-3 flex-shrink-0">
                <button
                  onClick={() => { setExportPassphrase(''); setExportPassphraseConfirm(''); setShowExportEncModal(true); }}
                  className="px-4 py-2 bg-primary hover:bg-emerald-500 text-white rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg"
                >
                  🔐 Exporter chiffré
                </button>
                <div className="relative">
                  <button
                    onClick={() => encryptedFileRef.current?.click()}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-bold flex items-center gap-2 border border-white/20"
                  >
                    🔓 Restaurer chiffré
                  </button>
                  <input
                    type="file"
                    ref={encryptedFileRef}
                    className="hidden"
                    accept=".bak,application/octet-stream"
                    onChange={handleEncryptedRestoreFile}
                  />
                </div>
              </div>
            </div>
          </div>
        </Card>

      </div>
    </>
  );
};
