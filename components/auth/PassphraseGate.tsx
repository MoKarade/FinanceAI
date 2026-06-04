// components/auth/PassphraseGate.tsx
//
// Coffre verrouillé : quand un pull Drive trouve un blob CHIFFRÉ (`enc:true`) sans passphrase active,
// l'app affiche CE prompt en PLEIN ÉCRAN, AVANT tout le reste (et avant l'écran d'accueil). C'est le
// « premier message » demandé : on déverrouille avant d'entrer dans l'app. Aucune donnée locale n'est
// touchée tant qu'on n'a pas la bonne passphrase (zéro perte).

import React, { useState } from 'react';
import { showToast } from '../ui/Toast';
import {
    setSyncPassphrase,
    disconnectSync,
    getSyncStatus,
    MIN_PASSPHRASE_LENGTH,
    type SyncStatus,
} from '../../services/sync/syncOrchestrator';

export const PassphraseGate: React.FC<{ status: SyncStatus }> = ({ status }) => {
    const [value, setValue] = useState('');
    const [busy, setBusy] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError(null);
        setBusy(true);
        try {
            const result = await setSyncPassphrase(value);
            if (result === 'too-short') {
                setLocalError(`Passphrase trop courte (minimum ${MIN_PASSPHRASE_LENGTH} caractères).`);
                return;
            }
            setValue('');
            // setSyncPassphrase a re-tenté le pull : succès → needsPassphrase repasse à false (ce gate
            // disparaît tout seul) ; échec → status.error porte le message (passphrase fausse).
            if (getSyncStatus().needsPassphrase) {
                setLocalError(getSyncStatus().error || 'Passphrase incorrecte. Réessaie.');
            } else if (!getSyncStatus().error) {
                showToast('Coffre déverrouillé — données restaurées.', 'success');
            }
        } finally {
            setBusy(false);
        }
    };

    const onSkip = () => {
        // Filet anti-lockout : continuer sans déverrouiller = se déconnecter de Drive. Les données
        // locales restent telles quelles ; on ne pousse rien par-dessus le coffre chiffré.
        disconnectSync();
        showToast('Déconnecté de Drive. Tes données locales sont conservées.', 'info');
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-dark/95 backdrop-blur-sm p-4">
            <form
                onSubmit={onSubmit}
                className="w-full max-w-md space-y-4 rounded-2xl border border-amber-500/30 bg-black/60 p-6 shadow-2xl"
            >
                <div className="text-lg font-bold text-amber-300">🔒 Coffre verrouillé</div>
                <p className="text-sm text-ink-200 leading-snug">
                    La sauvegarde trouvée dans ton Google Drive est <strong>chiffrée</strong>. Saisis ta passphrase
                    pour la déverrouiller et restaurer tes données.
                </p>
                <p className="text-tiny text-ink-400 leading-snug">
                    Tes données <strong>sur cet appareil ne sont pas touchées</strong> tant que la bonne passphrase
                    n'est pas fournie (chiffrement zéro-knowledge — personne ne peut les lire sans elle).
                </p>
                <input
                    type="password"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="Ta passphrase"
                    autoComplete="off"
                    autoFocus
                    className="w-full rounded-card border border-white/10 bg-black/40 px-3 py-2 text-ink-100 placeholder:text-ink-500 focus:border-primary/50 focus:outline-none"
                />
                {(localError || status.error) && (
                    <p className="text-tiny italic text-rose-400">{localError || status.error}</p>
                )}
                <button
                    type="submit"
                    disabled={busy || status.busy || value.length === 0}
                    className="w-full rounded-card border border-primary/40 bg-primary/15 px-4 py-2 font-medium text-primary hover:bg-primary/25 disabled:opacity-50"
                >
                    {busy || status.busy ? 'Déverrouillage…' : 'Déverrouiller'}
                </button>
                <button
                    type="button"
                    onClick={onSkip}
                    disabled={busy || status.busy}
                    className="block w-full text-tiny text-ink-500 underline underline-offset-2 hover:text-ink-300 disabled:opacity-50"
                >
                    Continuer sans déverrouiller (se déconnecter de Drive)
                </button>
            </form>
        </div>
    );
};
