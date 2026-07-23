// components/aiChat/AiChatSignalCards.tsx
//
// [ASSISTANT-HUB] Cartes « prochaines actions » de l'onglet Assistant fusionné : les signaux
// financiers PURS (computeFinancialSignals — même moteur que le tool get_next_best_actions du
// chat, jamais deux avis divergents sur la même page), rendus en cartes compactes cliquables.
// Clic → message pré-rempli contextualisé envoyé au chat partagé (useAiChatContext).
//
// Trois états HONNÊTES : pas de données → nudge de configuration ; 0 signal → message positif
// (JAMAIS de cartes fabriquées — l'ancien widget Haiku forçait « exactement 3 ») ; N signaux →
// cartes. ⚠️ Mode discret : le clic est DÉSACTIVÉ (ADR — l'observation porte le montant CUIT
// dans la phrase ; une redaction regex serait fragile, on ne tente pas de « masquage partiel »
// vers l'API — même philosophie que l'auto-refus du modal d'écriture AITOOLS-D).

import React from 'react';
import { Icon } from '../ui/Icon';
import { PrivateAmount } from '../ui/PrivateAmount';
import { showToast } from '../ui/Toast';
import { useFinanceStore } from '../../store/useFinanceStore';
import { useFinancialSignals } from '../../hooks/useFinancialSignals';
import { useHasUserData } from '../../utils/useHasUserData';
import { useAiChatContext } from './AiChatContext';
import { formatCAD } from '../../utils/format';
import { Tab } from '../../types';
import type { FinancialSignal } from '../../mcp/financialSignals';

const PRIORITY_STYLES: Record<FinancialSignal['priority'], { dot: string; border: string }> = {
    high: { dot: 'bg-danger-500', border: 'border-danger-500/30' },
    medium: { dot: 'bg-warning-400', border: 'border-warning-400/30' },
    low: { dot: 'bg-success-400', border: 'border-success-400/30' },
};

export const AiChatSignalCards: React.FC = () => {
    const { signals } = useFinancialSignals();
    const { hasData } = useHasUserData();
    const isPrivacyMode = useFinanceStore((s) => s.isPrivacyMode);
    const setActiveTab = useFinanceStore((s) => s.setActiveTab);
    const { isLoading, sendMessage } = useAiChatContext();

    const discuss = (signal: FinancialSignal) => {
        // [ADR ASSISTANT-HUB — mode discret] no-op AVANT toute composition de message : l'observation
        // interpole des montants réels ; en mode discret, rien ne doit partir vers l'API.
        if (isPrivacyMode) {
            showToast('Mode discret actif — désactive-le pour discuter de ce signal avec l\'assistant.', 'info');
            return;
        }
        if (isLoading) return; // un envoi à la fois (cohérent avec le champ de saisie désactivé)
        void sendMessage(`Explique-moi ce signal et aide-moi à agir dessus : ${signal.observation}`);
    };

    if (!hasData) {
        return (
            <div className="bg-white/[0.03] border border-white/10 rounded-card p-3 mb-4 flex items-center gap-3">
                <Icon name="actions" size={16} className="text-ink-300 flex-shrink-0" aria-hidden="true" />
                <p className="text-meta text-ink-300 flex-1">
                    Configure ton profil (salaire, comptes) pour activer tes signaux financiers ici.
                </p>
                <button
                    type="button"
                    onClick={() => setActiveTab(Tab.PROFILE)}
                    className="text-meta text-primary hover:text-white focus-ring rounded-lg px-2 py-1"
                >
                    Configurer
                </button>
            </div>
        );
    }

    if (signals.length === 0) {
        return (
            <p className="text-meta text-ink-400 mb-4 flex items-center gap-2">
                <Icon name="check" size={14} className="text-success-400" aria-hidden="true" />
                Aucun signal à ce stade — rien d'anormal détecté (dettes, cashflow, coussin, CELI/REER).
            </p>
        );
    }

    return (
        <div className="mb-4">
            <h2 className="text-tiny uppercase font-bold text-ink-300 tracking-widest mb-2">
                Prochaines actions ({signals.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2" role="list" aria-label="Signaux financiers">
                {signals.map((s) => (
                    <button
                        key={s.id}
                        type="button"
                        role="listitem"
                        onClick={() => discuss(s)}
                        aria-disabled={isPrivacyMode || isLoading}
                        title={isPrivacyMode ? 'Mode discret actif — clic désactivé' : 'Discuter de ce signal avec l\'assistant'}
                        className={`text-left bg-white/[0.03] hover:bg-white/[0.06] border ${PRIORITY_STYLES[s.priority].border} rounded-card p-3 transition-colors focus-ring ${isPrivacyMode || isLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                        <div className="flex items-center gap-2 mb-1">
                            <span className={`w-2 h-2 rounded-full ${PRIORITY_STYLES[s.priority].dot} flex-shrink-0`} aria-hidden="true" />
                            {typeof s.metricCad === 'number' && Number.isFinite(s.metricCad) && (
                                <PrivateAmount as="span" className="text-body font-bold text-white">
                                    {formatCAD(s.metricCad)}
                                </PrivateAmount>
                            )}
                        </div>
                        <p className="text-meta text-ink-200 leading-snug">{s.observation}</p>
                        <p className="text-tiny text-ink-400 mt-1.5 flex items-center gap-1">
                            <Icon name="bot" size={11} aria-hidden="true" />
                            {isPrivacyMode ? 'Mode discret — clic désactivé' : 'Clique pour en discuter'}
                        </p>
                    </button>
                ))}
            </div>
        </div>
    );
};
