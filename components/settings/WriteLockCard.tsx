import React, { useCallback, useEffect, useState } from 'react';
import { Icon } from '../ui/Icon';
import { Card } from '../ui/Card';
import { showToast } from '../ui/Toast';
import { isGoogleAuthConfigured, getValidAccessToken } from '../../services/googleDrive/gisAuth';
import { activerEcriture, desactiverEcriture, lireEtatEcriture } from '../../services/googleDrive/writeLock';

/**
 * [VERROU-ECRITURE] Étape 2 — carte « Écritures MCP » (Réglages, à côté de la synchro Google Drive).
 * SEUL endroit qui peut autoriser les écritures du connecteur claude.ai : aucun outil MCP n'a de
 * moyen d'atteindre ce bouton (voir mcp/drive/writeLockStore.ts, lecture seule côté serveur).
 *
 * Par défaut (aucun fichier de verrou, ou lecture en échec) : affiché « verrouillé ». Un document
 * piégé importé dans une conversation claude.ai ne peut JAMAIS activer ce bouton lui-même.
 *
 * Ship dark comme GoogleDriveSyncCard : masquée tant que le Client ID OAuth n'est pas configuré.
 */

const DUREES_MIN = [15, 30, 60] as const;

function formatHeure(iso: string): string {
    try {
        return new Date(iso).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '—';
    }
}

/** Rafraîchissement périodique de l'affichage (pas un mécanisme de sécurité : le serveur MCP relit
 *  Drive lui-même à chaque appel d'outil, cette carte n'affiche qu'un état informatif). */
const RAFRAICHISSEMENT_MS = 30_000;

export const WriteLockCard: React.FC = () => {
    const [deverrouilleJusqua, setDeverrouilleJusqua] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [chargement, setChargement] = useState(true);

    const rafraichir = useCallback(async () => {
        try {
            const token = await getValidAccessToken();
            const etat = await lireEtatEcriture(token);
            setDeverrouilleJusqua(etat.deverrouilleJusqua);
        } catch {
            // Pas connecté, ou lecture en échec : affiché comme verrouillé (cohérent avec le
            // comportement échec-fermé du serveur MCP — ce n'est qu'un affichage informatif ici).
            setDeverrouilleJusqua(null);
        } finally {
            setChargement(false);
        }
    }, []);

    useEffect(() => {
        if (!isGoogleAuthConfigured()) return;
        void rafraichir();
        const id = setInterval(() => void rafraichir(), RAFRAICHISSEMENT_MS);
        return () => clearInterval(id);
    }, [rafraichir]);

    if (!isGoogleAuthConfigured()) return null; // ship dark, comme GoogleDriveSyncCard

    const ouvert = deverrouilleJusqua !== null && Date.parse(deverrouilleJusqua) > Date.now();

    const onAutoriser = async (minutes: number): Promise<void> => {
        setBusy(true);
        try {
            const token = await getValidAccessToken();
            await activerEcriture(minutes, token);
            await rafraichir();
            showToast(`Écritures autorisées pendant ${minutes} min.`, 'success');
        } catch {
            showToast("Impossible d'autoriser les écritures (connecte Google Drive d'abord).", 'error');
        } finally {
            setBusy(false);
        }
    };

    const onVerrouiller = async (): Promise<void> => {
        setBusy(true);
        try {
            const token = await getValidAccessToken();
            await desactiverEcriture(token);
            await rafraichir();
            showToast('Écritures verrouillées.', 'info');
        } catch {
            showToast('Impossible de verrouiller (connecte Google Drive d\'abord).', 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card icon={<Icon name="lock" size={18} />} title="Écritures MCP">
            <div className="space-y-3">
                <p className="text-tiny text-ink-300 leading-snug">
                    Par défaut, le connecteur claude.ai ne peut RIEN écrire dans tes finances — même avec ton
                    accord dans la conversation. Autorise une fenêtre courte ICI, depuis cet écran, juste avant
                    de demander une importation.
                </p>

                {chargement ? (
                    <div className="text-tiny text-ink-400">…</div>
                ) : ouvert ? (
                    <div className="space-y-2">
                        <div className="text-meta text-emerald-300 font-medium">
                            Déverrouillé jusqu'à {formatHeure(deverrouilleJusqua as string)}
                        </div>
                        <button
                            onClick={onVerrouiller}
                            disabled={busy}
                            className="px-3 py-1.5 rounded-card bg-rose-500/10 border border-rose-500/30 text-rose-300 text-meta font-medium hover:bg-rose-500/20 disabled:opacity-50"
                        >
                            {busy ? '…' : 'Verrouiller maintenant'}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <div className="text-meta text-ink-200 font-medium">Verrouillé (comportement par défaut)</div>
                        <div className="flex flex-wrap gap-2">
                            {DUREES_MIN.map((min) => (
                                <button
                                    key={min}
                                    onClick={() => void onAutoriser(min)}
                                    disabled={busy}
                                    className="px-3 py-1.5 rounded-card bg-primary/15 border border-primary/40 text-primary text-meta font-medium hover:bg-primary/25 disabled:opacity-50"
                                >
                                    {busy ? '…' : `Autoriser ${min} min`}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </Card>
    );
};
