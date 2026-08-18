// components/transactions/CategoryReviewPanel.tsx
//
// [TX-REVIEW] Revue d'échantillon : l'outil qui MESURE le taux réel de transactions mal classées.
//
// Pourquoi il existe : le critère d'arrêt de Marc est « moins de 1 % mal classé ». Il a refusé de
// fournir un export de référence — il n'y a donc aucun jeu de vérité hors ligne, et le critère serait
// invérifiable. La mesure devient un geste dans l'app : l'échantillon est tiré au hasard, Marc tranche
// « correct / mal classé », et le taux se calcule sur ce qu'il a jugé.
//
// ⚠️ Le verdict n'est affiché que lorsque l'intervalle de confiance permet de TRANCHER. Tant qu'il
// chevauche le seuil, on annonce « pas encore concluant » et l'effort restant — un pourcentage seul,
// sans sa marge, serait un chiffre faux affiché avec assurance.

import React, { useMemo, useState } from 'react';
import { PrivateText } from '../ui/PrivateText';
import type { CategoryReviewState, Transaction } from '../../types';
import {
    drawReviewSample,
    computeErrorRate,
    eligibleForReview,
    RECOMMENDED_SAMPLE_SIZE,
} from '../../services/transactions/reviewSample';
import { formatCAD, formatPercent } from '../../utils/format';
import { PrivateAmount } from '../ui/PrivateAmount';
import { Icon } from '../ui/Icon';

interface Props {
    transactions: Transaction[];
    review?: CategoryReviewState;
    onChange: (next: CategoryReviewState | undefined) => void;
    /** Ouvre la correction d'une transaction jugée mal classée (réutilise l'édition existante). */
    onFixCategory: (id: number) => void;
}

