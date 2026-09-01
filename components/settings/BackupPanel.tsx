import React, { useRef } from 'react';
import { z } from 'zod';
import { Card } from '../ui/Card';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import { showToast } from '../ui/Toast';
import { downloadBackup, readBackupFile, defaultBackupFilename, CloudBackupError } from '../../services/cloudBackup';
import { markBackupDone } from '../../services/backupReminder';
import { logAudit } from '../../services/auditLog';
import { MIN_PASSPHRASE_LENGTH } from '../../services/sync/syncOrchestrator';
import { verifierTypesRestaures, messageDeRefusTypes } from '../../services/verifierTypesRestaures';

/**
 * ⚠️ EXPORTÉ pour être testable directement. Monter `BackupPanel` en test tirerait Card, Toast et
 * les services de sauvegarde pour vérifier une règle de validation pure ; le dépôt a déjà tranché ce
 * genre d'arbitrage en scannant le source (`hydrationNet.test.ts`), mais un scan ne prouve pas qu'un
 * backup fautif est REFUSÉ — il prouve qu'un appel est écrit. Ici la règle est testée pour ce
 * qu'elle fait.
 */
export const BackupSchema = z.object({
  version: z.string().optional(),
  timestamp: z.number().optional(),
  apiKeys: z.object({
    gemini: z.string().optional(),
    lunchMoney: z.string().optional(),
  }).optional(),
  config: z.unknown().optional(),
  // Tier 🟡 : au moins « tableau d'objets » (vs z.unknown()) pour les 2 collections les plus
  // lourdes — attrape une corruption grossière (transactions/assets = string/null) sans rejeter
  // un enregistrement valide qui a évolué (passthrough garde les champs inconnus ; les
  // migrations du store gèrent la forme exacte). C'est un chemin de RESTAURATION : on préfère
  // accepter large plutôt que rejeter un backup légitime.
  transactions: z.array(z.object({}).passthrough()).optional(),
  budgetItems: z.array(z.unknown()).optional(),
  assets: z.array(z.object({}).passthrough()).optional(),
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
  // [B2] symétrie de schéma (le chat n'est pas restauré par le backup JSON — cf doRestore — mais
  // un export qui porte ces champs ne doit pas être rejeté à la validation).
  aiConversations: z.array(z.unknown()).optional(),
  activeAiConversationId: z.string().nullable().optional(),
  // [B3+B4] même symétrie : modèle du chat + coût cumulé (finite : jamais d'Infinity dans un $).
  aiChatModel: z.string().optional(),
  aiChatCostUsdTotal: z.number().finite().optional(),
  // S-E : pas de .passthrough() — les clés inconnues sont écartées (strip) au lieu
  // d'être propagées. doRestore ne lit que des clés connues → aucun impact
  // fonctionnel ; on évite de conserver du contenu non validé en mémoire.
}).refine(
  (data) => data.version !== undefined || data.transactions !== undefined,
  { message: "doit contenir au moins 'version' ou 'transactions'" }
).superRefine((data, ctx) => {
  // [BACKUP-SCHEMA-NON-TYPE] La garde de TYPE, posée sur le SCHÉMA et non sur chaque appelant.
  //
  // ⚠️ Elle contredit délibérément la note « Tier 🟡 » ci-dessus (« c'est un chemin de RESTAURATION :
  // on préfère accepter large plutôt que rejeter un backup légitime »), et Marc a tranché dans ce
  // sens le 2026-08-29. La justification d'origine vise la FORME — un enregistrement qui a évolué,
  // des champs inconnus — et elle reste vraie SAUF sur un point, qu'il faut dire plutôt que taire :
  // une chaîne sous une clé que l'app ne connaît pas encore est désormais refusée, donc un backup
  // produit par une version PLUS RÉCENTE et portant un nouveau champ textuel ne se restaurerait pas
  // (`[BACKUP-TEXTE-INCONNU-REFUSE]`, avec le raisonnement complet dans
  // `tests/components/backupSchemaTypes.test.ts`). Cette tolérance ne vaut pas
  // pour le TYPE d'un montant, où « accepter large » veut dire accepter un chiffre FAUX : mesuré,
  // une chaîne dans un montant de projet immobilier fait −52 % de patrimoine final, sans qu'aucune
  // valeur non finie n'apparaisse nulle part.
  //
  // Le contrôle vit ICI plutôt que dans les deux fonctions d'import parce que les deux — fichier
  // clair et fichier chiffré — passent par `BackupSchema.safeParse`. Un point de passage unique se
  // vérifie en comptant les appelants ; ils sont deux, et ils convergent ici.
  const fautifs = verifierTypesRestaures(data);
  if (fautifs.length === 0) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: fautifs[0].chemin.split('.'),
    message: messageDeRefusTypes(fautifs),
  });
});

