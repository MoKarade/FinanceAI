// components/dashboard/SyncStaleBanner.tsx
//
// [FINTABLE-STALE-ALERT] Bannière « import bancaire gelé » sur l'Accueil.
//
// Née de l'incident RÉEL du 2026-08-05 : l'import de Marc était figé depuis 5 jours et rien ne le
// disait — la seule surface qui portait l'information (la carte Fintable des Réglages) est un
// écran qu'on ne visite JAMAIS quand tout va bien. Une alerte doit se trouver là où l'utilisateur
// regarde par défaut, sinon elle n'existe pas.
//
// ⚠️ Le statut vient de `computeSyncHealth` — la MÊME fonction que le connecteur MCP. Deux
// implémentations divergeraient (leçon MCP-NETINCOME-MISLEADING, même journée) et l'app finirait
// par dire « à jour » pendant que le connecteur dit « gelé ».

import React, { useMemo } from 'react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { computeSyncHealth } from '../../services/fintable/syncHealth';
import { Icon } from '../ui/Icon';
import { Tab } from '../../types';

/** Le mode démo est EXCLU : les données de persona sont figées par nature, crier au gel n'aurait
 *  aucun sens et entraînerait l'utilisateur à ignorer la bannière quand elle sera vraie. */
export const SyncStaleBanner: React.FC = () => {
    const transactions = useFinanceStore((s) => s.transactions);
    const report = useFinanceStore((s) => s.fintableSyncReport);
    const isTestMode = useFinanceStore((s) => s.isTestMode);
    const navigateWithFocus = useFinanceStore((s) => s.navigateWithFocus);

    // `Date.now()` capturé au rendu : la fraîcheur n'a pas besoin d'être réactive à la seconde,
    // et un timer ferait re-rendre l'Accueil en permanence pour un gain nul.
    const health = useMemo(
        () => computeSyncHealth(transactions, report, Date.now()),
        [transactions, report],
    );

    // `never` est SILENCIEUX ici : un utilisateur qui n'a jamais branché l'import n'a pas de
    // problème à signaler — l'onboarding s'en charge. On alerte sur une CHUTE, pas sur une absence.
    if (isTestMode || health.status === 'ok' || health.status === 'never') return null;

    const isError = health.status === 'error';
    return (
        <div
            role="alert"
            aria-label="Fraîcheur de l'import bancaire"
            className={`flex items-start gap-3 rounded-card border p-3 ${isError
                ? 'text-danger-400 bg-danger-500/10 border-danger-500/20'
                : 'text-warning-400 bg-warning-500/10 border-warning-500/20'}`}
        >
            <Icon name="alert" size={18} className="shrink-0 mt-0.5" />
            <div className="min-w-0 space-y-1">
                <p className="text-body font-semibold">
                    {isError ? 'Synchronisation bancaire en échec' : 'Import bancaire figé'}
                </p>
                {/* `reason` nomme déjà la cause probable (abonnement, ré-autorisation) : on ne la
                    reformule pas ici, sinon les deux textes divergeraient au prochain changement. */}
                <p className="text-meta leading-snug">{health.reason}</p>
                <button
                    type="button"
                    onClick={() => navigateWithFocus(Tab.SETTINGS, 'fintable-sync')}
                    // `min-h-[44px]` (cible tactile) : c'est la forme utilisée ailleurs dans le
                    // repo — `min-h-touch` n'existe PAS dans tailwind.config.js et aurait été un
                    // no-op silencieux (piège documenté « shade/classe hors palette »).
                    className="inline-flex items-center min-h-[44px] text-meta underline underline-offset-2 hover:no-underline focus-ring"
                >
                    Ouvrir les réglages de synchronisation →
                </button>
            </div>
        </div>
    );
};
