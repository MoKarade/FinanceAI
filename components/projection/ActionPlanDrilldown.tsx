import React, { useMemo, useState } from 'react';
import {
    buildRootBucket,
    getChildBuckets,
    levelName,
    type PlanBucket,
} from '../../services/projection/actionPlanHierarchy';
import { ACTION_ACCOUNTS } from '../../services/projection/yearlyActions';
import { Icon } from '../ui/Icon';

interface ActionPlanDrilldownProps {
    chartData: Array<Record<string, unknown>>;
    strategyName?: string;
}

const cad = (v: number): string => `${Math.round(v).toLocaleString('fr-CA')}$`;

const FlowChips: React.FC<{ flows: PlanBucket['flows'] }> = ({ flows }) => {
    const deposits = ACTION_ACCOUNTS.filter((a) => flows[a.key] > 100);
    const withdrawals = ACTION_ACCOUNTS.filter((a) => flows[a.key] < -100);
    if (deposits.length === 0 && withdrawals.length === 0) {
        return <span className="text-tiny text-ink-600">—</span>;
    }
    return (
        <div className="flex flex-wrap gap-1.5 text-tiny font-mono">
            {deposits.map((a) => (
                <span key={a.key} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-300 privacy-blur">
                    <Icon name="cash" size={11} /> {a.label} +{cad(flows[a.key])}
                </span>
            ))}
            {withdrawals.map((a) => (
                <span key={a.key} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-300 privacy-blur">
                    <Icon name="bank" size={11} /> {a.label} −{cad(-flows[a.key])}
                </span>
            ))}
        </div>
    );
};

/**
 * Plan d'action HIÉRARCHIQUE (Couche progressive) : on part d'une vue d'ensemble
 * et on creuse au clic — décennie → 3 ans → année → semestre → trimestre → mois,
 * puis les conseils concrets de la période. « Simple en surface, profond quand on
 * creuse » : chaque niveau montre le net + les mouvements, le clic révèle le détail.
 */
