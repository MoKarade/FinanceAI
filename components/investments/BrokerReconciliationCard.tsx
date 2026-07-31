// components/investments/BrokerReconciliationCard.tsx
//
// [FINTABLE-6 Lot 2] « Le montant du COURTIER fait autorité » — la surface qui le montre.
//
// Demande Marc : « je veux que dans investissements ça utilise exactement le montant que j'ai dans
// Fintable » + « que l'accueil utilise Fintable aussi ». Une SEULE implémentation, deux variantes
// (`full` = Investissements, `compact` = Accueil) — pas deux copies qui dérivent.
//
// Le total affiché est le solde du COURTIER (vérité terrain, leçon ASSET-FX-DISPLAY : « l'arbitre
// est le courtier »). L'écart avec la somme des titres saisis est MATÉRIALISÉ en ligne explicite
// (« écart non ventilé ») : Σ titres + écart == total courtier, par construction — le patrimoine
// affiché reste reconstructible (checklist VALIDATION FINANCIÈRE), rien n'est noyé.
//
// Ship dark : sans `fintableBrokerBalances` (sync jamais passée, ou mode démo — le champ est purgé
// par personaResetBase), la carte ne rend RIEN — l'app garde son comportement d'avant.

import React, { useMemo } from 'react';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { PrivateAmount } from '../ui/PrivateAmount';
import { useFinanceStore } from '../../store/useFinanceStore';
import { reconcileBrokerBalances, type ReconcilableRegime } from '../../services/fintable/brokerBalances';
import { holdingsCadByRegime } from '../../services/fintable/holdingsByRegime';
import { formatCAD, formatSigned } from '../../utils/format';
import { formatRelative } from '../../utils/relativeTime';

const REGIME_LABELS: Record<ReconcilableRegime, string> = {
    CELI: 'CELI',
    REER: 'REER',
    'NON-ENREG': 'Non enregistré',
};

/** Badge de fraîcheur honnête : borné par la lecture la plus ANCIENNE du panier. */
const freshnessLabel = (observedAt: number | null): string =>
    observedAt === null ? 'fraîcheur inconnue' : `vu ${formatRelative(observedAt)}`;

interface Props {
    /** `full` (Investissements) : détail par régime + avertissements. `compact` (Accueil) : une ligne. */
    variant: 'full' | 'compact';
}

export const BrokerReconciliationCard: React.FC<Props> = ({ variant }) => {
    const balances = useFinanceStore((s) => s.fintableBrokerBalances);
    const assets = useFinanceStore((s) => s.assets);
    const fxRates = useFinanceStore((s) => s.fxRates);

    const reco = useMemo(
        () => reconcileBrokerBalances(balances, holdingsCadByRegime(assets, fxRates)),
        [balances, assets, fxRates],
    );

    // Rien de réconciliable ET rien à signaler → ship dark (sync jamais passée, ou tout illisible
    // serait quand même signalé ci-dessous via unreadable/unassigned).
    if (reco.regimes.length === 0 && reco.unassignedAccountLabels.length === 0
        && reco.unreadableAccountLabels.length === 0) return null;

    // Fraîcheur GLOBALE = la plus ancienne de tous les paniers (même règle que par panier : ne rien
    // promettre de plus frais que le compte le plus vieux). `null` si un panier est d'âge inconnu.
    const globalObservedAt = reco.regimes.reduce<number | null>(
        (acc, r) => (acc === null || r.observedAt === null ? null : Math.min(acc, r.observedAt)),
        reco.regimes.length > 0 ? (reco.regimes[0].observedAt ?? null) : null,
    );

    if (variant === 'compact') {
        return (
            <Card className="bg-white/[0.03] border-white/10">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        <div className="kpi-label flex items-center gap-1.5">
                            <Icon name="investments" size={14} />
                            Placements — total courtier (Fintable)
                        </div>
                        <PrivateAmount as="div" className="text-kpi text-ink-50 tabular-nums">
                            {formatCAD(reco.brokerTotalCad)}
                        </PrivateAmount>
                    </div>
                    <div className="text-meta text-ink-400 text-right">
                        <div>
                            Écart avec tes titres saisis :{' '}
                            <PrivateAmount className="text-ink-200 font-bold tabular-nums">
                                {formatSigned(reco.totalGapCad, { withCurrency: true })}
                            </PrivateAmount>
                        </div>
                        <div className="text-tiny">{freshnessLabel(globalObservedAt)}</div>
                    </div>
                </div>
            </Card>
        );
    }

    return (
        <Card icon={<Icon name="investments" size={18} />} title="Comptes courtier (Fintable)">
            <div className="space-y-3">
                <p className="text-meta text-ink-400">
                    Le total de chaque panier est celui de ton <strong>courtier</strong> (il fait autorité).
                    L&apos;écart avec la somme de tes titres saisis est affiché tel quel — Fintable ne
                    fournit pas les positions, seulement le total du compte.
                </p>

                <ul className="space-y-2">
                    {reco.regimes.map((r) => (
                        <li key={r.regime} className="p-3 bg-white/[0.02] border border-white/5 rounded-card">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="min-w-0">
                                    <div className="text-meta font-bold text-ink-200">{REGIME_LABELS[r.regime]}</div>
                                    <div className="text-tiny text-ink-400 truncate">
                                        {r.accountLabels.filter(Boolean).join(' + ') || '(compte sans nom)'}
                                        {' · '}{freshnessLabel(r.observedAt)}
                                    </div>
                                </div>
                                <PrivateAmount as="div" className="text-kpi text-ink-50 tabular-nums">
                                    {formatCAD(r.brokerTotalCad)}
                                </PrivateAmount>
                            </div>
                            <div className="mt-1 text-meta text-ink-400">
                                Titres saisis :{' '}
                                <PrivateAmount className="text-ink-200 tabular-nums">{formatCAD(r.holdingsValueCad)}</PrivateAmount>
                                {' · '}Écart (non ventilé) :{' '}
                                <PrivateAmount className={`font-bold tabular-nums ${Math.abs(r.gapCad) < 1 ? 'text-success-400' : 'text-warning-400'}`}>
                                    {formatSigned(r.gapCad, { withCurrency: true })}
                                </PrivateAmount>
                            </div>
                        </li>
                    ))}
                </ul>

                {reco.unassignedAccountLabels.length > 0 && (
                    <p className="text-meta text-warning-400 bg-warning-500/10 border border-warning-500/20 rounded-card px-3 py-2">
                        Régime fiscal non déclaré pour : {reco.unassignedAccountLabels.join(', ')} — ces
                        comptes sont hors réconciliation. Déclare leur régime dans Réglages → Sync bancaire
                        Fintable.
                    </p>
                )}
                {reco.unreadableAccountLabels.length > 0 && (
                    <p className="text-meta text-danger-400 bg-danger-500/10 border border-danger-500/20 rounded-card px-3 py-2">
                        Solde illisible pour : {reco.unreadableAccountLabels.join(', ')} — écarté des totaux
                        (aucun 0 inventé). Relance une synchronisation.
                    </p>
                )}
            </div>
        </Card>
    );
};
