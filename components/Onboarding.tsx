
import React, { useState } from 'react';
import { AppState, BudgetCategory, BudgetConfig } from '../types';
import { INITIAL_BUDGET, INITIAL_CONFIG, INITIAL_PROJECTION, INITIAL_REAL_ESTATE_GOAL, INITIAL_CHILD_GOAL, DEFAULT_FX_RATES } from '../constants';

interface OnboardingProps {
    onComplete: (data: Partial<AppState>) => void;
}

type OnboardingStep = 'welcome' | 'profile' | 'budget' | 'investing' | 'done';

const STEPS: OnboardingStep[] = ['welcome', 'profile', 'budget', 'investing', 'done'];

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
    const [step, setStep] = useState<OnboardingStep>('welcome');
    const [lmKey, setLmKey] = useState('');
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
            splitMode: hasCoupleMode ? 'prorata' : 'prorata'
        };

        onComplete({
            config,
            apiKeys: { lunchMoney: lmKey, gemini: geminiKey },
            fxRates: DEFAULT_FX_RATES,
            budgetItems: INITIAL_BUDGET,
            projection: INITIAL_PROJECTION,
            realEstateGoal: INITIAL_REAL_ESTATE_GOAL,
            childGoals: [INITIAL_CHILD_GOAL],
        });
    };

    return (
        <div className="fixed inset-0 z-[9999] bg-[#080b10] flex flex-col items-center justify-center p-4">
            {/* Fond animé */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-secondary/5 rounded-full blur-[100px]" />
            </div>

            <div className="relative w-full max-w-lg">
                {/* Barre de progression */}
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

                {/* ÉTAPE 1 — Bienvenue */}
                {step === 'welcome' && (
                    <div className="text-center space-y-6 animate-fade-in">
                        <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-primary to-emerald-300 flex items-center justify-center text-4xl shadow-[0_0_40px_rgba(16,185,129,0.3)]">
                            Fi
                        </div>
                        <div>
                            <h1 className="text-4xl font-black text-white mb-3">Bienvenue sur<br />FinanceAI</h1>
                            <p className="text-gray-400 text-lg">Configuration rapide en 3 minutes.<br />Vos données restent sur votre appareil.</p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 text-left">
                            {[
                                { icon: '🔐', text: 'Données locales — rien n\'est envoyé sur nos serveurs' },
                                { icon: '🤖', text: 'IA Gemini pour catégoriser vos dépenses' },
                                { icon: '📊', text: 'Simulation financière complète (retraite, immobilier, etc.)' },
                            ].map((f, i) => (
                                <div key={i} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
                                    <span className="text-2xl">{f.icon}</span>
                                    <span className="text-sm text-gray-300">{f.text}</span>
                                </div>
                            ))}
                        </div>
                        <button onClick={next} className="w-full py-4 bg-gradient-to-r from-primary to-emerald-500 text-white font-bold rounded-2xl text-lg shadow-[0_0_30px_rgba(16,185,129,0.3)] hover:brightness-110 transition-all active:scale-95">
                            Commencer la configuration →
                        </button>
                    </div>
                )}

                {/* ÉTAPE 2 — Profil */}
                {step === 'profile' && (
                    <div className="space-y-6 animate-fade-in">
                        <div>
                            <h2 className="text-2xl font-bold text-white">Votre profil</h2>
                            <p className="text-gray-400 text-sm mt-1">Utilisé pour les calculs fiscaux et la projection</p>
                        </div>

                        <div className="space-y-4 p-4 bg-white/5 rounded-xl border border-white/10">
                            <div className="font-bold text-white text-sm">👤 Utilisateur principal</div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-gray-400">Prénom</label>
                                    <input className="w-full bg-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm mt-1" value={user1.name} onChange={e => setUser1({ ...user1, name: e.target.value })} />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400">Âge</label>
                                    <input type="number" className="w-full bg-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm mt-1 font-mono" value={user1.age} onChange={e => setUser1({ ...user1, age: parseInt(e.target.value) })} min={18} max={80} />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400">Salaire brut annuel ($)</label>
                                    <input type="number" className="w-full bg-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm mt-1 font-mono" value={user1.grossSalary} onChange={e => setUser1({ ...user1, grossSalary: parseInt(e.target.value) })} />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400">Salaire net mensuel ($)</label>
                                    <input type="number" className="w-full bg-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm mt-1 font-mono" value={user1.netSalary} onChange={e => setUser1({ ...user1, netSalary: parseInt(e.target.value) })} />
                                </div>
                                <div className="col-span-2">
                                    <label className="text-xs text-orange-300">Année d'arrivée au Canada <span className="text-gray-500">(pour calcul CELI)</span></label>
                                    <input type="number" className="w-full bg-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm mt-1 font-mono" value={user1.canadaArrivalYear} onChange={e => setUser1({ ...user1, canadaArrivalYear: parseInt(e.target.value) })} min={2009} max={new Date().getFullYear()} />
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
                                        <label className="text-xs text-gray-400">Prénom</label>
                                        <input className="w-full bg-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm mt-1" value={user2.name} onChange={e => setUser2({ ...user2, name: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-400">Salaire net mensuel ($)</label>
                                        <input type="number" className="w-full bg-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm mt-1 font-mono" value={user2.netSalary} onChange={e => setUser2({ ...user2, netSalary: parseInt(e.target.value) })} />
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

                {/* ÉTAPE 3 — Budget */}
                {step === 'budget' && (
                    <div className="space-y-6 animate-fade-in">
                        <div>
                            <h2 className="text-2xl font-bold text-white">Clés API</h2>
                            <p className="text-gray-400 text-sm mt-1">Optionnelles — l'app fonctionne sans, mais avec moins de fonctionnalités</p>
                        </div>
                        <div className="space-y-4">
                            <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                                <label className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                                    🥗 LunchMoney API Token
                                    <span className="text-[10px] text-gray-500 font-normal">(Sync automatique des transactions)</span>
                                </label>
                                <input type="password" placeholder="ey..." className="w-full bg-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono" value={lmKey} onChange={e => setLmKey(e.target.value)} />
                                <p className="text-[10px] text-gray-500 mt-2">Obtenez votre token sur <a href="https://my.lunchmoney.app/developers" target="_blank" rel="noreferrer" className="text-blue-400 underline">my.lunchmoney.app/developers</a></p>
                            </div>
                            <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                                <label className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                                    🤖 Google Gemini API Key
                                    <span className="text-[10px] text-gray-500 font-normal">(Catégorisation IA + objectifs intelligents)</span>
                                </label>
                                <input type="password" placeholder="AIza..." className="w-full bg-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono" value={geminiKey} onChange={e => setGeminiKey(e.target.value)} />
                                <p className="text-[10px] text-gray-500 mt-2">Obtenez votre clé sur <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-blue-400 underline">aistudio.google.com</a></p>
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

                {/* ÉTAPE 4 — Investissements initiaux */}
                {step === 'investing' && (
                    <div className="space-y-6 animate-fade-in">
                        <div>
                            <h2 className="text-2xl font-bold text-white">Vos comptes d'investissement</h2>
                            <p className="text-gray-400 text-sm mt-1">Soldes approximatifs — vous pourrez les modifier plus tard</p>
                        </div>
                        <div className="space-y-3">
                            {[
                                { label: '🌿 CELI', key: 'celi', value: celiBalance, onChange: setCeliBalance, hint: 'Compte Épargne Libre-Impôt' },
                                { label: '🔒 REER', key: 'reer', value: reerBalance, onChange: setReerBalance, hint: 'Régime Épargne-Retraite' },
                            ].map(({ label, key, value, onChange, hint }) => (
                                <div key={key} className="p-4 bg-white/5 rounded-xl border border-white/10">
                                    <label className="text-sm font-bold text-white flex items-center gap-2 mb-1">{label} <span className="text-[10px] text-gray-500 font-normal">{hint}</span></label>
                                    <div className="flex items-center gap-2 mt-2">
                                        <input type="number" placeholder="0" className="flex-1 bg-dark border border-white/10 rounded-lg px-3 py-2 text-white font-mono" value={value || ''} onChange={e => onChange(parseFloat(e.target.value) || 0)} />
                                        <span className="text-gray-400 text-sm">$</span>
                                    </div>
                                </div>
                            ))}
                            <p className="text-xs text-gray-500 text-center">Vous pouvez laisser à 0 — à configurer dans Investissements</p>
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
