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

export type RequirementId = 'salary';

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
};

/** Prédicat partagé : un prérequis est-il satisfait dans l'état donné ? */
export const isRequirementMet = (id: RequirementId, s: FinanceState): boolean => REQUIREMENTS[id].isMet(s);
