// components/settings/PassphraseCreate.tsx
//
// [CHIFFREMENT-PHASE1] Écran de création d'une passphrase de sync (plan §4). Le chemin retiré en
// juin est RÉTABLI ici. 3 étapes, dans l'ordre, aucune ne se saute :
//   1. Saisie + confirmation (force minimale réutilisée de checkPassphrase).
//   2. Avertissement PLEIN ÉCRAN obligatoire à lire + carte imprimable/téléchargeable.
//   3. Case « j'ai conservé une copie hors ligne » — le bouton Activer reste désactivé sans elle (C2).
//
// Le mécanisme de mémorisation par appareil (WebAuthn, §3) est optionnel et proposé à l'étape 3 ;
// son échec (WebAuthn indisponible) N'EMPÊCHE PAS d'activer le chiffrement — la passphrase sera
// simplement redemandée à chaque nouvel appareil/session (comportement déjà existant).

import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import { showToast } from '../ui/Toast';
import {
    MIN_PASSPHRASE_LENGTH,
    validateNewPassphrase,
    peutActiver,
    activerChiffrement,
} from '../../services/passphraseCreate';
import { isPlatformAuthenticatorAvailable } from '../../services/deviceKeyStore';

interface PassphraseCreateProps {
    isOpen: boolean;
    onClose: () => void;
    /** Appelé après une activation réussie (le parent peut rafraîchir son état). */
    onActivated: () => void;
}

type Etape = 1 | 2 | 3;

/** Génère et déclenche le téléchargement d'un fichier texte simple contenant la phrase — AUCUNE
 *  transmission réseau (Blob local, comme un export). Exporté : réutilisé par `GoogleDriveSyncCard`
 *  pour « voir la carte de récupération à nouveau » (régénère l'affichage, ne stocke rien de plus). */