export const ActionPlanDrilldown: React.FC<ActionPlanDrilldownProps> = ({ chartData, strategyName }) => {
    const root = useMemo(() => buildRootBucket(chartData), [chartData]);
    // On stocke le chemin par IDs (stables) et on RE-DÉRIVE les buckets à chaque
    // rendu depuis chartData → toujours frais, robuste si le scénario change.
    const [pathIds, setPathIds] = useState<string[]>([]);

    const { trail, children } = useMemo(() => {
        if (!root) return { trail: [] as PlanBucket[], children: [] as PlanBucket[] };
        const t: PlanBucket[] = [root];
        let cur = root;
        for (const id of pathIds) {
            const next = getChildBuckets(chartData, cur).find((k) => k.id === id);
            if (!next) break; // id périmé (scénario changé) → on s'arrête là
            t.push(next);
            cur = next;
        }
        return { trail: t, children: getChildBuckets(chartData, cur) };
    }, [root, chartData, pathIds]);

    if (!root) return null;

    const current = trail[trail.length - 1];
    const net = current.deposited - current.withdrawn;
    const idsBelowRoot = trail.slice(1).map((b) => b.id);

    const drillTo = (b: PlanBucket) => setPathIds([...idsBelowRoot, b.id]);
    const jumpTo = (trailIdx: number) => setPathIds(trail.slice(1, trailIdx + 1).map((b) => b.id));

    return (
        <div className="mt-6 bg-black/20 p-4 rounded-xl border border-white/5">
            <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                <span className="text-meta font-black text-white flex items-center gap-1.5">
                    <Icon name="clipboard" size={14} className="text-ink-300" /> Plan d'action
                </span>
                {strategyName && <span className="text-tiny text-ink-500">selon {strategyName}</span>}
            </div>

            {/* Fil d'Ariane : clique pour remonter d'un niveau. */}
            <nav aria-label="Niveau du plan" className="flex items-center flex-wrap gap-1 text-tiny mb-3">
                {trail.map((b, i) => {
                    const isLast = i === trail.length - 1;
                    return (
                        <React.Fragment key={b.id}>
                            {isLast ? (
                                <span className="px-1.5 py-0.5 rounded bg-primary/15 text-primary font-bold">
                                    {levelName(b.level)} · {b.label}
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => jumpTo(i)}
                                    className="px-1.5 py-0.5 rounded text-ink-400 hover:text-ink-100 hover:bg-white/5 focus-ring transition-colors"
                                >
                                    {b.label}
                                </button>
                            )}
                            {!isLast && <span aria-hidden="true" className="text-ink-600">›</span>}
                        </React.Fragment>
                    );
                })}
            </nav>

            {/* Résumé de la période courante. */}
            <div className="bg-white/[0.03] rounded-lg p-3 mb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                    <span className="text-meta font-bold text-white">
                        {current.label}
                        {current.ageStart != null && (
                            <span className="text-ink-400 font-normal">
                                {' · '}{current.ageStart}{current.ageEnd != null && current.ageEnd !== current.ageStart ? `–${current.ageEnd}` : ''} ans
                            </span>
                        )}
                    </span>
                    <span className={`text-meta font-bold tabular-nums privacy-blur ${net >= 0 ? 'text-success-400' : 'text-orange-300'}`}>
                        {net >= 0 ? 'Épargne nette +' : 'Décaissement '}{cad(net)}
                    </span>
                </div>
                <FlowChips flows={current.flows} />
                <div className="text-tiny text-ink-500 mt-2 privacy-blur">
                    Patrimoine en fin de période : <span className="text-ink-300 font-mono">{cad(current.netWorthEnd)}</span>
                </div>
            </div>

            {/* Conseils de la période. */}
            <div className="mb-3">
                <div className="text-tiny font-bold text-ink-400 uppercase tracking-wide mb-1.5">Conseils</div>
                <ul className="space-y-1">
                    {current.advice.map((line, i) => (
                        <li key={`${current.id}-${i}`} className="text-tiny text-ink-200 flex items-start gap-1.5">
                            <span aria-hidden="true" className="text-primary mt-0.5">·</span>
                            <span className="privacy-blur">{line}</span>
                        </li>
                    ))}
                </ul>
            </div>

            {/* Creuser : enfants cliquables. */}
            {children.length > 0 && (
                <div>
                    <div className="text-tiny font-bold text-ink-400 uppercase tracking-wide mb-1.5">
                        Creuser ({levelName(children[0].level).toLowerCase()})
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {children.map((b) => {
                            const childNet = b.deposited - b.withdrawn;
                            return (
                                <button
                                    key={b.id}
                                    type="button"
                                    onClick={() => b.hasChildren && drillTo(b)}
                                    disabled={!b.hasChildren}
                                    className={`text-left bg-white/[0.03] rounded-lg p-2.5 border border-white/5 transition-colors focus-ring ${
                                        b.hasChildren ? 'hover:bg-white/[0.07] hover:border-primary/30 cursor-pointer' : 'cursor-default opacity-90'
                                    }`}
                                    title={b.hasChildren ? `Creuser : ${b.label}` : b.label}
                                >
                                    <div className="flex items-center justify-between gap-2 mb-1.5">
                                        <span className="text-meta font-bold text-white truncate">{b.label}</span>
                                        <span className="flex items-center gap-1.5 shrink-0">
                                            {b.isRetired && <span className="text-tiny text-amber-300 bg-warning-500/10 px-1.5 py-0.5 rounded">Retraite</span>}
                                            <span className={`text-tiny font-mono tabular-nums privacy-blur ${childNet >= 0 ? 'text-success-400' : 'text-orange-300'}`}>
                                                {childNet >= 0 ? '+' : ''}{cad(childNet)}
                                            </span>
                                            {b.hasChildren && <span aria-hidden="true" className="text-ink-500">›</span>}
                                        </span>
                                    </div>
                                    <FlowChips flows={b.flows} />
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
