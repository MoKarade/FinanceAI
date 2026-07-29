// components/aiChat/AiChatConfirmModal.tsx
//
// [AITOOLS-D] Modal de CONFIRMATION d'une écriture proposée par le chat Claude in-app — le point de
// contrôle humain du contrat « rien ne s'écrit sans ton clic » (exigence Marc). Affiche le diff
// avant → après calculé PUREMENT par applyDocument (writeExecutor), puis tranche :
//   Appliquer → resolvePendingWrite('apply')  (writeExecutor recalcule sur état FRAIS + backup + write)
//   Annuler / Échap / ✕ / backdrop → resolvePendingWrite('cancel')  (tool_result « refusé », zéro écriture)
// Fermer SANS choisir n'existe pas : toute fermeture = refus (jamais de promesse pendante orpheline).

import React from 'react';
import { Modal } from '../ui/Modal';
import { formatNumber } from '../../utils/format';
import type { WritePreview, WriteDecision } from '../../services/aiTools/writeExecutor';

/** Libellés FR des tools d'écriture (les specs portent des noms techniques apply_*). */
const WRITE_TOOL_LABELS: Record<string, string> = {
    apply_debt: 'Mise à jour d\'une dette',
    apply_payslip: 'Fiche de paie',
    apply_bank_statement: 'Relevé bancaire',
    apply_broker_statement: 'Relevé de courtage',
    apply_tax_slip: 'Feuillet fiscal',
    // [MCP-DIRECT-EDIT] Lots 1-5 (finding code-reviewer #519 : un geste DESTRUCTIF affichait le nom
    // technique brut « delete_item » en sous-titre du modal — libellés clairs pour les 4 tools).
    set_cash: 'Ajustement des liquidités',
    set_budget_item: 'Poste de budget',
    upsert_savings_goal: 'Objectif d\'épargne',
    delete_item: 'SUPPRESSION',
};

// Rendu HONNÊTE d'une valeur de diff (Change.before/after sont `unknown`) : nombre → formatNumber
// (fr-CA déterministe, NaN → « — ») ; le champ dit l'unité ($ ou pas), on n'invente pas de devise.
// Jamais de String(x) nu qui rendrait « [object Object] » ou « undefined » à l'écran.
function renderValue(v: unknown): string {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'number') return formatNumber(v, { decimals: Number.isInteger(v) ? 0 : 2 });
    if (typeof v === 'string') return v;
    if (typeof v === 'boolean') return v ? 'oui' : 'non';
    try { return JSON.stringify(v); } catch { return '—'; }
}

interface AiChatConfirmModalProps {
    preview: WritePreview;
    onDecision: (decision: WriteDecision) => void;
}

export const AiChatConfirmModal: React.FC<AiChatConfirmModalProps> = ({ preview, onDecision }) => {
    return (
        <Modal
            isOpen
            onClose={() => onDecision('cancel')}
            title="Confirmer la modification"
            subtitle={WRITE_TOOL_LABELS[preview.toolName] ?? preview.toolName}
            size="lg"
            footer={
                <>
                    <button
                        type="button"
                        onClick={() => onDecision('cancel')}
                        className="px-4 py-2 rounded-card text-body text-ink-200 bg-white/5 hover:bg-white/10 border border-white/15 transition-colors focus-ring"
                    >
                        Annuler
                    </button>
                    <button
                        type="button"
                        onClick={() => onDecision('apply')}
                        className="px-4 py-2 rounded-card text-body font-bold text-dark bg-primary hover:bg-white transition-colors focus-ring"
                    >
                        Appliquer
                    </button>
                </>
            }
        >
            <p className="text-body text-ink-100 mb-3">{preview.summary}</p>
            <p className="text-meta text-ink-400 mb-3">
                L'assistant propose les changements ci-dessous. Rien n'est écrit tant que tu n'as pas
                cliqué « Appliquer » (une sauvegarde automatique est créée juste avant).
            </p>
            <ul className="space-y-2">
                {preview.changes.map((c, i) => (
                    <li key={i} className="bg-white/5 border border-white/10 rounded-card p-3">
                        <div className="text-meta font-medium text-ink-100">{c.field}</div>
                        <div className="text-body text-ink-200 mt-1">
                            <span className="text-ink-400">{renderValue(c.before)}</span>
                            <span className="text-ink-400 mx-2" aria-hidden="true">→</span>
                            <span className="sr-only">devient</span>
                            <span className="font-bold text-ink-50">{renderValue(c.after)}</span>
                        </div>
                        {c.note && <div className="text-tiny text-ink-400 mt-1">{c.note}</div>}
                    </li>
                ))}
            </ul>
        </Modal>
    );
};
