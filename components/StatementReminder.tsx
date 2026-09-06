/**
 * [UX-STATEMENT-REMINDER] Rappel proactif et dismissable : aucune transaction pour le mois courant →
 * le relevé de compte n'est probablement pas encore importé. Le rituel d'import mensuel n'avait aucun
 * filet (la fuite de données de persona est restée invisible des semaines faute de ce signal).
 *
 * Affiché si : transactions réelles en retard d'≥ 1 mois (dernier mois importé < mois courant), on est
 * passé le 5 du mois, et le mode test est inactif.
 *
 * Dismiss keyé par MOIS COURANT : ignorer silence le rappel pour ce mois-ci seulement ; il réapparaît
 * le mois suivant s'il est toujours pertinent (toujours pas d'import).
 */

import React, { useState } from 'react';
import { computeStatementReminderStatus } from '../services/statementReminder';
import { useFinanceStore } from '../store/useFinanceStore';
import { formatMonthYear } from '../utils/format';
import { Tab } from '../types';

const DISMISS_KEY = 'statementReminderDismissedMonth' as const;

const dismissedMonth = (): string | null => {
    try {
        return localStorage.getItem(DISMISS_KEY);
    } catch {
        return null;
    }
};

const saveDismiss = (month: string): void => {
    try {
        localStorage.setItem(DISMISS_KEY, month);
    } catch {
        // Pas critique.
    }
};

const monthLabel = (monthKey: string): string => {
    const [y, m] = monthKey.split('-').map(Number);
    if (!y || !m) return monthKey;
    return formatMonthYear(new Date(y, m - 1, 1));
};

export const StatementReminder: React.FC = () => {
    const transactions = useFinanceStore(s => s.transactions);
    const isTestMode = useFinanceStore(s => s.isTestMode);
    const setActiveTab = useFinanceStore(s => s.setActiveTab);
    const [dismissedFor, setDismissedFor] = useState<string | null>(() => dismissedMonth());

    if (isTestMode) return null;

    const status = computeStatementReminderStatus(transactions, new Date());
    if (!status.shouldShow) return null;
    if (!status.lastTxMonth) return null; // invariant : shouldShow ⇒ lastTxMonth non-null ; garde sans cast
    if (dismissedFor === status.currentMonth) return null;

    const handleDismiss = () => {
        saveDismiss(status.currentMonth);
        setDismissedFor(status.currentMonth);
    };

    const handleImport = () => {
        setActiveTab(Tab.TRANSACTIONS); // l'import de relevé vit dans l'onglet Transactions
        handleDismiss();
    };

    const behindLabel = status.monthsBehind >= 2
        ? `depuis ${monthLabel(status.lastTxMonth)} (${status.monthsBehind} mois)`
        : `pour ${monthLabel(status.currentMonth)}`;

    return (
        <div
            role="status"
            aria-label="Rappel import de relevé"
            className="mb-4 flex items-start gap-3 rounded-xl border border-warning-500/30 bg-amber-900/15 px-4 py-3 text-body text-amber-200"
        >
            <span className="mt-0.5 shrink-0 text-base" aria-hidden="true">i</span>
            <p className="flex-1 leading-snug">
                Aucune transaction {behindLabel} — ton relevé de compte n'a probablement pas encore été
                importé. Importe-le pour garder ton budget et tes revenus à jour.
            </p>
            <div className="flex shrink-0 items-center gap-2">
                <button
                    type="button"
                    onClick={handleImport}
                    // [A11Y 1.4.11] fond SOLIDE (bg-amber-700 = 3,97:1 vs page, prominence ok) + survol par
                    // luminosité — `bg-amber-700/60` ne ressortait qu'à ~2:1 du fond (bouton invisible).
                    className="rounded-lg bg-amber-700 px-2.5 py-1 text-meta font-bold text-white transition-[filter] hover:brightness-110 focus-ring"
                >
                    Importer mon relevé
                </button>
                <button
                    type="button"
                    onClick={handleDismiss}
                    aria-label="Plus tard — ignorer ce rappel ce mois-ci"
                    className="rounded-lg px-2 py-1 text-meta text-ink-300 transition-colors hover:text-white focus-ring"
                >
                    Plus tard
                </button>
            </div>
        </div>
    );
};

// Valeur exportée pour les tests.
