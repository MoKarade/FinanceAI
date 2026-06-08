import React, { useState, useMemo } from 'react';
import { Tab, AppState } from '../../types';
import { useFinanceStore, type FinanceState } from '../../store/useFinanceStore';
import { Icon } from '../ui/Icon';
import { showToast } from '../ui/Toast';
import { PayslipUploadCard } from '../settings/PayslipUploadCard';
import { getPersonaOrDefault, DEFAULT_PERSONA_ID } from '../../services/testFixtures';
import { REQUIREMENTS, type Requirement, type RequirementId, type RequirementField, type ImportKind } from './requirements';

/**
 * Setup-first par page (demande Marc 2026-06).
 *
 * Chaque page déclare ses PRÉREQUIS (IDs → registre central `REQUIREMENTS`).
 * Tant qu'ils ne sont pas remplis :
 *  - mode `hard` → RIEN du contenu réel ; on rend l'écran de setup (saisie +
 *    import + données de test). Trois façons de débloquer :
 *      • remplir / importer la donnée,
 *      • « Créer via la page » (forceShow) pour les prérequis non-saisissables
 *        inline (listes : projets immo, objectifs enfant…),
 *      • opt-out « pas concerné » (persisté, réversible) si déclaré.
 *  - mode `soft` → contenu visible + bannière de complétion repliable.
 */

// ─────────────────────────────────────────────────────────── Registre ──────
interface PageSetup {
    mode: 'hard' | 'soft';
    title: string;
    intro: string;
    requirementIds: RequirementId[];
    /** L'utilisateur peut déclarer « pas concerné » (persisté, réversible). */
    optOut?: { key: string; label: string };
    /** Prérequis « liste » non-saisissables inline : autorise « Créer via la page ». */
    allowCreateInPage?: boolean;
}

export const PAGE_SETUP: Partial<Record<Tab, PageSetup>> = {
    [Tab.TAX]: {
        mode: 'hard',
        title: 'Impôts & Docs',
        intro:
            "Pour calculer ton impôt fédéral + Québec, il me faut au moins ton salaire brut. " +
            "Saisis-le à la main, ou importe un talon de paie — l'IA Vision le lit et remplit le profil.",
        requirementIds: ['salary'],
    },
    [Tab.RETIREMENT]: {
        mode: 'hard',
        title: 'Retraite',
        intro:
            "Pour projeter ta retraite, il me faut ton salaire et ton profil retraite (âge cible, revenu visé). " +
            "Saisis-les, importe un talon, ou explore avec des données de test.",
        requirementIds: ['salary', 'retirementProfile'],
    },
    [Tab.REAL_ESTATE]: {
        mode: 'hard',
        title: 'Immobilier',
        intro:
            "Cette page planifie un projet immobilier (achat, louer vs acheter, refinancement). " +
            "Crée ton premier projet, ou indique que tu n'es pas concerné — tu pourras changer d'avis plus tard.",
        requirementIds: ['realEstate'],
        optOut: { key: 'realEstate', label: "Je n'ai pas de projet immobilier" },
        allowCreateInPage: true,
    },
    [Tab.CHILD]: {
        mode: 'hard',
        title: 'Enfant',
        intro:
            "Cette page planifie les coûts d'un enfant (REEE, garde, etc.). " +
            "Crée ton premier objectif, ou indique que tu n'es pas concerné — réversible à tout moment.",
        requirementIds: ['children'],
        optOut: { key: 'children', label: 'Je ne suis pas concerné' },
        allowCreateInPage: true,
    },
    [Tab.FUTURE]: {
        mode: 'hard',
        title: 'Projection Future',
        intro:
            "Pour une projection fiable, il me faut l'essentiel : ton salaire, au moins un placement, " +
            "et ton profil retraite. Voici ce qui manque :",
        requirementIds: ['salary', 'assets', 'retirementProfile'],
    },
};

const EMPTY_FIELDS: RequirementField[] = [];

