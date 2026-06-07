import React, { useState, useEffect } from 'react';
import { AppState, BudgetConfig, User } from '../types';
import { INITIAL_BUDGET, INITIAL_PROJECTION, INITIAL_REAL_ESTATE_GOAL, INITIAL_CHILD_GOAL, DEFAULT_FX_RATES } from '../constants';
import { annualSalaryToMonthly } from '../utils/salary';
import { Button } from './ui/Button';

interface OnboardingProps {
    onComplete: (data: Partial<AppState>) => void;
}

type OnboardingStep = 'welcome' | 'profile' | 'keys' | 'investing';

const STEPS: OnboardingStep[] = ['welcome', 'profile', 'keys', 'investing'];
const STEP_LABELS: Record<OnboardingStep, string> = {
    welcome: 'Bienvenue',
    profile: 'Votre profil',
    keys: 'Clés API (optionnel)',
    investing: 'Vos comptes',
};

// D2 (activation) — persistance du brouillon d'onboarding : recharger en plein
// onboarding ne doit plus tout perdre (étape + champs profil/soldes). Restauré au
// montage, nettoyé à la fin. 100% local. La CLÉ API (secret) est volontairement
// EXCLUE (jamais de credential en localStorage clair ; elle se ressaisit à l'étape clés).
const DRAFT_KEY = 'financeai_onboarding_draft';
type OnboardingUserDraft = { name: string; grossSalary: number; netSalary: number; age: number; canadaArrivalYear: number; isImmigrant: boolean };
interface OnboardingDraft {
    step: OnboardingStep;
    user1: OnboardingUserDraft;
    user2: OnboardingUserDraft;
    hasCoupleMode: boolean;
    celiBalance: number;
    reerBalance: number;
}
const loadDraft = (): Partial<OnboardingDraft> => {
    try {
        const raw = localStorage.getItem(DRAFT_KEY);
        return raw ? (JSON.parse(raw) as Partial<OnboardingDraft>) : {};
    } catch {
        return {};
    }
};
const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* non critique */ } };

/**
 * Phase 3D — Onboarding refondu.
 *
 * Changements:
 *  - Step 'done' supprimé (mort, jamais affiché)
 *  - Step 'budget' renommé 'keys' (le contenu était les clés API, pas le budget)
 *  - <Button> primitive partout au lieu de className manuels
 *  - Tokens typo + couleurs sémantiques (warning au lieu de text-amber-300/80)
 *  - aria-current sur la barre de progression
 *  - "Sauter cette étape" sur la dernière (les soldes sont configurables après)
 */
