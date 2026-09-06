/**
 * [CELI-ASSET-NUDGE] Rappel discret et dismissable : l'utilisateur a viré de l'argent vers son CELI
 * (visible dans ses transactions) mais AUCUN placement CELI n'est enregistré → le CELI s'affiche à 0
 * et le patrimoine est sous-estimé. On l'invite à saisir ses vrais avoirs CELI.
 *
 * ⚠️ NO-FAKE-DATA : le montant affiché est le total VIRÉ (un coût cumulé, contexte), jamais un solde.
 * La valeur de marché reste ce que l'utilisateur saisit — on ne l'invente pas.
 *
 * Affiché si : virements CELI significatifs (≥ seuil) ET zéro actif CELI ET mode test inactif.
 * Clé de dismiss : 'celiNudgeDismissedAt' — un dismiss dure 30 jours (le rappel réapparaît ensuite
 * s'il est toujours pertinent, i.e. toujours aucun avoir CELI saisi).
 */

import React, { useState } from 'react';
import { computeCeliNudgeStatus } from '../services/celiNudge';
import { useFinanceStore } from '../store/useFinanceStore';
import { formatCAD } from '../utils/format';
import { PrivateAmount } from './ui/PrivateAmount';

const DISMISS_KEY = 'celiNudgeDismissedAt' as const;
const DISMISS_DURATION_DAYS = 30;

const isDismissed = (): boolean => {
    try {
        const raw = localStorage.getItem(DISMISS_KEY);
        if (!raw) return false;
        const dismissedAt = new Date(raw);
        if (isNaN(dismissedAt.getTime())) return false;
        const msElapsed = Date.now() - dismissedAt.getTime();
        return msElapsed < DISMISS_DURATION_DAYS * 24 * 60 * 60 * 1000;
    } catch {
        return false;
    }
};

const saveDismiss = (): void => {
    try {
        localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    } catch {
        // Pas critique.
    }
};

interface CeliAssetNudgeProps {
    /** Optionnel : amener l'utilisateur au formulaire d'ajout de placement (focus/scroll). */
    onAddAsset?: () => void;
}

export const CeliAssetNudge: React.FC<CeliAssetNudgeProps> = ({ onAddAsset }) => {
    const transactions = useFinanceStore(s => s.transactions);
    const assets = useFinanceStore(s => s.assets);
    const isTestMode = useFinanceStore(s => s.isTestMode);
    const [dismissed, setDismissed] = useState<boolean>(() => isDismissed());

    if (isTestMode || dismissed) return null;

    const status = computeCeliNudgeStatus(transactions, assets);
    if (!status.shouldShow) return null;

    const handleDismiss = () => {
        saveDismiss();
        setDismissed(true);
    };

    const handleAdd = () => {
        onAddAsset?.();
        handleDismiss();
    };

    return (
        <div
            role="status"
            aria-label="Rappel avoirs CELI"
            className="mb-4 flex items-start gap-3 rounded-xl border border-info-500/30 bg-sky-900/15 px-4 py-3 text-body text-sky-200"
        >
            <span className="mt-0.5 shrink-0 text-base" aria-hidden="true">i</span>
            <p className="flex-1 leading-snug">
                Tu as viré environ <PrivateAmount className="font-bold">{formatCAD(status.transferredTotal)}</PrivateAmount> vers
                ton CELI, mais aucun placement CELI n'est enregistré — ton CELI s'affiche à 0 $ et ton
                patrimoine est sous-estimé. Ajoute tes avoirs CELI (leur valeur actuelle) pour des chiffres justes.
            </p>
            <div className="flex shrink-0 items-center gap-2">
                {onAddAsset && (
                    <button
                        type="button"
                        onClick={handleAdd}
                        // [A11Y-CTA-CONTRASTE-OFFENDERS] Le survol DESCEND d'un cran (`info-700`,
                        // blanc à 6,70) au lieu d'éclaircir : `hover:bg-info-500` valait 3,68 et le
                        // `hover:brightness-110` qui l'avait remplacé 4,44 — sous AA tous les deux,
                        // et un filtre CSS échappe par construction au scan de `check-contrast`.
                        className="rounded-lg bg-info-600 px-2.5 py-1 text-meta font-bold text-white transition-colors hover:bg-info-700 focus-ring"
                    >
                        Ajouter mes avoirs CELI
                    </button>
                )}
                <button
                    type="button"
                    onClick={handleDismiss}
                    // [A11Y 2.5.3 Label in Name] le nom accessible commence par le texte visible
                    // (« Plus tard ») pour la commande vocale, puis précise l'action.
                    aria-label="Plus tard — ignorer ce rappel"
                    className="rounded-lg px-2 py-1 text-meta text-ink-300 transition-colors hover:text-white focus-ring"
                >
                    Plus tard
                </button>
            </div>
        </div>
    );
};

// Valeur exportée pour les tests.
export type { CeliAssetNudgeProps };
