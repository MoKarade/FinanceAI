import { Tab, AppState, User } from '../../types';
import type { FinanceState } from '../../store/useFinanceStore';
import type { IconName } from '../ui/Icon';

/**
 * Registre CENTRAL des prérequis (source de vérité unique).
 *
 * Consommé par :
 *  - `PageSetupGate` (setup-first) — rend l'écran de setup (saisie + import).
 *  - `MissingDataBanner` / `MissingDataChecklist` — bannières « Configurer → ».
 *
 * Un même prérequis (ex. `salary`) est ainsi déclaré UNE fois et réutilisé par
 * plusieurs pages (Impôts + Retraite + Futur) — voir `requirementIds` dans
 * `PageSetupGate.PAGE_SETUP`.
 */

/** Documents importables (mappés vers un composant d'import dans PageSetupGate). */
export type ImportKind = 'payslip' | 'bankCsv' | 'broker';

export interface RequirementField {
    id: string;
    label: string;
    /** N'entre pas dans `isMet` ; juste proposé à la saisie. */
    optional?: boolean;
    unit?: string;
    placeholder?: string;
    get: (s: FinanceState) => number;
    /** Relit UNIQUEMENT le brouillon `draft` (déjà patché par les champs précédents). */
    toState: (draft: FinanceState, v: number) => Partial<AppState>;
}

export interface Requirement {
    id: string;
    label: string;
    help?: string;
    icon?: IconName;
    isMet: (s: FinanceState) => boolean;
    /** Saisie manuelle inline (setup-first). */
    fields?: RequirementField[];
    /** Validation bloquante à l'enregistrement (message ou null). */
    validate?: (vals: Record<string, string>) => string | null;
    /** Import du document pertinent (alternative à la saisie). */
    importKind?: ImportKind;
    /** Cible de navigation pour les bannières « Configurer → ». */
    focus?: { tab: Tab; section: string };
}

const patchUser = (users: [User, User], idx: number, patch: Partial<User>): [User, User] =>
    users.map((u, i) => (i === idx ? { ...u, ...patch } : u)) as [User, User];

export type RequirementId = 'salary' | 'retirementProfile' | 'assets' | 'realEstate' | 'children';

export const REQUIREMENTS: Record<RequirementId, Requirement> = {
    salary: {
        id: 'salary',
        label: 'Salaire — utilisateur principal',
        help: "Brut MENSUEL (le net est optionnel). Base du calcul d'impôt et des optimisations.",
        icon: 'tax',
        isMet: (s) => (s.config.users[0]?.grossSalary ?? 0) > 0,
        validate: (vals) => {
            const gross = Number(vals.gross) || 0;
            const net = Number(vals.net) || 0;
            if (gross <= 0) return 'Saisis un salaire brut mensuel (> 0).';
            if (net > gross) return 'Le salaire net ne peut pas dépasser le brut.';
            return null;
        },
        fields: [
            {
                id: 'gross', label: 'Salaire brut', unit: '$/mois', placeholder: 'ex. 5 000',
                get: (s) => s.config.users[0]?.grossSalary ?? 0,
                toState: (d, v) => ({ config: { ...d.config, users: patchUser(d.config.users, 0, { grossSalary: v }) } }),
            },
            {
                id: 'net', label: 'Salaire net (optionnel)', optional: true, unit: '$/mois', placeholder: 'ex. 3 500',
                get: (s) => s.config.users[0]?.netSalary ?? 0,
                toState: (d, v) => ({ config: { ...d.config, users: patchUser(d.config.users, 0, { netSalary: v }) } }),
            },
        ],
        importKind: 'payslip',
        focus: { tab: Tab.SETTINGS, section: 'profile-user1-grossSalary' },
    },

    retirementProfile: {
        id: 'retirementProfile',
        label: 'Profil retraite',
        help: 'Âge de retraite cible et revenu mensuel visé (espérance de vie optionnelle).',
        icon: 'retirement',
        isMet: (s) => (s.retirementGoal?.targetAge ?? 0) > 0 && (s.retirementGoal?.targetMonthlyIncome ?? 0) > 0,
        validate: (vals) => {
            if ((Number(vals.targetAge) || 0) <= 0) return 'Indique un âge de retraite cible (> 0).';
            if ((Number(vals.income) || 0) <= 0) return 'Indique un revenu mensuel visé (> 0).';
            return null;
        },
        fields: [
            {
                id: 'targetAge', label: 'Âge de retraite cible', unit: 'ans', placeholder: 'ex. 60',
                get: (s) => s.retirementGoal?.targetAge ?? 0,
                toState: (d, v) => ({ retirementGoal: { ...d.retirementGoal, targetAge: v } }),
            },
            {
                id: 'lifeExpectancy', label: 'Espérance de vie (optionnel)', optional: true, unit: 'ans', placeholder: 'ex. 90',
                get: (s) => s.retirementGoal?.lifeExpectancy ?? 0,
                toState: (d, v) => ({ retirementGoal: { ...d.retirementGoal, lifeExpectancy: v } }),
            },
            {
                id: 'income', label: 'Revenu mensuel visé', unit: '$/mois', placeholder: 'ex. 4 000',
                get: (s) => s.retirementGoal?.targetMonthlyIncome ?? 0,
                toState: (d, v) => ({ retirementGoal: { ...d.retirementGoal, targetMonthlyIncome: v } }),
            },
        ],
        focus: { tab: Tab.SETTINGS, section: 'profile-retirementAge' },
    },

    // Prérequis « liste » (pas de saisie inline) : on crée via la page elle-même
    // (bouton « Créer » → forceShow dans le gate) ou on navigue (focus).
    assets: {
        id: 'assets',
        label: 'Placements / actifs',
        help: 'Au moins un actif (action, ETF, crypto…) pour projeter la croissance.',
        icon: 'investments',
        isMet: (s) => (s.assets?.length ?? 0) > 0,
        focus: { tab: Tab.INVESTMENTS, section: '' },
    },
    realEstate: {
        id: 'realEstate',
        label: 'Projet immobilier',
        help: 'Au moins un projet activé (achat, refinancement, comparaison louer/acheter).',
        icon: 'real-estate',
        // Le state pré-amorce un objectif placeholder (isActive:false, price:0) :
        // on gate sur « configuré », pas sur la simple présence.
        isMet: (s) => (s.realEstateGoals ?? []).some((g) => g.isActive || (g.price ?? 0) > 0),
    },
    children: {
        id: 'children',
        label: 'Planification enfant',
        help: 'Au moins un objectif enfant activé (REEE, coûts de garde, etc.).',
        icon: 'child',
        // Idem : l'objectif par défaut a isActive:false → gate sur l'activation.
        isMet: (s) => (s.childGoals ?? []).some((g) => g.isActive),
    },
};

/** Prédicat partagé : un prérequis est-il satisfait dans l'état donné ? */
export const isRequirementMet = (id: RequirementId, s: FinanceState): boolean => REQUIREMENTS[id].isMet(s);