export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
    const draft = React.useMemo(() => loadDraft(), []);
    const [step, setStep] = useState<OnboardingStep>(draft.step ?? 'welcome');
    const [anthropicKey, setAnthropicKey] = useState(''); // jamais persistée (secret)
    const [user1, setUser1] = useState(draft.user1 ?? { name: 'Moi', grossSalary: 70000, netSalary: 4500, age: 30, canadaArrivalYear: 2020, isImmigrant: false });
    const [user2, setUser2] = useState(draft.user2 ?? { name: 'Partenaire', grossSalary: 60000, netSalary: 3800, age: 30, canadaArrivalYear: 2020, isImmigrant: false });
    const [hasCoupleMode, setHasCoupleMode] = useState(draft.hasCoupleMode ?? false);
    const [celiBalance, setCeliBalance] = useState(draft.celiBalance ?? 0);
    const [reerBalance, setReerBalance] = useState(draft.reerBalance ?? 0);

    // Sauvegarde du brouillon à chaque changement (anti-perte au rechargement). Sans la clé API.
    useEffect(() => {
        try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify({ step, user1, user2, hasCoupleMode, celiBalance, reerBalance }));
        } catch { /* quota plein → la persistance est un bonus, on n'échoue pas l'onboarding */ }
    }, [step, user1, user2, hasCoupleMode, celiBalance, reerBalance]);

    const stepIdx = STEPS.indexOf(step);
    const progress = ((stepIdx) / (STEPS.length - 1)) * 100;

    const next = () => {
        const nextStep = STEPS[stepIdx + 1];
        if (nextStep) setStep(nextStep);
    };
    const prev = () => {
        const prevStep = STEPS[stepIdx - 1];
        if (prevStep) setStep(prevStep);
    };

    const handleFinish = () => {
        clearDraft(); // onboarding terminé → plus de brouillon à restaurer
        const config: BudgetConfig = {
            users: [
                // Le champ « Salaire brut annuel » est saisi en ANNUEL → on stocke en MENSUEL
                // (convention canonique du store ; le moteur ré-annualise ×12). Net déjà mensuel.
                { ...user1, grossSalary: annualSalaryToMonthly(user1.grossSalary), color: '#4f46e5' },
                hasCoupleMode
                    ? { ...user2, grossSalary: annualSalaryToMonthly(user2.grossSalary), color: '#ec4899' }
                    : { name: '', grossSalary: 0, netSalary: 0, color: '#ec4899', age: 30, canadaArrivalYear: 2020 }
            ] as [User, User],
            splitMode: 'prorata'
        };

        onComplete({
            config,
            apiKeys: { anthropic: anthropicKey, finnhub: '' },
            fxRates: DEFAULT_FX_RATES,
            budgetItems: INITIAL_BUDGET,
            projection: INITIAL_PROJECTION,
            realEstateGoals: [INITIAL_REAL_ESTATE_GOAL],
            childGoals: [INITIAL_CHILD_GOAL],
        } as Partial<AppState>);
    };

    return (
        <div className="fixed inset-0 z-[9999] bg-[#080b10] flex flex-col items-center justify-center p-4">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-secondary/5 rounded-full blur-[100px]" />
            </div>

            <div className="relative w-full max-w-lg">
                <div className="mb-8">
                    <div className="flex items-center justify-between text-meta text-ink-400 mb-2">
                        <span>{STEP_LABELS[step]}</span>
                        <span aria-live="polite">{stepIdx + 1} / {STEPS.length}</span>
                    </div>
                    <div
                        className="w-full h-1 bg-white/5 rounded-full overflow-hidden"
                        role="progressbar"
                        aria-valuenow={Math.round(progress)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="Progression de la configuration"
                    >
                        <div
                            className="h-full bg-gradient-to-r from-primary to-success-400 transition-all duration-500"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>

                {step === 'welcome' && (
                    <div className="text-center space-y-6 animate-fade-in">
                        <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-primary to-emerald-300 flex items-center justify-center text-4xl shadow-[0_0_40px_rgba(16,185,129,0.3)]" aria-hidden="true">
                            Fi
                        </div>
                        <div>
                            <h1 className="text-display text-ink-50 mb-3">Bienvenue !<br />Voici FinanceAI</h1>
                            <p className="text-body text-ink-300">
                                Ton tableau de bord financier personnel. Il rassemble tes comptes,
                                ton budget et tes objectifs, puis te montre à quoi ressemble ton avenir.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 text-left">
                            {[
                                { icon: '📊', text: "Vois clairement où va ton argent chaque mois (budget, dettes, épargne)." },
                                { icon: '🔮', text: "Simule ton futur : retraite, achat de maison, enfants — et trouve la meilleure stratégie." },
                                { icon: '🤖', text: "Un assistant IA (optionnel) catégorise tes dépenses et te conseille." },
                                { icon: '🔐', text: "Tes données restent sur ton appareil. Aucun serveur, aucun compte à créer." },
                            ].map((f, i) => (
                                <div key={i} className="flex items-center gap-3 p-3 bg-white/5 rounded-card border border-white/5">
                                    <span className="text-2xl" aria-hidden="true">{f.icon}</span>
                                    <span className="text-body text-ink-200">{f.text}</span>
                                </div>
                            ))}
                        </div>
                        <p className="text-meta text-ink-400">Configuration en 3 minutes — tout est modifiable plus tard.</p>
                        <Button onClick={next} variant="primary" size="lg" fullWidth>
                            C'est parti →
                        </Button>
                    </div>
                )}

                {step === 'profile' && (
                    <div className="space-y-6 animate-fade-in">
                        <div>
                            <h2 className="text-h1 text-ink-50">Ton profil</h2>
                            <p className="text-meta text-ink-400 mt-1">Sert aux calculs d'impôts et à la projection de ton avenir</p>
                        </div>

                        <div className="space-y-4 p-4 bg-white/5 rounded-card border border-white/10">
                            <div className="font-bold text-ink-50 text-body">Utilisateur principal</div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label htmlFor="user1-name" className="text-meta text-ink-400">Prénom</label>
                                    <input id="user1-name" className="w-full bg-dark border border-white/10 rounded-card px-3 py-2 text-ink-50 text-body mt-1 focus-ring" value={user1.name} onChange={e => setUser1({ ...user1, name: e.target.value })} />
                                </div>
                                <div>
                                    <label htmlFor="user1-age" className="text-meta text-ink-400">Âge</label>
                                    <input id="user1-age" type="number" inputMode="numeric" className="w-full bg-dark border border-white/10 rounded-card px-3 py-2 text-ink-50 text-body mt-1 font-mono focus-ring" value={user1.age} onChange={e => setUser1({ ...user1, age: parseInt(e.target.value) || 30 })} min={18} max={80} />
                                </div>
                                <div>
                                    <label htmlFor="user1-gross" className="text-meta text-ink-400">Salaire brut annuel ($)</label>
                                    <input id="user1-gross" type="number" inputMode="decimal" className="w-full bg-dark border border-white/10 rounded-card px-3 py-2 text-ink-50 text-body mt-1 font-mono focus-ring" value={user1.grossSalary} onChange={e => setUser1({ ...user1, grossSalary: Math.max(0, Math.min(10000000, parseInt(e.target.value) || 0)) })} />
                                </div>
                                <div>
                                    <label htmlFor="user1-net" className="text-meta text-ink-400">Salaire net mensuel ($)</label>
                                    <input id="user1-net" type="number" inputMode="decimal" className="w-full bg-dark border border-white/10 rounded-card px-3 py-2 text-ink-50 text-body mt-1 font-mono focus-ring" value={user1.netSalary} onChange={e => setUser1({ ...user1, netSalary: Math.max(0, Math.min(1000000, parseInt(e.target.value) || 0)) })} />
                                </div>
                                <div className="col-span-2">
                                    <label className="flex items-center gap-2 text-meta text-warning-400 cursor-pointer">
                                        <input type="checkbox" checked={!!user1.isImmigrant} onChange={e => setUser1({ ...user1, isImmigrant: e.target.checked })} className="w-4 h-4 rounded focus-ring" />
                                        Je suis immigré au Canada <span className="text-ink-400">(ajuste le droit CELI/REER et la PSV)</span>
                                    </label>
                                    {user1.isImmigrant && (
                                        <input id="user1-arrival" type="number" inputMode="numeric" className="w-full bg-dark border border-white/10 rounded-card px-3 py-2 text-ink-50 text-body mt-2 font-mono focus-ring" value={user1.canadaArrivalYear || ''} onChange={e => setUser1({ ...user1, canadaArrivalYear: parseInt(e.target.value) || 0 })} min={1950} max={new Date().getFullYear()} placeholder="Année de résidence fiscale (ex: 2018)" />
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <input type="checkbox" id="coupleMode" checked={hasCoupleMode} onChange={e => setHasCoupleMode(e.target.checked)} className="w-4 h-4 rounded focus-ring" />
                            <label htmlFor="coupleMode" className="text-body text-ink-200 cursor-pointer">Mode couple (2 revenus)</label>
                        </div>

                        {hasCoupleMode && (
                            <div className="space-y-4 p-4 bg-white/5 rounded-card border border-white/10 animate-fade-in">
                                <div className="font-bold text-ink-50 text-body">Partenaire</div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label htmlFor="user2-name" className="text-meta text-ink-400">Prénom</label>
                                        <input id="user2-name" className="w-full bg-dark border border-white/10 rounded-card px-3 py-2 text-ink-50 text-body mt-1 focus-ring" value={user2.name} onChange={e => setUser2({ ...user2, name: e.target.value })} />
                                    </div>
                                    <div>
                                        <label htmlFor="user2-net" className="text-meta text-ink-400">Salaire net mensuel ($)</label>
                                        <input id="user2-net" type="number" inputMode="decimal" className="w-full bg-dark border border-white/10 rounded-card px-3 py-2 text-ink-50 text-body mt-1 font-mono focus-ring" value={user2.netSalary} onChange={e => setUser2({ ...user2, netSalary: Math.max(0, Math.min(1000000, parseInt(e.target.value) || 0)) })} />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-3">
                            <Button onClick={prev} variant="ghost" size="md" fullWidth>← Retour</Button>
                            <Button onClick={next} variant="primary" size="md" fullWidth>Continuer →</Button>
                        </div>
                    </div>
                )}

                {step === 'keys' && (
                    <div className="space-y-6 animate-fade-in">
                        <div>
                            <h2 className="text-h1 text-ink-50">Clés API</h2>
                            <p className="text-meta text-ink-400 mt-1">Optionnelles — l'app fonctionne sans, mais avec moins de fonctionnalités.</p>
                            <p className="text-meta text-warning-400 mt-2 leading-relaxed">
                                En activant Claude (Anthropic), tu consens à ce que des données (marchands tronqués + montants arrondis à 100$) soient envoyées à Anthropic.
                            </p>
                        </div>
                        <div className="space-y-4">
                            <div className="p-4 bg-white/5 rounded-card border border-white/10">
                                <label htmlFor="anthropic-key" className="text-body font-bold text-ink-50 flex items-center gap-2 mb-2">
                                    <span aria-hidden="true">🤖</span> Anthropic Claude API Key
                                    <span className="text-tiny text-ink-400 font-normal">(Catégorisation IA + conseiller + objectifs intelligents)</span>
                                </label>
                                <input id="anthropic-key" type="password" placeholder="sk-ant-..." className="w-full bg-dark border border-white/10 rounded-card px-3 py-2 text-ink-50 text-body font-mono focus-ring" value={anthropicKey} onChange={e => setAnthropicKey(e.target.value)} />
                                <p className="text-tiny text-ink-400 mt-2">Obtenez votre clé sur <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="text-info-400 underline">console.anthropic.com</a></p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <Button onClick={prev} variant="ghost" size="md" fullWidth>← Retour</Button>
                            <Button onClick={next} variant="primary" size="md" fullWidth>Continuer →</Button>
                        </div>
                    </div>
                )}

                {step === 'investing' && (
                    <div className="space-y-6 animate-fade-in">
                        <div>
                            <h2 className="text-h1 text-ink-50">Tes comptes d'investissement</h2>
                            <p className="text-meta text-ink-400 mt-1">Soldes approximatifs — tu pourras les modifier plus tard</p>
                        </div>
                        <div className="space-y-3">
                            {[
                                { label: 'CELI', key: 'celi', value: celiBalance, onChange: setCeliBalance, hint: 'Compte Épargne Libre-Impôt' },
                                { label: 'REER', key: 'reer', value: reerBalance, onChange: setReerBalance, hint: "Régime Épargne-Retraite" },
                            ].map(({ label, key, value, onChange, hint }) => (
                                <div key={key} className="p-4 bg-white/5 rounded-card border border-white/10">
                                    <label htmlFor={`balance-${key}`} className="text-body font-bold text-ink-50 flex items-center gap-2 mb-1">{label} <span className="text-tiny text-ink-400 font-normal">{hint}</span></label>
                                    <div className="flex items-center gap-2 mt-2">
                                        <input id={`balance-${key}`} type="number" inputMode="decimal" placeholder="0" className="flex-1 bg-dark border border-white/10 rounded-card px-3 py-2 text-ink-50 font-mono focus-ring" value={value || ''} onChange={e => onChange(Math.max(0, Math.min(100000000, parseFloat(e.target.value) || 0)))} />
                                        <span className="text-ink-400 text-body">$</span>
                                    </div>
                                </div>
                            ))}
                            <p className="text-tiny text-ink-400 text-center">Tu peux laisser à 0 — à configurer dans Investissements</p>
                        </div>
                        <div className="flex gap-3">
                            <Button onClick={prev} variant="ghost" size="md" fullWidth>← Retour</Button>
                            <Button onClick={handleFinish} variant="primary" size="md" fullWidth>
                                Lancer FinanceAI 🚀
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
