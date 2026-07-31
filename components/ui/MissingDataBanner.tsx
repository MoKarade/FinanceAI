import React from 'react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { useShallow } from 'zustand/shallow';
import { Tab } from '../../types';
import type { FinanceState } from '../../store/useFinanceStore';
import { Icon } from './Icon';
import { REQUIREMENTS } from '../setup/requirements';

/**
 * Phase C.5 — bannière "Données manquantes" avec redirect vers le Hub.
 *
 * Pattern à utiliser DANS les autres onglets quand une donnée critique
 * manque pour produire un calcul fiable. Au lieu d'afficher un nombre
 * trompeur (zéro, NaN, fallback arbitraire) ou de planter, on rend une
 * bannière avec bouton "Configurer →" qui ouvre l'onglet Configuration
 * et focus le champ exact.
 *
 * Usage :
 *   <MissingDataBanner field="lifeExpectancy" />
 *   <MissingDataBanner field="user1.grossSalary" message="..." />
 *
 * Le champ doit être déclaré dans `MISSING_DATA_FIELDS` ci-dessous, ce qui
 * garantit qu'on documente CENTRALEMENT chaque donnée critique + où la
 * configurer.
 */

type MissingDataField =
    | 'lifeExpectancy'
    | 'retirementAge'
    | 'retirementIncome'
    | 'user1.name'
    | 'user1.grossSalary'
    | 'user1.netSalary'
    | 'user1.age'
    | 'user2.name'
    | 'user2.grossSalary'
    | 'user2.netSalary'
    | 'anthropicKey';

interface FieldDescriptor {
    label: string;
    section: string;
    tab: Tab;
    isMissing: (s: FinanceState) => boolean;
    helpText?: string;
}

// Note : `Tab.SETTINGS` est l'ancien nom ; sera renommé "Configuration" en C.1
// (la valeur d'enum reste identique pour préserver la rétrocompat).
const MISSING_DATA_FIELDS: Record<MissingDataField, FieldDescriptor> = {
    lifeExpectancy: {
        label: 'Espérance de vie',
        section: 'profile-lifeExpectancy',
        tab: Tab.SETTINGS,
        isMissing: (s) => !s.retirementGoal?.lifeExpectancy || s.retirementGoal.lifeExpectancy <= 0,
        helpText: 'Détermine la durée de la phase de décaissement projetée.',
    },
    retirementAge: {
        label: 'Âge de retraite cible',
        section: 'profile-retirementAge',
        tab: Tab.SETTINGS,
        isMissing: (s) => !s.retirementGoal?.targetAge || s.retirementGoal.targetAge <= 0,
        helpText: 'Pivote toutes les projections retraite (RRQ, PSV, drawdown).',
    },
    retirementIncome: {
        label: 'Revenus de retraite ciblés (mensuels)',
        section: 'profile-retirementIncome',
        tab: Tab.SETTINGS,
        isMissing: (s) => !s.retirementGoal?.targetMonthlyIncome || s.retirementGoal.targetMonthlyIncome <= 0,
    },
    'user1.name': {
        label: 'Votre nom',
        section: 'profile-user1-name',
        tab: Tab.SETTINGS,
        isMissing: (s) => !s.config?.users?.[0]?.name?.trim(),
    },
    'user1.grossSalary': {
        label: 'Salaire brut (vous)',
        section: 'profile-user1-grossSalary',
        tab: Tab.SETTINGS,
        // Source unique : délègue la condition au registre central (gate ↔ bannière).
        isMissing: (s) => !REQUIREMENTS.salary.isMet(s),
        helpText: 'Permet calcul exact impôt fédéral + QC.',
    },
    'user1.netSalary': {
        label: 'Salaire net (vous)',
        section: 'profile-user1-netSalary',
        tab: Tab.SETTINGS,
        isMissing: (s) => !s.config?.users?.[0]?.netSalary || s.config.users[0].netSalary <= 0,
    },
    'user1.age': {
        label: 'Votre âge',
        section: 'profile-user1-age',
        tab: Tab.SETTINGS,
        isMissing: (s) => !s.config?.users?.[0]?.age || s.config.users[0].age <= 0,
    },
    'user2.name': {
        label: 'Nom du conjoint',
        section: 'profile-user2-name',
        tab: Tab.SETTINGS,
        isMissing: (s) => !s.config?.users?.[1]?.name?.trim(),
    },
    'user2.grossSalary': {
        label: 'Salaire brut (conjoint)',
        section: 'profile-user2-grossSalary',
        tab: Tab.SETTINGS,
        isMissing: (s) => !s.config?.users?.[1]?.grossSalary || s.config.users[1].grossSalary <= 0,
    },
    'user2.netSalary': {
        label: 'Salaire net (conjoint)',
        section: 'profile-user2-netSalary',
        tab: Tab.SETTINGS,
        isMissing: (s) => !s.config?.users?.[1]?.netSalary || s.config.users[1].netSalary <= 0,
    },
    anthropicKey: {
        label: 'Clé API Anthropic',
        section: 'apiKeys-anthropic',
        tab: Tab.SETTINGS,
        isMissing: (s) => !s.apiKeys?.anthropic?.trim(),
        helpText: 'Active les diagnostics IA (budget, prochaine action, etc.).',
    },
};

