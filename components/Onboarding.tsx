import React, { useState } from 'react';
import { AppState, BudgetConfig } from '../types';
import { INITIAL_BUDGET, INITIAL_PROJECTION, INITIAL_REAL_ESTATE_GOAL, INITIAL_CHILD_GOAL, DEFAULT_FX_RATES } from '../constants';
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
    const [step, setStep] = useState<OnboardingStep>('welcome');
    const [anthropicKey, setAnthropicKey] = useState('');
    const [user1, setUser1] = useState({ name: 'Moi', grossSalary: 70000, netSalary: 4500, age: 30, canadaArrivalYear: 2020 });
    const [user2, setUser2] = useState({ name: 'Partenaire', grossSalary: 60000, netSalary: 3800, age: 30, canadaArrivalYear: 2020 });
    const [hasCoupleMode, setHasCoupleMode] = useState(false);
    const [celiBalance, setCeliBalance] = useState(0);
    const [reerBalance, setReerBalance] = useState(0);

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
        const config: BudgetConfig = {
            users: [
                { ...user1, color: '#4f46e5' },
                hasCoupleMode ? { ...user2, color: '#ec4899' } : { name: '', grossSalary: 0, netSalary: 0, color: '#ec4899', age: 30, canadaArrivalYear: 2020 }
            ] as [any, any],
            splitMode: 'prorata'
        };

        onComplete({
            config,
            apiKeys: { eraContext: '', anthropic: anthropicKey, finnhub: '' },
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
                            className="h-full bg-gradient-to-r from-primary to-emerald-400 transition-all duration-500"
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
                            <h1 className="text-display text-ink-50 mb-3">Bienvenue sur<br />FinanceAI</h1>
                            <p className="text-body text-ink-300">Configuration rapide en 3 minutes.<br />Données stockées localement dans votre navigateur.</p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 text-left">
                            {[
                                { icon: '🔐', text: "Pas de serveur back-end — les données vivent dans localStorage de votre navigateur." },
                                { icon: '🤖', text: "Si vous activez Claude : marchands tronqués + montants arrondis à 100$ envoyés à Anthropic pour la catégorisation et le conseil." },
                                { icon: '📊', text: "Simulation financière complète (retraite, immobilier, projections) entièrement locale." },
                            ].map((f, i) => (
                                <div key={i} className="flex items-center gap-3 p-3 bg-white/5 rounded-card border border-white/5">
                                    <span className="text-2xl" aria-hidden="true">{f.icon}</span>
                                    <span className="text-body text-ink-200">{f.text}</span>
                                </div>
                            ))}
                        </div>
                        <Button onClick={next} variant="primary" size="lg" fullWidth>
                            Commencer la configuration →
                        </Button>
                    </div>
                )}

                {step === 'profile' && (
                    <div className="space-y-6 animate-fade-in">
                        <div>
                            <h2 className="text-h1 text-ink-50">Votre profil</h2>
                            <p className="text-meta text-ink-400 mt-1">Utilisé pour les calculs fiscaux et la projection</p>
                        </div>

                        <div className="space-y-4 p-4 bg-white/5 rounded-card border border-white/10">
                            <div className="font-bold text-ink-50 text-body">👤 Utilisateur principal</div>
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
                                    <label htmlFor="user1-arrival" className="text-meta text-warning-400">Année d'arrivée au Canada <span className="text-ink-400">(pour calcul CELI)</span></label>
                                    <input id="user1-arrival" type="number" inputMode="numeric" className="w-full bg-dark border border-white/10 rounded-card px-3 py-2 text-ink-50 text-body mt-1 font-mono focus-ring" value={user1.canadaArrivalYear} onChange={e => setUser1({ ...user1, canadaArrivalYear: Math.max(2009, Math.min(new Date().getFullYear(), parseInt(e.target.value) || 2020)) })} min={2009} max={new Date().getFullYear()} />
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <input type="checkbox" id="coupleMode" checked={hasCoupleMode} onChange={e => setHasCoupleMode(e.target.checked)} className="w-4 h-4 rounded focus-ring" />
                            <label htmlFor="coupleMode" className="text-body text-ink-200 cursor-pointer">Mode couple (2 revenus)</label>
                        </div>

                        {hasCoupleMode && (
                            <div className="space-y-4 p-4 bg-white/5 rounded-card border border-white/10 animate-fade-in">
                                <div className="font-bold text-ink-50 text-body">💑 Partenaire</div>
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
                                ⚠️ En activant Claude (Anthropic), vous consentez à ce que des données (marchands tronqués + montants arrondis à 100$) soient envoyées à Anthropic.
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
                            <h2 className="text-h1 text-ink-50">Vos comptes d'investissement</h2>
                            <p className="text-meta text-ink-400 mt-1">Soldes approximatifs — vous pourrez les modifier plus tard</p>
                        </div>
                        <div className="space-y-3">
                            {[
                                { label: '🌿 CELI', key: 'celi', value: celiBalance, onChange: setCeliBalance, hint: 'Compte Épargne Libre-Impôt' },
                                { label: '🔒 REER', key: 'reer', value: reerBalance, onChange: setReerBalance, hint: "Régime Épargne-Retraite" },
                            ].map(({ label, key, value, onChange, hint }) => (
                                <div key={key} className="p-4 bg-white/5 rounded-card border border-white/10">
                                    <label htmlFor={`balance-${key}`} className="text-body font-bold text-ink-50 flex items-center gap-2 mb-1">{label} <span className="text-tiny text-ink-400 font-normal">{hint}</span></label>
                                    <div className="flex items-center gap-2 mt-2">
                                        <input id={`balance-${key}`} type="number" inputMode="decimal" placeholder="0" className="flex-1 bg-dark border border-white/10 rounded-card px-3 py-2 text-ink-50 font-mono focus-ring" value={value || ''} onChange={e => onChange(Math.max(0, Math.min(100000000, parseFloat(e.target.value) || 0)))} />
                                        <span className="text-ink-400 text-body">$</span>
                                    </div>
                                </div>
                            ))}
                            <p className="text-tiny text-ink-400 text-center">Vous pouvez laisser à 0 — à configurer dans Investissements</p>
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
