import React, { useState, useEffect } from 'react';
import { Tab, AppState, User } from '../../types';
import { useFinanceStore, type FinanceState } from '../../store/useFinanceStore';
import { Icon, type IconName } from '../ui/Icon';
import { showToast } from '../ui/Toast';
import { PayslipUploadCard } from '../settings/PayslipUploadCard';
import { getPersonaOrDefault, DEFAULT_PERSONA_ID } from '../../services/testFixtures';

/**
 * Setup-first par page (demande Marc 2026-06).
 *
 * Chaque page déclare ses PRÉREQUIS (données + import du bon document). Tant
 * qu'ils ne sont pas remplis, `PageSetupGate` n'affiche RIEN du contenu réel
 * de la page : il rend un écran de setup listant ce qu'il manque, avec
 * SAISIE MANUELLE inline + IMPORT du document pertinent + DONNÉES DE TEST.
 * Une fois les prérequis satisfaits, la page s'affiche normalement.
 *
 * Pilote : Tab.TAX (Impôts). À dérouler ensuite sur les autres pages via le
 * registre `PAGE_SETUP` ci-dessous.
 *
 * Perf : le gate/écran ne souscrivent QUE des dérivés (booléen `allMet`,
 * compteur `done`, valeurs des champs) — jamais l'état entier — pour ne pas
 * re-render la page enfant à chaque mutation du store. Les handlers lisent
 * l'état LIVE via `useFinanceStore.getState()`.
 */

// ──────────────────────────────────────────────────────────── Types ────────
interface SetupField {
    id: string;
    label: string;
    /** Champ optionnel : n'entre pas dans `isMet`, juste proposé à la saisie. */
    optional?: boolean;
    unit?: string;
    placeholder?: string;
    get: (s: FinanceState) => number;
    /** Retourne le slice à fusionner. Reçoit le brouillon d'état déjà patché par
     *  les champs précédents (`draft`) — relire UNIQUEMENT `draft`, jamais le store. */
    toState: (draft: FinanceState, v: number) => Partial<AppState>;
}

/** Documents importables (mappés vers un composant d'import autonome). */
type ImportKind = 'payslip';

interface SetupRequirement {
    id: string;
    label: string;
    help?: string;
    icon?: IconName;
    isMet: (s: FinanceState) => boolean;
    /** Saisie manuelle (toujours proposée si présente). */
    fields?: SetupField[];
    /** Validation bloquante à l'enregistrement (message d'erreur ou null). */
    validate?: (vals: Record<string, string>) => string | null;
    /** Import du document pertinent (alternative à la saisie). */
    importKind?: ImportKind;
}

interface PageSetupConfig {
    title: string;
    intro: string;
    requirements: SetupRequirement[];
}

// ──────────────────────────────────────────────────────────── Helpers ──────
const EMPTY_FIELDS: SetupField[] = [];

const patchUser = (users: [User, User], idx: number, patch: Partial<User>): [User, User] =>
    users.map((u, i) => (i === idx ? { ...u, ...patch } : u)) as [User, User];

// ─────────────────────────────────────────────────────────── Registre ──────
// NB : pilote = Impôts. Les autres pages seront ajoutées ici (1 entrée / Tab).
export const PAGE_SETUP: Partial<Record<Tab, PageSetupConfig>> = {
    [Tab.TAX]: {
        title: 'Impôts & Docs',
        intro:
            "Pour calculer ton impôt fédéral + Québec, il me faut au moins ton salaire brut. " +
            "Saisis-le à la main, ou importe un talon de paie — l'IA Vision le lit et remplit le profil.",
        requirements: [
            {
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
            },
        ],
    },
};

const IMPORT_COMPONENTS: Record<ImportKind, React.FC> = {
    payslip: () => <PayslipUploadCard />,
};

