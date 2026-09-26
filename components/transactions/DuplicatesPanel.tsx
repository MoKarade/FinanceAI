// components/transactions/DuplicatesPanel.tsx
//
// [TX-DUPLICATES] Panneau de détection des transactions en double.
//
// ⚠️ Il PROPOSE, il ne décide pas. Aucun marquage automatique : deux dépenses identiques le même
// jour sont un vrai faux positif, et marquer à tort retire de l'argent RÉEL de tous les calculs
// (cash dérivé, budget, revenus). L'utilisateur coche ce qu'il valide.
//
// ⚠️ On MARQUE, on ne SUPPRIME pas (ADR « Suppressions via MCP/IA ») : le cash est dérivé des
// transactions, une suppression déplacerait le solde en silence. Le marquage est réversible.

import React, { useMemo, useState } from 'react';
import { PrivateText } from '../ui/PrivateText';
import type { Transaction } from '../../types';
import {
    findDuplicateGroups,
    summarizeDuplicates,
    type DuplicateGroup,
} from '../../services/transactions/duplicateDetection';
import { formatCAD } from '../../utils/format';
import { PrivateAmount } from '../ui/PrivateAmount';
import { Icon } from '../ui/Icon';

interface Props {
    transactions: Transaction[];
    /** Marque les ids validés comme doublons (exclus de tous les calculs, réversible). */
    onMarkDuplicates: (ids: number[]) => void;
    /** Nombre de transactions actuellement marquées — pour proposer l'annulation. */
    markedCount: number;
    onUnmarkAll: () => void;
    /** [S5-REFONTE-TRANSACTIONS] Rendu DANS le panneau d'outil de la page (qui porte titre et
     *  fermeture) : ouvert d'emblée, sans son propre en-tête ni cadre. */
    integre?: boolean;
}

const TOLERANCES: Array<{ value: number; label: string }> = [
    { value: 0, label: 'Même jour' },
    { value: 1, label: '± 1 jour' },
    { value: 3, label: '± 3 jours' },
];

/**
 * [TX-DUPLICATES-BRUIT] Tolérance du panneau à l'ouverture ET du badge de l'en-tête replié —
 * SOURCE UNIQUE, délibérément. Les deux ont divergé au 1er jet de ce lot (badge figé à 0, panneau
 * réglable) : un badge qui ne compte pas ce que le panneau montrera affirme un chiffre que ses
 * sources ne donnent pas. Valeur 0 (même jour) assumée : c'est la seule où « même marchand, même
 * montant au cent » suffit à pré-cocher sans risque — à ±1 jour, deux achats RÉCURRENTS identiques
 * deux jours de suite (un petit achat quotidien) deviendraient pré-cochés, et `isDuplicate` retire
 * de l'argent réel du solde, du budget et des revenus. L'élargissement reste à UN clic dans le
 * panneau ; le badge dit sa portée dans son `title`.
 */
const TOLERANCE_PAR_DEFAUT = 0;

/** Libellé de la tolérance par défaut, DÉRIVÉ de `TOLERANCES` — jamais recopié, jamais par index. */
const LIBELLE_TOLERANCE_PAR_DEFAUT =
    TOLERANCES.find((t) => t.value === TOLERANCE_PAR_DEFAUT)?.label ?? `± ${TOLERANCE_PAR_DEFAUT} jour(s)`;

