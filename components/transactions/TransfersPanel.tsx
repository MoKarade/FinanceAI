// components/transactions/TransfersPanel.tsx
//
// [TX-TRANSFERS] Panneau des virements internes (demande Marc 2026-07-31 : « ça détecte mal mes
// transferts entre comptes », avec un écran de tri dans l'onglet Transactions).
//
// Deux régimes, volontairement distincts :
//   - PROUVÉ (deux comptes connus et différents) → marquage AUTOMATIQUE, ici seulement rattrapé
//     pour l'historique déjà importé (les nouveaux imports le font tout seuls, cf. App.tsx).
//   - PLAUSIBLE (au moins un compte inconnu) → JAMAIS écrit d'office : deux montants opposés à
//     quelques jours d'écart, c'est aussi la signature d'un achat suivi d'un remboursement. Un faux
//     positif retirerait une vraie dépense du budget (`budgetSync.ts:58`).
//
// ⚠️ Palettes : `warning`/`info` n'ont que 400/500/600 et `ink` s'arrête à 500 (tailwind.config.js) —
// un shade hors palette est une classe MORTE, sans erreur de build (piège FIX-INK600-TOKEN, déjà
// récidivé). Et `ink-500` échoue AA-normal (mesuré) → texte secondaire en `ink-400`.

import React, { useMemo, useState } from 'react';
import type { Transaction } from '../../types';
import {
    applyTransferDetection,
    type TransferSuggestion,
} from '../../services/transactions/applyTransferDetection';
import { formatCAD } from '../../utils/format';
import { PrivateAmount } from '../ui/PrivateAmount';
import { Icon } from '../ui/Icon';

interface Props {
    transactions: Transaction[];
    /** Marque les ids comme virement interne (exclus du budget, réversible ligne par ligne). */
    onMarkTransfers: (ids: number[]) => void;
}

export const TransfersPanel: React.FC<Props> = ({ transactions, onMarkTransfers }) => {
    const [open, setOpen] = useState(false);

    // Ne calcule que si le panneau est ouvert : l'appariement parcourt tout l'historique.
    const detection = useMemo(
        () => (open ? applyTransferDetection(transactions) : null),
        [open, transactions],
    );
    const report = detection?.report ?? null;

    const markedCount = useMemo(
        () => transactions.filter((t) => t.isTransfer).length,
        [transactions],
    );

    const applyProven = (): void => {
        if (!detection) return;
        // Comparaison par ID (jamais par index) : `applyTransferDetection` préserve l'ordre, mais
        // s'appuyer dessus rendrait ce calcul silencieusement faux si ça changeait un jour.
        const wasTransfer = new Map(transactions.map((t) => [t.id, !!t.isTransfer]));
        const ids = detection.transactions
            .filter((t) => t.isTransfer && !wasTransfer.get(t.id))
            .map((t) => t.id);
        if (ids.length > 0) onMarkTransfers(ids);
    };

    return (
        <div className="rounded-xl border border-info-500/20 bg-info-500/5">
            <button
                onClick={() => setOpen((p) => !p)}
                aria-expanded={open}
                className="w-full flex items-center justify-between px-4 py-3 text-meta font-bold text-ink-200 hover:text-ink-50 transition-colors"
            >
                <span className="flex items-center gap-2">
                    <Icon name="actions" size={15} className="text-ink-400" />
                    Virements internes
                    {markedCount > 0 && (
                        <span className="bg-white/10 text-ink-300 px-2 py-0.5 rounded-full">
                            {markedCount} marqué{markedCount > 1 ? 's' : ''}
                        </span>
                    )}
                </span>
                <span className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">▼</span>
            </button>

            {open && report && (
                <div className="px-4 pb-4 space-y-3">
                    <p className="text-meta text-ink-300">
                        Un virement entre tes comptes n&apos;est pas une dépense. Reconnu par deux montants
                        exactement opposés, à quelques jours d&apos;écart, sur deux comptes différents.{' '}
                        <span className="text-ink-400">Les Interac restent des remboursements, jamais des virements.</span>
                    </p>

                    {report.markedCount > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                onClick={applyProven}
                                className="px-3 py-2 rounded-lg text-meta font-bold bg-info-600 text-white focus-ring min-h-[24px]"
                            >
                                Marquer {report.markedCount} virement{report.markedCount > 1 ? 's' : ''} détecté{report.markedCount > 1 ? 's' : ''}
                            </button>
                            <span className="text-meta text-ink-400">Comptes connus et différents des deux côtés.</span>
                        </div>
                    )}

                    {report.suggestions.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-meta text-ink-300">
                                {report.suggestions.length} paire{report.suggestions.length > 1 ? 's' : ''} possible
                                {report.suggestions.length > 1 ? 's' : ''} — le compte manque d&apos;au moins un côté,
                                donc rien n&apos;est marqué sans toi.
                            </p>
                            <ul className="space-y-2 max-h-96 overflow-y-auto">
                                {report.suggestions.map((s) => (
                                    <SuggestionRow
                                        key={`${s.out.id}-${s.incoming.id}`}
                                        suggestion={s}
                                        onConfirm={() => onMarkTransfers([s.out.id, s.incoming.id])}
                                    />
                                ))}
                            </ul>
                        </div>
                    )}

                    {report.markedCount === 0 && report.suggestions.length === 0 && (
                        <p className="text-meta text-ink-400">
                            Aucun virement interne détecté dans l&apos;historique.
                        </p>
                    )}

                    {/* Diagnostic honnête : sans nom de compte, la détection ne peut rien PROUVER. */}
                    {report.withoutAccountCount > 0 && (
                        <p className="text-meta text-ink-400">
                            {report.withoutAccountCount} transaction{report.withoutAccountCount > 1 ? 's' : ''} sans
                            nom de compte : impossible de prouver que les deux côtés sont dans des poches
                            différentes. Les imports récents portent le compte ; l&apos;historique plus ancien,
                            souvent pas.
                        </p>
                    )}
                    {report.skippedManualCount > 0 && (
                        <p className="text-meta text-ink-400">
                            {report.skippedManualCount} paire{report.skippedManualCount > 1 ? 's' : ''} ignorée
                            {report.skippedManualCount > 1 ? 's' : ''} : tu as corrigé une de ses lignes à la main,
                            et une correction manuelle n&apos;est jamais écrasée.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

const SuggestionRow: React.FC<{
    suggestion: TransferSuggestion;
    onConfirm: () => void;
}> = ({ suggestion, onConfirm }) => (
    <li className="rounded-lg border border-white/10 bg-black/20 p-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
            <PrivateAmount className="text-meta font-bold text-ink-100">
                {formatCAD(suggestion.amount)}
            </PrivateAmount>
            <div className="text-meta text-ink-400 truncate">
                {suggestion.out.date} · {suggestion.out.payee || '(sans libellé)'}
                {suggestion.out.accountName ? ` · ${suggestion.out.accountName}` : ' · compte inconnu'}
            </div>
            <div className="text-meta text-ink-400 truncate">
                {suggestion.incoming.date} · {suggestion.incoming.payee || '(sans libellé)'}
                {suggestion.incoming.accountName ? ` · ${suggestion.incoming.accountName}` : ' · compte inconnu'}
            </div>
        </div>
        <button
            onClick={onConfirm}
            aria-label={`Confirmer le virement de ${formatCAD(suggestion.amount)} du ${suggestion.out.date}`}
            className="px-3 py-2 rounded-lg text-meta font-bold bg-white/5 text-ink-200 border border-white/10 focus-ring min-h-[24px] whitespace-nowrap"
        >
            C&apos;est un virement
        </button>
    </li>
);
