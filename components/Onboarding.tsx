
import React, { useState } from 'react';
import { AppState, BudgetConfig } from '../types';
import { INITIAL_BUDGET, INITIAL_PROJECTION, INITIAL_REAL_ESTATE_GOAL, INITIAL_CHILD_GOAL, DEFAULT_FX_RATES } from '../constants';

interface OnboardingProps {
    onComplete: (data: Partial<AppState>) => void;
}

type OnboardingStep = 'welcome' | 'profile' | 'budget' | 'investing' | 'done';

const STEPS: OnboardingStep[] = ['welcome', 'profile', 'budget', 'investing', 'done'];

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
    const [step, setStep] = useState<OnboardingStep>('welcome');
    const [eraContextKey, setEraContextKey] = useState('');
    const [geminiKey, setGeminiKey] = useState('');
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
            apiKeys: { eraContext: eraContextKey, gemini: geminiKey },
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
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                        <span>Configuration initiale</span>
                        <span>{stepIdx + 1} / {STEPS.length}</span>
                    </div>
                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-primary to-emerald-400 transition-all duration-500"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>

                {step === 'welcome' && (
                    <div className="text-center space-y-6 animate-fade-in">
                        <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-primary to-emerald-300 flex items-center justify-center text-4xl shadow-[0_0_40px_rgba(16,185,129,0.3)]">
                            Fi
                        </div>
                        <div>
                            <h1 className="text-4xl font-black text-white mb-3">Bienvenue sur<br />FinanceAI</h1>
                            <p className="text-gray-400 text-lg">Configuration rapide en 3 minutes.<br />Donnees stockees localement dans votre navigateur.</p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 text-left">
                            {[
                                { icon: '🔐', text: 'Pas de serveur back-end — les donnees vivent dans localStorage de votre navigateur.' },
                                { icon: '🤖', text: 'Si vous activez Gemini : marchands tronques + montants arrondis a 100$ envoyes a Google AI Studio pour la categorisation.' },
                                { icon: '💳', text: 'Si vous activez Era Context : token envoye a leur API pour fetcher vos transactions.' },
                                { icon: '📊', text: 'Simulation financiere complete (retraite, immobilier, projections) entierement locale.' },
                            ].map((f, i) => (
                                <div key={i} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
                                    <span className="text-2xl" aria-hidden="true">{f.icon}</span>
                                    <span className="text-sm text-gray-300">{f.text}</span>
                                </div>
                            ))}
                        </div>
                        <button onClick={next} className="w-full py-4 bg-gradient-to-r from-primary to-emerald-500 text-white font-bold rounded-2xl text-lg shadow-[0_0_30px_rgba(16,185,129,0.3)] hover:brightness-110 transition-all active:scale-95">
                            Commencer la configuration →
                        </button>
                    </div>
                )}

                {step === 'profile' && (
                    <div className="space-y-6 animate-fade-in">
                        <div>
                            <h2 className="text-2xl font-bold text-white">Votre profil</h2>
                            <p className="text-gray-400 text-sm mt-1">Utilise pour les calculs fiscaux et la projection</p>
                        </div>

                        <div className="space-y-4 p-4 bg-white/5 rounded-xl border border-white/10">
                            <div className="font-bold text-white text-sm">👤 Utilisateur principal</div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label htmlFor="user1-name" className="text-xs text-gray-400">Prenom</label>
                                    <input id="user1-name" className="w-full bg-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm mt-1" value={user1.name} onChange={e => setUser1({ ...user1, name: e.target.value })} />
                                </div>
                                <div>
                                    <label htmlFor="user1-age" className="text-xs text-gray-400">Age</label>
                                    <input id="user1-age" type="number" inputMode="numeric" className="w-full bg-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm mt-1 font-mono" value={user1.age} onChange={e => setUser1({ ...user1, age: parseInt(e.target.value) || 30 })} min={18} max={80} />
                                </div>
                                <div>
                                    <label htmlFor="user1-gross" className="text-xs text-gray-400">Salaire brut annuel ($)</label>
                                    <input id="user1-gross" type="number" inputMode="decimal" className="w-full bg-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm mt-1 font-mono" value={user1.grossSalary} onChange={e => setUser1({ ...user1, grossSalary: Math.max(0, Math.min(10000000, parseInt(e.target.value) || 0)) })} />
                                </div>
                                <div>
                                    <label htmlFor="user1-net" className="text-xs text-gray-400">Salaire net mensuel ($)</label>
                                    <input id="user1-net" type="number" inputMode="decimal" className="w-full bg-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm mt-1 font-mono" value={user1.netSalary} onChange={e => setUser1({ ...user1, netSalary: Math.max(0, Math.min(1000000, parseInt(e.target.value) || 0)) })} />
                                </div>
                                <div className="col-span-2">
                                    <label htmlFor="user1-arrival" className="text-xs text-orange-300">Annee d'arrivee au Canada <span className="text-gray-500">(pour calcul CELI)</span></label>
                                    <input id="user1-arrival" type="number" inputMode="numeric" className="w-full bg-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm mt-1 font-mono" value={user1.canadaArrivalYear} onChange={e => setUser1({ ...user1, canadaArrivalYear: Math.max(2009, Math.min(new Date().getFullYear(), parseInt(e.target.value) || 2020)) })} min={2009} max={new Date().getFullYear()} />
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <input type="checkbox" id="coupleMode" checked={hasCoupleMode} onChange={e => setHasCoupleMode(e.target.checked)} className="w-4 h-4 rounded" />
                            <label htmlFor="coupleMode" className="text-sm text-gray-300 cursor-pointer">Mode couple (2 revenus)</label>
                        </div>

                        {hasCoupleMode && (
                            <div className="space-y-4 p-4 bg-white/5 rounded-xl border border-white/10 animate-fade-in">
                                <div className="font-bold text-white text-sm">💑 Partenaire</div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label htmlFor="user2-name" className="text-xs text-gray-400">Prenom</label>
                                        <input id="user2-name" className="w-full bg-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm mt-1" value={user2.name} onChange={e => setUser2({ ...user2, name: e.target.value })} />
                                    </div>
                                    <div>
                                        <label htmlFor="user2-net" className="text-xs text-gray-400">Salaire net mensuel ($)</label>
                                        <input id="user2-net" type="number" inputMode="decimal" className="w-full bg-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm mt-1 font-mono" value={user2.netSalary} onChange={e => setUser2({ ...user2, netSalary: Math.max(0, Math.min(1000000, parseInt(e.target.value) || 0)) })} />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button onClick={() => setStep('welcome')} className="flex-1 py-3 bg-white/5 text-gray-300 rounded-xl font-medium hover:bg-white/10 transition-all">← Retour</button>
                            <button onClick={next} className="flex-1 py-3 bg-primary text-white rounded-xl font-bold hover:brightness-110 transition-all active:scale-95">
                                Continuer →
                            </button>
                        </div>
                    </div>
                )}

                {step === 'budget' && (
                    <div className="space-y-6 animate-fade-in">
                        <div>
                            <h2 className="text-2xl font-bold text-white">Cles API</h2>
                            <p className="text-gray-400 text-sm mt-1">Optionnelles — l'app fonctionne sans, mais avec moins de fonctionnalites.</p>
                            <p className="text-amber-300/80 text-[11px] mt-2 leading-relaxed">
                                ⚠️ En activant Gemini, vous consentez explicitement a ce que des donnees (marchands tronques + montants arrondis a 100$) soient envoyees a Google AI Studio. Era Context verra votre token + transactions.
                            </p>
                        </div>
                        <div className="space-y-4">
                            <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                                <label htmlFor="era-key" className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                                    <span aria-hidden="true">🌐</span> Era Context Token
                                    <span className="text-[10px] text-gray-500 font-normal">(Sync automatique des transactions)</span>
                                </label>
                                <input id="era-key" type="password" placeholder="Token Era Context..." className="w-full bg-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono" value={eraContextKey} onChange={e => setEraContextKey(e.target.value)} />
                                <p className="text-[10px] text-gray-500 mt-2">Obtenez votre token sur <a href="https://era.app" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">era.app</a></p>
                            </div>
                            <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                                <label htmlFor="gemini-key" className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                                    <span aria-hidden="true">🤖</span> Google Gemini API Key
                                    <span className="text-[10px] text-gray-500 font-normal">(Categorisation IA + objectifs intelligents)</span>
                                </label>
                                <input id="gemini-key" type="password" placeholder="AIza..." className="w-full bg-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono" value={geminiKey} onChange={e => setGeminiKey(e.target.value)} />
                                <p className="text-[10px] text-gray-500 mt-2">Obtenez votre cle sur <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">aistudio.google.com</a></p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setStep('profile')} className="flex-1 py-3 bg-white/5 text-gray-300 rounded-xl font-medium hover:bg-white/10 transition-all">← Retour</button>
                            <button onClick={next} className="flex-1 py-3 bg-primary text-white rounded-xl font-bold hover:brightness-110 transition-all active:scale-95">
                                Continuer →
                            </button>
                        </div>
                    </div>
                )}

                {step === 'investing' && (
                    <div className="space-y-6 animate-fade-in">
                        <div>
                            <h2 className="text-2xl font-bold text-white">Vos comptes d'investissement</h2>
                            <p className="text-gray-400 text-sm mt-1">Soldes approximatifs — vous pourrez les modifier plus tard</p>
                        </div>
                        <div className="space-y-3">
                            {[
                                { label: '🌿 CELI', key: 'celi', value: celiBalance, onChange: setCeliBalance, hint: 'Compte Epargne Libre-Impot' },
                                { label: '🔒 REER', key: 'reer', value: reerBalance, onChange: setReerBalance, hint: 'Regime Epargne-Retraite' },
                            ].map(({ label, key, value, onChange, hint }) => (
                                <div key={key} className="p-4 bg-white/5 rounded-xl border border-white/10">
                                    <label htmlFor={`balance-${key}`} className="text-sm font-bold text-white flex items-center gap-2 mb-1">{label} <span className="text-[10px] text-gray-500 font-normal">{hint}</span></label>
                                    <div className="flex items-center gap-2 mt-2">
                                        <input id={`balance-${key}`} type="number" inputMode="decimal" placeholder="0" className="flex-1 bg-dark border border-white/10 rounded-lg px-3 py-2 text-white font-mono" value={value || ''} onChange={e => onChange(Math.max(0, Math.min(100000000, parseFloat(e.target.value) || 0)))} />
                                        <span className="text-gray-400 text-sm">$</span>
                                    </div>
                                </div>
                            ))}
                            <p className="text-xs text-gray-500 text-center">Vous pouvez laisser a 0 — a configurer dans Investissements</p>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setStep('budget')} className="flex-1 py-3 bg-white/5 text-gray-300 rounded-xl font-medium hover:bg-white/10 transition-all">← Retour</button>
                            <button onClick={handleFinish} className="flex-1 py-3 bg-gradient-to-r from-primary to-emerald-500 text-white rounded-xl font-bold shadow-lg hover:brightness-110 transition-all active:scale-95">
                                Lancer FinanceAI 🚀
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