export const DuplicatesPanel: React.FC<Props> = ({
    transactions, onMarkDuplicates, markedCount, onUnmarkAll, integre = false,
}) => {
    const [open, setOpen] = useState(integre);
    const [tolerance, setTolerance] = useState(TOLERANCE_PAR_DEFAUT);
    /** Ids cochés pour marquage. Pré-remplis avec la suggestion, modifiables. */
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [dirty, setDirty] = useState(false);

    const groups = useMemo(
        // Ne calcule que si le panneau est ouvert : la détection parcourt tout l'historique.
        () => (open ? findDuplicateGroups(transactions, { dayToleranceDays: tolerance }) : []),
        [open, transactions, tolerance],
    );

    // [TX-DUPLICATES-BRUIT] Compte annoncé sur l'en-tête REPLIÉ. Marc, le 2026-09-15 : il voit ses
    // doublons « dans ma liste de transactions », jamais dans ce panneau — or le panneau ne disait
    // RIEN tant qu'on ne l'ouvrait pas, donc rien n'invitait à l'ouvrir. On n'annonce que les
    // groupes à marchand concordant : un badge gonflé par des collisions de montant ferait
    // exactement le tort qu'on vient de corriger. Tolérance = `TOLERANCE_PAR_DEFAUT`, la MÊME que
    // le panneau à l'ouverture (cf. sa justification), et une seule passe par changement de
    // `transactions` — la même complexité linéaire que l'ouverture du panneau.
    const detectedCount = useMemo(
        () => findDuplicateGroups(transactions, { dayToleranceDays: TOLERANCE_PAR_DEFAUT })
            .filter((g) => g.confiance !== 'faible')
            .reduce((n, g) => n + g.suggestedMarkIds.length, 0),
        [transactions],
    );

    // [TX-DUPLICATES-BRUIT] La sélection par défaut suit la suggestion — mais SEULEMENT pour les
    // groupes dont le marchand concorde. Mesuré sur les transactions réelles de Marc : à 3 jours de
    // tolérance, environ un tiers des groupes étaient des COLLISIONS DE MONTANT (une dépense ronde à un marchand quelconque avec un
    // paiement de carte et un Interac). Pré-cocher ça revenait à proposer d'effacer de l'argent
    // réel en un clic — et un panneau dont un tiers des propositions est faux se fait ignorer en
    // entier, ce qui est exactement ce que Marc a signalé le 2026-09-15.
    const effectiveSelected = useMemo(() => {
        if (dirty) return selected;
        return new Set(
            groups.filter((g) => g.confiance !== 'faible').flatMap((g) => g.suggestedMarkIds),
        );
    }, [dirty, selected, groups]);

    const summary = useMemo(() => summarizeDuplicates(groups), [groups]);

    const toggle = (id: number): void => {
        const next = new Set(effectiveSelected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelected(next);
        setDirty(true);
    };

    const apply = (): void => {
        onMarkDuplicates([...effectiveSelected]);
        setSelected(new Set());
        setDirty(false);
    };

    // ⚠️ La palette `warning` ne contient que 400/500/600 (cf. tailwind.config.js) : un
    // `warning-900` serait une classe MORTE, générée nulle part et sans erreur de build
    // (piège FIX-INK600-TOKEN, déjà récidivé une fois). D'où les shades 500 ci-dessous.
    return (
        <div className={integre ? '' : 'rounded-xl border border-warning-500/20 bg-warning-500/5'}>
            {!integre && <button
                onClick={() => { setOpen((p) => !p); setDirty(false); }}
                aria-expanded={open}
                className="w-full flex items-center justify-between px-4 py-3 text-meta font-bold text-ink-200 hover:text-ink-50 transition-colors"
            >
                <span className="flex items-center gap-2">
                    <Icon name="actions" size={15} className="text-ink-400" />
                    Doublons
                    {detectedCount > 0 && (
                        <span
                            className="bg-warning-500/20 text-warning-400 px-2 py-0.5 rounded-full"
                            title={`${LIBELLE_TOLERANCE_PAR_DEFAUT} et marchand concordant. Ouvre le panneau pour élargir l'écart de date toléré.`}
                        >
                            {detectedCount} détecté{detectedCount > 1 ? 's' : ''}
                        </span>
                    )}
                    {markedCount > 0 && (
                        <span className="bg-white/10 text-ink-300 px-2 py-0.5 rounded-full">
                            {markedCount} marqué{markedCount > 1 ? 's' : ''}
                        </span>
                    )}
                </span>
                <span className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">▼</span>
            </button>}

            {open && (
                <div className={integre ? 'space-y-3' : 'px-4 pb-4 space-y-3'}>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-meta text-ink-400">Écart de date toléré :</span>
                        {TOLERANCES.map((t) => (
                            <button
                                key={t.value}
                                onClick={() => { setTolerance(t.value); setDirty(false); }}
                                aria-pressed={tolerance === t.value}
                                className={`px-3 py-1 rounded-full text-meta min-h-[24px] focus-ring ${
                                    tolerance === t.value
                                        ? 'bg-warning-500/20 text-ink-50 border border-warning-500/40'
                                        : 'bg-white/5 text-ink-300 border border-white/10'
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {groups.length === 0 ? (
                        <p className="text-meta text-ink-400">
                            Aucun doublon détecté avec ce réglage. Un doublon = même montant exact, à une
                            date proche — le libellé n&apos;entre pas dans le critère, justement pour attraper
                            les doublons venus de deux sources d&apos;import différentes.
                        </p>
                    ) : (
                        <>
                            {groups.some((g) => g.confiance === 'faible') && (
                                <p className="text-meta text-ink-400">
                                    {groups.filter((g) => g.confiance === 'faible').length} groupe
                                    {groups.filter((g) => g.confiance === 'faible').length > 1 ? 's' : ''} ne
                                    sont PAS pré-cochés : leurs marchands ne concordent pas, donc c&apos;est
                                    presque toujours deux dépenses sans rapport qui font le même prix.
                                    Ils restent listés, à toi de juger.
                                </p>
                            )}
                            <p className="text-meta text-ink-300">
                                {summary.groupCount} groupe{summary.groupCount > 1 ? 's' : ''} ·{' '}
                                {summary.redundantCount} ligne{summary.redundantCount > 1 ? 's' : ''} en trop ·{' '}
                                <PrivateAmount className="font-bold text-ink-100">
                                    {formatCAD(summary.redundantAmount)}
                                </PrivateAmount>{' '}
                                en jeu. <span className="text-ink-400">Rien n&apos;est marqué tant que tu n&apos;as pas validé.</span>
                            </p>

                            <ul className="space-y-2 max-h-96 overflow-y-auto">
                                {groups.map((g) => (
                                    <GroupRow
                                        key={g.key}
                                        group={g}
                                        selected={effectiveSelected}
                                        onToggle={toggle}
                                    />
                                ))}
                            </ul>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={apply}
                                    disabled={effectiveSelected.size === 0}
                                    className="px-3 py-2 rounded-lg text-meta font-bold bg-warning-600 text-dark disabled:opacity-40 focus-ring min-h-[24px]"
                                >
                                    Marquer {effectiveSelected.size} transaction{effectiveSelected.size > 1 ? 's' : ''} en doublon
                                </button>
                                {markedCount > 0 && (
                                    <button
                                        onClick={onUnmarkAll}
                                        className="px-3 py-2 rounded-lg text-meta bg-white/5 text-ink-300 border border-white/10 focus-ring min-h-[24px]"
                                    >
                                        Annuler tous les marquages ({markedCount})
                                    </button>
                                )}
                            </div>
                            <p className="text-meta text-ink-400">
                                Marquer n&apos;efface rien : la transaction reste dans l&apos;historique, simplement
                                exclue du solde, du budget et des revenus. C&apos;est réversible.
                            </p>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

const GroupRow: React.FC<{
    group: DuplicateGroup;
    selected: Set<number>;
    onToggle: (id: number) => void;
}> = ({ group, selected, onToggle }) => (
    <li className="rounded-lg border border-white/10 bg-black/20 p-2">
        <div className="flex items-center justify-between gap-2 mb-1">
            <PrivateAmount className="text-meta font-bold text-ink-100">
                {formatCAD(group.amount)}
            </PrivateAmount>
            <span className="flex gap-1">
                {group.confiance === 'faible' && (
                    <span className="text-meta text-ink-400" title="Les marchands ne concordent pas : probablement deux dépenses différentes qui font le même prix">
                        marchands différents
                    </span>
                )}
                {group.confiance === 'haute' && (
                    <span className="text-meta text-warning-400" title="Même marchand, même jour, même montant">
                        même marchand, même jour
                    </span>
                )}
                {group.payeesDiffer && group.confiance !== 'faible' && (
                    <span className="text-meta text-warning-400" title="Les libellés diffèrent : probablement deux sources d'import">
                        libellés différents
                    </span>
                )}
                {group.datesDiffer && (
                    <span className="text-meta text-ink-400">dates proches</span>
                )}
            </span>
        </div>
        <ul className="space-y-1">
            {group.members.map((m) => {
                const isKeeper = m.id === group.suggestedKeepId;
                const checked = selected.has(m.id);
                return (
                    <li key={m.id} className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id={`dup-${m.id}`}
                            checked={checked}
                            onChange={() => onToggle(m.id)}
                            className="focus-ring"
                        />
                        <label htmlFor={`dup-${m.id}`} className="flex-1 text-meta text-ink-300 cursor-pointer">
                            <span className="text-ink-400">{m.date}</span>{' '}
                            <PrivateText className="text-ink-200">{m.payee || '(sans libellé)'}</PrivateText>
                            {m.accountName && <span className="text-ink-400"> · {m.accountName}</span>}
                            <span className="text-ink-400"> · <PrivateText quoi="categorie">{m.category}</PrivateText></span>
                            {isKeeper && !checked && (
                                <span className="ml-1 text-success-400">à conserver</span>
                            )}
                        </label>
                    </li>
                );
            })}
        </ul>
    </li>
);
