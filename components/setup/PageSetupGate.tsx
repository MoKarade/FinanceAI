import React, { useState, useEffect, useMemo } from 'react';
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
 * Chaque page déclare ses PRÉREQUIS (par IDs vers le registre central
 * `REQUIREMENTS`). Tant qu'ils ne sont pas remplis :
 *  - mode `hard` → RIEN du contenu réel ne s'affiche, on rend l'écran de setup
 *    (saisie manuelle + import + données de test) ;
 *  - mode `soft` → le contenu s'affiche AVEC une bannière de complétion (pour
 *    les pages où « vide » est un état légitime : Dettes, Immo, Enfant…).
 *
 * Le registre central est partagé avec `MissingDataBanner` (source unique).
 */

// ─────────────────────────────────────────────────────────── Registre ──────
interface PageSetup {
    mode: 'hard' | 'soft';
    title: string;
    intro: string;
    requirementIds: RequirementId[];
}

// Pilote = Impôts (hard, prérequis `salary` partagé avec Retraite/Futur au déroulé).
export const PAGE_SETUP: Partial<Record<Tab, PageSetup>> = {
    [Tab.TAX]: {
        mode: 'hard',
        title: 'Impôts & Docs',
        intro:
            "Pour calculer ton impôt fédéral + Québec, il me faut au moins ton salaire brut. " +
            "Saisis-le à la main, ou importe un talon de paie — l'IA Vision le lit et remplit le profil.",
        requirementIds: ['salary'],
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

    const [vals, setVals] = useState<Record<string, string>>(() =>
        Object.fromEntries(fields.map((f) => [f.id, String(f.get(useFinanceStore.getState()) || '')])),
    );

    // Resync quand le store change SOUS la carte (import talon, données de test).
    useEffect(() => {
        const s = useFinanceStore.getState();
        setVals(Object.fromEntries(fields.map((f) => [f.id, String(f.get(s) || '')])));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fieldsSig]);

    const save = () => {
        const err = req.validate?.(vals);
        if (err) { showToast(err, 'error'); return; }
        // État LIVE ; compose les écritures via `draft`.
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
const FullSetupScreen: React.FC<{ title: string; intro: string; requirements: Requirement[] }> = ({ title, intro, requirements }) => {
    const enableTestMode = useFinanceStore((s) => s.enableTestMode);
    const total = requirements.length;
    const done = useFinanceStore((s) => requirements.filter((r) => r.isMet(s)).length);

    // Option « données de test » : charge le persona par défaut (remplit tout →
    // la page se débloque) en activant le MODE TEST (bannière explicite = fictif).
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
                <h1 id="page-setup-title" className="text-display font-bold text-ink-50">{title}</h1>
                <p className="text-body text-ink-300 mt-2 max-w-xl">{intro}</p>
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
    // Souscrit UNIQUEMENT au booléen dérivé → la page enfant ne re-render pas à
    // chaque mutation du store (seulement quand le verrou bascule).
    const allMet = useFinanceStore((s) => requirements.every((r) => r.isMet(s)));

    if (!config) return <>{children}</>;

    if (config.mode === 'soft') {
        // « Vide » légitime : contenu visible + bannière de complétion.
        return <><SoftSetupBanner title={config.title} requirements={requirements} />{children}</>;
    }

    if (allMet) return <>{children}</>;
    return <FullSetupScreen title={config.title} intro={config.intro} requirements={requirements} />;
};