// ───────────────────────────────────────────────────── Requirement card ────
const RequirementCard: React.FC<{ req: SetupRequirement }> = ({ req }) => {
    const fields = req.fields ?? EMPTY_FIELDS;
    // Souscriptions ÉTROITES : le booléen `met` + une signature des valeurs des
    // champs (pour resync après import/données-de-test), pas l'état entier.
    const met = useFinanceStore((s) => req.isMet(s));
    const fieldsSig = useFinanceStore((s) => fields.map((f) => f.get(s)).join('|'));
    const setAppState = useFinanceStore((s) => s.setAppState);

    const [vals, setVals] = useState<Record<string, string>>(() =>
        Object.fromEntries(fields.map((f) => [f.id, String(f.get(useFinanceStore.getState()) || '')])),
    );

    // Resync quand le store change SOUS la carte (import talon, données de test) —
    // corrige le bug « init une seule fois » qui faisait écraser des valeurs importées.
    useEffect(() => {
        const s = useFinanceStore.getState();
        setVals(Object.fromEntries(fields.map((f) => [f.id, String(f.get(s) || '')])));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fieldsSig]);

    const save = () => {
        const err = req.validate?.(vals);
        if (err) { showToast(err, 'error'); return; }
        // État LIVE (pas la closure du render) ; compose les écritures via `draft`.
        let draft = useFinanceStore.getState();
        const touched = new Set<keyof AppState>();
        for (const f of fields) {
            const v = Number(vals[f.id]) || 0;
            const partial = f.toState(draft, v);
            (Object.keys(partial) as (keyof AppState)[]).forEach((k) => touched.add(k));
            draft = { ...draft, ...partial } as FinanceState;
        }
        // N'envoie que les slices touchés, avec leur valeur finale composée.
        const finalPatch: Partial<AppState> = {};
        const fp = finalPatch as unknown as Record<string, unknown>;
        const draftRec = draft as unknown as Record<string, unknown>;
        touched.forEach((k) => { fp[k as string] = draftRec[k as string]; });
        setAppState(finalPatch);
        showToast('Données enregistrées.', 'success');
    };

    const ImportComp = req.importKind ? IMPORT_COMPONENTS[req.importKind] : null;

    return (
        <div className="rounded-2xl border border-white/10 bg-surface/50 p-5 space-y-4">
            <div className="flex items-start gap-3">
                <span
                    className={`shrink-0 w-9 h-9 rounded-card flex items-center justify-center ${
                        met ? 'bg-success-500/15 text-success-400' : 'bg-white/[0.08] text-ink-300'
                    }`}
                    aria-hidden="true"
                >
                    <Icon name={met ? 'check' : req.icon ?? 'alert'} size={18} />
                </span>
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <h2 className="text-body font-bold text-ink-50">{req.label}</h2>
                        {met && <span className="text-tiny font-bold text-success-400 uppercase tracking-wider">Prêt</span>}
                    </div>
                    {req.help && <p className="text-meta text-ink-400 mt-0.5">{req.help}</p>}
                </div>
            </div>

            {fields.length > 0 && (
                <div className="space-y-3">
                    <div className="grid sm:grid-cols-2 gap-3">
                        {fields.map((f) => (
                            <label key={f.id} className="block">
                                <span className="text-tiny uppercase tracking-wider text-ink-400 font-semibold">{f.label}</span>
                                <div className="mt-1 flex items-center gap-2 rounded-card bg-white/5 border border-white/10 px-3 focus-within:border-primary/40 transition-colors">
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        value={vals[f.id] ?? ''}
                                        placeholder={f.placeholder ?? '0'}
                                        onChange={(e) => setVals((p) => ({ ...p, [f.id]: e.target.value }))}
                                        aria-label={f.label}
                                        className="flex-1 min-w-0 bg-transparent py-2 text-body text-ink-50 outline-none font-mono"
                                    />
                                    {f.unit && <span className="text-meta text-ink-500 shrink-0">{f.unit}</span>}
                                </div>
                            </label>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={save}
                        className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-card bg-primary text-dark text-meta font-bold hover:bg-white transition-colors focus-ring"
                    >
                        Enregistrer
                    </button>
                </div>
            )}

            {ImportComp && (
                <div className="space-y-3">
                    <div className="flex items-center gap-3 text-tiny uppercase tracking-widest text-ink-500" aria-hidden="true">
                        <span className="h-px flex-1 bg-white/10" /> ou importer <span className="h-px flex-1 bg-white/10" />
                    </div>
                    <ImportComp />
                </div>
            )}
        </div>
    );
};

// ──────────────────────────────────────────────────────── Setup screen ─────
const PageSetup: React.FC<{ config: PageSetupConfig }> = ({ config }) => {
    const enableTestMode = useFinanceStore((s) => s.enableTestMode);
    const total = config.requirements.length;
    // Dérivé : ne re-render que quand le compteur change (pas tout le store).
    const done = useFinanceStore((s) => config.requirements.filter((r) => r.isMet(s)).length);

    // Option « données de test » : charge le persona par défaut (remplit tout →
    // la page se débloque) en activant le MODE TEST (bannière explicite = données
    // fictives). Alternative à la saisie manuelle / l'import.
    const loadTestData = () => {
        const persona = getPersonaOrDefault(DEFAULT_PERSONA_ID);
        enableTestMode(persona.build(), persona.id);
    };

    return (
        <div
            className="max-w-3xl mx-auto space-y-6 animate-fade-in pb-20"
            role="region"
            aria-labelledby="page-setup-title"
        >
            <div className="rounded-2xl border border-warning-500/25 bg-gradient-to-b from-warning-500/[0.06] to-transparent p-6">
                <div className="flex items-center gap-2 text-tiny uppercase tracking-widest text-warning-400 mb-2">
                    <Icon name="lock" size={14} /> Page verrouillée — configuration requise
                </div>
                <h1 id="page-setup-title" className="text-display font-bold text-ink-50">{config.title}</h1>
                <p className="text-body text-ink-300 mt-2 max-w-xl">{config.intro}</p>
                <p className="text-meta text-ink-500 mt-1.5 max-w-xl">
                    Rien ne s'affiche tant que les prérequis ci-dessous ne sont pas remplis — saisie manuelle, import,
                    ou données de test.
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
                    <div
                        className="flex items-center gap-3 min-w-[180px]"
                        role="progressbar"
                        aria-valuenow={done}
                        aria-valuemin={0}
                        aria-valuemax={total}
                        aria-label={`Configuration : ${done} sur ${total} prérequis prêts`}
                    >
                        <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden max-w-[12rem]">
                            <div className="h-full bg-primary rounded-full transition-[width] duration-300" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
                        </div>
                        <span className="text-meta text-ink-400 font-mono shrink-0" aria-hidden="true">{done}/{total} prêt{done > 1 ? 's' : ''}</span>
                    </div>
                    <button
                        type="button"
                        onClick={loadTestData}
                        className="inline-flex items-center gap-2 min-h-[44px] px-3 py-1.5 rounded-card border border-white/15 bg-white/5 text-meta font-medium text-ink-200 hover:bg-white/10 hover:text-ink-50 transition-colors focus-ring"
                    >
                        <Icon name="flask" size={14} />
                        Explorer avec des données de test
                    </button>
                </div>
            </div>
            {config.requirements.map((req) => (
                <RequirementCard key={req.id} req={req} />
            ))}
        </div>
    );
};

// ────────────────────────────────────────────────────────────── Gate ───────
export const PageSetupGate: React.FC<{ tab: Tab; children: React.ReactNode }> = ({ tab, children }) => {
    const config = PAGE_SETUP[tab];
    // Souscrit UNIQUEMENT au booléen dérivé → la page enfant ne re-render pas à
    // chaque mutation du store (seulement quand le verrou bascule).
    const allMet = useFinanceStore((s) => !config || config.requirements.every((r) => r.isMet(s)));
    if (!config || allMet) return <>{children}</>;
    return <PageSetup config={config} />;
};