export function telechargerCarte(passphrase: string): void {
    const contenu =
        'FinanceAI — carte de récupération\n' +
        '==================================\n\n' +
        'Phrase secrète (chiffrement de la sauvegarde) :\n\n' +
        `    ${passphrase}\n\n` +
        "Si cette phrase est perdue, tes données synchronisées deviennent définitivement\n" +
        "irrécupérables. Personne — ni Marc via un autre moyen, ni l'agence — ne peut la\n" +
        'retrouver.\n\n' +
        'Range cette carte hors ligne (papier, coffre, gestionnaire de mots de passe).\n' +
        'Générée le ' + new Date().toLocaleString('fr-CA') + '.\n';
    const blob = new Blob([contenu], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'financeai-carte-recuperation.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export const PassphraseCreate: React.FC<PassphraseCreateProps> = ({ isOpen, onClose, onActivated }) => {
    const [etape, setEtape] = useState<Etape>(1);
    const [passphrase, setPassphrase] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [copieHorsLigneConfirmee, setCopieHorsLigneConfirmee] = useState(false);
    const [remember, setRemember] = useState(true);
    const [plateformeDisponible, setPlateformeDisponible] = useState<boolean | null>(null);
    const [busy, setBusy] = useState(false);
    const [erreur, setErreur] = useState<string | null>(null);

    const reinitialiser = (): void => {
        setEtape(1);
        setPassphrase('');
        setConfirmation('');
        setCopieHorsLigneConfirmee(false);
        setRemember(true);
        setPlateformeDisponible(null);
        setErreur(null);
    };

    const fermer = (): void => {
        reinitialiser();
        onClose();
    };

    const validation = validateNewPassphrase(passphrase, confirmation);

    const passerEtape2 = async (): Promise<void> => {
        if (!validation.ok) {
            setErreur(
                validation.reason === 'too-short'
                    ? `Passphrase trop courte (minimum ${MIN_PASSPHRASE_LENGTH} caractères).`
                    : 'Les deux passphrases ne correspondent pas.',
            );
            return;
        }
        setErreur(null);
        setPlateformeDisponible(await isPlatformAuthenticatorAvailable());
        setEtape(2);
    };

    const onActiver = async (): Promise<void> => {
        if (!peutActiver({ passphrase, confirmation, copieHorsLigneConfirmee })) return;
        setBusy(true);
        try {
            const { remembered } = await activerChiffrement(passphrase, { remember: remember && plateformeDisponible === true });
            showToast(
                remembered
                    ? 'Chiffrement activé — phrase mémorisée sur cet appareil (déverrouillage biométrique requis à chaque usage).'
                    : 'Chiffrement activé — la phrase te sera redemandée sur cet appareil (mémorisation non disponible ou non choisie).',
                'success',
            );
            onActivated();
            fermer();
        } catch (err) {
            setErreur(err instanceof Error ? err.message : 'Activation impossible.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={busy ? () => undefined : fermer}
            icon={<Icon name="lock" size={20} />}
            title="Créer une phrase secrète"
            subtitle={`Étape ${etape} sur 3`}
            size="md"
        >
            <div className="p-4 space-y-4">
                {etape === 1 && (
                    <>
                        <p className="text-tiny text-ink-300 leading-snug">
                            Cette phrase chiffre ta sauvegarde Google Drive (AES-256-GCM + PBKDF2 600 000 itérations,
                            zéro-connaissance). Choisis quelque chose que tu retiendras, ou que tu pourras retrouver
                            hors ligne — personne d'autre ne peut la récupérer pour toi.
                        </p>
                        <label htmlFor="pc-passphrase" className="block text-meta text-ink-300">
                            Passphrase (minimum {MIN_PASSPHRASE_LENGTH} caractères)
                        </label>
                        <input
                            id="pc-passphrase"
                            type="password"
                            autoComplete="new-password"
                            autoFocus
                            value={passphrase}
                            onChange={(e) => setPassphrase(e.target.value)}
                            className="w-full rounded-card border border-white/10 bg-black/40 px-3 py-2 text-ink-100 focus:border-primary/50 focus:outline-hidden"
                        />
                        <label htmlFor="pc-confirmation" className="block text-meta text-ink-300">
                            Confirme la passphrase
                        </label>
                        <input
                            id="pc-confirmation"
                            type="password"
                            autoComplete="new-password"
                            value={confirmation}
                            onChange={(e) => setConfirmation(e.target.value)}
                            className="w-full rounded-card border border-white/10 bg-black/40 px-3 py-2 text-ink-100 focus:border-primary/50 focus:outline-hidden"
                        />
                        {erreur && <p className="text-tiny italic text-rose-400">{erreur}</p>}
                        <button
                            onClick={() => void passerEtape2()}
                            disabled={!validation.ok}
                            className="w-full rounded-card border border-primary/40 bg-primary/15 px-4 py-2 font-medium text-primary hover:bg-primary/25 disabled:opacity-50"
                        >
                            Continuer
                        </button>
                    </>
                )}

                {etape === 2 && (
                    <>
                        <div className="p-3 rounded-card bg-rose-500/10 border border-rose-500/30 space-y-2">
                            <p className="text-meta font-semibold text-rose-300">À lire avant de continuer</p>
                            <p className="text-tiny text-ink-200 leading-snug">
                                Si cette phrase est perdue, tes données synchronisées deviennent{' '}
                                <strong>définitivement irrécupérables</strong>. Personne — ni Marc via un autre moyen,
                                ni l'agence — ne peut la retrouver.
                            </p>
                        </div>
                        <div className="p-3 rounded-card border border-white/10 bg-black/30 font-mono text-center text-ink-100 select-all break-all">
                            {passphrase}
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => telechargerCarte(passphrase)}
                                className="flex-1 rounded-card border border-white/40 bg-white/5 px-3 py-2 text-meta font-medium text-ink-200 hover:bg-white/10"
                            >
                                Télécharger la carte
                            </button>
                            <button
                                onClick={() => window.print()}
                                className="flex-1 rounded-card border border-white/40 bg-white/5 px-3 py-2 text-meta font-medium text-ink-200 hover:bg-white/10"
                            >
                                Imprimer
                            </button>
                        </div>
                        <button
                            onClick={() => setEtape(3)}
                            className="w-full rounded-card border border-primary/40 bg-primary/15 px-4 py-2 font-medium text-primary hover:bg-primary/25"
                        >
                            J'ai lu — continuer
                        </button>
                    </>
                )}

                {etape === 3 && (
                    <>
                        {plateformeDisponible === true && (
                            <label className="flex items-start gap-2 text-tiny text-ink-300 leading-snug">
                                <input
                                    type="checkbox"
                                    checked={remember}
                                    onChange={(e) => setRemember(e.target.checked)}
                                    className="mt-0.5"
                                />
                                Mémoriser sur cet appareil (déverrouillage biométrique requis à chaque usage —
                                Face ID / Touch ID / Windows Hello). Un appareil volé mais déverrouillé par
                                quelqu'un d'autre reste protégé par ce verrou ; en cas de vol, change la phrase
                                depuis un autre appareil pour couper tous les appareils mémorisés d'un coup.
                            </label>
                        )}
                        {plateformeDisponible === false && (
                            <p className="text-tiny text-ink-400 leading-snug">
                                Aucun capteur biométrique détecté sur cet appareil : la phrase te sera redemandée à
                                chaque session (mémorisation non proposée ici, jamais un repli plus faible).
                            </p>
                        )}
                        <label className="flex items-start gap-2 text-meta text-ink-200 leading-snug">
                            <input
                                type="checkbox"
                                checked={copieHorsLigneConfirmee}
                                onChange={(e) => setCopieHorsLigneConfirmee(e.target.checked)}
                                className="mt-0.5"
                            />
                            J'ai conservé une copie hors ligne de cette phrase.
                        </label>
                        {erreur && <p className="text-tiny italic text-rose-400">{erreur}</p>}
                        <button
                            onClick={() => void onActiver()}
                            disabled={busy || !peutActiver({ passphrase, confirmation, copieHorsLigneConfirmee })}
                            className="w-full rounded-card border border-primary/40 bg-primary/15 px-4 py-2 font-medium text-primary hover:bg-primary/25 disabled:opacity-50"
                        >
                            {busy ? 'Activation…' : 'Activer le chiffrement'}
                        </button>
                    </>
                )}
            </div>
        </Modal>
    );
};
