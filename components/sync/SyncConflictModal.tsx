import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../ui/Icon';
import {
    getSyncStatus,
    subscribeSyncStatus,
    resolveConflict,
    type SyncStatus,
} from '../../services/sync/syncOrchestrator';
import { useFocusTrap } from '../../hooks/useFocusTrap';

function formatWhen(ts: number): string {
    if (!ts) return 'date inconnue';
    try {
        return new Date(ts).toLocaleString('fr-CA');
    } catch {
        return 'date inconnue';
    }
}

/**
 * Modal GLOBAL de résolution de conflit de sync Drive (anti-clobber Marc 2026-07-14).
 *
 * S'affiche dès que la sync détecte une divergence RÉELLE entre CET APPAREIL et Google Drive :
 * plus JAMAIS d'écrasement automatique (`decideOnLoad` renvoie `conflict` au lieu de pull). L'utilisateur
 * voit un RÉSUMÉ de chaque côté (nb de placements/transactions + date Drive) pour choisir sans détruire
 * ses données par erreur — c'est ce qui aurait évité de perdre 230k$ sous une vieille copie Drive.
 *
 * Monté au niveau App (hors de tout onglet) → surgit au premier plan quel que soit l'onglet.
 *
 * Choix : « Garder cet appareil » → push (NON destructeur pour le local) ; « Restaurer depuis Drive »
 * → pull (DESTRUCTEUR → confirmation 2 temps). Le conflit ne se ferme qu'au SUCCÈS de l'action choisie
 * (resolveConflict n'efface plus le conflit d'avance) → un échec réseau ne l'annule pas en silence.
 *
 * A11y : dialogue BLOQUANT volontaire (pas de ✕/Esc : il faut choisir). On fournit donc focus initial,
 * focus-trap Tab/Shift+Tab, focus reprogrammé au passage à l'étape de confirmation, verrou de scroll,
 * et restauration du focus à la fermeture (comme la primitive Modal, mais sans échappatoire).
 */
