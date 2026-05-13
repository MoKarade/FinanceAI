
import React, { useState, useMemo } from 'react';
import { Card } from './ui/Card';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts';
import { RetirementGoal } from '../types';

interface FireProps {
    netWorth: number;
    annualExpenses: number;
    annualSavings: number;
    retirementGoal?: RetirementGoal;
}

export const FinancialFreedom: React.FC<FireProps> = ({ netWorth, annualExpenses, annualSavings, retirementGoal }) => {
    
    // Simulation Parameters
    const [withdrawalRate, setWithdrawalRate] = useState(4.0);
    const [returnRate, setReturnRate] = useState(7.0);
    const [inflation, setInflation] = useState(2.0);
    const [currentAge, setCurrentAge] = useState(30);

    // Use Retirement Goal if available, otherwise fallback to current expenses
    const targetAnnualExpense = retirementGoal ? (retirementGoal.targetMonthlyIncome * 12) : annualExpenses;

    // Calculations
    const fireNumber = targetAnnualExpense / (withdrawalRate / 100);
    const progress = Math.min(100, (netWorth / fireNumber) * 100);
    
    // Projection Loop
    const projection = useMemo(() => {
        const data = [];
        let currentNW = netWorth;
        let currentExp = targetAnnualExpense;
        let year = new Date().getFullYear();
        let age = currentAge;
        let reached = false;

        // Simulate 40 years max
        for (let i = 0; i <= 40; i++) {
            const passiveIncome = currentNW * (withdrawalRate / 100);
            
            data.push({
                year,
                age,
                NetWorth: Math.round(currentNW),
                FireNumber: Math.round(currentExp / (withdrawalRate / 100)),
                PassiveIncome: Math.round(passiveIncome),
                Expenses: Math.round(currentExp),
                isReached: passiveIncome >= currentExp
            });

            if (passiveIncome >= currentExp && !reached) reached = true;

            // Grow
            currentNW = (currentNW + annualSavings) * (1 + (returnRate / 100));
            currentExp = currentExp * (1 + (inflation / 100));
            
            year++;
            age++;
        }
        return data;
    }, [netWorth, targetAnnualExpense, annualSavings, withdrawalRate, returnRate, inflation, currentAge]);

    const reachYear = projection.find(p => p.isReached);
    const yearsToFreedom = reachYear ? reachYear.age - currentAge : ">40";

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            {/* HERO SECTION */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-orange-900/40 to-purple-900/40 border border-white/10 p-6 md:p-10">
                <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-3xl">🔥</span>
                            <h2 className="text-3xl font-black text-white italic">FIRE MISSION</h2>
                        </div>
                        <p className="text-gray-300 text-sm mb-6">
                            Indépendance Financière, Retraite Anticipée.
                            <br/>Le moment où vos investissements paient votre vie.
                        </p>
                        
                        <div className="flex gap-4">
                             <div>
                                 <div className="text-xs text-gray-500 uppercase font-bold">Votre Chiffre FIRE</div>
                                 <div className="text-3xl font-bold text-orange-400 privacy-blur">{fireNumber.toLocaleString()} $</div>
                             </div>
                             <div>
                                 <div className="text-xs text-gray-500 uppercase font-bold">Progression</div>
                                 <div className="text-3xl font-bold text-white">{progress.toFixed(1)}%</div>
                             </div>
                        </div>
                    </div>

                    <div className="text-center md:text-right">
                        {reachYear ? (
                            <>
                                <div className="text-sm text-gray-400 uppercase tracking-widest mb-1">Liberté estimée en</div>
                                <div className="text-6xl font-black text-white">{reachYear.year}</div>
                                <div className="text-xl text-orange-300 font-bold mt-1">à {reachYear.age} ans</div>
                                <div className="text-xs text-gray-500 mt-2 bg-black/30 inline-block px-3 py-1 rounded-full">
                                    Dans {yearsToFreedom} ans
                                </div>
                            </>
                        ) : (
                            <div className="text-xl text-gray-400">Continuez d'investir... la route est longue.</div>
                        )}
                    </div>
                </div>
                
                {/* Background Progress Bar */}
                <div className="absolute bottom-0 left-0 h-1 bg-white/10 w-full">
                    <div className="h-full bg-gradient-to-r from-orange-500 to-purple-500 shadow-[0_0_20px_rgba(249,115,22,0.5)]" style={{width: `${progress}%`}}></div>
                </div>
            </div>

            {/* CHART */}
            <Card title="La Croisée des Chemins">
                {/* FIX: Inline style for chart wrapper */}
                <div style={{ width: '100%', height: '400px', minHeight: '400px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={projection} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorNW" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                            <XAxis dataKey="age" stroke="#666" tick={{fontSize: 12}} label={{ value: 'Âge', position: 'insideBottomRight', offset: -5 }} />
                            <YAxis stroke="#666" tick={{fontSize: 10}} tickFormatter={(val) => `${(val/1000).toFixed(0)}k`} />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#1e1e1e', borderColor: '#333' }}
                                formatter={(val: number) => val.toLocaleString() + ' $'}
                            />
                            
                            <Area type="monotone" dataKey="NetWorth" stroke="#f97316" fill="url(#colorNW)" name="Patrimoine Net" strokeWidth={3} />
                            <Area type="monotone" dataKey="FireNumber" stroke="#8884d8" fill="transparent" strokeDasharray="5 5" name="Objectif FIRE" />
                            
                            {reachYear && (
                                <ReferenceLine x={reachYear.age} stroke="white" label="LIBERTÉ" strokeDasharray="3 3" />
                            )}
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </Card>

            {/* PARAMETERS */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="!p-4">
                    <label className="text-xs text-gray-500 uppercase font-bold block mb-2">Dépenses Cibles</label>
                    <div className="text-xl font-bold text-white mb-1 privacy-blur">{targetAnnualExpense.toLocaleString()} $</div>
                    <div className="text-[10px] text-gray-600">
                        {retirementGoal ? "Basé sur l'onglet Retraite" : "Basé sur les dépenses actuelles"}
                    </div>
                </Card>
                <Card className="!p-4">
                    <label className="text-xs text-gray-500 uppercase font-bold block mb-2">Taux Retrait Sûr</label>
                    <input type="number" step="0.1" value={withdrawalRate} onChange={e => setWithdrawalRate(parseFloat(e.target.value))} className="bg-transparent text-xl font-bold text-white w-full outline-none border-b border-white/20 focus:border-primary"/>
                    <div className="text-[10px] text-gray-600 mt-1">4% est la norme "Rule of 4%"</div>
                </Card>
                <Card className="!p-4">
                    <label className="text-xs text-gray-500 uppercase font-bold block mb-2">Rendement Bourse</label>
                    <input type="number" step="0.1" value={returnRate} onChange={e => setReturnRate(parseFloat(e.target.value))} className="bg-transparent text-xl font-bold text-white w-full outline-none border-b border-white/20 focus:border-primary"/>
                    <div className="text-[10px] text-gray-600 mt-1">Moyenne historique S&P500 ~10% (7% net)</div>
                </Card>
                 <Card className="!p-4">
                    <label className="text-xs text-gray-500 uppercase font-bold block mb-2">Âge Actuel</label>
                    <input type="number" value={currentAge} onChange={e => setCurrentAge(parseFloat(e.target.value))} className="bg-transparent text-xl font-bold text-white w-full outline-none border-b border-white/20 focus:border-primary"/>
                </Card>
            </div>
        </div>
    );
};