export const CategoryReviewPanel: React.FC<Props> = ({ transactions, review, onChange, onFixCategory }) => {
    const [open, setOpen] = useState(false);

    const poolSize = useMemo(
        () => (open ? eligibleForReview(transactions).length : 0),
        [open, transactions],
    );

    const sample = useMemo(
        () => (review ? drawReviewSample(transactions, review.size, review.seed) : []),
        [review, transactions],
    );

    const reviewedSet = useMemo(() => new Set(review?.reviewedIds ?? []), [review]);
    const estimate = useMemo(
        () => computeErrorRate(review?.reviewedIds.length ?? 0, review?.errorIds.length ?? 0, 1),
        [review],
    );

    /** Prochaine transaction non encore jugée — on en présente UNE à la fois. */
    const next = useMemo(
        () => sample.find((t) => !reviewedSet.has(t.id)),
        [sample, reviewedSet],
    );

    const start = (): void => {
        onChange({
            // La graine vient de l'horloge : une NOUVELLE revue doit tirer un autre échantillon, sinon
            // on re-juge éternellement les mêmes lignes et le taux ne mesure plus rien.
            seed: Date.now() % 2_147_483_647,
            size: RECOMMENDED_SAMPLE_SIZE,
            reviewedIds: [],
            errorIds: [],
            startedAt: Date.now(),
        });
    };

    const judge = (id: number, correct: boolean): void => {
        if (!review) return;
        onChange({
            ...review,
            reviewedIds: [...review.reviewedIds, id],
            errorIds: correct ? review.errorIds : [...review.errorIds, id],
        });
        if (!correct) onFixCategory(id);
    };

    const remaining = sample.length - (review?.reviewedIds.length ?? 0);

    return (
        <div className="rounded-xl border border-primary/20 bg-primary/5">
            <button
                onClick={() => setOpen((p) => !p)}
                aria-expanded={open}
                className="w-full flex items-center justify-between px-4 py-3 text-meta font-bold text-ink-200 hover:text-ink-50 transition-colors"
            >
                <span className="flex items-center gap-2">
                    <Icon name="actions" size={15} className="text-ink-400" />
                    Mesurer la qualité du classement
                    {review && (
                        <span className="bg-white/10 text-ink-300 px-2 py-0.5 rounded-full">
                            {review.reviewedIds.length}/{sample.length} jugées
                        </span>
                    )}
                </span>
                <span className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">▼</span>
            </button>

            {open && (
                <div className="px-4 pb-4 space-y-3">
                    {!review && (
                        <>
                            <p className="text-meta text-ink-300">
                                Tire {RECOMMENDED_SAMPLE_SIZE} transactions au hasard et te les présente une par
                                une. Tu dis si la catégorie est bonne — l&apos;app en déduit ton vrai taux
                                d&apos;erreur, avec sa marge.{' '}
                                <span className="text-ink-400">
                                    C&apos;est le seul moyen de vérifier l&apos;objectif « moins de 1 % » : il
                                    n&apos;existe aucune liste de référence à laquelle se comparer.
                                </span>
                            </p>
                            <p className="text-meta text-ink-400">
                                {poolSize} transaction{poolSize > 1 ? 's' : ''} éligible{poolSize > 1 ? 's' : ''}.
                                Compte une quinzaine de minutes ; tu peux t&apos;arrêter et reprendre, l&apos;échantillon
                                ne bouge pas.
                            </p>
                            <button
                                onClick={start}
                                disabled={poolSize === 0}
                                className="px-3 py-2 rounded-lg text-meta font-bold bg-primary text-dark disabled:opacity-40 focus-ring min-h-[24px]"
                            >
                                Commencer la revue
                            </button>
                        </>
                    )}

                    {review && (
                        <>
                            {/* Région live PERMANENTE : n'en changer que le texte (WCAG 4.1.3). */}
                            <p role="status" aria-live="polite" className="text-meta text-ink-200">
                                {estimate.reviewed === 0
                                    ? 'Aucune transaction jugée pour l\'instant.'
                                    : estimate.conclusive
                                        ? estimate.verdict === 'sous-seuil'
                                            ? `Objectif atteint : moins de 1 % d'erreurs (${estimate.errors} sur ${estimate.reviewed} jugées, au plus ${formatPercent(estimate.highPct, 2)}).`
                                            : `Au-dessus de l'objectif : au moins ${formatPercent(estimate.lowPct, 2)} d'erreurs (${estimate.errors} sur ${estimate.reviewed}).`
                                        : `Pas encore concluant : ${estimate.errors} erreur${estimate.errors > 1 ? 's' : ''} sur ${estimate.reviewed} jugées — le vrai taux est entre ${formatPercent(estimate.lowPct, 2)} et ${formatPercent(estimate.highPct, 2)}. Encore ${remaining} à juger.`}
                            </p>

                            {next ? (
                                <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-meta text-ink-400">{next.date}</span>
                                        <PrivateAmount className="text-meta font-bold text-ink-100">
                                            {formatCAD(next.amount)}
                                        </PrivateAmount>
                                    </div>
                                    <PrivateText as="div" className="text-body text-ink-100 truncate">{next.payee || '(sans libellé)'}</PrivateText>
                                    <div className="text-meta text-ink-300">
                                        Classée : <PrivateText quoi="categorie" className="font-bold text-ink-100">{next.category || 'Non catégorisé'}</PrivateText>
                                        {next.isTransfer && <span className="text-ink-400"> · marquée virement interne</span>}
                                    </div>
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        <button
                                            onClick={() => judge(next.id, true)}
                                            className="px-3 py-2 rounded-lg text-meta font-bold bg-success-600 text-white focus-ring min-h-[24px]"
                                        >
                                            C&apos;est bon
                                        </button>
                                        <button
                                            onClick={() => judge(next.id, false)}
                                            className="px-3 py-2 rounded-lg text-meta font-bold bg-warning-600 text-white focus-ring min-h-[24px]"
                                        >
                                            Mal classée
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-meta text-ink-300">
                                    Échantillon terminé — {sample.length} transaction{sample.length > 1 ? 's' : ''} jugée
                                    {sample.length > 1 ? 's' : ''}.
                                </p>
                            )}

                            <button
                                onClick={() => onChange(undefined)}
                                className="px-3 py-2 rounded-lg text-meta bg-white/5 text-ink-300 border border-white/10 focus-ring min-h-[24px]"
                            >
                                Effacer cette revue
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