export const SyncConflictModal: React.FC = () => {
    const [status, setStatus] = useState<SyncStatus>(getSyncStatus);
    const [busy, setBusy] = useState(false);
    const [confirmRestore, setConfirmRestore] = useState(false);

    const dialogRef = useRef<HTMLDivElement>(null);
    const firstBtnRef = useRef<HTMLButtonElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    useFocusTrap(dialogRef, !!status.conflict);

    useEffect(() => subscribeSyncStatus(setStatus), []);

    // Réinitialise l'étape de confirmation quand le conflit se ferme (résolu ailleurs, ou reload).
    useEffect(() => {
        if (!status.conflict) setConfirmRestore(false);
    }, [status.conflict]);

    // Focus initial + trap + verrou de scroll + restauration, tant que le conflit est affiché.
    useEffect(() => {
        if (!status.conflict) return;
        previousFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const t = setTimeout(() => firstBtnRef.current?.focus(), 50);
        // [A11Y-FUTUR-DETAIL-FOCUS-TRAP] Le piège Tab vient de `useFocusTrap` (source unique). Sa
        // liste d'éléments focusables inclut `select`/`textarea`, que la copie locale d'ici avait
        // perdus : un dialogue de conflit qui gagnerait une liste déroulante y aurait fui en silence.
        return () => {
            clearTimeout(t);
            document.body.style.overflow = prevOverflow;
            const target = previousFocusRef.current;
            if (target && document.body.contains(target) && typeof target.focus === 'function') target.focus();
        };
    }, [status.conflict]);

    // Reprogramme le focus sur le 1er bouton du sous-état de confirmation (sinon le focus retombe sur
    // <body> quand le bouton « Restaurer depuis Drive… » est démonté → utilisateur clavier perdu).
    useEffect(() => {
        const t = setTimeout(() => firstBtnRef.current?.focus(), 30);
        return () => clearTimeout(t);
    }, [confirmRestore]);

    if (!status.conflict) return null;

    const s = status.conflictSummary;

    const choose = async (keep: 'local' | 'drive') => {
        setBusy(true);
        try {
            await resolveConflict(keep);
        } finally {
            setBusy(false);
            setConfirmRestore(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="sync-conflict-title"
        >
            <div ref={dialogRef} className="bg-surface border border-warning-500/40 rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 animate-scale-in">
                <div className="flex items-start gap-3">
                    <Icon name="alert" size={22} className="mt-0.5 text-warning-400 shrink-0" />
                    <div className="flex-1">
                        <h2 id="sync-conflict-title" className="text-white font-bold text-base">
                            Tes données diffèrent entre cet appareil et Google Drive
                        </h2>
                        <p className="text-ink-300 text-meta mt-1 leading-snug">
                            Pour ne rien écraser par erreur, choisis quoi garder. L'autre version sera remplacée.
                        </p>
                    </div>
                </div>

                {status.error && (
                    <p role="alert" className="text-tiny text-rose-300 italic">{status.error}</p>
                )}

                {s && (
                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-card border border-primary/40 bg-primary/5 p-3">
                            <div className="text-tiny uppercase text-primary font-bold">Cet appareil</div>
                            <div className="text-meta text-ink-100 mt-1">{s.local.assets} placement(s)</div>
                            <div className="text-meta text-ink-100">{s.local.transactions} transaction(s)</div>
                            <div className="text-tiny text-ink-400 mt-1">Données actuelles (pas encore sauvegardées)</div>
                        </div>
                        <div className="rounded-card border border-white/10 bg-white/5 p-3">
                            <div className="text-tiny uppercase text-ink-300 font-bold">Google Drive</div>
                            {s.drive.encrypted ? (
                                <div className="text-meta text-ink-100 mt-1">Chiffré — contenu inconnu</div>
                            ) : (
                                <>
                                    <div className="text-meta text-ink-100 mt-1">{s.drive.assets} placement(s)</div>
                                    <div className="text-meta text-ink-100">{s.drive.transactions} transaction(s)</div>
                                </>
                            )}
                            <div className="text-tiny text-ink-400 mt-1">Sauvegardé le {formatWhen(s.drive.updatedAt)}</div>
                        </div>
                    </div>
                )}

                <p className="text-tiny text-warning-400/90 leading-snug">
                    {s?.drive.encrypted ? (
                        <>Le contenu de Drive est chiffré (passphrase) et illisible d'ici — il peut contenir plus que cet appareil.
                        En cas de doute, ne l'écrase pas : « Restaurer depuis Drive » le récupère.</>
                    ) : (
                        <>En cas de doute, garde le côté qui a le PLUS de placements/transactions.
                        « Garder cet appareil » n'efface jamais tes données locales.</>
                    )}
                </p>

                {!confirmRestore ? (
                    <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                        <button
                            ref={firstBtnRef}
                            type="button"
                            onClick={() => choose('local')}
                            disabled={busy}
                            aria-busy={busy}
                            className="px-4 py-2 rounded-card bg-primary text-dark text-meta font-bold hover:bg-primary/90 disabled:opacity-50 focus-ring"
                        >
                            {busy ? 'Envoi…' : 'Garder cet appareil (envoyer vers Drive)'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirmRestore(true)}
                            disabled={busy}
                            className="px-4 py-2 rounded-card bg-white/5 border border-white/40 text-ink-200 text-meta font-medium hover:bg-white/10 disabled:opacity-50 focus-ring"
                        >
                            Restaurer depuis Drive…
                        </button>
                    </div>
                ) : (
                    <div className="p-3 rounded-card bg-rose-500/10 border border-rose-500/30 space-y-2">
                        <p className="text-tiny text-ink-200 leading-snug">
                            Ça <strong>remplace</strong> les données de cet appareil
                            {s ? <> ({s.local.assets} placement(s))</> : ''} par celles de Drive
                            {s ? (s.drive.encrypted ? <> (chiffré, contenu inconnu)</> : <> ({s.drive.assets} placement(s))</>) : ''}.
                            Un backup local est tenté avant. Continuer ?
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button
                                ref={firstBtnRef}
                                type="button"
                                onClick={() => setConfirmRestore(false)}
                                disabled={busy}
                                className="px-3 py-1.5 rounded-card bg-white/5 border border-white/40 text-ink-200 text-meta font-medium hover:bg-white/10 disabled:opacity-50 focus-ring"
                            >
                                Annuler
                            </button>
                            <button
                                type="button"
                                onClick={() => choose('drive')}
                                disabled={busy}
                                aria-busy={busy}
                                className="px-3 py-1.5 rounded-card bg-rose-500/20 border border-rose-500/40 text-rose-200 text-meta font-bold hover:bg-rose-500/30 disabled:opacity-50 focus-ring"
                            >
                                {busy ? 'Restauration…' : 'Oui, restaurer Drive'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