interface MissingDataBannerProps {
    field: MissingDataField;
    /** Surcharge le message standard. */
    message?: string;
    /** Niveau visuel ; default 'warning'. */
    variant?: 'info' | 'warning' | 'danger';
    /** Inline (compact, 1 ligne) ou block (full, multi-ligne). */
    layout?: 'inline' | 'block';
    className?: string;
}

const VARIANT_STYLES: Record<NonNullable<MissingDataBannerProps['variant']>, string> = {
    info: 'bg-info-500/10 border-info-500/30 text-info-400',
    warning: 'bg-warning-500/10 border-warning-500/30 text-amber-300',
    danger: 'bg-danger-500/10 border-danger-500/30 text-red-300',
};

export const MissingDataBanner: React.FC<MissingDataBannerProps> = ({
    field,
    message,
    variant = 'warning',
    layout = 'block',
    className = '',
}) => {
    const descriptor = MISSING_DATA_FIELDS[field];
    const isMissing = useFinanceStore(descriptor.isMissing);
    const navigateWithFocus = useFinanceStore(s => s.navigateWithFocus);

    if (!isMissing) return null;

    const handleClick = () => navigateWithFocus(descriptor.tab, descriptor.section);

    const variantClass = VARIANT_STYLES[variant];

    if (layout === 'inline') {
        return (
            <button
                type="button"
                onClick={handleClick}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-card border ${variantClass} text-meta hover:opacity-90 focus-ring transition-opacity ${className}`}
                aria-label={`Donnée manquante : ${descriptor.label}. Configurer.`}
            >
                <Icon name="alert" size={14} className="shrink-0" />
                <span className="font-medium">{message || `${descriptor.label} manquant`}</span>
                <span className="text-tiny opacity-70" aria-hidden="true">→</span>
            </button>
        );
    }

    return (
        <div
            className={`rounded-card border p-3 ${variantClass} ${className}`}
            role="status"
            aria-live="polite"
        >
            <div className="flex items-start gap-3">
                <Icon name="alert" size={16} className="shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                    <div className="font-bold text-meta mb-0.5">Donnée manquante</div>
                    <div className="text-tiny opacity-90 mb-1">
                        {message || `${descriptor.label} doit être configuré pour produire un résultat fiable.`}
                    </div>
                    {descriptor.helpText && (
                        <div className="text-tiny opacity-70 italic">{descriptor.helpText}</div>
                    )}
                </div>
                <button
                    type="button"
                    onClick={handleClick}
                    className="shrink-0 px-3 py-1 rounded-card bg-white/10 hover:bg-white/20 text-tiny font-bold focus-ring transition-colors whitespace-nowrap"
                >
                    Configurer →
                </button>
            </div>
        </div>
    );
};

/**
 * Phase C.5 — checklist affichée dans le Hub Configuration. Liste tous les
 * champs manquants en un seul endroit pour permettre à l'utilisateur de
 * cocher rapidement ce qui reste à compléter.
 */
export const MissingDataChecklist: React.FC<{ className?: string }> = ({ className = '' }) => {
    // [PERF-MISSINGDATA] Sélecteur SHALLOW sur le tableau DÉRIVÉ des champs manquants : la checklist ne
    // re-render que quand l'ENSEMBLE des champs manquants change, PAS à chaque mutation du store (ex. les
    // écritures fréquentes pendant un calcul Monte-Carlo). Avant : `useFinanceStore()` s'abonnait au store ENTIER.
    const missingFields = useFinanceStore(useShallow((state) =>
        (Object.keys(MISSING_DATA_FIELDS) as MissingDataField[])
            .filter(f => MISSING_DATA_FIELDS[f].isMissing(state)),
    ));

    const totalFields = Object.keys(MISSING_DATA_FIELDS).length;
    const completedFields = totalFields - missingFields.length;
    const completedPct = Math.round((completedFields / totalFields) * 100);

    return (
        <div className={`rounded-card border border-white/10 bg-white/5 p-4 ${className}`}>
            <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-ink-50">État de la configuration</h3>
                <span className="text-meta text-ink-400 font-mono">{completedFields} / {totalFields}</span>
            </div>
            <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden mb-4 border border-white/5">
                <div
                    className={`h-full rounded-full transition-all duration-700 ${completedPct === 100 ? 'bg-success-500' : 'bg-gradient-to-r from-warning-400 to-success-400'}`}
                    style={{ width: `${completedPct}%` }}
                    aria-hidden="true"
                />
            </div>
            {missingFields.length === 0 ? (
                <div className="text-meta text-emerald-300 flex items-center gap-2">
                    <Icon name="check" size={15} className="shrink-0" />
                    Configuration complète — toutes les données critiques sont renseignées.
                </div>
            ) : (
                <div className="flex flex-wrap gap-2">
                    {missingFields.map(field => (
                        <MissingDataBanner key={field} field={field} layout="inline" variant="warning" />
                    ))}
                </div>
            )}
        </div>
    );
};
