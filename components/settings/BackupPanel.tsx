import React, { useRef } from 'react';
import { z } from 'zod';
import { Card } from '../ui/Card';
import { showToast } from '../ui/Toast';
import { downloadBackup, readBackupFile, defaultBackupFilename, CloudBackupError } from '../../services/cloudBackup';

export const BackupSchema = z.object({
  version: z.string().optional(),
  timestamp: z.number().optional(),
  apiKeys: z.object({
    gemini: z.string().optional(),
    eraContext: z.string().optional(),
    lunchMoney: z.string().optional(),
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
  insurancePolicies: z.array(z.unknown()).optional(),
  rentalProperties: z.array(z.unknown()).optional(),
  privateBusinesses: z.array(z.unknown()).optional(),
  vehicleReplacements: z.array(z.unknown()).optional(),
  majorRenovations: z.array(z.unknown()).optional(),
  charitableGoals: z.array(z.unknown()).optional(),
  aiConversation: z.array(z.unknown()).optional(),
}).passthrough().refine(
  (data) => data.version !== undefined || data.transactions !== undefined,
  { message: "doit contenir au moins 'version' ou 'transactions'" }
);

export type BackupData = z.infer<typeof BackupSchema>;

interface BackupPanelProps {
  buildPayload: () => object;
}

export const BackupPanel: React.FC<BackupPanelProps> = ({ buildPayload }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const encryptedFileRef = useRef<HTMLInputElement>(null);

  const [showExportEncModal, setShowExportEncModal] = React.useState(false);
  const [exportPassphrase, setExportPassphrase] = React.useState('');
  const [exportPassphraseConfirm, setExportPassphraseConfirm] = React.useState('');
  const [encryptedFile, setEncryptedFile] = React.useState<File | null>(null);
  const [importPassphrase, setImportPassphrase] = React.useState('');
  const [encWorking, setEncWorking] = React.useState(false);
  const [pendingRestoreData, setPendingRestoreData] = React.useState<BackupData | null>(null);
  const [restoreConfirmPhrase, setRestoreConfirmPhrase] = React.useState('');

  const handleExport = () => {
    const { apiKeys: _stripped, ...dataWithoutKeys } = buildPayload() as { apiKeys: unknown };
    const blob = new Blob([JSON.stringify(dataWithoutKeys, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financeai_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    showToast("Sauvegarde téléchargée (clés API exclues — utilise l'export chiffré pour les inclure).", "info");
  };

  const doEncryptedExport = async () => {
    if (exportPassphrase.length < 12) {
      showToast("Passphrase trop courte (min 12 caractères pour résister au brute-force).", "error");
      return;
    }
    if (exportPassphrase !== exportPassphraseConfirm) {
      showToast("Les deux passphrases ne correspondent pas.", "error");
      return;
    }
    setEncWorking(true);
    try {
      const { apiKeys: _stripped, ...payloadWithoutKeys } = buildPayload() as { apiKeys: unknown };
      await downloadBackup(payloadWithoutKeys, exportPassphrase, defaultBackupFilename());
      showToast("✅ Sauvegarde chiffrée téléchargée. Conserve la passphrase précieusement.", "success");
      setShowExportEncModal(false);
      setExportPassphrase('');
      setExportPassphraseConfirm('');
    } catch (e) {
      const msg = e instanceof CloudBackupError ? e.message : (e as Error).message;
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
      setPendingRestoreData(parsed.data);
    } catch (e) {
      const msg = e instanceof CloudBackupError ? e.message : (e as Error).message;
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
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'inconnu';
        showToast(`❌ Echec lecture : ${msg}`, "error");
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

    const safeSet = (key: string, val: unknown) => {
      if (val !== undefined && val !== null) {
        localStorage.setItem(key, JSON.stringify(val));
      }
    };

    // C5 fix : apiKeys n'est plus inclus dans les backups par défaut (sécurité).
    // Si un ancien backup contient des apiKeys (version <= 3.1), on les
    // restaure quand même pour rétrocompatibilité. Sinon, l'utilisateur doit
    // les re-saisir (toast affiché plus bas).
    if (data.apiKeys) safeSet('app_api_keys', data.apiKeys);
    safeSet('app_config', data.config);
    safeSet('app_budget', data.budgetItems);
    safeSet('initial_balances', data.initialBalances);
    safeSet('app_assets', data.assets);
    safeSet('app_savings_goals', data.savingsGoals);
    safeSet('app_travel_goals', data.travelGoals);
    safeSet('app_debts', data.debts ?? []);
    safeSet('app_investment_acc', data.investmentAccounts ?? []);
    safeSet('app_investment_tx', data.investmentTransactions ?? []);
    safeSet('app_life_events', data.lifeEvents ?? []);
    safeSet('app_financial_goals', data.financialGoals ?? []);
    safeSet('app_retirement_goal', data.retirementGoal);
    safeSet('app_real_estate_goals', data.realEstateGoals);
    safeSet('app_child_goal', data.childGoal);
    if (data.childGoals) safeSet('app_child_goals', data.childGoals);
    if (data.projection) safeSet('app_projection', data.projection);
    safeSet('cached_transactions', data.transactions ?? []);
    safeSet('app_insurance_policies', data.insurancePolicies);
    safeSet('app_rental_properties', data.rentalProperties);
    safeSet('app_private_businesses', data.privateBusinesses);
    safeSet('app_vehicle_replacements', data.vehicleReplacements);
    safeSet('app_major_renovations', data.majorRenovations);
    safeSet('app_charitable_goals', data.charitableGoals);

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
                <label htmlFor="backup-export-passphrase" className="block text-xs text-gray-400 mb-1">Passphrase (min 8 caractères)</label>
                <input
                  id="backup-export-passphrase"
                  type="password"
                  value={exportPassphrase}
                  onChange={e => setExportPassphrase(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-primary outline-none font-mono"
                  autoFocus
                  disabled={encWorking}
                />
              </div>
              <div>
                <label htmlFor="backup-export-confirm" className="block text-xs text-gray-400 mb-1">Confirmation</label>
                <input
                  id="backup-export-confirm"
                  type="password"
                  value={exportPassphraseConfirm}
                  onChange={e => setExportPassphraseConfirm(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doEncryptedExport()}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-primary outline-none font-mono"
                  disabled={encWorking}
                />
                {exportPassphrase && exportPassphraseConfirm && exportPassphrase !== exportPassphraseConfirm && (
                  <p className="text-tiny text-red-400 mt-1">Les deux passphrases ne correspondent pas.</p>
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

      {/* Modal Import chiffré */}
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
              <label htmlFor="backup-import-passphrase" className="block text-xs text-gray-400 mb-2">Passphrase</label>
              <input
                id="backup-import-passphrase"
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

      {/* Modal confirmation restauration */}
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
                  <p>Transactions : <span className="text-white font-mono">{(pendingRestoreData.transactions as unknown[])?.length ?? 0}</span></p>
                  <p>Actifs : <span className="text-white font-mono">{(pendingRestoreData.assets as unknown[])?.length ?? 0}</span></p>
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

      <Card title="Zone de Sauvegarde (Full Backup)" className="border border-green-900/30 bg-green-900/10">
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="text-sm text-gray-400">
              <p className="font-bold text-white mb-1">📄 JSON en clair</p>
              <p className="text-xs">Sauvegarde lisible (debugging, audit). À conserver localement uniquement — ne contient pas les clés API.</p>
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
    </>
  );
};