/** Composants d'import autonomes par type de document (complété au déroulé). */
const IMPORT_COMPONENTS: Partial<Record<ImportKind, React.FC>> = {
    payslip: () => <PayslipUploadCard />,
};

// ───────────────────────────────────────────────────── Requirement card ────
const RequirementCard: React.FC<{ req: Requirement }> = ({ req }) => {
    const fields = req.fields ?? EMPTY_FIELDS;
    // Souscriptions ÉTROITES : `met` + signature des valeurs (resync), pas l'état entier.
    const met = useFinanceStore((s) => req.isMet(s));
    const fieldsSig = useFinanceStore((s) => fields.map((f) => f.get(s)).join('|'));
    const setAppState = useFinanceStore((s) => s.setAppState);
    const navigateWithFocus = useFinanceStore((s) => s.navigateWithFocus);

    const [vals, setVals] = useState<Record<string, string>>(() =>
        Object.fromEntries(fields.map((f) => [f.id, String(f.get(useFinanceStore.getState()) || '')])),
    );

    // Resync quand le store change SOUS la carte (import, données de test).
    React.useEffect(() => {
        const s = useFinanceStore.getState();
        setVals(Object.fromEntries(fields.map((f) => [f.id, String(f.get(s) || '')])));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fieldsSig]);

    const save = () => {
        const err = req.validate?.(vals);
        if (err) { showToast(err, 'error'); return; }
        let draft = useFinanceStore.getState();
        const touched = new Set<keyof AppState>();
        for (const f of fields) {
            const v = Number(vals[f.id]) || 0;
            const partial = f.toState(draft, v);
            (Object.keys(partial) as (keyof AppState)[]).forEach((k) => touched.add(k));
            draft = { ...draft, ...partial } as FinanceState;
        }
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

            {/* Prérequis « liste » non-saisissable inline, mais avec une page dédiée → on y navigue. */}
            {fields.length === 0 && !met && req.focus && (
                <button
                    type="button"
                    onClick={() => navigateWithFocus(req.focus!.tab, req.focus!.section || undefined)}
                    className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-card border border-white/15 bg-white/5 text-meta font-medium text-ink-100 hover:bg-white/10 hover:text-ink-50 transition-colors focus-ring"
                >
                    <Icon name="settings" size={14} /> Configurer / ajouter →
                </button>
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

// ──────────────────────────────────────────── Écran setup plein (hard) ─────
const FullSetupScreen: React.FC<{
    config: PageSetup;
    requirements: Requirement[];
    onCreateInPage?: () => void;
}> = ({ config, requirements, onCreateInPage }) => {
    const enableTestMode = useFinanceStore((s) => s.enableTestMode);
    const setAppState = useFinanceStore((s) => s.setAppState);
    const total = requirements.length;
    const done = useFinanceStore((s) => requirements.filter((r) => r.isMet(s)).length);

    const loadTestData = () => {
        const persona = getPersonaOrDefault(DEFAULT_PERSONA_ID);
        enableTestMode(persona.build(), persona.id);
    };

    const optOut = () => {
        if (!config.optOut) return;
        const cur = useFinanceStore.getState().setupOptOut ?? {};
        setAppState({ setupOptOut: { ...cur, [config.optOut.key]: true } });
        showToast('Noté — tu pourras activer cette page quand tu veux.', 'info');
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
                    Rien ne s'affiche tant que les prérequis ci-dessous ne sont pas remplis.
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
                    <div
                        className="flex items-center gap-3 min-w-[170px]"
                        role="progressbar"
                        aria-valuenow={done}
                        aria-valuemin={0}
                        aria-valuemax={total}
                        aria-label={`Configuration : ${done} sur ${total} prérequis prêts`}
                    >
                        <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden max-w-[10rem]">
                            <div className="h-full bg-primary rounded-full transition-[width] duration-300" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
                        </div>
                        <span className="text-meta text-ink-400 font-mono shrink-0" aria-hidden="true">{done}/{total} prêt{done > 1 ? 's' : ''}</span>
                    </div>
                    {onCreateInPage && (
                        <button
                            type="button"
                            onClick={onCreateInPage}
                            className="inline-flex items-center gap-2 min-h-[44px] px-3 py-1.5 rounded-card bg-primary text-dark text-meta font-bold hover:bg-white transition-colors focus-ring"
                        >
                            <Icon name="plus" size={14} /> Créer via la page
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={loadTestData}
                        className="inline-flex items-center gap-2 min-h-[44px] px-3 py-1.5 rounded-card border border-white/15 bg-white/5 text-meta font-medium text-ink-200 hover:bg-white/10 hover:text-ink-50 transition-colors focus-ring"
                    >
                        <Icon name="flask" size={14} /> Données de test
                    </button>
                    {config.optOut && (
                        <button
                            type="button"
                            onClick={optOut}
                            className="inline-flex items-center gap-2 min-h-[44px] px-3 py-1.5 rounded-card text-meta font-medium text-ink-400 hover:text-ink-100 transition-colors focus-ring"
                        >
                            {config.optOut.label}
                        </button>
                    )}
                </div>
            </div>
            {requirements.map((req) => (
                <RequirementCard key={req.id} req={req} />
            ))}
        </div>
    );
};

// ──────────────────────────────────────── Bannière de complétion (soft) ────
const SoftSetupBanner: React.FC<{ title: string; requirements: Requirement[] }> = ({ title, requirements }) => {
    const [open, setOpen] = useState(false);
    const missing = useFinanceStore((s) => requirements.filter((r) => !r.isMet(s)).length);
    if (missing === 0) return null;

    return (
        <div className="mb-6">
            <div className="rounded-2xl border border-warning-500/25 bg-warning-500/[0.06] p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-meta text-warning-300">
                    <Icon name="alert" size={16} className="shrink-0" />
                    <span>{missing} donnée{missing > 1 ? 's' : ''} recommandée{missing > 1 ? 's' : ''} pour enrichir « {title} ».</span>
                </div>
                <button
                    type="button"
                    onClick={() => setOpen((o) => !o)}
                    aria-expanded={open}
                    className="inline-flex items-center gap-2 min-h-[40px] px-3 py-1.5 rounded-card border border-white/15 bg-white/5 text-meta font-medium text-ink-200 hover:bg-white/10 hover:text-ink-50 transition-colors focus-ring"
                >
                    <Icon name="settings" size={14} /> {open ? 'Masquer' : 'Compléter'}
                </button>
            </div>
            {open && (
                <div className="mt-4 space-y-4">
                    {requirements.map((req) => <RequirementCard key={req.id} req={req} />)}
                </div>
            )}
        </div>
    );
};

// ────────────────────────────────────────────────────────────── Gate ───────
export const PageSetupGate: React.FC<{ tab: Tab; children: React.ReactNode }> = ({ tab, children }) => {
    const config = PAGE_SETUP[tab];
    const requirements = useMemo(
        () => (config ? config.requirementIds.map((id) => REQUIREMENTS[id]) : []),
        [config],
    );
    // Souscrit à des dérivés (booléens) → pas de re-render de la page enfant
    // à chaque mutation du store, seulement quand le verrou bascule.
    const allMet = useFinanceStore((s) => requirements.every((r) => r.isMet(s)));
    const optedOut = useFinanceStore((s) => !!(config?.optOut && s.setupOptOut?.[config.optOut.key]));
    // « Créer via la page » : éphémère (par instance de gate = par onglet ; reset
    // au changement d'onglet car TabRouter démonte/remonte le gate).
    const [forceShow, setForceShow] = useState(false);

    if (!config) return <>{children}</>;

    if (config.mode === 'soft') {
        return <><SoftSetupBanner title={config.title} requirements={requirements} />{children}</>;
    }

    if (allMet || optedOut || forceShow) return <>{children}</>;

    return (
        <FullSetupScreen
            config={config}
            requirements={requirements}
            onCreateInPage={config.allowCreateInPage ? () => setForceShow(true) : undefined}
        />
    );
};