type BackupData = z.infer<typeof BackupSchema>;

interface BackupPanelProps {
  buildPayload: () => object;
}

export const BackupPanel: React.FC<BackupPanelProps> = ({ buildPayload }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const encryptedFileRef = useRef<HTMLInputElement>(null);
  // [A11Y-MODAL-GUIDE-NODIALOG] Focus initial des trois dialogues de sauvegarde. Ils portaient un
  // `autoFocus` sur leur champ de passphrase ; la primitive `Modal` focalise le bouton ✕ après
  // 50 ms et le leur aurait repris. Le focus initial se DÉCLARE donc, il ne se laisse pas au hasard
  // de l'ordre des effets.
  const exportPassphraseRef = useRef<HTMLInputElement>(null);
  const importPassphraseRef = useRef<HTMLInputElement>(null);
  const restoreConfirmRef = useRef<HTMLInputElement>(null);

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
    markBackupDone();
    showToast("Sauvegarde téléchargée (clés API exclues — utilise l'export chiffré pour les inclure).", "info");
  };

  const doEncryptedExport = async () => {
    if (exportPassphrase.length < MIN_PASSPHRASE_LENGTH) {
      showToast(`Passphrase trop courte (min ${MIN_PASSPHRASE_LENGTH} caractères pour résister au brute-force).`, "error");
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
      markBackupDone();
      showToast("Sauvegarde chiffrée téléchargée. Conserve la passphrase précieusement.", "success");
      setShowExportEncModal(false);
      setExportPassphrase('');
      setExportPassphraseConfirm('');
    } catch (e) {
      const msg = e instanceof CloudBackupError ? e.message : (e as Error).message;
      showToast(`Echec chiffrement : ${msg}`, "error");
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
    if (!encryptedFile || importPassphrase.length < MIN_PASSPHRASE_LENGTH) return;
    setEncWorking(true);
    try {
      const decrypted = await readBackupFile<unknown>(encryptedFile, importPassphrase);
      const parsed = BackupSchema.safeParse(decrypted);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const path = issue.path.length > 0 ? issue.path.join('.') : 'racine';
        showToast(`Backup déchiffré invalide (${path}) : ${issue.message}`, "error");
        return;
      }
      setEncryptedFile(null);
      setImportPassphrase('');
      setRestoreConfirmPhrase('');
      setPendingRestoreData(parsed.data);
    } catch (e) {
      const msg = e instanceof CloudBackupError ? e.message : (e as Error).message;
      showToast(`${msg}`, "error");
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
          showToast(`Backup invalide (${path}) : ${issue.message}`, "error");
          return;
        }
        setRestoreConfirmPhrase('');
        setPendingRestoreData(parsed.data);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'inconnu';
        showToast(`Echec lecture : ${msg}`, "error");
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
    // V1 fix (audit 2026-05-21) : si un ancien backup contient des apiKeys,
    // on NE LES RESTAURE PLUS dans localStorage (où elles seraient en clair).
    // L'utilisateur doit les re-saisir manuellement via Configuration (la
    // clef legacy `app_api_keys` est purgée au prochain boot du store).
    if (data.apiKeys) {
        console.warn('[Restore] apiKeys détectées dans backup mais non restaurées (sécurité V1). Re-saisir manuellement dans Configuration.');
    }
    safeSet('app_config', data.config);
    safeSet('app_budget', data.budgetItems);
    safeSet('initial_balances', data.initialBalances);
    safeSet('app_assets', data.assets);
    // [NAV-REMOVE-OBJECTIFS-TAB] `savingsGoals` retiré du produit — un vieux backup qui en
    // contient encore (schéma toujours `.optional()` ci-dessus pour rester compatible en
    // LECTURE) n'écrit plus la clé legacy : rien ne la relit, la restaurer serait inerte.
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

    // SYS-AUDIT — trace la restauration (écrite APRÈS les writes → survit au reload).
    logAudit({
      field: 'backup',
      operation: 'replace',
      description: `Restauration depuis un backup (${data.transactions?.length ?? 0} transactions)`,
    });
    showToast("Restauration reussie ! Re-entrez vos cles API si necessaire.", "success");
    window.location.reload();
  };

  return (
    <>
      {/* Modal Export chiffré */}
      {showExportEncModal && (
        <Modal
          isOpen
          onClose={() => { if (!encWorking) { setShowExportEncModal(false); setExportPassphrase(''); setExportPassphraseConfirm(''); } }}
          closeOnBackdrop={!encWorking}
          closeOnEsc={!encWorking}
          initialFocusRef={exportPassphraseRef}
          size="md"
          icon={<Icon name="lock" size={22} className="text-ink-300 shrink-0" />}
          title="Sauvegarde Chiffrée"
        >
          <div>
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-1">
                <p className="text-ink-300 text-meta leading-relaxed">
                  Le fichier sera chiffré localement (AES-256-GCM + PBKDF2 600 000 itérations). Conserve la passphrase précieusement — <span className="text-red-300 font-bold">sans elle, le fichier est irrécupérable</span>.
                </p>
              </div>
            </div>
            <div className="space-y-3 mb-5">
              <div>
                <label htmlFor="backup-export-passphrase" className="block text-meta text-ink-300 mb-1">Passphrase (min {MIN_PASSPHRASE_LENGTH} caractères)</label>
                <input
                  id="backup-export-passphrase"
                  type="password"
                  value={exportPassphrase}
                  onChange={e => setExportPassphrase(e.target.value)}
                  ref={exportPassphraseRef}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-body focus:border-primary outline-none font-mono"
                  disabled={encWorking}
                />
              </div>
              <div>
                <label htmlFor="backup-export-confirm" className="block text-meta text-ink-300 mb-1">Confirmation</label>
                <input
                  id="backup-export-confirm"
                  type="password"
                  value={exportPassphraseConfirm}
                  onChange={e => setExportPassphraseConfirm(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doEncryptedExport()}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-body focus:border-primary outline-none font-mono"
                  disabled={encWorking}
                />
                {exportPassphrase && exportPassphraseConfirm && exportPassphrase !== exportPassphraseConfirm && (
                  <p className="text-tiny text-danger-400 mt-1">Les deux passphrases ne correspondent pas.</p>
                )}
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowExportEncModal(false); setExportPassphrase(''); setExportPassphraseConfirm(''); }}
                disabled={encWorking}
                className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-ink-200 hover:text-white hover:bg-white/10 transition-all text-body font-medium disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={doEncryptedExport}
                disabled={encWorking || exportPassphrase.length < MIN_PASSPHRASE_LENGTH || exportPassphrase !== exportPassphraseConfirm}
                className="px-4 py-2 rounded-xl bg-primary hover:bg-success-500 disabled:opacity-40 disabled:cursor-not-allowed text-dark text-body font-bold shadow-lg active:scale-95 transition-all"
              >
                {encWorking ? 'Chiffrement…' : 'Exporter chiffré'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Import chiffré */}
      {encryptedFile && (
        <Modal
          isOpen
          onClose={() => { if (!encWorking) { setEncryptedFile(null); setImportPassphrase(''); } }}
          closeOnBackdrop={!encWorking}
          closeOnEsc={!encWorking}
          initialFocusRef={importPassphraseRef}
          size="md"
          icon={<Icon name="unlock" size={22} className="text-ink-300 shrink-0" />}
          title="Déchiffrer la Sauvegarde"
          subtitle={encryptedFile.name}
        >
          <div>
            <div className="mb-5">
              <label htmlFor="backup-import-passphrase" className="block text-meta text-ink-300 mb-2">Passphrase</label>
              <input
                id="backup-import-passphrase"
                type="password"
                value={importPassphrase}
                onChange={e => setImportPassphrase(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && importPassphrase.length >= MIN_PASSPHRASE_LENGTH && doEncryptedImport()}
                ref={importPassphraseRef}
                className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-body focus:border-primary outline-none font-mono"
                disabled={encWorking}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setEncryptedFile(null); setImportPassphrase(''); }}
                disabled={encWorking}
                className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-ink-200 hover:text-white hover:bg-white/10 transition-all text-body font-medium disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={doEncryptedImport}
                disabled={encWorking || importPassphrase.length < MIN_PASSPHRASE_LENGTH}
                className="px-4 py-2 rounded-xl bg-primary hover:bg-success-500 disabled:opacity-40 disabled:cursor-not-allowed text-dark text-body font-bold shadow-lg active:scale-95 transition-all"
              >
                {encWorking ? 'Déchiffrement…' : 'Déchiffrer'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal confirmation restauration */}
      {pendingRestoreData && (
        <Modal
          isOpen
          onClose={() => { setPendingRestoreData(null); setRestoreConfirmPhrase(''); }}
          initialFocusRef={restoreConfirmRef}
          size="md"
          icon={<Icon name="alert" size={22} className="text-warning-400 shrink-0" />}
          title="Restauration Complète"
        >
          <div>
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-1">
                <div className="text-ink-300 text-body space-y-1 bg-black/30 p-3 rounded-lg mb-3">
                  <p>Version : <span className="text-white font-mono">{String(pendingRestoreData.version ?? 'Inconnue')}</span></p>
                  <p>Transactions : <span className="text-white font-mono">{(pendingRestoreData.transactions as unknown[])?.length ?? 0}</span></p>
                  <p>Actifs : <span className="text-white font-mono">{(pendingRestoreData.assets as unknown[])?.length ?? 0}</span></p>
                </div>
                <p className="text-danger-400 text-meta font-bold leading-relaxed">
                  Toutes les données actuelles seront effacées. Action irréversible.
                </p>
              </div>
            </div>
            <div className="mb-5">
              <label htmlFor="backup-restoreConfirm" className="block text-meta text-ink-300 mb-2">
                Tapez <span className="text-danger-400 font-bold font-mono">RESTAURER</span> pour confirmer :
              </label>
              <input
                id="backup-restoreConfirm"
                type="text"
                value={restoreConfirmPhrase}
                onChange={e => setRestoreConfirmPhrase(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && restoreConfirmPhrase === 'RESTAURER' && doRestore()}
                ref={restoreConfirmRef}
                className="w-full bg-black/50 border border-danger-500/30 rounded-lg px-3 py-2 text-white font-mono text-body focus:border-danger-500 outline-none"
                placeholder="RESTAURER"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setPendingRestoreData(null); setRestoreConfirmPhrase(''); }}
                className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-ink-200 hover:text-white hover:bg-white/10 transition-all text-body font-medium"
              >
                Annuler
              </button>
              <button
                onClick={doRestore}
                disabled={restoreConfirmPhrase !== 'RESTAURER'}
                className="px-4 py-2 rounded-xl bg-danger-600 hover:bg-danger-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-body font-bold shadow-lg active:scale-95 transition-all"
              >
                Restaurer définitivement
              </button>
            </div>
          </div>
        </Modal>
      )}

      <Card title="Zone de Sauvegarde (Full Backup)" className="border border-green-900/30 bg-green-900/10">
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="text-body text-ink-300">
              <p className="font-bold text-white mb-1">JSON en clair</p>
              <p className="text-meta">Sauvegarde lisible (debugging, audit). À conserver localement uniquement — ne contient pas les clés API.</p>
            </div>
            <div className="flex gap-3 flex-shrink-0">
              <button
                onClick={handleExport}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-body font-bold flex items-center gap-2 shadow-lg"
              >
                Exporter JSON
              </button>
              <div className="relative">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-body font-bold flex items-center gap-2 border border-white/20"
                >
                  Restaurer JSON
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
            <div className="text-body text-ink-300">
              <p className="font-bold text-white mb-1">Sauvegarde chiffrée (.bak)</p>
              <p className="text-meta">AES-256-GCM + PBKDF2 600 000 itérations. Stockage cloud safe (Drive, Gist…) car illisible sans passphrase.</p>
            </div>
            <div className="flex gap-3 flex-shrink-0">
              <button
                onClick={() => { setExportPassphrase(''); setExportPassphraseConfirm(''); setShowExportEncModal(true); }}
                className="px-4 py-2 bg-primary hover:bg-success-500 text-dark rounded-lg text-body font-bold flex items-center gap-2 shadow-lg"
              >
                Exporter chiffré
              </button>
              <div className="relative">
                <button
                  onClick={() => encryptedFileRef.current?.click()}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-body font-bold flex items-center gap-2 border border-white/20"
                >
                  Restaurer chiffré
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
